'use strict';
// Reads an .xlsx file (a zip of XML files) with Node's built-in zlib, and turns the church
// directory layout into branches → groups → teams → members.
const zlib = require('node:zlib');

/* ---------------- minimal .xlsx reader ---------------- */
function unzip(buf) {
  // Find the "end of central directory" record, then walk the central directory.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    if (!/\.(xml|rels)$/i.test(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    if (method === 0) files[name] = raw.toString('utf8');
    else if (method === 8) files[name] = zlib.inflateRawSync(raw).toString('utf8');
  }
  return files;
}
const decode = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e.toLowerCase()]
  ?? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
const texts = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join('');
const colIndex = letters => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

// Returns [{ name, cells: { 'row,col': 'text' }, maxRow }]
function readXlsx(buf) {
  const files = unzip(buf);
  const wb = files['xl/workbook.xml'];
  if (!wb) throw new Error('not an Excel workbook');
  const rels = files['xl/_rels/workbook.xml.rels'] || '';
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1], t = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && t) target[id] = t.replace(/^\/?(xl\/)?/, 'xl/');
  }
  const shared = [...(files['xl/sharedStrings.xml'] || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]*)"/.exec(m[0])?.[1] || '');
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const xml = files[target[rid]];
    if (!xml) continue;
    const cells = {}; let maxRow = 0;
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)(\d+)"/.exec(c[1]); if (!ref) continue;
      const type = /t="([^"]+)"/.exec(c[1])?.[1], inner = c[2] || '';
      let v;
      if (type === 's') v = shared[+(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1])];
      else if (type === 'inlineStr') v = texts(inner);
      else v = decode(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      v = String(v ?? '').replace(/\s+/g, ' ').trim();
      if (!v) continue;
      const r = +ref[2], col = colIndex(ref[1]);
      cells[`${r},${col}`] = v; if (r > maxRow) maxRow = r;
    }
    sheets.push({ name, cells, maxRow });
  }
  return sheets;
}

