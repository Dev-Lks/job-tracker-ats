// scripts/watch.mjs — monitor 24/7: scrape -> rankeia -> manda top vagas no Telegram,
// você aprova por lá -> gera CV adaptado e devolve o arquivo.
//   node scripts/watch.mjs          # loop 24/7 (long-polling; deixe o terminal aberto)
//   node scripts/watch.mjs --once   # 1 ciclo (usado pelo cron/testes)
// Credenciais: scripts/.env local (NUNCA commitado) ou env vars:
//   TELEGRAM_BOT_TOKEN=x  TELEGRAM_CHAT_ID=y
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEEN = join(ROOT, "data", "seen.json");
const DECISIONS = join(ROOT, "data", "decisions.json");
const ENVFILE = join(ROOT, "scripts", ".env");

// .env simples (KEY=valor, sem aspas obrigatórias)
if (existsSync(ENVFILE)) {
  for (const line of readFileSync(ENVFILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const tg = await import("./telegram.mjs");
const { loadProfile, rankJob, tailorForJob, keywords } = await import("./tailor.mjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadJSON = async (p, fb) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } };
const saveJSON = async (p, v) => { await mkdir(dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(v, null, 2) + "\n"); };

async function freshJobs() {
  try {
    const { execFile } = await import("node:child_process");
    await new Promise((resolve) => execFile(process.execPath, [join(ROOT, "scripts", "scrape.mjs")], resolve));
  } catch {}
  const data = await loadJSON(join(ROOT, "data", "auto-jobs.json"), { jobs: [] });
  return Array.isArray(data.jobs) ? data.jobs : [];
}

async function notifyCycle({ send = true } = {}) {
  const profile = await loadProfile();
  const jobs = await freshJobs();
  const seen = await loadJSON(SEEN, { ids: [] });
  const seenSet = new Set(seen.ids);
  let fresh = jobs.filter((j) => j.url && !seenSet.has(j.url));
  if (process.argv.includes("--once")) {
    // CI não tem memória (seen.json é local): só vagas publicadas nas últimas 36h
    const cut = Date.now() - 36 * 3600 * 1000;
    fresh = fresh.filter((j) => Date.parse(j.published_at || "") >= cut);
  }
  const ranked = fresh.map((j) => ({ j, s: rankJob(j, profile) }))
    .filter((x) => x.s >= 30).sort((a, b) => b.s - a.s).slice(0, 5);
  if (send && tg.configured() && ranked.length) {
    for (const { j, s } of ranked) {
      const kws = keywords([j.title, (j.tags || []).join(" ")].join(" "), 6).join(", ");
      await tg.sendMessage(`${tg.fmtJob(j, `⭐ ${s}`)}\n<i>match: ${kws}</i>`, tg.approveKeyboard(j.id));
      await sleep(800);
    }
  }
  // marca como vistas mesmo se não enviou (evita repetir)
  for (const { j } of ranked) seenSet.add(j.url);
  for (const j of fresh) if (!ranked.some((x) => x.j.url === j.url)) seenSet.add(j.url);
  await saveJSON(SEEN, { ids: [...seenSet].slice(-500), updated_at: new Date().toISOString() });
  return ranked;
}

async function onApprove(jobId) {
  const data = await loadJSON(join(ROOT, "data", "auto-jobs.json"), { jobs: [] });
  const job = (data.jobs || []).find((j) => j.id === jobId);
  if (!job) return "Vaga não encontrada no JSON atual (rode o scrape de novo).";
  const profile = await loadProfile();
  const { mdPath, htmlPath, name, summary } = await tailorForJob(job, profile);
  const { readFile: rf } = await import("node:fs/promises");
  await tg.sendDocument(`${name}.html`, await rf(htmlPath), `CV adaptado: ${job.title} @ ${job.company}\n${summary.slice(0, 300)}…`);
  const dec = await loadJSON(DECISIONS, { approved: [], ignored: [] });
  dec.approved.unshift({ id: job.id, title: job.title, company: job.company, url: job.url, at: new Date().toISOString(), file: basename(htmlPath) });
  await saveJSON(DECISIONS, dec);
  return `✅ CV gerado e enviado: ${name}.html (MD salvo em out/ junto)`;
}

async function onIgnore(jobId) {
  const dec = await loadJSON(DECISIONS, { approved: [], ignored: [] });
  dec.ignored.unshift({ id: jobId, at: new Date().toISOString() });
  await saveJSON(DECISIONS, dec);
  return "Ignorada. 👍";
}

async function handleUpdates(offset) {
  const updates = await tg.getUpdates(offset);
  let next = offset;
  for (const u of updates) {
    next = Math.max(next, u.update_id + 1);
    const cq = u.callback_query;
    if (cq?.data?.startsWith("job:")) {
      const [, action, ...rest] = cq.data.split(":");
      const jobId = rest.join(":");
      try {
        const msg = action === "approve" ? await onApprove(jobId) : await onIgnore(jobId);
        await tg.answerCallback(cq.id);
        await tg.sendMessage(msg);
      } catch (e) {
        await tg.answerCallback(cq.id, "Erro — veja o terminal").catch(() => {});
        await tg.sendMessage(`⚠️ Falhou: ${e.message}`).catch(() => {});
      }
    } else if (u.message?.text?.startsWith("/start")) {
      await tg.sendMessage("🤖 Monitor ligado. Te mando as melhores vagas aqui — aprove com ✅ e eu gero o CV adaptado na hora.").catch(() => {});
    }
  }
  return next;
}

const ONCE = process.argv.includes("--once");
if (ONCE) {
  const ranked = await notifyCycle({ send: true });
  console.log(`ciclo único: ${ranked.length} notificadas`);
  process.exit(0);
}

if (!tg.configured()) {
  console.error("Falta TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (scripts/.env ou env). Rode com --once pra testar o resto.");
  process.exit(1);
}
console.log("👁️  watch 24/7 ligado (Ctrl+C pra parar). Ciclo de checagem a cada 6h + escuta o Telegram.");
let offset = 0;
let lastCycle = 0;
const CYCLE_MS = 6 * 3600 * 1000;
for (;;) {
  try {
    if (Date.now() - lastCycle > CYCLE_MS) {
      const n = (await notifyCycle({ send: true })).length;
      console.log(`[${new Date().toISOString()}] ciclo: ${n} vagas enviadas`);
      lastCycle = Date.now();
    }
    offset = await handleUpdates(offset);
  } catch (e) {
    console.error("watch erro (tentando de novo em 30s):", e.message);
    await sleep(30000);
  }
}
