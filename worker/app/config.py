import os
from pydantic import BaseModel


class Settings(BaseModel):
    tz: str = os.getenv("TZ", "Europe/Rome")
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://assistant:assistant@postgres:5432/assistant")
    ollama_url: str = os.getenv("OLLAMA_URL", "http://ollama:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    searxng_url: str = os.getenv("SEARXNG_URL", "http://searxng:8080")
    max_fetch_bytes: int = int(os.getenv("MAX_FETCH_BYTES", "2000000"))
    fetch_timeout_s: int = int(os.getenv("FETCH_TIMEOUT_S", "15"))
    max_text_chars_per_source: int = int(os.getenv("MAX_TEXT_CHARS_PER_SOURCE", "4000"))
    worker_max_workers: int = int(os.getenv("WORKER_MAX_WORKERS", "4"))
    watchlist_sync_interval_s: int = int(os.getenv("WATCHLIST_SYNC_INTERVAL_S", "30"))
    watch_jitter_max_s: int = int(os.getenv("WATCH_JITTER_MAX_S", "30"))
    ollama_timeout_s: int = int(os.getenv("OLLAMA_TIMEOUT_S", "300"))


settings = Settings()
