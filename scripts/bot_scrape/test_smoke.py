"""Smoke do bot_scrape — só funções puras, zero rede: PY313 test_smoke.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import normalize as N
from sources_gupy import parse_card, slug

n = 0


def ok(cond, msg):
    global n
    n += 1
    assert cond, f"FALHOU: {msg}"
    print("ok -", msg)


ok(N.clean("  a  b \n c ") == "a b c", "clean colapsa espaços")
ok(N.short_url("https://x.com/job/1?jobBoardSource=gupy_portal") == "https://x.com/job/1",
   "short_url tira tracking")
j = N.norm_job("gupy", "Estágio React", "Acme", "https://x/1", "Remoto", remote=True, tags=["React"])
ok(j["id"].startswith("gupy-") and j["remote"] is True, "norm_job monta schema")
ok(N.looks_remote("Híbrido", "dev") is True, "looks_remote pega híbrido")
ok(slug("Estágio Frontend") == "estagio-frontend", "slug pt-BR")

card = "Trabalhe na Mills\n\nEstágio Técnico\nContagem - MG\nPresencial\nEstágio\nPublicada em: 15/10/2026"
g = parse_card(card, "https://mills.gupy.io/job/abc?jobBoardSource=gupy_portal")
ok(g and g["company"] == "Mills" and g["title"] == "Estágio Técnico", "parse_card empresa+título")
ok(g["location"] == "Contagem - MG" and g["remote"] is False, "parse_card local+presencial")
ok(g["published_at"] == "2026-10-15", "parse_card data ISO")
ok(g["url"] == "https://mills.gupy.io/job/abc", "parse_card URL canônica")
ok(parse_card("só uma linha", "https://x") is None, "parse_card rejeita card curto")

print(f"\n{n} testes passaram.")
