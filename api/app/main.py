import os
import time
import uuid
from datetime import datetime, timedelta

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db
from .deps import get_current_user, require_admin
from .logging_utils import configure_logging
from .models import Run, SeenItem, User, Watchlist
from .pipeline import digest_markdown, fetch_extract, hash_url, search_web
from .rate_limit import InMemoryRateLimiter
from .schemas import (
    AskIn, LoginIn, MeOut, PasswordChangeIn, RunOut, RunSummaryOut,
    ServiceStatusOut, StatsOut, TokenOut,
    UserCreateIn, UserOut, UserUpdateIn, WatchIn, WatchOut, WatchToggleIn,
)
from .security import create_token, hash_password, verify_password

if not settings.jwt_secret:
    raise RuntimeError("JWT_SECRET is required")

logger = configure_logging("api")
limiter = InMemoryRateLimiter(settings.rate_limit_rpm)

app = FastAPI(title="Sentinella API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start = time.time()
    try:
        response = await call_next(request)
        duration = int((time.time() - start) * 1000)
        logger.info(
            f"request {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "endpoint": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration,
            },
        )
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as exc:
        duration = int((time.time() - start) * 1000)
        logger.error(
            "request failed",
            extra={"request_id": request_id, "endpoint": request.url.path, "duration_ms": duration, "error": str(exc)},
        )
        return JSONResponse(status_code=500, content={"detail": "internal error", "request_id": request_id})


@app.on_event("startup")
def startup():
    os.environ["TZ"] = settings.tz
    Base.metadata.create_all(bind=engine)
    # Add new columns to existing tables without migrations
    with Session(engine) as db:
        db.execute(text("ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'"))
        db.execute(text("ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS output_language VARCHAR(50) DEFAULT 'italiano'"))
        db.commit()
    with Session(engine) as db:
        first_user = db.scalar(select(User).limit(1))
        if not first_user:
            db.add(User(username="admin", password_hash=hash_password("admin123"), role="admin", is_active=True))
            db.commit()
            logger.warning("Bootstrap admin created: change password", extra={"endpoint": "startup"})


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/health")
def api_health():
    return {"status": "ok"}


@app.get("/api/health/services", response_model=ServiceStatusOut)
def health_services(_: User = Depends(get_current_user)):
    def check(url: str) -> str:
        try:
            r = httpx.get(url, timeout=5)
            return "ok" if r.status_code == 200 else "error"
        except Exception:
            return "error"

    return ServiceStatusOut(
        searxng=check(f"{settings.searxng_url}/search?q=test&format=json"),
        ollama=check(f"{settings.ollama_url}/api/tags"),
    )


# ─── Auth ────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash) or not user.is_active:
        raise HTTPException(status_code=401, detail="invalid credentials")
    return TokenOut(access_token=create_token(user.id, user.role))


