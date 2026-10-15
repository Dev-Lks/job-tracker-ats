"""Gupy portal (SPA, sem API pública): https://portal.gupy.io/job-search/term=<slug>.
Card: a[href*='/job/'] (link do board da empresa) dentro de li com texto:
  [Trabalhe na <Empresa>, <Título>, <Local>, <Modalidade>, <Tipo>, ..., Publicada em: DD/MM/YYYY]
"""
import random
import re
import time
from datetime import datetime

from normalize import norm_job, looks_remote

SEARCH = "https://portal.gupy.io/job-search/term={t}"
TERMS = ["estagio", "tecnologia", "desenvolvedor", "dados"]


def slug(q):
    q = q.lower()
    q = re.sub(r"[àáâã]", "a", q)
    q = re.sub(r"[éê]", "e", q)
    q = re.sub(r"[í]", "i", q)
    q = re.sub(r"[óôõ]", "o", q)
    q = re.sub(r"[úü]", "u", q)
    q = re.sub(r"[ç]", "c", q)
    return re.sub(r"\s+", "-", re.sub(r"[^a-z0-9 ]", "", q)).strip("-")


def parse_card(text, href):
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    if len(lines) < 2:
        return None
    company = re.sub(r"^trabalhe na\s+", "", lines[0], flags=re.I)
    title = lines[1] if len(lines) > 1 else lines[0]
    location = lines[2] if len(lines) > 2 else ""
    modality = " ".join(lines[3:5])
    pub = ""
    m = re.search(r"publicada em:\s*(\d{2})/(\d{2})/(\d{4})", " ".join(lines), re.I)
    if m:
        try:
            pub = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))).date().isoformat()
        except ValueError:
            pass
    remote = bool(re.search(r"remot|home.?office", modality + " " + location, re.I))
    return norm_job("gupy", title, company, href.split("?")[0], location, remote=remote,
                    published_at=pub)


def scrape(page, query=None, max_pages=3):
    # Gupy casa o termo inteiro: genéricos ("estagio") trazem tudo, então varremos
    # termos tech 1 a 1 e o run.py deduplica por URL.
    jobs = []
    for t in TERMS:
        page.goto(SEARCH.format(t=t), wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        links = page.locator("a[href*='/job/']")
        try:
            links.first.wait_for(timeout=12000)
        except Exception:
            print(f"  [gupy] sem resultados p/ {t!r}")
            continue
        # scroll p/ carregar mais (lista lazy)
        for _ in range(max_pages):
            page.mouse.wheel(0, 2500)
            page.wait_for_timeout(1800 + random.randint(0, 1500))
        n = links.count()
        print(f"  [gupy] {t!r}: {n} links")
        for i in range(n):
            try:
                el = links.nth(i)
                href = el.get_attribute("href") or ""
                txt = el.locator("xpath=ancestor::li[1]").inner_text(timeout=3000)
                job = parse_card(txt, href)
                if job:
                    jobs.append(job)
            except Exception:
                continue
        page.wait_for_timeout(1200)
    return jobs
