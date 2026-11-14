/* Claude Fantasy on Sam's iPhone: the trade desk for each league. Unlock the crew's latest run, judge any trade
   right here (phone/trade.js, the same math as the Mac's fantasy/trades.py), keep it fresh.

   data.json is locked on Sam's Mac or by the cloud crew (fantasy/phone.py): PBKDF2-SHA256 (600,000 rounds) turns the
   code into two keys, AES-256-CBC locks the snapshot and HMAC-SHA256 seals it ("ctm1", the Claude Trade mirror's lock).
   This page only reads. Send / Approve / Accept / Decline open a one-tap GitHub issue for the cloud crew, which does
   it and replies there; Yahoo moves open Yahoo. */
'use strict';

const te = new TextEncoder(), td = new TextDecoder();
const KEY = 'cf-key', UI = 'cf-ui', SENT = 'cf-sent', DESK = 'cf-desk';
const $ = s => document.querySelector(s);
let D = null, ENV = null, busy = false;
let ui = Object.assign({ league: '', open: {}, moreSug: false }, readJSON(UI) || {});
if (typeof ui.open !== 'object' || !ui.open) ui.open = {};
(() => {  // a tapped notification opens the right league and section: ./?tab=lineup&league=<key>
  const q = new URLSearchParams(location.search);
  if (q.get('league') && q.get('league') !== 'all') ui.league = q.get('league');
  const part = { lineup: 'lineup', gameday: 'lineup', crew: 'crew' }[q.get('tab')];
  if (part) ui.open[part] = true;
  if (q.get('moves') === 'done') ui.open.crew = true;
  if ([...q.keys()].length) history.replaceState(null, '', location.pathname + location.hash);
})();

function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function writeJSON(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }

/* ---------------- the lock ---------------- */
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64e = u => btoa(String.fromCharCode.apply(null, u));
function cat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const norm = c => (c || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function derive(code, env) {
  const base = await crypto.subtle.importKey('raw', te.encode(norm(code)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(env.salt), iterations: env.rounds }, base, 512));
}
async function unlock(env, bits) {
  const salt = b64d(env.salt), iv = b64d(env.iv), ct = b64d(env.ct);
  const mk = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('HMAC', mk, b64d(env.mac), cat(te.encode(`ctm1:${env.rounds}:`), salt, iv, ct))) throw new Error('code');
  const ek = await crypto.subtle.importKey('raw', bits.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
  return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, ek, ct)));
}
async function fetchEnv() {
  const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
/* ---------------- remembering the code on this iPhone ----------------
   iOS gives a Home Screen app its own storage, separate from Safari's, so a code typed in Safari isn't known there.
   So once this page is unlocked in Safari, its Home Screen link carries the key after "#" (that part of a link stays on
   the phone and is never sent to GitHub): the icon opens unlocked. The key is what the code turns into, never the code. */
const STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const LOCKED = 'cf-locked', A2HS = 'cf-a2hs-off';
const toUrl64 = s => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); return s + '='.repeat((4 - s.length % 4) % 4); };
const LINK = (() => {  // #k=<key>&s=<salt>&r=<rounds> from the Home Screen link
  const q = new URLSearchParams(location.hash.slice(1));
  if (!q.get('k') || !q.get('s')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return { bits: fromUrl64(q.get('k')), salt: fromUrl64(q.get('s')), rounds: +q.get('r') || 600000 };
})();

function savedBits(env) {
  const fits = k => k && k.salt === env.salt && +k.rounds === +env.rounds;
  const k = readJSON(KEY);
  if (fits(k)) return b64d(k.bits);
  if (fits(LINK) && readJSON(LOCKED) !== env.salt) { writeJSON(KEY, LINK); return b64d(LINK.bits); }
  return null;
}
// Safari reads the Home Screen settings (the manifest) once, when the page loads, so the link is chosen right here at
// startup: with the key if this Safari already knows it, otherwise the plain one (and the page reloads once after
// the code is typed, see remember()).
const KEYED = (() => {
  const k = readJSON(KEY), base = location.href.replace(/[?#].*$/, '');
  let href = 'manifest.webmanifest';
  if (k && !STANDALONE) {
    href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify({
      id: base, name: 'Claude Fantasy', short_name: 'Fantasy', description: 'Sam’s trade desk: build and judge trades in every league',
      start_url: `${base}#k=${toUrl64(k.bits)}&s=${toUrl64(k.salt)}&r=${k.rounds}`, scope: base, display: 'standalone',
      background_color: '#1c1c1b', theme_color: '#1c1c1b',
      icons: [{ src: base + 'icon-180.png', sizes: '180x180', type: 'image/png' },
        { src: base + 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }));
  }
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = href;
  document.head.appendChild(link);
  return href !== 'manifest.webmanifest';
})();
function remember() {
  writeJSON(LOCKED, null);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* older iOS */ }
  if (!STANDALONE && !KEYED && readJSON(KEY)) setTimeout(() => location.reload(), 400);  // so Add to Home Screen gets the key
}

function showLock(msg) {
  $('#app').hidden = true; $('#lock').hidden = false;
  const m = $('#lockmsg'); m.textContent = msg || ''; m.className = '';
  $('#unlockbtn').disabled = false;
  $('.lock-help').textContent = STANDALONE
    ? 'The code is the one you chose when you set up the phone app on your Mac. You type it once; this app remembers it.'
    : 'The code is the one you chose when you set up the phone app on your Mac. After it opens, tap Share → Add to Home Screen: the icon opens unlocked, no code needed.';
}
function showApp() {
  $('#lock').hidden = true; $('#app').hidden = false;
  render();
}


async function start() {
  if (!window.crypto || !crypto.subtle) return showLock('Open this link in Safari to unlock it.');
  try { ENV = await fetchEnv(); } catch (e) { return showLock('Couldn’t reach your crew’s data. Check your connection, then reopen the app.'); }
  const bits = savedBits(ENV);
  if (bits) {
    try { D = await unlock(ENV, bits); remember(); return showApp(); } catch (e) { writeJSON(KEY, null); return showLock('The code changed. Type the new one.'); }
  }
  showLock('');
  // testing on the Mac only (fantasy.phone preview + the iPhone simulator): localhost/#code=<test code>[&league=…&open=…&desk=…]
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.hash.startsWith('#code=')) {
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.get('league')) ui.league = q.get('league');
    for (const k of (q.get('open') || '').split(',').filter(Boolean)) ui.open[k] = true;
    if (q.get('desk')) { const [lk, tm, gv, gt] = q.get('desk').split(':'); const d = readJSON(DESK) || {}; d[lk] = { team: tm || null, give: (gv || '').split(',').filter(Boolean), get: (gt || '').split(',').filter(Boolean) }; writeJSON(DESK, d); }
    $('#code').value = q.get('code');
    history.replaceState(null, '', location.pathname);
    $('#lockform').requestSubmit();
  }
}

$('#lockform').addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('#code').value;
  if (!ENV || !norm(code)) return;
  const m = $('#lockmsg');
  m.textContent = 'Unlocking… (a few seconds the first time)'; m.className = 'busy';
  $('#unlockbtn').disabled = true;
  try {
    const bits = await derive(code, ENV);
    D = await unlock(ENV, bits);
    writeJSON(KEY, { salt: ENV.salt, rounds: ENV.rounds, bits: b64e(bits) });
    remember();
    $('#code').value = ''; $('#code').blur();
    showApp();
  } catch (err) {
    showLock('That code didn’t work. Capitals, spaces and dashes don’t matter.');
  }
});

async function refresh(manual) {
  if (busy || !ENV) return;
  busy = true;
  try {
    const env = await fetchEnv();
    if (env.iv === ENV.iv) { if (manual) toast('Up to date: nothing new since ' + clock(D.ran)); return; }
    const bits = savedBits(env);
    if (!bits) { ENV = env; return showLock('The code changed. Type the new one.'); }
    D = await unlock(env, bits); ENV = env;
    if (document.activeElement && document.activeElement.id === 'tq') { pendingRender = true; return; }  // never re-draw under your typing
    render();
    if (manual) toast('Updated');
  } catch (e) {
    if (manual) toast('Couldn’t check: no connection?');
  } finally { busy = false; }
}
let pendingRender = false;
document.addEventListener('visibilitychange', () => { if (!document.hidden && D) refresh(false); });
setInterval(() => { if (!document.hidden && D) refresh(false); }, 120000);

