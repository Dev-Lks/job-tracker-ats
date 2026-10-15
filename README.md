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
  "keywords": ["estágio", "intern", "junior", "react", "node", "home office", "remoto", ...],
  "excludeKeywords": ["senior", "pleno", "lead", ...],
  "remoteOnly": true,
  "sources": ["remotive", "arbeitnow", "adzuna"],
  "remotiveCategories": ["software-dev", "data", "devops"],
  "adzuna": { "country": "br", "queries": ["estagio react", "desenvolvedor junior", ...] },
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

> Nota: o `data/auto-jobs.json` servido no Pages é demo. E aviso honesto: Remotive + Arbeitnow
> cobrem bem o mercado remoto gringo, mas quase nada de estágio BR — por isso existe a fonte
> **Adzuna BR**: cadastre a chave grátis em https://developer.adzuna.com e coloque
> `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` no `scripts/.env` (ou Secrets no Actions) pra cobrir
> vagas brasileiras. Gupy/LinkedIn não têm API pública — cadastre manual (ou CSV).

## Monitor Telegram 24/7 (aprovação + CV automático)

Fluxo: a cada 6h o `scripts/watch.mjs` roda o scrape, rankeia (estágio +40, júnior +25,
remoto +20, overlap com suas skills até +20) e manda o top 5 no Telegram com botões
**✅ Aprovar / ❌ Ignorar**. Aprovar → gera o CV adaptado (`out/CV-*.html` + `.md`) e te
devolve o arquivo no chat. O envio final na vaga continua manual (cada site exige login).

### O que me mandar (2 coisas)

1. **Token do bot**: fale com `@BotFather` → `/newbot` → ele devolve o token.
2. **Seu chat ID**: fale com `@userinfobot` → ele devolve o número.

### Onde colocar (escolha 1)

- **Local (watch 24/7)**: copie `scripts/.env.example` pra `scripts/.env` e preencha.
  O `.env` é gitignored — nunca vai pro GitHub.
- **Nuvem (backup a cada 6h)**: repo → Settings → Secrets → `TELEGRAM_BOT_TOKEN` e
  `TELEGRAM_CHAT_ID`. O workflow `watch.yml` pula sozinho se não houver secrets.

### Rodar

```bash
node scripts/watch.mjs          # 24/7: deixe o terminal aberto (ciclo 6h + escuta)
node scripts/watch.mjs --once   # 1 ciclo (teste / cron)
node test/smoke.js              # 28 testes, zero deps (não manda nada sem token)
```

Na primeira mensagem mande `/start` pro bot. Estado local (`seen.json`, `decisions.json`,
`out/`) fica só na sua máquina, fora do git.