@app.get("/api/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return MeOut(id=user.id, username=user.username, role=user.role)


@app.put("/api/me/password")
def change_my_password(payload: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="password corrente non valida")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


# ─── Admin users ─────────────────────────────────────────────────────────────

@app.post("/api/admin/users", response_model=UserOut)
def create_user(payload: UserCreateIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(status_code=400, detail="username exists")
    user = User(username=payload.username, password_hash=hash_password(payload.password), role=payload.role, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get("/api/admin/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return list(db.scalars(select(User).order_by(User.id)).all())


@app.put("/api/admin/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdateIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="not found")
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return user


# ─── Admin stats ─────────────────────────────────────────────────────────────

@app.get("/api/admin/stats", response_model=StatsOut)
def get_stats(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    total_watches = db.scalar(select(func.count()).select_from(Watchlist)) or 0
    total_runs = db.scalar(select(func.count()).select_from(Run)) or 0

    since = datetime.utcnow() - timedelta(days=14)
    rows = db.execute(
        select(func.date(Run.created_at).label("day"), func.count().label("count"))
        .where(Run.created_at >= since)
        .group_by(func.date(Run.created_at))
        .order_by(func.date(Run.created_at))
    ).all()
    runs_per_day = [{"day": str(r.day), "count": r.count} for r in rows]

    top_rows = db.execute(
        select(Watchlist.id, Watchlist.name, func.count(Run.id).label("run_count"))
        .join(Run, Run.watch_id == Watchlist.id, isouter=True)
        .group_by(Watchlist.id, Watchlist.name)
        .order_by(func.count(Run.id).desc())
        .limit(5)
    ).all()
    top_watches = [{"id": r.id, "name": r.name, "run_count": r.run_count} for r in top_rows]

    return StatsOut(
        total_users=total_users,
        total_watches=total_watches,
        total_runs=total_runs,
        runs_per_day=runs_per_day,
        top_watches=top_watches,
    )


# ─── Ask ─────────────────────────────────────────────────────────────────────

def run_query(
    db: Session, query: str, recency_days: int, max_results: int,
    domains_allow: list[str], domains_block: list[str],
    watch_id: int | None, user_id: int | None,
    output_language: str = "italiano",
):
    items = search_web(query, recency_days, max_results, domains_allow, domains_block)
    for item in items:
        try:
            fetched = fetch_extract(item["url"])
            item["content"] = fetched or item.pop("snippet", "")
        except Exception:
            item["content"] = item.pop("snippet", "")
    digest = digest_markdown(query, items, language=output_language)
    run = Run(watch_id=watch_id, user_id=user_id, query=query, items=items, digest_md=digest)
    db.add(run)
    db.flush()
    if watch_id:
        for item in items:
            db.execute(
                text(
                    "INSERT INTO seen_items (watch_id, url_hash, url, first_seen) "
                    "VALUES (:watch_id, :url_hash, :url, NOW()) "
                    "ON CONFLICT (watch_id, url_hash) DO NOTHING"
                ),
                {"watch_id": watch_id, "url_hash": hash_url(item["url"]), "url": item["url"]},
            )
    db.commit()
    db.refresh(run)
    return run


@app.post("/api/ask", response_model=RunOut)
def ask(payload: AskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not limiter.allow(f"ask:{user.id}"):
        raise HTTPException(status_code=429, detail="rate limit exceeded")
    return run_query(
        db, payload.query, payload.recency_days, payload.max_results,
        payload.domains_allow, payload.domains_block,
        None, user.id, payload.output_language,
    )


# ─── Watchlist ────────────────────────────────────────────────────────────────

@app.get("/api/watchlist", response_model=list[WatchOut])
def list_watchlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "admin":
        return list(db.scalars(select(Watchlist).order_by(Watchlist.id.desc())).all())
    return list(db.scalars(select(Watchlist).where(
        (Watchlist.scope == "global") | (Watchlist.owner_user_id == user.id)
    ).order_by(Watchlist.id.desc())).all())


def upsert_watch(scope: str, watch_id: int | None, payload: WatchIn, user: User, db: Session):
    if watch_id:
        watch = db.get(Watchlist, watch_id)
        if not watch:
            raise HTTPException(status_code=404, detail="not found")
    else:
        watch = Watchlist(scope=scope, owner_user_id=None if scope == "global" else user.id)
        db.add(watch)
    if watch.scope != scope:
        raise HTTPException(status_code=400, detail="scope mismatch")
    if scope == "personal" and watch.owner_user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="forbidden")
    watch.name = payload.name
    watch.query = payload.query
    watch.cron = payload.cron
    watch.enabled = payload.enabled
    watch.recency_days = payload.recency_days
    watch.max_results = payload.max_results
    watch.domains_allow = payload.domains_allow
    watch.domains_block = payload.domains_block
    watch.tags = payload.tags
    watch.output_language = payload.output_language
    db.commit()
    db.refresh(watch)
    return watch


@app.post("/api/watchlist/personal", response_model=WatchOut)
def create_personal_watch(payload: WatchIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return upsert_watch("personal", None, payload, user, db)


@app.put("/api/watchlist/personal/{watch_id}", response_model=WatchOut)
def update_personal_watch(watch_id: int, payload: WatchIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return upsert_watch("personal", watch_id, payload, user, db)


@app.delete("/api/watchlist/personal/{watch_id}")
def delete_personal_watch(watch_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    watch = db.get(Watchlist, watch_id)
    if not watch or watch.scope != "personal":
        raise HTTPException(status_code=404, detail="not found")
    if watch.owner_user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="forbidden")
    db.query(SeenItem).filter(SeenItem.watch_id == watch_id).delete()
    db.query(Run).filter(Run.watch_id == watch_id).delete()
    db.delete(watch)
    db.commit()
    return {"ok": True}


@app.post("/api/watchlist/global", response_model=WatchOut)
def create_global_watch(payload: WatchIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return upsert_watch("global", None, payload, admin, db)


@app.put("/api/watchlist/global/{watch_id}", response_model=WatchOut)
def update_global_watch(watch_id: int, payload: WatchIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return upsert_watch("global", watch_id, payload, admin, db)


@app.delete("/api/watchlist/global/{watch_id}")
def delete_global_watch(watch_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    watch = db.get(Watchlist, watch_id)
    if not watch or watch.scope != "global":
        raise HTTPException(status_code=404, detail="not found")
    db.query(SeenItem).filter(SeenItem.watch_id == watch_id).delete()
    db.query(Run).filter(Run.watch_id == watch_id).delete()
    db.delete(watch)
    db.commit()
    return {"ok": True}


@app.patch("/api/watchlist/{watch_id}", response_model=WatchOut)
def toggle_watch(watch_id: int, payload: WatchToggleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    watch = db.get(Watchlist, watch_id)
    if not watch:
        raise HTTPException(status_code=404, detail="not found")
    if watch.scope == "global" and user.role != "admin":
        raise HTTPException(status_code=403, detail="forbidden")
    if watch.scope == "personal" and watch.owner_user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="forbidden")
    watch.enabled = payload.enabled
    db.commit()
    db.refresh(watch)
    return watch


@app.post("/api/watchlist/{watch_id}/run", response_model=RunOut)
def run_watch_now(watch_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not limiter.allow(f"run:{user.id}"):
        raise HTTPException(status_code=429, detail="rate limit exceeded")
    watch = db.get(Watchlist, watch_id)
    if not watch:
        raise HTTPException(status_code=404, detail="not found")
    if user.role != "admin":
        if watch.scope == "global":
            raise HTTPException(status_code=403, detail="global run reserved to admin")
        if watch.owner_user_id != user.id:
            raise HTTPException(status_code=403, detail="forbidden")
    run_user_id = None if watch.scope == "global" else watch.owner_user_id
    return run_query(
        db, watch.query, watch.recency_days, watch.max_results,
        watch.domains_allow, watch.domains_block,
        watch.id, run_user_id, watch.output_language,
    )


# ─── Runs ─────────────────────────────────────────────────────────────────────

@app.get("/api/runs", response_model=list[RunSummaryOut])
def list_runs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "admin":
        return list(db.scalars(select(Run).order_by(Run.id.desc()).limit(100)).all())
    return list(db.scalars(select(Run).where(Run.user_id == user.id).order_by(Run.id.desc()).limit(100)).all())


@app.get("/api/runs/{run_id}", response_model=RunOut)
def get_run(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="not found")
    if user.role != "admin" and run.user_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    return run


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="not found")
    if user.role != "admin" and run.user_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    db.delete(run)
    db.commit()
    return {"ok": True}