/* ---------------- small helpers ---------------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
const num = (x, nd = 1) => (x == null || isNaN(x)) ? '–' : (+(+x).toFixed(nd)).toString();
const signed = (x, nd = 1) => x == null ? '–' : (+(+x).toFixed(nd) === 0 ? '±0' : (x > 0 ? '+' : '−') + num(Math.abs(x), nd));
const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
const ordinal = n => { if (!n) return ''; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function hm(d) { let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'), ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return `${h}:${m} ${ap}`; }
function clock(ms) {
  if (!ms) return '';
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return hm(d);
  if (Math.abs(now - d) < 6 * 864e5) return `${DAY[d.getDay()]} ${hm(d)}`;
  return `${MONTH[d.getMonth()]} ${d.getDate()}, ${hm(d)}`;
}
function ago(ms) {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return clock(ms);
}
const GAME_HOURS = { football: 3.5, hockey: 3 };
function gameTime(g, sport) {  // 'Sun 1:00 PM' before kickoff, 'live' during the game, 'played Sun' after it
  if (!g) return '';
  if (!g.date) return g.time === 'played' ? 'played' : (g.time || '');
  const d = new Date(g.date), now = Date.now();
  if (now < g.date) return `${DAY[d.getDay()]} ${hm(d)}`;
  if (now < g.date + (GAME_HOURS[sport] || 3.5) * 3600e3) return 'live';
  return `played ${DAY[d.getDay()]}`;
}
const SPORT = { football: '🏈', hockey: '🏒' };
const cap = s => (s = String(s || '')) && s[0].toUpperCase() + s.slice(1).toLowerCase();
const pctOdds = p => p == null ? '–' : p >= 0.995 ? '99%+' : p > 0 && p < 0.01 ? '<1%' : Math.round(p * 100) + '%';
const SITE = { espn: 'ESPN', yahoo: 'Yahoo' };
const BOT = { Casey: ['#6dbb7f', 'Football lineups'], Drew: ['#7db4e6', 'Hockey lineups'], Riley: ['#c49bd4', 'Researcher'],
  Cooper: ['#e0b35a', 'Commissioner'], You: ['#d97757', 'You'] };
const LEVEL = { urgent: 0, warn: 1, tip: 2, info: 3, good: 4 };
const LEVEL_WORD = { urgent: 'Fix before lock', warn: 'Keep an eye on', tip: 'Could gain points', info: 'FYI', good: 'All set' };
const ORDER = { football: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'OP', 'D/ST', 'K'], hockey: ['C', 'LW', 'RW', 'F', 'D', 'G', 'UTIL'] };
const ava = (b, cls = '') => `<span class="ava ${cls}" style="--c:${(BOT[b] || ['#a6a39b'])[0]}">${esc((b || '?')[0])}</span>`;
const section = (title, body, note = '') => `<h2 class="sec">${esc(title)}${note ? `<small>${note}</small>` : ''}</h2>${body}`;
const lg = k => D.leagues.find(l => l.key === k);
function sentMarks() {  // commands this phone handed to the crew, until the next upload shows them done (2 hours at most)
  const m = readJSON(SENT) || {}, now = Date.now();
  for (const k of Object.keys(m)) if (now - m[k] > 2 * 3600e3) delete m[k];
  return m;
}
function md(text) {  // the recap: **bold** and paragraphs, everything else as plain text
  return esc(text || '').split(/\n\s*\n/).map(p => `<p>${p.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`).join('');
}
const short = n => /D\/ST|DEF/.test(n || '') ? n : String(n || '').replace(/^(\S)\S*\s+(?=\S)/, '$1. ');  // "J. Jefferson", but "Eagles D/ST"

/* ---------------- the trade engine, per league (phone/trade.js) ---------------- */
let ENG = {}, OWN = {}, CACHE = {};
function eng(key) {  // the league as trades.py sees it, plus who owns which player
  if (!ENG[key]) {
    const l = lg(key);
    if (!l || !l.trade) return null;
    ENG[key] = Trade.league(l);
    OWN[key] = {};
    for (const x of Trade.everyone(ENG[key])) OWN[key][String(x.p.id)] = x;
  }
  return ENG[key];
}
function memo(name, fn) { return name in CACHE ? CACHE[name] : (CACHE[name] = fn()); }
const wk = (l, x) => x == null ? null : x * ((eng(l.key) || {}).factor || 1);  // per-game gains → points a week (hockey plays 3-4 games a week)
const teamName = (E, tid) => (E.names || {})[String(tid)] || `Team ${tid}`;

/* the trade being built, per league: {team, give: [ids], get: [ids]} (kept on this iPhone) */
function desk(key) {
  const all = readJSON(DESK) || {};
  const E = eng(key), own = OWN[key] || {};
  const b = Object.assign({ team: null, give: [], get: [] }, all[key] || {});
  b.give = (b.give || []).filter(id => (own[id] || {}).owner === 'me');  // players who moved away since drop out
  b.get = (b.get || []).filter(id => own[id] && own[id].owner === String(b.team));
  if (b.team && !(E && E.others[String(b.team)])) b.team = null;
  return b;
}
function saveDesk(key, b) { const all = readJSON(DESK) || {}; all[key] = b; writeJSON(DESK, all); }

/* ---------------- frame: header and league chips ---------------- */
function pickLeague() {
  if (ui.league && lg(ui.league)) return;
  const busy = D.leagues.find(l => (l.incoming || []).length);
  ui.league = (busy || D.leagues[0] || {}).key || '';
}
function render() {
  pendingRender = false;
  ENG = {}; OWN = {}; CACHE = {};
  pickLeague();
  writeJSON(UI, ui);
  const stale = D.ran && Date.now() - D.ran > 3 * 3600e3;
  const w = $('#when');
  w.className = stale ? 'stale' : '';
  const cloud = D.where !== 'cloud' && D.cloud_ran  // (when the cloud did this check, the line above already says so)
    ? `<small class="${cloudLate(D.cloud_ran) ? 'late' : ''}">Cloud crew ${esc(ago(D.cloud_ran))}</small>` : '';
  w.innerHTML = `${esc(D.ran ? 'Checked ' + clock(D.ran) : 'Not checked yet')}<small>${D.where === 'cloud' ? 'by the cloud crew' : 'by your Mac'} · ↻</small>${cloud}`;
  const alert = l => (l.incoming || []).length || D.findings.some(f => f.league === l.key && f.level === 'urgent');
  $('#chips').innerHTML = D.leagues.map(l => `<button class="chip ${l.sport} ${ui.league === l.key ? 'on' : ''}" data-act="league" data-k="${esc(l.key)}">
      <span>${SPORT[l.sport] || ''}</span>${esc(l.name)}${alert(l) ? '<i class="dot"></i>' : ''}</button>`).join('');
  const l = lg(ui.league);
  document.body.className = l ? l.sport : '';
  if (!l) { $('#view').innerHTML = banners() + '<p class="empty card">No leagues yet. Your Mac fills this in after its next check.</p>'; return; }
  $('#view').innerHTML = banners() + officeFor() + strip(l) + urgentFor(l) + offersFor(l) + weekFor(l) + builderShell(l) +
    '<div id="sugg"></div>' + sentFor(l) + moreFor(l);
  renderBuilder();
  if (ui.open.office && D.office && window.FO && $('#fo-root')) FO.mount($('#fo-root'), { data: D.office, phone: true });
  setTimeout(fillSuggestions, 30);
  if (ui.open.crew) fillPush();
}
/* GitHub runs the cloud crew every few hours (not the twice an hour crew.yml asks for) and never from about 2 to 8 AM,
   so it's late after 8 hours, or 14 when that night pause falls in between. */
function cloudLate(ms) {
  const pause = new Date(ms);
  pause.setHours(2, 0, 0, 0);
  if (pause.getTime() < ms) pause.setDate(pause.getDate() + 1);
  return Date.now() - ms > (pause.getTime() < Date.now() ? 14 : 8) * 3600e3;
}
function banners() {
  let h = '';
  if (STANDALONE && PUSH_OK && Notification.permission === 'default' && !((D.push || {}).subs || []).length && !readJSON(PUSH_HIDE) && (D.push || {}).key)
    h += `<div class="banner tip">🔔 <div><b>Want a buzz when someone sends you a trade offer?</b>
      <button class="linkish" data-act="push-on">Turn on notifications</button> <button class="linkish" data-act="push-hide">Not now</button></div></div>`;
  if (!STANDALONE && !readJSON(A2HS))
    h += `<div class="banner tip">📲 <div><b>Put it on your Home Screen:</b> tap Share, then Add to Home Screen. The icon opens unlocked, no code needed.
      <button class="linkish" data-act="a2hs-off">Hide</button></div></div>`;
  for (const a of (D.health.alerts || [])) h += `<div class="banner bad">⚠️ <div>${esc(a)}</div></div>`;
  for (const e of (D.errors || [])) if (!(D.health.alerts || []).length) h += `<div class="banner bad">⚠️ <div>${esc(e)}</div></div>`;
  if (D.ran && Date.now() - D.ran > 3 * 3600e3)
    h += `<div class="banner warn">🕒 <div><b>Last check ${esc(ago(D.ran))}.</b> Rosters may have changed since. Your Mac may be asleep; the cloud crew checks every few hours.</div></div>`;
  if (D.sample) h += `<div class="banner tip">This is sample data, not your leagues.</div>`;
  return h;
}

