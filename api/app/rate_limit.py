import time
from collections import defaultdict, deque


class InMemoryRateLimiter:
    def __init__(self, rpm: int):
        self.rpm = rpm
        self.events: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        q = self.events[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.rpm:
            return False
        q.append(now)
        return True
