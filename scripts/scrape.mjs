// scripts/scrape.mjs — coleta automática de vagas (só Node stdlib + fetch global, ES module).
// Fontes gratuitas: Remotive + Arbeitnow. Roda no CI (cron diário) ou manual:
//   node scripts/scrape.mjs
// Saída: data/auto-jobs.json no formato { updated_at, count, jobs[] }, onde cada
// job é { id, title, company, url, location, remote, tags[], source, published_at }.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "auto-jobs.json");

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs?category=software-dev&limit=100";
const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";

export const KEYWORDS = [
  "estagio", "estágio", "intern", "trainee",
  "junior", "jr", "júnior",
  "react", "node", "typescript", "javascript", "python",
  "fullstack", "full-stack", "frontend", "backend",
];

// minúsculas + sem acento, pra "estágio" casar com "estagio" e vice-versa
const strip = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function matchesKeywords(text) {
  return matchedKeywords(text).length > 0;
}

function matchedKeywords(text) {
  const h = strip(text);
  const padded = ` ${h.replace(/[^a-z0-9+#-]+/g, " ")} `;
  return KEYWORDS.filter((k) => {
    const kn = strip(k);
    if (!kn) return false;
    if (kn === "jr") return padded.includes(" jr "); // evita substring espúria
    return h.includes(kn);
  });
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
    remote: Boolean(item.remote),
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
  const all = [];

  try {
    const data = await fetchJSON(REMOTIVE_URL);
    const raw = Array.isArray(data.jobs) ? data.jobs : [];
    let kept = 0;
    for (const j of raw) {
      const hay = [j.title, j.company_name, j.category, (j.tags || []).join(" "), j.description].join(" ");
      if (matchesKeywords(hay)) {
        all.push(normalizeRemotive(j));
        kept++;
      }
    }
    console.log(`remotive: ${kept} filtradas de ${raw.length}`);
  } catch (e) {
    console.error(`remotive falhou: ${e.message} — seguindo sem ela`);
  }

  try {
    const data = await fetchJSON(ARBEITNOW_URL);
    const raw = Array.isArray(data.data) ? data.data : [];
    let kept = 0;
    for (const it of raw) {
      const hay = [
        it.title, it.company_name, it.location,
        (it.tags || []).join(" "), (it.job_types || []).join(" "), it.description,
      ].join(" ");
      if (matchesKeywords(hay)) {
        all.push(normalizeArbeitnow(it));
        kept++;
      }
    }
    console.log(`arbeitnow: ${kept} filtradas de ${raw.length}`);
  } catch (e) {
    console.error(`arbeitnow falhou: ${e.message} — seguindo sem ela`);
  }

  // dedupe por url (sem url, vale o id)
  const seen = new Set();
  const jobs = [];
  for (const j of all) {
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
  while (added && mixed.length < 100) {
    added = false;
    for (const q of queues) {
      if (q.length && mixed.length < 100) {
        mixed.push(q.shift());
        added = true;
      }
    }
  }

  const out = {
    updated_at: new Date().toISOString(),
    count: 0,
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
