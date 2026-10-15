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
  "fullstack", "full-stack", "frontend", "backend",
];
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
  const res = await fetch(url, { headers: { "User-Agent": "job-tracker-ats/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const cfg = loadConfig();
  console.log(`filtros: remoteOnly=${cfg.remoteOnly} keywords=${cfg.keywords.length} exclude=${cfg.excludeKeywords.length} sources=${cfg.sources.join("+")} limit=${cfg.limit}`);
  const all = [];

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
      // inclusão: título/empresa/categoria/tags (descrição é ruidosa, fica fora)
      const hay = [j.title, j.company_name, j.category, (j.tags || []).join(" ")].join(" ");
      if (matchesKeywords(hay) && !titleBlocked(j.title)) {
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
      const hay = [
        it.title, it.company_name, it.location,
        (it.tags || []).join(" "), (it.job_types || []).join(" "),
      ].join(" ");
      if (matchesKeywords(hay) && !titleBlocked(it.title)) {
        all.push(normalizeArbeitnow(it));
        kept++;
      }
    }
    console.log(`arbeitnow: ${kept} filtradas de ${raw.length}`);
  } catch (e) {
    console.error(`arbeitnow falhou: ${e.message} — seguindo sem ela`);
  }

  // dedupe por url (sem url, vale o id) — remoteOnly filtra antes
  const pool = cfg.remoteOnly ? all.filter((j) => j.remote) : all;
  const seen = new Set();
  const jobs = [];
  for (const j of pool) {
    const key = (j.url && j.url.trim()) || j.id;
    if (!key || seen.has(key)) continue;
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
