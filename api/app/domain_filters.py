import fnmatch
from urllib.parse import urlparse


def recency_to_time_range(days: int) -> str:
    if days <= 1:
        return "day"
    if days <= 7:
        return "week"
    if days <= 30:
        return "month"
    return "year"


def normalize_domain(value: str) -> str:
    value = value.lower().strip()
    if value.startswith("www."):
        value = value[4:]
    return value


def domain_from_url(url: str) -> str:
    host = urlparse(url).netloc.split(":")[0]
    return normalize_domain(host)


def match_pattern(domain: str, pattern: str) -> bool:
    pattern = normalize_domain(pattern)
    if pattern.startswith("*."):
        return fnmatch.fnmatch(domain, pattern.replace("*.", "*.")) or domain.endswith(pattern[1:])
    return domain == pattern


def allowed_url(url: str, allow: list[str], block: list[str]) -> bool:
    domain = domain_from_url(url)
    if any(match_pattern(domain, p) for p in block):
        return False
    if allow:
        return any(match_pattern(domain, p) for p in allow)
    return True
