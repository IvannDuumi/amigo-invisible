/* ================================================================
   Amigo Invisible — app 100% estática (GitHub Pages friendly)
   ================================================================ */

const STORAGE_KEY = "amigo-invisible-v1";
const COLORS = ["#ff4d6d", "#2ec4b6", "#ffbe0b", "#8338ec", "#3a86ff", "#fb5607", "#06d6a0", "#ef476f"];
const DEFAULT_RULES = [
  "No le cuentes a nadie quién te tocó 🤫",
  "Respetá el presupuesto acordado",
  "Envolvé el regalo y ponele el nombre de quien lo recibe",
  "Llevá el regalo el día del intercambio",
  "Si no sabés qué regalar, averiguá con disimulo 🕵️",
];

const $ = (sel) => document.querySelector(sel);

let state = {
  event: { name: "", date: "", place: "", min: "", max: "", cur: "$", host: "" },
  people: [], // {id, name, phone}
  exclusions: [], // [idA, idB]
  rules: DEFAULT_RULES.join("\n"),
  circle: false,
  noSecret: false,
  result: null, // {giverId: receiverId}
  sent: {}, // {giverId: true}
};

/* ---------------- Persistencia ---------------- */
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch (_) { /* datos corruptos: se ignoran */ }
}

/* ---------------- Utilidades ---------------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const person = (id) => state.people.find((p) => p.id === id);
const colorFor = (i) => COLORS[i % COLORS.length];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

function budgetText(ev) {
  const fmt = (n) => `${ev.cur}${Number(n).toLocaleString("es-AR")}`;
  if (ev.min && ev.max) return `Entre ${fmt(ev.min)} y ${fmt(ev.max)}`;
  if (ev.max) return `Hasta ${fmt(ev.max)}`;
  if (ev.min) return `Desde ${fmt(ev.min)}`;
  return "";
}

const rulesList = () => state.rules.split("\n").map((r) => r.trim()).filter(Boolean);

/* Codificación del link secreto (ofuscado para que no se lea a simple vista) */
const KEY = "regalito";
function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const x = bytes.map((b, i) => b ^ KEY.charCodeAt(i % KEY.length));
  let bin = "";
  x.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---------------- Sorteo ---------------- */
function isExcluded(a, b) {
  return state.exclusions.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
const allowed = (giver, receiver) => giver !== receiver && !isExcluded(giver, receiver);

// Asignación libre (puede formar varios círculos): backtracking aleatorio
function drawFree(ids) {
  const givers = shuffle(ids);
  const used = new Set();
  const res = {};
  let steps = 0;
  function bt(i) {
    if (++steps > 200000) return false;
    if (i === givers.length) return true;
    const g = givers[i];
    for (const r of shuffle(ids)) {
      if (used.has(r) || !allowed(g, r)) continue;
      used.add(r); res[g] = r;
      if (bt(i + 1)) return true;
      used.delete(r); delete res[g];
    }
    return false;
  }
  return bt(0) ? res : null;
}

// Una sola cadena: A→B→C→…→A (ciclo hamiltoniano aleatorio)
function drawCircle(ids) {
  const order = shuffle(ids);
  const start = order[0];
  const path = [start];
  const used = new Set([start]);
  let steps = 0;
  function bt() {
    if (++steps > 200000) return false;
    const last = path[path.length - 1];
    if (path.length === ids.length) return allowed(last, start);
    for (const r of shuffle(ids)) {
      if (used.has(r) || !allowed(last, r)) continue;
      used.add(r); path.push(r);
      if (bt()) return true;
      used.delete(r); path.pop();
    }
    return false;
  }
  if (!bt()) return null;
  const res = {};
  path.forEach((g, i) => (res[g] = path[(i + 1) % path.length]));
  return res;
}

function doDraw() {
  const err = $("#drawError");
  err.textContent = "";
  const ids = state.people.map((p) => p.id);
  if (ids.length < 3) { err.textContent = "Necesitás al menos 3 participantes para sortear."; return false; }
  const names = state.people.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) { err.textContent = "Hay nombres repetidos. Agregá un apellido o inicial para diferenciarlos."; return false; }

  let res = null;
  for (let attempt = 0; attempt < 5 && !res; attempt++) {
    res = state.circle ? drawCircle(ids) : drawFree(ids);
  }
  if (!res) {
    err.textContent = state.circle
      ? "Con estas exclusiones no se puede armar una sola ronda. Probá quitar alguna exclusión o desactivar “Una sola ronda”."
      : "Con estas exclusiones no hay forma de sortear. Quitá alguna exclusión.";
    return false;
  }
  state.result = res;
  state.sent = {};
  save();
  renderResults();
  confetti();
  $("#results").scrollIntoView({ behavior: "smooth" });
  return true;
}

