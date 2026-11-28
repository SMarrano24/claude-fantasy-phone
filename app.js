/* Claude Fantasy on Sam's iPhone (v3, 2026-11-16: "make it interactive and way simpler and smaller and not just walls
   of text"). Four tabs at the bottom (Today, Lineup, Trades, League), short rows you tap, the details in a sheet that
   slides up, swipe sideways to change league. Unlock the crew's latest run and keep it fresh. The trade builder is the AI
   front office's (fantasy/aitrade.py, through the cloud crew); phone/trade.js, the same math as the Mac's
   fantasy/trades.py, still finds the Ideas and reads typed trades.

   data.json is locked on Sam's Mac or by the cloud crew (fantasy/phone.py): PBKDF2-SHA256 (600,000 rounds) turns the
   code into two keys, AES-256-CBC locks the snapshot and HMAC-SHA256 seals it ("ctm1", the Claude Trade mirror's lock).
   This page only reads. Send / Approve / Accept / Decline open a one-tap GitHub issue for the cloud crew, which does
   it and replies there; Yahoo moves open Yahoo. */
'use strict';

const te = new TextEncoder(), td = new TextDecoder();
const KEY = 'cf-key', UI = 'cf-ui', SENT = 'cf-sent', DESK = 'cf-desk', AI = 'cf-ai';
const $ = s => document.querySelector(s);
let D = null, ENV = null, busy = false, THEN = '';
let ui = Object.assign({ league: '', tab: 'today', seg: {}, open: {}, moreSug: false, at: 0 }, readJSON(UI) || {});
if (typeof ui.open !== 'object' || !ui.open) ui.open = {};
if (typeof ui.seg !== 'object' || !ui.seg) ui.seg = {};
if (!ui.at || Date.now() - ui.at > 3600e3) ui.tab = 'today';  // opened again after a while: start on Today
(() => {  // a tapped notification opens the right league and tab: ./?tab=lineup&league=<key> (fantasy/push.py)
  const q = new URLSearchParams(location.search);
  if (q.get('league') && q.get('league') !== 'all') ui.league = q.get('league');
  const t = q.get('tab'), mv = q.get('moves');
  if (t === 'lineup') ui.tab = 'lineup';
  else if (t === 'gameday' || t === 'moves') ui.tab = 'today';
  if (mv === 'offers') { ui.tab = 'trades'; ui.seg.trades = 'offers'; }
  if (t === 'crew' || mv === 'done') THEN = 'crew';
  if ([...q.keys()].length) history.replaceState(null, '', location.pathname + location.hash);
})();

function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function writeJSON(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
function saveUI() { ui.at = Date.now(); writeJSON(UI, ui); }

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
  closeSheet(); closeOffice();
  $('#app').hidden = true; $('#lock').hidden = false;
  const m = $('#lockmsg'); m.textContent = msg || ''; m.className = '';
  $('#unlockbtn').disabled = false;
  $('.lock-help').textContent = STANDALONE
    ? 'The code is the one you chose when you set up the phone app on your Mac. You type it once; this app remembers it.'
    : 'The code is the one you chose when you set up the phone app on your Mac. After it opens, tap Share → Add to Home Screen: the icon opens unlocked, no code needed.';
}
function showApp() {
  $('#lock').hidden = true; $('#app').hidden = false;
  render('in');
  if (THEN) { const t = THEN; THEN = ''; setTimeout(() => runThen(t), 60); }
}

async function start() {
  if (!window.crypto || !crypto.subtle) return showLock('Open this link in Safari to unlock it.');
  try { ENV = await fetchEnv(); } catch (e) { return showLock('Couldn’t reach your crew’s data. Check your connection, then reopen the app.'); }
  // testing on the Mac only (fantasy.phone preview + the iPhone simulator):
  // localhost/#code=<test code>[&league=…&tab=today|lineup|trades|league&seg=…&then=crew|office|week|plan|idea:<id>|finding:<n>|player:<id>|offer:<id>|team:<id>&open=…&desk=…]
  let testCode = '';
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.hash.startsWith('#code=')) {
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.get('league')) ui.league = q.get('league');
    if (q.get('tab')) ui.tab = q.get('tab');
    if (q.get('seg')) ui.seg[ui.tab] = q.get('seg');
    if (q.get('then')) THEN = q.get('then');
    for (const k of (q.get('open') || '').split(',').filter(Boolean)) ui.open[k] = true;
    if (q.get('desk')) { const [lk, tm, gv, gt] = q.get('desk').split(':'); const d = readJSON(DESK) || {}; d[lk] = { team: tm || null, give: (gv || '').split(',').filter(Boolean), get: (gt || '').split(',').filter(Boolean) }; writeJSON(DESK, d); }
    testCode = q.get('code');
    history.replaceState(null, '', location.pathname);
  }
  const bits = savedBits(ENV);
  if (bits) {
    try { D = await unlock(ENV, bits); remember(); return showApp(); } catch (e) { writeJSON(KEY, null); if (!testCode) return showLock('The code changed. Type the new one.'); }
  }
  showLock('');
  if (testCode) { $('#code').value = testCode; $('#lockform').requestSubmit(); }
}

$('#lockform').addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('#code').value;
  if (!norm(code)) return;
  // Fri Nov 27 (phone review): if the first load failed (no signal, or GitHub mid-rebuild), Unlock did nothing at all;
  // now it tries to fetch the data again first
  if (!ENV) { try { ENV = await fetchEnv(); } catch (err) { return showLock('Still can’t reach your crew’s data. Check your connection and tap Unlock again.'); } }
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

