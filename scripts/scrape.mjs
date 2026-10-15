// scripts/scrape.mjs — coleta automática de vagas (só Node stdlib + fetch global, ES module).
// Fontes gratuitas: Remotive + Arbeitnow. Roda no CI (cron diário) ou manual:
//   node scripts/scrape.mjs
// Saída: data/auto-jobs.json no formato { updated_at, count, jobs[] }, onde cada
// job é { id, title, company, url, location, remote, tags[], source, published_at }.
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "auto-jobs.json");
const CONFIG_PATH = join(ROOT, "scripts", "scrape.config.json");

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs?limit=100&category=";
const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";

export const DEFAULT_KEYWORDS = [
  "estagio", "estágio", "intern", "trainee",
  "junior", "jr", "júnior",
  "react", "node", "typescript", "javascript", "python",
  "fullstack", "full-stack", "full stack", "frontend", "front-end", "front end",
  "backend", "back-end", "back end",
  "home office", "remoto", "remota",
];
// Relevância tech: pelo menos 1 precisa aparecer no título/tags (mata "Office Assistant", "Marketing"...)
export const TECH_KEYWORDS = [
  "react", "node", "typescript", "javascript", "python", "java", "php", "ruby", "go", "golang",
  "mobile", "android", "ios", "flutter", "vue", "angular", "dotnet", ".net", "laravel", "django",
  "fullstack", "full-stack", "frontend", "backend", "devops", "docker", "sql", "qa", "dados", "data",
];
export function matchesTech(text) {
  return matchList(text, TECH_KEYWORDS).length > 0;
}
export const KEYWORDS = DEFAULT_KEYWORDS; // compat
export const DEFAULT_EXCLUDE = [
  "senior", "sênior", "sr", "staff", "principal",
  "lead", "manager", "pleno", "mid-level", "mid level",
  "director", "diretor", "head", "vp", "chief", "founder",
  "gerente", "architect", "arquiteto",
];

