// Smoke tests — zero deps: `node test/smoke.js`
const fs = require("fs");
const path = require("path");
const assert = require("assert");

function loadLib(rel, exportExpr) {
  const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  return eval(`(() => { ${src}; return ${exportExpr}; })()`);
}

const { checkATS, keywords, rankSkills } = loadLib("assets/js/ats.js", "{ checkATS, keywords, rankSkills }");
const Store = loadLib("assets/js/store.js", "Store");
function loadJSON(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
const _pp = path.join(__dirname, "..", "data", "profile.json");
const _pe = path.join(__dirname, "..", "data", "profile.example.json");
const profile = loadJSON(fs.existsSync(_pp) ? _pp : _pe); // local usa o real, demo/CI usa o exemplo

let n = 0;
const ok = (cond, msg) => { n++; assert(cond, msg); console.log("ok -", msg); };

// 1. CV completo (com cabeçalhos de seção, como o builder gera) pontua bem
const full = [profile.name, profile.email, profile.phone, "GitHub LinkedIn", "", profile.summary, "",
  "Habilidades", [...profile.languages, ...profile.skills].join(", "), "",
  "Experiência", ...profile.experience.flatMap(e => [e.role + " " + e.company, ...e.bullets.map(b => "- " + b)]), "",
  "Projetos", ...profile.projects.flatMap(p => [p.name, ...p.bullets.map(b => "- " + b)]), "",
  "Educação", ...profile.education.map(e => e.course + " " + e.school)].join("\n");
const jd = "Estágio fullstack React Node.js PostgreSQL Docker APIs REST Git Linux TypeScript";
const r = checkATS(full, jd);
ok(r.score >= 70, `CV completo score>=70 (veio ${r.score})`);
ok(r.matched.length >= 5, `keyword match>=5 (veio ${r.matched.length})`);

// 2. CV vazio pontua baixo e lista correções
const bad = checkATS("João", "");
ok(bad.score < 40, `CV vazio score<40 (veio ${bad.score})`);
ok(bad.fixes.length >= 4, `CV vazio tem >=4 correções (veio ${bad.fixes.length})`);

// 3. keywords extrai termos relevantes da JD
const kws = keywords("Precisamos de React, React, Node.js e PostgreSQL para APIs REST", 10);
ok(kws.includes("react") && kws.includes("node.js"), "keywords extrai react/node.js");

// 4. rankSkills prioriza skills da vaga sem inventar nada
const ranked = rankSkills(["Django", "React", "C++"], "vaga de React frontend");
ok(ranked[0] === "React" && ranked.length === 3, "rankSkills reordena sem adicionar/remover");

// 5. importCSV parseia o exemplo
const csv = fs.readFileSync(path.join(__dirname, "..", "data/sample-jobs.csv"), "utf8");
const jobs = Store.importCSV(csv);
ok(jobs.length === 3, `importCSV lê 3 vagas (veio ${jobs.length})`);
ok(jobs[0].status === "applied" && jobs[0].tags.includes("React"), "status e tags parseados");
ok(jobs[0].remote === true && jobs[2].remote === false, "flag remoto parseada");

// 6. exportCSV gera cabeçalho válido
let got = "";
global.Blob = class { constructor(p) { got = p.join(""); } };
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL: () => {} };
global.document = { createElement: () => ({ click: () => {}, set href(v) {}, set download(v) {} }) };
Store.exportCSV({ jobs });
ok(got.startsWith('"title","company","status"'), "exportCSV gera cabeçalho");