/* ---------------- Mensajes y links ---------------- */
function revealLink(giverId) {
  const g = person(giverId), r = person(state.result[giverId]);
  const ev = state.event;
  const payload = { e: ev.name, g: g.name, r: r.name, d: ev.date, p: ev.place, b: budgetText(ev), h: ev.host, n: rulesList() };
  return `${location.origin}${location.pathname}#v=${encode(payload)}`;
}

function waMessage(giverId) {
  const g = person(giverId), r = person(state.result[giverId]);
  const ev = state.event;
  const lines = [];
  lines.push(`🎁 *¡Hola ${g.name}!*`);
  lines.push(`Ya se hizo el sorteo del *Amigo Invisible${ev.name ? ` – ${ev.name}` : ""}* 🎄`);
  lines.push("");
  if (state.noSecret) {
    lines.push(`🤫 Te tocó regalarle a: *${r.name}*`);
  } else {
    lines.push("🤫 Abrí tu link secreto para descubrir a quién le regalás:");
    lines.push(revealLink(giverId));
  }
  lines.push("");
  const b = budgetText(ev);
  if (b) lines.push(`💰 Presupuesto: ${b}`);
  if (ev.date) lines.push(`📅 Intercambio: ${formatDate(ev.date)}`);
  if (ev.place) lines.push(`📍 Lugar: ${ev.place}`);
  const rules = rulesList();
  if (rules.length) {
    lines.push("");
    lines.push("📜 *Reglas:*");
    rules.forEach((x) => lines.push(`• ${x}`));
  }
  if (ev.host) { lines.push(""); lines.push(`Organiza: ${ev.host}`); }
  return lines.join("\n");
}

