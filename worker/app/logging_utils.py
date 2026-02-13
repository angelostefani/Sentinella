import json
import logging
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "service": "worker",
                "message": record.getMessage(),
                "request_id": None,
                "user_id": getattr(record, "user_id", None),
                "endpoint": getattr(record, "endpoint", None),
                "duration_ms": getattr(record, "duration_ms", None),
                "status_code": None,
                "error": getattr(record, "error", None),
            },
            ensure_ascii=True,
        )


def get_logger() -> logging.Logger:
    logger = logging.getLogger("worker")
    logger.setLevel(logging.INFO)
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    logger.handlers = [h]
    logger.propagate = False
    return logger
