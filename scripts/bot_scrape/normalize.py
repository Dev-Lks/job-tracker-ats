"""Normalização bot_scrape -> schema do pipeline (igual data/auto-jobs.json)."""
import re
from urllib.parse import urlsplit, urlunsplit


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def short_url(url: str) -> str:
    """Tira query/tracking, mantém o link canônico."""
    try:
        p = urlsplit(str(url or ""))
        if not p.scheme:
            return str(url or "")
        return urlunsplit((p.scheme, p.netloc, p.path, "", ""))
    except Exception:
        return str(url or "")


def norm_job(source, title, company="", url="", location="", remote=False, tags=(), published_at=""):
    title = clean(title) or "Sem título"
    return {
        "id": f"{source}-{abs(hash((title, clean(company), short_url(url)))) % 10**10}",
        "title": title,
        "company": clean(company),
        "url": short_url(url),
        "location": clean(location),
        "remote": bool(remote),
        "tags": [clean(t) for t in (tags or []) if clean(t)][:12],
        "source": source,
        "published_at": clean(published_at),
    }


def looks_remote(*texts: str) -> bool:
    return bool(re.search(r"remot|home.?office|teletrabalho|híbrido|hibrido", " ".join(texts), re.I))
