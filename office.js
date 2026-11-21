/* Claude Fantasy: the Front Office screen (v2). One file for both apps: the Mac page inlines it (fantasy/ui.py) and the
   phone loads it as a script. It draws what fantasy/office.py's view() returns:

     the office     a drawn office: every desk on its team's carpet, the game plan and the scoreboard on the walls, a
                    trophy case for the prediction record, the meeting table in the middle. Click anyone or anything.
     the panel      beside the office (under it on a narrow window): the gist and game plan, or whatever was clicked
     the tabs       the board (every memo), predictions, trade reviews, standing orders, meetings

   FO.mount(element, { data, api, phone })   api = the Mac's pywebview.api (asking, orders, meetings); the phone has none,
   FO.update(data)                           so there it only shows.
   No inline handlers (the phone's page forbids them): every click goes through data-fo="…". */
(function () {
  'use strict';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = iso => { const d = new Date(String(iso || '').length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? null : d; };
  function hm(d) { let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'), ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return `${h}:${m} ${ap}`; }
  function when(iso) {  // "today 8:20 AM", "Thu 8:20 AM", "Nov 3 8:20 AM"
    const d = dt(iso); if (!d) return '';
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().setHours(0, 0, 0, 0))) / 864e5);
    const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : Math.abs(days) < 7 ? DAYS[d.getDay()] : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return `${day} ${hm(d)}`;
  }
  const day = iso => { const d = dt(iso); return d ? `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}` : ''; };
  function ago(iso) {
    const d = dt(iso); if (!d) return '';
    const m = Math.max(0, Math.round((Date.now() - d) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  }
  const cut = (s, n) => { s = String(s || ''); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
  const MOOD = { good: ['#6dbb7f', 'On track'], watch: ['#e7b65a', 'Keep an eye on'], worry: ['#ef8a6c', 'A real risk'] };

  // ---------------- the drawing: a 3/4 view on a grid (x runs to the right wall, y to the left wall, z up) ----------------
  const K = 32, AX = 0.866 * K, AY = 0.5 * K, FW = 20, FD = 15.6, WH = 4.4, OX = 472, OY = 156, W = 1066, H = 760;
  const P = (x, y, z = 0) => [OX + (x - y) * AX, OY + (x + y) * AY - z * K];
  const f1 = v => v.toFixed(1), S = p => f1(p[0]) + ',' + f1(p[1]);
  const poly = (pts, a = '') => `<polygon points="${pts.map(S).join(' ')}" ${a}/>`;
  function box(x, y, z, w, d, h, c) {  // c = [top, front-left face, front-right face, top edge]
    return poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], `fill="${c[1]}"`)
      + poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], `fill="${c[2]}"`)
      + poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], `fill="${c[0]}"${c[3] ? ` stroke="${c[3]}" stroke-width="1"` : ''}`);
  }
  const hull = (x, y, z, w, d, h) => [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x, y + d, z + h)];
  const WA = (x1, x2, z1, z2) => [P(x1, 0, z1), P(x2, 0, z1), P(x2, 0, z2), P(x1, 0, z2)];  // on the back-right wall (y = 0)
  const WB = (y1, y2, z1, z2) => [P(0, y1, z1), P(0, y2, z1), P(0, y2, z2), P(0, y1, z2)];  // on the back-left wall (x = 0)
  // writing that lies on a wall or the floor (it leans with the surface)
  const tA = (x, z, t, cls, a = '') => { const p = P(x, 0, z); return `<text class="${cls}" transform="matrix(.866 .5 0 1 ${f1(p[0])} ${f1(p[1])})" ${a}>${esc(t)}</text>`; };
  const tB = (y, z, t, cls, a = '') => { const p = P(0, y, z); return `<text class="${cls}" transform="matrix(.866 -.5 0 1 ${f1(p[0])} ${f1(p[1])})" ${a}>${esc(t)}</text>`; };
  const tF = (x, y, t, cls, a = '') => { const p = P(x, y); return `<text class="${cls}" transform="matrix(.866 .5 -.866 .5 ${f1(p[0])} ${f1(p[1])})" ${a}>${esc(t)}</text>`; };

  const WOOD = ['#5d4d3d', '#3d3229', '#2f2720', 'rgba(255,255,255,.14)'], SEAT = ['#3d3c38', '#2a2927', '#222120'], BACK = ['#46453f', '#302f2c', '#272624'];
  const PS = 1.38;
  function look(id) {  // each person's own hair, from the desk's name
    let h = 7; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { hair: h % 4, hc: ['#2a211b', '#4a3423', '#7a5632', '#d9c591'][(h >> 3) % 4] };
  }
  function person(x, y, col, s, L) {
    const b = P(x, y), X = b[0], wa = P(x, y, 0.62)[1], sh = P(x, y, 1.36 * s)[1], hy = P(x, y, 1.62 * s)[1], k = PS * s, w1 = 8.5 * k, w2 = 6 * k, r = 6.4 * k;
    const d = `M${f1(X - w2)},${f1(wa)} L${f1(X - w1)},${f1(sh + 4)} Q${f1(X - w1)},${f1(sh - 1)} ${f1(X - w1 + 5)},${f1(sh - 1)} L${f1(X + w1 - 5)},${f1(sh - 1)} Q${f1(X + w1)},${f1(sh - 1)} ${f1(X + w1)},${f1(sh + 4)} L${f1(X + w2)},${f1(wa)} Z`;
    const cap = (y0, w) => `<path d="M${f1(X - r * w)},${f1(hy - r * y0)} A${f1(r)},${f1(r)} 0 0 1 ${f1(X + r * w)},${f1(hy - r * y0)} Z" fill="${L.hc}"/>`;
    const hair = L.hair === 0 ? cap(.25, .97) : L.hair === 1 ? cap(.45, .9) : L.hair === 3 ? cap(.25, .97) + `<circle cx="${f1(X + r * .55)}" cy="${f1(hy - r * 1.05)}" r="${f1(r * .36)}" fill="${L.hc}"/>` : '';
    return `<path d="${d}" fill="${col}"/><path d="${d}" fill="#14110e" opacity=".38"/><circle cx="${f1(X)}" cy="${f1(hy)}" r="${f1(r)}" fill="#e9c9a8"/>${hair}`;
  }
  const chair = (px, py) => box(px - 0.32, py - 0.34, 0, 0.64, 0.6, 0.42, SEAT) + box(px - 0.32, py - 0.44, 0.42, 0.64, 0.1, 0.8, BACK);
  function plant(x, y) {
    const c = P(x + 0.25, y + 0.25, 0.75);
    return box(x, y, 0, 0.5, 0.5, 0.4, ['#6b5545', '#4a3a2f', '#3a2e25'])
      + `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="12" fill="#3f8f58"/><circle cx="${f1(c[0] - 7)}" cy="${f1(c[1] - 8)}" r="8" fill="#52a86c"/><circle cx="${f1(c[0] + 6)}" cy="${f1(c[1] - 5)}" r="6" fill="#6dbb7f"/>`;
  }
  function seats(desks) {  // where everyone sits: [x, y, desk width]
    const lg = desks.filter(d => d.team === 'leagues'), step = Math.min(3.6, 12.2 / Math.max(lg.length, 1)), pos = {};
    lg.forEach((d, i) => { pos[d.id] = [7.2 + i * step, 2.6, Math.min(1.6, step - 0.9)]; });
    return Object.assign(pos, { gm: [1.75, 1.95, 2.0], football: [2.0, 6.3, 1.4], hockey: [4.4, 6.3, 1.4], waivers: [1.9, 11.5, 1.4], trades: [3.75, 11.5, 1.4],
      values: [5.6, 11.5, 1.4], news: [14.3, 6.7, 1.4], schedule: [17.1, 6.7, 1.4], rivals: [14.3, 8.8, 1.4], forecast: [17.1, 8.8, 1.4],
      risk: [13.9, 13.9, 1.3], redteam: [15.9, 13.9, 1.3], score: [17.9, 13.9, 1.3] });
  }
  // the carpets: [team, x0, y0, x1, y1, where its name is written (x, y)]
  const RUGS = [['leagues', 6.3, 1.0, 19.7, 4.5, [6.6, 4.3]], ['lineups', 1.3, 5.0, 6.9, 7.8, [1.6, 7.6]], ['market', 1.3, 10.2, 7.5, 13.0, [1.6, 12.8]],
    ['intel', 13.6, 5.4, 19.8, 10.4, [13.9, 10.2]], ['checks', 13.2, 12.6, 19.8, 15.4, [13.5, 15.2]]];

  const obj = (id, sel, aria, tip, inner, hit, col) => `<g class="fo-o${sel === id ? ' sel' : ''}" data-fo="sel" data-id="${esc(id)}" role="button" tabindex="0" aria-label="${esc(aria)}" data-tip="${esc(tip)}" style="--sc:${col || '#d97757'}">${inner}${poly(hit, 'class="fo-hit"')}</g>`;

  function deskArt(d, x, y, w, s, st) {
    const dd = 0.95, h = 0.72, px = x + w / 2, py = y - 0.42, col = d.color || '#a6a39b';
    let g = chair(px, py) + person(px, py, col, s, look(d.id)) + box(x, y, 0, w, dd, h, WOOD);
    const mon = cx => `<ellipse class="fo-glow" cx="${f1(P(cx, y + 0.2, h + 0.35)[0])}" cy="${f1(P(cx, y + 0.2, h + 0.35)[1])}" rx="18" ry="12" fill="${col}"/>`
      + box(cx - 0.13, y + 0.12, h, 0.26, 0.16, 0.06, ['#55524b', '#3a3833', '#2e2c28'])
      + poly([P(cx - 0.34, y + 0.24, h + 0.06), P(cx + 0.34, y + 0.24, h + 0.06), P(cx + 0.34, y + 0.12, h + 0.6), P(cx - 0.34, y + 0.12, h + 0.6)], `class="fo-lid" fill="${col}" stroke="rgba(255,255,255,.28)" stroke-width=".8"`);
    g += d.id === 'gm' ? mon(px - 0.45) + mon(px + 0.45) : mon(px);
    const pl = P(x + w, y + dd / 2, 0.3), t = String(d.short || ''), pw = Math.max(30, t.length * 9.6 + 12);  // the nameplate, on the desk's right side
    g += `<g class="fo-plate" transform="matrix(.866 -.5 0 1 ${f1(pl[0])} ${f1(pl[1])})"><rect x="${f1(-pw / 2)}" y="-14" width="${f1(pw)}" height="19" rx="4" fill="#161514" fill-opacity=".94" stroke="${col}" stroke-opacity=".8"/><text x="0" y="0" text-anchor="middle" fill="${col}">${esc(t)}</text></g>`;
    const hd = P(px, py, 1.62 * s), top = hd[1] - 6.4 * PS * s;
    if (st === 'writing') g += `<g class="fo-typing" transform="translate(${f1(hd[0])} ${f1(top - 14)})"><rect x="-17" y="-10" width="34" height="20" rx="10" fill="#1c1c1b" stroke="${col}" stroke-width="1.5"/><circle cx="-7" r="2.7" fill="${col}"/><circle cx="0" r="2.7" fill="${col}"/><circle cx="7" r="2.7" fill="${col}"/></g>`;
    else if (st === 'done') g += `<g transform="translate(${f1(hd[0] + 11)} ${f1(top - 8)})"><circle r="8.5" fill="#233328" stroke="#6dbb7f" stroke-width="1.4"/><path d="M-4,0.5l3,3l5,-6" fill="none" stroke="#6dbb7f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    else if (st === 'failed') g += `<g transform="translate(${f1(hd[0] + 11)} ${f1(top - 8)})"><circle r="8.5" fill="#3f2723" stroke="#ef8a6c" stroke-width="1.4"/><path d="M-3.5,-3.5l7,7M3.5,-3.5l-7,7" stroke="#ef8a6c" stroke-width="2" stroke-linecap="round"/></g>`;
    else if (st === 'recent') g += `<path class="fo-said" transform="translate(${f1(hd[0] + 11)} ${f1(top - 9)})" d="M-8,-8h16a3,3 0 0 1 3,3v7a3,3 0 0 1-3,3h-8l-6,5v-5h-2a3,3 0 0 1-3,-3v-7a3,3 0 0 1 3,-3z" fill="${col}"/>`;
    return g;
  }
  function deskState(d, V) {
    const m = (V.status || {}).meeting;
    if (d.writing) return 'writing';
    if (m && (m.failed || []).includes(d.id)) return 'failed';
    if (m && (m.done || []).includes(d.id)) return 'done';
    return d.latest && Date.now() - dt(d.latest.at) < 90 * 60e3 ? 'recent' : '';
  }
  const stateWords = (d, st) => st === 'writing' ? 'writing now' : d.latest ? 'last memo ' + ago(d.latest.at) : 'no memo yet';
  function deskObj(d, pos, V, sel) {
    const [x, y, w] = pos, dd = 0.95, on = sel === 'desk:' + d.id, st = deskState(d, V);
    const c = P(x + w / 2, y + 0.1), ring = on ? `<ellipse class="fo-ring" cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(1.45 * AX)}" ry="${f1(1.45 * AY)}" fill="${d.color}" fill-opacity=".16" stroke="${d.color}" stroke-opacity=".75"/>` : '';
    const hit = [P(x, y - 0.9, 2.2), P(x + w, y - 0.9, 2.2), P(x + w, y - 0.9, 0), P(x + w, y + dd, 0), P(x, y + dd, 0), P(x, y + dd, 2.2)];
    return { z: x + y + w / 2, svg: obj('desk:' + d.id, sel, `${d.name}, ${stateWords(d, st)}`, `${d.name} · ${stateWords(d, st)}`,
      `<g class="fo-desk${st === 'writing' ? ' run' : ''}">${ring}${deskArt(d, x, y, w, 1, st)}</g>`, hit, d.color) };
  }
  function gmOffice(d, pos, V, sel) {  // the general manager's glass office, in the back corner
    const x0 = 0.5, y0 = 0.5, x1 = 5.3, y1 = 3.95, Hh = 2.4, c = '#d97757', st = deskState(d, V);
    let g = poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], `fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".3"`);
    g += plant(4.45, 0.75) + box(0.75, 0.62, 0, 0.5, 1.5, 1.45, ['#4a443c', '#34302a', '#292622']);
    g += deskArt(d, pos[0], pos[1], pos[2], 1.1, st);
    g += poly([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, Hh), P(x0, y1, Hh)], `fill="${c}" fill-opacity=".05" stroke="${c}" stroke-opacity=".55"`)
      + poly([P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, Hh), P(x1, y0, Hh)], `fill="${c}" fill-opacity=".035" stroke="${c}" stroke-opacity=".42"`);
    const words = st === 'writing' ? 'writing the game plan now' : d.latest ? 'last game plan ' + ago(d.latest.at) : 'writes your game plan';
    return { z: 5.6, svg: obj('desk:gm', sel, `General manager's office, ${words}`, `General manager · ${words}`, `<g class="fo-desk${st === 'writing' ? ' run' : ''}">${g}</g>`, hull(x0, y0, 0, x1 - x0, y1 - y0, Hh), c) };
  }
  function table(V, sel) {  // the meeting table: it lights up during a meeting, and the boss stands at its head
    const m = (V.status || {}).meeting, boss = (V.status || {}).boss, x = 8.3, y = 7.4, w = 3.4, d = 1.4, x0 = 7.7, y0 = 5.9, x1 = 12.4, y1 = 10.2, c = '#d97757';
    let g = poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], `fill="${c}" fill-opacity="${m ? .13 : .05}" stroke="${c}" stroke-opacity=".35" stroke-dasharray="5 6"`);
    [8.95, 10.0, 11.05].forEach(cx => { g += chair(cx, y - 0.35); });
    if (boss) g += person(7.95, y + 0.7, '#f5f3ee', 1.12, { hair: 0, hc: '#4a3423' });
    g += box(x, y, 0, w, d, 0.62, [m ? '#7a4a36' : '#5d4d3d', '#3d3229', '#2f2720', m ? 'rgba(217,119,87,.9)' : 'rgba(255,255,255,.12)']);
    [8.95, 10.0, 11.05].forEach(cx => { g += box(cx - 0.32, y + d + 0.25, 0, 0.64, 0.6, 0.42, SEAT) + box(cx - 0.32, y + d + 0.75, 0.42, 0.64, 0.1, 0.8, BACK); });
    if (m) { const p = P(x + w / 2, y + d / 2, 1.3);
      g += `<g class="fo-holo"><ellipse cx="${f1(p[0])}" cy="${f1(p[1])}" rx="44" ry="15" fill="none" stroke="${c}" stroke-width="1.6"/><ellipse cx="${f1(p[0])}" cy="${f1(p[1] - 10)}" rx="26" ry="9" fill="${c}" fill-opacity=".2" stroke="${c}" stroke-opacity=".7"/></g>`; }
    const nx = (V.next || [])[0], tip = m ? `${m.label} now` : nx ? `Meeting table · next: ${nx.label}, ${when(nx.at)}` : 'Meeting table';
    return { z: x + y + 2.5, svg: obj('meeting', sel, m ? `Meeting table, ${m.label} in progress` : 'Meeting table', tip, g, hull(x0, y0, 0, x1 - x0, y1 - y0, 0.9), c) };
  }
  function trophies(V, sel) {  // the prediction record: a glass case by the left wall, one cup per graded call (gold = right)
    const R = V.record || {}, n = R.n || 0, x = 0.2, y = 13.0, w = 0.85, d = 2.4, h = 2.3, c = '#e7b65a';
    let g = box(x, y, 0, w, d, 0.3, ['#5d4d3d', '#3d3229', '#2f2720']);
    for (let s = 0; s < 3; s++) {
      const z = 0.3 + s * 0.66;
      g += poly([P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z)], 'fill="#5d4d3d" fill-opacity=".6"');
      for (let k = 0; k < (n ? 3 : 1); k++) {
        const i = s * 3 + k, p = P(x + w / 2, y + (n ? 0.42 + k * 0.8 : 1.22), z), X = p[0], Y = p[1], gold = i < Math.round(9 * (R.right || 0) / Math.max(n, 1)) && n;
        g += `<path d="M${f1(X - 5)},${f1(Y - 15)}h10v4a5,5 0 0 1-10,0zM${f1(X - 1.5)},${f1(Y - 6.5)}h3v4h3v2h-9v-2h3z" fill="${gold ? c : 'none'}" stroke="${c}" stroke-opacity="${gold ? 1 : .35}" stroke-width="1"/>`;
      }
    }
    g += poly([P(x, y + d, 0), P(x + w, y + d, 0), P(x + w, y + d, h), P(x, y + d, h)], `fill="#fff3d6" fill-opacity=".05" stroke="${c}" stroke-opacity=".45"`)
      + poly([P(x + w, y, 0), P(x + w, y + d, 0), P(x + w, y + d, h), P(x + w, y, h)], `fill="#fff3d6" fill-opacity=".07" stroke="${c}" stroke-opacity=".5"`)
      + poly([P(x, y, h), P(x + w, y, h), P(x + w, y + d, h), P(x, y + d, h)], `fill="#fff3d6" fill-opacity=".08" stroke="${c}" stroke-opacity=".45"`);
    const tip = n ? `Trophy case · ${R.right} of ${n} calls right, ${R.open || 0} still open` : `Trophy case · nothing graded yet, ${R.open || 0} calls open`;
    return { z: x + y + 1.4, svg: obj('record', sel, tip.replace(' · ', ': '), tip, g, hull(x, y, 0, w, d, h), c) };
  }
  function room(V, sel) {  // the floor, the walls, the carpets, and what hangs on the walls
    const TC = {}; (V.teams || []).forEach(t => { TC[t.id] = t; });
    let s = poly(WA(0, FW, 0, WH), 'fill="url(#foWA)"') + poly(WB(0, FD, 0, WH), 'fill="url(#foWB)"');
    s += poly([P(0, 0), P(FW, 0), P(FW, FD), P(0, FD)], 'fill="url(#foFloor)" stroke="rgba(255,255,255,.1)"');
    for (let i = 2; i < FW; i += 2) s += `<line x1="${f1(P(i, 0)[0])}" y1="${f1(P(i, 0)[1])}" x2="${f1(P(i, FD)[0])}" y2="${f1(P(i, FD)[1])}" stroke="rgba(255,255,255,.028)"/>`;
    for (let j = 2; j < FD; j += 2) s += `<line x1="${f1(P(0, j)[0])}" y1="${f1(P(0, j)[1])}" x2="${f1(P(FW, j)[0])}" y2="${f1(P(FW, j)[1])}" stroke="rgba(255,255,255,.028)"/>`;
    s += `<polyline points="${[P(0, FD, WH), P(0, 0, WH), P(FW, 0, WH)].map(S).join(' ')}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.2"/>`
      + `<line x1="${f1(P(0, 0)[0])}" y1="${f1(P(0, 0)[1])}" x2="${f1(P(0, 0, WH)[0])}" y2="${f1(P(0, 0, WH)[1])}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>`
      + poly([P(0, 0, 0), P(FW, 0, 0), P(FW, 0, 0.2), P(0, 0, 0.2)], 'fill="#1c1b1a"') + poly([P(0, 0, 0), P(0, FD, 0), P(0, FD, 0.2), P(0, 0, 0.2)], 'fill="#181716"');
    RUGS.forEach(([t, x0, y0, x1, y1, lb]) => { const c = (TC[t] || {}).color || '#a6a39b';
      s += poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], `fill="${c}" fill-opacity=".085" stroke="${c}" stroke-opacity=".3"`)
        + tF(lb[0], lb[1], ((TC[t] || {}).name || t).toUpperCase(), 'fo-ft', `fill="${c}"`); });
    s += tF(7.7, 11.0, 'FRONT OFFICE', 'fo-logo');
    // the window on the left wall: the field outside
    s += poly(WB(4.6, 8.8, 1.3, 3.8), 'fill="#2f6a41"');
    for (let k = 0; k < 5; k++) { const yy = 5.1 + k * 0.8; s += poly([P(0, yy, 1.3), P(0, yy + 0.06, 1.3), P(0, yy + 0.06, 2.75), P(0, yy, 2.75)], 'fill="#e9f3e6" fill-opacity=".55"'); }
    s += poly(WB(4.6, 8.8, 2.75, 3.8), 'fill="#3d5a8c"') + poly(WB(4.6, 8.8, 2.72, 2.78), 'fill="#e9f3e6" fill-opacity=".45"')
      + poly(WB(4.6, 8.8, 1.3, 3.8), 'fill="none" stroke="#161514" stroke-width="5"') + poly(WB(4.6, 8.8, 1.3, 3.8), 'fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1"')
      + poly(WB(6.66, 6.74, 1.3, 3.8), 'fill="#161514"');
    return s;
  }
  function wallBoards(V, sel) {
    const plan = V.plan || {}, moves = plan.moves || [], KC = { lineup: '#6dbb7f', waiver: '#7db4e6', trade: '#e7b65a', watch: '#c3a6e8' };
    // the big board: the game plan's moves
    let g = poly(WA(5.8, 14.3, 1.0, 4.1), 'fill="#161514" stroke="#d97757" stroke-opacity=".7" stroke-width="1.4"') + tA(6.1, 3.5, 'GAME PLAN', 'fo-wt', 'fill="#d97757"');
    if (moves.length > 4) g += tA(14.0, 3.5, `+${moves.length - 4} more`, 'fo-ws', 'text-anchor="end"');
    moves.slice(0, 4).forEach((m, i) => { const z = 2.86 - i * 0.58;
      g += poly(WA(6.1, 6.28, z - 0.08, z + 0.32), `fill="${KC[m.kind] || '#a6a39b'}"`) + tA(6.46, z, cut(m.what, 26), 'fo-wr'); });
    if (!moves.length) g += tA(6.1, 2.7, plan.at ? 'Nothing to do right now' : 'No game plan yet', 'fo-wr', 'opacity=".75"') + (plan.at ? '' : tA(6.1, 2.1, 'It goes up after a meeting', 'fo-ws'));
    const b1 = obj('plan', sel, 'The game plan on the wall', plan.headline ? 'Game plan · ' + cut(plan.headline, 70) : 'Game plan · written after each meeting', g, WA(5.8, 14.3, 1.0, 4.1), '#d97757');
    // the scoreboard: every league
    let h = poly(WA(14.7, 19.8, 1.0, 4.1), 'fill="#12140f" stroke="#6dbb7f" stroke-opacity=".65" stroke-width="1.4"') + tA(14.95, 3.5, 'SCOREBOARD', 'fo-wt', 'fill="#6dbb7f"');
    (V.leagues || []).slice(0, 4).forEach((l, i) => { const z = 2.86 - i * 0.58, wc = (l.this_week || {}).win_chance_pct, col = l.sport === 'hockey' ? '#7db4e6' : '#6dbb7f';
      h += tA(14.95, z, (l.site || '')[0] + '·' + (l.sport === 'hockey' ? 'HK' : 'FB'), 'fo-wr', `fill="${col}"`) + tA(16.75, z, l.record || '', 'fo-led')
        + tA(19.58, z, wc == null ? '–' : wc + '%', 'fo-led', 'text-anchor="end"'); });
    const b2 = obj('leagues', sel, 'The scoreboard: every league', 'Scoreboard · your record and this week’s win chance in every league', h, WA(14.7, 19.8, 1.0, 4.1), '#6dbb7f');
    // the odds board on the left wall
    const R = V.record || {};
    let o = poly(WB(9.4, 12.6, 1.3, 3.8), 'fill="#161514" stroke="#e7b65a" stroke-opacity=".7" stroke-width="1.4"') + tB(12.38, 3.15, 'ODDS', 'fo-wt', 'fill="#e7b65a"')
      + tB(12.38, 2.5, `${R.open || 0} open`, 'fo-wr') + tB(12.38, 1.92, R.n ? `${R.right}/${R.n} right` : '0 graded', 'fo-wr');
    const b3 = obj('preds', sel, 'The odds board: predictions', `Odds board · ${R.open || 0} dated predictions open`, o, WB(9.4, 12.6, 1.3, 3.8), '#e7b65a');
    return b1 + b2 + b3;
  }
  const DEFS = `<defs><linearGradient id="foFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34322d"/><stop offset="1" stop-color="#232220"/></linearGradient>
    <linearGradient id="foWA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#423f39"/><stop offset="1" stop-color="#33302c"/></linearGradient>
    <linearGradient id="foWB" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#38352f"/><stop offset="1" stop-color="#292724"/></linearGradient></defs>`;
  function officeSvg(V, sel) {
    const pos = seats(V.desks || []), items = [];
    (V.desks || []).forEach(d => { if (pos[d.id]) items.push(d.id === 'gm' ? gmOffice(d, pos.gm, V, sel) : deskObj(d, pos[d.id], V, sel)); });
    items.push(table(V, sel), trophies(V, sel));
    items.sort((a, b) => a.z - b.z);
    return `<svg class="fo-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="The front office: ${(V.desks || []).length} desks. Click a desk or a wall to read it.">${DEFS}${room(V, sel)}${wallBoards(V, sel)}${items.map(i => i.svg).join('')}</svg>`;
  }

  // ---------------- the words: panel, tabs ----------------
  const FO = { data: null, sel: null, tab: 'board', api: null, phone: false, root: null, boss: null, talks: {}, filter: '', sig: {} };
  const deskOf = id => (FO.data.desks || []).find(d => d.id === id);
  const nameOf = id => id === 'sam' ? 'You' : (deskOf(id) || {}).name || id;
  const colOf = id => id === 'sam' ? '#f5f3ee' : (deskOf(id) || {}).color || '#a6a39b';
  const dot = id => `<i class="fo-dot" style="background:${colOf(id)}"></i>`;
  const mood = m => MOOD[m] ? `<span class="fo-mood" style="--c:${MOOD[m][0]}">${MOOD[m][1]}</span>` : '';
  const lgName = k => { const l = (FO.data.leagues || []).find(x => x.key === k || x.league === k); return l ? l.league : k || ''; };
  const para = t => esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');

  const ITEM = {  // how each desk's own report reads, one line per item
    moves: m => [m.what, m.why, m.when],
    lineup: m => [`Start ${m.start}` + (m.sit ? ` over ${m.sit}` : ''), m.why, m.league],
    pickups: m => [`Add ${m.add}` + (m.drop ? `, drop ${m.drop}` : ''), m.why, [m.kind, m.league].filter(Boolean).join(' · ')],
    deals: m => [`${m.sam_gives} for ${m.sam_gets}`, m.why, [m.verdict, m.with_team, m.league].filter(Boolean).join(' · ')],
    values: m => [m.player, `${m.standing}. ${m.why}`, [m.view, m.app_value != null ? `app says ${m.app_value}/game` : '', m.league].filter(Boolean).join(' · ')],
    news: m => [m.player, m.what, [m.means, m.source].filter(Boolean).join(' · ')],
    paths: m => [m.league, m.needs + (m.watch ? ` Watch: ${m.watch}` : ''), m.must_win ? 'must-win week' : ''],
    rivals: m => [m.team, `${m.read} ${m.use_it}`, m.league],
    risks: m => [m.risk, m.fix, ['', 'minor', 'real', 'serious'][m.severity] + (m.league ? ' · ' + m.league : '')],
    calls: m => [m.what, '', m.odds != null ? m.odds + '%' : ''],
  };
  const TITLE = { moves: 'What this team should do', lineup: 'Start and sit', pickups: 'Pickups', deals: 'Trades', values: 'What players are really worth', news: 'News that changes a decision',
    paths: 'The road to the playoffs', rivals: 'The other managers', risks: 'Risks' };
  function report(r) {
    if (!r) return '';
    let h = r.weak_spot ? `<p class="fo-line"><b>Weak spot:</b> ${esc(r.weak_spot)}</p>` : '';
    Object.keys(TITLE).forEach(k => { const xs = r[k]; if (!Array.isArray(xs) || !xs.length) return;
      h += `<h4>${TITLE[k]}</h4><ul class="fo-items">${xs.map(x => { const [a, b, c] = ITEM[k](x); return `<li><b>${esc(a)}</b>${c ? `<small>${esc(c)}</small>` : ''}${b ? `<p>${esc(b)}</p>` : ''}</li>`; }).join('')}</ul>`; });
    return h;
  }
  function recordLine(r) {
    if (!r || !r.n) return 'No graded predictions yet.';
    return `${r.right} of ${r.n} calls right` + (r.brier != null ? ` · accuracy score ${r.brier.toFixed(2)} (0 is perfect, 0.25 is a coin flip)` : '');
  }
  function talkHtml(key) {
    return (FO.talks[key] || []).map(t => `<div class="fo-q"><b>You</b><p>${esc(t.q)}</p></div><div class="fo-a">${t.pending
      ? `<b>${esc(nameOf(t.to))}</b><p class="fo-think">Thinking<i>.</i><i>.</i><i>.</i> <small>(about a minute)</small></p>`
      : `<b>${esc(nameOf(t.desk || t.to))}</b><p>${para(t.a)}</p>${(t.who_said || []).length ? `<ul class="fo-said-by">${t.who_said.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        ${(t.sources || []).length ? `<small class="fo-src">From: ${t.sources.map(esc).join(' · ')}</small>` : ''}`}</div>`).join('');
  }
  const askBox = (key, ph) => FO.api ? `<div class="fo-talk" data-talk="${esc(key)}">${talkHtml(key)}</div>
    <form class="fo-ask" data-fo="ask" data-key="${esc(key)}"><label class="fo-sr" for="fo-q-${esc(key)}">${esc(ph)}</label>
    <textarea id="fo-q-${esc(key)}" rows="2" placeholder="${esc(ph)}" maxlength="800"></textarea><button class="fo-btn primary" type="submit">Ask</button></form>` : '';

  function gistPanel() {
    const V = FO.data, p = V.plan;
    if (!p) return `<div class="fo-card"><span class="fo-eye">The gist</span><h3>No game plan yet</h3>
      <p class="fo-soft">The front office hasn’t met yet. Its first meeting is ${V.next && V.next[0] ? `the ${esc(V.next[0].label.toLowerCase())}, ${esc(when(V.next[0].at))}` : 'coming up'}.
      ${FO.api ? 'Or press <b>Call a meeting now</b>: every desk reports, then the general manager writes your game plan (about 15 to 25 minutes).' : 'Your Mac runs the meetings; this phone shows what they found.'}</p></div>`;
    const moves = (p.moves || []).map((m, i) => `<li class="fo-move k-${esc(m.kind)}"><span class="fo-n">${i + 1}</span><div><b>${esc(m.what)}</b>
      <small>${esc([lgName(m.league), m.when, m.who_does_it === 'crew' ? 'the crew does it' : 'needs you'].filter(Boolean).join(' · '))}</small><p>${esc(m.why)}</p></div></li>`).join('');
    const lgs = (p.leagues || []).map(l => `<li>${mood(l.mood)}<b>${esc(lgName(l.league))}</b><p>${esc(l.line)}</p></li>`).join('');
    const rul = (p.rulings || []).map(r => `<li><b>${esc(r.question)}</b><p>${esc(r.decision)} ${esc(r.why)}</p></li>`).join('');
    return `<div class="fo-card fo-gist"><span class="fo-eye">The gist · ${esc(p.label || 'Meeting')} · ${esc(when(p.at))}</span>${FO.phone ? '' : `<h3>${esc(p.headline)}</h3>
      ${p.highlight ? `<p class="fo-hl">${esc(p.highlight)}</p>` : ''}`}
      ${(p.gist || []).length ? `<ul class="fo-gl">${p.gist.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>
      <div class="fo-card"><span class="fo-eye">The game plan</span>${moves ? `<ol class="fo-moves">${moves}</ol>` : '<p class="fo-soft">Nothing to do right now.</p>'}
      ${p.summary ? `<p class="fo-soft">${esc(p.summary)}</p>` : ''}</div>
      ${lgs ? `<div class="fo-card"><span class="fo-eye">Every league</span><ul class="fo-lgs">${lgs}</ul></div>` : ''}
      ${(p.watch || []).length ? `<div class="fo-card"><span class="fo-eye">Watching</span><ul class="fo-gl">${p.watch.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      ${rul ? `<details class="fo-card fo-fold"><summary><span class="fo-eye">Where desks disagreed (${p.rulings.length})</span></summary><ul class="fo-lgs">${rul}</ul></details>` : ''}`;
  }
  function deskPanel(id) {
    const d = deskOf(id); if (!d) return gistPanel();
    const l = d.latest, st = deskState(d, FO.data), memo = [...(FO.data.board || [])].reverse().find(p => p.desk === id && (p.kind === 'memo' || p.kind === 'plan'));
    const meta = [d.bot ? `${d.bot} from your crew` : '', d.model === 'opus' ? 'Claude Opus' : 'Claude Sonnet', d.web ? 'searches the web' : 'works from the app’s numbers'].filter(Boolean).join(' · ');
    return `<div class="fo-card fo-deskhead" style="--c:${d.color}"><button class="fo-x" data-fo="sel" data-id="" aria-label="Back to the gist">×</button>
      <span class="fo-eye" style="color:${d.color}">${esc((FO.data.teams.find(t => t.id === d.team) || {}).name || '')}</span><h3>${esc(d.name)}</h3>
      <p class="fo-soft">Its job: ${esc(d.beat)}.</p><small class="fo-meta">${esc(meta)} · ${esc(stateWords(d, st))}</small></div>
      ${memo ? `<div class="fo-card">${mood(memo.mood)}<span class="fo-eye">Latest ${memo.kind === 'plan' ? 'game plan' : 'memo'} · ${esc(when(memo.at))}</span><h4 class="fo-h">${esc(memo.headline)}</h4>
        <p>${para(memo.body)}</p>${memo.for_sam || memo.highlight ? `<p class="fo-hl">${esc(memo.for_sam || memo.highlight)}</p>` : ''}${report(memo)}</div>`
      : `<div class="fo-card"><p class="fo-soft">${st === 'writing' ? 'Writing its first memo right now…' : 'No memo yet. It writes one at its next meeting.'}</p></div>`}
      <div class="fo-card"><span class="fo-eye">Its record</span><p class="fo-soft">${esc(recordLine(d.record))}</p>
        ${(d.lessons || []).length ? `<h4>Lessons from the weekly review</h4><ul class="fo-gl">${d.lessons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(d.notes || []).length ? `<details class="fo-fold"><summary>Its notebook (${d.notes.length})</summary><ul class="fo-gl">${d.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}</div>
      ${FO.api ? `<div class="fo-card"><span class="fo-eye">Ask the ${esc(d.name.toLowerCase())}</span>${askBox(id, 'Ask a question about its beat…')}</div>` : ''}`;
  }
  function meetingPanel() {
    const V = FO.data, st = V.status || {}, m = st.meeting;
    const back = `<button class="fo-x" data-fo="sel" data-id="" aria-label="Back to the gist">×</button>`;
    if (m) {
      const rows = (m.desks || []).concat((m.desks || []).includes('gm') ? [] : ['gm']).map(id => { const s = (m.writing || []).includes(id) ? ['writing', 'Writing now'] : (m.done || []).includes(id) ? ['done', 'Done'] : (m.failed || []).includes(id) ? ['failed', 'Couldn’t finish'] : ['wait', 'Waiting'];
        return `<li class="s-${s[0]}">${dot(id)}<b>${esc(nameOf(id))}</b><small>${s[1]}</small></li>`; }).join('');
      return `<div class="fo-card">${back}<span class="fo-eye">Meeting now</span><h3>${esc(m.label)}</h3><p class="fo-soft">Started ${esc(when(m.started))}${m.reason ? ` · ${esc(m.reason)}` : ''}.
        ${(m.done || []).length} of ${m.total || (m.desks || []).length} steps done. The general manager writes the game plan at the end.</p><ul class="fo-steps">${rows}</ul></div>`;
    }
    const nx = (V.next || []).map(n => `<li><b>${esc(n.label)}</b><small>${esc(when(n.at))}</small></li>`).join('');
    const L = V.limits || {};
    return `<div class="fo-card">${back}<span class="fo-eye">The meeting table</span><h3>${st.paused ? 'Paused' : 'No meeting right now'}</h3>
      ${st.paused ? `<p class="fo-warn">Your Claude plan hit its usage limit. Meetings start again by themselves ${esc(when(st.paused))}.</p>` : ''}
      ${st.last_meeting ? `<p class="fo-soft">Last: ${esc(st.last_meeting.label.toLowerCase())}, ${esc(when(st.last_meeting.ended))}.</p>` : ''}
      <h4>Coming up</h4><ul class="fo-steps">${nx}</ul>
      <p class="fo-soft fo-sm">Between these, the front office also meets by itself when something happens: a trade council when someone sends you an offer (up to ${L.councils} a day), a pre-game check before football locks (${L.prelock}), and a quick huddle on urgent news (${L.huddles}).</p>
      ${FO.api ? `<button class="fo-btn primary" data-fo="call">Call a meeting now</button>` : ''}</div>`;
  }
  function leaguesPanel() {
    const rows = (FO.data.leagues || []).map(l => { const w = l.this_week || {}, s = l.season || {}, pl = ((FO.data.plan || {}).leagues || []).find(x => lgName(x.league) === l.league);
      return `<li class="fo-lg ${esc(l.sport)}"><div><b>${esc(l.league)}</b><small>${esc(l.site)} ${esc(l.sport)} · ${esc(l.record)}${l.rank ? `, ${l.rank} of ${l.teams}` : ''}</small></div>
        <div class="fo-stat"><b>${w.win_chance_pct == null ? '–' : w.win_chance_pct + '%'}</b><small>this week vs ${esc(w.vs || '?')}</small></div>
        <div class="fo-stat"><b>${s.playoff_chance_pct == null ? '–' : s.playoff_chance_pct + '%'}</b><small>playoffs</small></div>${pl ? `<p>${mood(pl.mood)} ${esc(pl.line)}</p>` : ''}
        <button class="fo-btn sm" data-fo="sel" data-id="desk:lg-${esc(l.key)}">Open its desk</button></li>`; }).join('');
    return `<div class="fo-card"><button class="fo-x" data-fo="sel" data-id="" aria-label="Back to the gist">×</button><span class="fo-eye">The scoreboard</span><h3>Every league</h3><ul class="fo-lglist">${rows}</ul>
      <small class="fo-meta">Numbers from the crew’s last check, ${esc(when(FO.data.facts_as_of))}.</small></div>`;
  }
  function predRow(x) {
    const done = x.status !== 'open', g = x.grade || {};
    const badge = !done ? `<span class="fo-odds">${x.prob}%</span>` : x.status === 'void' ? '<span class="fo-odds void">void</span>' : `<span class="fo-odds ${g.right ? 'ok' : 'bad'}">${g.right ? '✓' : '✗'} ${g.final_p}%</span>`;
    const hist = (x.history || []).map(h => `<li>${esc(when(h.at))}: ${h.p}% · ${esc(nameOf(h.desk))}${h.why ? ` · ${esc(h.why)}` : ''}</li>`).join('');
    return `<details class="fo-pred"><summary>${badge}<span><b>${esc(x.q)}</b><small>${dot(x.desk)}${esc(nameOf(x.desk))} · ${done ? (x.outcome === 1 ? 'came true' : x.outcome === 0 ? 'didn’t happen' : 'couldn’t be settled') : 'settles ' + esc(day(x.by))} · ${esc(x.id)}</small></span></summary>
      ${x.evidence ? `<p class="fo-soft">${esc(x.evidence)}</p>` : ''}<ul class="fo-hist">${hist}</ul></details>`;
  }
  function predsPane() {
    const V = FO.data, R = V.record || {}, P = V.predictions || {};
    const cal = (R.calibration || []).map(c => `<li><b>${esc(c.range)}</b><span class="fo-bar"><i style="width:${c.came_true}%"></i></span><small>came true ${c.came_true}% of the time (${c.n})</small></li>`).join('');
    const byDesk = Object.entries(R.desks || {}).sort((a, b) => b[1].n - a[1].n).map(([id, r]) => `<li>${dot(id)}<b>${esc(nameOf(id))}</b><small>${r.right}/${r.n}${r.brier != null ? ' · ' + r.brier.toFixed(2) : ''}</small></li>`).join('');
    return `<div class="fo-cols"><div><h4>Open (${(P.open || []).length})</h4>${(P.open || []).map(predRow).join('') || '<p class="fo-soft">No predictions yet. Desks make them in meetings: dated, with odds, graded when the date passes.</p>'}</div>
      <div><h4>The record</h4><p class="fo-soft">${esc(recordLine(R))}</p>${cal ? `<h4>Are the odds honest?</h4><ul class="fo-cal">${cal}</ul>` : ''}${byDesk ? `<h4>By desk</h4><ul class="fo-steps">${byDesk}</ul>` : ''}
      <h4>Graded</h4>${(P.graded || []).map(predRow).join('') || '<p class="fo-soft">Nothing graded yet. The first grades come when this week’s matchups end.</p>'}</div></div>`;
  }
  const KIND = { memo: 'memo', plan: 'game plan', challenge: 'challenge', reply: 'reply', note: 'note', answer: 'answer', order: 'your order', boss: '', review: 'trade review' };
  function postRow(p) {
    const to = p.to ? ` → ${esc(nameOf(p.to))}` : '', body = p.body && p.body !== p.headline;
    const head = `${dot(p.desk)}<span><b>${esc(p.headline || '')}</b><small>${esc(nameOf(p.desk))}${to} · ${esc(KIND[p.kind] || p.kind)} · ${esc(when(p.at))}</small></span>${mood(p.mood)}`;
    if (!body && !p.for_sam) return `<div class="fo-post k-${esc(p.kind)}"><div class="fo-ph">${head}</div></div>`;
    return `<details class="fo-post k-${esc(p.kind)}"><summary class="fo-ph">${head}</summary>${p.trade ? `<p class="fo-soft">${esc(p.trade)}</p>` : ''}${p.q && p.q !== p.headline ? `<p class="fo-soft">Q: ${esc(p.q)}</p>` : ''}
      <p>${para(p.body)}</p>${p.for_sam ? `<p class="fo-hl">${esc(p.for_sam)}</p>` : ''}${report(p)}</details>`;
  }
  function boardPane() {
    const V = FO.data, f = FO.filter, posts = [...(V.board || [])].filter(p => p.kind !== 'boss' && (!f || p.desk === f || p.to === f)).sort((a, b) => a.at < b.at ? 1 : -1).slice(0, FO.phone ? 40 : 120);
    const opts = (V.desks || []).map(d => `<option value="${esc(d.id)}"${f === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
    return `<div class="fo-filter"><label for="fo-filter">Show</label><select id="fo-filter" data-fo-change="filter"><option value="">Every desk</option>${opts}</select></div>
      ${posts.map(postRow).join('') || '<p class="fo-soft">Nothing on the board yet. Every memo, challenge, reply and game plan lands here.</p>'}`;
  }
  const VERD = { 'do it': ['ok', 'Do it'], 'close call': ['warn', 'Close call'], "don't": ['bad', 'Don’t'] };
  function reviewCard(r) {
    const v = VERD[r.verdict] || ['', r.verdict || ''], val = r.values, risk = r.risk;
    return `<div class="fo-card fo-review"><span class="fo-pill ${v[0]}">${esc(v[1])}</span><span class="fo-eye">${esc(r.league_name || '')} · with ${esc(r.team || '')} · ${esc(when(r.at))}</span>
      <h4 class="fo-h">${esc(r.headline || '')}</h4><p class="fo-swap">You give <b>${esc((r.give || []).join(', ') || 'nothing')}</b> · you get <b>${esc((r.get || []).join(', ') || 'nothing')}</b></p>
      <p>${esc(r.why || '')}</p>${r.better_ask ? `<p class="fo-hl">A better ask: ${esc(r.better_ask)}</p>` : ''}
      ${val || risk ? `<details class="fo-fold"><summary>The work behind it</summary>
        ${val ? `<h4>Player values desk: ${esc(val.who_wins || '')}</h4><p class="fo-soft">Best player in the deal: <b>${esc(val.best_player || '?')}</b>. ${esc(val.why || '')}</p>
          <ul class="fo-items">${(val.players || []).map(p => `<li><b>${esc(p.name)}</b><small>${esc(p.side)} · ${esc(p.trend)}</small><p>${esc(p.standing)}. ${esc(p.rest_of_season)}</p></li>`).join('')}</ul>` : ''}
        ${risk ? `<h4>Risk desk: ${esc(risk.lean || '')}</h4><ul class="fo-gl">${(risk.risks || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="fo-soft">Worst case: ${esc(risk.worst_case || '')} ${esc(risk.season || '')}</p>` : ''}
        ${r.app ? `<small class="fo-meta">The app’s lineup math said ${r.app.my_gain >= 0 ? '+' : ''}${esc(r.app.my_gain)} points a week for you.</small>` : ''}</details>` : ''}</div>`;
  }
  const reviewsPane = () => (FO.data.reviews || []).map(reviewCard).join('') || `<p class="fo-soft">No trade reviews yet. ${FO.api ? 'In the War Room, build a trade and press <b>Ask the front office</b> before you send it: the player values desk prices every player, the risk desk says what could go wrong, and the general manager rules do it, close call or don’t.' : 'On your Mac, the War Room’s <b>Ask the front office</b> button puts any trade in front of the team before you send it.'}</p>`;
  function ordersPane() {
    const rows = (FO.data.orders || []).map(o => `<li><span><b>${esc(o.text)}</b><small>${esc(when(o.at))}</small></span>${FO.api ? `<button class="fo-btn sm" data-fo="drop-order" data-at="${esc(o.at)}" aria-label="Remove this order">Remove</button>` : ''}</li>`).join('');
    return `${FO.api ? `<form class="fo-ask" data-fo="order"><label class="fo-sr" for="fo-order">A standing order for every desk</label>
      <textarea id="fo-order" rows="2" maxlength="400" placeholder="Something every desk should always keep in mind, like “never trade Draisaitl” or “the Yahoo league matters most”"></textarea>
      <button class="fo-btn primary" type="submit">Tell the front office</button></form>` : ''}
      <ul class="fo-orders">${rows}</ul>${rows ? '' : '<p class="fo-soft">No standing orders yet. Every desk and the general manager read these before they write anything.</p>'}`;
  }
  const meetingsPane = () => (FO.data.meetings || []).map(m => `<details class="fo-post"><summary class="fo-ph"><i class="fo-dot" style="background:#d97757"></i><span><b>${esc(m.headline || m.label)}</b>
      <small>${esc(m.label)} · ${esc(when(m.started))} · ${m.posts} posts${m.reason ? ' · ' + esc(cut(m.reason, 80)) : ''}</small></span></summary>
      ${(m.gist || []).length ? `<ul class="fo-gl">${m.gist.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : '<p class="fo-soft">No gist was written for this one.</p>'}</details>`).join('')
    || '<p class="fo-soft">No meetings yet.</p>';
  function bossPanel() {
    const B = FO.boss, sel = B.target || 'team';
    const brief = (B.brief || []).map(b => `<li><button class="fo-brief${sel === b.desk ? ' on' : ''}" data-fo="boss-target" data-id="${esc(b.desk)}">${dot(b.desk)}<span><b>${esc(nameOf(b.desk))}</b><small>${esc(b.for_sam || b.headline || '')}</small></span></button></li>`).join('');
    const opts = `<option value="team"${sel === 'team' ? ' selected' : ''}>Everyone (the general manager answers for the room)</option>` + (FO.data.desks || []).map(d => `<option value="${esc(d.id)}"${sel === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
    return `<div class="fo-card fo-boss"><span class="fo-eye">You’re in the room</span><h3>The front office is listening</h3>
      <p class="fo-soft">Ask anyone a question, give an order every desk will follow, or call a meeting. New meetings wait while you’re here.</p>
      <div class="fo-talk" data-talk="boss">${talkHtml('boss')}</div>
      <form class="fo-ask" data-fo="ask" data-key="boss"><label for="fo-boss-to">Ask</label><select id="fo-boss-to" data-fo-change="boss-target">${opts}</select>
      <label class="fo-sr" for="fo-q-boss">Your question</label><textarea id="fo-q-boss" rows="2" maxlength="800" placeholder="Should I trade for a goalie? Who do I start Sunday?"></textarea>
      <div class="fo-row"><button class="fo-btn primary" type="submit">Ask</button><button class="fo-btn" type="button" data-fo="boss-order">Make it a standing order</button>
      <button class="fo-btn" type="button" data-fo="call">Call a meeting</button><button class="fo-btn ghost" type="button" data-fo="boss-leave">Leave the room</button></div></form></div>
      ${brief ? `<div class="fo-card"><span class="fo-eye">Where every desk stands</span><ul class="fo-briefs">${brief}</ul></div>` : ''}`;
  }
  function deskList() {
    const rows = (FO.data.desks || []).map(d => `<li><button class="fo-brief" data-fo="sel" data-id="desk:${esc(d.id)}">${dot(d.id)}<span><b>${esc(d.name)}</b>
      <small>${esc(d.latest ? d.latest.for_sam || d.latest.headline || '' : 'No memo yet')}</small></span></button></li>`).join('');
    return `<div class="fo-card"><span class="fo-eye">Every desk</span><ul class="fo-briefs">${rows}</ul></div>`;
  }
  function panel() {
    if (FO.boss) return bossPanel();
    const s = FO.sel || '';
    if (FO.phone && !s) return gistPanel() + deskList();
    return s.startsWith('desk:') ? deskPanel(s.slice(5)) : s === 'meeting' ? meetingPanel() : s === 'leagues' ? leaguesPanel()
      : s === 'preds' || s === 'record' ? `<div class="fo-card"><button class="fo-x" data-fo="sel" data-id="" aria-label="Back to the gist">×</button><span class="fo-eye">${s === 'record' ? 'The trophy case' : 'The odds board'}</span><h3>Predictions</h3>
        <p class="fo-soft">Desks put odds on dated things. When the date passes each one is graded, so every desk has a record you can check. ${esc(recordLine(FO.data.record))}</p>
        <button class="fo-btn sm" data-fo="tab" data-id="preds">See them all below</button></div>` + gistPanel() : gistPanel();
  }
  function head() {
    const V = FO.data, st = V.status || {}, m = st.meeting, nx = (V.next || [])[0];
    const line = m ? `<span class="fo-live"><i></i>${esc(m.label)} now · ${(m.done || []).length} of ${m.total || '?'} done</span>`
      : st.paused ? `<span class="fo-chip warn">Paused until ${esc(when(st.paused))}: your Claude plan’s usage limit</span>`
      : st.claude === false ? '<span class="fo-chip warn">Claude isn’t on this Mac, so the front office can’t meet</span>'
      : nx ? `<span class="fo-chip">Next: ${esc(nx.label.toLowerCase())}, ${esc(when(nx.at))}</span>` : '';
    const acts = FO.api ? (FO.boss ? '' : `<button class="fo-btn" data-fo="boss-join">Join as the boss</button>`) + `<button class="fo-btn primary" data-fo="call"${m ? ' disabled' : ''}>${m ? 'Meeting now…' : 'Call a meeting now'}</button>` : '';
    return `<div><h2>Front Office</h2><p>${(V.desks || []).length} AI desks that meet, argue and make calls you can check. The general manager writes your game plan.</p></div><div class="fo-headr">${line}${acts}</div>`;
  }
  const TABS = [['board', 'The board'], ['preds', 'Predictions'], ['reviews', 'Trade reviews'], ['orders', 'Standing orders'], ['meetings', 'Meetings']];
  function tabs() {
    const V = FO.data, n = { board: (V.board || []).length, preds: ((V.predictions || {}).open || []).length, reviews: (V.reviews || []).length, orders: (V.orders || []).length, meetings: (V.meetings || []).length };
    const pane = { board: boardPane, preds: predsPane, reviews: reviewsPane, orders: ordersPane, meetings: meetingsPane }[FO.tab]();
    return `<div class="fo-tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" aria-selected="${FO.tab === k}" class="fo-tab${FO.tab === k ? ' on' : ''}" data-fo="tab" data-id="${k}">${t}${n[k] ? `<small>${n[k]}</small>` : ''}</button>`).join('')}</div>
      <div class="fo-pane" role="tabpanel">${pane}</div>`;
  }

  // ---------------- drawing it, and what the clicks do ----------------
  function part(name, html, force) {  // redraw one region, unless nothing changed or someone is typing in it
    const el = FO.root.querySelector('[data-part="' + name + '"]');
    if (!el || (!force && FO.sig[name] === html)) return;
    if (!force && el.contains(document.activeElement) && /TEXTAREA|SELECT|INPUT/.test(document.activeElement.tagName)) return;
    const open = [...el.querySelectorAll('details[open] > summary')].map(s => s.textContent.slice(0, 60)), top = el.scrollTop;
    FO.sig[name] = html; el.innerHTML = html;
    if (open.length) el.querySelectorAll('details > summary').forEach(s => { if (open.includes(s.textContent.slice(0, 60))) s.parentElement.open = true; });
    el.scrollTop = top;
  }
  function draw(force) {
    if (!FO.root || !FO.data) return;
    if (!FO.root.firstChild) FO.root.innerHTML = `<div class="fo${FO.phone ? ' phone' : ''}"><header class="fo-head" data-part="head"></header>
      <div class="fo-main"><div class="fo-stage" data-part="svg"></div><aside class="fo-panel" data-part="panel" aria-live="polite"></aside></div>
      <section class="fo-under" data-part="tabs"></section><div class="fo-tip" hidden></div></div>`;
    part('head', head(), force); part('svg', officeSvg(FO.data, FO.sel), force); part('panel', panel(), force); part('tabs', tabs(), force);
    FO.root.firstChild.classList.toggle('boss', !!FO.boss);
  }
  const say = msg => { if (window.toast) window.toast(msg); };
  function select(id) {
    FO.sel = id || null; draw();
    if (id && (FO.phone || FO.root.querySelector('.fo-main').offsetWidth < 900)) FO.root.querySelector('.fo-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function ask(key, q) {
    const boss = key === 'boss', to = boss ? (FO.boss.target || 'team') : key, list = FO.talks[key] = FO.talks[key] || [];
    const hist = list.filter(t => !t.pending).slice(-3).map(t => ({ sam: t.q, answer: cut(t.a, 600) }));
    const row = { q, to, pending: true }; list.push(row); draw(true);
    try {
      const r = await FO.api.office_ask(to, q, hist, boss);
      Object.assign(row, { pending: false, a: r.answer || 'No answer came back.', who_said: r.who_said, sources: r.sources, desk: r.desk });
    } catch (e) { Object.assign(row, { pending: false, a: 'Something went wrong asking. Try again.' }); }
    if (boss && FO.boss) FO.boss.asked = (FO.boss.asked || 0) + 1;
    draw(true); FO.poll();
  }
  async function act(a, el) {
    const id = el.dataset.id, api = FO.api;
    if (a === 'sel') return select(id === FO.sel ? null : id);
    if (a === 'tab') { FO.tab = id; draw(); FO.root.querySelector('.fo-under').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    if (!api) return;
    if (a === 'call') {
      if (!confirm('Call a meeting now?\n\nEvery desk reports (about 15 to 25 minutes of Claude on your plan), then the general manager writes a fresh game plan.')) return;
      const why = FO.boss ? (FO.root.querySelector('#fo-q-boss') || {}).value || '' : '';
      const r = FO.boss ? await api.office_boss_meet(why) : await api.office_call('now', '');
      say(r.said); FO.sel = 'meeting'; FO.poll();
    } else if (a === 'boss-join') {
      el.disabled = true; const r = await api.office_boss_join();
      FO.boss = { brief: r.brief || [], target: 'team', asked: 0, ordered: 0 }; FO.talks.boss = FO.talks.boss || []; draw(true); FO.poll();
    } else if (a === 'boss-leave') { const B = FO.boss; FO.boss = null; draw(true); await api.office_boss_leave(B.asked || 0, B.ordered || 0); FO.poll(); }
    else if (a === 'boss-target') { FO.boss.target = id; draw(true); const t = FO.root.querySelector('#fo-q-boss'); if (t) t.focus(); }
    else if (a === 'boss-order') {
      const t = FO.root.querySelector('#fo-q-boss'), text = (t.value || '').trim();
      if (!text) return say('Type the order first.');
      const r = await api.office_order(text); say(r.said); if (r.ok) { t.value = ''; FO.boss.ordered = (FO.boss.ordered || 0) + 1; } FO.poll();
    } else if (a === 'drop-order') { await api.office_drop_order(el.dataset.at); FO.poll(); }
  }
  function submit(form) {
    const kind = form.dataset.fo, t = form.querySelector('textarea'), text = (t.value || '').trim();
    if (!text || !FO.api) return;
    t.value = '';
    if (kind === 'ask') ask(form.dataset.key, text);
    else if (kind === 'order') FO.api.office_order(text).then(r => { say(r.said); FO.poll(); });
  }
  FO.poll = async function () {
    if (!FO.api || !FO.api.office_view) return;
    try { const v = await FO.api.office_view(); if (v && v.desks) { FO.data = v; draw(); } } catch (e) { /* the app is busy; the next tick tries again */ }
  };
  FO.update = function (data) { if (data && data.desks) { FO.data = data; draw(); } };
  FO.mount = function (root, opts) {
    Object.assign(FO, { root, api: opts.api || null, phone: !!opts.phone, data: opts.data || FO.data, sig: {} });
    root.innerHTML = '';
    if (!FO.wired) {
      FO.wired = true;
      document.addEventListener('click', e => { const el = e.target.closest('[data-fo]'); if (el && FO.root && FO.root.contains(el) && el.tagName !== 'FORM') { e.preventDefault(); act(el.dataset.fo, el); } });
      document.addEventListener('keydown', e => {
        const el = e.target.closest && e.target.closest('g[data-fo]');
        if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); act(el.dataset.fo, el); }
        if (e.target.tagName === 'TEXTAREA' && e.target.closest('.fo-ask') && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e.target.closest('form')); }
      }, true);
      document.addEventListener('submit', e => { if (e.target.matches && e.target.matches('form[data-fo]')) { e.preventDefault(); submit(e.target); } });
      document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.foChange;
        if (k === 'filter') { FO.filter = e.target.value; draw(true); } else if (k === 'boss-target' && FO.boss) { FO.boss.target = e.target.value; draw(true); } });
      const tipOf = e => e.target.closest && e.target.closest('.fo-o');
      document.addEventListener('mousemove', e => {
        const tip = FO.root && FO.root.querySelector('.fo-tip'); if (!tip) return;
        const o = tipOf(e); if (!o) { tip.hidden = true; return; }
        tip.textContent = o.dataset.tip; tip.hidden = false;
        const r = FO.root.firstChild.getBoundingClientRect();
        tip.style.left = Math.min(Math.max(e.clientX - r.left + 14, 6), r.width - tip.offsetWidth - 6) + 'px'; tip.style.top = (e.clientY - r.top + 18) + 'px';
      });
    }
    draw(true);
  };

  const CSS = `
.fo{position:relative;--fo-line:var(--line,#3a3a37);color:var(--ink,#f5f3ee)}
.fo h2,.fo h3,.fo h4{font-family:var(--round);margin:0}.fo h3{font-size:18px;line-height:1.25;margin:4px 0 8px}.fo h4{font-size:13.5px;margin:14px 0 6px;color:var(--soft,#cfcbc0)}
.fo h4.fo-h{font-size:15.5px;color:var(--ink,#f5f3ee);margin:4px 0 6px}.fo p{margin:6px 0}.fo ul,.fo ol{margin:0;padding:0;list-style:none}
.fo small{font-size:12px;color:var(--muted,#9c998f)}.fo-soft{color:var(--soft,#cfcbc0)}.fo-sm{font-size:12.5px}.fo-warn{color:var(--warn,#e7b65a)}
.fo-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.fo-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin:0 0 14px}
.fo-head h2{font-size:26px}.fo-head p{margin:2px 0 0;color:var(--soft,#cfcbc0);font-size:14px}
.fo-headr{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fo-chip,.fo-live{font:600 12.5px var(--round);padding:6px 12px;border-radius:20px;background:var(--card2,#323230);color:var(--soft,#cfcbc0)}
.fo-chip.warn{background:var(--warnbg,#3b3120);color:var(--warn,#e7b65a)}
.fo-live{display:inline-flex;align-items:center;gap:8px;background:#3a2620;color:#f1b49d}.fo-live i{width:8px;height:8px;border-radius:50%;background:var(--clay,#d97757);animation:fo-pulse 1.2s infinite}
.fo-btn{font:600 13px var(--round);padding:8px 14px;min-height:34px;border-radius:10px;border:1px solid var(--line2,#4a4a46);background:var(--card2,#323230);color:var(--ink,#f5f3ee);cursor:pointer}
.fo-btn:hover{border-color:var(--clay,#d97757)}.fo-btn.primary{background:var(--clay,#d97757);border-color:var(--clay,#d97757);color:#1c1c1b}.fo-btn.primary:hover{background:#e58a6c}
.fo-btn.ghost{background:transparent}.fo-btn.sm{padding:5px 11px;min-height:28px;font-size:12.5px}.fo-btn:disabled{opacity:.6;cursor:default}
.fo :focus-visible{outline:2px solid var(--clay,#d97757);outline-offset:2px;border-radius:6px}
.fo-main{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(340px,1fr);gap:16px;align-items:start}
.fo.boss .fo-main{grid-template-columns:minmax(0,1.1fr) minmax(400px,1fr)}
@media (max-width:1180px){.fo-main,.fo.boss .fo-main{grid-template-columns:1fr}}
.fo-stage{background:radial-gradient(120% 100% at 50% 0%,#1d1c1b,#131312);border:1px solid var(--fo-line);border-radius:18px;overflow:hidden;position:sticky;top:0}
@media (max-width:1180px){.fo-stage{position:static}}
.fo-svg{display:block;width:100%;height:auto;max-height:calc(100vh - 190px)}
.fo-o{cursor:pointer;outline:none}.fo-hit{fill:transparent;stroke:none}
.fo-o:hover .fo-hit,.fo-o:focus-visible .fo-hit{stroke:var(--sc);stroke-width:1.6;stroke-dasharray:4 4;fill:var(--sc);fill-opacity:.06}
.fo-o.sel .fo-hit{stroke:var(--sc);stroke-width:2;fill:var(--sc);fill-opacity:.09}
.fo-plate text{font:700 13.5px var(--round);letter-spacing:.02em}
.fo-ft{font:700 15.5px var(--round);letter-spacing:.14em;fill-opacity:.8}.fo-logo{font:800 16px var(--round);letter-spacing:.12em;fill:#f5f3ee;fill-opacity:.13}
.fo-wt{font:800 17px var(--round);letter-spacing:.12em}.fo-wr{font:600 16px var(--round);fill:#f5f3ee}.fo-ws{font:600 15.5px var(--round);fill:#9c998f}
.fo-led{font:700 16.5px ui-monospace,"SF Mono",Menlo,monospace;fill:#ffd9a0}
.fo-glow{opacity:0}.fo-lid{opacity:.5}.fo-desk.run .fo-glow{opacity:.35;animation:fo-pulse 1.4s infinite}.fo-desk.run .fo-lid{opacity:1}
.fo-typing circle{animation:fo-dots 1.2s infinite}.fo-typing circle:nth-of-type(2){animation-delay:.15s}.fo-typing circle:nth-of-type(3){animation-delay:.3s}
.fo-said{opacity:.85}.fo-holo{animation:fo-pulse 2s infinite}.fo-ring{animation:fo-pulse 2.4s infinite}
@keyframes fo-pulse{50%{opacity:.45}}@keyframes fo-dots{0%,60%,100%{opacity:.3}30%{opacity:1}}
@media (prefers-reduced-motion:reduce){.fo *{animation:none!important}}
.fo-tip{position:absolute;z-index:5;pointer-events:none;background:#111110;border:1px solid var(--line2,#4a4a46);border-radius:8px;padding:5px 9px;font:600 12.5px var(--round);max-width:320px;box-shadow:0 6px 20px rgba(0,0,0,.4)}
.fo-panel{display:flex;flex-direction:column;gap:12px;min-width:0}
@media (min-width:1181px){.fo:not(.phone) .fo-panel{max-height:calc(100vh - 190px);overflow-y:auto;scrollbar-width:thin;padding-right:2px}}
.fo-fold>summary .fo-eye{display:inline}
.fo-card{position:relative;background:var(--card,#2a2a28);border:1px solid var(--fo-line);border-radius:14px;padding:14px 16px}
.fo-eye{display:block;font:700 11px var(--round);letter-spacing:.12em;text-transform:uppercase;color:var(--clay,#d97757)}
.fo-gist{border-color:color-mix(in srgb,var(--clay,#d97757) 55%,var(--fo-line));background:linear-gradient(180deg,#33261f,var(--card,#2a2a28) 70%)}
.fo-hl{background:color-mix(in srgb,var(--clay,#d97757) 16%,transparent);border-left:3px solid var(--clay,#d97757);border-radius:0 8px 8px 0;padding:8px 11px;font-weight:600}
.fo-gl li{position:relative;padding:3px 0 3px 16px;color:var(--soft,#cfcbc0)}.fo-gl li::before{content:"";position:absolute;left:3px;top:11px;width:5px;height:5px;border-radius:50%;background:var(--clay,#d97757)}
.fo-moves{counter-reset:none}.fo-move{display:flex;gap:11px;padding:9px 0;border-top:1px solid var(--fo-line)}.fo-move:first-child{border-top:0}
.fo-n{flex:none;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;font:700 12.5px var(--round);background:var(--card2,#323230);color:var(--ink,#f5f3ee)}
.fo-move.k-lineup .fo-n{background:#233328;color:#6dbb7f}.fo-move.k-waiver .fo-n{background:#22303f;color:#7db4e6}.fo-move.k-trade .fo-n{background:#3b3120;color:#e7b65a}.fo-move.k-watch .fo-n{background:#30293a;color:#c3a6e8}
.fo-move b{display:block}.fo-move small{display:block}.fo-move p{margin:3px 0 0;color:var(--soft,#cfcbc0);font-size:13.5px}
.fo-lgs li{padding:8px 0;border-top:1px solid var(--fo-line)}.fo-lgs li:first-child{border-top:0}.fo-lgs p{margin:2px 0 0;color:var(--soft,#cfcbc0);font-size:13.5px}
.fo-mood{float:right;font:700 11.5px var(--round);color:var(--c);border:1px solid color-mix(in srgb,var(--c) 50%,transparent);border-radius:20px;padding:2px 9px;margin-left:8px}
.fo-x{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:8px;border:0;background:transparent;color:var(--muted,#9c998f);font-size:20px;cursor:pointer}.fo-x:hover{background:var(--card2,#323230);color:var(--ink,#f5f3ee)}
.fo-deskhead{border-top:3px solid var(--c)}.fo-meta{display:block;margin-top:6px}.fo-line{color:var(--soft,#cfcbc0)}
.fo-items li{padding:7px 0;border-top:1px solid var(--fo-line)}.fo-items li:first-child{border-top:0}.fo-items small{float:right;margin-left:10px;text-align:right;max-width:55%}.fo-items p{margin:2px 0 0;color:var(--soft,#cfcbc0);font-size:13.5px;clear:both}
.fo-fold>summary,.fo-post>summary,.fo-pred>summary{cursor:pointer;list-style:none}.fo-fold>summary::-webkit-details-marker,.fo-post>summary::-webkit-details-marker,.fo-pred>summary::-webkit-details-marker{display:none}
.fo-fold>summary{font:600 13px var(--round);color:var(--soft,#cfcbc0);padding:6px 0;min-height:24px}.fo-fold>summary::before{content:"▸ ";color:var(--clay,#d97757)}.fo-fold[open]>summary::before{content:"▾ "}
.fo-steps li{display:flex;align-items:center;gap:9px;padding:6px 0;border-top:1px solid var(--fo-line)}.fo-steps li:first-child{border-top:0}.fo-steps small{margin-left:auto}
.fo-steps .s-writing small{color:var(--clay,#d97757);font-weight:700}.fo-steps .s-done small{color:var(--good,#6dbb7f)}.fo-steps .s-failed small{color:var(--bad,#ef8a6c)}
.fo-dot{flex:none;display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:2px}
.fo-lglist li{display:grid;grid-template-columns:1fr auto auto;gap:4px 16px;align-items:center;padding:11px 0;border-top:1px solid var(--fo-line)}.fo-lglist li:first-child{border-top:0}
.fo-lglist small{display:block}.fo-lglist p{grid-column:1/-1;margin:0;color:var(--soft,#cfcbc0);font-size:13.5px}.fo-lglist .fo-btn{grid-column:1/-1;justify-self:start}
.fo-stat{text-align:right}.fo-stat b{font:700 18px var(--round)}.fo-lg.football .fo-stat b{color:var(--turf,#6dbb7f)}.fo-lg.hockey .fo-stat b{color:var(--ice,#7db4e6)}
.fo-talk{display:flex;flex-direction:column;gap:8px;margin:8px 0}.fo-talk:empty{display:none}
.fo-q,.fo-a{border-radius:12px;padding:9px 12px;max-width:94%}.fo-q{align-self:flex-end;background:color-mix(in srgb,var(--clay,#d97757) 22%,var(--card2,#323230))}.fo-a{background:var(--bg2,#222221);border:1px solid var(--fo-line)}
.fo-q b,.fo-a b{font:700 12px var(--round);color:var(--muted,#9c998f)}.fo-q p,.fo-a p{margin:2px 0 0}
.fo-said-by{margin-top:6px!important}.fo-said-by li{font-size:12.5px;color:var(--soft,#cfcbc0);padding:2px 0 2px 12px;border-left:2px solid var(--line2,#4a4a46);margin-top:3px}.fo-src{display:block;margin-top:6px}
.fo-think i{animation:fo-dots 1.2s infinite;font-style:normal}.fo-think i:nth-of-type(2){animation-delay:.15s}.fo-think i:nth-of-type(3){animation-delay:.3s}
.fo-ask{display:flex;flex-direction:column;gap:8px;margin-top:8px}.fo-ask label{font:600 12.5px var(--round);color:var(--muted,#9c998f)}
.fo-ask textarea,.fo select{width:100%;font:14px/1.4 inherit;font-family:inherit;color:var(--ink,#f5f3ee);background:var(--bg,#1c1c1b);border:1px solid var(--line2,#4a4a46);border-radius:10px;padding:9px 11px;resize:vertical}
.fo select{min-height:36px;resize:none}.fo-ask .fo-btn{align-self:flex-start}.fo-row{display:flex;gap:8px;flex-wrap:wrap}
.fo-briefs li{border-top:1px solid var(--fo-line)}.fo-briefs li:first-child{border-top:0}
.fo-brief{display:flex;gap:9px;align-items:flex-start;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:8px 6px;border-radius:8px;cursor:pointer;font:inherit}
.fo-brief:hover,.fo-brief.on{background:var(--card2,#323230)}.fo-brief .fo-dot{margin-top:5px}.fo-brief b{display:block;font-size:13.5px}.fo-brief small{display:block}
.fo-under{margin-top:18px}
.fo-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--fo-line);margin-bottom:12px}
.fo-tab{font:600 13.5px var(--round);color:var(--muted,#9c998f);background:transparent;border:0;border-bottom:2px solid transparent;padding:10px 14px;min-height:40px;cursor:pointer}
.fo-tab:hover{color:var(--ink,#f5f3ee)}.fo-tab.on{color:var(--ink,#f5f3ee);border-bottom-color:var(--clay,#d97757)}.fo-tab small{margin-left:7px;background:var(--card2,#323230);border-radius:10px;padding:1px 7px;font-size:11.5px}
.fo-pane{max-width:1500px}
.fo-filter{display:flex;align-items:center;gap:10px;margin-bottom:10px}.fo-filter label{font:600 12.5px var(--round);color:var(--muted,#9c998f)}.fo-filter select{width:auto;min-width:220px}
.fo-post{background:var(--card,#2a2a28);border:1px solid var(--fo-line);border-radius:12px;padding:0 14px;margin-bottom:6px}
.fo-post[open]{padding-bottom:12px}.fo-ph{display:flex;align-items:flex-start;gap:10px;padding:10px 0;min-height:44px}.fo-ph .fo-dot{margin-top:6px}.fo-ph>span{flex:1;min-width:0}
.fo-ph b{display:block;font-size:14px}.fo-ph small{display:block}.fo-ph .fo-mood{float:none;flex:none;margin-top:2px}
.fo-post.k-challenge{border-left:3px solid var(--bad,#ef8a6c)}.fo-post.k-plan{border-left:3px solid var(--clay,#d97757)}.fo-post.k-review{border-left:3px solid var(--warn,#e7b65a)}.fo-post.k-order{border-left:3px solid var(--ink,#f5f3ee)}
.fo-cols{display:grid;grid-template-columns:1fr 1fr;gap:22px}@media (max-width:900px){.fo-cols{grid-template-columns:1fr}}
.fo-pred{border-top:1px solid var(--fo-line);padding:2px 0}.fo-pred>summary{display:flex;gap:11px;align-items:flex-start;padding:8px 0;min-height:44px}.fo-pred b{display:block;font-size:14px;font-weight:600}.fo-pred small{display:block}
.fo-odds{flex:none;min-width:52px;text-align:center;font:700 14px var(--round);padding:4px 6px;border-radius:9px;background:var(--card2,#323230)}
.fo-odds.ok{background:var(--goodbg,#233328);color:var(--good,#6dbb7f)}.fo-odds.bad{background:var(--badbg,#3f2723);color:var(--bad,#ef8a6c)}.fo-odds.void{color:var(--muted,#9c998f);font-size:12px}
.fo-hist li{font-size:12.5px;color:var(--soft,#cfcbc0);padding:2px 0 2px 63px}
.fo-cal li{display:grid;grid-template-columns:70px 1fr;gap:2px 10px;align-items:center;padding:5px 0}.fo-cal small{grid-column:2}
.fo-bar{height:8px;border-radius:5px;background:var(--card2,#323230);overflow:hidden}.fo-bar i{display:block;height:100%;background:var(--clay,#d97757);border-radius:5px}
.fo-review{margin-bottom:10px}.fo-pill{float:right;font:800 12.5px var(--round);padding:4px 12px;border-radius:20px;background:var(--card2,#323230)}
.fo-pill.ok{background:var(--goodbg,#233328);color:var(--good,#6dbb7f)}.fo-pill.warn{background:var(--warnbg,#3b3120);color:var(--warn,#e7b65a)}.fo-pill.bad{background:var(--badbg,#3f2723);color:var(--bad,#ef8a6c)}
.fo-swap{color:var(--soft,#cfcbc0)}
.fo-orders li{display:flex;gap:12px;align-items:center;justify-content:space-between;background:var(--card,#2a2a28);border:1px solid var(--fo-line);border-radius:12px;padding:10px 14px;margin-top:8px}.fo-orders small{display:block}
.fo-teaser{display:flex;flex-direction:column;gap:5px;width:100%;text-align:left;color:var(--ink,#f5f3ee);font:inherit;cursor:pointer;margin:0 0 10px;padding:13px 14px;border-radius:var(--r,16px);
  border:1px solid color-mix(in srgb,var(--clay,#d97757) 55%,transparent);background:linear-gradient(180deg,#33261f,var(--card,#2a2a28) 80%)}
.fo-teaser b{font:750 17px/1.25 var(--round)}.fo-t-hl{font-size:14px;color:var(--soft,#cfcbc0)}.fo-t-more{font:650 13px var(--round);color:var(--clay,#d97757);margin-top:2px}
#fo-root{margin:0 0 14px}
.fo.phone .fo-head{display:none}.fo.phone .fo-stage{border-radius:14px}
.fo.phone .fo-head h2{font-size:21px}.fo.phone .fo-svg{max-height:none}.fo.phone .fo-svg text{display:none}.fo.phone .fo-tab{padding:10px 10px}
@media (max-width:640px){.fo-svg text{display:none}.fo-items small{float:none;display:block;max-width:none;text-align:left;margin:0}}
`;
  if (!document.getElementById('fo-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'fo-css', textContent: CSS }));
  FO.when = when;
  window.FO = FO;
})();