let checkAgain = false;
async function refresh(manual) {
  if (!ENV) return;
  // Fri Nov 27 (phone review): a pull to refresh while a background check was running (right after coming back from
  // GitHub, say) did nothing at all; now it runs, with its answer, when that check ends
  if (busy) { if (manual) checkAgain = true; return; }
  busy = true;
  $('#when').classList.add('spin');
  try {
    const env = await fetchEnv();
    // with no signal the saved copy comes back (sw.js), which isn't "up to date" (phone review)
    if (env.iv === ENV.iv) { if (manual) toast(navigator.onLine === false ? 'No connection: this is the copy from ' + clock(D.ran) : 'Up to date: nothing new since ' + clock(D.ran)); return; }
    const bits = savedBits(env);
    if (!bits) { ENV = env; return showLock('The code changed. Type the new one.'); }
    const asked = Object.keys(readJSON(AI) || {});
    D = await unlock(env, bits); ENV = env;
    const answered = asked.some(k => (D.ai_trades || []).some(a => a.id === k));
    if (typing()) { pendingRender = true; if (answered) toast('✦ The front office answered'); return; }  // never re-draw under your typing
    render();
    if (answered) toast('✦ The front office answered');
    else if (manual) toast('Updated');
  } catch (e) {
    if (manual) toast('Couldn’t check: no connection?');
  } finally {
    busy = false; $('#when').classList.remove('spin');
    // (not over the lock screen: the check that just ended may have found the code changed; code review)
    if (checkAgain) { checkAgain = false; if (D && !$('#app').hidden) setTimeout(() => refresh(true), 0); }
  }
}
let pendingRender = false;
const typing = () => !!document.activeElement && ['tq', 'wish'].includes(document.activeElement.id);
document.addEventListener('visibilitychange', () => { if (!document.hidden && D) refresh(false); else if (!document.hidden && !D && !ENV) start(); });  // a failed first load tries again
setInterval(() => { if (!document.hidden && D) refresh(false); }, 120000);
setInterval(() => { if (!document.hidden && D && Object.keys(aiStore()).length) refresh(false); }, 30000);  // a front-office answer is on its way

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
const LEVEL_WORD = { urgent: 'Fix before lock', warn: 'Keep an eye on', tip: 'Could gain points', info: 'FYI', good: 'All set' };
const levelWord = f => f.held ? 'Needs your OK' : f.nofix ? 'No fix found' : (LEVEL_WORD[f.level] || '');  // v3.4: a hole the crew couldn't fix isn't "Fix before lock"
const ORDER = { football: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'OP', 'D/ST', 'K'], hockey: ['C', 'LW', 'RW', 'F', 'D', 'G', 'UTIL'] };
const ava = (b, cls = '') => `<span class="ava ${cls}" style="--c:${(BOT[b] || ['#a6a39b'])[0]}" aria-hidden="true">${esc((b || '?')[0])}</span>`;
const sh = (title, note = '') => `<div class="sh"><span>${esc(title)}</span>${note ? `<small>${note}</small>` : ''}</div>`;
const lg = k => D.leagues.find(l => l.key === k);
function sentMarks() {  // commands this phone handed to the crew, until the next upload shows them done (2 hours at most)
  const m = readJSON(SENT) || {}, now = Date.now();
  for (const k of Object.keys(m)) if (now - m[k] > 2 * 3600e3) delete m[k];
  // Fri Nov 27 (phone review): an idea the crew has already handled kept "Sent … waiting" for up to 2 hours
  const inbox = typeof D !== 'undefined' && D && D.inbox || [];
  for (const k of Object.keys(m)) { const i = inbox.find(x => x.id === k); if (i && i.status !== 'pending') delete m[k]; }
  return m;
}
function md(text) {  // the weekly recap: headings, bullets, **bold**; everything else as plain text
  const out = []; let list = [];
  const flush = () => { if (list.length) { out.push('<ul>' + list.join('') + '</ul>'); list = []; } };
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  for (const raw of String(text || '').split('\n')) {
    const s = raw.trim();
    if (!s) { flush(); continue; }
    if (/^#{1,6}\s/.test(s)) { flush(); out.push(`<p><b>${inline(s.replace(/^#+\s*/, ''))}</b></p>`); }
    else if (/^[-*]\s/.test(s)) list.push(`<li>${inline(s.slice(2))}</li>`);
    else { flush(); out.push(`<p>${inline(s)}</p>`); }
  }
  flush();
  return out.join('');
}
const short = n => /D\/ST|DEF/.test(n || '') ? n : String(n || '').replace(/^(\S)\S*\s+(?=\S)/, '$1. ');  // "J. Jefferson", but "Eagles D/ST"
const firstSentence = s => { s = String(s || ''); const m = s.match(/^(.{20,}?[.!?])\s/); return m ? m[1] : s; };
const whoLine = (bot, text) => `<div class="who-line">${ava(bot, 'sm')}<span>${esc(bot)}${text ? ' · ' + esc(text) : ''}</span></div>`;
const ICON = {
  today: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/><circle cx="12" cy="15" r="1.6"/>',
  lineup: '<path d="M8.5 3.5 3.5 6.5l2 4.2 2.2-1V20.5h8.6V9.7l2.2 1 2-4.2-5-3a3.5 3.5 0 0 1-7 0z"/>',
  trades: '<path d="M7.5 4 3.5 8l4 4M3.5 8h13M16.5 20l4-4-4-4M20.5 16h-13"/>',
  league: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0zM8 6.5H4.5a3.5 3.5 0 0 0 3.7 4.2M16 6.5h3.5a3.5 3.5 0 0 1-3.7 4.2M12 13.5v3.5M8.5 20.5h7M10 17h4"/>',
  refresh: '<path d="M20 11.5a8 8 0 1 1-2.6-6"/><path d="M20 4v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>' };
const svg = (name, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}">${ICON[name]}</svg>`;

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
const wk = (l, x) => x == null || (l.stray && l.sport !== 'football') ? null : x * ((eng(l.key) || {}).factor || 1);  // per-game gains → points a week (hockey plays 3-4 games a week)
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

/* ---------------- the frame: top bar, league picker, tab bar ---------------- */
function pickLeague() {
  if (ui.league && lg(ui.league)) return;
  const busy = D.leagues.find(l => (l.incoming || []).length);
  ui.league = (busy || D.leagues[0] || {}).key || '';
}
const TAB_NAMES = { today: 'Today', lineup: 'Lineup', trades: 'Trades', league: 'League' };
function render(anim) {
  pendingRender = false;
  ENG = {}; OWN = {}; CACHE = {};
  pickLeague();
  if (!TAB_NAMES[ui.tab]) ui.tab = 'today';
  saveUI();
  renderTop();
  const l = lg(ui.league);
  document.body.className = l ? l.sport : '';
  renderTabs(l);
  const v = $('#view');
  if (!l) { v.innerHTML = notes() + '<p class="empty">No leagues yet. Your Mac fills this in after its next check.</p>'; return; }
  v.innerHTML = { today, lineup: lineupTab, trades: tradesTab, league: leagueTab }[ui.tab](l);
  v.className = '';
  if (anim) { void v.offsetWidth; v.className = anim; }
  if (ui.tab === 'trades') {
    const s = tradeSeg(l);
    if (s === 'ideas') setTimeout(fillSuggestions, 30);
    else if (s === 'build') renderBuilder();
  }
}
/* GitHub runs the cloud crew every few hours (not the twice an hour crew.yml asks for) and never from about 2 to 8 AM,
   so it's late after 8 hours, or 14 when that night pause falls in between. */
function cloudLate(ms) {
  const pause = new Date(ms);
  pause.setHours(2, 0, 0, 0);
  if (pause.getTime() < ms) pause.setDate(pause.getDate() + 1);
  return Date.now() - ms > (pause.getTime() < Date.now() ? 14 : 8) * 3600e3;
}
const isStale = () => D.ran && Date.now() - D.ran > 3 * 3600e3;
function renderTop() {
  const w = $('#when');
  const late = D.where !== 'cloud' && D.cloud_ran && cloudLate(D.cloud_ran);
  w.className = 'when' + (isStale() ? ' stale' : late ? ' late' : '') + (busy ? ' spin' : '');
  const d = D.ran ? new Date(D.ran) : null;
  const t = !d ? 'Not yet' : d.toDateString() === new Date().toDateString() ? hm(d) : `${DAY[d.getDay()]} ${hm(d).replace(':00', '')}`;
  w.innerHTML = `<i></i>${esc(t)}${svg('refresh')}`;
  w.setAttribute('aria-label', `${D.ran ? `Checked ${clock(D.ran)} by ${D.where === 'cloud' ? 'the cloud crew' : 'your Mac'}` : 'Not checked yet'}. Tap to check for news.`);
  const alert = l => (l.incoming || []).length || D.findings.some(f => f.league === l.key && f.level === 'urgent');
  const combo = l => D.leagues.filter(x => x.sport === l.sport && x.site === l.site).length;
  const label = l => combo(l) === 1 ? (SITE[l.site] || l.name) : String(l.name || '').replace(/^My\s+/i, '').replace(/\s+League$/i, '') || l.name;
  $('#chips').innerHTML = D.leagues.length < 2 ? '' : D.leagues.map(l => `<button class="lgb ${ui.league === l.key ? 'on' : ''}" data-act="league" data-k="${esc(l.key)}"
      aria-pressed="${ui.league === l.key}" aria-label="${esc(l.name)}${alert(l) ? ', needs you' : ''}"><span aria-hidden="true">${SPORT[l.sport] || ''}</span><span class="nm">${esc(label(l))}</span>${alert(l) ? '<i class="dot"></i>' : ''}</button>`).join('');
  $('#chips').hidden = D.leagues.length < 2;
}
function renderTabs(l) {
  const n = { today: l ? todos(l).length : 0, trades: l ? (l.incoming || []).length : 0 };
  $('#tabs').innerHTML = Object.keys(TAB_NAMES).map(t => `<button class="tab ${ui.tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}" ${ui.tab === t ? 'aria-current="page"' : ''}>
    ${svg(t)}<span>${TAB_NAMES[t]}</span>${n[t] ? `<i class="n" aria-label="${n[t]} waiting">${n[t]}</i>` : ''}</button>`).join('');
}
const segCtl = (g, items, on) => `<div class="seg" role="tablist">${items.map(([v, label, n]) =>
  `<button role="tab" class="${v === on ? 'on' : ''}" aria-selected="${v === on}" data-act="seg" data-g="${g}" data-v="${v}">${esc(label)}${n ? `<i class="n">${n}</i>` : ''}</button>`).join('')}</div>`;
const fold = (k, label, note, body) => `<button class="fold ${ui.open[k] ? 'open' : ''}" data-act="fold" data-k="${esc(k)}" aria-expanded="${!!ui.open[k]}">
  <span>${label}</span><small>${note}</small><span class="chev" aria-hidden="true"></span></button><div class="list" ${ui.open[k] ? '' : 'hidden'}>${body}</div>`;

/* one-line notes at the top of Today (each one taps somewhere or hides) */
function notes() {
  let h = '';
  if (STANDALONE && PUSH_OK && Notification.permission === 'default' && !((D.push || {}).subs || []).length && !readJSON(PUSH_HIDE) && (D.push || {}).key)
    h += `<div class="note tip"><span>🔔 <b>Get a buzz</b> when someone sends you a trade offer.</span>
      <button class="go" data-act="push-on">Turn on</button><button class="x" data-act="push-hide" aria-label="Not now">×</button></div>`;
  if (!STANDALONE && !readJSON(A2HS))
    h += `<div class="note tip"><span>📲 <b>Add to Home Screen</b> (Share button): it opens unlocked.</span>
      <button class="x" data-act="a2hs-off" aria-label="Hide this">×</button></div>`;
  for (const a of (D.health.alerts || [])) h += `<button class="note bad" data-act="crew"><span>⚠️ ${esc(a)}</span><span class="chev" aria-hidden="true"></span></button>`;
  if (!(D.health.alerts || []).length) for (const e of (D.errors || [])) h += `<button class="note bad" data-act="crew"><span>⚠️ ${esc(e)}</span><span class="chev" aria-hidden="true"></span></button>`;
  if (isStale())
    h += `<button class="note warn" data-act="refresh"><span>🕒 <b>Last check ${esc(ago(D.ran))}.</b> Your Mac may be asleep.</span><span class="go">Check</span></button>`;
  if (D.sample) h += `<div class="note tip"><span>This is sample data, not your leagues.</span></div>`;
  return h;
}

/* ---------------- Today: the score, three numbers, what needs you ---------------- */
function gstate(p, sport) {  // where a player's game is: 'bye', 'upcoming', 'live', 'done' or ''
  if (p.bye) return 'bye';
  const g = p.game;
  if (!g) return '';
  if (!g.date) return g.locked ? 'done' : 'upcoming';
  const now = Date.now();
  return now < g.date ? 'upcoming' : now < g.date + (GAME_HOURS[sport] || 3.5) * 3600e3 ? 'live' : 'done';
}
function today(l) {
  return notes() + hero(l) + tiles(l) + bestAdd(l) + todoBlock(l) + strays() + gmCard();
}
// Fri Nov 27: an idea kept from a league this update couldn't read (approvals.merge keeps it, marked "carried") showed
// in the Mac's Approvals but nowhere on the phone. It gets its own short list here, and its sheet opens without the
// league's data (tests/phone_stray_ideas_test.py)
function strays() {
  const keys = new Set(D.leagues.map(l => l.key)), marks = sentMarks();
  const xs = D.inbox.filter(i => i.status === 'pending' && !keys.has(i.league));
  if (!xs.length) return '';
  return sh('Also waiting', 'league not read this time') + `<div class="list">${xs.map(i => row({ lv: i.kind === 'trade' ? 'trade' : 'claim',
    ic: i.kind === 'trade' ? '⇄' : '+', act: 'idea', id: i.id, title: i.title, waiting: marks[i.id], sub: `${i.bot} · ${i.league_name || 'another league'}` })).join('')}</div>`;
}
function hero(l) {
  const m = l.matchup || {}, me = l.team || {};
  const hasMu = l.sport === 'football' && ((l.opp || {}).roster || []).length;
  const go = `data-act="tab" data-tab="lineup" data-seg="${hasMu ? 'matchup' : 'mine'}"`;
  const tag = `<span class="tag">${esc(l.name)} · Week ${esc(l.week)}</span>`;
  if (!m.opp_name) {
    return `<button class="hero" ${go}><div class="h-top">${tag}<span class="h-st">${esc(SITE[l.site] || '')}</span></div>
      <div class="h-score"><div class="h-side me lead"><b>${esc(me.record || '–')}</b><span>${esc(me.name)}</span></div></div>
      <div class="h-foot"><span>No matchup this week</span><span>${ordinal(me.rank)} of ${esc(l.size)}</span></div></button>`;
  }
  const est = m.estimated || (!m.my_pts && !m.opp_pts);
  const starters = (l.roster || []).filter(p => p.starter);
  const live = starters.some(p => gstate(p, l.sport) === 'live');
  const left = starters.filter(p => ['upcoming', 'live'].includes(gstate(p, l.sport))).length;
  const opp = l.opp || {}, theirs = (opp.roster || []).filter(p => p.starter);
  const theirLeft = opp.week_pts && theirs.length ? theirs.filter(p => ['upcoming', 'live'].includes(gstate(p, l.sport))).length : null;
  const final = !est && !left && l.sport === 'football' && (theirLeft === 0 || (theirLeft == null && (m.win_prob === 0 || m.win_prob === 1)));
  const a = est ? m.my_proj : m.my_pts, z = est ? m.opp_proj : m.opp_pts;
  const st = live ? '<span class="h-st on"><i></i>Live</span>' : final ? '<span class="h-st">Final</span>'
    : est ? '<span class="h-st">Projected</span>' : `<span class="h-st">${left} to play</span>`;
  const wp = m.win_prob;
  const foot = final ? `<span>${a > z ? 'You won' : a < z ? 'You lost' : 'A tie'} by ${num(Math.abs(a - z))}</span><span>vs ${esc(m.opp_record || '')}</span>`
    : `<span>${wp != null ? `Win chance ${pctOdds(wp)}` : ''}</span><span>${!est && m.my_proj != null ? `proj ${num(m.my_proj, 0)}–${num(m.opp_proj, 0)}` : esc(m.opp_record ? 'they’re ' + m.opp_record : '')}</span>`;
  return `<button class="hero" ${go} aria-label="${esc(`${me.name} ${num(a)}, ${m.opp_name} ${num(z)}. Open the ${hasMu ? 'matchup' : 'lineup'}`)}">
    <div class="h-top">${tag}${st}</div>
    <div class="h-score"><div class="h-side me ${a >= z ? 'lead' : ''}"><b>${num(a)}</b><span>${esc(me.name)}</span></div><span class="h-vs">vs</span>
      <div class="h-side r ${z > a ? 'lead' : ''}"><b>${num(z)}</b><span>${esc(m.opp_name)}</span></div></div>
    ${wp != null && !final ? `<div class="h-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, wp)) * 100)}%"></i></div>` : ''}
    <div class="h-foot">${foot}</div></button>`;
}
function lastWeek(l) {  // "Week 9: lost 90.9–122.6 to Allentown Hurdles · 2-6 → 2-7" (phone.py _week_recap)
  const r = (l.week_recap || {}).result || '';
  const m = r.match(/(won|lost|tied) ([\d.]+)–([\d.]+)(?: (?:to|vs) (.+?))?(?: · |$)/);
  return m ? { res: m[1], a: +m[2], z: +m[3], opp: m[4] || '' } : null;
}
function tiles(l) {
  const me = l.team || {}, odds = ((l.odds || {}).teams || {})[String((l.trade || {}).me)], w = lastWeek(l);
  const t1 = `<button class="tile" data-act="tab" data-tab="league" data-seg="standings"><small>Record</small><b>${esc(me.record || '–')}</b><span>${ordinal(me.rank)} of ${esc(l.size)}</span></button>`;
  const t2 = odds
    ? `<button class="tile ${odds.playoffs >= 0.5 ? 'up' : odds.playoffs < 0.2 ? 'down' : ''}" data-act="tab" data-tab="league" data-seg="standings"><small>Playoffs</small><b>${pctOdds(odds.playoffs)}</b><span>top ${esc(l.odds.spots)} make it</span></button>`
    : `<button class="tile" data-act="tab" data-tab="league" data-seg="standings"><small>Points</small><b>${num(me.pf, 0)}</b><span>${esc(me.streak || '')}</span></button>`;
  const score = w ? `${num(w.a, 0)}–${num(w.z, 0)}` : '';  // "116–117" was cut to "116–1…" at 375 wide (Fri Nov 27): a long score is set a size smaller
  const t3 = w
    ? `<button class="tile ${w.res === 'won' ? 'up' : w.res === 'lost' ? 'down' : ''}" data-act="week"><small>Last week</small><b${score.length > 6 ? ' class="long"' : ''}>${score}</b><span>${esc(cap(w.res) + (w.opp ? (w.res === 'lost' ? ' to ' : ' vs ') + w.opp : ''))}</span></button>`
    : `<button class="tile" data-act="week"><small>This week</small><b>${((l.week_recap || {}).moves || []).length}</b><span>crew moves</span></button>`;
  return `<div class="tiles">${t1}${t2}${t3}</div>`;
}
function todos(l) {  // what needs Sam in this league: urgent fixes, offers, pickups and trades waiting for an OK
  const out = [], marks = sentMarks();
  D.findings.forEach((f, n) => { if (f.league === l.key && f.level === 'urgent') out.push({ lv: 'urgent', ic: '!', act: 'finding', id: n, title: f.title, sub: `${f.bot} · ${levelWord(f)}` }); });
  for (const o of (l.incoming || [])) {
    out.push({ lv: 'offer', ic: '⇄', act: 'offer', id: o.id, title: `Offer from ${o.team}`, waiting: marks['offer-' + o.id],
      sub: `Get ${(o.get || []).map(p => short(p.name)).join(' + ')} for ${(o.give || []).map(p => short(p.name)).join(' + ')}`, end: wk(l, o.my_gain) });
  }
  // Fri Nov 27 (phone review): an OK that didn't go through just vanished from To do, which looked like it worked
  for (const i of D.inbox.filter(i => i.status === 'failed' && i.league === l.key && i.decided && Date.now() - i.decided < 24 * 3600e3))
    out.push({ lv: 'urgent', ic: '!', act: 'idea', id: i.id, title: i.title, sub: `Didn’t go through${i.error ? ': ' + i.error : ''}` });
  for (const i of D.inbox.filter(i => i.status === 'pending' && i.league === l.key)) {
    if (i.kind === 'claim') out.push({ lv: 'claim', ic: '+', act: 'idea', id: i.id, title: `Add ${short(i.add.name)}, drop ${short(i.drop.name)}`, waiting: marks[i.id],
      sub: `${i.bot} · ${i.waivers ? 'waiver claim' : 'free agent'}${i.site === 'yahoo' ? ' · on Yahoo' : ''}`, end: wk(l, i.gain) });
    else if (i.kind === 'trade') out.push({ lv: 'trade', ic: '⇄', act: 'idea', id: i.id, title: `Trade ${(i.give || []).map(p => short(p.name)).join(' + ')} for ${(i.get || []).map(p => short(p.name)).join(' + ')}`,
      waiting: marks[i.id], sub: `${i.bot} · with ${i.team} · ${pct(i.chance)} yes`, end: wk(l, i.my_gain) });
  }
  return out;
}
function row(x) {
  const sub = x.waiting ? `Sent to your crew ${ago(x.waiting)} · waiting` : x.sub;
  return `<button class="row lv-${x.lv} ${x.waiting ? 'waiting' : ''}" data-act="${x.act}" data-id="${esc(x.id)}">
    <span class="r-ic" aria-hidden="true">${esc(x.ic)}</span><span class="r-main"><b>${esc(x.title)}</b><small>${esc(sub)}</small></span>
    ${x.end != null ? `<span class="r-end ${x.end < 0 ? 'down' : ''}">${signed(x.end)}<small>pts/wk</small></span>` : ''}<span class="chev" aria-hidden="true"></span></button>`;
}
function bestAdd(l) {  // Chief's idea #8: the week's best waiver add, above the trades (phone.py _best_add)
  const b = l.best_add;
  if (b === undefined) return '';  // data from before v3.3 (an app not restarted yet, or the cloud crew on older code)
  if (!b) return sh('Best pickup', 'Riley') + `<div class="allset"><span class="r-ic" aria-hidden="true">+</span><span>No free agent would start for you right now.</span></div>`;
  const marks = sentMarks(), waiting = b.item && b.status === 'pending' && marks[b.item];
  const st = b.status === 'pending' ? 'Riley · needs your OK' : b.status === 'done' ? 'Riley · done' : b.status === 'failed' ? 'Riley · didn’t go through' : 'Riley';
  return sh('Best pickup', st) + `<div class="list">${row({ lv: 'claim', ic: '+', act: 'bestadd', id: l.key, waiting,
    title: `Add ${short(b.add.name)}, drop ${short(b.drop.name)}`, sub: b.why ? b.why[0].toUpperCase() + b.why.slice(1) : (b.waivers ? 'Waiver claim' : 'Free agent'), end: wk(l, b.gain) })}</div>`;
}
function openBestAdd(key) {
  const l = lg(key), b = l && l.best_add;
  if (!b) return;
  if (b.item && D.inbox.some(x => x.id === b.item)) return openIdea(b.item);
  sheet({ title: `Add ${short(b.add.name)}, drop ${short(b.drop.name)}`, who: whoLine('Riley', `${b.waivers ? 'Waiver claim' : 'Free agent'} · ${l.name}`),
    body: swap(l, [b.add], [b.drop], 'Add', 'Drop', 'add', 'drop') +
      `<div class="facts"><span class="fact ok">${signed(wk(l, b.gain))} pts a week</span>${b.fills_empty ? '<span class="fact">fills an empty spot</span>' : ''}</div>` +
      (b.why ? `<p class="hint" style="margin:10px 2px 0">${esc(b.why[0].toUpperCase() + b.why.slice(1))}.</p>` : '') +
      `<p class="hint" style="margin:8px 2px 0">Riley hasn’t asked you about this one yet.</p>`,
    buttons: `<div class="acts" style="flex-direction:column;margin:0"><button class="btn big" data-act="open" data-url="${esc(l.url)}">Open on ${SITE[l.site] || 'the site'} ↗</button></div>` });
}
function todoBlock(l) {
  const all = todos(l), skip = (l.best_add || {}).item;
  // the best pickup already has its own line above, unless it didn't go through (that row says why; code review)
  const list = all.filter(x => !(skip && x.act === 'idea' && x.id === skip && x.lv !== 'urgent'));
  const watch = [];
  D.findings.forEach((f, n) => { if (f.league === l.key && (f.level === 'warn' || f.level === 'tip')) watch.push({ lv: f.level, ic: f.level === 'warn' ? '!' : '↑', act: 'finding', id: n, title: f.title, sub: `${f.bot} · ${LEVEL_WORD[f.level]}` }); });
  const body = list.length ? `<div class="list">${list.map(row).join('')}</div>`
    : `<div class="allset"><span class="r-ic" aria-hidden="true">✓</span><span><b>All set.</b> Nothing needs you in this league right now.</span></div>`;
  return (list.length || !all.length ? sh('To do', list.length ? `${list.length} for you` : '') + body : '') + (watch.length ? fold('watch', 'Keep an eye on', String(watch.length), watch.map(row).join('')) : '');
}
function gmCard() {
  const o = D.office;
  if (!o || !window.FO || !(o.desks || []).length) return '';
  const p = o.plan, m = (o.status || {}).meeting, nx = (o.next || [])[0];
  const sub = m ? `${m.label} going on now` : p ? `${p.label || 'Meeting'} · ${ago(new Date(p.at).getTime())}` : nx ? `First meeting ${FO.when(nx.at)}` : 'Front office';
  return `<button class="gm" data-act="office" aria-label="Open your front office"><span class="gm-ic" aria-hidden="true">🏢</span><span class="gm-main"><small>${esc(sub)}</small>
    <b>${p ? esc(p.headline) : 'Your front office hasn’t met yet'}</b></span><span class="chev" aria-hidden="true"></span></button>`;
}

/* ---------------- Lineup: your starters (tap one), the matchup ---------------- */
function lineupTab(l) {
  const hasMu = l.sport === 'football' && ((l.opp || {}).roster || []).length;
  const seg = hasMu && ui.seg.lineup === 'matchup' ? 'matchup' : 'mine';
  return (hasMu ? segCtl('lineup', [['mine', 'My lineup'], ['matchup', 'Matchup']], seg) : '') + (seg === 'matchup' ? matchupView(l) : lineupView(l)) +
    `<div class="acts"><button class="btn ghost" data-act="open" data-url="${esc(l.url)}">Open on ${SITE[l.site] || 'the site'} ↗</button></div>`;
}
function planLine(l) {
  const p = l.plan || {}, bot = l.sport === 'hockey' ? 'Drew' : 'Casey', n = (p.moves || []).length;
  // v3.4 code pass: a slot that will score 0 goes first even when there are moves too (it was hidden behind "1 lineup move"),
  // and moves the site refused say so instead of looking like they're waiting
  const text = /^⚠️/.test(p.text || '') ? firstSentence(p.text)
    : n ? `${bot} has ${n} lineup move${n === 1 ? '' : 's'}${p.applied ? ' (done)' : p.error ? (p.noanswer ? ' (not confirmed: look at it)' : ' (didn’t go through)') : ''}` : firstSentence(p.text || 'No plan yet.');
  return `<button class="planline" data-act="plan">${ava(bot, 'sm')}<span>${esc(text)}</span><span class="chev" aria-hidden="true"></span></button>`;
}
function checkLine(l) {  // v3.5: the pre-kickoff check (guard.py): silence means "checked and fine", never "didn't look"
  const c = l.checked;
  if (!c || !c.at) return '';
  const z = c.zeros || [], day = l.sport === 'hockey';
  // v3.6: which zeros the waiting lineup moves would fix ("moves") and which stay at 0 anyway (a kicker on his bye), as on the Mac
  const name = xs => xs.map(x => `${x.slot} (${x.who || 'empty'})`).join(', ');
  const fix = z.filter(x => c.pending && x.moves), rest = z.filter(x => !fix.includes(x));
  const old = c.pending && !z.some(x => 'moves' in x);
  const text = !z.length ? (day ? 'every starter who plays today can play' : `all ${c.starters} starters can play`)
    : old ? `${name(z)} will score 0 unless the lineup moves are made`
    : rest.length && fix.length ? `${name(rest)} will score 0; ${name(fix)} will too unless the lineup moves are made`
    : fix.length ? `${name(fix)} will score 0 unless the lineup moves are made` : `${name(rest)} will score 0`;
  return `<div class="checkline ${z.length ? 'bad' : 'ok'}"><span class="ck" aria-hidden="true">${z.length ? '!' : '✓'}</span>` +
    // a lock that has passed isn't "next" (phone review: between runs on a Sunday it read "Next lock 1:00 PM" at 2:30)
    `<span>Checked ${esc(clock(c.at))}: ${esc(text)}${c.lock && c.lock > Date.now() ? `. Next lock ${esc(clock(c.lock))}` : ''}.</span></div>`;
}
function lineupView(l) {
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
  // v3.4: points already scored plus what's still to come, like the scoreboard's "proj" (it used to add up the pre-game
  // projections, so Monday showed "proj 102.3" next to the scoreboard's 81); once every game is over, the points
  const states = r.filter(p => p.starter).map(p => [p, gstate(p, 'football')]);
  const proj = states.reduce((n, [p, s]) => n + (s === 'done' ? p.pts || 0 : s === 'live' ? Math.max(p.proj || 0, p.pts || 0)
    : s === 'bye' ? 0 : p.proj || 0), 0);
  const over = states.length && states.every(([, s]) => s === 'done' || s === 'bye');
  return planLine(l) + checkLine(l) + `<div class="list">${start}</div>` +
    (l.sport === 'football' ? `<div class="total"><span>Starters</span><span>${over ? `${num(proj)} pts` : `proj ${num(proj)}`}</span></div>` : '') +
    (bench.length ? fold('bench', 'Bench', String(bench.length), bench.map(p => playerRow(p, l, 'BN')).join('')) : '') +
    (ir.length ? fold('ir', 'Injured reserve', String(ir.length), ir.map(p => playerRow(p, l, 'IR')).join('')) : '');
}
function whenOf(p, l) {
  const g = p.game;
  if (l.sport === 'hockey' && (p.bye || !p.today) && !(g && g.locked)) return 'No game today';  // hockey lineups are daily
  if (p.bye) return 'Bye week';
  return g ? (g.opp ? (g.opp.startsWith('@') ? g.opp : 'vs ' + g.opp) + ' · ' : '') + gameTime(g, l.sport) : '';
}
function playerRow(p, l, slot) {
  const when = whenOf(p, l);
  const bad = p.starter && (p.hurt >= 2 || (l.sport === 'football' && p.bye));
  const badge = p.badge ? `<span class="badge h${p.hurt}">${esc(p.badge)}</span>` : '';
  const right = p.pts != null ? `${num(p.pts)}<small>${p.proj != null ? 'proj ' + num(p.proj) : 'pts'}</small>`
    : p.bye ? `<i>–</i><small>${l.sport === 'hockey' ? 'off' : 'bye'}</small>`
    : p.proj != null ? `<i>${num(p.proj)}</i><small>proj</small>` : '<i>–</i>';
  return `<button class="pl ${bad ? 'bad' : ''}" data-act="player" data-id="${esc(p.id)}"><span class="slot ${slot === 'BN' || slot === 'IR' ? 'bn' : ''}">${esc(slot)}</span>
    <span class="pl-main"><b>${esc(p.name)}${badge}</b><small>${esc(p.pos)} · ${esc(p.team || 'FA')}${when ? ' · ' + esc(when).replace(/\blive$/, '<span class="live">LIVE</span>') : ''}</small></span>
    <span class="pl-pts">${right}</span></button>`;
}
function matchupView(l) {
  const theirs = (l.opp || {}).roster || [], m = l.matchup || {};
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
  const note = weekPts ? `Still to play: you ${lm.n} (about ${num(lm.pts)} more), them ${lt.n} (about ${num(lt.pts)} more).`
    : `Still to play: you ${lm.n}. For them Yahoo only shows season averages.`;
  return `<div class="list"><div class="mu-score"><span>${num(m.my_pts)}</span><i>vs</i><span>${num(m.opp_pts)}</span></div>
    <div class="mu"><div class="mu-row mu-h"><span>${esc(l.team.name)}</span><span></span><span>${esc(m.opp_name || 'Them')}</span></div>${rows}</div></div>
    <p class="hint">${note}</p>`;
}

/* ---------------- Trades: ideas, the builder, offers ---------------- */
function tradeSeg(l) { return ['ideas', 'build', 'offers'].includes(ui.seg.trades) ? ui.seg.trades : ((l.incoming || []).length ? 'offers' : 'ideas'); }
function tradesTab(l) {
  const inc = (l.incoming || []).length, seg = tradeSeg(l);
  const head = segCtl('trades', [['ideas', 'Ideas'], ['build', 'Build'], ['offers', 'Offers', inc]], seg);
  if (seg === 'offers') return head + offersView(l);
  if (!eng(l.key)) return head + '<p class="empty">Your Mac needs one more check before trades work here.</p>';
  if (seg === 'build') return head + builderShell(l);
  return head + fairBar() + '<div id="sugg"><p class="empty">Finding trades…</p></div>';
}
/* How fair to the other team? (trades.LEVELS; Sam, 2026-11-18: "I should actualy be able to select the level in which it
   is an unfair trade or scaming the other team"). This iPhone's own choice (ui.fair), else the Mac's; it changes the
   ideas found here at once and goes with every front-office ask (a `Fair:` line). The Mac sets the crew's own picks. */
const FAIR = [['fair', 'Fair', 'Fair: it helps both teams (or is about even for them).'],
  ['slight', 'Slight', 'A little in your favor: trades they would still say yes to.'],
  ['unfair', 'Unfair', 'Unfair: clearly in your favor. Some managers would still say yes.'],
  ['scam', 'Scam', 'Scam: very one-sided. Most managers will say no.'],
  ['anything', 'Any', 'Anything goes: whatever helps you most, however bad for them.']];
const fairLevel = () => { const v = ui.fair || (D.auto || {}).fairness; return FAIR.some(f => f[0] === v) ? v : 'slight'; };
function fairBar() {
  const on = fairLevel(), f = FAIR.find(x => x[0] === on);
  return `<div class="fair"><div class="fair-h">How fair to them?</div><div class="fair-r" role="radiogroup" aria-label="How fair to the other team">${FAIR.map(([v, lb], i) =>
    `<button role="radio" aria-checked="${v === on}" class="f${i} ${v === on ? 'on' : ''}" data-act="fair" data-v="${v}">${lb}</button>`).join('')}</div>
    <p class="hint">${esc(f[2])} Nothing is sent until you press Send.</p></div>`;
}
const claudeRank = i => ({ 'do it': 0, accept: 0, maybe: 1 }[((i.claude || {}).call || '').toLowerCase()] ?? (i.claude ? 3 : 2));
const callClass = c => /^(Accept|Worth|Do it)/i.test(c || '') ? 'ok' : /^(Decline|Not|Skip)/i.test(c || '') ? 'bad' : 'warn';
const claudePill = v => v && v.call ? `<span class="pill ${callClass(v.call)}">✦ ${esc(cap(v.call))}</span>` : '';
function tcButton(l, E, d, sub, act = 'load', id = '') {
  const names = ps => (ps || []).map(p => esc(short(p.name))).join(' + ') || '–';
  const data = act === 'load' ? `data-team="${esc(d.team_id)}" data-give="${esc(d.give.map(p => p.id).join(','))}" data-get="${esc(d.get.map(p => p.id).join(','))}"` : `data-id="${esc(id)}"`;
  return `<button class="tc" data-act="${act}" ${data}><span class="tc-g ${(d.my_gain || 0) >= 0 ? 'up' : 'down'}">${signed(wk(l, d.my_gain))}<small>pts/wk</small></span>
    <span class="tc-b"><span class="tc-r"><em>Give</em><span>${names(d.give)}</span></span><span class="tc-r"><em>Get</em><span>${names(d.get)}</span></span><small>${sub}</small></span>
    <span class="chev" aria-hidden="true"></span></button>`;
}
const dealSub = (l, E, d) => `${esc(teamName(E, d.team_id))} · ${pct(d.chance)} yes · ${esc((d.risk || '–').toLowerCase())} risk`;
function dealCard(l, E, d) { return `<div class="tcard">${tcButton(l, E, d, dealSub(l, E, d))}</div>`; }
function crewIdea(l, E, i) {
  const own = OWN[l.key];
  const ok = (i.give || []).every(p => p.id && (own[String(p.id)] || {}).owner === 'me') && (i.get || []).every(p => p.id && own[String(p.id)]);
  const d = { team_id: i.team_id || ((own[String(((i.get || [])[0] || {}).id)] || {}).owner), give: i.give || [], get: i.get || [], my_gain: i.my_gain, their_gain: i.their_gain, chance: i.chance, risk: i.risk };
  if (!ok || !d.team_id) return '';
  const t = sentMarks()[i.id];
  const foot = l.site === 'yahoo' ? '' : t
    ? `<div class="tc-foot"><div class="waiting" style="margin:0;flex:1">⏳ Sent ${esc(ago(t))}, waiting for the crew <button data-act="unmark" data-id="${esc(i.id)}">Show buttons</button></div></div>`
    : `<div class="tc-foot"><button class="btn primary sm" data-act="approve" data-id="${esc(i.id)}">Send it</button><button class="btn ghost sm" data-act="decline" data-id="${esc(i.id)}">Not interested</button></div>`;
  return `<div class="tcard"><div class="tc-who">${ava(i.bot, 'sm')}<span>${i.bot === 'You' ? 'Your idea' : `${esc(i.bot)}’s pick`}</span>${claudePill(i.claude)}</div>
    ${tcButton(l, E, d, dealSub(l, E, d))}${foot}</div>`;
}
const SHOW = 5;
function fillSuggestions() {
  const box = $('#sugg');
  if (!box) return;
  const l = lg(ui.league), E = eng(l.key);
  if (!E) { box.innerHTML = ''; return; }
  const crew = D.inbox.filter(i => i.status === 'pending' && i.kind === 'trade' && i.league === l.key)
    .sort((a, b) => claudeRank(a) - claudeRank(b) || (b.my_gain || 0) - (a.my_gain || 0));
  const sig = i => (i.give || []).map(p => String(p.id)).sort().join(',') + '|' + (i.get || []).map(p => String(p.id)).sort().join(',');
  const seen = new Set(crew.map(sig));
  const lv = fairLevel();
  const found = memo('find|' + l.key + '|' + lv, () => Trade.find(E, 12, lv)).filter(d => !seen.has(Trade.sigOf(d)));
  const all = crew.map(i => crewIdea(l, E, i)).filter(Boolean).concat(found.map(d => dealCard(l, E, d)));
  const n = ui.moreSug ? all.length : Math.min(all.length, SHOW);
  box.innerHTML = all.length
    ? all.slice(0, n).join('') + (all.length > SHOW ? `<button class="btn ghost" style="width:100%" data-act="more-sug">${ui.moreSug ? 'Show fewer' : `Show ${all.length - SHOW} more`}</button>` : '') +
      '<p class="hint">Tap one to put it in the builder and ask the front office about it.</p>'
    : lv === 'anything' ? '<p class="empty">No trade helps your lineup right now. Cooper checks again every run.</p>'
    : '<p class="empty">No trades at this level right now. Pick one further right to see trades that cost the other team more.</p>';
}
function offersView(l) {
  const E = eng(l.key), inc = l.incoming || [], sent = l.sent || [];
  const when = o => o.expires ? (d => `expires ${DAY[d.getDay()]} ${hm(d)}`)(new Date(o.expires)) : o.when ? `goes through ${o.when}` : '';
  const d = o => ({ team_id: o.team_id, give: o.give || [], get: o.get || [], my_gain: o.my_gain, their_gain: o.their_gain, chance: o.chance, risk: o.risk });
  const canLoad = o => E && o.team_id && (o.give || []).every(p => p.id) && (o.get || []).every(p => p.id);
  const incCard = o => {
    const sub = `Them ${signed(wk(l, o.their_gain))}/wk · ${esc(when(o) || 'risk ' + (o.risk || '–').toLowerCase())}`;
    const t = sentMarks()['offer-' + o.id];
    const foot = l.site !== 'espn'
      ? `<div class="tc-foot"><button class="btn primary sm" data-act="open" data-url="${esc(o.url || l.url)}">Answer on ${SITE[l.site] || 'the site'} ↗</button></div>`
      : t ? `<div class="tc-foot"><div class="waiting" style="margin:0;flex:1">⏳ Sent ${esc(ago(t))}, waiting <button data-act="unmark" data-id="${esc('offer-' + o.id)}">Show buttons</button></div></div>`
      : `<div class="tc-foot"><button class="btn primary sm" data-act="accept" data-id="${esc(o.id)}" data-k="${esc(l.key)}">Accept</button><button class="btn ghost sm" data-act="reject" data-id="${esc(o.id)}" data-k="${esc(l.key)}">Decline</button></div>`;
    return `<div class="tcard"><div class="tc-who">${ava('Cooper', 'sm')}<span>From <b>${esc(o.team)}</b></span>${o.call ? `<span class="pill ${callClass(o.call)}">${esc(cap(o.call))}</span>` : ''}</div>
      ${tcButton(l, E || { names: {} }, d(o), sub, 'offer', o.id)}${foot}</div>`;
  };
  const sentCard = o => {
    const barely = o.my_gain < 0.5 * Trade.MIN_GAIN[l.sport];
    const sub = `To ${esc(o.team)} · ${esc(when(o) || 'waiting')}${barely ? ' · barely helps now' : ''}`;
    return `<div class="tcard">${canLoad(o) ? tcButton(l, E, d(o), sub) : tcButton(l, E || { names: {} }, d(o), sub, 'open-site', '')}</div>`;
  };
  if (!inc.length && !sent.length) return `<p class="empty">No offers right now. When someone sends you one, it shows here and your phone buzzes.</p>`;
  return (inc.length ? sh('For you', `${inc.length} waiting`) + inc.map(incCard).join('') : '') +
    (sent.length ? sh('You sent', 'you or Cooper') + sent.map(sentCard).join('') +
      `<button class="btn ghost" style="width:100%" data-act="open" data-url="${esc(l.url)}">Manage them on ${SITE[l.site] || 'the site'} ↗</button>` : '');
}

/* the builder */
function builderShell(l) {
  return `<section class="desk" id="desk"><div class="desk-h"><b>Build a trade</b><button class="linkish" data-act="clear">Clear</button></div>
    <div class="tq"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
      <input id="tq" type="search" enterkeyhint="go" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"
        placeholder="A player, or “Kelce for Jefferson”" aria-label="Type a player or a whole trade"></div>
    <div id="ac"></div><div id="bb"></div></section>`;
}
let picker = null;  // which list is open under the two sides: 'give' | 'get' | 'team'
function renderBuilder() {
  const box = $('#bb');
  if (!box) return;
  const l = lg(ui.league), E = eng(l.key);
  if (!E) { box.innerHTML = '<p class="hint">Your Mac needs one more check before the trade desk works here.</p>'; return; }
  const b = desk(l.key), own = OWN[l.key];
  const tp = (id, side) => {
    const p = own[id].p;
    return `<div class="tp"><div><b>${esc(short(p.name))}${p.badge ? `<span class="badge h${p.hurt}">${esc(p.badge)}</span>` : ''}</b>
      <small>${esc(p.pos)} · ${esc(p.team || 'FA')} · ${num(wk(l, p.value))}</small></div>
      <button class="x" data-act="drop" data-side="${side}" data-id="${esc(id)}" aria-label="Take ${esc(p.name)} out">×</button></div>`;
  };
  const add = (side, label) => `<button class="tp-add ${picker === side || (side === 'get' && picker === 'team') ? 'on' : ''}" data-act="pick" data-side="${side}">${label}</button>`;
  const them = b.team ? teamName(E, b.team) : '';
  let h = `<div class="sides">
    <div class="sidebox"><div class="side-h">You give</div><div class="side-t">${esc(l.team.name)}</div>${b.give.map(id => tp(id, 'give')).join('')}${add('give', '+ Your player')}</div>
    <div class="sidebox"><div class="side-h">You get</div>${them ? `<button class="side-t team-btn" data-act="pick" data-side="team"><span>${esc(them)}</span><i class="dn"></i></button>` : '<div class="side-t muted">Any team</div>'}
      ${b.get.map(id => tp(id, 'get')).join('')}${add('get', b.team ? '+ Their player' : '+ Pick a team')}</div></div>`;
  if (picker) h += pickerList(l, E, b);
  box.innerHTML = h + askBox(l, b) + aiBlock(l, E);
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
    return `<div class="picker"><div class="pk-h">Trade with which team?<button class="linkish" data-act="pick" data-side="">Close</button></div>${rows}</div>`;
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

/* the front office builds and judges the trade (fantasy/aitrade.py; Sam, 2026-11-16: "The trade builder should be 100
   percent ai"). Pick a team, players, write what you want, any mix or nothing at all. This iPhone can't run Claude, so
   Ask opens a one-tap GitHub issue `aitrade <rq>:<league>:<team>:<give ids>:<get ids>` (the words on a "Wish:" line);
   the cloud crew answers on it and uploads the answer in D.ai_trades a few minutes later (answers from the Mac's
   War Room show up too). No lineup-math verdict here anymore: that is the AI's call. */
const more = (k, title, body, extra = '') => `<details class="more" data-k="${k}" ${ui.open[k] ? 'open' : ''}><summary>${title}${extra}</summary><div>${body}</div></details>`;
const AI_CALL = { 'do it': ['ok', 'Do it'], 'close call': ['warn', 'Close call'], "don't": ['bad', 'Don’t'] };
const aiCall = v => AI_CALL[String(v || '').toLowerCase().replace('’', "'")] || ['warn', 'Close call'];
const atMs = a => Date.parse(a.at) || 0;
const upFirst = s => (s = String(s || '')) && s[0].toUpperCase() + s.slice(1);
const aiFind = id => (D.ai_trades || []).find(a => a.id === id);
const aiAnswers = l => (D.ai_trades || []).filter(a => a.league === l.key).sort((a, b) => atMs(b) - atMs(a));
const aiAsked = a => { const s = a.asked || {}; return { team: s.team_id || null, give: (s.give || []).map(String), get: (s.get || []).map(String), wish: s.wish || '' }; };
const aiSig = a => a.give.map(p => String(p.id)).sort().join(',') + '|' + a.get.map(p => String(p.id)).sort().join(',');
const aiKey = (l, a) => 'trade-' + l.key + '-' + aiSig(a) + '-' + a.team_id;
function aiStore() {  // the asks this iPhone sent that have no answer yet: {rq: {league, team, give, get, wish, at}}, 2 hours at most
  const all = readJSON(AI) || {}, got = new Set(((D && D.ai_trades) || []).map(a => a.id)), now = Date.now();
  let changed = false;
  for (const k of Object.keys(all)) if (got.has(k) || !(now - all[k].at < 2 * 3600e3)) { delete all[k]; changed = true; }
  if (changed) writeJSON(AI, all);
  return all;
}
const aiPending = l => Object.entries(aiStore()).filter(([, p]) => p.league === l.key).sort((a, b) => b[1].at - a[1].at);
function askWords(l, E, x) {  // what was asked, in a few words
  const own = OWN[l.key] || {}, nm = id => own[String(id)] ? short(own[String(id)].p.name) : 'a player';
  const g = (x.give || []).map(nm).join(' + '), w = (x.get || []).map(nm).join(' + ');
  const t = x.team && E && E.others[String(x.team)] ? teamName(E, x.team) : '';
  const deal = g && w ? `${g} for ${w}` : g ? `what ${g} could bring back${t ? ' from ' + t : ''}` : w ? `what it takes to get ${w}` : t ? `a trade with ${t}` : '';
  const wish = String(x.wish || '').trim();
  return deal && wish ? `${deal}, “${wish}”` : deal || (wish ? `“${wish}”` : 'your best trade');
}
const askLabel = b => !b.team && !b.give.length && !b.get.length && !String(b.wish || '').trim() ? '✦ Find my best trade' : '✦ Ask the front office';
function askBox(l, b) {
  const eg = l.sport === 'hockey' ? '“I need a goalie”' : '“I need a running back”';
  return `<div class="ask"><label class="sub" for="wish">What do you want? <span class="opt">optional</span></label>
    <textarea id="wish" rows="2" maxlength="300" enterkeyhint="done" placeholder="${esc(eg)} or “sell high on someone”">${esc(b.wish || '')}</textarea>
    ${fairBar()}<button class="btn primary big ask-go" data-act="ask-ai">${askLabel(b)}</button>
    <p class="hint">The front office builds the trade and says if it’s worth it. The answer shows up here in about 5 to 10 minutes.</p></div>`;
}
function aiBlock(l, E) {
  let h = '';
  for (const [rq, p] of aiPending(l)) {
    const long = Date.now() - p.at > 20 * 60e3;
    h += `<div class="ai-wait ${long ? 'long' : ''}"><span class="spin-dot" aria-hidden="true"></span><div class="ai-wait-m"><b>Asked ${esc(ago(p.at))}</b>
      <small>${esc(upFirst(askWords(l, E, p)))}</small><small>${long ? 'Taking long. The answer is also on the GitHub issue.' : 'The front office is on it.'}</small></div>
      <button class="linkish" data-act="ai-forget" data-id="${esc(rq)}">Remove</button></div>`;
  }
  const all = aiAnswers(l), top = all[0] && Date.now() - atMs(all[0]) < 12 * 3600e3 ? all[0] : null;
  if (top) h += aiCard(l, E, top);
  const rest = all.filter(a => a !== top).slice(0, 6);
  if (rest.length) h += `<div class="sub">Earlier answers</div><div class="ai-list">${rest.map(a => aiRow(l, E, a)).join('')}</div>`;
  return h;
}
function aiRow(l, E, a) {
  const [c, w] = a.ok ? aiCall(a.verdict) : ['bad', 'No answer'];
  return `<button class="ai-row" data-act="ai-open" data-id="${esc(a.id)}"><span class="pill ${c}">${esc(w)}</span>
    <span class="ai-row-m"><b>${esc(a.ok ? a.headline : upFirst(askWords(l, E, aiAsked(a))))}</b><small>${esc(ago(atMs(a)))}${a.ok && a.team ? ' · with ' + esc(a.team) : ''}</small></span>
    <span class="chev" aria-hidden="true"></span></button>`;
}
function aiCard(l, E, a, flat) {
  const foot = (link) => `<div class="ai-foot"><span>✦ ${esc(ago(atMs(a)))} · you asked: ${esc(askWords(l, E, aiAsked(a)))}</span>${link}</div>`;
  if (!a.ok) return `<div class="verdict ai ${flat ? 'flat' : ''}"><div class="v-top"><span class="pill big bad">No answer</span></div>
    <p class="v-why">The front office couldn’t answer: ${esc(a.said || 'something went wrong')}</p>
    <div class="acts"><button class="btn big" data-act="ai-again" data-id="${esc(a.id)}">Ask again</button></div>${foot('')}</div>`;
  const [c, w] = aiCall(a.verdict), own = OWN[l.key] || {}, no = c === 'bad';
  const still = a.give.every(p => (own[String(p.id)] || {}).owner === 'me') && a.get.every(p => (own[String(p.id)] || {}).owner === String(a.team_id));
  const names = ps => ps.map(p => esc(short(p.name))).join(' + ') || '–';
  const send = !still ? '<p class="hint">Rosters changed since then, so this one can’t be sent. Tap Change it and ask again.</p>'
    : l.site === 'espn' ? actionRow(aiKey(l, a), `<button class="btn ${no ? 'ghost' : 'primary'} big" data-act="send-ai" data-id="${esc(a.id)}"><span class="ell">${no ? 'Send it anyway to' : 'Send offer to'} ${esc(a.team)}</span></button>`)
    : `<div class="acts"><button class="btn ${no ? 'ghost' : 'primary'} big" data-act="send-ai" data-id="${esc(a.id)}">Propose it on Yahoo ↗</button></div>`;
  return `<div class="verdict ai ${flat ? 'flat' : ''}">
    <div class="v-top"><span class="pill big ${c}">${esc(w)}</span>${a.chance != null ? `<span class="v-chance">${esc(Math.round(a.chance))}% chance of a yes</span>` : ''}</div>
    <p class="v-head">${esc(a.headline)}</p>
    <div class="sheet-swap"><div><small>You give</small>${names(a.give)}</div><div><small>You get</small>${names(a.get)}<em>from ${esc(a.team)}</em></div></div>
    ${a.why ? `<p class="v-why">${esc(a.why)}</p>` : ''}
    ${a.changed && a.what_changed ? `<p class="ai-chg"><b>Changed from what you asked:</b> ${esc(a.what_changed)}</p>` : ''}
    ${a.risk ? more('ai-risk', 'The risk', `<p class="hint" style="margin:0">${esc(a.risk)}</p>`) : ''}
    ${send}${foot(`<button class="linkish" data-act="ai-desk" data-id="${esc(a.id)}">Change it</button>`)}</div>`;
}
function openAI(id) {
  const a = aiFind(id), l = a && lg(a.league);
  if (!l) return;
  sheet({ title: a.ok ? `Trade with ${a.team}` : 'The front office', who: `<div class="who-line"><span>✦ The front office · ${esc(l.name)}</span></div>`, body: aiCard(l, eng(l.key), a, true) });
}
function askAI(x) {  // x: {team, give, get, wish}; all empty is fine: the front office finds the best trade
  const l = lg(ui.league), E = eng(l.key);
  const wish = String(x.wish || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const give = (x.give || []).map(String), get = (x.get || []).map(String), team = x.team ? String(x.team) : '';
  if (aiPending(l).some(([, p]) => String(p.team || '') === team && p.give.join() === give.join() && p.get.join() === get.join() && p.wish === wish))
    return toast('Already asked: the answer is on its way');
  const rq = Array.from(crypto.getRandomValues(new Uint8Array(4)), v => v.toString(16).padStart(2, '0')).join('');
  const words = askWords(l, E, { team, give, get, wish });
  const body = `**Ask the front office** (${l.name})\n\nYou asked: ${words}\n${wish ? `Wish: ${wish}\n` : ''}Fair: ${fairLevel()}\n\n` +
    'Sent from the trade builder in the Claude Fantasy phone app. Your cloud crew asks the front office (one Claude run with web search), ' +
    'answers here with the trade and its verdict, puts it in the phone app and closes this. It only advises: nothing is sent to anyone.';
  sheet({ title: 'Ask the front office', cmd: `aitrade ${rq}:${l.key}:${team}:${give.join(',')}:${get.join(',')}`, markId: 'ai-' + rq, showCmd: false,
    issueBody: body, ai: { rq, league: l.key, team: team || null, give, get, wish },
    body: `<p class="ask-q">${esc(upFirst(words))}</p><p>Tap <b>Send to your crew</b>, then <b>Create</b> on GitHub. The front office builds the trade and says if it’s worth it.
      The answer shows up here in about 5 to 10 minutes. Nothing is sent to anyone.</p>`,
    buttons: '<button class="btn primary big" data-act="send">Send to your crew ↗</button>' });
}
function sendAI(id) {  // the front office's trade, sent the usual way (the crew's `trade` command, or Yahoo's own page)
  const a = aiFind(id), l = a && lg(a.league), E = l && eng(l.key);
  if (!E || !a.ok) return;
  const [c, w] = aiCall(a.verdict);
  const give = a.give.map(p => p.name).join(' + '), get = a.get.map(p => p.name).join(' + ');
  const list = `<div class="sheet-swap"><div><small>You give</small>${esc(give)}</div><div><small>You get</small>${esc(get)}</div></div>`;
  if (l.site !== 'espn') {
    return sheet({ title: `Propose it to ${a.team}`, body: `${list}<p>The crew can’t send Yahoo trades, so this opens Yahoo’s trade page with ${esc(a.team)} picked. Tick the same players and tap Send.</p>`,
      buttons: `<button class="btn primary big" data-act="yahoo" data-url="${esc(E.propose + a.team_id)}">Open Yahoo ↗</button>` });
  }
  const cmd = `trade ${l.key}:${a.team_id}:${a.give.map(p => p.id).join(',')}:${a.get.map(p => p.id).join(',')}`;
  const body = `**Trade offer to ${a.team}** (${l.name})\n\nYou give: ${give}\nYou get: ${get}\n\nThe front office: ${w}. ${a.headline} ${a.why || ''} Chance of a yes: ${a.chance == null ? '–' : Math.round(a.chance) + '%'}.\n\n` +
    'Sent from the trade builder in the Claude Fantasy phone app. Your cloud crew checks that every player is still on the same team, sends the offer on ESPN, answers here and closes this.';
  crewCommand(c === 'bad' ? `Send it anyway to ${a.team}?` : `Send this offer to ${a.team}?`, cmd, aiKey(l, a), 'checks the rosters and sends it on ESPN', {
    body: `${list}<p><span class="pill ${c}">${esc(w)}</span> ${esc(a.headline)}</p>${c === 'bad' ? '<p class="down">The front office said don’t. Send it only if you’re sure.</p>' : ''}
      <p>Tap <b>Send to your crew</b>, then <b>Create</b> on GitHub. Your cloud crew checks every player is still on the same team, sends it on ESPN in about a minute and answers there.</p>`,
    issueBody: body, showCmd: false });
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
    : `<button class="ac-trade ac-wish" data-act="ac-wish"><span><small>Not a player name</small>Ask for “${esc(t)}”</span><b>Use ›</b></button>`;
}
function useAsWish() {  // words typed in the player box that aren't a name: they're what Sam wants
  const l = lg(ui.league), d = desk(l.key), t = (($('#tq') || {}).value || '').trim();
  if (!t) return;
  d.wish = [String(d.wish || '').trim(), t].filter(Boolean).join('. ').slice(0, 300); saveDesk(l.key, d);
  finishTyping();
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
  if ($('#ac')) $('#ac').innerHTML = '';
  picker = null;
  renderBuilder();
}
function useTyped() {
  const l = lg(ui.league), E = eng(l.key), t = ($('#tq') || {}).value || '';
  const parsed = Trade.parse(E, t);
  if (parsed && parsed.length) {
    saveDesk(l.key, { team: null, give: [], get: [], wish: desk(l.key).wish || '' });
    for (const x of parsed) addPlayer(x.hit.p.id, true);
  } else {
    const hit = Trade.search(E, t, 1)[0];
    if (!hit) return useAsWish();
    addPlayer(hit.p.id);
  }
  finishTyping();
}
document.addEventListener('input', e => {
  if (e.target.id === 'tq') renderAC(e.target.value);
  else if (e.target.id === 'wish') {  // what Sam wants, in his words: kept on the desk as he types
    const l = lg(ui.league), d = desk(l.key);
    d.wish = e.target.value; saveDesk(l.key, d);
    const go = $('.ask-go'); if (go) go.textContent = askLabel(d);
  }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'tq' && e.key === 'Enter') { e.preventDefault(); useTyped(); }
  else if (e.target.id === 'wish' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
});
document.addEventListener('focusout', e => { if (['tq', 'wish'].includes(e.target.id) && pendingRender) setTimeout(() => { if (!typing()) render(); }, 300); });
function toBuild(b) {  // put a trade on the desk, ready to ask the front office
  const l = lg(ui.league);
  if (b) saveDesk(l.key, b);
  picker = null;
  closeSheet();
  ui.tab = 'trades'; ui.seg.trades = 'build';
  render('in');
  scrollTo(0, 0);
}

/* ---------------- League: standings, power, scores ---------------- */
function leagueTab(l) {
  const seg = ['standings', 'power', 'scores'].includes(ui.seg.league) ? ui.seg.league : 'standings';
  const head = segCtl('league', [['standings', 'Standings'], ['power', 'Power'], ['scores', 'Scores']], seg);
  return head + ({ standings, power, scores }[seg])(l);
}
function standings(l) {
  const odds = (l.odds || {}).teams || {}, spots = +(l.odds || {}).spots || 0, has = Object.keys(odds).length > 0;
  const rows = (l.standings || []).map((s, i) => {
    const p = (odds[s.id] || {}).playoffs;
    return `${has && spots && i === spots ? '<div class="cut">Playoff line</div>' : ''}<button class="st ${s.mine ? 'mine' : ''}" data-act="team-sheet" data-id="${esc(s.id)}">
      <span class="st-rk">${i + 1}</span><span class="st-nm"><b>${esc(s.name)}${s.mine ? ' <span class="muted">· you</span>' : ''}</b><small>${esc(s.record)} · ${num(s.pf, 0)} pts${s.streak ? ' · ' + esc(s.streak) : ''}</small></span>
      <span class="st-po">${has && p != null ? `<span class="bar2"><i style="width:${Math.round(p * 100)}%"></i></span><b>${pctOdds(p)}</b>` : ''}</span></button>`;
  }).join('');
  return `<div class="list">${rows}</div>${has ? `<p class="hint">Right column: playoff chances, from ${esc(Number(l.odds.sims).toLocaleString('en-US'))} simulated seasons. Top ${esc(spots)} make it.</p>` : ''}`;
}
function power(l) {
  const rows = (l.power || []).map(t => `<div class="st ${t.mine ? 'mine' : ''}"><span class="st-rk">${esc(t.rank)}</span>
    <span class="st-nm"><b>${esc(t.name)}</b><small>${esc(t.record)} · ${num(t.last3, 0)}/wk lately <span class="${t.form > 0.03 ? 'up' : t.form < -0.03 ? 'down' : ''}">${t.form > 0.03 ? '▲ hot' : t.form < -0.03 ? '▼ cold' : ''}</span></small></span>
    <span class="st-po"><span class="bar2"><i style="width:${Math.max(0, Math.min(100, +t.power || 0))}%"></i></span><b>${esc(t.power)}</b></span></div>`).join('');
  return `<div class="list">${rows}</div><p class="hint">Power mixes points scored, recent form and luck (0 to 100).</p>`;
}
function scores(l) {
  const rows = (l.scoreboard || []).map(g => {
    const hw = g.home_pts > g.away_pts, aw = g.away_pts > g.home_pts;
    return `<div class="sc ${g.mine ? 'mine' : ''}"><span class="${hw ? 'w' : ''}">${esc(g.home)}</span><b class="${hw ? 'w' : ''}">${num(g.home_pts)}</b>
      <span class="${aw ? 'w' : ''}">${esc(g.away)}</span><b class="${aw ? 'w' : ''}">${num(g.away_pts)}</b></div>`;
  }).join('');
  return rows ? `<div class="list">${rows}</div><p class="hint">This week so far, Week ${esc(l.week)}.</p>` : '<p class="empty">No scores yet this week.</p>';
}

/* ---------------- sheets: the details, one tap away ---------------- */
let pending = null;
function sheet(o) {  // {title, who, body, buttons, cmd, markId, issueBody, showCmd}
  pending = o;
  const el = $('#sheet');
  el.innerHTML = `<div role="dialog" aria-modal="true" aria-label="${esc(o.title)}"><div class="grab"></div>${o.who || ''}<h3>${esc(o.title)}</h3>${o.body || ''}
    ${o.cmd && o.showCmd !== false ? `<div class="cmd">${esc(o.cmd)}</div>` : ''}<div class="btns">${o.buttons || ''}<button class="btn ghost big" data-act="close">${o.cmd ? 'Cancel' : 'Close'}</button></div></div>`;
  el.hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet() {
  const el = $('#sheet');
  if (!el) return;
  el.hidden = true; el.innerHTML = ''; pending = null;
  if ($('#full').hidden) document.body.classList.remove('noscroll');
}
function actionRow(id, buttons) {
  const t = sentMarks()[id];
  if (t) return `<div class="waiting">⏳ Sent to the crew ${esc(ago(t))}. Waiting for its reply. <button data-act="unmark" data-id="${esc(id)}">Show buttons</button></div>`;
  return `<div class="acts">${buttons}</div>`;
}
function claudeSays(v) {
  if (!v || !v.call) return '';
  return `<p class="cl"><span class="tagc">✦ Claude</span>${claudePill({ call: v.call }).replace('✦ ', '')} ${esc(v.why || '')}${v.risk ? ` <span class="muted">Risk: ${esc(v.risk)}</span>` : ''}</p>`;
}
function chip(p, l) {
  return `<div class="pc"><b>${esc(p.name)}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}</b><span class="sub2">${esc(p.pos)} · ${esc(p.team || 'FA')} · ${num(wk(l, p.value))}/wk</span></div>`;
}
function swap(l, a, b, la = 'You give', lb = 'You get', ca = '', cb = '') {
  const col = (ps, label, c) => `<div class="side"><small class="${c}">${label}</small>${(ps || []).map(p => chip(p, l)).join('')}</div>`;
  return `<div class="swap">${col(a, la, ca)}<div class="arrow">⇄</div>${col(b, lb, cb)}</div>`;
}
const loadBtn = (o, label = 'Ask the front office about it') => o.team_id && (o.give || []).every(p => p.id) && (o.get || []).every(p => p.id)
  ? `<button class="btn big" data-act="load" data-team="${esc(o.team_id)}" data-give="${esc(o.give.map(p => p.id).join(','))}" data-get="${esc(o.get.map(p => p.id).join(','))}">${label}</button>` : '';
function openFinding(n) {
  const f = D.findings[+n];
  if (!f) return;
  const l = lg(f.league) || lg(ui.league);
  const go = { Casey: ['lineup', 'See your lineup'], Drew: ['lineup', 'See your lineup'], Cooper: ['trades', 'See trade ideas'] }[f.bot];
  sheet({ title: f.title, who: whoLine(f.bot, `${levelWord(f)} · ${f.league_name}`), body: f.detail ? `<p>${esc(f.detail)}</p>` : '',
    buttons: (go ? `<button class="btn primary big" data-act="tab" data-tab="${go[0]}" data-seg="${go[0] === 'lineup' ? 'mine' : 'ideas'}">${go[1]}</button>` : '') +
      (l ? `<button class="btn big" data-act="open" data-url="${esc(l.url)}">Open on ${SITE[l.site] || 'the site'} ↗</button>` : '') });
}
function openIdea(id) {
  const i = D.inbox.find(x => x.id === id);
  if (!i) return;
  // a league this update couldn't read: a stand-in, so the sheet still opens (football numbers are already per week;
  // hockey's per-week numbers need the league's schedule, so they show as –)
  const l = lg(i.league) || { key: i.league, site: i.site, sport: i.sport, name: i.league_name, stray: true };
  const yahoo = i.site === 'yahoo';
  if (i.status !== 'pending') return handled(i, l);
  if (i.kind === 'claim') {
    const btns = `<button class="btn primary big" data-act="approve" data-id="${esc(i.id)}">${yahoo ? 'Do it on Yahoo ↗' : 'Yes, do it'}</button><button class="btn big" data-act="decline" data-id="${esc(i.id)}">No thanks</button>`;
    return sheet({ title: i.title, who: whoLine(i.bot, `${i.waivers ? 'Waiver claim' : 'Free agent'} · ${i.league_name}`),
      body: swap(l, [i.add], [i.drop], 'Add', 'Drop', 'add', 'drop') +
        `<div class="facts"><span class="fact ok">${signed(wk(l, i.gain))} pts a week</span>${i.fills_empty ? '<span class="fact">fills an empty spot</span>' : ''}</div>` +
        (i.why ? `<p class="hint" style="margin:10px 2px 0">${esc(cap(i.why[0]) + i.why.slice(1))}.</p>` : '') +
        (i.waits_because ? `<p class="hint" style="margin:8px 2px 0">⏸ Left for you: ${esc(i.waits_because)}.</p>` : '') + claudeSays(i.claude),
      buttons: actionRow(i.id, btns).replace('class="acts"', 'class="acts" style="flex-direction:column;margin:0"') });
  }
  // Fri Nov 27: a Yahoo trade idea had no Not interested button, so the phone couldn't drop it (pickups and ESPN trades could)
  const btns = `<button class="btn primary big" data-act="approve" data-id="${esc(i.id)}">${yahoo ? 'Propose it on Yahoo ↗' : 'Send it'}</button>` +
    `<button class="btn big" data-act="decline" data-id="${esc(i.id)}">Not interested</button>`;
  sheet({ title: `Trade with ${i.team}`, who: whoLine(i.bot, `asks you first · ${i.league_name}`),
    body: swap(l, i.give, i.get) +
      `<div class="facts"><span class="fact ${i.my_gain >= 0 ? 'ok' : 'no'}">You ${signed(wk(l, i.my_gain))}/wk</span><span class="fact">Them ${signed(wk(l, i.their_gain))}/wk</span>
        <span class="fact">${pct(i.chance)} chance of a yes</span><span class="fact">Risk ${esc((i.risk || '–').toLowerCase())}</span></div>` +
      // why it waits for you, as pickups and the Mac already say (phone review)
      (i.waits_because ? `<p class="hint" style="margin:8px 2px 0">⏸ Left for you: ${esc(i.waits_because)}.</p>` : '') + claudeSays(i.claude),
    // not for a league this update couldn't read: the desk would load it into the league you're looking at (code review)
    buttons: actionRow(i.id, btns).replace('class="acts"', 'class="acts" style="flex-direction:column;margin:0"') + (l.stray ? '' : loadBtn(i)) });
}
// an idea the crew already handled: what happened, not Yes / No buttons that would only be refused (phone review)
function handled(i, l) {
  const said = { done: '✓ Done.', approved: '✓ Approved.', sending: 'Being sent now.', failed: `Didn’t go through${i.error ? ': ' + i.error : ''}.`,
    declined: i.error === 'out of date' ? 'Out of date, so nothing was sent.' : 'Declined.' }[i.status] || cap(i.status || '');
  sheet({ title: i.title, who: whoLine(i.bot, i.league_name || ''),
    body: `<p>${esc(said)}</p>` + (i.status === 'failed' ? `<p class="hint" style="margin:8px 2px 0">The crew won’t send it again by itself. Look at your team on ${SITE[i.site] || 'the site'} to see where it stands, and make the move there if you still want it.</p>` : ''),
    buttons: l.url ? `<div class="acts" style="flex-direction:column;margin:0"><button class="btn big" data-act="open" data-url="${esc(l.url)}">Open on ${SITE[i.site] || 'the site'} ↗</button></div>` : '' });
}
function openOffer(id) {
  const l = lg(ui.league), o = l && (l.incoming || []).find(x => String(x.id) === String(id));
  if (!o) return;
  const when = o.expires ? (d => `expires ${DAY[d.getDay()]} ${hm(d)}`)(new Date(o.expires)) : o.when ? `goes through ${o.when} if accepted` : '';
  const btns = l.site === 'espn'
    ? actionRow('offer-' + o.id, `<button class="btn primary big" data-act="accept" data-id="${esc(o.id)}">Accept</button><button class="btn big" data-act="reject" data-id="${esc(o.id)}">Decline</button>`).replace('class="acts"', 'class="acts" style="flex-direction:column;margin:0"')
    : `<button class="btn primary big" data-act="open" data-url="${esc(o.url || l.url)}">Answer on ${SITE[l.site] || 'the site'} ↗</button>`;
  sheet({ title: `Offer from ${o.team}`, who: whoLine('Cooper', when || l.name),
    body: (o.call ? `<p><span class="pill big ${callClass(o.call)}">${esc(cap(o.call))}</span></p>` : '') + swap(l, o.give, o.get) +
      `<div class="facts"><span class="fact ${o.my_gain >= 0 ? 'ok' : 'no'}">You ${signed(wk(l, o.my_gain))}/wk</span><span class="fact">Them ${signed(wk(l, o.their_gain))}/wk</span><span class="fact">Risk ${esc(o.risk || '–')}</span></div>` +
      (o.drop_needed && o.drop_needed.length ? `<p class="hint" style="margin:10px 2px 0">You would need to drop ${esc(o.drop_needed.join(', '))}.</p>` : '') + claudeSays(o.claude),
    buttons: btns + loadBtn(o) });
}
function findPlayer(l, id) {
  id = String(id);
  const mine = (l.roster || []).find(p => String(p.id) === id);
  if (mine) return { p: mine, mine: true };
  const theirs = ((l.opp || {}).roster || []).find(p => String(p.id) === id);
  if (theirs) return { p: theirs, mine: false };
  eng(l.key);
  const x = (OWN[l.key] || {})[id];
  return x ? { p: x.p, mine: x.owner === 'me' } : null;
}
function openPlayer(id) {
  const l = lg(ui.league), f = l && findPlayer(l, id);
  if (!f) return;
  const p = f.p, E = eng(l.key), x = E && OWN[l.key][String(p.id)];
  const where = f.mine ? (p.ir ? 'Injured reserve' : p.starter ? `Starting at ${p.slot}` : 'On your bench') : 'Their team';
  const when = whenOf(p, l);
  const canTrade = x && (x.owner === 'me' || E.others[x.owner]);
  sheet({ title: p.name, who: `<div class="who-line"><span class="slot ${p.starter ? '' : 'bn'}">${esc(p.pos)}</span><span>${esc(p.team || 'FA')} · ${esc(where)}</span></div>`,
    body: `<div class="ptiles"><div><small>This week</small><b>${num(p.pts)}</b></div><div><small>Projected</small><b>${num(p.proj)}</b></div><div><small>Per week</small><b>${num(wk(l, p.value))}</b></div></div>` +
      (when ? `<p>${esc(when === 'live' ? 'Playing right now' : when)}</p>` : '') +
      (p.hurt ? `<p class="down">${esc(p.status || p.badge)}${p.badge && p.status !== p.badge ? ` (${esc(p.badge)})` : ''}</p>` : ''),
    buttons: (canTrade ? `<button class="btn primary big" data-act="trade-player" data-id="${esc(p.id)}">${x.owner === 'me' ? 'What could he bring back?' : 'What would it take to get him?'}</button>` : '') +
      `<button class="btn big" data-act="open" data-url="${esc(l.url)}">Open on ${SITE[l.site] || 'the site'} ↗</button>` });
}
function openPlan() {
  const l = lg(ui.league), p = l.plan || {}, bot = l.sport === 'hockey' ? 'Drew' : 'Casey';
  const on = D.autopilot === 'on';
  let state = '';
  // v3.4 code pass: no answer from the site isn't "didn't go through" (the error itself says it may or may not have)
  if (p.moves && p.moves.length) state = p.applied ? 'Done on the last check.' : p.error ? (p.noanswer ? `${p.error}.` : `Didn’t go through: ${p.error}`) :
    on ? `${bot} makes these moves on his own when they’re worth it.` : 'Autopilot is off: make these moves in the Mac app or on ' + (SITE[l.site] || 'the site') + '.';
  sheet({ title: `${bot}’s lineup plan`, who: whoLine(bot, l.name), body: `<p>${esc(p.text || 'No plan yet.')}</p>` +
    (p.moves && p.moves.length ? `<div class="list">${p.moves.map(m => `<div class="chg"><b>${esc(m.name)}</b><small>${esc(m.from)} → ${esc(m.to)}</small></div>`).join('')}</div><div style="height:12px"></div>` : '') +
    (state ? `<p>${esc(state)}</p>` : '') + (l.ir_text ? `<p>Injured reserve: ${esc(l.ir_text)}</p>` : '') });
}
function openWeek() {
  const l = lg(ui.league), w = l.week_recap || {};
  const rows = ((w.moves || []).length ? w.moves.map(m => `<div class="chg">${esc(m.text)}<small>${esc(clock(m.t))}</small></div>`).join('')
    : '<div class="chg">No moves yet this week.</div>') + (w.more ? `<div class="chg"><small>and ${esc(w.more)} more in your crew’s log</small></div>` : '');
  sheet({ title: w.result ? w.result.split(' · ')[0] : 'This week', who: w.result && w.result.includes(' · ') ? `<div class="who-line"><span>Record ${esc(w.result.split(' · ').slice(1).join(' · '))}</span></div>` : '',
    body: `<div class="sub">The crew’s moves, last 7 days</div><div class="list">${rows}</div>` });
}
function openTeam(id) {
  const l = lg(ui.league), s = (l.standings || []).find(x => String(x.id) === String(id));
  if (!s) return;
  const odds = ((l.odds || {}).teams || {})[String(id)], pw = (l.power || []).find(t => t.name === s.name);
  const E = eng(l.key), canTrade = !s.mine && E && E.others[String(id)];
  sheet({ title: s.name, who: `<div class="who-line"><span>${s.mine ? 'Your team' : esc(l.name)}${s.streak ? ' · streak ' + esc(s.streak) : ''}</span></div>`,
    body: `<div class="ptiles"><div><small>Record</small><b>${esc(s.record)}</b></div><div><small>Playoffs</small><b>${odds ? pctOdds(odds.playoffs) : '–'}</b></div><div><small>Power</small><b>${pw ? esc(pw.power) : '–'}</b></div></div>
      <p>${num(s.pf, 0)} points scored, ${num(s.pa, 0)} against${pw ? `. Last 3 weeks: ${num(pw.last3, 0)} a week` : ''}.</p>`,
    buttons: canTrade ? `<button class="btn primary big" data-act="trade-with" data-id="${esc(id)}">Build a trade with them</button>` : '' });
}
// Fri Nov 27: a trade the crew sent only made an offer, and a waiver claim waits for waivers: "✓ done" read as if the
// trade had gone through (the Mac's Crew room shows the real message, "Trade offer sent to …")
function doneWord(e) {
  return e.kind === 'trade' ? 'offer sent' : /waiver claim placed/i.test(e.message || '') ? 'claim placed' : 'done';
}
function openCrew() {
  const a = D.auto || {};
  const word = { on: 'On', preview: 'Preview only', off: 'Off', auto: 'Automatic', ask: 'Asks you' };
  const health = Object.values(D.health.leagues || {}).map(v => `<div class="health"><span>${esc(v.name)}</span>
    ${v.ok ? '<span class="pill ok">OK</span>' : `<span class="pill bad">${v.auth ? 'Sign in again' : 'Failing'}</span>`}</div>`).join('');
  const auto = (D.auto_log || []).slice(0, 5).map(e => `<div class="chg"><b>${esc(e.title)}</b>
    <small>${e.ok ? `<span class="up">✓ ${doneWord(e)}</span>` : e.noanswer ? '<span class="down">? not confirmed: look at it</span>' : '<span class="down">✕ didn’t go through</span>'} · ${esc(clock(e.time))} · ${esc(e.league || '')}</small></div>`).join('');
  const checked = `${D.ran ? `Checked ${clock(D.ran)} by ${D.where === 'cloud' ? 'the cloud crew' : 'your Mac'}` : 'Not checked yet'}${D.where !== 'cloud' && D.cloud_ran ? ` · cloud crew ${ago(D.cloud_ran)}${cloudLate(D.cloud_ran) ? ' (late)' : ''}` : ''}.`;
  sheet({ title: 'Your crew', who: `<div class="who-line"><span>${esc(checked)}</span></div>`,
    body: `<div class="stat-grid">
      <div class="stat"><small>Lineups</small><b>${esc(word[D.autopilot] || D.autopilot || '–')}</b></div>
      <div class="stat"><small>Trades</small><b>${esc(word[a.trades] || '–')}</b></div>
      <div class="stat"><small>Pickups</small><b>${esc(word[a.claims] || '–')}</b></div>
      <div class="stat"><small>Checks today</small><b>${esc(D.health.runs_today ?? '–')}</b></div></div>
      ${health ? `<div class="sub">Leagues</div><div class="list">${health}</div>` : ''}
      <div class="sub">Notifications</div><div id="pushcard"><p class="hint" style="margin:0">Checking…</p></div>
      ${auto ? `<div class="sub">What the crew did</div><div class="list">${auto}</div>` : ''}
      ${D.recap && D.recap.text ? `<div style="height:8px"></div>${more('recap', 'This week’s recap', `<div class="recap">${md(D.recap.text)}</div>`)}` : ''}
      <div class="sub">This iPhone</div><p class="hint" style="margin:0 2px">${D.brain ? 'Claude is connected. ' : ''}Your answers to the crew’s ideas and to trade offers go to your cloud crew through GitHub (Yahoo moves you finish on Yahoo).</p>`,
    buttons: `<button class="btn big" data-act="open" data-url="${esc(D.channel)}">Open Crew channel ↗</button><button class="btn big" data-act="lock">Lock this iPhone</button>` });
  fillPush();
}
function openOffice() {
  if (!D.office || !window.FO) return;
  const f = $('#full');
  f.innerHTML = `<div class="full-bar"><b>Front office</b><button class="iconbtn" data-act="office-close" aria-label="Close the office">${svg('close')}</button></div><div class="full-body"><div id="fo-root"></div></div>`;
  f.hidden = false;
  document.body.classList.add('noscroll');
  FO.mount($('#fo-root'), { data: D.office, phone: true });
}
function closeOffice() {
  const f = $('#full');
  if (!f || f.hidden) return;
  f.hidden = true; f.innerHTML = '';
  if ($('#sheet').hidden) document.body.classList.remove('noscroll');
}
function runThen(t) {  // test pages and notifications: open a sheet or the office right after the page draws
  const [what, id] = [t.split(':')[0], t.split(':').slice(1).join(':')];
  ({ crew: openCrew, office: openOffice, week: openWeek, plan: openPlan, idea: () => openIdea(id), finding: () => openFinding(id),
    player: () => openPlayer(id), offer: () => openOffer(id), team: () => openTeam(id), ai: () => openAI(id) }[what] || (() => {}))();
}

/* ---------------- sending: one-tap GitHub issues for the cloud crew ---------------- */
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
  if (!$('#pushcard')) return;
  $('#pushcard').innerHTML = `<p class="hint" style="margin:0 2px">${st === 'on' ? '🔔 ' : ''}${words[0]}</p>${words[1] ? `<div class="acts">${words[1]}</div>` : ''}`;
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
  // Fri Nov 27: a long message stays long enough to read (about 65 ms a character, 2.6 to 9 seconds)
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), Math.min(9000, Math.max(2600, String(msg).length * 65)));
}

/* ---------------- taps ---------------- */
document.addEventListener('toggle', e => {  // folded parts of the verdict and the recap remember whether they're open
  const d = e.target;
  if (d.matches && d.matches('details[data-k]')) { ui.open[d.dataset.k] = d.open; saveUI(); }
}, true);
function switchLeague(k) {
  if (!k || k === ui.league) return;
  const keys = D.leagues.map(l => l.key), dir = keys.indexOf(k) - keys.indexOf(ui.league);
  ui.league = k; picker = null;
  render(dir > 0 ? 'slide-l' : 'slide-r');
  scrollTo(0, 0);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) { if (e.target.id === 'sheet') closeSheet(); return; }
  const act = b.dataset.act, id = b.dataset.id;
  const l = D && lg(ui.league);
  if (act === 'league') switchLeague(b.dataset.k);
  else if (act === 'tab') {
    closeSheet();
    const t = b.dataset.tab, again = ui.tab === t && !b.dataset.seg;
    if (b.dataset.seg) ui.seg[t] = b.dataset.seg;
    if (again) { scrollTo({ top: 0, behavior: 'smooth' }); return; }
    ui.tab = t; picker = null; render('in'); scrollTo(0, 0);
  }
  else if (act === 'seg') { ui.seg[b.dataset.g] = b.dataset.v; picker = null; render(); scrollTo(0, 0); }
  else if (act === 'fold') {
    const k = b.dataset.k; ui.open[k] = !ui.open[k]; saveUI();
    b.classList.toggle('open', !!ui.open[k]); b.setAttribute('aria-expanded', !!ui.open[k]);
    if (b.nextElementSibling) b.nextElementSibling.hidden = !ui.open[k];
  }
  else if (act === 'refresh') { toast('Checking…'); refresh(true); }
  else if (act === 'crew') openCrew();
  else if (act === 'office') openOffice();
  else if (act === 'office-close') closeOffice();
  else if (act === 'finding') openFinding(id);
  else if (act === 'idea') openIdea(id);
  else if (act === 'bestadd') openBestAdd(id);
  else if (act === 'offer') openOffer(id);
  else if (act === 'player') openPlayer(id);
  else if (act === 'plan') openPlan();
  else if (act === 'week') openWeek();
  else if (act === 'team-sheet') openTeam(id);
  else if (act === 'trade-with') { const d = desk(l.key); if (String(d.team) !== String(id)) { d.team = String(id); d.get = []; } toBuild(d); picker = 'get'; renderBuilder(); }
  else if (act === 'trade-player') {  // start a fresh trade around this one player
    eng(l.key);
    const x = (OWN[l.key] || {})[String(id)];
    if (x) toBuild(x.owner === 'me' ? { team: null, give: [String(id)], get: [] } : { team: x.owner, give: [], get: [String(id)] });
  }
  else if (act === 'open') openUrl(b.dataset.url);
  else if (act === 'open-site') openUrl(l && l.url);
  else if (act === 'lock') { closeSheet(); writeJSON(KEY, null); writeJSON(LOCKED, ENV && ENV.salt); D = null; showLock('Locked. Type your code to open it again.'); }
  else if (act === 'a2hs-off') { writeJSON(A2HS, true); render(); }
  else if (act === 'push-on') pushOn();
  else if (act === 'push-hide') { writeJSON(PUSH_HIDE, true); render(); }
  else if (act === 'open-issue') { openUrl(b.dataset.url); closeSheet(); }
  else if (act === 'push-test') crewCommand('Send a test notification', 'notifications test', 'push-test', 'sends a test buzz');
  else if (act === 'push-off') {
    try { const s = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch (err) { /* already off */ }
    toast('Off for this iPhone. Your crew stops buzzing it.'); fillPush();
  }
  else if (act === 'unmark') {
    const m = sentMarks(); delete m[id]; writeJSON(SENT, m); const inSheet = !!b.closest('#sheet'); closeSheet(); render();
    // Fri Nov 27 (phone review): "Show buttons" closed the sheet it was in, so you had to find the row and open it again
    if (inSheet) id.startsWith('offer-') ? openOffer(id.slice(6)) : openIdea(id);
  }
  // the trade builder
  else if (act === 'pick') { picker = picker === b.dataset.side || !b.dataset.side ? null : b.dataset.side; renderBuilder(); }
  else if (act === 'team') { const d = desk(l.key); if (String(d.team) !== id) { d.team = id; d.get = []; } saveDesk(l.key, d); picker = 'get'; renderBuilder(); }
  else if (act === 'toggle') {
    const d = desk(l.key), side = b.dataset.side, list = side === 'give' ? d.give : d.get;
    if (list.includes(id)) list.splice(list.indexOf(id), 1); else if (list.length < 4) list.push(id); else toast('Four players a side at most');
    saveDesk(l.key, d); renderBuilder();
  }
  else if (act === 'drop') { const d = desk(l.key), list = b.dataset.side === 'give' ? d.give : d.get, n = list.indexOf(id); if (n >= 0) list.splice(n, 1); saveDesk(l.key, d); renderBuilder(); }  // (not there: splice(-1) dropped the last player)
  else if (act === 'clear') { saveDesk(l.key, { team: null, give: [], get: [], wish: '' }); picker = null; const i = $('#tq'); if (i) i.value = ''; if ($('#ac')) $('#ac').innerHTML = ''; renderBuilder(); }
  else if (act === 'ac-add') { addPlayer(id); finishTyping(); }
  else if (act === 'ac-parse') useTyped();
  else if (act === 'ac-wish') useAsWish();
  else if (act === 'load') toBuild({ team: b.dataset.team, give: (b.dataset.give || '').split(',').filter(Boolean), get: (b.dataset.get || '').split(',').filter(Boolean) });
  else if (act === 'ask-ai') { const d = desk(l.key), w = $('#wish'); if (w) d.wish = w.value; saveDesk(l.key, d); askAI(d); }
  else if (act === 'ai-forget') { const all = aiStore(); delete all[id]; writeJSON(AI, all); renderBuilder(); }
  else if (act === 'ai-open') openAI(id);
  else if (act === 'send-ai') sendAI(id);
  else if (act === 'ai-desk' || act === 'ai-again') {  // the answer's trade back on the desk to change it, or the same ask once more
    const a = aiFind(id);
    if (!a) return;
    const s = aiAsked(a);
    toBuild(act === 'ai-desk' && a.ok ? { team: String(a.team_id), give: a.give.map(p => String(p.id)), get: a.get.map(p => String(p.id)), wish: s.wish } : s);
    if (act === 'ai-again') askAI(desk(l.key));
    else toast('On the desk: change it and ask again');
  }
  else if (act === 'more-sug') { ui.moreSug = !ui.moreSug; saveUI(); fillSuggestions(); }
  else if (act === 'fair') { ui.fair = b.dataset.v; saveUI(); const fb = $('.fair'); if (fb) fb.outerHTML = fairBar(); fillSuggestions(); }
  // the crew's ideas and offers sent to you
  else if (act === 'approve' || act === 'decline') {
    const i = D.inbox.find(x => x.id === id);
    if (!i) return;
    if (act === 'approve' && i.site === 'yahoo' && !i.open_url) {  // a league this update couldn't read has no link (code review)
      closeSheet(); toast('Open Yahoo and make this move there yourself: this league wasn’t read in this update, so there’s no link.');
    } else if (act === 'approve' && i.site === 'yahoo') {
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
  else if (act === 'copy' && pending && pending.cmd) {
    const ok = await copy(pending.cmd);
    toast(ok ? 'Copied: ' + pending.cmd : 'Couldn’t copy: press and hold the command to copy it');
    if (ok) {
      b.textContent = 'Copied ✓';
      if (!$('#sheet [data-act="go"]')) b.insertAdjacentHTML('afterend', '<button class="btn primary big" data-act="go">Open Crew channel ↗ (paste it there)</button>');
    }
  } else if ((act === 'go' || act === 'send') && pending && pending.cmd) {
    const m = sentMarks(); m[pending.markId] = Date.now(); writeJSON(SENT, m);
    if (pending.ai) { const all = aiStore(); all[pending.ai.rq] = Object.assign({}, pending.ai, { at: Date.now() }); writeJSON(AI, all); }
    openUrl(act === 'send' ? issueUrl(pending.cmd, pending.issueBody) : D.channel); closeSheet(); render();
  } else if (act === 'close') closeSheet();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#sheet').hidden) closeSheet(); else closeOffice(); } });

/* ---------------- gestures ---------------- */
// pull down at the top to check for news
(() => {
  let y0 = null, dy = 0;
  const ptr = $('#ptr');
  addEventListener('touchstart', e => { y0 = (scrollY <= 0 && D && !$('#app').hidden && $('#sheet').hidden && $('#full').hidden && !e.target.closest('input,textarea,.picker')) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
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
// swipe sideways on the page to change league
(() => {
  let x0 = null, y0 = 0, t0 = 0;
  const view = $('#view');
  view.addEventListener('touchstart', e => {
    const t = e.target;
    x0 = D && D.leagues.length > 1 && !t.closest('input,.picker,.hs,.mu,.desk') ? e.touches[0].clientX : null;
    y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  view.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || Date.now() - t0 > 600) return;
    const keys = D.leagues.map(l => l.key), i = keys.indexOf(ui.league), next = keys[i + (dx < 0 ? 1 : -1)];
    if (next) switchLeague(next);
  }, { passive: true });
})();
// drag a sheet down to close it
(() => {
  let y0 = null, dy = 0, box = null;
  const el = $('#sheet');
  el.addEventListener('touchstart', e => {
    box = el.firstElementChild;
    y0 = box && (e.target.closest('.grab') || box.scrollTop <= 0) && !e.target.closest('input,textarea,.hs') ? e.touches[0].clientY : null; dy = 0;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (y0 == null || !box) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0 && box.scrollTop <= 0) { box.style.transition = 'none'; box.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (y0 == null || !box) return;
    box.style.transition = '';
    if (dy > 90) closeSheet(); else box.style.transform = '';
    y0 = null;
  });
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
start();
