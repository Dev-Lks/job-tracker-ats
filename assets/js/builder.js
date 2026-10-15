let PROFILE = null;
const $ = id => document.getElementById(id);

// Demo (Pages) usa data/profile.example.json; local usa data/profile.json (gitignored, só seu).
function loadProfile() {
  return fetch("data/profile.json").then(r => { if (!r.ok) throw 0; return r.json(); })
    .catch(() => fetch("data/profile.example.json").then(r => r.json()));
}
loadProfile().then(p => {
  PROFILE = p;
  // prefill da vaga via ?job=
  const q = new URLSearchParams(location.search).get("job");
  if (q) {
    try {
      const db = JSON.parse(localStorage.getItem("jta.v1"));
      const j = db?.jobs?.find(x => x.id === q);
      if (j) { $("jobTitle").value = j.title; $("company").value = j.company; $("jd").value = (j.tags || []).join(", ") + "\n" + (j.notes || ""); }
    } catch {}
  }
  $("summary").value = PROFILE.summary;
  render(null);
});

function render(jdWords) {
  const p = PROFILE;
  const jd = $("jd").value;
  const skills = jd.trim() && typeof rankSkills === "function" ? rankSkills(p.skills, jd) : p.skills;
  const summary = $("summary").value || p.summary;
  $("preview").innerHTML = `
    <h1>${p.name}</h1>
    <p>${p.location} · ${p.email} · ${p.phone}<br>Links: ${p.links.map(l => `${l.label}: ${l.url}`).join(" · ")}</p>
    <h2>Resumo</h2><p>${summary}</p>
    <h2>Habilidades</h2><p><b>Linguagens:</b> ${p.languages.join(", ")}<br><b>Tecnologias:</b> ${skills.join(", ")}</p>
    <h2>Experiência</h2>${p.experience.map(e => `<p><b>${e.role}</b> — ${e.company} (${e.period}) · ${e.location}<br>${e.bullets.map(b => `- ${b}`).join("<br>")}</p>`).join("")}
    <h2>Projetos</h2>${p.projects.map(pr => `<p><b>${pr.name}</b> — ${pr.stack}<br>${pr.bullets.map(b => `- ${b}`).join("<br>")}</p>`).join("")}
    <h2>Educação</h2><p>${p.education.map(e => `${e.course} — ${e.school} (${e.status})`).join("<br>")}</p>
    <h2>Idiomas</h2><p>${p.languages_spoken.join(" · ")}</p>`;
  if (jd.trim()) {
    const r = checkATS($("preview").innerText, jd);
    $("match").textContent = `Keyword match: ${r.matched.length}/${r.keywords.length} · score parcial ${r.score}/100`;
  } else $("match").textContent = "";
}

$("jd").addEventListener("input", () => render());
$("summary").addEventListener("input", () => render());

$("btnTailor").onclick = () => {
  const jd = $("jd").value;
  if (!jd.trim()) return alert("Cole a JD primeiro.");
  const kws = keywords(jd, 12);
  const role = $("jobTitle").value || "a vaga";
  const top = kws.slice(0, 6).join(", ");
  $("summary").value = `${PROFILE.base_summary} Alinhado a ${role}${$("company").value ? " na " + $("company").value : ""}, com experiência prática em ${top}.`;
  render(); alert("Resumo adaptado + skills reordenadas. Revise antes de enviar.");
};
$("btnCheck").onclick = () => {
  sessionStorage.setItem("jta.check", JSON.stringify({ text: $("preview").innerText, jd: $("jd").value }));
  location.href = "checker.html";
};
$("btnPDF").onclick = () => {
  // O "PDF" usa o print do navegador (100% texto, ATS-safe). O título vira o nome do arquivo.
  const jt = ($("jobTitle").value || "vaga").replace(/\s+/g, "-");
  const co = ($("company").value || "").replace(/\s+/g, "-");
  const old = document.title;
  const slug = PROFILE.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  document.title = `CV-${slug}-${jt}${co ? "-" + co : ""}`;
  window.print();
  setTimeout(() => document.title = old, 500);
};
$("btnSave").onclick = () => {
  const db = JSON.parse(localStorage.getItem("jta.v1") || '{"jobs":[],"resumes":[]}');
  db.resumes.unshift({ id: Math.random().toString(36).slice(2, 9), job: $("jobTitle").value, company: $("company").value, summary: $("summary").value, date: new Date().toISOString().slice(0, 10) });
  localStorage.setItem("jta.v1", JSON.stringify(db));
  alert("Variação salva no dashboard (backup JSON).");
};
