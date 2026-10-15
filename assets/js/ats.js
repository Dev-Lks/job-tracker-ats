// ATS checker — simples, 100% client-side, zero deps.
// Inspirado na ideia do tooladda (parseabilidade + keywords) e do
// cv-builder (layout single-column), reimplementado do zero sem bloat.
const ACTION_VERBS = ["desenvolvi", "implementei", "construí", "construi", "liderei", "lidere", "otimizei", "automatizei", "reduzi", "aumentei", "entreguei", "projetei", "criei", "melhorei", "integrei", "designed", "developed", "implemented", "built", "led", "optimized", "automated", "reduced", "increased", "delivered", "designed", "created", "improved", "integrated", "shipped"];
const REQUIRED_SECTIONS = ["experi", "educa", "skill", "habilidade", "tecnologia", "projeto", "experience", "education", "skills", "projects"];
const STOP = new Set("de,da,do,das,dos,e,em,para,com,que,uma,um,os,as,o,a,no,na,nos,nas,ao,aos,the,and,or,for,with,to,in,of,a,an,on,at,as,by,from,como,entre,sobre,using,usando,mais,etc,via".split(","));

function tokens(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#./ ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}
function keywords(jd, topN = 25) {
  const f = {};
  for (const t of tokens(jd)) f[t] = (f[t] || 0) + 1;
  return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, topN).map(e => e[0]);
}

function checkATS(resumeText, jdText = "") {
  const t = resumeText || "";
  const low = t.toLowerCase();
  const words = t.trim().split(/\s+/).filter(Boolean);
  const fixes = [];
  let score = 0;
  const add = (ok, pts, msg) => { if (ok) score += pts; else fixes.push(msg); };

  // 1. Contato (20)
  const hasMail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(t);
  const hasPhone = /(\+?55)?\s?\(?\d{2}\)?[\s-]?\d{4,5}[-.]?\d{4}/.test(t.replace(/\s/g, " ")) || /linkedin|github/i.test(t);
  add(hasMail && hasPhone, 20, hasMail ? "Adicione telefone/LinkedIn/GitHub no cabeçalho (ATS usa isso pra contato)." : "Adicione email válido no cabeçalho.");
  // 2. Seções (15)
  const found = REQUIRED_SECTIONS.filter(s => low.includes(s));
  add(found.length >= 3, 15, "Inclua seções padrão com títulos simples: Experiência, Educação, Habilidades, Projetos.");
  // 3. Keywords vs JD (25)
  let matched = [], missing = [];
  if (jdText.trim()) {
    const kws = keywords(jdText);
    const set = new Set(tokens(t));
    matched = kws.filter(k => set.has(k));
    missing = kws.filter(k => !set.has(k));
    const ratio = kws.length ? matched.length / kws.length : 0;
    add(ratio >= 0.4, Math.round(ratio * 25), `Keywords da vaga: ${matched.length}/${kws.length}. Faltam: ${missing.slice(0, 8).join(", ") || "—"}. Espalhe elas no resumo/experiência (sem mentir).`);
  } else { score += 12; fixes.push("Cole a descrição da vaga (JD) pra medir keyword match — vale ~25 pts."); }
  // 4. Verbos de ação (10)
  const verbs = ACTION_VERBS.filter(v => low.includes(v));
  add(verbs.length >= 3, 10, "Comece bullets com verbos de ação: desenvolvi, implementei, automatizei, otimizei…");
  // 5. Quantificação (10)
  const hasNum = /\d+\s?(%|\+|usu|users|ms|s\b|api|test|clientes|projetos)/i.test(t) || (t.match(/\d+/g) || []).length >= 3;
  add(hasNum, 10, "Quantifique 2–3 resultados (ex.: 120+ usuários, -40% lag, 8 unidades). ATS + recrutador amam número.");
  // 6. Tamanho (10)
  const n = words.length;
  add(n >= 200 && n <= 950, 10, n < 200 ? `Currículo curto (${n} palavras). Mire 250–800 palavras.` : `Currículo longo (${n} palavras). Corte pra <950 palavras.`);
  // 7. Formatação parseável (10)
  const risky = /[█▓░◆●★]|(\|\s*\|)|texto em coluna|header.*image/i.test(t);
  const bullets = (t.match(/^[-•*]/gm) || []).length;
  add(!risky && bullets >= 3, 10, "Use 1 coluna, sem tabelas/gráficos/fotos, bullets com - ou •. Exporte em PDF texto (não imagem).");

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? "Pronto pra enviar" : score >= 60 ? "Bom, com ajustes" : "Precisa de ajustes";
  const kws = jdText.trim() ? keywords(jdText) : [];
  return { score, grade, matched, missing, fixes, words: n, bullets, keywords: kws };
}

// Reordena skills do perfil por relevância na JD (pra adaptar sem mentir)
function rankSkills(skills, jdText) {
  const jd = new Set(tokens(jdText));
  return [...skills].sort((a, b) => (jd.has(a.toLowerCase()) ? 0 : 1) - (jd.has(b.toLowerCase()) ? 0 : 1));
}
