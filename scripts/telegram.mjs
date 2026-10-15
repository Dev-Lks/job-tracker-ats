// scripts/telegram.mjs — Bot API via fetch, só stdlib. Sem deps.
// Credenciais NUNCA commitadas: scripts/.env local (gitignored) ou env vars:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
try {
  const envFile = join(dirname(fileURLToPath(import.meta.url)), ".env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT = process.env.TELEGRAM_CHAT_ID || "";
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : "";

export function configured() {
  return Boolean(TOKEN && CHAT);
}

async function call(method, body = {}) {
  if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN ausente");
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`);
  return data.result;
}

export const sendMessage = (text, extra = {}) =>
  call("sendMessage", { text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

export const sendDocument = (filename, buffer, caption = "") => {
  if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN ausente");
  const form = new FormData();
  form.append("chat_id", CHAT);
  form.append("caption", caption.slice(0, 1024));
  form.append("document", new Blob([buffer]), filename);
  return fetch(`${API}/sendDocument`, { method: "POST", body: form }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`Telegram sendDocument: ${data.description || res.status}`);
    return data.result;
  });
};

// Long-polling: retorna updates (message + callback_query). offset persistido pelo chamador.
export async function getUpdates(offset = 0, timeout = 50) {
  if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN ausente");
  const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=["message","callback_query"]`);
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram getUpdates: ${data.description || "?"}`);
  return data.result || [];
}

export const answerCallback = (id, text = "") =>
  call("answerCallbackQuery", { callback_query_id: id, text });

// Teclado de aprovação: callback_data = "job:<action>:<hash>" (limite 64 chars do Telegram)
export function shortId(id) {
  let h = 5381;
  for (const c of String(id)) h = (((h << 5) + h + c.codePointAt(0)) >>> 0);
  return h.toString(36);
}
export function approveKeyboard(jobId) {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Aprovar", callback_data: `job:approve:${shortId(jobId)}` },
        { text: "❌ Ignorar", callback_data: `job:ignore:${shortId(jobId)}` },
      ]],
    },
  };
}

export function fmtJob(j, rank) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tags = (j.tags || []).slice(0, 6).join(" · ");
  return `<b>${rank} · ${esc(j.title)}</b>\n${esc(j.company)} — ${esc(j.location || "")}${j.remote ? " · remoto" : ""}\n${tags ? `<i>${esc(tags)}</i>\n` : ""}${j.url ? `<a href="${esc(j.url)}">ver vaga ↗</a>` : ""}`;
}