/* your team at a glance; tap it for this week's lineup and matchup, right below */
/* The front office (v2): the general manager's game plan on top; tap to walk into the office (phone/office.js draws it). */
function officeFor() {
  const o = D.office;
  if (!o || !window.FO || !(o.desks || []).length) return '';
  const p = o.plan, open = !!ui.open.office, m = (o.status || {}).meeting, nx = (o.next || [])[0];
  const sub = m ? `${esc(m.label)} going on now` : p ? `${esc(p.label || 'Meeting')} · ${esc(ago(new Date(p.at).getTime()))}` : nx ? `First meeting: ${esc(FO.when(nx.at))}` : '';
  return `<button class="fo-teaser ${open ? 'open' : ''}" data-act="part" data-part="office" aria-expanded="${open}">
    <span class="fo-eye">Front office${sub ? ' · ' + sub : ''}</span>
    <b>${p ? esc(p.headline) : 'Your front office hasn’t met yet'}</b>${p && p.highlight ? `<span class="fo-t-hl">${esc(p.highlight)}</span>` : ''}
    <span class="fo-t-more">${open ? 'Close the office ↑' : `Walk into the office · ${o.desks.length} desks ↓`}</span></button>` + (open ? '<div id="fo-root"></div>' : '');
}
function strip(l) {
  const m = l.matchup || {}, me = l.team || {};
  const odds = ((l.odds || {}).teams || {})[String((l.trade || {}).me)];
  const est = m.estimated || (!m.my_pts && !m.opp_pts);
  const proj = m.my_proj != null && m.opp_proj != null ? `proj ${num(m.my_proj, 0)}–${num(m.opp_proj, 0)}` : '';
  const score = m.opp_name ? `vs ${esc(m.opp_name)}${est ? (proj ? ' · ' + proj : '') : ` · ${num(m.my_pts)}–${num(m.opp_pts)}`}` : '';
  const open = !!ui.open.lineup;
  return `<button class="strip ${l.sport} ${open ? 'open' : ''}" data-act="part" data-part="lineup" aria-expanded="${open}">
    <span class="st-main"><span class="st-top"><b>${esc(me.name)}</b><span class="tag">${SITE[l.site] || ''} · Week ${esc(l.week)}</span></span>
      <small>${esc(me.record)} · ${ordinal(me.rank)} of ${esc(l.size)}${odds ? ` · playoffs ${pctOdds(odds.playoffs)}` : ''}</small>${score ? `<small>${score}</small>` : ''}</span>
    <span class="chev" aria-hidden="true"></span></button>` +
    (open ? `<div class="panel ${l.sport}">${matchupCard(l)}${lineupBody(l)}<div class="acts"><button class="btn sm ghost" data-act="open" data-url="${esc(l.url)}">Open in ${SITE[l.site] || 'the app'} ↗</button></div></div>` : '');
}
function urgentFor(l) {
  const fs = D.findings.filter(f => f.league === l.key && f.level === 'urgent');
  return fs.map(f => todoRow(f, false)).join('');
}
function todoRow(f, showLeague) {
  return `<div class="todo lv-${esc(f.level)}">${ava(f.bot)}<div><b>${esc(f.title)}</b>${f.detail ? `<p>${esc(f.detail)}</p>` : ''}
    <small>${esc(f.bot)} · ${esc(LEVEL_WORD[f.level] || '')}${showLeague ? ' · ' + esc(f.league_name) : ''}</small></div></div>`;
}

/* "This week": last week's result and the crew's moves in the last 7 days, newest first (phone.py _week_recap) */
function weekFor(l) {
  const w = l.week_recap;
  if (!w) return '';
  const cut = (w.result || '').lastIndexOf(' · ');  // the record change ("2-5 → 2-6") never breaks across lines
  const result = cut < 0 ? esc(w.result || '') : `${esc(w.result.slice(0, cut))} · <span style="white-space:nowrap">${esc(w.result.slice(cut + 3))}</span>`;
  const rows = (w.result ? `<div class="chg"><b>${result}</b></div>` : '') +
    ((w.moves || []).length ? w.moves.map(m => `<div class="chg">${esc(m.text)}<small>${esc(clock(m.t))}</small></div>`).join('')
      : '<div class="chg">No moves yet this week.</div>') +
    (w.more ? `<div class="chg"><small>and ${esc(w.more)} more: see Crew &amp; notifications below</small></div>` : '');
  return section('This week', `<div class="card wk">${rows}</div>`, 'last 7 days');
}

/* ---------------- offers sent to you (and by you) ---------------- */
function offersFor(l) {
  const inc = l.incoming || [];
  if (!inc.length) return '';
  return section(`Offers for you`, inc.map(o => offerCard(o, l, true)).join(''), `${inc.length} waiting`);
}
function sentFor(l) {
  const s = l.sent || [];
  if (!s.length) return '';
  const E = eng(l.key);
  const card = o => {
    const when = o.expires ? (d => `expires ${DAY[d.getDay()]} ${hm(d)}`)(new Date(o.expires)) : 'waiting';
    const ok = E && o.team_id && (o.give || []).every(p => p.id) && (o.get || []).every(p => p.id);
    const d = { team_id: o.team_id, give: o.give || [], get: o.get || [], my_gain: o.my_gain, their_gain: o.their_gain, chance: o.chance, risk: o.risk };
    return ok ? `<div class="crew-idea">${dealCard(l, E, d, `To ${o.team} · ${when}`)}${o.my_gain < 0.5 * Trade.MIN_GAIN[l.sport] ? `<p class="why warnline">It barely helps you any more: think about cancelling it on ${SITE[l.site]}.</p>` : ''}</div>`
      : offerCard(o, l, false);
  };
  return section('Offers you sent', s.map(card).join('') + `<button class="btn ghost wide" data-act="open" data-url="${esc(l.url)}">Manage them on ${SITE[l.site] || 'the site'} ↗</button>`, 'you or Cooper');
}
function offerCard(o, l, incoming) {
  const call = o.call || '', cls = /^(Accept|Worth)/.test(call) ? 'ok' : /^(Decline|Not)/.test(call) ? 'bad' : 'warn';
  let when = '';
  if (o.expires) { const d = new Date(o.expires); when = `Expires ${DAY[d.getDay()]} ${hm(d)}`; } else if (o.when) when = `Goes through ${o.when} if accepted`;
  let btns;
  if (incoming && l.site === 'espn') {
    btns = actionRow('offer-' + o.id, `<button class="btn primary" data-act="accept" data-id="${esc(o.id)}" data-k="${esc(l.key)}">Accept</button>
      <button class="btn ghost" data-act="reject" data-id="${esc(o.id)}" data-k="${esc(l.key)}">Decline</button>`);
  } else {
    btns = `<div class="acts"><button class="btn ${incoming ? 'primary' : 'ghost'}" data-act="open" data-url="${esc(o.url || l.url)}">${incoming ? 'Answer' : 'Open'} on ${SITE[l.site] || 'the site'} ↗</button></div>`;
  }
  const canLoad = o.team_id && (o.give || []).every(p => p.id) && (o.get || []).every(p => p.id);
  return `<article class="idea"><div class="idea-top">${ava('Cooper')}<div class="who">${incoming ? 'From' : 'To'} <b>${esc(o.team)}</b><span class="sub">${esc(when || l.name)}</span></div>
    <span class="pill ${cls}">${esc(cap(call))}</span></div>
    ${swap(o.give, o.get, l)}
    <div class="facts"><span class="fact ${o.my_gain >= 0 ? 'ok' : 'no'}">You ${signed(wk(l, o.my_gain))}/wk</span><span class="fact">Them ${signed(wk(l, o.their_gain))}/wk</span>
      ${incoming ? '' : `<span class="fact">${pct(o.chance)} chance of a yes</span>`}<span class="fact">Risk ${esc(o.risk || '–')}</span></div>
    ${o.drop_needed && o.drop_needed.length ? `<p class="why">You would need to drop ${esc(o.drop_needed.join(', '))}.</p>` : ''}
    ${claudeSays(o.claude)}${btns}
    ${canLoad ? `<button class="more-link" data-act="load" data-team="${esc(o.team_id)}" data-give="${esc(o.give.map(p => p.id).join(','))}" data-get="${esc(o.get.map(p => p.id).join(','))}">See the full analysis ↑</button>` : ''}</article>`;
}
function swap(give, get, l) {
  const col = (ps, label) => `<div class="side"><small>${label}</small>${(ps || []).map(p => chip(p, l)).join('')}</div>`;
  return `<div class="swap">${col(give, 'You give')}<div class="arrow">⇄</div>${col(get, 'You get')}</div>`;
}
function chip(p, l, cls = '') {
  return `<div class="pc ${cls}"><b>${esc(p.name)}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}</b><span class="sub">${esc(p.pos)} · ${esc(p.team || 'FA')} · ${num(wk(l, p.value))}/wk</span></div>`;
}
function claudeSays(v) {
  if (!v || !v.call) return '';
  const cls = { 'do it': 'ok', accept: 'ok', skip: 'bad', decline: 'bad' }[(v.call || '').toLowerCase()] || 'warn';
  return `<p class="cl"><span class="tagc">✦ Claude</span><span class="pill ${cls}">${esc(cap(v.call))}</span> ${esc(v.why || '')}${v.risk ? ` <span class="muted">Risk: ${esc(v.risk)}</span>` : ''}</p>`;
}
function actionRow(id, buttons) {
  const t = sentMarks()[id];
  if (t) return `<div class="waiting">⏳ Sent to the crew ${esc(ago(t))}. Waiting for its reply. <button data-act="unmark" data-id="${esc(id)}">Show buttons</button></div>`;
  return `<div class="acts">${buttons}</div>`;
}

