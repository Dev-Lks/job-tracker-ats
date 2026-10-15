"""LinkedIn público (sem login): /jobs/search com f_WT=2 (remoto) + f_E=1,2 (estágio/entry).
Cabeçalhos de card estáveis há anos; se o LinkedIn mudar o DOM, o probe em
scripts/bot_scrape/probe.py mostra o que quebrou.
"""
import random
import time
from urllib.parse import quote_plus

from normalize import norm_job, looks_remote

SEARCH = "https://www.linkedin.com/jobs/search/?keywords={q}&location=Brasil&f_WT=2&f_E=1%2C2&start={n}"
CARD = "ul.jobs-search__results-list > li"


def scrape(page, query, max_pages=3):
    jobs = []
    for p in range(max_pages):
        page.goto(SEARCH.format(q=quote_plus(query), n=p * 25), wait_until="domcontentloaded")
        page.wait_for_timeout(2500 + random.randint(0, 2000))
        cards = page.locator(CARD)
        try:
            cards.first.wait_for(timeout=12000)
        except Exception:
            # sem cards: authwall real ou busca vazia — encerra esta query
            if page.locator("main").count() == 0 or page.locator("h2:has-text('Cadastre-se já')").count():
                print(f"  [linkedin] authwall p/ {query!r} — parando query")
            else:
                print(f"  [linkedin] sem cards p/ {query!r} pág {p + 1}")
            break
        n = cards.count()
        print(f"  [linkedin] {query!r} pág {p + 1}: {n} cards")
        if not n:
            break
        for i in range(n):
            c = cards.nth(i)
            try:
                title = c.locator("h3.base-search-card__title").inner_text(timeout=3000)
                company = c.locator("h4.base-search-card__subtitle").inner_text(timeout=3000)
                loc = ""
                try:
                    loc = c.locator(".job-search-card__location").inner_text(timeout=2000)
                except Exception:
                    pass
                link = ""
                try:
                    link = c.locator("a.base-card__full-link").get_attribute("href", timeout=3000) or ""
                except Exception:
                    pass
                dt = ""
                try:
                    dt = c.locator("time").get_attribute("datetime", timeout=2000) or ""
                except Exception:
                    pass
                jobs.append(norm_job("linkedin", title, company, link.split("?")[0], loc,
                                     # busca usa f_WT=2: o próprio LinkedIn classifica como remoto
                                     remote=True, tags=[], published_at=dt))
            except Exception:
                continue
        page.wait_for_timeout(1500 + random.randint(0, 2500))
    return jobs
