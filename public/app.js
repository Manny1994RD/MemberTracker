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
const S = { branches: {}, groups: {}, teams: {}, members: {} };
let ACCESS = null, SCREEN = 'loading', LIVE = false, STATS = {}, CODED = [], CODED_G = [];
const isMain = () => !!ACCESS?.main;
// A team is open with its own code or its group's code.
const hasTeam = tid => !!ACCESS?.teams?.includes(tid) || (!!S.teams[tid] && !!ACCESS?.groups?.includes(S.teams[tid].groupId));

async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'X-Lang': LANG, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && SCREEN === 'app' && !url.startsWith('/api/unlock')) { ACCESS = null; SCREEN = 'login'; stopLive(); render(); }
  if (!res.ok) throw Object.assign(new Error(data.error || L('Couldn’t reach the server.', 'No se pudo conectar con el servidor.')), { status: res.status });
  return data;
}

const sorted = (col, key) => Object.entries(S[col]).map(([id, d]) => ({ id, ...d })).sort((a, b) => (a[key] ?? 0) > (b[key] ?? 0) ? 1 : (a[key] ?? 0) < (b[key] ?? 0) ? -1 : String(a.name).localeCompare(String(b.name)));
const BRANCHES = () => sorted('branches', 'order');
const GROUPS = () => sorted('groups', 'order');
const branchOrder = id => S.branches[id]?.order ?? 999, groupOrder = id => S.groups[id]?.order ?? 999;
const TEAMS = () => Object.entries(S.teams).map(([id, d]) => ({ id, ...d }))
  .sort((a, b) => branchOrder(a.branchId) - branchOrder(b.branchId) || groupOrder(a.groupId) - groupOrder(b.groupId) || (a.num || 0) - (b.num || 0));
const teamsOfBranch = bid => TEAMS().filter(t => t.branchId === bid);
const groupsOfBranch = bid => GROUPS().filter(g => g.branchId === bid);
const branchHasTeams = b => TEAMS().some(t => t.branchId === b.id);
const groupName = t => S.groups[t.groupId]?.name || '';
const openTeams = () => TEAMS().filter(t => hasTeam(t.id));
const teamMembers = tid => Object.entries(S.members).map(([id, d]) => ({ id, ...d })).filter(m => m.teamId === tid).sort((a, b) => a.name.localeCompare(b.name));

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
  S.branches = d.branches; S.groups = d.groups || {}; S.teams = d.teams; S.members = d.members; STATS = d.teamStats || {}; CODED = d.teamsWithCodes || []; CODED_G = d.groupsWithCodes || [];
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
  ES.addEventListener('stats', ev => { STATS = JSON.parse(ev.data); render(); });
  ES.addEventListener('reload', async () => {
    try { ACCESS = (await api('GET', '/api/me')).access; await loadData(); render(); } catch (e) {}
  });
}
function stopLive() { if (ES) { ES.close(); ES = null; } LIVE = false; }

/* Branch & team math */
function teamFruit(t, months) { return months.reduce((a, m) => a + ((t.fruit || {})[m] || 0), 0); }
// Fruit goals are set per group; a group's fruit adds up from its teams.
function groupFruit(gid, months) { return TEAMS().filter(t => t.groupId === gid).reduce((a, t) => a + teamFruit(t, months), 0); }
function branchVal(b, k) {
  const ms = periodMonths();
  if (k === 'fruit' && branchHasTeams(b)) return teamsOfBranch(b.id).reduce((a, t) => a + teamFruit(t, ms), 0);
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
const teamHealth = (t, month = CURRENT_MONTH) => {
  if (!hasTeam(t.id) && month === CURRENT_MONTH) return STATS[t.id]?.health ?? 0;
  const ms = teamMembers(t.id); return ms.length ? Math.round(ms.reduce((a, m) => a + mdone(m, t, month), 0) / (ms.length * 7) * 100) : 0;
};
const teamCount = t => hasTeam(t.id) ? teamMembers(t.id).length : (STATS[t.id]?.members ?? 0);
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
  else { VIEW = isMain() ? 'region' : 'team'; VIEW_TEAM = openTeams()[0]?.id; }
  if (!isMain() && ['report', 'teams', 'settings'].includes(VIEW)) { VIEW = 'team'; VIEW_TEAM = openTeams()[0]?.id; }
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
let CODE_IN = '';
const codeAttrs = len => `type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="${len}"`;
// Number keypad used to enter the app code and team codes
function codePad(form, submitLabel) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  return `<label class="sr" for="code-in">${L('Code', 'Código')}</label>
    <input id="code-in" class="pin-input" ${codeAttrs(8)} value="${esc(CODE_IN)}" placeholder="••••" aria-describedby="code-err">
    <div class="err" id="code-err" role="alert">${esc(AUTH_ERR)}</div>
    <div class="keys">${keys.map(k => k === 'del'
      ? `<button type="button" data-act="pinDel" aria-label="${L('Delete', 'Borrar')}">⌫</button>`
      : k === 'ok'
        ? `<button type="submit" class="ok" ${BUSY || CODE_IN.length < 4 ? 'disabled' : ''}>${submitLabel}</button>`
        : `<button type="button" data-act="pinKey" data-k="${k}">${k}</button>`).join('')}</div>`;
}
function screenLogin() {
  return `<div class="auth"><form class="card pinpad" data-form="login">
    <div class="row" style="justify-content:space-between"><div class="brandmark">${icon('bible', 28)}Church Status</div>${langSeg()}</div>
    <h1>${L('Enter the code', 'Escribe el código')}</h1>
    <p class="small" style="margin:0;text-align:center">${L('Use the app code, or your group’s code to go straight to your group’s teams.', 'Usa el código de la app, o el código de tu grupo para ir directo a los equipos de tu grupo.')}</p>
    ${codePad('login', L('Enter', 'Entrar'))}
  </form></div>`;
}

/* =====================================================================
   VIEWS
   ===================================================================== */
const periodSeg = () => `<div class="seg" role="group" aria-label="${L('Period', 'Periodo')}">${[['month', L('Monthly', 'Mensual')], ['quarter', L('Quarterly', 'Trimestral')], ['year', L('Yearly', 'Anual')]]
  .map(([k, t]) => `<button class="${PERIOD === k ? 'on' : ''}" data-act="period" data-p="${k}">${t}</button>`).join('')}</div>`;

function topBar() {
  const myTeams = openTeams().map(t => t.id);
  const tabs = isMain()
    ? [['region', 'pin', L('Region', 'Región')], ['report', 'pencil', L('Monthly report', 'Reporte mensual')], ['teams', 'people', L('Teams', 'Equipos')], ['settings', 'gear', L('Settings', 'Ajustes')]]
    : [...myTeams.map(t => [`team-${t}`, 'people', teamName(S.teams[t])]), ['region', 'pin', L('Region', 'Región')]];
  const cur = VIEW === 'team' ? (isMain() ? 'teams' : `team-${VIEW_TEAM}`) : VIEW;
  const who = isMain() ? L('App code', 'Código de la app') : ACCESS?.groups?.length ? L('Group code', 'Código de grupo') : L('Team code', 'Código de equipo');
  return `<header class="top"><div class="wrap">
    <div class="brand">${icon('bible', 26)}<div>Church Status<small>${L('Santiago Region', 'Región Santiago')}</small></div></div>
    <nav class="tabs">${tabs.map(([h, ic, t]) => `<a href="#${h}" class="${cur === h ? 'on' : ''}">${icon(ic, 16)}${esc(t)}</a>`).join('')}</nav>
    <div class="right">
      <span class="live ${LIVE ? '' : 'off'}" title="${LIVE ? L('Changes appear live', 'Los cambios aparecen en vivo') : L('Reconnecting…', 'Reconectando…')}"><i></i>${LIVE ? L('Live', 'En vivo') : L('Reconnecting', 'Reconectando')}</span>
      ${langSeg()}
      <div class="usermenu"><div class="who-me">${who}<small>${myTeams.length ? `${myTeams.length} ${L('team(s) open', 'equipo(s) abiertos')}` : '&nbsp;'}</small></div>
        <button class="btn ghost sm" data-act="logout">${L('Lock', 'Cerrar')}</button></div>
    </div>
  </div></header>`;
}

