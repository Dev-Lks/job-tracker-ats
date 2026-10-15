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
(`remotive.com/api/remote-jobs?category=software-dev&limit=100`) e **Arbeitnow**
(`arbeitnow.com/api/job-board-api`), filtra por keywords (estágio, intern, trainee, júnior,
react, node, typescript, javascript, python, fullstack, frontend, backend…), normaliza pra
`{id,title,company,url,location,remote,tags[],source,published_at}`, remove duplicadas por URL
e grava `data/auto-jobs.json` (`{updated_at, count, jobs[]}`).

O commit só acontece se o arquivo mudou (`git diff --quiet` → commit + push). Pra rodar manual:

```bash
node scripts/scrape.mjs        # ou: aba Actions → "Scrape vagas" → Run workflow
```

O dashboard (`index.html`) lê esse JSON e mostra o card **🤖 Vagas automáticas** (até 20 itens,
com botão **+ Adicionar** que insere na pipeline como `wishlist`, pulando URLs já presentes).

> Nota: o `data/auto-jobs.json` servido no Pages é demo — pode estar desatualizado; rode o
> script pra atualizar.
