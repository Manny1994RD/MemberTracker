'use strict';
/* Church Status web app (Clean design). Talks to the server's JSON API and live updates. */

/* =====================================================================
   SETTINGS & LANGUAGE
   ===================================================================== */
const THEME = 'clean';
let LANG = 'es';
try { LANG = localStorage.getItem('cs-lang') || 'es'; } catch (e) {}
const L = (en, es) => LANG === 'es' ? es : en;
const MONTH_NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
};
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const CURRENT_MONTH = monthKey(new Date());
const shiftMonth = (k, n) => { const [y, m] = k.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); };

/* =====================================================================
   GOALS & MATH
   ===================================================================== */
const GOALS = () => [
  { k: 'att',   name: L('Attendance', 'Asistencia'),          short: L('Attend', 'Asist.'),   icon: 'calendar' },
  { k: 'tithe', name: L('Tithe', 'Diezmo'),                   short: L('Tithe', 'Diezmo'),    icon: 'coin',   target: 1 },
  { k: 'edu',   name: 'EduLMS',                               short: 'EduLMS',                icon: 'laptop', target: 1 },
  { k: 'ga',    name: L('GA Signature', 'Firma de AG'),       short: L('GA sign.', 'Firma AG'), icon: 'sign', target: 1 },
  { k: 'om',    name: L('Online Mission', 'Misión en línea'), short: L('Online', 'En línea'), icon: 'globe',  target: 3 },
  { k: 'pr',    name: L('Preached', 'Predicó'),               short: L('Preached', 'Predicó'), icon: 'speech', target: 3 },
  { k: 'prep',  name: L('Preparation Day', 'Día de Preparación'), short: L('Prep. day', 'Día prep.'), icon: 'lamp', target: 1 },
];
const METRICS = () => [
  { k: 'simple', kind: 'sum', name: L('Simple Preaching', 'Predicación Simple'), short: 'Simple', desc: L('people preached to', 'personas a quienes se predicó'), icon: 'speech' },
  { k: 'mean',   kind: 'sum', name: L('Meaningful Preaching', 'Predicación Significativa'), short: L('Meaningful', 'Significativa'), desc: L('people who came to study', 'personas que vinieron a estudiar'), icon: 'speechHeart' },
  { k: 'att',    kind: 'avg', name: L('Attendance', 'Asistencia'), short: L('Attendance', 'Asistencia'), desc: L('people attending (monthly avg.)', 'personas que asisten (prom. mensual)'), icon: 'calendar' },
  { k: 'tithe',  kind: 'avg', name: L('Tithe', 'Diezmo'), short: L('Tithe', 'Diezmo'), desc: L('people tithing (monthly avg.)', 'personas que diezman (prom. mensual)'), icon: 'coin' },
  { k: 'fruit',  kind: 'sum', name: L('Fruit', 'Fruto'), short: L('Fruit', 'Fruto'), desc: L('souls baptized', 'almas bautizadas'), icon: 'fruit' },
];
const metric = k => METRICS().find(m => m.k === k);
const monthLabel = k => { const [y, m] = k.split('-'); return `${MONTH_NAMES[LANG][+m - 1]} ${y}`; };
const monthsToDate = () => { const [y, m] = CURRENT_MONTH.split('-').map(Number); return Array.from({ length: m }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`); };
let PERIOD = 'month';
function periodMonths() {
  const all = monthsToDate();
  if (PERIOD === 'month') return [CURRENT_MONTH];
  if (PERIOD === 'quarter') { const m = +CURRENT_MONTH.slice(5), qs = Math.floor((m - 1) / 3) * 3 + 1; return all.filter(k => +k.slice(5) >= qs); }
  return all;
}
const periodLabel = () => {
  const m = +CURRENT_MONTH.slice(5), y = CURRENT_MONTH.slice(0, 4);
  if (PERIOD === 'month') return monthLabel(CURRENT_MONTH);
  if (PERIOD === 'quarter') return `${L('Q', 'T')}${Math.floor((m - 1) / 3) + 1} ${y} · ${L('to date', 'a la fecha')}`;
  return `${y} · ${L('year to date', 'año a la fecha')}`;
};

/* =====================================================================
   STATE & SERVER
   ===================================================================== */
const S = { branches: {}, teams: {}, members: {} };
let USER = null, SCREEN = 'loading', LIVE = false, USERS = [];
const isAdmin = () => USER && USER.role === 'admin';

async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'X-Lang': LANG, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && SCREEN === 'app') { USER = null; SCREEN = 'login'; stopLive(); render(); }
  if (!res.ok) throw Object.assign(new Error(data.error || L('Couldn’t reach the server.', 'No se pudo conectar con el servidor.')), { status: res.status });
  return data;
}

const sorted = (col, key) => Object.entries(S[col]).map(([id, d]) => ({ id, ...d })).sort((a, b) => (a[key] ?? 0) > (b[key] ?? 0) ? 1 : (a[key] ?? 0) < (b[key] ?? 0) ? -1 : String(a.name).localeCompare(String(b.name)));
const BRANCHES = () => sorted('branches', 'order');
const TEAMS = () => sorted('teams', 'num');
const teamMembers = tid => Object.entries(S.members).map(([id, d]) => ({ id, ...d })).filter(m => m.teamId === tid).sort((a, b) => a.name.localeCompare(b.name));
const teamsBranch = () => BRANCHES().find(b => b.hasTeams);

function deepMerge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    if (v === null) delete out[k];
    else out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

// Change one record. The screen updates right away; the server confirms or the change is undone.
async function save(col, id, data, op = 'update') {
  const before = S[col][id];
  if (op === 'delete') delete S[col][id];
  else S[col][id] = op === 'set' ? data : deepMerge(S[col][id], data);
  render();
  try {
    const out = await api('POST', `/api/docs/${col}/${encodeURIComponent(id)}`, { op, data: op === 'delete' ? undefined : data });
    if (op !== 'delete' && out.data) { S[col][id] = out.data; render(); }
    return true;
  } catch (e) {
    if (before === undefined) delete S[col][id]; else S[col][id] = before;
    render(); toast(e.message);
    return false;
  }
}

async function loadData() {
  const d = await api('GET', '/api/data');
  S.branches = d.branches; S.teams = d.teams; S.members = d.members;
}
let ES = null;
function startLive() {
  stopLive();
  ES = new EventSource('/api/events');
  ES.onopen = () => { if (!LIVE) { LIVE = true; render(); } };
  ES.onerror = () => { if (LIVE) { LIVE = false; render(); } };
  ES.addEventListener('doc', ev => {
    const { col, id, data } = JSON.parse(ev.data);
    if (!S[col]) return;
    if (data === null) delete S[col][id]; else S[col][id] = data;
    render();
  });
  ES.addEventListener('reload', async () => {
    try { USER = (await api('GET', '/api/me')).user; await loadData(); render(); } catch (e) {}
  });
}
function stopLive() { if (ES) { ES.close(); ES = null; } LIVE = false; }

/* Branch & team math */
function teamFruit(t, months) { return months.reduce((a, m) => a + ((t.fruit || {})[m] || 0), 0); }
function branchVal(b, k) {
  const ms = periodMonths();
  if (k === 'fruit' && b.hasTeams) return TEAMS().reduce((a, t) => a + teamFruit(t, ms), 0);
  const vals = ms.map(m => (b.months || {})[m]?.[k]).filter(v => typeof v === 'number');
  if (metric(k).kind === 'avg') return vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : 0;
  return vals.reduce((a, v) => a + v, 0);
}
function branchGoal(b, k, period = PERIOD) {
  const g = +(b.goals || {})[k] || 0;
  if (metric(k).kind === 'avg') return g;
  return period === 'month' ? Math.ceil(g / 12) : period === 'quarter' ? Math.ceil(g / 4) : g;
}
const ratio = (c, g) => g ? Math.min(1, c / g) : 0;
const branchPct = b => Math.round(METRICS().reduce((a, m) => a + ratio(branchVal(b, m.k), branchGoal(b, m.k)), 0) / 5 * 100);
const regionVal = k => BRANCHES().reduce((a, b) => a + branchVal(b, k), 0);
const regionGoal = k => BRANCHES().reduce((a, b) => a + branchGoal(b, k), 0);
const regionPct = () => { const bs = BRANCHES(); return bs.length ? Math.round(bs.reduce((a, b) => a + branchPct(b), 0) / bs.length) : 0; };
const barCls = r => r >= .8 ? '' : r >= .55 ? 'warn' : 'bad';
const bar = r => `<div class="bar ${barCls(r)}"><b style="width:${Math.round(Math.min(1, r) * 100)}%"></b></div>`;
const fmt = n => (+n || 0).toLocaleString(LANG === 'es' ? 'es-DO' : 'en-US');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const goalTarget = (t, g) => g.k === 'att' ? (t?.attTarget || 4) : g.target;
const mval = (m, k, month) => ((m.months || {})[month] || {})[k] || 0;
const mstatus = (m, t, g, month) => { const v = mval(m, g.k, month), tg = goalTarget(t, g); return v >= tg ? 'd' : v > 0 ? 'p' : 'm'; };
const mdone = (m, t, month) => GOALS().filter(g => mstatus(m, t, g, month) === 'd').length;
const teamHealth = (t, month = CURRENT_MONTH) => { const ms = teamMembers(t.id); return ms.length ? Math.round(ms.reduce((a, m) => a + mdone(m, t, month), 0) / (ms.length * 7) * 100) : 0; };
const teamName = t => t.name || `${L('Team', 'Equipo')} ${t.num}`;
const initials = n => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
const first = n => String(n || '').split(' ')[0];
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* =====================================================================
   UI STATE
   ===================================================================== */
let VIEW = 'region', VIEW_TEAM = null, TEAM_MONTH = CURRENT_MONTH;
let SHEET = null;
let REPORT = { branch: null, month: CURRENT_MONTH, draft: {} };
let CONFIRM = null, BUSY = false, AUTH_ERR = '';
function readHash() {
  const h = location.hash.replace('#', '');
  if (h.startsWith('team-')) { VIEW = 'team'; VIEW_TEAM = h.slice(5); }
  else if (['region', 'report', 'teams', 'settings'].includes(h)) VIEW = h;
  else if (isAdmin()) VIEW = 'region';
  else { VIEW = 'team'; VIEW_TEAM = USER?.teamId; }
  if (!isAdmin()) {
    if (VIEW === 'report' || VIEW === 'teams') VIEW = 'team';
    if (VIEW === 'team') VIEW_TEAM = USER?.teamId;
  }
}
let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}
const field = (id, label, attrs = '') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" ${attrs}></div>`;
const val = id => (document.getElementById(id)?.value ?? '').trim();

/* =====================================================================
   SIGN-IN & SETUP
   ===================================================================== */
const langSeg = () => `<div class="seg"><button type="button" class="${LANG === 'es' ? 'on' : ''}" data-act="lang" data-l="es">ES</button><button type="button" class="${LANG === 'en' ? 'on' : ''}" data-act="lang" data-l="en">EN</button></div>`;
let PIN = '';
const pinAttrs = (len) => `type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="${len}"`;
function screenSetup() {
  return `<div class="auth"><form class="card" data-form="setup">
    <div class="row" style="justify-content:space-between"><div class="brandmark">${icon('bible', 28)}Church Status</div>${langSeg()}</div>
    <h1>${L('Welcome! Let’s set things up', '¡Bienvenido! Vamos a configurar')}</h1>
    <p class="small" style="margin:0">${L('Create the Jefe de Templo account. This person has full access and gives each team leader a PIN.', 'Crea la cuenta del Jefe de Templo. Esta persona tiene acceso completo y le da un PIN a cada líder de equipo.')}</p>
    ${field('su-name', L('Full name', 'Nombre completo'), 'autocomplete="name" required maxlength="120"')}
    ${field('su-pin', L('Choose a 6-digit PIN', 'Elige un PIN de 6 dígitos'), pinAttrs(6) + ' required minlength="6"')}
    ${field('su-pin2', L('Type the PIN again', 'Escribe el PIN otra vez'), pinAttrs(6) + ' required minlength="6"')}
    <label class="check"><input type="checkbox" id="su-example"><span>${L('Start with example data, to try the app first. Example team leaders sign in with PINs 1111, 2222, 3333, 4444 and 5555.', 'Empezar con datos de ejemplo, para probar la app primero. Los líderes de ejemplo entran con los PIN 1111, 2222, 3333, 4444 y 5555.')}</span></label>
    <div class="err" role="alert">${esc(AUTH_ERR)}</div>
    <button class="btn" type="submit" ${BUSY ? 'disabled' : ''}>${L('Create account and start', 'Crear cuenta y comenzar')}</button>
  </form></div>`;
}
function screenLogin() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  return `<div class="auth"><form class="card pinpad" data-form="login">
    <div class="row" style="justify-content:space-between"><div class="brandmark">${icon('bible', 28)}Church Status</div>${langSeg()}</div>
    <h1>${L('Enter your PIN', 'Escribe tu PIN')}</h1>
    <p class="small" style="margin:0">${L('For the Jefe de Templo and Santiago team leaders.', 'Para el Jefe de Templo y los líderes de equipo de Santiago.')}</p>
    <label class="sr" for="li-pin">PIN</label>
    <input id="li-pin" class="pin-input" ${pinAttrs(8)} value="${esc(PIN)}" placeholder="••••" aria-describedby="li-err">
    <div class="err" id="li-err" role="alert">${esc(AUTH_ERR)}</div>
    <div class="keys">${keys.map(k => k === 'del'
      ? `<button type="button" data-act="pinDel" aria-label="${L('Delete', 'Borrar')}">⌫</button>`
      : k === 'ok'
        ? `<button type="submit" class="ok" ${BUSY || PIN.length < 4 ? 'disabled' : ''}>${L('Enter', 'Entrar')}</button>`
        : `<button type="button" data-act="pinKey" data-k="${k}">${k}</button>`).join('')}</div>
    <p class="small" style="margin:0;text-align:center">${L('Forgot your PIN? Ask the Jefe de Templo for a new one.', '¿Olvidaste tu PIN? Pide uno nuevo al Jefe de Templo.')}</p>
  </form></div>`;
}

/* =====================================================================
   VIEWS
   ===================================================================== */
const periodSeg = () => `<div class="seg" role="group" aria-label="${L('Period', 'Periodo')}">${[['month', L('Monthly', 'Mensual')], ['quarter', L('Quarterly', 'Trimestral')], ['year', L('Yearly', 'Anual')]]
  .map(([k, t]) => `<button class="${PERIOD === k ? 'on' : ''}" data-act="period" data-p="${k}">${t}</button>`).join('')}</div>`;

function topBar() {
  const tabs = isAdmin()
    ? [['region', 'pin', L('Region', 'Región')], ['report', 'pencil', L('Monthly report', 'Reporte mensual')], ['teams', 'people', L('Teams', 'Equipos')], ['settings', 'gear', L('Settings', 'Ajustes')]]
    : [['team', 'people', L('My team', 'Mi equipo')], ['region', 'pin', L('Region', 'Región')]];
  const cur = VIEW === 'team' ? (isAdmin() ? 'teams' : 'team') : VIEW;
  return `<header class="top"><div class="wrap">
    <div class="brand">${icon('bible', 26)}<div>Church Status<small>${L('Santiago Region', 'Región Santiago')}</small></div></div>
    <nav class="tabs">${tabs.map(([h, ic, t]) => `<a href="#${h}" class="${cur === h ? 'on' : ''}">${icon(ic, 16)}${t}</a>`).join('')}</nav>
    <div class="right">
      <span class="live ${LIVE ? '' : 'off'}" title="${LIVE ? L('Changes appear live', 'Los cambios aparecen en vivo') : L('Reconnecting…', 'Reconectando…')}"><i></i>${LIVE ? L('Live', 'En vivo') : L('Reconnecting', 'Reconectando')}</span>
      ${langSeg()}
      <div class="usermenu"><div class="who-me">${esc(USER.name)}<small>${isAdmin() ? L('Jefe de Templo', 'Jefe de Templo') : L('Team leader', 'Líder de equipo')}</small></div>
        <button class="btn ghost sm" data-act="passwordOpen">${L('Change PIN', 'Cambiar PIN')}</button>
        <button class="btn ghost sm" data-act="logout">${L('Sign out', 'Salir')}</button></div>
    </div>
  </div></header>`;
}

function viewRegion() {
  const rp = regionPct(), bs = BRANCHES(), tb = teamsBranch();
  return `
  <div class="head"><div class="grow"><h1>${L('Santiago Region', 'Región Santiago')}</h1><p>${L('General Assembly goals', 'Metas de Asamblea General')} · ${bs.length} ${L('branches', 'sucursales')} · ${periodLabel()}</p></div>
    ${periodSeg()}
    ${isAdmin() ? `<a class="btn" href="#report">${icon('pencil', 16)}${L('Enter monthly report', 'Ingresar reporte mensual')}</a>` : `<span class="tag info">${L('View only', 'Solo lectura')}</span>`}
  </div>
  <div class="grid kpis">
    ${METRICS().map(m => { const c = regionVal(m.k), g = regionGoal(m.k); return `<div class="card kpi">
      <div class="row"><div class="ic">${icon(m.icon, 22)}</div><div class="grow"><div class="lbl">${m.name}</div><div class="small">${m.desc}</div></div></div>
      <div class="v">${fmt(c)} <small>/ ${fmt(g)}</small></div>${bar(ratio(c, g))}<div class="small" style="margin-top:6px">${g ? `${Math.round(ratio(c, g) * 100)}% ${L('of goal', 'de la meta')}` : L('No goal set yet', 'Sin meta todavía')}</div></div>`; }).join('')}
  </div>
  <div class="grid split">
    <div class="card">
      <div class="h">${L('Branch progress', 'Progreso por sucursal')}</div>
      <div class="small" style="margin-bottom:8px">${isAdmin() ? L('Click a branch to enter its monthly report.', 'Haz clic en una sucursal para ingresar su reporte mensual.') : L('Updated by the Jefe de Templo.', 'Actualizado por el Jefe de Templo.')}</div>
      <div class="tablewrap"><table>
        <thead><tr><th>${L('Branch', 'Sucursal')}</th>${METRICS().map(m => `<th class="c"><div class="thi">${icon(m.icon, 18)}${m.short}</div></th>`).join('')}<th class="c">${L('Overall', 'Total')}</th></tr></thead>
        <tbody>
          ${bs.map(b => { const p = branchPct(b); return `<tr class="${isAdmin() ? 'click' : ''}" ${isAdmin() ? `data-act="openReport" data-b="${esc(b.id)}" tabindex="0"` : ''}>
            <td><div class="who">${plant(pctStage(p), 28, p < 45)}<div><b>${esc(b.name)}</b><div class="small">${b.hasTeams ? `${TEAMS().length} ${L('teams report here', 'equipos reportan aquí')}` : L('Monthly report', 'Reporte mensual')}</div></div></div></td>
            ${METRICS().map(m => { const c = branchVal(b, m.k), g = branchGoal(b, m.k); return `<td><div class="mcell"><div class="nums">${fmt(c)}<span>/ ${fmt(g)}</span></div>${bar(ratio(c, g))}</div></td>`; }).join('')}
            <td class="c"><span class="tag ${p >= 80 ? 'ok' : p >= 55 ? 'warn' : 'bad'}">${p}%</span></td></tr>`; }).join('')}
          <tr><td><b>${L('Region total', 'Total región')}</b></td>${METRICS().map(m => `<td><div class="mcell"><div class="nums">${fmt(regionVal(m.k))}<span>/ ${fmt(regionGoal(m.k))}</span></div></div></td>`).join('')}<td class="c"><span class="tag ${rp >= 80 ? 'ok' : rp >= 55 ? 'warn' : 'bad'}">${rp}%</span></td></tr>
        </tbody>
      </table></div>
      <div class="legend"><span><i style="background:var(--ok)"></i>${L('On track (80%+)', 'En camino (80%+)')}</span><span><i style="background:var(--warn-bar)"></i>55–79%</span><span><i style="background:var(--bad)"></i>${L('Below 55%', 'Menos de 55%')}</span>${tb ? `<span>${L(`${esc(tb.name)}’s fruit comes from its teams.`, `El fruto de ${esc(tb.name)} viene de sus equipos.`)}</span>` : ''}</div>
    </div>
    <div class="grid">
      <div class="card hero">
        <div class="lbl">${L('Region health', 'Salud de la región')}</div>
        <div class="row" style="margin-top:10px;gap:14px"><div class="plantbox">${plant(pctStage(rp), 70)}</div><div class="grow"><div style="font-size:34px;font-weight:700;color:var(--gold)">${rp}%</div>${bar(rp / 100)}<div class="small" style="color:var(--hero-muted);margin-top:6px">${healthWord(rp)}</div></div></div>
        <p class="verse">${L('“The harvest is plentiful but the workers are few.”', '“La mies a la verdad es mucha, mas los obreros pocos.”')}<cite>${L('MATTHEW 9:37', 'MATEO 9:37')}</cite></p>
      </div>
      <div class="card"><div class="lbl">${L('Santiago garden', 'Jardín de Santiago')}</div>
        <div class="garden">${bs.map(b => { const p = branchPct(b); return `<div class="g">${plant(pctStage(p), 44, p < 45)}<span>${esc(b.name)}</span><span class="muted">${p}%</span></div>`; }).join('')}</div>
      </div>
    </div>
  </div>`;
}

function teamFruitMonth(m) { return TEAMS().reduce((a, t) => a + ((t.fruit || {})[m] || 0), 0); }
function monthVal(b, k, m) { if (k === 'fruit' && b.hasTeams) return teamFruitMonth(m); return +((b.months || {})[m] || {})[k] || 0; }
function viewReport() {
  const bs = BRANCHES();
  if (!bs.length) return `<div class="card empty"><div class="h">${L('No branches yet', 'Aún no hay sucursales')}</div><a class="btn" href="#settings">${L('Add branches in Settings', 'Agrega sucursales en Ajustes')}</a></div>`;
  const b = bs.find(x => x.id === REPORT.branch) || bs.find(x => !x.hasTeams) || bs[0];
  REPORT.branch = b.id;
  const m = REPORT.month, cur = (b.months || {})[m] || {}, d = REPORT.draft;
  const v = k => d[`v-${k}`] ?? (cur[k] ?? '');
  const gv = k => d[`g-${k}`] ?? ((b.goals || {})[k] ?? '');
  const months = Array.from({ length: 18 }, (_, i) => shiftMonth(CURRENT_MONTH, -i));
  return `
  <div class="head"><div class="grow"><h1>${L('Monthly report', 'Reporte mensual')}</h1><p>${L('Enter each branch’s numbers once a month. Everyone’s dashboard updates right away.', 'Ingresa los números de cada sucursal una vez al mes. El panel de todos se actualiza de inmediato.')}</p></div></div>
  <div class="grid split">
    <div class="card">
      <div class="lbl" style="margin-bottom:8px">${L('Branch', 'Sucursal')}</div>
      <div class="chips">${bs.map(x => `<button class="chip ${x.id === b.id ? 'on' : ''}" data-act="pickBranch" data-b="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>
      <div class="row" style="margin:16px 0 4px;flex-wrap:wrap">
        <label class="lbl" for="rep-month">${L('Month', 'Mes')}</label>
        <select id="rep-month" class="sel" data-act="repMonth">${months.map(k => `<option value="${k}" ${k === m ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}</select>
      </div>
      <div class="formrow headrow"><span></span><span></span><span class="lbl" style="text-align:center">${monthLabel(m).split(' ')[0]}</span><span class="lbl" style="text-align:center">${L('Goal', 'Meta')}</span></div>
      ${METRICS().map(x => {
        const fromTeams = x.k === 'fruit' && b.hasTeams;
        return `<div class="formrow">${icon(x.icon, 22)}<div><div style="font-weight:500">${x.name}</div><div class="small">${x.desc}${fromTeams ? ` · ${L('comes from the teams', 'viene de los equipos')}` : ''}</div></div>
          ${fromTeams ? `<div class="input num" style="background:var(--inset)">${teamFruitMonth(m)}</div>` : `<input class="input num" id="v-${x.k}" type="number" min="0" inputmode="numeric" value="${esc(v(x.k))}" data-act="draft" aria-label="${x.name}">`}
          <div><input class="input num" id="g-${x.k}" type="number" min="0" inputmode="numeric" value="${esc(gv(x.k))}" data-act="draft" aria-label="${L('Goal', 'Meta')} ${x.name}"><div class="small" style="text-align:center">${x.kind === 'avg' ? L('per month', 'por mes') : L('per year', 'por año')}</div></div></div>`;
      }).join('')}
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" data-act="resetDraft">${L('Undo changes', 'Deshacer cambios')}</button><button class="btn" data-act="saveReport">${icon('check', 14)}${L('Save report', 'Guardar reporte')}</button></div>
    </div>
    <div class="card">
      <div class="lbl">${esc(b.name)} · ${monthLabel(m)}</div>
      ${METRICS().map(x => { const c = monthVal(b, x.k, m), g = branchGoal(b, x.k, 'month'); return `<div class="list-row">${icon(x.icon, 18)}<div class="grow"><div class="row" style="justify-content:space-between"><span>${x.name}</span><b class="num">${fmt(c)} / ${fmt(g)}</b></div><div style="margin-top:6px">${bar(ratio(c, g))}</div></div></div>`; }).join('')}
      <p class="small" style="margin:12px 0 0">${L('Attendance and tithe goals are people per month. Preaching and fruit goals are for the whole year; the monthly goal is one twelfth.', 'Las metas de asistencia y diezmo son personas por mes. Las de predicación y fruto son anuales; la meta mensual es una doceava parte.')}</p>
    </div>
  </div>`;
}

function viewTeams() {
  const ts = TEAMS(), tb = teamsBranch() || { goals: {} };
  const yr = monthsToDate();
  const assigned = ts.reduce((a, t) => a + (+t.fruitGoal || 0), 0), branchFruitGoal = +(tb.goals || {}).fruit || 0;
  const fruitYear = ts.reduce((a, t) => a + teamFruit(t, yr), 0);
  const members = ts.reduce((a, t) => a + teamMembers(t.id).length, 0);
  const leaders = tid => USERS.filter(u => u.teamId === tid);
  return `
  <div class="head"><div class="grow"><h1>${L('Teams', 'Equipos')}${tb.name ? ` · ${esc(tb.name)}` : ''}</h1><p>${ts.length} ${L('teams', 'equipos')} · ${members} ${L('members', 'miembros')} · ${monthLabel(CURRENT_MONTH)}</p></div>
    <button class="btn" data-act="addTeamOpen">${icon('people', 16)}${L('Add team', 'Agregar equipo')}</button></div>
  ${ts.length ? `<div class="grid split">
    <div class="card">
      <div class="h">${L('Teams', 'Equipos')}</div>
      <div class="small" style="margin-bottom:8px">${L('Each team leader signs in to update their own members. Open a team to see what they see.', 'Cada líder de equipo entra para actualizar a sus miembros. Abre un equipo para ver lo que ellos ven.')}</div>
      <div class="tablewrap"><table>
        <thead><tr><th>${L('Team', 'Equipo')}</th><th>${L('Leader', 'Líder')}</th><th class="c">${L('Members', 'Miembros')}</th><th>${L('7 goals this month', '7 metas este mes')}</th><th>${L('Fruit this year', 'Fruto este año')}</th><th></th></tr></thead>
        <tbody>${ts.map(t => { const h = teamHealth(t), f = teamFruit(t, yr), g = +t.fruitGoal || 0, ls = leaders(t.id); return `<tr class="click" data-act="openTeam" data-t="${esc(t.id)}" tabindex="0">
          <td><div class="who">${plant(pctStage(h), 28, h < 50)}<div><b>${esc(teamName(t))}</b><div class="small">${L('Team', 'Equipo')} ${t.num}</div></div></div></td>
          <td>${esc(t.leader)}<div class="small">${ls.length ? L('Has a PIN', 'Tiene PIN') : `<span style="color:var(--warn)">${L('No PIN yet', 'Sin PIN aún')}</span>`}</div></td><td class="c num">${teamMembers(t.id).length}</td>
          <td><div class="mcell"><div class="nums">${h}%<span></span></div>${bar(h / 100)}</div></td>
          <td><div class="mcell"><div class="nums">${f}<span>/ ${g}</span></div>${bar(ratio(f, g))}</div></td>
          <td><span class="btn ghost sm">${L('Open', 'Abrir')}</span></td></tr>`; }).join('')}
          <tr><td><b>${L('Total', 'Total')}</b></td><td></td><td class="c num"><b>${members}</b></td><td></td><td><div class="mcell"><div class="nums">${fruitYear}<span>/ ${branchFruitGoal}</span></div></div></td><td></td></tr>
        </tbody></table></div>
    </div>
    <div class="card">
      <div class="lbl">${L('Split the yearly fruit goal', 'Repartir la meta anual de fruto')}</div>
      <div class="row" style="justify-content:space-between;margin:10px 0"><span>${L('Branch fruit goal', 'Meta de fruto de la sucursal')}</span><b class="num">${branchFruitGoal}</b></div>
      ${ts.map(t => `<div class="list-row"><span class="grow">${esc(teamName(t))}</span><input class="input num" style="width:80px" type="number" min="0" id="fg-${esc(t.id)}" value="${+t.fruitGoal || 0}" data-act="fruitGoal" data-t="${esc(t.id)}" aria-label="${L('Fruit goal', 'Meta de fruto')} ${esc(teamName(t))}"></div>`).join('')}
      <div style="margin-top:12px"><span class="tag ${assigned === branchFruitGoal ? 'ok' : 'warn'}">${L(`Assigned ${assigned} of ${branchFruitGoal}`, `Asignado ${assigned} de ${branchFruitGoal}`)}</span></div>
    </div>
  </div>` : `<div class="card empty">${plant(1, 60)}<div class="h">${L('No teams yet', 'Aún no hay equipos')}</div><div class="small">${L('Add the first team and create its leader’s login.', 'Agrega el primer equipo y crea el usuario de su líder.')}</div></div>`}`;
}

function viewTeam() {
  const t = S.teams[VIEW_TEAM] ? { id: VIEW_TEAM, ...S.teams[VIEW_TEAM] } : null;
  if (!t) {
    if (!isAdmin()) return `<div class="card empty">${plant(0, 60)}<div class="h">${L('Your account isn’t linked to a team yet', 'Tu cuenta aún no está vinculada a un equipo')}</div><div class="small">${L('Ask the Jefe de Templo to link it. Meanwhile you can see the region results.', 'Pide al Jefe de Templo que la vincule. Mientras tanto puedes ver los resultados de la región.')}</div><a class="btn" href="#region">${L('See region', 'Ver región')}</a></div>`;
    return `<div class="card empty"><div class="h">${L('That team no longer exists', 'Ese equipo ya no existe')}</div><a class="btn" href="#teams">${L('All teams', 'Todos los equipos')}</a></div>`;
  }
  const mo = TEAM_MONTH, ms = teamMembers(t.id), h = teamHealth(t, mo), yr = monthsToDate();
  const fYear = teamFruit(t, yr), fMonth = (t.fruit || {})[mo] || 0, fg = +t.fruitGoal || 0;
  const complete = ms.filter(m => mdone(m, t, mo) === 7).length;
  const follow = ms.filter(m => mdone(m, t, mo) <= 3);
  return `
  <div class="head"><div class="grow">
      ${isAdmin() ? `<a href="#teams" class="small" style="color:var(--accent);text-decoration:none">‹ ${L('All teams', 'Todos los equipos')}</a>` : ''}
      <h1>${esc(teamName(t))}</h1><p>${L('Team', 'Equipo')} ${t.num} · ${L('Leader', 'Líder')}: ${esc(t.leader)}</p></div>
    <div class="monthnav"><button data-act="monthPrev" aria-label="${L('Previous month', 'Mes anterior')}">‹</button><span>${monthLabel(mo)}</span><button data-act="monthNext" aria-label="${L('Next month', 'Mes siguiente')}" ${mo >= CURRENT_MONTH ? 'disabled' : ''}>›</button></div>
    <button class="btn ghost" data-act="teamSettings">${icon('gear', 16)}${L('Team settings', 'Ajustes del equipo')}</button>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="row"><div class="plantbox" style="padding:4px 8px 2px">${plant(pctStage(h), 34, h < 45)}</div><div><div class="lbl">${L('Team health', 'Salud del equipo')}</div><div class="v" style="margin:4px 0 0">${h}%</div></div></div></div>
    <div class="card kpi"><div class="row"><div class="ic">${icon('star', 22)}</div><div><div class="lbl">${L('All 7 reached', 'Las 7 logradas')}</div><div class="v" style="margin:4px 0 0">${complete} <small>/ ${ms.length}</small></div></div></div></div>
    <div class="card kpi"><div class="row"><div class="ic">${icon('hands', 22)}</div><div class="grow"><div class="lbl">${L('Need follow-up', 'Necesitan seguimiento')}</div><div class="v" style="margin:4px 0 0">${follow.length}</div></div></div><div class="small">${follow.map(m => esc(first(m.name))).join(', ') || L('Nobody right now', 'Nadie por ahora')}</div></div>
    <div class="card kpi"><div class="row"><div class="ic">${icon('fruit', 22)}</div><div class="grow"><div class="lbl">${L('Fruit this year', 'Fruto este año')}</div><div class="v" style="margin:4px 0 0">${fYear} <small>/ ${fg}</small></div></div></div>
      <div class="row" style="justify-content:space-between"><span class="small">${monthLabel(mo).split(' ')[0]}: <b>${fMonth}</b></span><div class="stepper" style="gap:6px"><button data-act="fruitDec" aria-label="−" style="width:30px;height:30px">−</button><button class="plus" data-act="fruitInc" aria-label="+" style="width:30px;height:30px">+</button></div></div></div>
  </div>
  <div class="card">
    <div class="row" style="flex-wrap:wrap;margin-bottom:6px"><div class="grow" style="min-width:min(260px,100%)"><div class="h">${L('Members · 7 monthly goals', 'Miembros · 7 metas mensuales')}</div><div class="small">${L('Tap any box to update it. Tap a name to edit the member’s profile.', 'Toca una casilla para actualizarla. Toca un nombre para editar el perfil.')}</div></div>
      <form class="row" data-form="addMember" style="gap:8px;flex:1 1 260px;max-width:380px"><input class="input" id="new-member" placeholder="${L('New member name', 'Nombre del nuevo miembro')}" autocomplete="off" aria-label="${L('New member name', 'Nombre del nuevo miembro')}" maxlength="120"><button class="btn" type="submit">${L('Add', 'Agregar')}</button></form></div>
    <div class="tablewrap"><table>
      <thead><tr><th>${L('Member', 'Miembro')}</th>${GOALS().map(g => `<th class="c"><div class="thi">${icon(g.icon, 18)}${g.short}${goalTarget(t, g) > 1 ? ` ${goalTarget(t, g)}x` : ''}</div></th>`).join('')}<th class="c">${L('Total', 'Total')}</th></tr></thead>
      <tbody>${ms.map(m => { const c = mdone(m, t, mo); return `<tr>
        <td><button class="who" data-act="memberOpen" data-m="${esc(m.id)}" style="border:0;background:transparent;padding:0;text-align:left">${plant(cntStage(c), 24, c <= 3)}<b>${esc(m.name)}</b></button></td>
        ${GOALS().map(g => { const s = mstatus(m, t, g, mo), v = mval(m, g.k, mo), tg = goalTarget(t, g); return `<td><button class="cell ${s}" data-act="goalOpen" data-m="${esc(m.id)}" data-k="${g.k}" aria-label="${esc(m.name)} · ${g.name}">${s === 'd' ? icon('check', 14).replace('#fff', 'currentColor') : tg > 1 ? `${v}/${tg}` : '—'}</button></td>`; }).join('')}
        <td class="c"><span class="tag ${c === 7 ? 'ok' : c >= 5 ? 'warn' : 'bad'}">${c}/7</span></td></tr>`; }).join('') || `<tr><td colspan="9" class="muted" style="padding:20px 8px">${L('No members yet. Add the first one above.', 'Aún no hay miembros. Agrega el primero arriba.')}</td></tr>`}</tbody>
    </table></div>
    <div class="legend"><span><i style="background:var(--ok)"></i>${L('Done', 'Hecho')}</span><span><i style="background:var(--warn-bar)"></i>${L('In progress', 'En progreso')}</span><span><i style="background:var(--bad-soft);border:1px dashed var(--bad)"></i>${L('Missing', 'Falta')}</span></div>
  </div>`;
}

function viewSettings() {
  const bs = BRANCHES(), ts = TEAMS();
  const teamOpt = sel => `<option value="">${L('No team', 'Sin equipo')}</option>` + ts.map(t => `<option value="${esc(t.id)}" ${sel === t.id ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('');
  return `
  <div class="head"><div class="grow"><h1>${L('Settings', 'Ajustes')}</h1><p>${L('Logins, branches and backups.', 'Usuarios, sucursales y copias de seguridad.')}</p></div></div>
  <div class="card">
    <div class="row" style="flex-wrap:wrap"><div class="grow"><div class="h">${L('Who can sign in', 'Quién puede entrar')}</div><div class="small">${L('Each person signs in with their own PIN. Members don’t sign in.', 'Cada persona entra con su propio PIN. Los miembros no entran.')}</div></div>
      <button class="btn" data-act="userAddOpen">${icon('people', 16)}${L('Add person', 'Agregar persona')}</button></div>
    <div class="tablewrap" style="margin-top:8px"><table>
      <thead><tr><th>${L('Name', 'Nombre')}</th><th>${L('Role', 'Rol')}</th><th>${L('Team', 'Equipo')}</th><th></th></tr></thead>
      <tbody>${USERS.map(u => `<tr><td><b>${esc(u.name)}</b>${u.id === USER.id ? ` <span class="tag info">${L('You', 'Tú')}</span>` : ''}</td>
        <td>${u.role === 'admin' ? L('Jefe de Templo', 'Jefe de Templo') : L('Team leader', 'Líder de equipo')}</td>
        <td>${u.role === 'admin' ? '—' : u.teamId && S.teams[u.teamId] ? esc(teamName({ id: u.teamId, ...S.teams[u.teamId] })) : `<span style="color:var(--warn)">${L('Not linked', 'Sin vincular')}</span>`}</td>
        <td style="text-align:right"><button class="btn ghost sm" data-act="userEditOpen" data-u="${esc(u.id)}">${L('Edit or new PIN', 'Editar o nuevo PIN')}</button></td></tr>`).join('')}</tbody>
    </table></div>
  </div>
  <div class="settings-grid">
    <div class="card">
      <div class="h">${L('Branches', 'Sucursales')}</div>
      <div class="small" style="margin-bottom:6px">${L('The branch marked “Teams” reports through its teams; the others get a monthly report.', 'La sucursal marcada “Equipos” reporta a través de sus equipos; las demás con un reporte mensual.')}</div>
      ${bs.map(b => `<div class="list-row"><input class="input" id="bn-${esc(b.id)}" value="${esc(b.name)}" data-act="branchName" data-b="${esc(b.id)}" aria-label="${L('Branch name', 'Nombre de la sucursal')}" maxlength="120">
        <label class="check" style="white-space:nowrap"><input type="radio" name="teamsBranch" data-act="teamsBranch" data-b="${esc(b.id)}" ${b.hasTeams ? 'checked' : ''}>${L('Teams', 'Equipos')}</label>
        <button class="btn ${CONFIRM === 'b-' + b.id ? 'danger' : 'ghost'} sm" data-act="branchDelete" data-b="${esc(b.id)}">${CONFIRM === 'b-' + b.id ? L('Tap again', 'Toca otra vez') : L('Remove', 'Quitar')}</button></div>`).join('')}
      <form class="inline-form" data-form="addBranch" style="margin-top:10px"><input class="input" id="new-branch" placeholder="${L('New branch name', 'Nombre de la nueva sucursal')}" aria-label="${L('New branch name', 'Nombre de la nueva sucursal')}" maxlength="120"><button class="btn" type="submit">${L('Add branch', 'Agregar sucursal')}</button></form>
    </div>
    <div class="card">
      <div class="h">${L('Backup', 'Copia de seguridad')}</div>
      <p class="small">${L('Download a copy of all reports, teams and members. Keep it somewhere safe. Logins are not included.', 'Descarga una copia de todos los reportes, equipos y miembros. Guárdala en un lugar seguro. Los usuarios no se incluyen.')}</p>
      <a class="btn ghost" href="/api/export" download>${L('Download backup', 'Descargar copia')}</a>
      <p class="small" style="margin-top:16px">${L('Restore replaces everything with the contents of a backup file.', 'Restaurar reemplaza todo con el contenido de una copia.')}</p>
      <label class="btn ghost" for="restore-file" style="cursor:pointer">${L('Restore from a backup…', 'Restaurar desde una copia…')}</label>
      <input type="file" id="restore-file" accept="application/json,.json" data-act="restore" hidden>
    </div>
  </div>`;
}

function sheet() {
  if (!SHEET) return '';
  const close = `<button class="x" type="button" data-act="close" aria-label="${L('Close', 'Cerrar')}">×</button>`;
  let body = '';
  if (SHEET.type === 'goal') {
    const m = S.members[SHEET.m] ? { id: SHEET.m, ...S.members[SHEET.m] } : null; if (!m) return '';
    const t = { id: m.teamId, ...S.teams[m.teamId] }, g = GOALS().find(x => x.k === SHEET.k), v = mval(m, g.k, TEAM_MONTH), tg = goalTarget(t, g);
    body = `<div class="row"><div class="ic">${icon(g.icon, 22)}</div><div class="grow"><div class="h">${g.name}</div><div class="small">${esc(m.name)} · ${monthLabel(TEAM_MONTH)}</div></div>${close}</div>
      ${tg === 1
        ? `<div class="row" style="justify-content:space-between"><span style="font-weight:600">${v ? L('Done', 'Hecho') : L('Not yet', 'Pendiente')}</span><button class="switch ${v ? 'on' : ''}" data-act="goalSet" data-v="${v ? 0 : 1}" aria-label="${g.name}"></button></div>`
        : `<div class="row" style="justify-content:space-between"><span class="small">${L('Goal', 'Meta')}: ${tg} ${L('times this month', 'veces este mes')}</span><div class="stepper"><button data-act="goalSet" data-v="${Math.max(0, v - 1)}" aria-label="−">−</button><span class="val">${v}/${tg}</span><button class="plus" data-act="goalSet" data-v="${Math.min(tg, v + 1)}" aria-label="+">+</button></div></div>`}
      <div class="row" style="justify-content:space-between"><button class="btn ghost sm" data-act="goalStep" data-d="-1">‹ ${L('Previous goal', 'Meta anterior')}</button><button class="btn ghost sm" data-act="goalStep" data-d="1">${L('Next goal', 'Siguiente meta')} ›</button></div>`;
  } else if (SHEET.type === 'member') {
    const m = S.members[SHEET.m] ? { id: SHEET.m, ...S.members[SHEET.m] } : null; if (!m) return '';
    const t = { id: m.teamId, ...S.teams[m.teamId] }, c = mdone(m, t, TEAM_MONTH);
    body = `<div class="row"><div class="avatar" style="width:44px;height:44px">${esc(initials(m.name))}</div><div class="grow"><div class="h">${esc(m.name)}</div><div class="small">${c}/7 ${L('goals', 'metas')} · ${monthLabel(TEAM_MONTH)}</div></div>${close}</div>
      ${field('mp-name', L('Full name', 'Nombre completo'), `value="${esc(m.name)}" maxlength="120" autocomplete="off"`)}
      ${field('mp-phone', L('Phone', 'Teléfono'), `value="${esc(m.phone)}" inputmode="tel" maxlength="120" autocomplete="off"`)}
      <div class="field"><label for="mp-notes">${L('Notes for the leader', 'Notas para el líder')}</label><textarea class="input" id="mp-notes" rows="3" maxlength="2000">${esc(m.notes)}</textarea></div>
      <div class="row" style="justify-content:space-between">
        <button class="btn ${CONFIRM === m.id ? 'danger' : 'ghost'}" data-act="memberDelete">${CONFIRM === m.id ? L('Tap again to remove', 'Toca otra vez para quitar') : L('Remove member', 'Quitar miembro')}</button>
        <button class="btn" data-act="memberSave">${icon('check', 14)}${L('Save', 'Guardar')}</button></div>`;
  } else if (SHEET.type === 'team') {
    const t = { id: VIEW_TEAM, ...S.teams[VIEW_TEAM] };
    body = `<div class="row"><div class="h grow">${L('Team settings', 'Ajustes del equipo')}</div>${close}</div>
      ${field('ts-name', L('Team name (optional)', 'Nombre del equipo (opcional)'), `value="${esc(t.name)}" placeholder="${L('Team', 'Equipo')} ${t.num}" maxlength="120" autocomplete="off"`)}
      ${isAdmin() ? field('ts-leader', L('Team leader', 'Líder del equipo'), `value="${esc(t.leader)}" maxlength="120" autocomplete="off"`) + field('ts-fruit', L('Yearly fruit goal', 'Meta anual de fruto'), `type="number" min="0" value="${+t.fruitGoal || 0}"`) : ''}
      <div class="small">${L('Attendance goal per month', 'Meta de asistencia por mes')}</div>
      <div class="seg">${[1, 2, 3, 4].map(n => `<button type="button" class="${(SHEET.att || t.attTarget || 4) === n ? 'on' : ''}" data-act="attTarget" data-n="${n}">${n}</button>`).join('')}</div>
      <div class="row" style="justify-content:space-between">
        ${isAdmin() ? `<button class="btn ${CONFIRM === 't-' + t.id ? 'danger' : 'ghost'}" data-act="teamDelete">${CONFIRM === 't-' + t.id ? L('Tap again: removes the team and its members', 'Toca otra vez: quita el equipo y sus miembros') : L('Remove team', 'Quitar equipo')}</button>` : '<span></span>'}
        <button class="btn" data-act="teamSave">${icon('check', 14)}${L('Save', 'Guardar')}</button></div>`;
  } else if (SHEET.type === 'addTeam') {
    body = `<div class="row"><div class="h grow">${L('Add team', 'Agregar equipo')}</div>${close}</div>
      ${field('nt-leader', L('Team leader’s full name', 'Nombre completo del líder'), 'maxlength="120" autocomplete="off"')}
      ${field('nt-name', L('Team name (optional)', 'Nombre del equipo (opcional)'), 'maxlength="120" autocomplete="off"')}
      ${field('nt-fruit', L('Yearly fruit goal', 'Meta anual de fruto'), 'type="number" min="0" value="0"')}
      ${field('nt-pin', L('Leader’s PIN, 4 to 8 digits (optional)', 'PIN del líder, de 4 a 8 dígitos (opcional)'), 'type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off"')}
      <div class="small">${L('Give the leader this PIN. They can change it after signing in.', 'Dale este PIN al líder. Puede cambiarlo al entrar.')}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-act="teamAdd" ${BUSY ? 'disabled' : ''}>${L('Add team', 'Agregar equipo')}</button></div>`;
  } else if (SHEET.type === 'user') {
    const u = SHEET.u ? USERS.find(x => x.id === SHEET.u) : null;
    const role = SHEET.role || (u ? u.role : 'leader');
    const ts = TEAMS();
    body = `<div class="row"><div class="h grow">${u ? L('Edit person', 'Editar persona') : L('Add person', 'Agregar persona')}</div>${close}</div>
      ${field('us-name', L('Full name', 'Nombre completo'), `value="${esc(u?.name || '')}" maxlength="120" autocomplete="off"`)}
      <div class="small">${L('Role', 'Rol')}</div>
      <div class="seg"><button type="button" class="${role === 'leader' ? 'on' : ''}" data-act="userRole" data-r="leader">${L('Team leader', 'Líder de equipo')}</button><button type="button" class="${role === 'admin' ? 'on' : ''}" data-act="userRole" data-r="admin">${L('Jefe de Templo', 'Jefe de Templo')}</button></div>
      ${role === 'leader' ? `<div class="field"><label for="us-team">${L('Team', 'Equipo')}</label><select class="sel" id="us-team"><option value="">${L('No team', 'Sin equipo')}</option>${ts.map(t => `<option value="${esc(t.id)}" ${(SHEET.team ?? u?.teamId) === t.id ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}</select></div>` : ''}
      ${field('us-pin', (u ? L('New PIN (leave empty to keep the current one)', 'Nuevo PIN (vacío para dejar el actual)') + ' · ' : '') + (role === 'admin' ? L('6 digits', '6 dígitos') : L('4 to 8 digits', '4 a 8 dígitos')), `type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${role === 'admin' ? 6 : 8}" autocomplete="off"`)}
      <div class="row" style="justify-content:space-between">
        ${u && u.id !== USER.id ? `<button class="btn ${CONFIRM === 'u-' + u.id ? 'danger' : 'ghost'}" data-act="userDelete">${CONFIRM === 'u-' + u.id ? L('Tap again to remove', 'Toca otra vez para quitar') : L('Remove access', 'Quitar acceso')}</button>` : '<span></span>'}
        <button class="btn" data-act="userSave" ${BUSY ? 'disabled' : ''}>${icon('check', 14)}${L('Save', 'Guardar')}</button></div>`;
  } else if (SHEET.type === 'password') {
    const len = isAdmin() ? 6 : 8;
    body = `<form data-form="password" style="display:contents"><div class="row"><div class="h grow">${L('Change your PIN', 'Cambiar tu PIN')}</div>${close}</div>
      ${field('pw-cur', L('Current PIN', 'PIN actual'), pinAttrs(8) + ' required')}
      ${field('pw-new', isAdmin() ? L('New PIN (6 digits)', 'Nuevo PIN (6 dígitos)') : L('New PIN (4 to 8 digits)', 'Nuevo PIN (4 a 8 dígitos)'), pinAttrs(len) + ' required')}
      <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">${L('Change PIN', 'Cambiar PIN')}</button></div></form>`;
  }
  return `<div class="overlay" data-act="overlay"><div class="sheet" role="dialog" aria-modal="true">${body}</div></div>`;
}

/* =====================================================================
   RENDER
   ===================================================================== */
function render() {
  document.documentElement.lang = LANG;
  const app = document.getElementById('app');
  const a = document.activeElement, focusId = a && a.id, selStart = a && 'selectionStart' in a ? a.selectionStart : null;
  // Keep what's typed in open forms across re-renders
  const typed = {};
  app.querySelectorAll('.sheet input[id], .sheet textarea[id], .auth input[id]').forEach(el => { if (el.type !== 'checkbox' && el.type !== 'file' && el.id !== 'li-pin') typed[el.id] = el.value; });
  if (SCREEN === 'loading') app.innerHTML = `<div class="auth"><div class="small">${L('Loading…', 'Cargando…')}</div></div>`;
  else if (SCREEN === 'setup') app.innerHTML = screenSetup();
  else if (SCREEN === 'login') app.innerHTML = screenLogin();
  else {
    readHash();
    let body;
    if (VIEW === 'report' && isAdmin()) body = viewReport();
    else if (VIEW === 'teams' && isAdmin()) body = viewTeams();
    else if (VIEW === 'settings' && isAdmin()) body = viewSettings();
    else if (VIEW === 'team') body = viewTeam();
    else body = viewRegion();
    app.innerHTML = `${topBar()}<main class="wrap">${body}</main><footer class="wrap">Church Status · ${L('Santiago Region', 'Región Santiago')}</footer>${sheet()}`;
  }
  for (const [id, v] of Object.entries(typed)) { const el = document.getElementById(id); if (el && el.value !== v) el.value = v; }
  if (focusId && focusId !== 'li-pin') { const el = document.getElementById(focusId); if (el) { el.focus(); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch (e) {} } }
}

/* =====================================================================
   EVENTS
   ===================================================================== */
const app = document.getElementById('app');
async function loadUsers() { if (isAdmin()) { try { USERS = (await api('GET', '/api/users')).users; } catch (e) {} } }

app.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'overlay' && e.target !== el) return;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  if (!['memberDelete', 'teamDelete', 'userDelete', 'branchDelete'].includes(act)) CONFIRM = null;
  switch (act) {
    case 'lang': LANG = el.dataset.l; try { localStorage.setItem('cs-lang', LANG); } catch (x) {} break;
    case 'logout': try { await api('POST', '/api/logout', {}); } catch (x) {} stopLive(); USER = null; PIN = ''; SCREEN = 'login'; history.replaceState(null, '', location.pathname); break;
    case 'pinKey': if (PIN.length < 8) PIN += el.dataset.k; AUTH_ERR = ''; break;
    case 'pinDel': PIN = PIN.slice(0, -1); AUTH_ERR = ''; break;
    case 'passwordOpen': SHEET = { type: 'password' }; break;
    case 'period': PERIOD = el.dataset.p; break;
    case 'openReport': REPORT = { branch: el.dataset.b, month: CURRENT_MONTH, draft: {} }; location.hash = 'report'; return;
    case 'openTeam': TEAM_MONTH = CURRENT_MONTH; location.hash = 'team-' + el.dataset.t; return;
    case 'pickBranch': REPORT = { branch: el.dataset.b, month: REPORT.month, draft: {} }; break;
    case 'resetDraft': REPORT.draft = {}; break;
    case 'saveReport': {
      const b = S.branches[REPORT.branch]; if (!b) break;
      const v = {}, goals = {};
      for (const x of METRICS()) {
        const vi = document.getElementById('v-' + x.k), gi = document.getElementById('g-' + x.k);
        if (vi && vi.value !== '') v[x.k] = Math.max(0, Math.round(+vi.value));
        if (gi && gi.value !== '') goals[x.k] = Math.max(0, Math.round(+gi.value));
      }
      const ok = await save('branches', REPORT.branch, { months: { [REPORT.month]: v }, goals });
      if (ok) { REPORT.draft = {}; toast(L(`Saved ${b.name} · ${monthLabel(REPORT.month)}`, `Guardado ${b.name} · ${monthLabel(REPORT.month)}`)); }
      break;
    }
    case 'monthPrev': TEAM_MONTH = shiftMonth(TEAM_MONTH, -1); break;
    case 'monthNext': if (TEAM_MONTH < CURRENT_MONTH) TEAM_MONTH = shiftMonth(TEAM_MONTH, 1); break;
    case 'goalOpen': SHEET = { type: 'goal', m: el.dataset.m, k: el.dataset.k }; break;
    case 'goalSet': if (SHEET) save('members', SHEET.m, { months: { [TEAM_MONTH]: { [SHEET.k]: +el.dataset.v } } }); return;
    case 'goalStep': { const ks = GOALS().map(g => g.k), i = ks.indexOf(SHEET.k); SHEET = { ...SHEET, k: ks[(i + +el.dataset.d + ks.length) % ks.length] }; break; }
    case 'memberOpen': SHEET = { type: 'member', m: el.dataset.m }; break;
    case 'memberSave': {
      const name = val('mp-name');
      if (!name) { toast(L('Enter the member’s name.', 'Escribe el nombre del miembro.')); return; }
      const id = SHEET.m; SHEET = null;
      if (await save('members', id, { name, phone: val('mp-phone'), notes: document.getElementById('mp-notes')?.value || '' })) toast(L('Profile saved.', 'Perfil guardado.'));
      return;
    }
    case 'memberDelete':
      if (CONFIRM === SHEET.m) { const id = SHEET.m; SHEET = null; CONFIRM = null; if (await save('members', id, null, 'delete')) toast(L('Member removed.', 'Miembro quitado.')); return; }
      CONFIRM = SHEET.m; break;
    case 'teamSettings': SHEET = { type: 'team' }; break;
    case 'attTarget': SHEET = { ...SHEET, att: +el.dataset.n }; break;
    case 'teamSave': {
      const patch = { name: val('ts-name') };
      if (SHEET.att) patch.attTarget = SHEET.att;
      if (isAdmin()) { if (val('ts-leader')) patch.leader = val('ts-leader'); patch.fruitGoal = Math.max(0, Math.round(+val('ts-fruit') || 0)); }
      SHEET = null;
      if (await save('teams', VIEW_TEAM, patch)) toast(L('Team saved.', 'Equipo guardado.'));
      return;
    }
    case 'teamDelete': {
      const key = 't-' + VIEW_TEAM;
      if (CONFIRM !== key) { CONFIRM = key; break; }
      const id = VIEW_TEAM; SHEET = null; CONFIRM = null; location.hash = 'teams';
      if (await save('teams', id, null, 'delete')) { for (const [mid, m] of Object.entries(S.members)) if (m.teamId === id) delete S.members[mid]; await loadUsers(); toast(L('Team removed.', 'Equipo quitado.')); }
      return;
    }
    case 'addTeamOpen': SHEET = { type: 'addTeam' }; break;
    case 'teamAdd': {
      const leader = val('nt-leader'), pin = val('nt-pin');
      if (!leader) { toast(L('Enter the team leader’s name.', 'Escribe el nombre del líder.')); return; }
      if (pin && !/^\d{4,8}$/.test(pin)) { toast(L('The PIN needs 4 to 8 digits.', 'El PIN necesita de 4 a 8 dígitos.')); return; }
      const num = TEAMS().reduce((a, t) => Math.max(a, t.num || 0), 0) + 1, id = uid('t');
      BUSY = true; render();
      const ok = await save('teams', id, { name: val('nt-name'), num, leader, fruitGoal: Math.max(0, Math.round(+val('nt-fruit') || 0)), attTarget: 4, fruit: {} }, 'set');
      if (ok && pin) {
        try { await api('POST', '/api/users', { name: leader, pin, role: 'leader', teamId: id }); await loadUsers(); toast(L(`Team added. ${leader} can sign in with the PIN you chose.`, `Equipo agregado. ${leader} puede entrar con el PIN que elegiste.`)); }
        catch (x) { toast(L(`Team added, but the PIN wasn’t saved: ${x.message}`, `Equipo agregado, pero el PIN no se guardó: ${x.message}`)); }
      } else if (ok) toast(L('Team added.', 'Equipo agregado.'));
      BUSY = false; SHEET = null; render(); return;
    }
    case 'userAddOpen': SHEET = { type: 'user', u: null }; break;
    case 'userEditOpen': SHEET = { type: 'user', u: el.dataset.u }; break;
    case 'userRole': SHEET = { ...SHEET, role: el.dataset.r, team: document.getElementById('us-team')?.value }; break;
    case 'userSave': {
      const u = SHEET.u ? USERS.find(x => x.id === SHEET.u) : null;
      const role = SHEET.role || (u ? u.role : 'leader');
      const body = { name: val('us-name'), role, teamId: role === 'leader' ? (document.getElementById('us-team')?.value || null) : null };
      const pin = val('us-pin');
      if (pin || !u) body.pin = pin;
      BUSY = true; render();
      try {
        if (u) await api('PATCH', `/api/users/${encodeURIComponent(u.id)}`, body); else await api('POST', '/api/users', body);
        await loadUsers(); SHEET = null; toast(pin ? L('Saved. Give them the new PIN.', 'Guardado. Dale el nuevo PIN.') : L('Saved.', 'Guardado.'));
        if (u && u.id === USER.id) USER = (await api('GET', '/api/me')).user;
      } catch (x) { toast(x.message); }
      BUSY = false; break;
    }
    case 'userDelete': {
      const key = 'u-' + SHEET.u;
      if (CONFIRM !== key) { CONFIRM = key; break; }
      try { await api('DELETE', `/api/users/${encodeURIComponent(SHEET.u)}`); await loadUsers(); SHEET = null; CONFIRM = null; toast(L('Access removed.', 'Acceso quitado.')); } catch (x) { toast(x.message); }
      break;
    }
    case 'branchDelete': {
      const key = 'b-' + el.dataset.b;
      if (CONFIRM !== key) { CONFIRM = key; break; }
      CONFIRM = null; if (await save('branches', el.dataset.b, null, 'delete')) toast(L('Branch removed.', 'Sucursal quitada.'));
      return;
    }
    case 'fruitInc': case 'fruitDec': {
      const t = S.teams[VIEW_TEAM]; const cur = (t.fruit || {})[TEAM_MONTH] || 0;
      const next = act === 'fruitInc' ? cur + 1 : Math.max(0, cur - 1);
      if (next !== cur && await save('teams', VIEW_TEAM, { fruit: { [TEAM_MONTH]: next } }) && act === 'fruitInc') toast(L('Praise God! Fruit added.', '¡Gloria a Dios! Fruto agregado.'));
      return;
    }
    case 'overlay': case 'close': SHEET = null; break;
    default: return;
  }
  render();
});

app.addEventListener('change', async e => {
  const el = e.target, act = el.dataset.act;
  if (act === 'repMonth') { REPORT = { ...REPORT, month: el.value, draft: {} }; render(); }
  else if (act === 'fruitGoal') save('teams', el.dataset.t, { fruitGoal: Math.max(0, Math.round(+el.value || 0)) });
  else if (act === 'branchName') { const name = el.value.trim(); if (name && name !== S.branches[el.dataset.b]?.name) save('branches', el.dataset.b, { name }); else render(); }
  else if (act === 'teamsBranch') {
    await save('branches', el.dataset.b, { hasTeams: true });
    for (const [id, b] of Object.entries(S.branches)) if (id !== el.dataset.b && b.hasTeams) S.branches[id] = { ...b, hasTeams: false };
    render();
  }
  else if (act === 'restore') {
    const file = el.files && el.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await api('POST', '/api/import', { branches: data.branches, teams: data.teams, members: data.members });
      await loadData(); render(); toast(L('Backup restored.', 'Copia restaurada.'));
    } catch (x) { toast(x instanceof SyntaxError ? L('That file isn’t a Church Status backup.', 'Ese archivo no es una copia de Church Status.') : x.message); }
    el.value = '';
  }
});
app.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.act === 'draft') REPORT.draft[el.id] = el.value;
  if (el.id === 'li-pin') {
    PIN = el.value.replace(/\D/g, '').slice(0, 8); el.value = PIN; AUTH_ERR = '';
    const ok = document.querySelector('.keys .ok'); if (ok) ok.disabled = PIN.length < 4;
    document.getElementById('li-err').textContent = '';
  }
});

