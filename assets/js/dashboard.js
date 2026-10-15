let db = Store.load();
let editing = null;
const $ = id => document.getElementById(id);
const modal = $("modal");

function stats() {
  const c = s => db.jobs.filter(j => j.status === s).length;
  const total = db.jobs.length, ap = c("applied") + c("interview") + c("offer");
  const rate = total ? Math.round(100 * (c("interview") + c("offer")) / Math.max(1, ap)) : 0;
  $("stats").innerHTML = [
    [total, "vagas no pipeline"], [ap, "enviadas"], [c("interview"), "entrevistas"],
    [c("offer"), "ofertas"], [rate + "%", "entrevista / enviada"]
  ].map(([b, s]) => `<div class="card stat"><b>${b}</b><span>${s}</span></div>`).join("");
}

function filtered() {
  const q = $("fSearch").value.toLowerCase(), st = $("fStatus").value, rm = $("fRemote").value, sort = $("fSort").value;
  let r = db.jobs.filter(j => {
    if (st && j.status !== st) return false;
    if (rm === "yes" && !j.remote) return false;
    if (rm === "no" && j.remote) return false;
    if (q && !`${j.title} ${j.company} ${(j.tags || []).join(" ")} ${j.notes || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (sort === "company") r.sort((a, b) => a.company.localeCompare(b.company));
  else if (sort === "status") r.sort((a, b) => a.status.localeCompare(b.status));
  else r.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return r;
}

function pill(s) { return `<span class="pill p-${s}">${s}</span>`; }

function render() {
  stats();
  const r = filtered();
  $("count").textContent = `${r.length} de ${db.jobs.length} vagas`;
  $("rows").innerHTML = r.map(j => `<tr>
    <td><b>${esc(j.title)}</b><br><span class="muted">${esc(j.company)}${j.applied_at ? " · enviada " + esc(j.applied_at) : ""}</span>
    ${j.url ? `<br><a href="${esc(j.url)}" target="_blank" rel="noopener">ver vaga ↗</a>` : ""}</td>
    <td>${pill(j.status)}<br><select class="small" data-status="${j.id}" style="margin-top:6px;max-width:130px">
      ${["wishlist", "applied", "interview", "offer", "rejected"].map(s => `<option ${s === j.status ? "selected" : ""}>${s}</option>`).join("")}
    </select></td>
    <td>${esc(j.location || "—")}<br><span class="muted small">${j.remote ? "remoto" : "local"}</span></td>
    <td class="small muted">${(j.tags || []).map(esc).join(", ") || "—"}</td>
    <td class="no-print"><div class="row">
      <button class="ghost small" data-cv="${j.id}">CV →</button>
      <button class="ghost small" data-edit="${j.id}">Editar</button>
      <button class="ghost small" data-del="${j.id}">✕</button>
    </div></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nenhuma vaga. Clique em + Nova vaga.</td></tr>`;

  document.querySelectorAll("[data-status]").forEach(el => el.onchange = () => {
    const j = db.jobs.find(x => x.id === el.dataset.status);
    j.status = el.value;
    if (el.value === "applied" && !j.applied_at) j.applied_at = new Date().toISOString().slice(0, 10);
    Store.save(db); render();
  });
  document.querySelectorAll("[data-del]").forEach(el => el.onclick = () => {
    if (!confirm("Excluir vaga?")) return;
    db.jobs = db.jobs.filter(x => x.id !== el.dataset.del);
    Store.save(db); render();
  });
  document.querySelectorAll("[data-edit]").forEach(el => el.onclick = () => openModal(db.jobs.find(x => x.id === el.dataset.edit)));
  document.querySelectorAll("[data-cv]").forEach(el => el.onclick = () => {
    location.href = "builder.html?job=" + el.dataset.cv;
  });
  syncView();
  $("listWrap").hidden = view !== "list";
  $("kanban").hidden = view !== "kanban";
  if (view === "kanban") renderBoard();
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function openModal(j) {
  editing = j?.id || null;
  $("mTitle").textContent = j ? "Editar vaga" : "Nova vaga";
  $("mJobTitle").value = j?.title || ""; $("mCompany").value = j?.company || "";
  $("mLocation").value = j?.location || ""; $("mStatus").value = j?.status || "wishlist";
  $("mRemote").value = j?.remote === false ? "no" : "yes";
  $("mUrl").value = j?.url || ""; $("mTags").value = (j?.tags || []).join(", ");
  $("mApplied").value = j?.applied_at || ""; $("mNotes").value = j?.notes || "";
  modal.showModal();
}

$("jobForm").addEventListener("submit", e => {
  if (e.submitter?.value === "cancel") return;
  const data = {
    title: $("mJobTitle").value.trim(), company: $("mCompany").value.trim(),
    location: $("mLocation").value.trim(), status: $("mStatus").value,
    remote: $("mRemote").value === "yes", url: $("mUrl").value.trim(),
    tags: $("mTags").value.split(",").map(s => s.trim()).filter(Boolean),
    applied_at: $("mApplied").value, notes: $("mNotes").value.trim()
  };
  if (!data.title) return;
  if (editing) Object.assign(db.jobs.find(x => x.id === editing), data);
  else db.jobs.unshift({ id: uid(), created_at: new Date().toISOString().slice(0, 10), ...data });
  Store.save(db); render();
});
["fSearch", "fStatus", "fRemote", "fSort"].forEach(id => $(id).addEventListener("input", render));
$("btnNew").onclick = () => openModal(null);
$("btnExpCSV").onclick = () => Store.exportCSV(db);
$("btnExpJSON").onclick = () => Store.exportJSON(db);
$("btnReset").onclick = () => { if (confirm("Voltar aos dados demo?")) { db = Store.reset(); Store.save(db); render(); } };
$("btnCSV").onclick = () => $("fileCSV").click();
$("fileCSV").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const rows = Store.importCSV(await f.text());
  db.jobs = [...rows, ...db.jobs]; Store.save(db); render();
  alert(rows.length + " vagas importadas.");
};
let view = localStorage.getItem("jta.view") || "list";
function syncView() {
  $("vList").classList.toggle("on", view === "list");
  $("vKanban").classList.toggle("on", view === "kanban");
}
$("vList").onclick = () => { view = "list"; localStorage.setItem("jta.view", view); render(); };
$("vKanban").onclick = () => { view = "kanban"; localStorage.setItem("jta.view", view); render(); };

const ORDER = ["wishlist", "applied", "interview", "offer", "rejected"];
function renderBoard() {
  const r = filtered();
  $("kanban").innerHTML = ORDER.map(s => {
    const items = r.filter(j => j.status === s);
    return `<div class="kcol"><h4>${s} · ${items.length}</h4>` + (items.map(j => {
      const i = ORDER.indexOf(j.status);
      return `<div class="kcard"><b>${esc(j.title)}</b><span class="muted">${esc(j.company)}</span><br>`
        + `<span class="muted small">${esc(j.location || "")}${(j.tags || []).length ? " · " + esc(j.tags.slice(0, 3).join(", ")) : ""}</span>`
        + (j.url ? `<br><a class="small" href="${esc(j.url)}" target="_blank" rel="noopener">ver vaga ↗</a>` : "")
        + `<div class="mv"><button class="ghost small" data-mv="${j.id}|-1" ${i === 0 ? "disabled" : ""}>←</button>`
        + `<button class="ghost small" data-mv="${j.id}|1" ${i === ORDER.length - 1 ? "disabled" : ""}>→</button>`
        + `<button class="ghost small" data-cv2="${j.id}">CV</button>`
        + `<button class="ghost small" data-edit2="${j.id}">Editar</button></div></div>`;
    }).join("") || `<p class="muted small">—</p>`) + `</div>`;
  }).join("");
  document.querySelectorAll("[data-mv]").forEach(el => el.onclick = () => {
    const [id, d] = el.dataset.mv.split("|");
    const j = db.jobs.find(x => x.id === id);
    const ni = ORDER.indexOf(j.status) + Number(d);
    if (ni < 0 || ni >= ORDER.length) return;
    j.status = ORDER[ni];
    if (j.status === "applied" && !j.applied_at) j.applied_at = new Date().toISOString().slice(0, 10);
    Store.save(db); render();
  });
  document.querySelectorAll("[data-cv2]").forEach(el => el.onclick = () => location.href = "builder.html?job=" + el.dataset.cv2);
  document.querySelectorAll("[data-edit2]").forEach(el => el.onclick = () => openModal(db.jobs.find(x => x.id === el.dataset.edit2)));
}
render();

// === Vagas automáticas (pipeline de scraping) — seção anexada, não altera nada acima ===
(async function autoJobs() {
  const box = document.getElementById("autoJobs");
  if (!box) return;
  let data = null;
  try {
    const res = await fetch("data/auto-jobs.json", { cache: "no-store" });
    if (!res.ok) return;
    data = await res.json();
  } catch { return; } // silencioso: esconde a seção se não houver dados
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  if (!jobs.length) return;
  box.hidden = false;
  try {
    if (data.updated_at) $("autoJobsUpdated").textContent =
      "· atualizado em " + new Date(data.updated_at).toLocaleString("pt-BR");
  } catch {}
  try {
    const f = data.filters;
    if (f && f.remoteOnly) $("autoRemote").checked = true;
    if (f && Array.isArray(f.keywords)) $("autoJobsUpdated").textContent +=
      ` · foco: ${f.remoteOnly ? "remoto" : "todas"} · ${f.keywords.length} keywords`;
  } catch {}
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const levelOf = j => {
    const h = norm([j.title, (j.tags || []).join(" ")].join(" "));
    if (/estag|intern|trainee/.test(h)) return "estagio";
    if (/junior|\bjr\b|entry/.test(h)) return "junior";
    return "outro";
  };
  const inPipe = u => u && db.jobs.some(j => j.url && j.url === u);
  const list = $("autoJobsList");
  const renderAuto = () => {
    const q = norm($("autoSearch").value);
    const lv = $("autoLevel").value;
    const rm = $("autoRemote").checked;
    const vis = jobs.filter(j => {
      if (rm && !j.remote) return false;
      if (lv && levelOf(j) !== lv) return false;
      if (q && !norm(`${j.title} ${j.company} ${(j.tags || []).join(" ")}`).includes(q)) return false;
      return true;
    }).slice(0, 20);
    list.innerHTML = vis.map(j => {
      const i = jobs.indexOf(j);
      return `<div class="kcard"><b>${esc(j.title)}</b><span class="muted">${esc(j.company)}</span><br>`
      + `<span class="muted small">${j.remote ? "remoto · " : ""}${esc(j.location || "")}${(j.tags || []).length ? " · " + esc(j.tags.slice(0, 4).join(", ")) : ""}</span>`
      + (j.url ? `<br><a class="small" href="${esc(j.url)}" target="_blank" rel="noopener">ver vaga ↗</a>` : "")
      + `<div class="mv"><button class="ghost small" data-auto-add="${i}" ${inPipe(j.url) ? "disabled" : ""}>${inPipe(j.url) ? "✓ Na pipeline" : "+ Adicionar"}</button></div></div>`;
    }).join("") || `<p class="muted small">Nenhuma automática com esses filtros.</p>`;
    list.querySelectorAll("[data-auto-add]").forEach(btn => btn.onclick = () => {
      const j = jobs[Number(btn.dataset.autoAdd)];
      if (!j || inPipe(j.url)) return;
      db.jobs.unshift({
        id: uid(), title: j.title || "Sem título", company: j.company || "",
        status: "wishlist", url: j.url || "", location: j.location || "",
        remote: Boolean(j.remote), tags: Array.isArray(j.tags) ? j.tags : [],
        applied_at: "", notes: "via automação (" + (j.source || "auto") + ")",
        created_at: new Date().toISOString().slice(0, 10)
      });
      Store.save(db); render();
      btn.disabled = true; btn.textContent = "✓ Na pipeline";
    });
  };
  ["autoSearch", "autoLevel", "autoRemote"].forEach(id => $(id).addEventListener("input", renderAuto));
  renderAuto();
})();