function sendWhatsApp(giverId) {
  const g = person(giverId);
  const phone = (g.phone || "").replace(/\D/g, "");
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(waMessage(giverId))}`;
  window.open(url, "_blank");
  state.sent[giverId] = true;
  save();
  renderResults();
}

/* ---------------- Cartel (imagen) ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW, size, weight, family) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 4; } while (ctx.measureText(text).width > maxW && s > 30);
}

function wrapLines(ctx, text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function drawPoster(giverId) {
  await document.fonts.ready;
  const g = person(giverId), r = person(state.result[giverId]);
  const ev = state.event;
  const W = 1080, H = 1560;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // Fondo
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1b1f3b");
  bg.addColorStop(1, "#5a189a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  [["#ff4d6d", 150, 160, 380], ["#2ec4b6", 950, 420, 420], ["#ffbe0b", 540, 1560, 560]].forEach(([col, x, y, rad]) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, col + "88");
    rg.addColorStop(1, col + "00");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  });
  // Nieve
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tarjeta
  const cx = 70, cy = 230, cw = W - 140, ch = H - 330;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cx, cy, cw, ch, 48);
  ctx.fill();
  ctx.restore();

  // Moño superior
  ctx.font = "150px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎁", W / 2, 200);

  // Título
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 64px Fredoka, sans-serif";
  ctx.fillText("Amigo Invisible", W / 2, 80);

  let y = cy + 130;
  ctx.fillStyle = "#7a7391";
  if (ev.name) {
    fitText(ctx, ev.name, cw - 120, 40, 700, "Nunito, sans-serif");
    ctx.fillStyle = "#c9184a";
    ctx.fillText(ev.name.toUpperCase(), W / 2, y);
    y += 70;
  }
  ctx.fillStyle = "#26213a";
  fitText(ctx, `¡Hola ${g.name}!`, cw - 120, 58, 700, "Fredoka, sans-serif");
  ctx.fillText(`¡Hola ${g.name}!`, W / 2, y);
  y += 80;
  ctx.fillStyle = "#7a7391";
  ctx.font = "600 40px Nunito, sans-serif";
  ctx.fillText("Te tocó regalarle a", W / 2, y);
  y += 120;

  // Nombre destacado
  fitText(ctx, r.name, cw - 120, 140, 700, "Fredoka, sans-serif");
  const ng = ctx.createLinearGradient(cx, 0, cx + cw, 0);
  ng.addColorStop(0, "#c9184a"); ng.addColorStop(0.5, "#f59f00"); ng.addColorStop(1, "#1a9c90");
  ctx.fillStyle = ng;
  ctx.fillText(r.name, W / 2, y);
  y += 110;

  // Datos
  const info = [];
  const b = budgetText(ev);
  if (b) info.push(`💰 ${b}`);
  if (ev.date) info.push(`📅 ${formatDate(ev.date)}`);
  if (ev.place) info.push(`📍 ${ev.place}`);
  ctx.font = "700 36px Nunito, sans-serif";
  info.forEach((t) => {
    const w = Math.min(ctx.measureText(t).width + 60, cw - 80);
    ctx.fillStyle = "#f1ecfa";
    roundRect(ctx, W / 2 - w / 2, y - 32, w, 64, 32);
    ctx.fill();
    ctx.fillStyle = "#26213a";
    ctx.fillText(t, W / 2, y);
    y += 80;
  });

  // Reglas
  const rules = rulesList().slice(0, 5);
  if (rules.length) {
    y += 10;
    const boxTop = y - 10;
    ctx.font = "600 30px Nunito, sans-serif";
    const lines = [];
    rules.forEach((rl) => wrapLines(ctx, `• ${rl}`, cw - 160).forEach((l) => lines.push(l)));
    const maxLines = Math.max(0, Math.floor((cy + ch - 110 - boxTop - 60) / 42));
    const shown = lines.slice(0, maxLines);
    const boxH = 60 + shown.length * 42;
    ctx.fillStyle = "#fff8e6";
    roundRect(ctx, cx + 40, boxTop, cw - 80, boxH, 28);
    ctx.fill();
    ctx.fillStyle = "#f59f00";
    ctx.font = "700 30px Fredoka, sans-serif";
    ctx.fillText("REGLAS", W / 2, boxTop + 34);
    ctx.textAlign = "left";
    ctx.fillStyle = "#26213a";
    ctx.font = "600 30px Nunito, sans-serif";
    shown.forEach((l, i) => ctx.fillText(l, cx + 80, boxTop + 80 + i * 42));
    ctx.textAlign = "center";
  }

  // Pie
  ctx.fillStyle = "#c9184a";
  ctx.font = "800 38px Nunito, sans-serif";
  ctx.fillText("🤫 ¡Shhh! Es un secreto", W / 2, cy + ch - 60);

  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.font = "600 28px Nunito, sans-serif";
  ctx.fillText(ev.host ? `Organiza: ${ev.host}` : "🎄 Felices fiestas 🎄", W / 2, H - 50);
  return c;
}

let currentPoster = null;
async function openPoster(giverId) {
  const canvas = await drawPoster(giverId);
  const g = person(giverId);
  const fileName = `amigo-invisible-${g.name.replace(/\s+/g, "-").toLowerCase()}.png`;
  const url = canvas.toDataURL("image/png");
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  currentPoster = { giverId, blob, fileName };
  $("#modalImg").src = url;
  $("#modalDownload").href = url;
  $("#modalDownload").download = fileName;
  $("#modal").classList.remove("hidden");
}

async function sharePoster() {
  if (!currentPoster) return;
  const { giverId, blob, fileName } = currentPoster;
  const file = new File([blob], fileName, { type: "image/png" });
  const g = person(giverId);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `🎁 ${g.name}, este es tu Amigo Invisible. ¡Shhh! 🤫` });
      state.sent[giverId] = true; save(); renderResults();
    } catch (_) { /* el usuario canceló */ }
  } else {
    $("#modalDownload").click();
    toast("Tu dispositivo no permite compartir imágenes directo: la descargamos para que la adjuntes en WhatsApp.");
  }
}

/* ---------------- Render ---------------- */
function renderEvent() {
  const ev = state.event;
  $("#evName").value = ev.name; $("#evDate").value = ev.date; $("#evPlace").value = ev.place;
  $("#evMin").value = ev.min; $("#evMax").value = ev.max; $("#evCur").value = ev.cur; $("#evHost").value = ev.host;
  $("#evRules").value = state.rules;
  $("#ruleCircle").checked = state.circle;
  $("#ruleNoSecret").checked = state.noSecret;
}

function renderPeople() {
  const ul = $("#people");
  ul.innerHTML = state.people.map((p, i) => `
    <li>
      <span class="avatar" style="background:${colorFor(i)}">${esc(p.name.charAt(0).toUpperCase())}</span>
      <span class="name">${esc(p.name)}</span>
      <span class="phone">${p.phone ? "📱 " + esc(p.phone) : ""}</span>
      <button class="x-btn" data-del="${p.id}" title="Quitar">✕</button>
    </li>`).join("");
  $("#peopleEmpty").classList.toggle("hidden", state.people.length > 0);

  const opts = `<option value="">Elegí…</option>` + state.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("#exA").innerHTML = opts;
  $("#exB").innerHTML = opts;
  renderExclusions();
}

function renderExclusions() {
  $("#exclusions").innerHTML = state.exclusions.map(([a, b], i) => `
    <li>${esc(person(a)?.name || "?")} 💔 ${esc(person(b)?.name || "?")}
      <button class="x-btn" data-delex="${i}" title="Quitar">✕</button>
    </li>`).join("");
}

function renderResults() {
  const box = $("#results");
  if (!state.result || !state.people.every((p) => state.result[p.id])) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  $("#resultList").innerHTML = state.people.map((p, i) => `
    <li class="${state.sent[p.id] ? "sent" : ""}">
      <div class="who">
        <span class="avatar" style="background:${colorFor(i)}">${esc(p.name.charAt(0).toUpperCase())}</span>
        <div>
          ${esc(p.name)} ${state.sent[p.id] ? "✅" : ""}
          <div class="secret" data-secret="${p.id}">🔒 Le regala a: <b>••••••</b></div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-wa icon" data-wa="${p.id}">💬 WhatsApp</button>
        <button class="btn btn-gold icon" data-poster="${p.id}">🖼️ Cartel</button>
        <button class="btn btn-ghost icon" data-peek="${p.id}" title="Ver (¡sin espiar!)">👁️</button>
      </div>
    </li>`).join("");
}

/* ---------------- Confetti ---------------- */
function confetti() {
  for (let i = 0; i < 120; i++) {
    const el = document.createElement("div");
    el.className = "confetti";
    el.style.left = Math.random() * 100 + "vw";
    el.style.background = COLORS[i % COLORS.length];
    el.style.animationDuration = 2 + Math.random() * 2.5 + "s";
    el.style.animationDelay = Math.random() * 0.6 + "s";
    el.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5500);
  }
}

/* ---------------- Vista de revelación ---------------- */
function showReveal(data) {
  $("#setup").classList.add("hidden");
  $("#reveal").classList.remove("hidden");
  document.title = `🎁 ${data.g}, ¡tu Amigo Invisible!`;
  $("#rvEvent").textContent = data.e ? `🎄 ${data.e}` : "🎄 Amigo Invisible";
  $("#rvHello").textContent = `¡Hola ${data.g}!`;
  $("#rvName").textContent = data.r;
  const chips = [];
  if (data.b) chips.push(`💰 ${data.b}`);
  if (data.d) chips.push(`📅 ${formatDate(data.d)}`);
  if (data.p) chips.push(`📍 ${data.p}`);
  if (data.h) chips.push(`🧑‍🎄 Organiza ${data.h}`);
  $("#rvInfo").innerHTML = chips.map((c) => `<span>${esc(c)}</span>`).join("");
  $("#rvRules").innerHTML = (data.n || []).map((r) => `<li>${esc(r)}</li>`).join("");
  $("#rvRules").classList.toggle("hidden", !(data.n || []).length);

  $("#giftBtn").addEventListener("click", () => {
    $("#giftBtn").classList.add("open");
    setTimeout(() => {
      $("#giftBtn").classList.add("hidden");
      document.querySelector(".tap").classList.add("hidden");
      document.querySelector(".reveal-card > .reveal-sub").classList.add("hidden");
      $("#rvResult").classList.remove("hidden");
      confetti();
    }, 450);
  }, { once: true });
}

/* ---------------- Eventos ---------------- */
function bind() {
  const evFields = { evName: "name", evDate: "date", evPlace: "place", evMin: "min", evMax: "max", evCur: "cur", evHost: "host" };
  Object.entries(evFields).forEach(([id, key]) => {
    $("#" + id).addEventListener("input", (e) => { state.event[key] = e.target.value; save(); });
  });
  $("#evRules").addEventListener("input", (e) => { state.rules = e.target.value; save(); });
  $("#ruleCircle").addEventListener("change", (e) => { state.circle = e.target.checked; save(); });
  $("#ruleNoSecret").addEventListener("change", (e) => { state.noSecret = e.target.checked; save(); });
  $("#resetRules").addEventListener("click", () => { state.rules = DEFAULT_RULES.join("\n"); $("#evRules").value = state.rules; save(); });

  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#pName").value.trim();
    const phone = $("#pPhone").value.replace(/[^\d]/g, "");
    if (!name) return;
    if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast("Ese nombre ya está en la lista"); return; }
    state.people.push({ id: uid(), name, phone });
    state.result = null;
    save(); renderPeople(); renderResults();
    $("#pName").value = ""; $("#pPhone").value = ""; $("#pName").focus();
  });

  $("#people").addEventListener("click", (e) => {
    const id = e.target.dataset.del;
    if (!id) return;
    state.people = state.people.filter((p) => p.id !== id);
    state.exclusions = state.exclusions.filter(([a, b]) => a !== id && b !== id);
    state.result = null;
    save(); renderPeople(); renderResults();
  });

  $("#addEx").addEventListener("click", () => {
    const a = $("#exA").value, b = $("#exB").value;
    if (!a || !b) { toast("Elegí a las dos personas"); return; }
    if (a === b) { toast("Tienen que ser dos personas distintas"); return; }
    if (isExcluded(a, b)) { toast("Esa exclusión ya existe"); return; }
    state.exclusions.push([a, b]);
    state.result = null;
    save(); renderExclusions(); renderResults();
  });

  $("#exclusions").addEventListener("click", (e) => {
    const i = e.target.dataset.delex;
    if (i === undefined) return;
    state.exclusions.splice(Number(i), 1);
    state.result = null;
    save(); renderExclusions(); renderResults();
  });

  $("#drawBtn").addEventListener("click", doDraw);
  $("#redrawBtn").addEventListener("click", () => {
    if (confirm("¿Volver a sortear? Los mensajes que ya mandaste van a quedar desactualizados.")) doDraw();
  });
  $("#clearBtn").addEventListener("click", () => {
    if (!confirm("¿Borrar todo y empezar de cero?")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  $("#resultList").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.wa) sendWhatsApp(btn.dataset.wa);
    if (btn.dataset.poster) openPoster(btn.dataset.poster);
    if (btn.dataset.peek) {
      const id = btn.dataset.peek;
      const el = document.querySelector(`[data-secret="${id}"] b`);
      const hidden = el.textContent.startsWith("•");
      el.textContent = hidden ? person(state.result[id]).name : "••••••";
    }
  });

  $("#modalClose").addEventListener("click", () => $("#modal").classList.add("hidden"));
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("#modal").classList.add("hidden"); });
  $("#modalShare").addEventListener("click", sharePoster);
}

/* ---------------- Inicio ---------------- */
(function init() {
  const m = location.hash.match(/#v=([\w-]+)/);
  if (m) {
    try { showReveal(decode(m[1])); return; }
    catch (_) { toast("El link parece estar roto 😕"); }
  }
  load();
  renderEvent();
  renderPeople();
  renderResults();
  bind();
})();