app.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target.dataset.form;
  if (form === 'login' || form === 'setup') {
    if (form === 'setup' && document.getElementById('su-pin').value !== document.getElementById('su-pin2').value) { AUTH_ERR = L('The two PINs don’t match.', 'Los dos PIN no coinciden.'); render(); return; }
    if (form === 'login') PIN = (document.getElementById('li-pin')?.value || PIN).replace(/\D/g, '');
    if (form === 'login' && PIN.length < 4) return;
    const payload = form === 'login'
      ? { pin: PIN }
      : { name: val('su-name'), pin: document.getElementById('su-pin').value, example: document.getElementById('su-example').checked };
    BUSY = true; AUTH_ERR = ''; render();
    if (form === 'setup' && payload.example) document.getElementById('su-example').checked = true;
    try {
      const out = await api('POST', form === 'login' ? '/api/login' : '/api/setup', payload);
      USER = out.user; BUSY = false; PIN = ''; await enterApp(); return;
    } catch (x) { AUTH_ERR = x.message; BUSY = false; if (form === 'login') PIN = ''; render(); return; }
  }
  if (form === 'addMember') {
    const inp = document.getElementById('new-member'), name = inp.value.trim();
    if (!name) { toast(L('Enter the member’s name.', 'Escribe el nombre del miembro.')); return; }
    inp.value = '';
    if (await save('members', uid('m'), { teamId: VIEW_TEAM, name, phone: '', notes: '', months: {} }, 'set')) toast(L(`${name} added.`, `${name} agregado.`));
  }
  if (form === 'addBranch') {
    const inp = document.getElementById('new-branch'), name = inp.value.trim();
    if (!name) return;
    let id = slug(name); while (S.branches[id]) id = slug(name) + '-' + Math.random().toString(36).slice(2, 5);
    const order = BRANCHES().reduce((a, b) => Math.max(a, b.order ?? 0), -1) + 1;
    inp.value = '';
    if (await save('branches', id, { name, order, hasTeams: false, goals: { simple: 0, mean: 0, att: 0, tithe: 0, fruit: 0 }, months: {} }, 'set')) toast(L('Branch added.', 'Sucursal agregada.'));
  }
  if (form === 'password') {
    try { await api('POST', '/api/me/pin', { current: document.getElementById('pw-cur').value, next: document.getElementById('pw-new').value }); SHEET = null; render(); toast(L('PIN changed.', 'PIN cambiado.')); }
    catch (x) { toast(x.message); }
  }
});
app.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-act]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && SHEET) { SHEET = null; render(); }
});
window.addEventListener('hashchange', () => { SHEET = null; if (location.hash === '#settings') loadUsers().then(render); render(); });

/* =====================================================================
   START
   ===================================================================== */
async function enterApp() {
  SCREEN = 'loading'; render();
  await loadData();
  await loadUsers();
  SCREEN = 'app';
  if (!location.hash) location.hash = isAdmin() ? 'region' : 'team';
  startLive(); render();
}
(async () => {
  try {
    const status = await api('GET', '/api/status');
    if (status.setup) { SCREEN = 'setup'; render(); return; }
    try { USER = (await api('GET', '/api/me')).user; } catch (e) { SCREEN = 'login'; render(); return; }
    await enterApp();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="auth"><div class="card"><div class="h">${L('Can’t reach the Church Status server', 'No se puede conectar con el servidor de Church Status')}</div><div class="small">${esc(e.message)}</div><a class="btn" href="/">${L('Try again', 'Intentar de nuevo')}</a></div></div>`;
  }
})();