/* ---------------- church directory layout ---------------- */
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
const titleCase = s => s.toLowerCase().split(' ').map((w, i) => (i && SMALL.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const isCount = v => /^\d+\s+integrantes?$/i.test(v);
const isTeamHeader = v => /^equipo\s*\d+/i.test(v);
const colLetter = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// "Ana Pérez (Tl-Jóvenes)" → { name: 'Ana Pérez', tag: 'Tl-Jóvenes', leader: true }
function parseMember(raw) {
  const tags = [...raw.matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(Boolean);
  const name = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const tag = tags.join(', ');
  return { name, tag, leader: /^tl\b/i.test(tags[0] || '') };
}
// "ADULTAS · ROSA GUZMÁN" → { name: 'Adultas · Rosa Guzmán', leader: 'Rosa Guzmán' }
function parseGroup(raw, branchName) {
  const future = /^futuro grupo\b/i.test(raw);
  const parts = raw.split('·').map(s => s.trim()).filter(Boolean);
  const name = parts.map(p => titleCase(p)).join(' · ');
  const generic = new Set(['grupo', 'grupos', 'futuro grupo', 'ninos', 'adultas', 'adultos', 'mujeres', 'hombres', 'jovenes', 'jovenes adultas', 'jovenes adultos', 'zoom', norm(branchName)]);
  const people = parts.filter(p => !/^\d+$/.test(p) && !generic.has(norm(p)));
  return { name, leader: people.length ? titleCase(people[people.length - 1]) : '', future };
}

// Returns { branches: [{ sheet, name, groups: [{ name, leader, future, teams: [{ num, label, note, members: [...] }] }] }], warnings: [] }
function parseDirectory(sheets) {
  const out = { branches: [], warnings: [], skipped: [] };
  for (const sh of sheets) {
    const get = (r, c) => sh.cells[`${r},${c}`] || '';
    const rows = [...new Set(Object.keys(sh.cells).map(k => +k.split(',')[0]))].sort((a, b) => a - b);
    const headerRows = rows.filter(r => Object.entries(sh.cells).some(([k, v]) => +k.split(',')[0] === r && isTeamHeader(v)));
    if (!headerRows.length) { out.skipped.push(sh.name); continue; }
    // Teams under "PLANIFICACIÓN DE FUTUROS GRUPOS" / "FUTURO GRUPO · …" belong to the same group as the
    // teams on their left (e.g. Equipo 4 and 5 of a group), so they are imported into that group.
    const branch = { sheet: sh.name, name: sh.name.trim(), groups: [] };
    const warn = msg => out.warnings.push(`${sh.name}: ${msg}`);
    headerRows.forEach((hr, i) => {
      const end = i + 1 < headerRows.length ? headerRows[i + 1] - 2 : sh.maxRow;   // the next block's group title sits just above its EQUIPO row
      // Group title: first text in column A above the EQUIPO row; a "FUTURO GRUPO" title may sit in another column.
      let titleRow = hr - 1; while (titleRow > 0 && !get(titleRow, 1)) titleRow--;
      const title = get(titleRow, 1) || `Grupo ${i + 1}`;
      const current = { ...parseGroup(title, branch.name), teams: [] };
      // Every column with names in this block is a team; it should have an "EQUIPO n" header.
      const cols = new Set();
      for (const k of Object.keys(sh.cells)) { const [r, c] = k.split(',').map(Number); if (r >= hr && r <= end) cols.add(c); }
      let lastNum = 0, lastTeam = null;
      for (const c of [...cols].sort((a, b) => a - b)) {
        const header = get(hr, c);
        const members = [], seen = new Set();
        let hasCount = false;
        for (let r = hr + 1; r <= end; r++) {
          const v = get(r, c);
          if (!v) continue;
          if (isCount(v)) { hasCount = true; break; }
          if (isTeamHeader(v)) break;
          const m = parseMember(v);
          if (!m.name) continue;
          if (seen.has(norm(m.name))) {
            // The first name repeated in its own team is the team leader, listed twice: keep one, mark as leader.
            if (norm(members[0].name) === norm(m.name)) {
              members[0].leader = true;
              warn(`“${m.name}” aparece dos veces al inicio del equipo (columna ${colLetter(c)}); se importó una vez como líder del equipo.`);
            } else warn(`“${m.name}” aparece dos veces en el mismo equipo (columna ${colLetter(c)}); se importó una vez.`);
            continue;
          }
          seen.add(norm(m.name)); members.push(m);
        }
        if (!isTeamHeader(header) && !members.length) continue;
        // A column with names but no EQUIPO heading and no count of its own continues the team on its left.
        if (!isTeamHeader(header) && !hasCount && lastTeam) {
          for (const m of members) if (!lastTeam.members.some(x => norm(x.name) === norm(m.name))) lastTeam.members.push(m);
          warn(`la columna ${colLetter(c)} de “${title}” tiene nombres sin encabezado EQUIPO ni conteo propio; se unieron al Equipo ${lastTeam.num}.`);
          continue;
        }
        let num, note = '';
        if (isTeamHeader(header)) {
          num = +(/equipo\s*(\d+)/i.exec(header)?.[1]) || lastNum + 1;
          const extra = header.split('·').slice(1).join('·').trim();
          if (extra) note = titleCase(extra);
        } else {
          num = lastNum + 1;
          warn(`la columna ${colLetter(c)} de “${title}” tiene nombres sin encabezado EQUIPO; se importó como Equipo ${num}.`);
        }
        lastNum = Math.max(lastNum, num);
        const team = { num, note, members };
        lastTeam = team;
        current.teams.push(team);
      }
      if (current.teams.length) branch.groups.push(current);
    });
    out.branches.push(branch);
  }
  return out;
}

module.exports = { readXlsx, parseDirectory, norm };
