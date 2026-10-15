// Simple, dependency-free job store (localStorage). Scales to JSON-server later.
const KEY = "jta.v1";
const STATUSES = ["wishlist", "applied", "interview", "offer", "rejected"];

const Store = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { jobs: seedJobs(), resumes: [] };
  },
  save(db) { localStorage.setItem(KEY, JSON.stringify(db)); },
  reset() { localStorage.removeItem(KEY); return this.load(); },
  exportJSON(db) {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    dl(URL.createObjectURL(blob), "job-tracker-export.json");
  },
  exportCSV(db) {
    const rows = [["title", "company", "status", "url", "location", "remote", "tags", "applied_at", "notes"]];
    for (const j of db.jobs) rows.push([j.title, j.company, j.status, j.url || "", j.location || "", j.remote ? "yes" : "no", (j.tags || []).join("|"), j.applied_at || "", (j.notes || "").replace(/\n/g, " ")]);
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    dl(URL.createObjectURL(blob), "vagas.csv");
  },
  importCSV(text) {
    // title,company,status,url,location,remote,tags,applied_at,notes
    const lines = text.trim().split(/\r?\n/);
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (!cols.length) continue;
      out.push({
        id: uid(), title: cols[0] || "Sem título", company: cols[1] || "",
        status: STATUSES.includes((cols[2] || "").toLowerCase()) ? cols[2].toLowerCase() : "wishlist",
        url: cols[3] || "", location: cols[4] || "", remote: /^(y|yes|true|1|remoto)/i.test(cols[5] || ""),
        tags: (cols[6] || "").split("|").map(s => s.trim()).filter(Boolean),
        applied_at: cols[7] || "", notes: cols[8] || "", created_at: new Date().toISOString().slice(0, 10)
      });
    }
    return out;
  }
};

function uid() { return Math.random().toString(36).slice(2, 9); }
function dl(href, name) { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(href), 4000); }
function parseCSVLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}
function seedJobs() {
  return [
    { id: uid(), title: "Estágio Dev Fullstack", company: "Acme Tech", status: "applied", url: "", location: "Remoto", remote: true, tags: ["React", "Node.js", "PostgreSQL"], applied_at: "", notes: "Exemplo demo — troque pelos seus dados.", created_at: new Date().toISOString().slice(0, 10) },
    { id: uid(), title: "Estágio Frontend", company: "Exemplo SaaS", status: "wishlist", url: "", location: "São Paulo / Remoto", remote: true, tags: ["React", "TypeScript"], applied_at: "", notes: "", created_at: new Date().toISOString().slice(0, 10) }
  ];
}
