'use strict';
/* Icons and health plants. Uses the globals THEME and L defined in app.js. */
/* =====================================================================
   ICONS: pixel set + smooth set (soft 3D gradients or clean flat)
   ===================================================================== */
const PAL = {
  k:'#1d1b2f', r:'#9a2f3e', D:'#5e1b27', R:'#d0475a', p:'#f19aa4', g:'#e8b04b', G:'#a8761f',
  w:'#f4e9cf', W:'#ffffff', s:'#e8b088', S:'#c0835c', u:'#3d6fb6', U:'#86bdf0', n:'#2f6b3a',
  N:'#4f9a5a', l:'#9bd46c', B:'#c0673a', b:'#9a4f2c', o:'#4a3020', c:'#8a8aa0', y:'#d6c46a', Y:'#8f8740'
};
function pix(rows, scale) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  let out = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (!PAL[ch]) { x++; continue; }
      let x2 = x; while (x2 < row.length && row[x2] === ch) x2++;
      out += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${PAL[ch]}"/>`;
      x = x2;
    }
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges" aria-hidden="true">${out}</svg>`;
}
const PIX = {
  heart: [".kk...kk.","kRpk.kRRk","kpRRkRRRk","kRRRRRRRk",".kRRRRRk.","..kRRRk..","...kRk...","....k...."],
  bible: [".kkkkkkkgk.","kDrrrrrrgrk","kDrrrrrrrrk","kDrgggggrrk","kDrrrrrrrrk","kDrrgggrrrk","kDrrrrrrrrk","kDrrrrrrrrk","kDrrrrrrrrk","kDrrrrrrrrk","kDwwwwwwwwk",".kkkkkkkkk."],
  hands: ["....kkk....","...kskSk...","...kskSk...","..ksskSSk..","..ksskSSk..",".kssskSSSk.",".kssskSSSk.",".kssskSSSk.",".kssskSSSk.",".kuuukUUUk.",".kuuukUUUk.",".kkkkkkkkk."],
  calendar: [".k.....k.","kkkkkkkkk","kRRRRRRRk","kkkkkkkkk","kWWWWWWWk","kWkWWWkWk","kWWWWWWWk","kWWWkWWWk","kkkkkkkkk"],
  coin: ["..kkkkk..",".kgggggk.","kggGGGggk","kgGgggGgk","kgGgggGgk","kgGgggGgk","kggGGGggk",".kgggggk.","..kkkkk.."],
  laptop: [".kkkkkkk.",".kUUUUUk.",".kUWUUUk.",".kUUUUUk.",".kkkkkkk.","kccccccck","kkkkkkkkk"],
  sign: [".......kk","......kgk",".....kgk.","....kgk..","...kgk...","..kGk....",".kkk.....",".........","kk.kk.kk."],
  globe: ["..kkkkk..",".kuNNuuk.","kuNNNuuuk","kuuNuuNNk","kuuuuNNNk","kNuuuuNuk","kNNuuuuuk",".kuNuuuk.","..kkkkk.."],
  speech: ["kkkkkkkkk","kWWWWWWWk","kWWWWWWWk","kWgWgWgWk","kWWWWWWWk","kkkWkkkkk","..kWk....","..kk....."],
  speechHeart: ["kkkkkkkkk","kWWRWRWWk","kWRRRRRWk","kWWRRRWWk","kWWWRWWWk","kkkWkkkkk","..kWk....","..kk....."],
  lamp: ["....R....","...RgR...","....g....","...kkk...",".kkBBBkkk","kBBBBBBBk","kbBBBBBbk",".kbbbbbk.","..kkkkk.."],
  drop: ["....k....","...kUk...","...kUk...","..kUUuk..",".kWUUUuk.",".kWUUUuk.",".kUUUuuk.","..kuuuk..","...kkk..."],
  fruit: [".....k...","....kNN..",".kkkkkkk.","kRpRRRRRk","kpRRRRRRk","kRRRRRRrk","kRRRRRrrk",".kRRRrrk.","..kkkkk.."],
  check: ["......W",".....WW","W...WW.","WW.WW..",".WWW...","..W...."],
  star: ["....k....","...kgk...","kkkkgkkkk","kggggggGk",".kgggGGk.","..kgkGk..",".kgk.kGk.","kkk...kkk"],
  people: [".kk...kk.","kssk.kSSk","kssk.kSSk",".kk...kk.","kuuk.kRRk","kuuk.kRRk","kuuk.kRRk","kkkk.kkkk"],
  chart: ["k........","k......g.","k..u..gg.","k..uu.gg.","k.uuu.gg.","k.uuuNgg.","kkkkkkkkk"],
  gear: ["..kk.kk..",".kcckcck.","kccccccck","kcckkkcck",".kck.kck.","kcckkkcck","kccccccck",".kcckcck.","..kk.kk.."],
  pin: ["..kkkkk..",".kRRRRRk.","kRRkkkRRk","kRRkWkRRk","kRRkkkRRk",".kRRRRRk.","..kRRRk..","...kRk...","....k...."],
  target: ["..kkkkk..",".kRRRRRk.","kRWWWWWRk","kRWRRRWRk","kRWRgRWRk","kRWRRRWRk","kRWWWWWRk",".kRRRRRk.","..kkkkk.."],
};
function pal() {
  return THEME === 'soft'
    ? { red:'url(#sRed)', wine:'url(#sWine)', gold:'url(#sGold)', blue:'url(#sBlue)', sky:'#d8eeff', green:'url(#sGreen)', brown:'url(#sBrown)', cream:'#fffaf0', ink:'#3a3460', gray:'url(#sGray)', purple:'url(#sPurple)', skin:'url(#sSkin)', white:'#ffffff' }
    : { red:'#e5484d', wine:'#be123c', gold:'#f59e0b', blue:'#3b82f6', sky:'#dbeafe', green:'#22a55a', brown:'#c2703a', cream:'#ffffff', ink:'#334155', gray:'#94a3b8', purple:'#6d5bd0', skin:'#f2b48a', white:'#ffffff' };
}
const HL = () => THEME === 'soft'; // highlight shine on soft icons
const shine = (cx, cy, rx, ry) => HL() ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".55"/>` : '';
const SM = {
  heart: P => `<path d="M12 21.2S3 15.6 3 9.4A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 9 2.4c0 6.2-9 11.8-9 11.8z" fill="${P.red}"/>${shine(8, 9.5, 2.2, 1.3)}`,
  bible: P => `<rect x="4" y="2.5" width="16" height="19" rx="2.6" fill="${P.wine}"/><rect x="5.5" y="17.6" width="14.5" height="3.9" rx="1.2" fill="${P.cream}"/><rect x="6.5" y="7" width="7.5" height="1.8" rx=".9" fill="${P.gold}"/><rect x="6.5" y="10.2" width="5" height="1.8" rx=".9" fill="${P.gold}"/><path d="M15.5 2.5h2.5v6.5l-1.25-1.1-1.25 1.1z" fill="${P.gold}"/>${shine(7.5, 5.5, 1.6, 1)}`,
  hands: P => `<path d="M11.4 3.2c-.9 0-1.6.7-1.7 1.6L8.6 13l-2.7 4.4V21h5.5V4.4c0-.4.2-1.2 0-1.2z" fill="${P.skin}"/><path d="M12.6 3.2c.9 0 1.6.7 1.7 1.6l1.1 8.2 2.7 4.4V21h-5.5V4.4c0-.4-.2-1.2 0-1.2z" fill="${P.skin}" opacity=".85"/><rect x="5.6" y="18.6" width="12.8" height="3" rx="1.2" fill="${P.blue}"/>`,
  calendar: P => `<rect x="3" y="4.5" width="18" height="16.5" rx="3.5" fill="${P.cream}" stroke="${THEME === 'clean' ? '#cbd5e1' : 'none'}"/><path d="M3 8a3.5 3.5 0 0 1 3.5-3.5h11A3.5 3.5 0 0 1 21 8v2H3z" fill="${P.red}"/><rect x="7" y="2.5" width="2" height="4" rx="1" fill="${P.ink}"/><rect x="15" y="2.5" width="2" height="4" rx="1" fill="${P.ink}"/><circle cx="8" cy="14" r="1.3" fill="${P.gray}"/><circle cx="12" cy="14" r="1.3" fill="${P.gray}"/><circle cx="16" cy="14" r="1.3" fill="${P.green}"/><circle cx="8" cy="17.6" r="1.3" fill="${P.gray}"/><circle cx="12" cy="17.6" r="1.3" fill="${P.gray}"/>`,
  coin: P => `<circle cx="12" cy="12" r="9.5" fill="${P.gold}"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><path d="M12 16.4s-3.8-2.3-3.8-5a2 2 0 0 1 3.8-.9 2 2 0 0 1 3.8.9c0 2.7-3.8 5-3.8 5z" fill="#fff"/>${shine(8.2, 7.5, 2, 1.1)}`,
  laptop: P => `<rect x="4" y="4.5" width="16" height="11.5" rx="2" fill="${P.ink}"/><rect x="5.5" y="6" width="13" height="8.5" rx="1" fill="${P.blue}"/><path d="M2 17h20l-1.2 2.6a1.5 1.5 0 0 1-1.4.9H4.6a1.5 1.5 0 0 1-1.4-.9z" fill="${P.gray}"/>${shine(8.5, 8, 2, 1)}`,
  sign: P => `<path d="M3 19.5c1.6-2.8 2.8-.2 4.3-1.4s1.4-2.4 3-1 2.2 1.2 3.4.2" stroke="${P.ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/><g transform="rotate(42 15 9)"><rect x="12.8" y="1.5" width="4.4" height="13" rx="2.2" fill="${P.purple}"/><path d="M12.8 14.5h4.4L15 18.5z" fill="${P.gold}"/></g>`,
  globe: P => `<circle cx="12" cy="12" r="9.5" fill="${P.blue}"/><path d="M7 6.5c2 .3 3 1.8 2.4 3.3-.6 1.4-2.4 1.2-2.8 2.9-.3 1.3-1.6 1.6-2.6.8A9.5 9.5 0 0 1 7 6.5zM14 4.6c1.8.4 3.3 1.4 4.4 2.8-1.2 1-2.8.6-3.6 1.8-.7 1-.1 2.6-1.4 3.1-1.2.4-2-1-1.6-2.4.5-1.6 2.4-2.3 2.2-5.3zM15.2 15c1.5-.6 3.4-.4 4.3.2a9.5 9.5 0 0 1-5.3 5.6c-.5-1.2-.4-2.6.2-3.6.3-.6.2-1.8.8-2.2z" fill="${P.green}"/>${shine(8.5, 6.8, 2.2, 1.2)}`,
  speech: P => `<path d="M5 3.5h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-8.5L6 21.5v-4H5a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z" fill="${P.blue}"/><circle cx="8" cy="10.5" r="1.5" fill="#fff"/><circle cx="12" cy="10.5" r="1.5" fill="#fff"/><circle cx="16" cy="10.5" r="1.5" fill="#fff"/>${shine(6.5, 5.6, 2, .9)}`,
  speechHeart: P => `<path d="M5 3.5h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-8.5L6 21.5v-4H5a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z" fill="${P.purple}"/><path d="M12 15.2s-4.2-2.5-4.2-5.4a2.2 2.2 0 0 1 4.2-1 2.2 2.2 0 0 1 4.2 1c0 2.9-4.2 5.4-4.2 5.4z" fill="#fff"/>${shine(6.5, 5.6, 2, .9)}`,
  lamp: P => `<path d="M12 2.5c2 2.6 3 4.1 3 5.9a3 3 0 0 1-6 0c0-1.8 1-3.3 3-5.9z" fill="${P.gold}"/><rect x="9.5" y="11.5" width="5" height="2.6" rx="1" fill="${P.ink}"/><path d="M3.5 14h17a1 1 0 0 1 .9 1.4l-1.5 3.4a3 3 0 0 1-2.8 1.7H7a3 3 0 0 1-2.8-1.7l-1.6-3.4A1 1 0 0 1 3.5 14z" fill="${P.brown}"/>${shine(8, 15.5, 2.2, .8)}`,
  drop: P => `<path d="M12 2.5c3 4.4 6.6 8 6.6 12a6.6 6.6 0 0 1-13.2 0c0-4 3.6-7.6 6.6-12z" fill="${P.blue}"/>${HL() ? '<ellipse cx="9.4" cy="13.5" rx="1.6" ry="2.6" fill="#fff" opacity=".6"/>' : '<path d="M9 14.5a3 3 0 0 0 3 3" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".8"/>'}`,
  fruit: P => `<path d="M12 7.5c-1.4-1-3-1.4-4.6-1C4.6 7.2 3.5 10 3.9 13c.5 4 3.2 8 5.8 8 .9 0 1.4-.4 2.3-.4s1.4.4 2.3.4c2.6 0 5.3-4 5.8-8 .4-3-.7-5.8-3.5-6.5-1.6-.4-3.2 0-4.6 1z" fill="${P.red}"/><path d="M12 7.5c0-2 .6-3.6 2-4.6" stroke="${P.brown}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13 4.2c1.5-1.6 3.8-1.6 5-.6-1.2 1.4-3.4 1.8-5 .6z" fill="${P.green}"/>${shine(7.5, 10, 1.6, 2.4)}`,
  check: P => `<path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  star: P => `<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" fill="${P.gold}" stroke-linejoin="round"/>${shine(10, 8.5, 1.6, 1)}`,
  people: P => `<circle cx="8.5" cy="8" r="3.4" fill="${P.skin}"/><path d="M2.5 20c0-3.9 2.7-6.6 6-6.6s6 2.7 6 6.6z" fill="${P.blue}"/><circle cx="16.5" cy="9" r="2.9" fill="${P.skin}"/><path d="M12.2 20c.1-3.3 2-5.6 4.4-5.6 2.6 0 4.9 2.3 4.9 5.6z" fill="${P.red}"/>`,
  chart: P => `<rect x="3" y="13" width="4" height="8" rx="1.4" fill="${P.blue}"/><rect x="10" y="8" width="4" height="13" rx="1.4" fill="${P.green}"/><rect x="17" y="3" width="4" height="18" rx="1.4" fill="${P.gold}"/>`,
  gear: P => `<path d="M10.3 2.5h3.4l.5 2.6 2 .9 2.2-1.5 2.4 2.4-1.5 2.2.9 2 2.6.5v3.4l-2.6.5-.9 2 1.5 2.2-2.4 2.4-2.2-1.5-2 .9-.5 2.6h-3.4l-.5-2.6-2-.9-2.2 1.5-2.4-2.4 1.5-2.2-.9-2-2.6-.5v-3.4l2.6-.5.9-2-1.5-2.2 2.4-2.4 2.2 1.5 2-.9z" fill="${P.gray}"/><circle cx="12" cy="12" r="3.4" fill="${P.cream}"/>`,
  pin: P => `<path d="M12 22s-7-6.6-7-12a7 7 0 0 1 14 0c0 5.4-7 12-7 12z" fill="${P.red}"/><circle cx="12" cy="10" r="2.8" fill="#fff"/>${shine(9, 6.4, 1.6, 1)}`,
  target: P => `<circle cx="12" cy="12" r="9.5" fill="${P.red}"/><circle cx="12" cy="12" r="6.6" fill="#fff"/><circle cx="12" cy="12" r="3.8" fill="${P.red}"/><circle cx="12" cy="12" r="1.4" fill="#fff"/>`,
  pencil: P => `<g transform="rotate(45 12 12)"><rect x="9.5" y="2" width="5" height="15" rx="1.5" fill="${P.gold}"/><path d="M9.5 17h5L12 22z" fill="${P.ink}"/></g>`,
};
PIX.pencil = PIX.sign;
function icon(name, px) {
  if (THEME === 'pixel') {
    const g = PIX[name] || PIX.heart;
    const w = Math.max(...g.map(r => r.length));
    return pix(g, Math.max(1, Math.round(px / w)));
  }
  return `<svg viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true">${(SM[name] || SM.heart)(pal())}</svg>`;
}