/* ---------------- the trade builder ---------------- */
function builderShell(l) {
  return `<section class="desk" id="desk"><div class="desk-h"><h2>Build a trade</h2><button class="linkish" data-act="clear">Clear</button></div>
    <div class="tq"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
      <input id="tq" type="search" enterkeyhint="go" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"
        placeholder="Type a player, or “Kelce for Jefferson”" aria-label="Type a player or a whole trade"></div>
    <div id="ac"></div><div id="bb"></div></section>`;
}
let picker = null;  // which list is open under the two sides: 'give' | 'get' | 'team'
function renderBuilder() {
  const box = $('#bb');
  if (!box) return;
  const l = lg(ui.league), E = eng(l.key);
  if (!E) { box.innerHTML = '<p class="hint">Your Mac needs one more check before the trade desk works here.</p>'; return; }
  const b = desk(l.key), own = OWN[l.key];
  const row = (id, side) => {
    const p = own[id].p;
    return `<div class="tp"><div><b>${esc(short(p.name))}${p.badge ? `<span class="badge h${p.hurt}">${esc(p.badge)}</span>` : ''}</b>
      <small>${esc(p.pos)} · ${esc(p.team || 'FA')} · ${num(wk(l, p.value))}</small></div>
      <button class="x" data-act="drop" data-side="${side}" data-id="${esc(id)}" aria-label="Take ${esc(p.name)} out">×</button></div>`;
  };
  const add = (side, label) => `<button class="tp-add ${picker === side || (side === 'get' && picker === 'team') ? 'on' : ''}" data-act="pick" data-side="${side}">${label}</button>`;
  const them = b.team ? teamName(E, b.team) : '';
  let h = `<div class="sides">
    <div class="sidebox"><div class="side-h">You give</div><div class="side-t">${esc(l.team.name)}</div>${b.give.map(id => row(id, 'give')).join('')}${add('give', '+ Your player')}</div>
    <div class="sidebox"><div class="side-h">You get</div>${them ? `<button class="side-t team-btn" data-act="pick" data-side="team"><span>${esc(them)}</span><i class="dn"></i></button>` : '<div class="side-t muted">Any team</div>'}
      ${b.get.map(id => row(id, 'get')).join('')}${add('get', b.team ? '+ Their player' : '+ Pick a team')}</div></div>`;
  if (picker) h += pickerList(l, E, b);
  if (b.team && b.give.length && b.get.length) h += analysis(l, E, b);
  else if (b.give.length + b.get.length === 1) h += around(l, E, b.give[0] || b.get[0]);
  else if (!b.give.length && !b.get.length && !picker) h += '<p class="hint">Type names above, tap + to pick from a roster, or open one of Cooper’s ideas below. The analysis appears here as soon as both sides have a player.</p>';
  else h += `<p class="hint">${b.give.length ? `Now add what you want back${b.team ? '' : ': pick a team'}.` : 'Now add who you’d give up.'}</p>`;
  box.innerHTML = h;
  if (b.team && b.give.length && b.get.length) setTimeout(() => fillOdds(l, E, b), 20);
}
function teamLine(E, odds, tid) {
  const t = E.intel.teams.find(x => String(x.id) === tid) || {};
  return [odds[tid] ? `playoffs ${pctOdds(odds[tid].playoffs)}` : '', t.trades ? `${t.trades} trade${t.trades === 1 ? '' : 's'} so far` : t.adds ? `${t.adds} moves so far` : '']
    .filter(Boolean).join(' · ');
}
function pickerList(l, E, b) {
  if (picker === 'team' || (picker === 'get' && !b.team)) {
    const odds = (l.odds || {}).teams || {};
    const rows = Object.keys(E.others).map(tid => `<button class="pk" data-act="team" data-id="${esc(tid)}">
      <span class="pk-pos">${esc(((E.records || {})[tid] || '').replace(/-0$/, '') || '–')}</span>
      <span class="pk-main"><b>${esc(teamName(E, tid))}</b><small>${teamLine(E, odds, tid)}</small></span>
      <span class="pk-v">${b.team === tid ? '✓' : '›'}</span></button>`).join('');
    return `<div class="picker"><div class="pk-h">Trade with which team?</div>${rows}</div>`;
  }
  const side = picker, roster = side === 'give' ? E.roster : E.others[String(b.team)] || [];
  const chosen = new Set(side === 'give' ? b.give : b.get);
  const sorted = roster.slice().sort((x, y) => (x.on_ir - y.on_ir) || (Trade.v(y) - Trade.v(x)));
  const rows = sorted.map(p => `<button class="pk ${chosen.has(String(p.id)) ? 'on' : ''}" data-act="toggle" data-side="${side}" data-id="${esc(p.id)}">
    <span class="pk-pos">${esc(p.pos)}</span>
    <span class="pk-main"><b>${esc(p.name)}${p.badge ? `<span class="badge h${p.hurt}">${esc(p.badge)}</span>` : ''}</b><small>${esc(p.team || 'FA')} · ${p.on_ir ? 'injured reserve' : p.starter ? 'starter' : 'bench'}</small></span>
    <span class="pk-v">${num(wk(l, p.value))}<small>${chosen.has(String(p.id)) ? '✓ in' : '/wk'}</small></span></button>`).join('');
  return `<div class="picker"><div class="pk-h">${side === 'give' ? 'Your team' : esc(teamName(E, b.team))}<button class="linkish" data-act="pick" data-side="">Done</button></div>${rows}</div>`;
}