function viewRegion() {
  const rp = regionPct(), bs = BRANCHES();
  return `
  <div class="head"><div class="grow"><h1>${L('Santiago Region', 'Región Santiago')}</h1><p>${L('General Assembly goals', 'Metas de Asamblea General')} · ${bs.length} ${L('branches', 'sucursales')} · ${periodLabel()}</p></div>
    ${periodSeg()}
    ${isMain() ? `<a class="btn" href="#report">${icon('pencil', 16)}${L('Enter monthly report', 'Ingresar reporte mensual')}</a>` : `<span class="tag info">${L('View only', 'Solo lectura')}</span>`}
  </div>
  <div class="grid kpis">
    ${METRICS().map(m => { const c = regionVal(m.k), g = regionGoal(m.k); return `<div class="card kpi">
      <div class="row"><div class="ic">${icon(m.icon, 22)}</div><div class="grow"><div class="lbl">${m.name}</div><div class="small">${m.desc}</div></div></div>
      <div class="v">${fmt(c)} <small>/ ${fmt(g)}</small></div>${bar(ratio(c, g))}<div class="small" style="margin-top:6px">${g ? `${Math.round(ratio(c, g) * 100)}% ${L('of goal', 'de la meta')}` : L('No goal set yet', 'Sin meta todavía')}</div></div>`; }).join('')}
  </div>
  <div class="grid split">
    <div class="card">
      <div class="h">${L('Branch progress', 'Progreso por sucursal')}</div>
      <div class="small" style="margin-bottom:8px">${isMain() ? L('Click a branch to enter its monthly report.', 'Haz clic en una sucursal para ingresar su reporte mensual.') : L('Updated by the Jefe de Templo.', 'Actualizado por el Jefe de Templo.')}</div>
      <div class="tablewrap"><table>
        <thead><tr><th>${L('Branch', 'Sucursal')}</th>${METRICS().map(m => `<th class="c"><div class="thi">${icon(m.icon, 18)}${m.short}</div></th>`).join('')}<th class="c">${L('Overall', 'Total')}</th></tr></thead>
        <tbody>
          ${bs.map(b => { const p = branchPct(b); return `<tr class="${isMain() ? 'click' : ''}" ${isMain() ? `data-act="openReport" data-b="${esc(b.id)}" tabindex="0"` : ''}>
            <td><div class="who">${plant(pctStage(p), 28, p < 45)}<div><b>${esc(b.name)}</b><div class="small">${branchHasTeams(b) ? `${teamsOfBranch(b.id).length} ${L('teams', 'equipos')}` : L('Monthly report', 'Reporte mensual')}</div></div></div></td>
            ${METRICS().map(m => { const c = branchVal(b, m.k), g = branchGoal(b, m.k); return `<td><div class="mcell"><div class="nums">${fmt(c)}<span>/ ${fmt(g)}</span></div>${bar(ratio(c, g))}</div></td>`; }).join('')}
            <td class="c"><span class="tag ${p >= 80 ? 'ok' : p >= 55 ? 'warn' : 'bad'}">${p}%</span></td></tr>`; }).join('')}
          <tr><td><b>${L('Region total', 'Total región')}</b></td>${METRICS().map(m => `<td><div class="mcell"><div class="nums">${fmt(regionVal(m.k))}<span>/ ${fmt(regionGoal(m.k))}</span></div></div></td>`).join('')}<td class="c"><span class="tag ${rp >= 80 ? 'ok' : rp >= 55 ? 'warn' : 'bad'}">${rp}%</span></td></tr>
        </tbody>
      </table></div>
      <div class="legend"><span><i style="background:var(--ok)"></i>${L('On track (80%+)', 'En camino (80%+)')}</span><span><i style="background:var(--warn-bar)"></i>55–79%</span><span><i style="background:var(--bad)"></i>${L('Below 55%', 'Menos de 55%')}</span><span>${L('Fruit adds up from each branch’s teams.', 'El fruto se suma desde los equipos de cada sucursal.')}</span></div>
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

function teamFruitMonth(b, m) { return teamsOfBranch(b.id).reduce((a, t) => a + ((t.fruit || {})[m] || 0), 0); }
function monthVal(b, k, m) { if (k === 'fruit' && branchHasTeams(b)) return teamFruitMonth(b, m); return +((b.months || {})[m] || {})[k] || 0; }
function viewReport() {
  const bs = BRANCHES();
  if (!bs.length) return `<div class="card empty"><div class="h">${L('No branches yet', 'Aún no hay sucursales')}</div><a class="btn" href="#settings">${L('Add branches in Settings', 'Agrega sucursales en Ajustes')}</a></div>`;
  const b = bs.find(x => x.id === REPORT.branch) || bs[0];
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
        const fromTeams = x.k === 'fruit' && branchHasTeams(b);
        return `<div class="formrow">${icon(x.icon, 22)}<div><div style="font-weight:500">${x.name}</div><div class="small">${x.desc}${fromTeams ? ` · ${L('comes from the teams', 'viene de los equipos')}` : ''}</div></div>
          ${fromTeams ? `<div class="input num" style="background:var(--inset)">${teamFruitMonth(b, m)}</div>` : `<input class="input num" id="v-${x.k}" type="number" min="0" inputmode="numeric" value="${esc(v(x.k))}" data-act="draft" aria-label="${x.name}">`}
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

let TEAMS_BRANCH = null;
function viewTeams() {
  const bs = BRANCHES();
  const b = bs.find(x => x.id === TEAMS_BRANCH) || bs.find(x => branchHasTeams(x)) || bs[0];
  if (!b) return `<div class="card empty"><div class="h">${L('No branches yet', 'Aún no hay sucursales')}</div></div>`;
  TEAMS_BRANCH = b.id;
  const ts = teamsOfBranch(b.id), gs = groupsOfBranch(b.id), yr = monthsToDate();
  const assigned = gs.reduce((a, g) => a + (+g.fruitGoal || 0), 0), branchFruitGoal = +(b.goals || {}).fruit || 0;
  const members = ts.reduce((a, t) => a + teamCount(t), 0);
  const row = t => { const h = teamHealth(t), f = teamFruit(t, yr); return `<tr class="click" data-act="openTeam" data-t="${esc(t.id)}" tabindex="0">
      <td><div class="who">${plant(pctStage(h), 28, h < 50)}<div><b>${esc(teamName(t))}</b><div class="small">${esc(t.note)}</div></div></div></td>
      <td>${esc(t.leader) || '<span class="muted">—</span>'}</td><td class="c num">${teamCount(t)}</td>
      <td><div class="mcell"><div class="nums">${h}%<span></span></div>${bar(h / 100)}</div></td>
      <td class="c num">${f}</td>
      <td><span class="btn ghost sm">${hasTeam(t.id) ? L('Open', 'Abrir') : `🔒 ${L('Open', 'Abrir')}`}</span></td></tr>`; };
  const head = `<thead><tr><th>${L('Team', 'Equipo')}</th><th>${L('Leader', 'Líder')}</th><th class="c">${L('Members', 'Miembros')}</th><th>${L('7 goals this month', '7 metas este mes')}</th><th class="c">${L('Fruit this year', 'Fruto este año')}</th><th></th></tr></thead>`;
  const loose = ts.filter(t => !S.groups[t.groupId]);
  return `
  <div class="head"><div class="grow"><h1>${L('Teams', 'Equipos')}</h1><p>${L('Pick a branch. Opening a team asks for its group’s code.', 'Elige una sucursal. Abrir un equipo pide el código de su grupo.')}</p></div>
    <button class="btn" data-act="addTeamOpen">${icon('people', 16)}${L('Add team', 'Agregar equipo')}</button></div>
  <div class="chips">${bs.map(x => `<button class="chip ${x.id === b.id ? 'on' : ''}" data-act="pickTeamsBranch" data-b="${esc(x.id)}">${esc(x.name)} <span class="muted">${teamsOfBranch(x.id).length}</span></button>`).join('')}</div>
  ${ts.length ? `<div class="grid split">
    <div class="grid">
      ${gs.map(g => { const gt = ts.filter(t => t.groupId === g.id), gf = groupFruit(g.id, yr), gg = +g.fruitGoal || 0; return `<div class="card">
        <div class="row" style="flex-wrap:wrap"><div class="grow"><div class="h">${esc(g.name)} ${g.future ? `<span class="tag warn">${L('Future group', 'Futuro grupo')}</span>` : ''}</div>
          <div class="small">${gt.length} ${L('teams', 'equipos')} · ${gt.reduce((a, t) => a + teamCount(t), 0)} ${L('members', 'miembros')}${g.leader ? ` · ${L('Leader', 'Líder')}: ${esc(g.leader)}` : ''} · ${CODED_G.includes(g.id) ? L('Group code set', 'Con código de grupo') : `<span style="color:var(--warn)">${L('No group code', 'Sin código de grupo')}</span>`}</div></div>
          <div class="mcell" style="min-width:150px"><div class="nums">${icon('fruit', 14)} ${gf}<span>/ ${gg} ${L('fruit this year', 'fruto del año')}</span></div>${bar(ratio(gf, gg))}</div>
          <button class="btn ghost sm" data-act="groupSettings" data-g="${esc(g.id)}">${icon('gear', 14)}${L('Group', 'Grupo')}</button></div>
        <div class="tablewrap"><table>${head}<tbody>${gt.map(row).join('') || `<tr><td colspan="6" class="muted">${L('No teams in this group.', 'Este grupo no tiene equipos.')}</td></tr>`}</tbody></table></div>
      </div>`; }).join('')}
      ${loose.length ? `<div class="card"><div class="h">${L('Teams without a group', 'Equipos sin grupo')}</div><div class="tablewrap"><table>${head}<tbody>${loose.map(row).join('')}</tbody></table></div></div>` : ''}
    </div>
    <div class="card">
      <div class="lbl">${L('Split the yearly fruit goal', 'Repartir la meta anual de fruto')} · ${esc(b.name)}</div>
      <div class="row" style="justify-content:space-between;margin:10px 0"><span>${L('Branch fruit goal', 'Meta de fruto de la sucursal')}</span><b class="num">${branchFruitGoal}</b></div>
      ${gs.map(g => `<div class="list-row"><span class="grow">${esc(g.name)}<div class="small">${ts.filter(t => t.groupId === g.id).length} ${L('teams', 'equipos')} · ${groupFruit(g.id, yr)} ${L('so far', 'hasta ahora')}</div></span><input class="input num" style="width:80px" type="number" min="0" id="fg-${esc(g.id)}" value="${+g.fruitGoal || 0}" data-act="groupFruitGoal" data-g="${esc(g.id)}" aria-label="${L('Fruit goal', 'Meta de fruto')} ${esc(g.name)}"></div>`).join('')}
      <div style="margin-top:12px"><span class="tag ${assigned === branchFruitGoal ? 'ok' : 'warn'}">${L(`Assigned ${assigned} of ${branchFruitGoal}`, `Asignado ${assigned} de ${branchFruitGoal}`)}</span></div>
      <p class="small">${members} ${L('members in', 'miembros en')} ${ts.length} ${L('teams', 'equipos')} · ${L('Each group’s fruit adds up from its teams.', 'El fruto de cada grupo se suma desde sus equipos.')}</p>
    </div>
  </div>` : `<div class="card empty">${plant(1, 60)}<div class="h">${L('No teams in this branch yet', 'Esta sucursal aún no tiene equipos')}</div><div class="small">${L('Import them from Excel in Settings, or add the first team here.', 'Impórtalos desde Excel en Ajustes, o agrega el primer equipo aquí.')}</div></div>`}`;
}

function viewTeam() {
  const t = S.teams[VIEW_TEAM] ? { id: VIEW_TEAM, ...S.teams[VIEW_TEAM] } : null;
  if (!t) return `<div class="card empty"><div class="h">${L('That team no longer exists', 'Ese equipo ya no existe')}</div><a class="btn" href="#${isMain() ? 'teams' : 'region'}">${isMain() ? L('All teams', 'Todos los equipos') : L('See region', 'Ver región')}</a></div>`;
  if (!hasTeam(t.id)) return `<div class="auth" style="min-height:auto;padding:10px 0"><form class="card pinpad" data-form="unlock" data-t="${esc(t.id)}">
      <div class="row">${plant(pctStage(teamHealth(t)), 34)}<div><div class="h">${esc(teamName(t))}</div><div class="small">${esc(groupName(t))} · ${esc(S.branches[t.branchId]?.name || '')}</div></div></div>
      <h1 style="font-size:19px">${L('Enter the group’s code', 'Escribe el código del grupo')}</h1>
      ${codePad('unlock', L('Open', 'Abrir'))}
      ${isMain() ? `<a href="#teams" class="small" style="text-align:center;color:var(--accent);text-decoration:none">‹ ${L('All teams', 'Todos los equipos')}</a>` : ''}
    </form></div>`;
  const mo = TEAM_MONTH, ms = teamMembers(t.id), h = teamHealth(t, mo), yr = monthsToDate();
  const gYear = groupFruit(t.groupId, yr), fYear = teamFruit(t, yr), fMonth = (t.fruit || {})[mo] || 0, fg = +(S.groups[t.groupId]?.fruitGoal) || 0;
  const complete = ms.filter(m => mdone(m, t, mo) === 7).length;
  const follow = ms.filter(m => mdone(m, t, mo) <= 3);
  return `
  <div class="head"><div class="grow">
      ${isMain() ? `<a href="#teams" class="small" style="color:var(--accent);text-decoration:none">‹ ${L('All teams', 'Todos los equipos')}</a>` : ''}
      <h1>${esc(teamName(t))}</h1><p>${esc(groupName(t))} · ${esc(S.branches[t.branchId]?.name || '')}${t.leader ? ` · ${L('Leader', 'Líder')}: ${esc(t.leader)}` : ''}${t.note ? ` · <span class="tag warn">${esc(t.note)}</span>` : ''}</p></div>
    <div class="monthnav"><button data-act="monthPrev" aria-label="${L('Previous month', 'Mes anterior')}">‹</button><span>${monthLabel(mo)}</span><button data-act="monthNext" aria-label="${L('Next month', 'Mes siguiente')}" ${mo >= CURRENT_MONTH ? 'disabled' : ''}>›</button></div>
    <button class="btn ghost" data-act="teamSettings">${icon('gear', 16)}${L('Team settings', 'Ajustes del equipo')}</button>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="row"><div class="plantbox" style="padding:4px 8px 2px">${plant(pctStage(h), 34, h < 45)}</div><div><div class="lbl">${L('Team health', 'Salud del equipo')}</div><div class="v" style="margin:4px 0 0">${h}%</div></div></div></div>
    <div class="card kpi"><div class="row"><div class="ic">${icon('star', 22)}</div><div><div class="lbl">${L('All 7 reached', 'Las 7 logradas')}</div><div class="v" style="margin:4px 0 0">${complete} <small>/ ${ms.length}</small></div></div></div></div>
    <div class="card kpi"><div class="row"><div class="ic">${icon('hands', 22)}</div><div class="grow"><div class="lbl">${L('Need follow-up', 'Necesitan seguimiento')}</div><div class="v" style="margin:4px 0 0">${follow.length}</div></div></div><div class="small">${follow.map(m => esc(first(m.name))).join(', ') || L('Nobody right now', 'Nadie por ahora')}</div></div>
    <div class="card kpi"><div class="row"><div class="ic">${icon('fruit', 22)}</div><div class="grow"><div class="lbl">${L('Group fruit this year', 'Fruto del grupo este año')}</div><div class="v" style="margin:4px 0 0">${gYear} <small>/ ${fg}</small></div><div class="small">${L('This team', 'Este equipo')}: ${fYear}</div></div></div>
      <div class="row" style="justify-content:space-between"><span class="small">${monthLabel(mo).split(' ')[0]}: <b>${fMonth}</b></span><div class="stepper" style="gap:6px"><button data-act="fruitDec" aria-label="−" style="width:30px;height:30px">−</button><button class="plus" data-act="fruitInc" aria-label="+" style="width:30px;height:30px">+</button></div></div></div>
  </div>
  <div class="card">
    <div class="row" style="flex-wrap:wrap;margin-bottom:6px"><div class="grow" style="min-width:min(260px,100%)"><div class="h">${L('Members · 7 monthly goals', 'Miembros · 7 metas mensuales')}</div><div class="small">${L('Tap any box to update it. Tap a name to edit the member’s profile.', 'Toca una casilla para actualizarla. Toca un nombre para editar el perfil.')}</div></div>
      <form class="row" data-form="addMember" style="gap:8px;flex:1 1 260px;max-width:380px"><input class="input" id="new-member" placeholder="${L('New member name', 'Nombre del nuevo miembro')}" autocomplete="off" aria-label="${L('New member name', 'Nombre del nuevo miembro')}" maxlength="120"><button class="btn" type="submit">${L('Add', 'Agregar')}</button></form></div>
    <div class="tablewrap members-table"><table>
      <thead><tr><th>${L('Member', 'Miembro')}</th>${GOALS().map(g => `<th class="c"><div class="thi">${icon(g.icon, 18)}${g.short}${goalTarget(t, g) > 1 ? ` ${goalTarget(t, g)}x` : ''}</div></th>`).join('')}<th class="c">${L('Total', 'Total')}</th></tr></thead>
      <tbody>${ms.map(m => { const c = mdone(m, t, mo); return `<tr>
        <td><button class="who" data-act="memberOpen" data-m="${esc(m.id)}" style="border:0;background:transparent;padding:0;text-align:left">${plant(cntStage(c), 24, c <= 3)}<b>${esc(m.name)}</b>${m.tag ? ` <span class="tag info">${esc(m.tag)}</span>` : ''}</button></td>
        ${GOALS().map(g => { const s = mstatus(m, t, g, mo), v = mval(m, g.k, mo), tg = goalTarget(t, g); return `<td><button class="cell ${s}" data-act="goalOpen" data-m="${esc(m.id)}" data-k="${g.k}" aria-label="${esc(m.name)} · ${g.name}">${s === 'd' ? icon('check', 14).replace('#fff', 'currentColor') : tg > 1 ? `${v}/${tg}` : '—'}</button></td>`; }).join('')}
        <td class="c"><span class="tag ${c === 7 ? 'ok' : c >= 5 ? 'warn' : 'bad'}">${c}/7</span></td></tr>`; }).join('') || `<tr><td colspan="9" class="muted" style="padding:20px 8px">${L('No members yet. Add the first one above.', 'Aún no hay miembros. Agrega el primero arriba.')}</td></tr>`}</tbody>
    </table></div>
    <div class="mcards">${ms.map(m => { const c = mdone(m, t, mo); return `<div class="mcard">
      <div class="row"><button class="who grow" data-act="memberOpen" data-m="${esc(m.id)}" style="border:0;background:transparent;padding:0;text-align:left">${plant(cntStage(c), 26, c <= 3)}<b>${esc(m.name)}</b>${m.tag ? ` <span class="tag info">${esc(m.tag)}</span>` : ''}</button><span class="tag ${c === 7 ? 'ok' : c >= 5 ? 'warn' : 'bad'}">${c}/7</span></div>
      <div class="mgoals">${GOALS().map(g => { const s = mstatus(m, t, g, mo), v = mval(m, g.k, mo), tg = goalTarget(t, g); return `<button class="mgoal ${s}" data-act="goalOpen" data-m="${esc(m.id)}" data-k="${g.k}" aria-label="${esc(m.name)} · ${g.name}">${icon(g.icon, 18)}<span>${g.short}</span><b>${s === 'd' ? '✓' : tg > 1 ? `${v}/${tg}` : '—'}</b></button>`; }).join('')}</div>
    </div>`; }).join('') || `<p class="muted">${L('No members yet. Add the first one above.', 'Aún no hay miembros. Agrega el primero arriba.')}</p>`}</div>
    <div class="legend"><span><i style="background:var(--ok)"></i>${L('Done', 'Hecho')}</span><span><i style="background:var(--warn-bar)"></i>${L('In progress', 'En progreso')}</span><span><i style="background:var(--bad-soft);border:1px dashed var(--bad)"></i>${L('Missing', 'Falta')}</span></div>
  </div>`;
}

function viewSettings() {
  const bs = BRANCHES();
  const missing = Object.keys(S.groups).filter(g => !CODED_G.includes(g)).length + Object.keys(S.teams).filter(t => !S.groups[S.teams[t].groupId] && !CODED.includes(t)).length;
  const codeRow = (kind, id, label, sub, has) => `<form class="list-row" data-form="${kind}Code" data-id="${esc(id)}"><div class="grow"><b>${esc(label)}</b><div class="small">${sub ? esc(sub) + ' · ' : ''}${has ? L('Has a code', 'Tiene código') : `<span style="color:var(--warn)">${L('No code yet', 'Sin código aún')}</span>`}</div></div>
      <input class="input num" style="width:110px" id="${kind}c-${esc(id)}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="${L('New', 'Nuevo')}" aria-label="${L('New code for', 'Nuevo código para')} ${esc(label)}"><button class="btn ghost sm" type="submit">${L('Save', 'Guardar')}</button></form>`;
  return `
  <div class="head"><div class="grow"><h1>${L('Settings', 'Ajustes')}</h1><p>${L('Codes, Excel import, branches and backups.', 'Códigos, importar Excel, sucursales y copias de seguridad.')}</p></div></div>
  <div class="settings-grid">
    <div class="card">
      <div class="h">${L('Import teams from Excel', 'Importar equipos desde Excel')}</div>
      <p class="small">${L('Upload the church directory (.xlsx): one sheet per branch, groups with “EQUIPO 1, 2…” columns and members below. You’ll see a summary before anything changes.', 'Sube el directorio de la iglesia (.xlsx): una hoja por sucursal, grupos con columnas “EQUIPO 1, 2…” y los miembros debajo. Verás un resumen antes de cambiar nada.')}</p>
      <label class="btn" for="excel-file" style="cursor:pointer">${icon('people', 16)}${L('Choose Excel file…', 'Elegir archivo Excel…')}</label>
      <input type="file" id="excel-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-act="excelPick" hidden>
      <p class="small" style="margin-top:8px">${L('Importing again with an updated Excel adds new teams and people and keeps goals already entered, codes, and anyone added in the app.', 'Importar de nuevo un Excel actualizado agrega equipos y personas nuevas y conserva las metas ya anotadas, los códigos y a quien se haya agregado en la app.')}</p>
    </div>
    <div class="card">
      <div class="h">${L('App code', 'Código de la app')}</div>
      <p class="small">${L('Opens the region results, monthly reports, the teams overview and these settings. It doesn’t open team members.', 'Abre los resultados de la región, los reportes mensuales, el resumen de equipos y estos ajustes. No abre los miembros de los equipos.')}</p>
      <form class="inline-form" data-form="mainCode"><input class="input num" id="mc-new" ${codeAttrs(8)} placeholder="${L('New code', 'Nuevo código')}" aria-label="${L('New app code', 'Nuevo código de la app')}"><input class="input num" id="mc-new2" ${codeAttrs(8)} placeholder="${L('Repeat it', 'Repítelo')}" aria-label="${L('Repeat the new app code', 'Repite el nuevo código')}"><button class="btn" type="submit">${L('Change', 'Cambiar')}</button></form>
      <p class="small" style="margin-top:8px">${L('4 to 8 digits. Everyone who uses the app code needs the new one.', 'De 4 a 8 dígitos. Todos los que usan el código de la app necesitarán el nuevo.')}</p>
    </div>
  </div>
  <div class="card">
    <div class="row" style="flex-wrap:wrap"><div class="grow"><div class="h">${L('Group codes', 'Códigos de grupo')}</div>
      <div class="small">${L('Each group has one code that opens all of its teams. Codes are stored scrambled, so they can only be replaced, not shown.', 'Cada grupo tiene un código que abre todos sus equipos. Los códigos se guardan cifrados: solo se pueden reemplazar, no mostrar.')}</div></div>
      <button class="btn" data-act="generateCodes" ${missing ? '' : 'disabled'}>${L(`Create the ${missing} missing codes`, `Crear los ${missing} códigos que faltan`)}</button></div>
    ${bs.map(b => { const gs = groupsOfBranch(b.id), ts = teamsOfBranch(b.id); if (!ts.length && !gs.length) return ''; return `<details class="codes-branch"><summary><b>${esc(b.name)}</b> <span class="muted">· ${gs.length} ${L('groups', 'grupos')} · ${ts.length} ${L('teams', 'equipos')}</span></summary>
      ${gs.map(g => codeRow('group', g.id, g.name, `${ts.filter(t => t.groupId === g.id).length} ${L('teams', 'equipos')}`, CODED_G.includes(g.id))).join('')}
      ${ts.filter(t => !S.groups[t.groupId]).map(t => codeRow('team', t.id, teamName(t), '', CODED.includes(t.id))).join('')}
    </details>`; }).join('')}
  </div>
  <div class="settings-grid">
    <div class="card">
      <div class="h">${L('Branches', 'Sucursales')}</div>
      <div class="small" style="margin-bottom:6px">${L('Removing a branch also removes its groups, teams and members.', 'Quitar una sucursal también quita sus grupos, equipos y miembros.')}</div>
      ${bs.map(b => `<div class="list-row"><input class="input" id="bn-${esc(b.id)}" value="${esc(b.name)}" data-act="branchName" data-b="${esc(b.id)}" aria-label="${L('Branch name', 'Nombre de la sucursal')}" maxlength="120">
        <button class="btn ${CONFIRM === 'b-' + b.id ? 'danger' : 'ghost'} sm" data-act="branchDelete" data-b="${esc(b.id)}">${CONFIRM === 'b-' + b.id ? L('Tap again', 'Toca otra vez') : L('Remove', 'Quitar')}</button></div>`).join('')}
      <form class="inline-form" data-form="addBranch" style="margin-top:10px"><input class="input" id="new-branch" placeholder="${L('New branch name', 'Nombre de la nueva sucursal')}" aria-label="${L('New branch name', 'Nombre de la nueva sucursal')}" maxlength="120"><button class="btn" type="submit">${L('Add branch', 'Agregar sucursal')}</button></form>
    </div>
    <div class="card">
      <div class="h">${L('Backup', 'Copia de seguridad')}</div>
      <p class="small">${L('Download a copy of all reports, groups, teams and members. Keep it somewhere safe. Codes are not included.', 'Descarga una copia de todos los reportes, grupos, equipos y miembros. Guárdala en un lugar seguro. Los códigos no se incluyen.')}</p>
      <a class="btn ghost" href="/api/export" download>${L('Download backup', 'Descargar copia')}</a>
      <p class="small" style="margin-top:16px">${L('Restore replaces everything with the contents of a backup file.', 'Restaurar reemplaza todo con el contenido de una copia.')}</p>
      <label class="btn ghost" for="restore-file" style="cursor:pointer">${L('Restore from a backup…', 'Restaurar desde una copia…')}</label>
      <input type="file" id="restore-file" accept="application/json,.json" data-act="restore" hidden>
    </div>
    <div class="card">
      <div class="h">${L('Example data', 'Datos de ejemplo')}</div>
      <p class="small">${L('Fill the app with example data to try it, or erase everything to start fresh. Both replace all current data.', 'Llena la app con datos de ejemplo para probarla, o borra todo para empezar de nuevo. Ambas opciones reemplazan todos los datos actuales.')}</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn ${CONFIRM === 'example' ? 'danger' : 'ghost'}" data-act="loadExample">${CONFIRM === 'example' ? L('Tap again to replace everything', 'Toca otra vez para reemplazar todo') : L('Load example data', 'Cargar datos de ejemplo')}</button>
        <button class="btn ${CONFIRM === 'empty' ? 'danger' : 'ghost'}" data-act="startEmpty">${CONFIRM === 'empty' ? L('Tap again to erase everything', 'Toca otra vez para borrar todo') : L('Start empty', 'Empezar vacío')}</button>
      </div>
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
      ${isMain() ? field('ts-leader', L('Team leader', 'Líder del equipo'), `value="${esc(t.leader)}" maxlength="120" autocomplete="off"`)  : ''}
      ${S.groups[t.groupId] ? field('ts-code', L('New code for the whole group (leave empty to keep it)', 'Nuevo código para todo el grupo (vacío para dejarlo igual)'), 'type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off"') : ''}
      <div class="small">${L('Attendance goal per month', 'Meta de asistencia por mes')}</div>
      <div class="seg">${[1, 2, 3, 4].map(n => `<button type="button" class="${(SHEET.att || t.attTarget || 4) === n ? 'on' : ''}" data-act="attTarget" data-n="${n}">${n}</button>`).join('')}</div>
      <div class="row" style="justify-content:space-between">
        ${isMain() ? `<button class="btn ${CONFIRM === 't-' + t.id ? 'danger' : 'ghost'}" data-act="teamDelete">${CONFIRM === 't-' + t.id ? L('Tap again: removes the team and its members', 'Toca otra vez: quita el equipo y sus miembros') : L('Remove team', 'Quitar equipo')}</button>` : '<span></span>'}
        <button class="btn" data-act="teamSave">${icon('check', 14)}${L('Save', 'Guardar')}</button></div>`;
  } else if (SHEET.type === 'addTeam') {
    const bid = TEAMS_BRANCH || BRANCHES()[0]?.id, gs = groupsOfBranch(bid);
    body = `<div class="row"><div class="h grow">${L('Add team', 'Agregar equipo')} · ${esc(S.branches[bid]?.name || '')}</div>${close}</div>
      <div class="field"><label for="nt-group">${L('Group', 'Grupo')}</label><select class="sel" id="nt-group">${gs.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}<option value="__new">${L('New group…', 'Grupo nuevo…')}</option></select></div>
      ${field('nt-newgroup', L('New group name (only for a new group)', 'Nombre del grupo nuevo (solo si es nuevo)'), 'maxlength="120" autocomplete="off" placeholder="Adultas · Nombre del líder"')}
      ${field('nt-leader', L('Team leader’s full name (optional)', 'Nombre completo del líder (opcional)'), 'maxlength="120" autocomplete="off"')}
      <div class="small">${L('The team gets the next number in its group and opens with its group’s code. A new group gets its code in Settings.', 'El equipo recibe el siguiente número de su grupo y se abre con el código de su grupo. Un grupo nuevo recibe su código en Ajustes.')}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-act="teamAdd" ${BUSY ? 'disabled' : ''}>${L('Add team', 'Agregar equipo')}</button></div>`;
  }
  else if (SHEET.type === 'group') {
    const g = { id: SHEET.g, ...S.groups[SHEET.g] };
    body = `<div class="row"><div class="h grow">${L('Group settings', 'Ajustes del grupo')}</div>${close}</div>
      ${field('gs-name', L('Group name', 'Nombre del grupo'), `value="${esc(g.name)}" maxlength="120" autocomplete="off"`)}
      ${field('gs-leader', L('Group leader', 'Líder del grupo'), `value="${esc(g.leader)}" maxlength="120" autocomplete="off"`)}
      ${field('gs-fruit', L('Yearly fruit goal for the group', 'Meta anual de fruto del grupo'), `type="number" min="0" value="${+g.fruitGoal || 0}"`)}
      ${field('gs-code', L('New group code (leave empty to keep it)', 'Nuevo código del grupo (vacío para dejarlo igual)'), 'type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off"')}
      <label class="check"><input type="checkbox" id="gs-future" ${g.future ? 'checked' : ''}>${L('Future group (planned, not yet open)', 'Futuro grupo (planificado, aún no abierto)')}</label>
      <div class="row" style="justify-content:space-between">
        <button class="btn ${CONFIRM === 'g-' + g.id ? 'danger' : 'ghost'}" data-act="groupDelete">${CONFIRM === 'g-' + g.id ? L('Tap again: removes its teams and members', 'Toca otra vez: quita sus equipos y miembros') : L('Remove group', 'Quitar grupo')}</button>
        <button class="btn" data-act="groupSave">${icon('check', 14)}${L('Save', 'Guardar')}</button></div>`;
  } else if (SHEET.type === 'codes') {
    const rows = SHEET.codes.map(c => c.kind === 'group'
      ? { branch: S.branches[S.groups[c.id]?.branchId]?.name || '', what: S.groups[c.id]?.name || '', code: c.code, order: `${branchOrder(S.groups[c.id]?.branchId)}-${groupOrder(c.id)}-0` }
      : { branch: S.branches[S.teams[c.id]?.branchId]?.name || '', what: `${groupName(S.teams[c.id] || {})} · ${teamName(S.teams[c.id] || {})}`, code: c.code, order: `${branchOrder(S.teams[c.id]?.branchId)}-${groupOrder(S.teams[c.id]?.groupId)}-${S.teams[c.id]?.num || 0}` })
      .sort((a, b) => a.order.localeCompare(b.order, undefined, { numeric: true }));
    body = `<div class="row"><div class="h grow">${L('New codes', 'Códigos nuevos')}</div>${close}</div>
      <p class="small" style="margin:0"><b>${L('Write these down or copy them now: they can’t be shown again.', 'Anótalos o cópialos ahora: no se pueden volver a mostrar.')}</b> ${L('Share each group’s code with its group leader and team leaders.', 'Comparte el código de cada grupo con su líder de grupo y sus líderes de equipo.')}</p>
      <div class="tablewrap" style="max-height:50vh;overflow:auto"><table><thead><tr><th>${L('Branch', 'Sucursal')}</th><th>${L('Group', 'Grupo')}</th><th class="c">${L('Code', 'Código')}</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r.branch)}</td><td>${esc(r.what)}</td><td class="c"><b class="num" style="font-size:16px">${esc(r.code)}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="copyCodes">${L('Copy list', 'Copiar lista')}</button><button class="btn" data-act="close">${L('Done', 'Listo')}</button></div>
      <textarea id="codes-text" class="input" rows="3" readonly style="font-size:12px">${esc(rows.map(r => `${r.branch}\t${r.what}\t${r.code}`).join('\n'))}</textarea>`;
  } else if (SHEET.type === 'import') {
    const p = SHEET.preview;
    body = `<div class="row"><div class="h grow">${L('Import from Excel', 'Importar desde Excel')}</div>${close}</div>
      <div class="small">${esc(SHEET.fileName)}</div>
      <div class="tablewrap"><table><thead><tr><th>${L('Branch', 'Sucursal')}</th><th class="c">${L('Groups', 'Grupos')}</th><th class="c">${L('Teams', 'Equipos')}</th><th class="c">${L('People', 'Personas')}</th></tr></thead>
      <tbody>${p.summary.map(b => `<tr><td>${esc(b.name)}</td><td class="c num">${b.groups}</td><td class="c num">${b.teams}</td><td class="c num">${b.members}</td></tr>`).join('')}</tbody></table></div>
      ${p.skipped?.length ? `<p class="small" style="margin:0">${L('Sheets without teams (not imported):', 'Hojas sin equipos (no se importan):')} ${esc(p.skipped.join(', '))}</p>` : ''}
      ${p.warnings?.length ? `<div class="banner" style="background:var(--warn-soft);display:block"><b>${L('Check in the Excel', 'Revisar en el Excel')}</b><ul class="small" style="margin:6px 0 0;padding-left:18px">${p.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <p class="small" style="margin:0">${L('“Add and update” keeps everything already in the app (goals, codes, people added here) and adds what’s new. “Replace” first removes all groups, teams, members and their codes.', '“Agregar y actualizar” conserva todo lo que ya está en la app (metas, códigos, personas agregadas aquí) y agrega lo nuevo. “Reemplazar” primero quita todos los grupos, equipos, miembros y sus códigos.')}</p>
      <div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <button class="btn ${CONFIRM === 'replace' ? 'danger' : 'ghost'}" data-act="importApply" data-mode="replace" ${BUSY ? 'disabled' : ''}>${CONFIRM === 'replace' ? L('Tap again to replace everything', 'Toca otra vez para reemplazar todo') : L('Replace', 'Reemplazar')}</button>
        <button class="btn" data-act="importApply" data-mode="merge" ${BUSY ? 'disabled' : ''}>${L('Add and update', 'Agregar y actualizar')}</button></div>`;
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
  app.querySelectorAll('.sheet input[id], .sheet textarea[id], .auth input[id]').forEach(el => { if (el.type !== 'checkbox' && el.type !== 'file' && el.id !== 'code-in') typed[el.id] = el.value; });
  if (SCREEN === 'loading') app.innerHTML = `<div class="auth"><div class="small">${L('Loading…', 'Cargando…')}</div></div>`;
  else if (SCREEN === 'login') app.innerHTML = screenLogin();
  else {
    readHash();
    let body;
    if (VIEW === 'report' && isMain()) body = viewReport();
    else if (VIEW === 'teams' && isMain()) body = viewTeams();
    else if (VIEW === 'settings' && isMain()) body = viewSettings();
    else if (VIEW === 'team') body = viewTeam();
    else body = viewRegion();
    app.innerHTML = `${topBar()}<main class="wrap">${body}</main><footer class="wrap">Church Status · ${L('Santiago Region', 'Región Santiago')}</footer>${sheet()}`;
  }
  for (const [id, v] of Object.entries(typed)) { const el = document.getElementById(id); if (el && el.value !== v) el.value = v; }
  if (focusId && focusId !== 'code-in') { const el = document.getElementById(focusId); if (el) { el.focus(); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch (e) {} } }
}

/* =====================================================================
   EVENTS
   ===================================================================== */
const app = document.getElementById('app');

async function enterCode(form, teamId) {
  const code = CODE_IN;
  if (code.length < 4) return;
  BUSY = true; AUTH_ERR = ''; render();
  try {
    const out = form === 'login'
      ? await api('POST', '/api/login', { code })
      : await api('POST', '/api/unlock', { teamId, code });
    ACCESS = out.access; CODE_IN = ''; BUSY = false;
    if (form === 'login') { await enterApp(); return; }
    await loadData(); TEAM_MONTH = CURRENT_MONTH; render();
  } catch (x) { AUTH_ERR = x.message; CODE_IN = ''; BUSY = false; render(); }
}

app.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'overlay' && e.target !== el) return;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  if (!['memberDelete', 'teamDelete', 'branchDelete', 'groupDelete', 'importApply', 'loadExample', 'startEmpty'].includes(act)) CONFIRM = null;
  switch (act) {
    case 'lang': LANG = el.dataset.l; try { localStorage.setItem('cs-lang', LANG); } catch (x) {} break;
    case 'logout': try { await api('POST', '/api/logout', {}); } catch (x) {} stopLive(); ACCESS = null; CODE_IN = ''; AUTH_ERR = ''; SCREEN = 'login'; history.replaceState(null, '', location.pathname); break;
    case 'pinKey': if (CODE_IN.length < 8) CODE_IN += el.dataset.k; AUTH_ERR = ''; break;
    case 'pinDel': CODE_IN = CODE_IN.slice(0, -1); AUTH_ERR = ''; break;
    case 'period': PERIOD = el.dataset.p; break;
    case 'openReport': REPORT = { branch: el.dataset.b, month: CURRENT_MONTH, draft: {} }; location.hash = 'report'; return;
    case 'openTeam': TEAM_MONTH = CURRENT_MONTH; CODE_IN = ''; AUTH_ERR = ''; location.hash = 'team-' + el.dataset.t; return;
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
      const code = val('ts-code');
      if (code && !/^\d{4,8}$/.test(code)) { toast(L('The code needs 4 to 8 digits.', 'El código necesita de 4 a 8 dígitos.')); return; }
      const patch = { name: val('ts-name') };
      if (SHEET.att) patch.attTarget = SHEET.att;
      if (isMain() && val('ts-leader')) patch.leader = val('ts-leader');
      const id = VIEW_TEAM;
      if (code) {
        const gid = S.teams[id]?.groupId;
        try { await api('POST', `/api/codes/group/${encodeURIComponent(gid)}`, { code }); if (!CODED_G.includes(gid)) CODED_G.push(gid); }
        catch (x) { toast(x.message); return; }
      }
      SHEET = null;
      if (await save('teams', id, patch)) toast(code ? L('Saved. Share the new group code with the whole group.', 'Guardado. Comparte el nuevo código con todo el grupo.') : L('Team saved.', 'Equipo guardado.'));
      return;
    }
    case 'teamDelete': {
      const key = 't-' + VIEW_TEAM;
      if (CONFIRM !== key) { CONFIRM = key; break; }
      const id = VIEW_TEAM; SHEET = null; CONFIRM = null; location.hash = 'teams';
      if (await save('teams', id, null, 'delete')) { for (const [mid, m] of Object.entries(S.members)) if (m.teamId === id) delete S.members[mid]; toast(L('Team removed.', 'Equipo quitado.')); }
      return;
    }
    case 'addTeamOpen': SHEET = { type: 'addTeam' }; break;
    case 'teamAdd': {
      const leader = val('nt-leader'), code = '', bid = TEAMS_BRANCH || BRANCHES()[0]?.id;
      let groupId = document.getElementById('nt-group')?.value || '__new';
      if (code && !/^\d{4,8}$/.test(code)) { toast(L('The code needs 4 to 8 digits.', 'El código necesita de 4 a 8 dígitos.')); return; }
      if (groupId === '__new' && !val('nt-newgroup')) { toast(L('Write the new group’s name.', 'Escribe el nombre del grupo nuevo.')); return; }
      BUSY = true; render();
      if (groupId === '__new') {
        groupId = uid('g');
        const order = groupsOfBranch(bid).reduce((a, g) => Math.max(a, g.order ?? 0), -1) + 1;
        if (!await save('groups', groupId, { branchId: bid, name: val('nt-newgroup'), leader: '', order, future: false }, 'set')) { BUSY = false; render(); return; }
      }
      const num = TEAMS().filter(t => t.groupId === groupId).reduce((a, t) => Math.max(a, t.num || 0), 0) + 1, id = uid('t');
      const ok = await save('teams', id, { branchId: bid, groupId, name: '', num, note: '', leader, fruitGoal: 0, attTarget: 4, fruit: {} }, 'set');
      if (ok && code) {
        try { await api('POST', `/api/codes/team/${encodeURIComponent(id)}`, { code }); CODED.push(id); toast(L('Team added. Share its code with the team leader.', 'Equipo agregado. Comparte su código con el líder del equipo.')); }
        catch (x) { toast(L(`Team added, but the code wasn’t saved: ${x.message} Set it in Settings.`, `Equipo agregado, pero el código no se guardó: ${x.message} Ponlo en Ajustes.`)); }
      } else if (ok) toast(L(`Team ${num} added.`, `Equipo ${num} agregado.`));
      BUSY = false; SHEET = null; render(); return;
    }
    case 'pickTeamsBranch': TEAMS_BRANCH = el.dataset.b; break;
    case 'groupSettings': SHEET = { type: 'group', g: el.dataset.g }; break;
    case 'groupSave': {
      const id = SHEET.g, code = val('gs-code'), name = val('gs-name');
      if (!name) { toast(L('Write the group’s name.', 'Escribe el nombre del grupo.')); return; }
      if (code && !/^\d{4,8}$/.test(code)) { toast(L('The code needs 4 to 8 digits.', 'El código necesita de 4 a 8 dígitos.')); return; }
      if (code) {
        try { await api('POST', `/api/codes/group/${encodeURIComponent(id)}`, { code }); if (!CODED_G.includes(id)) CODED_G.push(id); }
        catch (x) { toast(x.message); return; }
      }
      SHEET = null;
      if (await save('groups', id, { name, leader: val('gs-leader'), fruitGoal: Math.max(0, Math.round(+val('gs-fruit') || 0)), future: !!document.getElementById('gs-future')?.checked })) toast(code ? L('Group saved. Share the new code with the group leader.', 'Grupo guardado. Comparte el nuevo código con el líder del grupo.') : L('Group saved.', 'Grupo guardado.'));
      return;
    }
    case 'groupDelete': {
      const key = 'g-' + SHEET.g;
      if (CONFIRM !== key) { CONFIRM = key; break; }
      const id = SHEET.g; SHEET = null; CONFIRM = null;
      if (await save('groups', id, null, 'delete')) { await loadData(); toast(L('Group removed.', 'Grupo quitado.')); }
      return;
    }
    case 'generateCodes': {
      BUSY = true; render();
      try { const out = await api('POST', '/api/codes/generate', {}); await loadData(); SHEET = { type: 'codes', codes: out.codes }; }
      catch (x) { toast(x.message); }
      BUSY = false; break;
    }
    case 'copyCodes': {
      const ta = document.getElementById('codes-text');
      try { await navigator.clipboard.writeText(ta.value); toast(L('Copied. Paste it into a document or message.', 'Copiado. Pégalo en un documento o mensaje.')); }
      catch (x) { ta.select(); toast(L('Select the text below and copy it.', 'Selecciona el texto de abajo y cópialo.')); }
      return;
    }
    case 'importApply': {
      const mode = el.dataset.mode;
      if (mode === 'replace' && CONFIRM !== 'replace') { CONFIRM = 'replace'; break; }
      CONFIRM = null; BUSY = true; render();
      try {
        const out = await api('POST', '/api/import-excel', { file: SHEET.file, mode });
        await loadData(); SHEET = null;
        const st = out.stats;
        toast(L(`Imported: ${st.groupsAdded} groups, ${st.teamsAdded} teams and ${st.membersAdded} people added.`, `Importado: ${st.groupsAdded} grupos, ${st.teamsAdded} equipos y ${st.membersAdded} personas agregadas.`));
        location.hash = 'teams';
      } catch (x) { toast(x.message); }
      BUSY = false; break;
    }
    case 'branchDelete': {
      const key = 'b-' + el.dataset.b;
      if (CONFIRM !== key) { CONFIRM = key; break; }
      CONFIRM = null; if (await save('branches', el.dataset.b, null, 'delete')) toast(L('Branch removed.', 'Sucursal quitada.'));
      return;
    }
    case 'loadExample': case 'startEmpty': {
      const key = act === 'loadExample' ? 'example' : 'empty';
      if (CONFIRM !== key) { CONFIRM = key; break; }
      CONFIRM = null;
      try { await api('POST', '/api/example', { empty: key === 'empty' }); await loadData(); toast(key === 'empty' ? L('Everything was erased.', 'Se borró todo.') : L('Example data loaded.', 'Datos de ejemplo cargados.')); }
      catch (x) { toast(x.message); }
      break;
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
  else if (act === 'groupFruitGoal') save('groups', el.dataset.g, { fruitGoal: Math.max(0, Math.round(+el.value || 0)) });
  else if (act === 'branchName') { const name = el.value.trim(); if (name && name !== S.branches[el.dataset.b]?.name) save('branches', el.dataset.b, { name }); else render(); }
  else if (act === 'excelPick') {
    const file = el.files && el.files[0]; if (!file) return;
    el.value = '';
    if (file.size > 20e6) { toast(L('That file is too big (over 20 MB).', 'Ese archivo es muy grande (más de 20 MB).')); return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const b64 = btoa(bin);
      const preview = await api('POST', '/api/import-excel', { file: b64, mode: 'preview' });
      SHEET = { type: 'import', file: b64, fileName: file.name, preview }; render();
    } catch (x) { toast(x.message); }
  }
  else if (act === 'restore') {
    const file = el.files && el.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await api('POST', '/api/import', { branches: data.branches, groups: data.groups || {}, teams: data.teams, members: data.members });
      await loadData(); render(); toast(L('Backup restored.', 'Copia restaurada.'));
    } catch (x) { toast(x instanceof SyntaxError ? L('That file isn’t a Church Status backup.', 'Ese archivo no es una copia de Church Status.') : x.message); }
    el.value = '';
  }
});

app.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.act === 'draft') REPORT.draft[el.id] = el.value;
  if (el.id === 'code-in') {
    CODE_IN = el.value.replace(/\D/g, '').slice(0, 8); el.value = CODE_IN; AUTH_ERR = '';
    const ok = document.querySelector('.keys .ok'); if (ok) ok.disabled = CODE_IN.length < 4;
    const err = document.getElementById('code-err'); if (err) err.textContent = '';
  }
});

app.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target.dataset.form;
  if (form === 'login' || form === 'unlock') {
    const inp = document.getElementById('code-in');
    if (inp) CODE_IN = inp.value.replace(/\D/g, '').slice(0, 8);
    return enterCode(form, e.target.dataset.t);
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
  if (form === 'mainCode') {
    const a = val('mc-new'), b = val('mc-new2');
    if (!/^\d{4,8}$/.test(a)) { toast(L('The code needs 4 to 8 digits.', 'El código necesita de 4 a 8 dígitos.')); return; }
    if (a !== b) { toast(L('The two codes don’t match.', 'Los dos códigos no coinciden.')); return; }
    try { await api('POST', '/api/codes/main', { code: a }); document.getElementById('mc-new').value = ''; document.getElementById('mc-new2').value = ''; toast(L('App code changed.', 'Código de la app cambiado.')); }
    catch (x) { toast(x.message); }
  }
  if (form === 'teamCode' || form === 'groupCode') {
    const kind = form === 'teamCode' ? 'team' : 'group', id = e.target.dataset.id, inp = document.getElementById(`${kind}c-${id}`), code = inp.value.trim();
    if (!/^\d{4,8}$/.test(code)) { toast(L('The code needs 4 to 8 digits.', 'El código necesita de 4 a 8 dígitos.')); return; }
    try {
      await api('POST', `/api/codes/${kind}/${encodeURIComponent(id)}`, { code }); inp.value = '';
      const list = kind === 'team' ? CODED : CODED_G; if (!list.includes(id)) list.push(id);
      render(); toast(L('Code saved. Share it with the leader.', 'Código guardado. Compártelo con el líder.'));
    } catch (x) { toast(x.message); }
  }
});
app.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-act]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && SHEET) { SHEET = null; render(); }
});
window.addEventListener('hashchange', () => { SHEET = null; CODE_IN = ''; AUTH_ERR = ''; render(); });

/* =====================================================================
   START
   ===================================================================== */
async function enterApp() {
  SCREEN = 'loading'; render();
  await loadData();
  SCREEN = 'app';
  if (!location.hash) location.hash = isMain() ? 'region' : 'team-' + (openTeams()[0]?.id || '');
  startLive(); render();
}
(async () => {
  try {
    await api('GET', '/api/status');
    try { ACCESS = (await api('GET', '/api/me')).access; } catch (e) { SCREEN = 'login'; render(); return; }
    await enterApp();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="auth"><div class="card"><div class="h">${L('Can’t reach the Church Status server', 'No se puede conectar con el servidor de Church Status')}</div><div class="small">${esc(e.message)}</div><a class="btn" href="/">${L('Try again', 'Intentar de nuevo')}</a></div></div>`;
  }
})();
