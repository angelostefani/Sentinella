import hashlib
import httpx
import trafilatura

from .config import settings
from .domain_filters import allowed_url, recency_to_time_range


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
    items = []
    for item in results:
        url = item.get("url")
        if not url or not allowed_url(url, domains_allow, domains_block):
            continue
        items.append({"title": item.get("title", "(senza titolo)"), "url": url, "content": "", "snippet": (item.get("content") or "")[: settings.max_text_chars_per_source]})
        if len(items) >= max_results:
            break
    return items


def fetch_extract(url: str) -> str:
    with httpx.Client(timeout=settings.fetch_timeout_s, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        raw = r.content[: settings.max_fetch_bytes]
    text = trafilatura.extract(raw.decode("utf-8", errors="ignore"), include_comments=False, include_tables=False) or ""
    return text[: settings.max_text_chars_per_source]


def digest_markdown(query: str, items: list[dict], language: str = "italiano") -> str:
    src_lines = []
    for idx, item in enumerate(items, 1):
        src_lines.append(f"[{idx}] {item['title']} - {item['url']}\\n{item.get('content','')}")
    prompt = (
        f"Scrivi in {language} usando SOLO le fonti fornite. Output markdown con titolo, "
        "5-10 bullet Novita/Takeaways con citazioni [n], opzionale Cosa tenere d'occhio, sezione Fonti.\\n\\n"
        f"Query: {query}\\n\\nFonti:\\n" + "\\n\\n".join(src_lines)
    )
    payload = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": False,
    }
    with httpx.Client(timeout=settings.ollama_timeout_s) as client:
        r = client.post(f"{settings.ollama_url}/api/generate", json=payload)
        r.raise_for_status()
        data = r.json()
    return data.get("response", "")


def hash_url(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()
