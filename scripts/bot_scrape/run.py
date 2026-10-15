"""Runner 24/7-friendly do bot_scrape (Camoufox, perfil persistente).
  python run.py --once                  # 1 passada (linkedin+gupy+inhire) -> data/bot-jobs.json
  python run.py --once --source linkedin
  python run.py --headed                 # mostra o navegador (p/ login manual 1x)
  python run.py --probe https://...      # despeja seletores p/ adaptar fonte nova
Saída: data/bot-jobs.json {updated_at, count, jobs[]} — o scrape.mjs mescla sozinho.
Perfil persistente em scripts/bot_scrape/.profile (gitignored): logue 1x no --headed.
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
PROFILE = Path(__file__).resolve().parent / ".profile"
OUT = ROOT / "data" / "bot-jobs.json"

QUERIES = ["estágio react", "estágio frontend", "desenvolvedor júnior", "estágio backend python"]
PAGES = 3
try:
    _cfg = json.loads((ROOT / "scripts" / "scrape.config.json").read_text(encoding="utf-8"))
    QUERIES = _cfg.get("botQueries") or QUERIES
    PAGES = int(_cfg.get("botMaxPages") or PAGES)
except Exception:
    pass


def launch(headless=True):
    from camoufox.sync_api import Camoufox
    PROFILE.mkdir(exist_ok=True)
    return Camoufox(headless=headless, persistent_context=True, user_data_dir=str(PROFILE),
                    locale="pt-BR")


def cmd_once(args):
    import sources_linkedin as li
    jobs = []
    with launch(headless=not args.headed) as browser:
        page = browser.new_page()
        try:
            page.set_viewport_size({"width": 1366, "height": 768})
        except Exception:
            pass
        if args.source in ("all", "linkedin"):
            for q in QUERIES:
                jobs += li.scrape(page, q, max_pages=args.pages)
        if args.source in ("all", "gupy"):
            try:
                import sources_gupy as gu
                jobs += gu.scrape(page, max_pages=args.pages)  # varre TERMS próprios 1x
            except ImportError:
                print("[gupy] módulo ainda não adaptado (rode o probe) — pulando")
        if args.source in ("all", "inhire"):
            try:
                import sources_inhire as ih
                for q in QUERIES:
                    jobs += ih.scrape(page, q, max_pages=args.pages)
            except ImportError:
                print("[inhire] sem board público (inhire.com.br é ATS p/ empresas) — pulando")
    seen, out = set(), []
    for j in jobs:
        if j["url"] and j["url"] not in seen:
            seen.add(j["url"])
            out.append(j)
    # preserva fontes que NÃO rodaram desta vez (ex.: --source linkedin não apaga gupy)
    ran = {"linkedin", "gupy", "inhire"} if args.source == "all" else {args.source}
    try:
        prev = json.loads(OUT.read_text(encoding="utf-8")).get("jobs", [])
        for j in prev:
            if j.get("source") not in ran and j.get("url") not in seen:
                seen.add(j["url"])
                out.append(j)
    except Exception:
        pass
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"updated_at": datetime.now(timezone.utc).isoformat(),
                               "count": len(out), "jobs": out}, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    print(f"ok: {len(out)} vagas -> data/bot-jobs.json")


def cmd_probe(url):
    with launch(headless=True) as browser:
        page = browser.new_page()
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(6000)
        print("TITLE:", page.title())
        print("URL:", page.url)
        for sel, name in [("a[href*='job']", "links-job"), ("[class*='card']", "cards"),
                          ("[class*='vaga']", "vagas"), ("li", "li"), ("h2,h3", "headings")]:
            try:
                n = page.locator(sel).count()
            except Exception as e:
                n = f"ERR {e}"
            print(f"{name}: {n}")
        heads = page.locator("h2,h3").all_inner_texts()[:15]
        print("--- headings ---")
        for h in heads:
            print(" ", h.strip()[:100])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--source", default="all", choices=["all", "linkedin", "gupy", "inhire"])
    ap.add_argument("--pages", type=int, default=PAGES)
    ap.add_argument("--probe", default="")
    a = ap.parse_args()
    t0 = time.time()
    if a.probe:
        cmd_probe(a.probe)
    else:
        cmd_once(a)
    print(f"({time.time() - t0:.0f}s)")