// Filtros ativos (config file + env). configure() antes de casar.
let ACTIVE = { keywords: DEFAULT_KEYWORDS, excludeKeywords: DEFAULT_EXCLUDE };
export function configure(opts = {}) {
  ACTIVE = {
    keywords: Array.isArray(opts.keywords) && opts.keywords.length ? opts.keywords : DEFAULT_KEYWORDS,
    excludeKeywords: Array.isArray(opts.excludeKeywords) ? opts.excludeKeywords : DEFAULT_EXCLUDE,
  };
  return ACTIVE;
}
export function loadConfig() {
  let file = {};
  try { file = JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { /* usa defaults */ }
  const env = process.env;
  const csv = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const cfg = {
    keywords: env.SCRAPE_KEYWORDS?.trim() ? csv(env.SCRAPE_KEYWORDS) : (file.keywords ?? DEFAULT_KEYWORDS),
    excludeKeywords: env.SCRAPE_EXCLUDE?.trim() ? csv(env.SCRAPE_EXCLUDE) : (file.excludeKeywords ?? DEFAULT_EXCLUDE),
    remoteOnly: env.SCRAPE_REMOTE_ONLY?.trim()
      ? /^(1|true|yes|sim)$/i.test(env.SCRAPE_REMOTE_ONLY.trim())
      : (file.remoteOnly ?? false),
    sources: env.SCRAPE_SOURCES?.trim()
      ? csv(env.SCRAPE_SOURCES).map((s) => s.toLowerCase())
      : (file.sources ?? ["remotive", "arbeitnow"]),
    remotiveCategories: file.remotiveCategories ?? ["software-dev", "data", "devops"],
    adzuna: {
      country: file.adzuna?.country ?? "br",
      queries: file.adzuna?.queries ?? ["estagio react", "estagio frontend", "estagio backend", "desenvolvedor junior", "estagio python", "estagio javascript"],
    },
    githubRepos: file.githubRepos ?? ["frontendbr/vagas", "backend-br/vagas", "react-brasil/vagas", "phpdevbr/vagas", "androiddevbr/vagas"],
    limit: Number(env.SCRAPE_LIMIT) > 0 ? Number(env.SCRAPE_LIMIT)
      : (Number(file.limit) > 0 ? Number(file.limit) : 100),
  };
  configure(cfg);
  return cfg;
}

// minúsculas + sem acento, pra "estágio" casar com "estagio" e vice-versa
const strip = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function matchesKeywords(text) {
  return matchedKeywords(text).length > 0;
}

function matchList(text, list) {
  const h = strip(text);
  const padded = ` ${h.replace(/[^a-z0-9+#-]+/g, " ")} `;
  return list.filter((k) => {
    const kn = strip(k);
    if (!kn) return false;
    if (kn.length <= 3) return padded.includes(` ${kn} `); // evita substring espúria (jr, sr)
    return h.includes(kn);
  });
}

function matchedKeywords(text) {
  return matchList(text, ACTIVE.keywords);
}

function isExcluded(text) {
  return matchList(text, ACTIVE.excludeKeywords).length > 0;
}
// Exclusão no TÍTULO (descrição mente: "work with senior engineers" não é vaga sênior)
export function titleBlocked(title) {
  return isExcluded(title || "");
}

// Aplica remoteOnly + limit (usado no main e nos testes)
export function applyFilters(jobs, cfg) {
  const pool = cfg.remoteOnly ? jobs.filter((j) => j.remote) : [...jobs];
  const lim = Number(cfg.limit) > 0 ? Number(cfg.limit) : 100;
  return pool.slice(0, lim);
}

export function normalizeRemotive(job = {}) {
  const tags = Array.isArray(job.tags) ? job.tags.map((t) => String(t)) : [];
  const hay = [
    job.title, job.company_name, job.category, job.job_type,
    job.candidate_required_location, job.description, tags.join(" "),
  ].join(" ");
  const merged = [...new Set([...tags, ...matchedKeywords(hay)])].slice(0, 12);
  const loc = String(job.candidate_required_location || "").trim() || "Remoto";
  return {
    id: `remotive-${(job.id ?? strip(job.title).slice(0, 40)) || "na"}`,
    title: String(job.title || "Sem título").trim(),
    company: String(job.company_name || "").trim(),
    url: String(job.url || ""),
    location: loc,
    remote: true, // API é só de vagas remotas
    tags: merged,
    source: "remotive",
    published_at: String(job.publication_date || ""),
  };
}

// Adzuna BR (https://developer.adzuna.com — chave grátis). Pula sem avisar se sem chave.
export function normalizeAdzuna(r = {}) {
  const loc = String(r.location?.display_name || r.location?.area?.[3] || "").trim();
  const company = String(r.company?.display_name || "").trim();
  const cat = String(r.category?.label || "").trim();
  const hay = [r.title, company, loc, cat].join(" ");
  const merged = [...new Set([cat, ...matchedKeywords(hay)])].filter(Boolean).slice(0, 12);
  return {
    id: `adzuna-${(r.id ?? strip(r.title).slice(0, 40)) || "na"}`,
    title: String(r.title || "Sem título").trim().replace(/<[^>]+>/g, ""),
    company,
    url: String(r.redirect_url || ""),
    location: loc,
    remote: /remot|home.?office|teletrabalho/i.test([loc, r.description].join(" ")),
    tags: merged,
    source: "adzuna",
    published_at: String(r.created || ""),
  };
}

// Repos de vagas BR (frontendbr/vagas, backend-br/vagas…): issues com labels de nível/local.
// Labels decidem: nível permitido (estágio/júnior/trainee) ou título com keyword; bloqueadas matam.
const GH_LEVEL_OK = ["estagio", "estágio", "junior", "júnior", "trainee", "jr", "estagiario"];
const GH_LEVEL_BLOCK = ["senior", "sênior", "especialista", "pleno", "sr", "lead"];
const GH_REMOTE = ["remoto", "remote", "home office", "hibrido", "híbrido"];
// Empresa em títulos tipo "[Remoto] Cargo @ Empresa" | "Cargo na Empresa" | "Cargo (Empresa)" | "Cargo - Empresa"
export function extractCompany(t) {
  t = String(t || "");
  let m = t.match(/@\s*([^@|•\-–—(][^@|•\-–—(]{0,60})/);
  if (m) return m[1].trim();
  m = t.match(/\(([^()]{2,50})\)\s*$/);
  if (m && !/remoto|h[ií]brido|presencial|pj|clt|j[úu]nior|pleno|s[eê]nior|usd|brl|eur|r\$|react|node|python|java|php|net/i.test(m[1])) return m[1].trim();
  m = t.match(/\s+na\s+([A-ZÀ-Ú][\w&.'\- ]{1,50})\s*$/);
  if (m) return m[1].trim();
  m = t.match(/\s+[-–—•]\s*([^\-–—•(]{2,50})\s*$/);
  if (m && !/react|node|python|java|php|dev|front|back|full|mobile|dados|data|qa|usd|brl|r\$/i.test(m[1])) return m[1].trim();
  return "";
}
export function normalizeGithubIssue(repo, issue = {}) {
  const labels = Array.isArray(issue.labels) ? issue.labels.map((l) => String(l.name || l)) : [];
  const low = labels.join(" ").toLowerCase();
  const has = (list) => list.some((k) => low.includes(k));
  const rawTitle = String(issue.title || "Sem título").trim();
  const company = extractCompany(rawTitle);
  let title = rawTitle
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s*@\s*[^@|•\-–—(]+$/, "")
    .replace(/\s+[-–—•]\s*[^\-–—•(]{1,40}$/, (m) => (/react|node|python|java|php|dev|front|back|full|mobile|dados|data|qa/i.test(m) ? m : ""))
    .replace(/\s*\([^()]*\)\s*$/, "") // sufixo "(Strider)/(USD)" é metadado, não título
    .replace(/\s+[-–—]\s*(USD|BRL|EUR|R\$)\s*$/i, "")
    .trim();
  // parêntese desbalanceado ("(UX (focused) Strider"): corta do primeiro " (" em diante
  if ((title.match(/\(/g) || []).length !== (title.match(/\)/g) || []).length) {
    title = (title.split(" (")[0] || title).trim();
  }
  const remote = has(GH_REMOTE) || /\[remoto\]|\(remoto\)|remoto/i.test(rawTitle);
  const tags = [...new Set([...labels.filter((l) => l.length <= 20).slice(0, 8), ...matchedKeywords(rawTitle + " " + labels.join(" "))])].slice(0, 12);
  return {
    id: `github-${repo.replace("/", "-")}-${issue.number}`,
    title: title || rawTitle.replace(/^\[[^\]]+\]\s*/, ""),
    company,
    url: String(issue.html_url || ""),
    location: labels.filter((l) => /são paulo|sp\b|rio|rJ\b|brasil|br\b|remoto/i.test(l)).slice(0, 2).join(" · "),
    remote,
    tags,
    source: "github",
    published_at: String(issue.created_at || ""),
    _labels: labels,
  };
}
// Vagas do browser (Camoufox -> data/bot-jobs.json): mesmo portão das APIs
export function botKeep(b = {}) {
  const job = {
    id: String(b.id || `bot-${Date.now()}`),
    title: String(b.title || "Sem título").trim(),
    company: String(b.company || "").trim(),
    url: String(b.url || ""),
    location: String(b.location || "").trim(),
    remote: Boolean(b.remote),
    tags: Array.isArray(b.tags) ? b.tags.map(String).slice(0, 12) : [],
    source: String(b.source || "bot"),
    published_at: String(b.published_at || ""),
  };
  if (!job.url) return null;
  if (!matchesKeywords(job.title)) return null;
  if (!matchesTech([job.title, job.tags.join(" ")].join(" "))) return null;
  if (titleBlocked(job.title)) return null;
  return job;
}
export function githubKeep(n) {
  const labels = (n._labels || []).join(" ").toLowerCase();
  const blocked = GH_LEVEL_BLOCK.some((k) => labels.includes(k)) || titleBlocked(n.title);
  if (blocked) return false;
  if (GH_LEVEL_OK.some((k) => labels.includes(k))) return true;
  return matchesKeywords([n.title, (n.tags || []).join(" ")].join(" "));
}

export function normalizeArbeitnow(item = {}) {
  const tags = Array.isArray(item.tags) ? item.tags.map((t) => String(t)) : [];
  const types = Array.isArray(item.job_types) ? item.job_types.map((t) => String(t)) : [];
  const hay = [
    item.title, item.company_name, item.location,
    item.description, tags.join(" "), types.join(" "),
  ].join(" ");
  const merged = [...new Set([...tags, ...types, ...matchedKeywords(hay)])].slice(0, 12);
  let published = item.created_at ?? "";
  if (typeof published === "number") {
    published = new Date(published < 1e12 ? published * 1000 : published).toISOString();
  } else {
    published = String(published);
  }
  return {
    id: `arbeitnow-${(item.slug || strip(item.title).slice(0, 40)) || "na"}`,
    title: String(item.title || "Sem título").trim(),
    company: String(item.company_name || "").trim(),
    url: String(item.url || ""),
    location: String(item.location || "").trim(),
    remote: Boolean(item.remote) || /remote/i.test(item.location || ""),
    tags: merged,
    source: "arbeitnow",
    published_at: published,
  };
}

async function fetchJSON(url) {
  const headers = { "User-Agent": "job-tracker-ats/1.0", Accept: "application/vnd.github+json" };
  const tok = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const cfg = loadConfig();
  console.log(`filtros: remoteOnly=${cfg.remoteOnly} keywords=${cfg.keywords.length} exclude=${cfg.excludeKeywords.length} sources=${cfg.sources.join("+")} limit=${cfg.limit}`);
  const all = [];

  // GitHub PRIMEIRO (vagas BR com labels; entra primeiro no round-robin)
  if (cfg.sources.includes("github")) {
    let raw = 0, kept = 0;
    for (const repo of cfg.githubRepos) {
      try {
        const issues = await fetchJSON(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`);
        for (const issue of Array.isArray(issues) ? issues : []) {
          if (issue.pull_request) continue;
          raw++;
          const n = normalizeGithubIssue(repo, issue);
          if (githubKeep(n)) { const { _labels, ...job } = n; all.push(job); kept++; }
        }
      } catch (e) {
        console.error(`github/${repo} falhou: ${e.message} — seguindo`);
      }
    }
    console.log(`github: ${kept} filtradas de ${raw} issues (${cfg.githubRepos.length} repos)`);
  }

  if (cfg.sources.includes("remotive")) try {
    const cats = cfg.remotiveCategories.length ? cfg.remotiveCategories : ["software-dev"];
    let raw = [];
    for (const c of cats) {
      try {
        const data = await fetchJSON(REMOTIVE_URL + encodeURIComponent(c));
        const list = Array.isArray(data.jobs) ? data.jobs : [];
        console.log(`remotive/${c}: ${list.length} vagas`);
        raw = raw.concat(list);
      } catch (e) {
        console.error(`remotive/${c} falhou: ${e.message} — seguindo`);
      }
    }
    let kept = 0;
    for (const j of raw) {
      // título precisa carregar o sinal (nível ou tech); tags sozinhas geram lixo ("Office Assistant")
      const techHay = [j.title, j.category, (j.tags || []).join(" ")].join(" ");
      if (matchesKeywords(j.title) && matchesTech(techHay) && !titleBlocked(j.title)) {
        all.push(normalizeRemotive(j));
        kept++;
      }
    }
    console.log(`remotive: ${kept} filtradas de ${raw.length} (categorias: ${cats.join(",")})`);
  } catch (e) {
    console.error(`remotive falhou: ${e.message} — seguindo sem ela`);
  }

  if (cfg.sources.includes("arbeitnow")) try {
    const data = await fetchJSON(ARBEITNOW_URL);
    const raw = Array.isArray(data.data) ? data.data : [];
    let kept = 0;
    for (const it of raw) {
      const techHay = [it.title, (it.tags || []).join(" ")].join(" ");
      if (matchesKeywords(it.title) && matchesTech(techHay) && !titleBlocked(it.title)) {
        all.push(normalizeArbeitnow(it));
        kept++;
      }
    }
    console.log(`arbeitnow: ${kept} filtradas de ${raw.length}`);
  } catch (e) {
    console.error(`arbeitnow falhou: ${e.message} — seguindo sem ela`);
  }

  if (cfg.sources.includes("adzuna")) {
    const appId = (process.env.ADZUNA_APP_ID || "").trim();
    const appKey = (process.env.ADZUNA_APP_KEY || "").trim();
    if (!appId || !appKey) {
      console.log("adzuna: sem ADZUNA_APP_ID/ADZUNA_APP_KEY — pulando (chave grátis em developer.adzuna.com)");
    } else try {
      let raw = [];
      for (const q of cfg.adzuna.queries) {
        try {
          const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(cfg.adzuna.country)}/search/1`
            + `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}`
            + `&results_per_page=50&what=${encodeURIComponent(q)}&content-type=application/json`;
          const data = await fetchJSON(url);
          const list = Array.isArray(data.results) ? data.results : [];
          console.log(`adzuna/${q}: ${list.length} vagas`);
          raw = raw.concat(list);
        } catch (e) {
          console.error(`adzuna/${q} falhou: ${e.message} — seguindo`);
        }
      }
      let kept = 0;
      for (const r of raw) {
        if (matchesKeywords(r.title) && matchesTech([r.title, r.category?.label].join(" ")) && !titleBlocked(r.title)) {
          all.push(normalizeAdzuna(r));
          kept++;
        }
      }
      console.log(`adzuna: ${kept} filtradas de ${raw.length}`);
    } catch (e) {
      console.error(`adzuna falhou: ${e.message} — seguindo sem ela`);
    }
  }

  // dedupe por url (sem url, vale o id) — remoteOnly filtra antes
  // + mescla do browser (Camoufox -> data/bot-jobs.json, se existir)
  try {
    const rawBot = JSON.parse(readFileSync(join(ROOT, "data", "bot-jobs.json"), "utf8"));
    const list = Array.isArray(rawBot.jobs) ? rawBot.jobs : [];
    let kept = 0;
    for (const b of list) {
      const job = botKeep(b);
      if (job) { all.push(job); kept++; }
    }
    console.log(`bot: ${kept} aproveitadas de ${list.length} (data/bot-jobs.json)`);
  } catch { /* sem arquivo = sem browser scrape, segue o jogo */ }
  const pool = cfg.remoteOnly ? all.filter((j) => j.remote) : all;
  const seen = new Set();
  const seenTitle = new Set();
  const jobs = [];
  for (const j of pool) {
    const key = (j.url && j.url.trim()) || j.id;
    if (!key || seen.has(key)) continue;
    // GitHub/LinkedIn: mesma vaga repostada N vezes — 1ª vence (título+empresa)
    if (j.source === "github" || j.source === "linkedin" || j.source === "gupy") {
      const tk = j.source + ":" + strip(j.title).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 45)
        + "|" + strip(j.company).slice(0, 30);
      if (seenTitle.has(tk)) continue;
      seenTitle.add(tk);
    }
    seen.add(key);
    jobs.push(j);
  }
  jobs.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
  // round-robin por fonte (mais recentes de cada fonte primeiro) pra demo ter mix
  const bySource = new Map();
  for (const j of jobs) {
    if (!bySource.has(j.source)) bySource.set(j.source, []);
    bySource.get(j.source).push(j);
  }
  const mixed = [];
  const queues = [...bySource.values()];
  let added = true;
  while (added && mixed.length < cfg.limit) {
    added = false;
    for (const q of queues) {
      if (q.length && mixed.length < cfg.limit) {
        mixed.push(q.shift());
        added = true;
      }
    }
  }

  const out = {
    updated_at: new Date().toISOString(),
    count: 0,
    filters: { remoteOnly: cfg.remoteOnly, keywords: cfg.keywords, exclude: cfg.excludeKeywords, sources: cfg.sources },
    jobs: mixed,
  };
  out.count = out.jobs.length;

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`ok: ${out.count} vagas -> data/auto-jobs.json`);
}

const isMain = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) await main();
