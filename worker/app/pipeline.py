import hashlib
import httpx
import fnmatch
from urllib.parse import urlparse
import trafilatura

from .config import settings


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
        return fnmatch.fnmatch(domain, pattern)
    return domain == pattern


def allowed_url(url: str, allow: list[str], block: list[str]) -> bool:
    domain = domain_from_url(url)
    if any(match_pattern(domain, p) for p in block):
        return False
    if allow:
        return any(match_pattern(domain, p) for p in allow)
    return True


def search_web(query: str, recency_days: int, max_results: int, domains_allow: list[str], domains_block: list[str]) -> list[dict]:
    params = {
        "q": query,
        "format": "json",
        "language": "it-IT",
        "safesearch": 1,
        "time_range": recency_to_time_range(recency_days),
    }
    with httpx.Client(timeout=settings.fetch_timeout_s, headers={"X-Forwarded-For": "127.0.0.1"}) as client:
        r = client.get(f"{settings.searxng_url}/search", params=params)
        r.raise_for_status()
        results = r.json().get("results", [])
    out = []
    for item in results:
        url = item.get("url")
        if not url or not allowed_url(url, domains_allow, domains_block):
            continue
        snippet = (item.get("content") or "")[: settings.max_text_chars_per_source]
        content = snippet
        try:
            with httpx.Client(timeout=settings.fetch_timeout_s, follow_redirects=True) as client:
                fr = client.get(url)
                fr.raise_for_status()
                raw = fr.content[: settings.max_fetch_bytes]
            extracted = trafilatura.extract(raw.decode("utf-8", errors="ignore"), include_comments=False, include_tables=False) or ""
            content = (extracted or snippet)[: settings.max_text_chars_per_source]
        except Exception:
            pass  # content stays as snippet
        out.append({"title": item.get("title", "(senza titolo)"), "url": url, "content": content})
        if len(out) >= max_results:
            break
    return out


def digest_markdown(query: str, items: list[dict], language: str = "italiano") -> str:
    sources = []
    for i, item in enumerate(items, 1):
        sources.append(f"[{i}] {item['title']} - {item['url']}\\n{item.get('content','')}")
    prompt = (
        f"Scrivi in {language} usando SOLO le fonti fornite. Output markdown con titolo, 5-10 bullet Novita/Takeaways "
        "con citazioni [n], opzionale Cosa tenere d'occhio, sezione Fonti.\\n\\n"
        f"Query: {query}\\n\\nFonti:\\n" + "\\n\\n".join(sources)
    )
    payload = {"model": settings.ollama_model, "prompt": prompt, "stream": False}
    with httpx.Client(timeout=settings.ollama_timeout_s) as client:
        r = client.post(f"{settings.ollama_url}/api/generate", json=payload)
        r.raise_for_status()
        data = r.json()
    return data.get("response", "")


def hash_url(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()