(async () => {
  const sc = await import("../scripts/scrape.mjs");
  ok(sc.matchesKeywords("Vaga de estágio em React"), "matchesKeywords acha estágio/react");
  ok(!sc.matchesKeywords("Senior Major Account Executive"), "matchesKeywords rejeita fora do perfil");
  const r = sc.normalizeRemotive({ id: 1, title: "Junior Frontend React", company_name: "Acme", url: "https://x", tags: ["React"] });
  ok(r.source === "remotive" && r.remote === true && r.tags.includes("react"), "normalizeRemotive OK");
  const a = sc.normalizeArbeitnow({ slug: "s", title: "Backend Node Developer", company_name: "Acme", url: "https://y", location: "Berlin", remote: false, tags: [], job_types: ["full-time"] });
  ok(a.source === "arbeitnow" && a.remote === false, "normalizeArbeitnow OK");
  // filtros configuráveis
  sc.configure({ keywords: ["estagio", "react"], excludeKeywords: ["senior"] });
  ok(sc.matchesKeywords("Estágio em React"), "configure aplica keywords custom");
  ok(sc.titleBlocked("Senior React Developer"), "titleBlocked barra sênior no título");
  ok(!sc.titleBlocked("Junior React Developer"), "título júnior passa");
  ok(sc.matchesKeywords("we work with senior engineers and React"), "exclusão é no título: descrição com 'senior' ainda casa");
  const cfg = sc.loadConfig();
  ok(cfg.remoteOnly === true && cfg.sources.includes("remotive"), "loadConfig lê o config (remoteOnly)");
  const pool = sc.applyFilters([{ remote: true }, { remote: false }, { remote: true }], { remoteOnly: true, limit: 2 });
  ok(pool.length === 2 && pool.every(j => j.remote), "applyFilters: só remoto + limit");
  // Adzuna BR
  const z = sc.normalizeAdzuna({ id: 123, title: "<strong>Estágio React</strong>", company: { display_name: "Acme BR" }, location: { display_name: "São Paulo, Brasil" }, redirect_url: "https://x", category: { label: "IT" }, created: "2026-10-01T00:00:00Z", description: "home office" });
  ok(z.source === "adzuna" && z.remote === true && z.title === "Estágio React", "normalizeAdzuna OK (limpa HTML, detecta remoto BR)");
  // GitHub BR: empresa extraída, duplicadas colapsadas
  ok(sc.extractCompany("[Remoto] Dev Java Junior @ DB1") === "DB1", "extractCompany com @");
  ok(sc.extractCompany("Full-stack Engineer (Strider)") === "Strider", "extractCompany com parênteses");
  ok(sc.extractCompany("Backend Developer PHP/Laravel na Coodesh") === "Coodesh", "extractCompany com 'na'");
  ok(sc.extractCompany("Dev java junior - DB1") === "DB1", "extractCompany com hífen");
  ok(sc.matchesTech("Remote Office Assistant") === false, "matchesTech barra não-tech");
  ok(sc.matchesTech("Frontend Engineer React") === true, "matchesTech aprova tech");
  const g1 = sc.normalizeGithubIssue("x/vagas", { number: 1, title: "[Remoto] Mobile Engineer (Strider USD)", labels: [{ name: "Remoto" }, { name: "Júnior" }], html_url: "https://x/1", created_at: "2026-01-01" });
  ok(g1.title === "Mobile Engineer" && g1.remote === true && g1.source === "github", "normalizeGithubIssue limpa título e detecta remoto");
  ok(sc.githubKeep(g1) === true, "githubKeep aprova júnior remoto");
  // merge do browser (Camoufox): mesmo portão das APIs
  const b1 = sc.botKeep({ id: "linkedin-1", title: "Estágio Frontend React", company: "Acme", url: "https://x/1", location: "Remoto", remote: true, tags: [], source: "linkedin" });
  ok(b1 && b1.source === "linkedin", "botKeep aprova vaga tech válida");
  ok(sc.botKeep({ title: "Office Assistant", url: "https://x/2", tags: ["admin"] }) === null, "botKeep barra não-tech");
  ok(sc.botKeep({ title: "Estágio React" }) === null, "botKeep exige URL");
  sc.configure(); // volta pros defaults
  // tailor: rank + CV adaptado
  const tl = await import("../scripts/tailor.mjs");
  const fakeJob = { id: "t1", title: "Estágio React", company: "Acme", url: "https://x", location: "Remoto", remote: true, tags: ["React", "Node.js"], source: "test" };
  ok(tl.rankJob(fakeJob, profile) >= 50, `rankJob prioriza estágio remoto com overlap (veio ${tl.rankJob(fakeJob, profile)})`);
  ok(tl.rankJob({ title: "Senior Manager", company: "X", tags: [] }, profile) < 30, "rankJob rebaixa sênior sem overlap");
  const brJob = { ...fakeJob, location: "São Paulo, Brasil" };
  ok(tl.rankJob(brJob, profile) > tl.rankJob(fakeJob, profile), "rankJob dá +10 pra vaga BR");
  const sum = tl.buildSummary(profile, fakeJob);
  ok(sum.includes("Estágio React") && sum.length > 100, "buildSummary adapta pro cargo");
  const t = await tl.tailorForJob(fakeJob, profile);
  const fs2 = require("fs");
  ok(fs2.existsSync(t.htmlPath) && fs2.existsSync(t.mdPath), "tailorForJob grava HTML+MD em out/");
  ok(fs2.readFileSync(t.htmlPath, "utf8").includes(profile.name), "CV gerado contém o nome do perfil");
  // telegram: formatação + teclado (sem rede)
  const g = await import("../scripts/telegram.mjs");
  ok(typeof g.configured() === "boolean", "telegram.configured() responde (com ou sem token)");
  const kb = g.approveKeyboard("abc123");
  ok(kb.reply_markup.inline_keyboard[0][0].callback_data === `job:approve:${g.shortId("abc123")}`, "approveKeyboard callback certo (hash curto)");
  ok(kb.reply_markup.inline_keyboard[0][0].callback_data.length <= 64, "callback_data dentro do limite do Telegram");
  ok(g.fmtJob(fakeJob, "⭐ 80").includes("Estágio React"), "fmtJob formata a vaga");
  console.log(`\n${n} testes passaram.`);
})().catch(e => { console.error("FALHOU:", e.message); process.exit(1); });
