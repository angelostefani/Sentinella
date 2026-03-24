import os
import random
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.exc import ProgrammingError
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from .config import settings
from .logging_utils import get_logger
from .models import Run, User, Watchlist
from .pipeline import digest_markdown, fetch_extract, hash_url, search_web

logger = get_logger()
engine = create_engine(settings.database_url, future=True)


def run_watch(watch_id: int):
    try:
        jitter = random.randint(0, settings.watch_jitter_max_s)
        time.sleep(jitter)
        with Session(engine) as db:
            watch = db.get(Watchlist, watch_id)
            if not watch or not watch.enabled:
                return
            if watch.scope == "personal" and watch.owner_user_id:
                owner = db.get(User, watch.owner_user_id)
                if owner and owner.max_daily_runs is not None:
                    tz = ZoneInfo(settings.tz)
                    now_local = datetime.now(tz=tz)
                    day_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
                    day_end = day_start + timedelta(days=1)
                    day_start_utc = day_start.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
                    day_end_utc = day_end.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
                    daily_count = db.scalar(
                        select(func.count()).select_from(Run).where(
                            Run.user_id == owner.id,
                            Run.created_at >= day_start_utc,
                            Run.created_at < day_end_utc,
                        )
                    ) or 0
                    if daily_count >= owner.max_daily_runs:
                        logger.warning(f"quota skip watch={watch.id} user={owner.id} daily={daily_count}/{owner.max_daily_runs}")
                        return
            items = search_web(watch.query, watch.recency_days, watch.max_results, watch.domains_allow, watch.domains_block)
            for item in items:
                try:
                    fetched = fetch_extract(item["url"])
                    item["content"] = fetched or item.pop("snippet", "")
                except Exception:
                    logger.warning(f"fetch failed url={item.get('url')}", exc_info=True)
                    item["content"] = item.pop("snippet", "")
            prev_run = db.scalar(
                select(Run).where(Run.watch_id == watch.id)
                .order_by(Run.id.desc()).limit(1)
            )
            previous_digest = prev_run.digest_md if prev_run and prev_run.digest_md else None

            try:
                digest = digest_markdown(watch.query, items, language=getattr(watch, "output_language", "italiano"), custom_prompt=getattr(watch, "custom_prompt", None), previous_digest=previous_digest)
            except Exception as exc:
                digest = ""
                logger.error(f"digest failed watch={watch.id}", extra={"error": str(exc)})

            user_id = None if watch.scope == "global" else watch.owner_user_id
            run = Run(watch_id=watch.id, user_id=user_id, query=watch.query, items=items, digest_md=digest)
            db.add(run)
            db.flush()

            for item in items:
                db.execute(
                    text(
                        "INSERT INTO seen_items (watch_id, url_hash, url, first_seen) "
                        "VALUES (:watch_id, :url_hash, :url, NOW()) "
                        "ON CONFLICT (watch_id, url_hash) DO NOTHING"
                    ),
                    {"watch_id": watch.id, "url_hash": hash_url(item["url"]), "url": item["url"]},
                )

            db.commit()
            logger.info(f"run completed watch={watch.id}", extra={"user_id": user_id})
    except Exception as exc:
        logger.error(f"run failed watch={watch_id}", extra={"error": str(exc)})


def sync_jobs(scheduler: BackgroundScheduler):
    try:
        with Session(engine) as db:
            watches = list(db.scalars(select(Watchlist)).all())
    except ProgrammingError as exc:
        logger.warning("watchlist table not ready yet", extra={"error": str(exc)})
        return
    current = {j.id: j for j in scheduler.get_jobs() if j.id.startswith("watch:")}
    expected = {f"watch:{w.id}": w for w in watches if w.enabled}

    for job_id in list(current):
        if job_id not in expected:
            scheduler.remove_job(job_id)
            logger.info(f"removed job {job_id}")

    for job_id, w in expected.items():
        trigger = CronTrigger.from_crontab(w.cron, timezone=ZoneInfo(settings.tz))
        if job_id in current:
            scheduler.reschedule_job(job_id, trigger=trigger)
            logger.info(f"updated job {job_id}")
        else:
            scheduler.add_job(
                run_watch,
                trigger=trigger,
                args=[w.id],
                id=job_id,
                replace_existing=True,
                coalesce=True,
                misfire_grace_time=300,
                max_instances=1,
            )
            logger.info(f"added job {job_id}")


def main():
    os.environ["TZ"] = settings.tz
    # Ensure tags column exists independently of API startup order
    with Session(engine) as db:
        try:
            db.execute(text("ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'"))
            db.commit()
        except ProgrammingError:
            pass  # Table not yet created; sync_jobs will retry when ready
    scheduler = BackgroundScheduler(
        timezone=ZoneInfo(settings.tz),
        executors={"default": ThreadPoolExecutor(max_workers=settings.worker_max_workers)},
    )
    scheduler.start()
    scheduler.add_job(
        sync_jobs,
        "interval",
        seconds=settings.watchlist_sync_interval_s,
        args=[scheduler],
        id="watchlist_sync",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=300,
        max_instances=1,
    )
    sync_jobs(scheduler)
    open("/tmp/worker_healthy", "w", encoding="utf-8").write("ok")
    while True:
        time.sleep(5)


if __name__ == "__main__":
    main()
