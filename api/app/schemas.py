from datetime import datetime
from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeOut(BaseModel):
    id: int
    username: str
    role: str


class UserCreateIn(BaseModel):
    username: str
    password: str
    role: str = Field(pattern="^(admin|user)$")


class UserUpdateIn(BaseModel):
    is_active: bool | None = None
    password: str | None = None


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime


class AskIn(BaseModel):
    query: str
    recency_days: int = 7
    max_results: int = 5
    domains_allow: list[str] = []
    domains_block: list[str] = []
    output_language: str = "italiano"
    custom_prompt: str | None = None


class WatchToggleIn(BaseModel):
    enabled: bool


class WatchIn(BaseModel):
    name: str
    query: str
    cron: str = "0 8 * * *"
    enabled: bool = True
    recency_days: int = 7
    max_results: int = 5
    domains_allow: list[str] = []
    domains_block: list[str] = []
    tags: list[str] = []
    output_language: str = "italiano"
    custom_prompt: str | None = None


class WatchOut(BaseModel):
    id: int
    name: str
    query: str
    cron: str
    enabled: bool
    scope: str
    owner_user_id: int | None
    recency_days: int
    max_results: int
    domains_allow: list[str]
    domains_block: list[str]
    tags: list[str]
    output_language: str
    custom_prompt: str | None
    created_at: datetime
    last_run_at: datetime | None = None


class RunSummaryOut(BaseModel):
    id: int
    watch_id: int | None
    user_id: int | None
    query: str
    created_at: datetime


class RunOut(BaseModel):
    id: int
    watch_id: int | None
    user_id: int | None
    query: str
    items: list
    digest_md: str
    created_at: datetime


class RunsPerDay(BaseModel):
    day: str
    count: int


class TopWatch(BaseModel):
    id: int
    name: str
    run_count: int


class StatsOut(BaseModel):
    total_users: int
    total_watches: int
    total_runs: int
    runs_per_day: list[RunsPerDay]
    top_watches: list[TopWatch]


class ServiceStatusOut(BaseModel):
    searxng: str
    ollama: str
