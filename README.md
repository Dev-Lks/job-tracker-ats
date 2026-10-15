# 📋 Job Tracker ATS

Pipeline de vagas + gerador de currículo ATS-safe + checker ATS. Simples, bonito, escalável e performático: **zero build, zero deps, 100% client-side**.

Abrir: `index.html` (ou GitHub Pages). Dados no `localStorage` — exporte CSV/JSON pra backup.

## Páginas

| Página | O quê |
|---|---|
| `index.html` | Dashboard: stats (total, enviadas, entrevistas, taxa), filtros (busca, status, remoto), **lista + kanban** (arraste lógico com ← →), add/editar, import/export CSV, backup JSON, status inline |
| `builder.html` | Gerador de CV: perfil de `data/profile.json` + vaga/JD → resumo adaptado, skills reordenadas por keyword match, preview single-column ATS, **⬇ Baixar PDF** (print 100% texto, nome do arquivo = `CV-nome-cargo-empresa`), salvar variação |
| `checker.html` | Checker ATS (0–100): contato, seções, keyword match vs JD, verbos de ação, quantificação, tamanho, formatação parseável — tudo no navegador |

## Currículo ATS-safe (regras aplicadas)

1 coluna, sem tabelas/foto/gráficos/colunas · títulos de seção padrão · bullets com `-` · PDF texto (não imagem) · keywords da JD espalhadas com verdade.

## Checker — como pontua

Contato 20 · Seções 15 · Keywords 25 · Verbos 10 · Números 10 · Tamanho 10 · Formatação 10.

## Escalar depois

- `assets/js/store.js` → trocar `localStorage` por API/JSON-server (mesma interface)
- `assets/js/ats.js` → compartilhado entre builder e checker
- `data/profile.json` → seu perfil base versionado

## Rodar local / deploy

```bash
# qualquer servidor estático
npx serve .  # ou: python -m http.server 8000
```

> Pra deixar aberto: o app é 100% estático — não tem processo pra "manter rodando".
> Abra o `index.html` (ou o link do Pages) e deixe a aba aberta; os dados ficam no
> `localStorage` do navegador. Se quiser servir na rede local, rode o comando acima
> e deixe o terminal aberto.

## Testes

```bash
node test/smoke.js   # 10 testes, zero deps: scoring ATS, keywords, rankSkills, CSV
```

GitHub Pages: Settings → Pages → Deploy from branch → `main` / root. Workflow em `.github/workflows/pages.yml` já incluso.

## CSV

Cabeçalho: `title,company,status,url,location,remote,tags,applied_at,notes` — tags com `|`. Exemplo em `data/sample-jobs.csv`.

## Créditos de ideia

- `BradySavarie/cv-builder` — preview editável + layout ATS single-column
- `tooladda-online/ats-resume-checker` — parseabilidade + keyword match 100% client-side

Reimplementados aqui do zero, sem bloat.

## Automação

Todo dia às 11:00 UTC o workflow `.github/workflows/scrape.yml` roda `node scripts/scrape.mjs`
(sem `setup-node` — o runner já tem Node), que busca vagas nas APIs gratuitas **Remotive**
(categorias `software-dev`, `data`, `devops`) e **Arbeitnow**, e grava
`data/auto-jobs.json` (`{updated_at, count, filters, jobs[]}`).

### Filtros (`scripts/scrape.config.json`)

```jsonc
{
  "keywords": ["estágio", "intern", "junior", "react", "node", ...],
  "excludeKeywords": ["senior", "pleno", "lead", ...],
  "remoteOnly": true,
  "sources": ["remotive", "arbeitnow"],
  "remotiveCategories": ["software-dev", "data", "devops"],
  "limit": 100
}
```

Regras: **inclusão** casa keywords no título/empresa/categoria/tags (descrição fica de fora
porque é ruidosa); **exclusão** olha **só o título** ("work with senior engineers" não é vaga
sênior); `remoteOnly` descarta presenciais antes do dedupe por URL.

Pra rodar manual ou sobrescrever sem editar o config:

```bash
node scripts/scrape.mjs        # ou: aba Actions → "Scrape vagas" → Run workflow
SCRAPE_KEYWORDS="estagio,react" SCRAPE_REMOTE_ONLY=true SCRAPE_LIMIT=50 node scripts/scrape.mjs
```

O Run workflow aceita os mesmos overrides como inputs (`keywords`, `remote_only`, `limit`).

O commit só acontece se o arquivo mudou. O dashboard (`index.html`) lê esse JSON no card
**🤖 Vagas automáticas** com filtros próprios (busca, nível estágio/júnior/outro, só remoto —
o foco ativo do JSON aparece no label) e botão **+ Adicionar** (insere como `wishlist`,
pulando URLs já presentes).

> Nota: o `data/auto-jobs.json` servido no Pages é demo. E aviso honesto: essas APIs grátis
> cobrem bem o mercado remoto gringo, mas quase nada de estágio BR — pra Gupy/LinkedIn BR,
> cadastre manual (ou CSV) e use o pipeline do mesmo jeito.