/* the verdict and everything behind it */
function headline(l, d) {
  const my = wk(l, d.my_gain), th = wk(l, d.their_gain);
  let s = Math.abs(my) < 0.05 ? 'It doesn’t change your starting lineup.' : `Your starting lineup gets ${num(Math.abs(my))} points a week ${my > 0 ? 'better' : 'worse'}.`;
  if (d.their_gain < Trade.THEIR_FLOOR[l.sport]) s += ` It costs them ${num(Math.abs(th))} a week, so they’ll probably say no.`;
  else if (th >= 0.05) s += ` It helps them too (${signed(th)} a week), which makes a yes likelier.`;
  if (d.risk === 'High') s += ' The risk is high: ' + (d.risks || []).join('; ') + '.';
  return s;
}
const callClass = c => /^(Accept|Worth)/.test(c) ? 'ok' : /^(Decline|Not)/.test(c) ? 'bad' : 'warn';
function analysis(l, E, b) {
  const d = memo('eval|' + l.key + '|' + b.team + '|' + b.give + '|' + b.get, () => Trade.evaluate(E, b.team, b.give, b.get));
  const ex = memo('why|' + Trade.sigOf(d) + b.team, () => Trade.explain(E, d));
  const tweaks = memo('tw|' + Trade.sigOf(d) + b.team, () => Trade.compromises(E, d));
  const left = Math.max((E.weeks_left || 0) - 1, 0);
  const why = (list, whose) => {
    if (!list.length) return `<li class="same">${whose === 'me' ? 'Your' : 'Their'} starting lineup stays the same: the players in it would sit on the bench.</li>`;
    const gaveIds = new Set((whose === 'me' ? d.give : d.get).map(p => String(p.id)));
    return list.map(x => {
      const what = x.how === 'in' ? `starts at ${esc(x.slot)}` : x.how === 'fa' ? `free agent, would start at ${esc(x.slot)}`
        : gaveIds.has(String(x.p.id)) ? `leaves ${esc(x.slot)} (traded)` : `goes to the bench (was ${esc(x.slot)})`;
      return `<li class="${x.how === 'out' ? 'out' : 'in'}"><em><b>${esc(short(x.p.name))}</b> ${what}</em><span>${x.how === 'out' ? '−' : '+'}${num(wk(l, Trade.v(x.p)))}</span></li>`;
    }).join('');
  };
  const key = 'trade-' + l.key + '-' + Trade.sigOf(d) + '-' + b.team, good = callClass(d.call) === 'ok';
  const send = l.site === 'espn'
    ? actionRow(key, `<button class="btn ${good ? 'primary' : 'ghost'} big" data-act="send-trade"><span class="ell">${good ? 'Send offer to' : 'Send it anyway to'} ${esc(d.team)}</span></button>`)
    : `<div class="acts"><button class="btn ${good ? 'primary' : 'ghost'} big" data-act="send-trade">Propose it on Yahoo ↗</button></div>`;
  return `<div class="verdict">
    <div class="v-top"><span class="pill big ${callClass(d.call)}">${esc(d.call)}</span><span class="v-chance">${pct(d.chance)} chance they say yes</span></div>
    <p class="v-why">${esc(headline(l, d))}</p>
    <div class="nums">
      <div class="nb ${d.my_gain >= 0 ? 'up' : 'down'}"><small>You</small><b>${signed(wk(l, d.my_gain))}</b><span>points a week</span><i><u>Playoff odds</u><span class="oz" id="odds-me">…</span></i></div>
      <div class="nb ${d.their_gain >= 0 ? 'up' : 'down'}"><small>${esc(d.team)}</small><b>${signed(wk(l, d.their_gain))}</b><span>points a week</span><i><u>Playoff odds</u><span class="oz" id="odds-them">…</span></i></div>
    </div>
    ${left && Math.abs(d.my_gain) >= 0.05 ? `<p class="tiny muted v-season">Over the ${left} regular-season week${left === 1 ? '' : 's'} after this one: about ${signed(wk(l, d.my_gain) * left, 0)} points for you.</p>` : ''}
    <div class="whys"><div><h4>Your lineup</h4><ul>${why(ex.me, 'me')}</ul></div><div><h4>Their lineup</h4><ul>${why(ex.them, 'them')}</ul></div></div>
    <div class="facts"><span class="fact ${d.risk === 'High' ? 'no' : d.risk === 'Low' ? 'ok' : ''}">Risk ${esc(d.risk)}</span><span class="fact">${esc(d.fair)}</span></div>
    ${d.scouting ? `<p class="why scout">${ava('Riley', 'sm')}<span>${esc(d.scouting)}.</span></p>` : ''}
    ${(d.risks || []).length ? `<ul class="risks">${d.risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${d.drop_needed && d.drop_needed.length ? `<p class="why">Your roster would be one too big: you’d drop ${esc(d.drop_needed.join(', '))}.</p>` : ''}
    ${tweaks.length ? `<h4 class="tw-h">Make it better</h4>${tweaks.map(t => `<button class="tweak" data-act="tweak" data-side="${t.side}" data-id="${esc(t.add)}">
      <span>${esc(t.label)}</span><small>You ${signed(wk(l, t.deal.my_gain))} · them ${signed(wk(l, t.deal.their_gain))}</small></button>`).join('')}` : ''}
    ${send}</div>`;
}
function fillOdds(l, E, b) {
  const me = $('#odds-me'), them = $('#odds-them');
  if (!me) return;
  const d = Trade.evaluate(E, b.team, b.give, b.get);
  const o = memo('odds|' + l.key + '|' + Trade.sigOf(d) + b.team, () => Trade.oddsChange(E, d));
  const line = ([a, z]) => { const dz = Math.round(z * 100) - Math.round(a * 100); return `${pctOdds(a)} → ${pctOdds(z)}${dz ? ` <em class="${dz > 0 ? 'up' : 'down'}">${dz > 0 ? '+' : '−'}${Math.abs(dz)}</em>` : ''}`; };
  if (!o) { me.textContent = 'not worked out'; them.textContent = 'not worked out'; return; }
  me.innerHTML = line(o.me); them.innerHTML = line(o.them);
}

/* one player on the desk: what it would take to get him (or what he'd bring back) */
function around(l, E, id) {
  const x = OWN[l.key][id];
  const r = memo('fp|' + l.key + '|' + id, () => Trade.forPlayer(E, id));
  if (r.error) return `<p class="hint">${esc(r.error)}</p>`;
  const mine = x.owner === 'me';
  const cards = r.options.concat((r.compromises || []).slice(0, 2).map(d => ({ label: 'Another way', deal: d })))
    .map(o => dealCard(l, E, o.deal, o.label)).join('');
  return `<h4 class="around-h">${mine ? `What ${esc(short(x.p.name))} could bring back` : `What it would take to get ${esc(short(x.p.name))}`}</h4>
    ${r.note ? `<p class="hint">${esc(aroundNote(l, r))}</p>` : ''}${cards || '<p class="hint">No deal found around him.</p>'}`;
}
function aroundNote(l, r) {
  const c = (r.options[0] || {}).deal;
  if (!c) return r.note;
  return 'No deal is clearly good for both teams right now. ' + (c.their_gain < 0
    ? `The closest one costs them ${num(Math.abs(wk(l, c.their_gain)))} a week, so they’d probably say no.`
    : `The closest one costs you ${num(Math.abs(wk(l, c.my_gain)))} a week.`);
}
function dealCard(l, E, d, label, extra = '') {
  const names = ps => ps.map(p => `<b>${esc(short(p.name))}</b> <small>${esc(p.pos)}</small>`).join(' + ');
  return `<button class="deal" data-act="load" data-team="${esc(d.team_id)}" data-give="${esc(d.give.map(p => p.id).join(','))}" data-get="${esc(d.get.map(p => p.id).join(','))}">
    <span class="deal-top"><span class="deal-l">${esc(label)} · ${esc(teamName(E, d.team_id))}</span><span class="deal-g ${d.my_gain >= 0 ? 'up' : 'down'}">${signed(wk(l, d.my_gain))}<small>/wk</small></span></span>
    <span class="deal-row"><span class="deal-k">Give</span><span>${names(d.give)}</span></span>
    <span class="deal-row"><span class="deal-k">Get</span><span>${names(d.get)}</span></span>
    <span class="deal-foot"><span>Them ${signed(wk(l, d.their_gain))}/wk · ${pct(d.chance)} yes · ${esc((d.risk || '–').toLowerCase())} risk${extra}</span><span class="deal-go">Analyze ›</span></span></button>`;
}

/* typing: names as you type, or a whole trade ("Kelce and Pacheco for Jefferson") */
function renderAC(text) {
  const box = $('#ac');
  const l = lg(ui.league), E = l && eng(l.key);
  if (!box || !E) return;
  const t = text.trim();
  if (!t) { box.innerHTML = ''; return; }
  const parsed = Trade.parse(E, t);
  if (parsed && parsed.length) {
    const g = parsed.filter(x => x.side === 'give').map(x => short(x.hit.p.name)), w = parsed.filter(x => x.side === 'get').map(x => short(x.hit.p.name));
    box.innerHTML = `<button class="ac-trade" data-act="ac-parse"><span><small>You give</small>${esc(g.join(' + ') || '–')}</span><span class="arrow">⇄</span>
      <span><small>You get</small>${esc(w.join(' + ') || '–')}</span><b>Use ›</b></button>`;
    return;
  }
  const hits = Trade.search(E, t, 6);
  box.innerHTML = hits.length ? `<div class="ac-list">${hits.map(x => `<button class="pk" data-act="ac-add" data-id="${esc(x.p.id)}">
    <span class="pk-pos">${esc(x.p.pos)}</span><span class="pk-main"><b>${esc(x.p.name)}</b><small>${x.owner === 'me' ? 'Your team' : esc(teamName(E, x.owner))} · ${esc(x.p.team || 'FA')}</small></span>
    <span class="pk-v">${num(wk(l, x.p.value))}<small>/wk</small></span></button>`).join('')}</div>`
    : `<p class="hint">No player called “${esc(t)}” in this league.</p>`;
}
function addPlayer(id, quiet) {
  const l = lg(ui.league), E = eng(l.key), x = OWN[l.key][String(id)];
  if (!x) return;
  const b = desk(l.key);
  id = String(id);
  if (x.owner === 'me') { if (!b.give.includes(id)) b.give.push(id); }
  else {
    if (b.team && String(b.team) !== x.owner && b.get.length && !quiet) toast(`A trade is with one team: switched to ${teamName(E, x.owner)}`);
    if (String(b.team) !== x.owner) { b.team = x.owner; b.get = []; }
    if (!b.get.includes(id)) b.get.push(id);
  }
  b.give = b.give.slice(-4); b.get = b.get.slice(-4);
  saveDesk(l.key, b);
}
function finishTyping() {
  const i = $('#tq');
  if (i) { i.value = ''; i.blur(); }
  $('#ac').innerHTML = '';
  picker = null;
  renderBuilder();
}
function useTyped() {
  const l = lg(ui.league), E = eng(l.key), t = ($('#tq') || {}).value || '';
  const parsed = Trade.parse(E, t);
  if (parsed && parsed.length) {
    const b = { team: null, give: [], get: [] };
    saveDesk(l.key, b);
    for (const x of parsed) addPlayer(x.hit.p.id, true);
  } else {
    const hit = Trade.search(E, t, 1)[0];
    if (!hit) return toast('No player by that name in this league');
    addPlayer(hit.p.id);
  }
  finishTyping();
}
document.addEventListener('input', e => { if (e.target.id === 'tq') renderAC(e.target.value); });
document.addEventListener('keydown', e => { if (e.target.id === 'tq' && e.key === 'Enter') { e.preventDefault(); useTyped(); } });
document.addEventListener('focusout', e => { if (e.target.id === 'tq' && pendingRender) setTimeout(() => { if (document.activeElement.id !== 'tq') render(); }, 300); });

/* ---------------- suggestions: Cooper's best trades in this league ---------------- */
const claudeRank = i => ({ 'do it': 0, accept: 0, maybe: 1 }[((i.claude || {}).call || '').toLowerCase()] ?? (i.claude ? 3 : 2));
function fillSuggestions() {
  const box = $('#sugg');
  if (!box) return;
  const l = lg(ui.league), E = eng(l.key);
  if (!E) { box.innerHTML = ''; return; }
  const crew = D.inbox.filter(i => i.status === 'pending' && i.kind === 'trade' && i.league === l.key)
    .sort((a, b) => claudeRank(a) - claudeRank(b) || (b.my_gain || 0) - (a.my_gain || 0));
  const sig = i => (i.give || []).map(p => String(p.id)).sort().join(',') + '|' + (i.get || []).map(p => String(p.id)).sort().join(',');
  const seen = new Set(crew.map(sig));
  const found = memo('find|' + l.key, () => Trade.find(E, 12)).filter(d => !seen.has(Trade.sigOf(d)));
  const all = crew.map(i => ({ crew: i })).concat(found.map(d => ({ d })));
  const n = ui.moreSug ? all.length : Math.min(all.length, 4);
  const cards = all.slice(0, n).map(x => x.crew ? crewIdea(l, E, x.crew) : dealCard(l, E, x.d, 'Idea')).join('');
  box.innerHTML = section('Best trades for you', cards || '<p class="empty card">No trade helps you right now without costing the other team too much. Cooper checks again every run.</p>',
    all.length ? `${all.length} found` : '') +
    (all.length > 4 ? `<button class="btn ghost wide" data-act="more-sug">${ui.moreSug ? 'Show fewer' : `Show ${all.length - 4} more`}</button>` : '') +
    `<p class="hint">Every idea is judged like the builder judges your own: both teams’ best lineups before and after, free agents counted. Tap one to see the full analysis.</p>`;
}
function crewIdea(l, E, i) {
  const ok = (i.give || []).every(p => p.id && (OWN[l.key][String(p.id)] || {}).owner === 'me') && (i.get || []).every(p => p.id && OWN[l.key][String(p.id)]);
  const d = { team_id: i.team_id || ((OWN[l.key][String(((i.get || [])[0] || {}).id)] || {}).owner), give: i.give || [], get: i.get || [], my_gain: i.my_gain, their_gain: i.their_gain, chance: i.chance, risk: i.risk };
  if (!ok || !d.team_id) return '';
  const btns = l.site === 'yahoo' ? '' : actionRow(i.id, `<button class="btn primary sm" data-act="approve" data-id="${esc(i.id)}">Send it</button><button class="btn ghost sm" data-act="decline" data-id="${esc(i.id)}">Not interested</button>`);
  return `<div class="crew-idea">${dealCard(l, E, d, i.bot === 'You' ? 'Yours' : 'Cooper')}${claudeSays(i.claude)}${btns}</div>`;
}

/* ---------------- more: lineup, standings, pickups, crew ---------------- */
function moreFor(l) {
  const claims = D.inbox.filter(i => i.status === 'pending' && i.kind === 'claim' && i.league === l.key);
  const part = (id, title, note, body) => `<details class="lgsec" data-part="${id}" ${ui.open[id] ? 'open' : ''}><summary>${title}<small>${note}</small></summary><div class="lgbody">${ui.open[id] ? body() : ''}</div></details>`;
  return `<h2 class="sec">More</h2>` +
    part('standings', 'Standings & playoff odds', esc(l.team.record), () => standings(l)) +
    (claims.length ? part('claims', 'Pickups waiting', `${claims.length} from Riley`, () => claims.map(ideaCard).join('')) : '') +
    part('crew', 'Crew & notifications', D.autopilot === 'on' ? 'autopilot on' : 'autopilot ' + esc(D.autopilot || 'off'), crew);
}
function standings(l) {
  const odds = (l.odds || {}).teams || {};
  const hasOdds = Object.keys(odds).length > 0;
  const st = (l.standings || []).map((s, i) => `<tr class="${s.mine ? 'mine' : ''}"><td>${i + 1}</td><td class="t">${esc(s.name)}</td><td>${esc(s.record)}</td><td class="r">${num(s.pf, 0)}</td>`
    + (hasOdds ? `<td class="p">${odds[s.id] ? pctOdds(odds[s.id].playoffs) : '–'}</td>` : '') + '</tr>').join('');
  const pw = (l.power || []).map(t => `<tr class="${t.mine ? 'mine' : ''}"><td>${esc(t.rank)}</td><td class="t">${esc(t.name)}</td>
    <td><span class="powbar"><i style="width:${Math.max(0, Math.min(100, +t.power || 0))}%"></i></span>${esc(t.power)}</td>
    <td class="r ${t.form > 0.03 ? 'up' : t.form < -0.03 ? 'down' : 'muted'}"><span class="form">${t.form > 0.03 ? '▲' : t.form < -0.03 ? '▼' : '–'}</span></td></tr>`).join('');
  return `<table class="tbl"><tr><th>#</th><th>Team</th><th>W-L</th><th class="r">Pts</th>${hasOdds ? '<th class="r">Playoffs</th>' : ''}</tr>${st}</table>
      ${hasOdds ? `<p class="tiny muted" style="margin:8px 0 14px">Top ${esc(l.odds.spots)} make the playoffs. Riley’s odds from ${esc(Number(l.odds.sims).toLocaleString('en-US'))} simulated seasons.</p>` : ''}
    <table class="tbl"><tr><th>#</th><th>Power rankings</th><th>Power</th><th class="r">Form</th></tr>${pw}</table>`;
}
function ideaCard(i) {  // a waiver pickup from Riley
  const yahoo = i.site === 'yahoo';
  const btns = `<button class="btn primary" data-act="approve" data-id="${esc(i.id)}">${yahoo ? 'Do it on Yahoo ↗' : 'Approve'}</button><button class="btn ghost" data-act="decline" data-id="${esc(i.id)}">Decline</button>`;
  const l = lg(i.league);
  return `<article class="idea flat"><div class="idea-top">${ava(i.bot)}<div class="who"><b>${esc(i.title)}</b><span class="sub">${i.waivers ? 'Waiver claim' : 'Free agent'}</span></div>
    <div class="gain">+${num(wk(l, i.gain))}<small> /wk</small></div></div>
    <div class="swap"><div class="side"><small class="add">Add</small>${chip(i.add, l, 'add')}</div><div class="arrow">⇄</div><div class="side"><small class="drop">Drop</small>${chip(i.drop, l, 'drop')}</div></div>
    ${i.why ? `<p class="why">${esc(i.why[0].toUpperCase() + i.why.slice(1))}.</p>` : ''}${i.waits_because ? `<p class="why">⏸ Left for you: ${esc(i.waits_because)}.</p>` : ''}${claudeSays(i.claude)}${actionRow(i.id, btns)}</article>`;
}
function crew() {
  const a = D.auto || {};
  const word = { on: 'On', preview: 'Preview only', off: 'Off', auto: 'Automatic', ask: 'Asks you' };
  const health = Object.entries(D.health.leagues || {}).map(([k, v]) => `<div class="health"><span>${esc(v.name)}</span>
    ${v.ok ? '<span class="pill ok">OK</span>' : `<span class="pill bad">${v.auth ? 'Sign in again' : 'Failing'}</span>`}</div>`).join('');
  const auto = (D.auto_log || []).slice(0, 6).map(e => `<div class="chg"><b>${esc(e.title)}</b> <span class="pill ${e.ok ? 'ok' : 'bad'}">${e.ok ? 'sent' : 'failed'}</span>
    <small>${esc(clock(e.time))} · ${esc(e.league || '')}${e.message ? ' · ' + esc(e.message) : ''}</small></div>`).join('');
  return `<div class="stat-grid">
    <div class="stat"><small>Lineup autopilot</small><b>${esc(word[D.autopilot] || D.autopilot || '–')}</b></div>
    <div class="stat"><small>Trades & claims</small><b>${a.trades === a.claims ? esc(word[a.trades] || '–') : `Trades ${esc((word[a.trades] || '–').toLowerCase())}, claims ${esc((word[a.claims] || '–').toLowerCase())}`}</b></div>
    <div class="stat"><small>Claude brain</small><b>${D.brain ? 'Connected' : 'Not connected'}</b></div>
    <div class="stat"><small>Checks today</small><b>${esc(D.health.runs_today ?? '–')}${D.health.median_secs ? ` · ${num(D.health.median_secs, 0)} s each` : ''}</b></div></div>
    ${health ? `<div class="sub-card">${health}</div>` : ''}
    <h4 class="sub-h">Notifications</h4><div id="pushcard"><p class="small muted" style="margin:0">Checking…</p></div>
    ${auto ? `<h4 class="sub-h">Trades and claims the crew made</h4><div>${auto}</div>` : ''}
    ${D.recap && D.recap.text ? `<h4 class="sub-h">Weekly recap · ${esc(D.recap.week || '')}</h4><div class="recap">${md(D.recap.text)}</div>` : ''}
    <h4 class="sub-h">This iPhone</h4><p class="small" style="margin:0 0 10px">Your Mac uploads a locked copy after every crew check, and the cloud crew does too while the Mac sleeps.
    Send, Approve and offer answers go to your cloud crew through GitHub.</p>
    <div class="acts"><button class="btn ghost sm" data-act="open" data-url="${esc(D.channel)}">Open Crew channel ↗</button><button class="btn ghost sm" data-act="lock">Lock this iPhone</button></div>`;
}

/* ---------------- this week: matchup and lineup (inside the strip) ---------------- */
function gstate(p, sport) {  // where a player's game is: 'bye', 'upcoming', 'live', 'done' or ''
  if (p.bye) return 'bye';
  const g = p.game;
  if (!g) return '';
  if (!g.date) return g.locked ? 'done' : 'upcoming';
  const now = Date.now();
  return now < g.date ? 'upcoming' : now < g.date + (GAME_HOURS[sport] || 3.5) * 3600e3 ? 'live' : 'done';
}
function matchupCard(l) {
  const theirs = (l.opp || {}).roster || [];
  if (l.sport !== 'football' || !theirs.length) return '';
  const weekPts = l.opp.week_pts, slots = l.slots || {};
  const order = ORDER.football.filter(s => slots[s]).concat(Object.keys(slots).filter(s => !ORDER.football.includes(s)));
  const mine = l.roster.filter(p => p.starter);
  const left = (ps, own) => ps.reduce((acc, p) => {
    const st = gstate(p, 'football');
    if (st === 'upcoming' || st === 'live') { acc.n += 1; acc.pts += Math.max((p.proj || 0) - (st === 'live' && (own || weekPts) ? p.pts || 0 : 0), 0); }
    return acc;
  }, { n: 0, pts: 0 });
  const cell = (p, own, side) => {
    if (!p) return `<div class="mu-p ${side} empty"><b>Empty</b></div>`;
    const st = gstate(p, 'football'), known = own || weekPts;
    const val = known ? (st === 'upcoming' ? `<i>${num(p.proj)}</i>` : num(p.pts || 0)) : `<i>${num(p.value)}</i>`;
    const tag = { live: '<span class="live">LIVE</span>', upcoming: known ? 'proj' : 'avg', bye: 'bye', done: known ? 'final' : 'avg' }[st] || (known ? '' : 'avg');
    return `<div class="mu-p ${side} ${st}"><b>${esc(short(p.name))}${p.badge ? `<span class="badge h${p.hurt}">${esc(p.badge)}</span>` : ''}</b>
      <small>${esc(p.pos)} · ${esc(p.team || 'FA')}</small><span class="mu-v">${val}<small>${tag}</small></span></div>`;
  };
  let rows = '';
  for (const s of order) {
    const a = mine.filter(p => p.slot === s), b = theirs.filter(p => p.slot === s);
    for (let i = 0; i < Math.max(a.length, b.length, slots[s] || 0); i++)
      rows += `<div class="mu-row">${cell(a[i], true, 'l')}<span class="mu-s">${esc(s)}</span>${cell(b[i], false, 'r')}</div>`;
  }
  const lm = left(mine, true), lt = left(theirs, false);
  const note = weekPts ? `Still to play: you ${lm.n} (about ${num(lm.pts)} more) · them ${lt.n} (about ${num(lt.pts)} more)`
    : `Still to play: you ${lm.n}. For them Yahoo only shows season averages, not this week’s games.`;
  return `<div class="grp">Matchup</div><div class="mu"><div class="mu-row mu-h"><span>${esc(l.team.name)}</span><span></span>
    <span>${esc((l.matchup || {}).opp_name || 'Them')}</span></div>${rows}<p class="tiny muted mu-note">${note}</p></div>`;
}
function planCard(l) {
  const p = l.plan || {}, bot = l.sport === 'hockey' ? 'Drew' : 'Casey';
  const on = D.autopilot === 'on';
  let state = '';
  if (p.moves && p.moves.length) state = p.applied ? 'Done on the last check.' : p.error ? `Didn’t go through: ${p.error}` :
    on ? `${bot} makes these moves on his own when they’re worth it.` : 'Autopilot is off: make these moves in the Mac app or on ' + (SITE[l.site] || 'the site') + '.';
  return `<div class="plan ${l.sport}"><div class="plan-h">${ava(bot, 'sm')}<b>${esc(bot)}’s lineup plan</b></div><p>${esc(p.text || 'No plan yet.')}</p>
    ${p.moves && p.moves.length ? `<ul>${p.moves.map(m => `<li>${esc(m.name)}: ${esc(m.from)} → ${esc(m.to)}</li>`).join('')}</ul>` : ''}
    ${state ? `<p class="small">${esc(state)}</p>` : ''}${l.ir_text ? `<p class="small">Injured reserve: ${esc(l.ir_text)}</p>` : ''}</div>`;
}
function lineupBody(l) {
  const r = l.roster || [], slots = l.slots || {};
  const order = ORDER[l.sport].filter(s => slots[s]).concat(Object.keys(slots).filter(s => !ORDER[l.sport].includes(s)));
  let start = '';
  for (const s of order) {
    const ps = r.filter(p => p.starter && p.slot === s);
    start += ps.map(p => playerRow(p, l, s)).join('');
    for (let i = ps.length; i < (slots[s] || 0); i++)
      start += `<div class="pl empty"><span class="slot">${esc(s)}</span><div class="pl-main"><b>Empty</b><small>Nobody is starting here</small></div></div>`;
  }
  const bench = r.filter(p => !p.starter && !p.ir), ir = r.filter(p => p.ir);
  const proj = r.filter(p => p.starter).reduce((n, p) => n + (p.proj || 0), 0);
  return planCard(l) +
    `<div class="grp">Starters <span style="float:right">${l.sport === 'football' ? 'proj ' + num(proj) : ''}</span></div>${start}` +
    (bench.length ? `<div class="grp">Bench</div>${bench.map(p => playerRow(p, l, 'BN')).join('')}` : '') +
    (ir.length ? `<div class="grp">Injured reserve</div>${ir.map(p => playerRow(p, l, 'IR')).join('')}` : '');
}
function playerRow(p, l, slot) {
  const g = p.game;
  const off = l.sport === 'hockey' && (p.bye || !p.today) && !(g && g.locked);  // hockey lineups are daily
  let when = '';
  if (off) when = 'No game today';
  else if (p.bye) when = 'Bye week';
  else if (g) when = (g.opp ? (g.opp.startsWith('@') ? g.opp : 'vs ' + g.opp) + ' · ' : '') + gameTime(g, l.sport);
  const bad = p.starter && (p.hurt >= 2 || (l.sport === 'football' && p.bye));
  const badge = p.badge ? `<span class="badge h${p.hurt}">${esc(p.badge)}</span>` : '';
  const right = p.pts != null ? `${num(p.pts)}<small>${p.proj != null ? 'proj ' + num(p.proj) : 'pts'}</small>`
    : p.bye ? '<span class="muted">–</span><small>bye</small>'
    : p.proj != null ? `<span class="muted">${num(p.proj)}</span><small>proj</small>` : '<span class="muted">–</span>';
  return `<div class="pl ${bad ? 'bad' : ''}"><span class="slot ${slot === 'BN' || slot === 'IR' ? 'bn' : ''}">${esc(slot)}</span>
    <div class="pl-main"><b>${esc(p.name)}${badge}</b><small>${esc(p.pos)} · ${esc(p.team || 'FA')}${when ? ' · ' + esc(when).replace(/\blive$/, '<span class="live">LIVE</span>') : ''}${p.hurt && p.status ? ' · ' + esc(p.status) : ''}</small></div>
    <div class="pl-pts">${right}</div></div>`;
}

/* ---------------- sending: one-tap GitHub issues for the cloud crew ---------------- */
let pending = null;
function sheet(o) {
  pending = o;
  const el = $('#sheet');
  el.innerHTML = `<div role="dialog" aria-modal="true"><div class="grab"></div><h3>${esc(o.title)}</h3>${o.body}
    ${o.cmd && o.showCmd !== false ? `<div class="cmd">${esc(o.cmd)}</div>` : ''}<div class="btns">${o.buttons}<button class="btn ghost big" data-act="close">Cancel</button></div></div>`;
  el.hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; pending = null; }
function crewCommand(title, cmd, markId, what, extra = {}) {
  sheet(Object.assign({ title, cmd, markId,
    body: `<p>Tap <b>Send to your crew</b>, then <b>Create</b> on GitHub. Your cloud crew ${esc(what)} in about a minute, answers there and closes it.</p>`,
    buttons: `<button class="btn primary big" data-act="send">Send to your crew ↗</button>
      <button class="btn big" data-act="copy">Copy the command instead</button>` }, extra));
}
function issueUrl(cmd, body) {  // a new issue in the private crew repo with the command as its title (fantasy/ghissue.command_issues)
  const repo = D.channel.replace(/\/issues\/\d+$/, '');
  body = body || 'Sent from the Claude Fantasy phone app. Your cloud crew does it in about a minute, answers here and closes this.';
  return `${repo}/issues/new?title=${encodeURIComponent(cmd)}&body=${encodeURIComponent(body)}`;
}
function sendTrade() {
  const l = lg(ui.league), E = eng(l.key), b = desk(l.key);
  if (!(b.team && b.give.length && b.get.length)) return;
  const d = Trade.evaluate(E, b.team, b.give, b.get);
  const give = d.give.map(p => p.name).join(' + '), get = d.get.map(p => p.name).join(' + ');
  const list = `<div class="sheet-swap"><div><small>You give</small>${esc(give)}</div><div><small>You get</small>${esc(get)}</div></div>`;
  if (l.site !== 'espn') {
    return sheet({ title: `Propose it to ${d.team}`, body: `${list}<p>The crew can’t send Yahoo trades, so this opens Yahoo’s trade page with ${esc(d.team)} picked. Tick the same players and tap Send.</p>`,
      buttons: `<button class="btn primary big" data-act="yahoo" data-url="${esc(E.propose + b.team)}">Open Yahoo ↗</button>` });
  }
  const cmd = `trade ${l.key}:${b.team}:${b.give.join(',')}:${b.get.join(',')}`;
  const why = `${d.call}: ${headline(l, d)} Chance of a yes: ${pct(d.chance)}.`;
  const body = `**Trade offer to ${d.team}** (${l.name})\n\nYou give: ${give}\nYou get: ${get}\n\n${why}\n\nSent from the trade desk in the Claude Fantasy phone app. Your cloud crew checks that every player is still on the same team, sends the offer on ESPN, answers here and closes this.`;
  crewCommand(`Send this offer to ${d.team}?`, cmd, 'trade-' + l.key + '-' + Trade.sigOf(d) + '-' + b.team, 'checks the rosters and sends it on ESPN', {
    body: `${list}<p><span class="pill ${callClass(d.call)}">${esc(d.call)}</span> ${esc(headline(l, d))}</p>
      <p>Tap <b>Send to your crew</b>, then <b>Create</b> on GitHub. Your cloud crew checks every player is still on the same team, sends it on ESPN in about a minute and answers there.</p>`,
    issueBody: body, showCmd: false });
}

/* ---------------- notifications (fantasy/push.py) ----------------
   iPhones only allow them for Home Screen apps. Turning them on: iOS asks, this iPhone subscribes with the crew's
   key, and a one-tap GitHub issue ("notifications on") hands the subscription to the cloud crew, which shares it
   with the Mac. Nothing about it is stored anywhere but your phone, your Mac and your private crew repo. */
const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const PUSH_HIDE = 'cf-push-off';
const fromUrl64Bytes = s => b64d(fromUrl64(s));
async function subIdOf(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(endpoint)));
  return Array.from(h, b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
const within = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what} didn’t answer`)), ms))]);
async function swReady() {  // the background helper (sw.js), registering it again if this app never got one
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) await navigator.serviceWorker.register('sw.js');
  return within(navigator.serviceWorker.ready, 10000, 'The app’s background helper');
}
async function pushState() {  // need-home | unsupported | blocked | off | pending (crew doesn't have it yet) | on
  if (!STANDALONE) return 'need-home';
  if (!PUSH_OK) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const sub = await within((await swReady()).pushManager.getSubscription(), 10000, 'iOS push');
  if (!sub) return 'off';
  return ((D.push || {}).subs || []).includes(await subIdOf(sub.endpoint)) ? 'on' : 'pending';
}
async function testReport(extra) {  // tests on the Mac only: what this phone sees, sent to the local test server
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  let regs = [];
  try { regs = (await navigator.serviceWorker.getRegistrations()).map(r => ({ scope: r.scope, active: r.active && r.active.state,
    installing: r.installing && r.installing.state, waiting: r.waiting && r.waiting.state })); } catch (e) { regs = String(e); }
  fetch('__test_subscription', { method: 'POST', body: JSON.stringify({ diag: { standalone: STANDALONE, push: PUSH_OK,
    permission: window.Notification && Notification.permission, controller: !!navigator.serviceWorker.controller, regs, ...extra } }) }).catch(() => {});
}
async function fillPush() {
  const box = $('#pushcard');
  if (!box) return;
  let why = '';
  const st = await pushState().catch(e => { why = e.message || String(e); return 'error'; });
  testReport({ state: st, why });
  const words = {
    'need-home': ['Add this app to your Home Screen first (Share → Add to Home Screen). iPhones only allow notifications from Home Screen apps.', ''],
    unsupported: ['This iPhone can’t get notifications from web apps (it needs iOS 16.4 or newer).', ''],
    blocked: ['Notifications are blocked for this app. Turn them on in Settings → Notifications → Fantasy.', ''],
    off: ['Get a buzz when someone sends you a trade offer, an offer you sent gets accepted, a starter is ruled out before lock, or the crew makes a move.',
      '<button class="btn primary sm" data-act="push-on">Turn on notifications</button>'],
    pending: ['Almost there: your crew doesn’t have this iPhone yet. Send it once more (one tap on GitHub).',
      '<button class="btn primary sm" data-act="push-on">Send to your crew</button>'],
    on: ['On for this iPhone. Your crew buzzes you about offers, lineup emergencies and the moves it makes.' + lastBuzz(),
      '<button class="btn ghost sm" data-act="push-test">Send a test</button><button class="btn ghost sm" data-act="push-off">Turn off</button>'],
    error: [`Couldn’t check notifications: ${esc(why)}. Close the app and open it again, then try once more.`,
      '<button class="btn primary sm" data-act="push-on">Try again</button>'] }[st];
  box.innerHTML = `<p class="small" style="margin:0 0 10px">${st === 'on' ? '🔔 ' : ''}${words[0]}</p>${words[1] ? `<div class="acts">${words[1]}</div>` : ''}`;
}
function lastBuzz() {
  const l = (D.push || {}).last;
  if (!l || !l.at) return '';
  if (l.ok) return ` Last buzz: ${esc(clock(Date.parse(l.at)))}.`;
  return ` <span class="down">The last one didn’t go through (${esc(l.problem || 'unknown problem')}).</span>`;
}
async function pushOn() {
  if (!(D.push || {}).key) return toast('Notifications aren’t ready on your Mac yet. Try again after its next check.');
  const perm = await Notification.requestPermission();  // first thing after the tap: iOS only asks from a tap
  if (perm !== 'granted') { fillPush(); return toast('Not allowed. You can turn them on in Settings → Notifications → Fantasy.'); }
  try {
    const reg = await swReady();
    const sub = (await within(reg.pushManager.getSubscription(), 10000, 'iOS push'))
      || await within(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromUrl64Bytes(D.push.key) }), 20000, 'iOS push');
    const json = JSON.stringify(sub.toJSON());
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) fetch('__test_subscription', { method: 'POST', body: json }).catch(() => {});  // tests on the Mac only
    const body = 'Turns on Claude Fantasy notifications for this iPhone. Sent from the phone app; your cloud crew saves it, answers here and closes this.\n\n```json\n' + json + '\n```';
    sheet({ title: 'One more tap', body: '<p>Tap <b>Send to your crew</b>, then <b>Create</b> on GitHub. Your crew saves this iPhone and sends a welcome buzz.</p>',
      buttons: `<button class="btn primary big" data-act="open-issue" data-url="${esc(issueUrl('notifications on', body))}">Send to your crew ↗</button>` });
  } catch (e) {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) fetch('__test_subscription', { method: 'POST', body: JSON.stringify({ error: `${e.name}: ${e.message}` }) }).catch(() => {});  // tests on the Mac only
    toast('Couldn’t turn them on: ' + (e.message || e));
  }
  fillPush();
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    t.remove(); return ok;
  }
}
function openUrl(url) { if (url) window.open(url, '_blank', 'noopener'); }
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function toDesk() {  // bring the builder into view, below the sticky header
  const el = $('#desk');
  if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - $('header.top').offsetHeight - 8, behavior: 'smooth' });
}

document.addEventListener('toggle', e => {  // the "More" sections remember whether they're open, and fill in when opened
  const d = e.target;
  if (!d.matches || !d.matches('details[data-part]')) return;
  ui.open[d.dataset.part] = d.open; writeJSON(UI, ui);
  const l = lg(ui.league);
  if (d.open && !d.querySelector('.lgbody').innerHTML) {
    d.querySelector('.lgbody').innerHTML = { standings: () => standings(l), crew, claims: () => D.inbox.filter(i => i.status === 'pending' && i.kind === 'claim' && i.league === l.key).map(ideaCard).join('') }[d.dataset.part]();
    if (d.dataset.part === 'crew') fillPush();
  }
}, true);

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) { if (e.target.id === 'sheet') closeSheet(); return; }
  const act = b.dataset.act, id = b.dataset.id;
  const l = D && lg(ui.league);
  if (act === 'league') { ui.league = b.dataset.k; picker = null; render(); scrollTo(0, 0); }
  else if (act === 'part') { ui.open[b.dataset.part] = !ui.open[b.dataset.part]; render(); }
  else if (act === 'refresh') { toast('Checking…'); refresh(true); }
  else if (act === 'open') openUrl(b.dataset.url);
  else if (act === 'lock') { writeJSON(KEY, null); writeJSON(LOCKED, ENV && ENV.salt); D = null; showLock('Locked. Type your code to open it again.'); }
  else if (act === 'a2hs-off') { writeJSON(A2HS, true); render(); }
  else if (act === 'push-on') pushOn();
  else if (act === 'push-hide') { writeJSON(PUSH_HIDE, true); render(); }
  else if (act === 'open-issue') { openUrl(b.dataset.url); closeSheet(); }
  else if (act === 'push-test') crewCommand('Send a test notification', 'notifications test', 'push-test', 'sends a test buzz');
  else if (act === 'push-off') {
    try { const s = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch (err) { /* already off */ }
    toast('Off for this iPhone. Your crew stops buzzing it.'); fillPush();
  }
  else if (act === 'unmark') { const m = sentMarks(); delete m[id]; writeJSON(SENT, m); render(); }
  // the trade builder
  else if (act === 'pick') { picker = picker === b.dataset.side || !b.dataset.side ? null : b.dataset.side; renderBuilder(); }
  else if (act === 'team') { const d = desk(l.key); if (String(d.team) !== id) { d.team = id; d.get = []; } saveDesk(l.key, d); picker = 'get'; renderBuilder(); }
  else if (act === 'toggle') {
    const d = desk(l.key), side = b.dataset.side, list = side === 'give' ? d.give : d.get;
    if (list.includes(id)) list.splice(list.indexOf(id), 1); else if (list.length < 4) list.push(id); else toast('Four players a side at most');
    saveDesk(l.key, d); renderBuilder();
  }
  else if (act === 'drop') { const d = desk(l.key), list = b.dataset.side === 'give' ? d.give : d.get; list.splice(list.indexOf(id), 1); saveDesk(l.key, d); renderBuilder(); }
  else if (act === 'clear') { saveDesk(l.key, { team: null, give: [], get: [] }); picker = null; const i = $('#tq'); if (i) i.value = ''; $('#ac').innerHTML = ''; renderBuilder(); }
  else if (act === 'ac-add') { addPlayer(id); finishTyping(); }
  else if (act === 'ac-parse') useTyped();
  else if (act === 'tweak') { addPlayer(id, true); renderBuilder(); toast('Added to the trade'); }
  else if (act === 'load') {
    saveDesk(l.key, { team: b.dataset.team, give: (b.dataset.give || '').split(',').filter(Boolean), get: (b.dataset.get || '').split(',').filter(Boolean) });
    picker = null; renderBuilder(); toDesk();
  }
  else if (act === 'send-trade') sendTrade();
  else if (act === 'more-sug') { ui.moreSug = !ui.moreSug; writeJSON(UI, ui); fillSuggestions(); }
  // the crew's ideas and offers sent to you
  else if (act === 'approve' || act === 'decline') {
    const i = D.inbox.find(x => x.id === id);
    if (!i) return;
    if (act === 'approve' && i.site === 'yahoo') {
      sheet({ title: i.title, body: `<p>The crew can’t make Yahoo moves, so you finish this one on Yahoo. ${i.kind === 'trade'
          ? `This opens ${esc(i.team)}’s team page: tap <b>Propose Trade</b> and pick the same players.`
          : `This opens Yahoo’s player search for ${esc(i.add.name)}: add him and drop ${esc(i.drop.name)}.`}</p>`,
        buttons: `<button class="btn primary big" data-act="yahoo" data-url="${esc(i.open_url)}">Open Yahoo ↗</button>` });
    } else crewCommand(i.title, `${act} ${i.id}`, i.id, act === 'approve' ? (i.kind === 'trade' ? 'sends the offer' : 'makes the move') : 'drops the idea for good');
  } else if (act === 'accept' || act === 'reject') {
    const o = l && (l.incoming || []).find(x => String(x.id) === id);
    if (!o) return;
    crewCommand(`${act === 'accept' ? 'Accept' : 'Decline'} the offer from ${o.team}`, `${act} ${String(o.id).slice(0, 8)}`, 'offer-' + o.id,
      act === 'accept' ? 'accepts it on ESPN' : 'declines it on ESPN');
  } else if (act === 'yahoo') { openUrl(b.dataset.url); closeSheet(); }
  else if (act === 'copy' && pending) {
    const ok = await copy(pending.cmd);
    toast(ok ? 'Copied: ' + pending.cmd : 'Couldn’t copy: press and hold the command to copy it');
    if (ok) {
      b.textContent = 'Copied ✓';
      if (!$('#sheet [data-act="go"]')) b.insertAdjacentHTML('afterend', '<button class="btn primary big" data-act="go">Open Crew channel ↗ (paste it there)</button>');
    }
  } else if ((act === 'go' || act === 'send') && pending) {
    const m = sentMarks(); m[pending.markId] = Date.now(); writeJSON(SENT, m);
    openUrl(act === 'send' ? issueUrl(pending.cmd, pending.issueBody) : D.channel); closeSheet(); render();
  } else if (act === 'close') closeSheet();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* pull down at the top to check for news */
(() => {
  let y0 = null, dy = 0;
  const ptr = $('#ptr');
  addEventListener('touchstart', e => { y0 = (scrollY <= 0 && D && !$('#app').hidden && $('#sheet').hidden && !e.target.closest('input')) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { ptr.style.height = Math.min(dy * 0.5, 60) + 'px'; ptr.textContent = dy > 120 ? 'Let go to check for news' : 'Pull to check for news'; }
  }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 != null && dy > 120) { ptr.textContent = 'Checking…'; refresh(true).finally(() => { ptr.style.height = '0'; }); }
    else ptr.style.height = '0';
    y0 = null;
  });
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
start();
