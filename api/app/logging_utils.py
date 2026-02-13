import json
import logging
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str):
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": self.service,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
            "user_id": getattr(record, "user_id", None),
            "endpoint": getattr(record, "endpoint", None),
            "duration_ms": getattr(record, "duration_ms", None),
            "status_code": getattr(record, "status_code", None),
            "error": getattr(record, "error", None),
        }
        return json.dumps(data, ensure_ascii=True)


def configure_logging(service: str) -> logging.Logger:
    logger = logging.getLogger(service)
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service))
    logger.handlers = [handler]
    logger.propagate = False
    return logger
