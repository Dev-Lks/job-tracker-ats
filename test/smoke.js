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
  console.log(`\n${n} testes passaram.`);
})().catch(e => { console.error("FALHOU:", e.message); process.exit(1); });