/* =====================================================================
   PLANTS: health visual (seed → sprout → young → leafy → full bloom)
   ===================================================================== */
function pixelPlantRows(stage, wilt) {
  const W = 16, H = 19;
  const g = [...Array(H)].map(() => Array(W).fill('.'));
  const set = (x, y, c) => { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
  ["..kooooooooook..","..kkkkkkkkkkkk..","..kBBBBBBBBBBk..","..kkkkkkkkkkkk..","...kbbbbbbbbk...","...kbbbbbbbbk...","....kkkkkkkk...."]
    .forEach((r, i) => [...r].forEach((c, x) => g[12 + i][x] = c));
  const S = wilt ? 'Y' : 'n', Lf = wilt ? 'Y' : 'N', HI = wilt ? 'y' : 'l';
  if (stage === 0) { set(6, 11, 'o'); set(7, 11, 'b'); set(8, 11, 'b'); set(9, 11, 'o'); set(7, 10, 'b'); return g.map(r => r.join('')); }
  const len = [0, 2, 5, 8, 9][stage], top = 12 - len, d = wilt ? 1 : 0;
  for (let y = top; y < 12; y++) { set(7, y, S); set(8, y, Lf); }
  for (let i = 0, y = 10; y > top; y -= 3, i++) {
    const left = stage >= 3 || i % 2 === 0, right = stage >= 3 || i % 2 === 1;
    if (left) { set(6, y, Lf); set(5, y, Lf); set(5, y - 1 + d, HI); set(4, y - 1 + d, HI); if (stage >= 3) set(3, y - 1 + d, stage === 4 && i === 1 ? 'p' : HI); }
    if (right) { set(9, y, Lf); set(10, y, Lf); set(10, y - 1 + d, HI); set(11, y - 1 + d, HI); if (stage >= 3) set(12, y - 1 + d, stage === 4 && i === 1 ? 'p' : HI); }
  }
  set(6, top + d, HI); set(5, top - 1 + d * 2, HI); set(9, top + d, HI); set(10, top - 1 + d * 2, HI);
  if (stage === 4) { set(7, 0, 'p'); set(8, 0, 'p'); set(6, 1, 'p'); set(7, 1, 'g'); set(8, 1, 'g'); set(9, 1, 'p'); set(7, 2, 'p'); set(8, 2, 'p'); }
  return g.map(r => r.join(''));
}
function smoothPlant(stage, w, wilt) {
  const soft = THEME === 'soft';
  const leafA = wilt ? (soft ? 'url(#sOlive)' : '#c2b04a') : (soft ? 'url(#sLeaf)' : '#34c26f');
  const leafB = wilt ? (soft ? 'url(#sOlive)' : '#a99a3c') : (soft ? 'url(#sGreen)' : '#22a55a');
  const stemC = wilt ? '#9a8f3a' : (soft ? '#3a9a52' : '#1f9150');
  const pot = soft ? 'url(#sBrown)' : '#d97745', rim = soft ? 'url(#sRim)' : '#e8915e';
  let s = soft ? `<ellipse cx="32" cy="74" rx="19" ry="2.4" fill="#2e2a4a" opacity=".14"/>` : '';
  const len = [0, 13, 24, 33, 40][stage], top = 50 - len;
  const leaf = (cx, cy, sd, rx, ry, fill) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${sd * (wilt ? 38 : -32)} ${cx} ${cy})"/>`;
  if (stage === 0) {
    s += `<ellipse cx="32" cy="47.5" rx="4.5" ry="3.2" fill="${soft ? 'url(#sBrown)' : '#9a5b2e'}"/><path d="M32 45c0-3 2-5 4.5-5.2" stroke="${stemC}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  } else {
    const bend = wilt ? 5 : 0;
    s += `<path d="M32 51 C 32 ${50 - len * .5}, ${32 + bend} ${top + 8}, ${32 + bend} ${top + (wilt ? 3 : 0)}" stroke="${stemC}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    for (let i = 0, y = 44; y > top + 5; y -= 9, i++) {
      const sides = stage >= 3 ? [-1, 1] : [i % 2 ? 1 : -1];
      sides.forEach(sd => { s += leaf(32 + sd * 8.5, y, sd, 8.5, 3.8, sd < 0 ? leafA : leafB); });
    }
    const cy = top + (wilt ? 5 : 2), cx = 32 + bend;
    s += leaf(cx - 6, cy, -1, 6.5, 3.2, leafA) + leaf(cx + 6, cy, 1, 6.5, 3.2, leafB);
    if (stage === 4) {
      const flower = (fx, fy, r) => [0, 72, 144, 216, 288].map(a => `<circle cx="${fx + Math.cos(a * Math.PI / 180) * r}" cy="${fy + Math.sin(a * Math.PI / 180) * r}" r="${r * .8}" fill="${soft ? 'url(#sPink)' : '#f472b6'}"/>`).join('') + `<circle cx="${fx}" cy="${fy}" r="${r * .7}" fill="${soft ? 'url(#sGold)' : '#fbbf24'}"/>`;
      s += flower(32, top - 3, 3.6) + flower(17, 26, 2.6) + flower(47, 26, 2.6);
    }
  }
  s += `<path d="M15 55h34l-3.8 17.4a2.6 2.6 0 0 1-2.5 2H21.3a2.6 2.6 0 0 1-2.5-2z" fill="${pot}"/>`;
  s += `<rect x="11.5" y="47.5" width="41" height="9" rx="3.5" fill="${rim}"/>`;
  if (soft) s += `<rect x="15" y="49.5" width="12" height="2.4" rx="1.2" fill="#fff" opacity=".45"/><path d="M19.5 59h3l1.6 12h-2.4z" fill="#fff" opacity=".22"/>`;
  return `<svg viewBox="0 0 64 76" width="${w}" height="${Math.round(w * 76 / 64)}" aria-hidden="true">${s}</svg>`;
}
function plant(stage, w, wilt) {
  return THEME === 'pixel' ? pix(pixelPlantRows(stage, wilt), Math.max(1, Math.round(w / 16))) : smoothPlant(stage, w, wilt);
}
const pctStage = p => p >= 90 ? 4 : p >= 70 ? 3 : p >= 45 ? 2 : p >= 20 ? 1 : 0;
const cntStage = c => c === 7 ? 4 : c >= 5 ? 3 : c >= 3 ? 2 : c >= 1 ? 1 : 0;
const healthWord = p => p >= 90 ? L('IN FULL BLOOM', 'EN PLENA FLOR') : p >= 70 ? L('GROWING STRONG', 'CRECIENDO FUERTE') : p >= 45 ? L('GROWING', 'CRECIENDO') : L('NEEDS WATER', 'NECESITA AGUA');
