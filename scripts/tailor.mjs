// scripts/tailor.mjs — adapta o currículo pra vaga (versão Node do builder).
// Lê data/profile.json (local, seu) ou data/profile.example.json. Gera em out/:
//   CV-<slug>.md e CV-<slug>.html (ATS-safe, 1 coluna). PDF: abrir o HTML e imprimir.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STOP = new Set("de,da,do,das,dos,e,em,para,com,que,uma,um,os,as,o,a,no,na,nos,nas,ao,aos,the,and,or,for,with,to,in,of,a,an,on,at,as,by,from,como,entre,sobre,using,usando,mais,etc,via".split(","));

export function tokens(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#./ ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}
export function keywords(jd, topN = 25) {
  const f = {};
  for (const t of tokens(jd)) f[t] = (f[t] || 0) + 1;
  return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, topN).map((e) => e[0]);
}
export function rankSkills(skills, jd) {
  const set = new Set(tokens(jd));
  return [...skills].sort((a, b) => (set.has(a.toLowerCase()) ? 0 : 1) - (set.has(b.toLowerCase()) ? 0 : 1));
}
export function slug(s) {
  return String(s || "vaga").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "vaga";
}

export async function loadProfile() {
  const real = join(ROOT, "data", "profile.json");
  const demo = join(ROOT, "data", "profile.example.json");
  return JSON.parse(await readFile(existsSync(real) ? real : demo, "utf8"));
}

// score simples p/ rankear vagas no Telegram: estágio > júnior, remoto +, overlap de tags
export function rankJob(j, profile) {
  const hay = [j.title, (j.tags || []).join(" ")].join(" ").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let s = 0;
  if (/estag|stage|intern|trainee/.test(hay)) s += 40;
  else if (/junior|júnior|\bjr\b|entry/.test(hay)) s += 25;
  if (j.remote) s += 20;
  const mine = new Set([...profile.skills, ...profile.languages].map((x) => x.toLowerCase()));
  const over = (j.tags || []).filter((t) => mine.has(String(t).toLowerCase())).length;
  s += Math.min(20, over * 4);
  return s;
}

export function buildSummary(profile, job) {
  const jd = [job.title, job.company, (job.tags || []).join(", ")].join(" ");
  const kws = keywords(jd, 12).slice(0, 6).join(", ");
  const role = job.title || "a vaga";
  return `${profile.base_summary || profile.summary} Alinhado a ${role}${job.company ? " na " + job.company : ""}, com experiência prática em ${kws}.`;
}

export function renderMarkdown(profile, summary) {
  const L = [];
  L.push(`# ${profile.name}`, "");
  L.push(`${profile.location} · ${profile.email} · ${profile.phone}`, "");
  L.push(profile.links.map((l) => `${l.label}: ${l.url}`).join(" · "), "");
  L.push("## Resumo", "", summary, "");
  L.push("## Habilidades", "", `**Linguagens:** ${profile.languages.join(", ")}`, "", `**Tecnologias:** ${profile.skills.join(", ")}`, "");
  L.push("## Experiência", "");
  for (const e of profile.experience) { L.push(`**${e.role}** — ${e.company} (${e.period}) · ${e.location}`, ""); e.bullets.forEach((b) => L.push(`- ${b}`)); L.push(""); }
  L.push("## Projetos", "");
  for (const p of profile.projects) { L.push(`**${p.name}** — ${p.stack}`, ""); p.bullets.forEach((b) => L.push(`- ${b}`)); L.push(""); }
  L.push("## Educação", "", profile.education.map((e) => `${e.course} — ${e.school} (${e.status})`).join("\n"), "");
  L.push("## Idiomas", "", profile.languages_spoken.join(" · "));
  return L.join("\n");
}

export function renderHTML(profile, summary) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sec = (t, inner) => `<h2>${t}</h2>${inner}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>CV ${esc(profile.name)}</title>`
    + `<style>body{font:13.5px/1.5 Georgia,serif;color:#111;max-width:720px;margin:32px auto;padding:0 20px}h1{font:24px Arial,sans-serif;margin:0}h2{font:700 13px Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #333;padding-bottom:3px;margin:18px 0 8px}ul{margin:4px 0;padding-left:20px}@media print{body{margin:0;max-width:none}}</style></head><body>`
    + `<h1>${esc(profile.name)}</h1><p>${esc(profile.location)} · ${esc(profile.email)} · ${esc(profile.phone)}<br>Links: ${profile.links.map((l) => `${esc(l.label)}: ${esc(l.url)}`).join(" · ")}</p>`
    + sec("Resumo", `<p>${esc(summary)}</p>`)
    + sec("Habilidades", `<p><b>Linguagens:</b> ${esc(profile.languages.join(", "))}<br><b>Tecnologias:</b> ${esc(profile.skills.join(", "))}</p>`)
    + sec("Experiência", profile.experience.map((e) => `<p><b>${esc(e.role)}</b> — ${esc(e.company)} (${esc(e.period)}) · ${esc(e.location)}<br>${e.bullets.map((b) => `- ${esc(b)}`).join("<br>")}</p>`).join(""))
    + sec("Projetos", profile.projects.map((p) => `<p><b>${esc(p.name)}</b> — ${esc(p.stack)}<br>${p.bullets.map((b) => `- ${esc(b)}`).join("<br>")}</p>`).join(""))
    + sec("Educação", `<p>${profile.education.map((e) => `${esc(e.course)} — ${esc(e.school)} (${esc(e.status)})`).join("<br>")}</p>`)
    + sec("Idiomas", `<p>${esc(profile.languages_spoken.join(" · "))}</p>`)
    + `</body></html>`;
}

// Gera os arquivos e retorna {md, html, summary, matched}
export async function tailorForJob(job, profileArg) {
  const profile = { ...(profileArg || await loadProfile()) };
  const jd = [job.title, job.company, (job.tags || []).join(", ")].join(" ");
  profile.skills = rankSkills(profile.skills, jd);
  const summary = buildSummary(profile, job);
  const name = `CV-${slug(profile.name)}-${slug(job.title)}${job.company ? "-" + slug(job.company) : ""}`;
  await mkdir(join(ROOT, "out"), { recursive: true });
  const mdPath = join(ROOT, "out", `${name}.md`);
  const htmlPath = join(ROOT, "out", `${name}.html`);
  await writeFile(mdPath, renderMarkdown(profile, summary));
  await writeFile(htmlPath, renderHTML(profile, summary));
  return { mdPath, htmlPath, name, summary };
}
