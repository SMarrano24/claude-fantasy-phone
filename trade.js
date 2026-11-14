/* The trade desk's math: a line-for-line copy of fantasy/trades.py (Cooper's trade finder, the analyzer and the
   builder), so a trade typed on the phone gets exactly the verdict the Mac would give it. tests/trade_engine_test.py
   runs both on the same leagues and checks they agree.

   How a trade is judged: both teams' best possible starting lineups are worked out from player values (points per
   game, rest of season), before and after the trade. The free agents anyone could pick up count too, so a trade only
   "gains" what you couldn't get for free on waivers. Injured players count for less (Out 60%, IR 30%, Questionable 95%).

   On top of trades.py: which players move in and out of each starting lineup (the "why" behind the number), and
   Riley's playoff simulation (fantasy/odds.py) played out again with the trade's points added. */
'use strict';
const Trade = (() => {
  const FILL = { football: ['QB', 'K', 'D/ST', 'TE', 'RB', 'WR', 'FLEX', 'OP'], hockey: ['G', 'D', 'C', 'LW', 'RW', 'F', 'UTIL'] };
  const MIN_GAIN = { football: 1.2, hockey: 0.4 };
  const STREAM = new Set(['K', 'D/ST', 'DEF']);
  const THEIR_FLOOR = { football: -0.8, hockey: -0.15 };
  const GOALIE_SHARE = 0.7;  // a goalie's value is points per start, and a No. 1 goalie starts about 7 games in 10
  const STAR_GAP = 0.08;     // a player within 8% of another is "about as good"

  /* the phone's compact players (fantasy/phone.py _tp) in the shape trades.py reads */
  function player(p) {
    return { id: p.id, name: p.name, pos: p.pos, team: p.team, eligible: p.el || [], value: p.v || 0, status: p.st || '',
      hurt: p.hurt || 0, on_ir: !!p.ir, starter: !!p.s, slot: p.slot || '', avg: p.avg, proj_avg: p.pa,
      status_words: p.sw || '', badge: p.badge || '', bye_week: p.bye };
  }
  function league(l) {  // the snapshot's league + its trade block → the `lg` trades.py works on
    const t = l.trade || {};
    const others = {};
    for (const [k, v] of Object.entries(t.others || {})) others[k] = v.map(player);
    return { key: l.key, site: l.site, sport: l.sport, slots: l.slots || {}, roster: (t.roster || []).map(player), others,
      names: t.names || {}, records: t.records || {}, intel: { teams: Object.entries(t.scout || {}).map(([id, s]) => ({ id, ...s })) },
      fa_pool: (t.pool || []).map(p => ({ ...player(p), fa: true })), me: t.me, weeks_left: t.weeks_left, factor: t.factor || 1,
      sim: t.sim, propose: t.propose || '', can_send: !!t.can_send, week: l.week };
  }

  function v(p) {
    let x = p.value || 0;
    if (p.pos === 'G') x = x * GOALIE_SHARE;
    if (p.status === 'INJURY_RESERVE' || p.on_ir) return x * 0.3;
    if (p.hurt === 2) return x * 0.6;
    if (p.hurt === 1) return x * 0.95;
    return x;
  }
  const byValue = list => list.map((p, i) => [p, i]).sort((a, b) => v(b[0]) - v(a[0]) || a[1] - b[1]).map(x => x[0]);  // Python's stable sort, best first
  const byValueUp = (list, key) => list.map((p, i) => [p, i]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(x => x[0]);

  /* best starting lineup (greedy, most restrictive slots first): {total, picks: [{slot, p}]} */
  function bestLineup(players, slots, sport, pool = []) {
    const left = byValue(players.concat(pool));
    const used = new Set(), picks = [];
    let total = 0;
    const order = FILL[sport].filter(s => s in slots).concat(Object.keys(slots).filter(s => !FILL[sport].includes(s)));
    for (const slot of order) {
      for (let n = 0; n < (slots[slot] || 0); n++) {
        const p = left.find(q => !used.has(q.id) && q.eligible.includes(slot));
        if (p) { used.add(p.id); total += v(p); picks.push({ slot, p }); }
      }
    }
    return { total, picks };
  }
  const lineupValue = (players, slots, sport, pool) => bestLineup(players, slots, sport, pool).total;

  function pyRound2(x) {  // Python's round(x, 2): from the float's exact value (toFixed does that), true halves to even
    if (Number.isInteger(x * 8) && Math.abs(x * 8) % 2 === 1) {  // only k/8 (k odd) sits exactly halfway
      const lo = Math.floor(x * 100);
      return (lo % 2 === 0 ? lo : lo + 1) / 100;
    }
    return +x.toFixed(2);
  }
  const g = x => String(parseFloat((+x).toPrecision(6)));  // Python's f"{x:g}"

  function teamsOf(lg) {
    const teams = { me: lg.roster };
    for (const [k, r] of Object.entries(lg.others || {})) teams[String(k)] = r;
    const where = {};
    for (const [tid, roster] of Object.entries(teams)) for (const p of roster) where[String(p.id)] = tid;
    return [teams, where];
  }
  const intelOf = lg => Object.fromEntries(((lg.intel || {}).teams || []).map(t => [String(t.id), t]));

  function research(idea, scout, sport) {
    const tg = idea.their_gain;
    const fair = tg >= 0.3 ? 'Fair: it helps both teams' : tg >= -0.2 ? 'About even for them' : 'Slightly in your favor';
    const activity = scout ? (scout.trades || 0) + (scout.adds || 0) / 4 : 0;
    const form = (scout || {}).form || 0;
    let chance = 0.35 + (tg >= 0.3 ? 0.25 : tg >= -0.2 ? 0.1 : -0.05) + Math.min(activity, 4) * 0.05 + (form < -0.08 ? 0.05 : 0);
    chance = Math.max(0.05, Math.min(chance, 0.85));
    const risks = [];
    for (const p of idea.get) if (p.hurt === 1) risks.push(`${p.name} is listed ${(p.status_words || 'questionable').toLowerCase()}`);
    for (const p of idea.get.concat(idea.give)) {
      if (p.avg && p.proj_avg && Math.abs(p.avg - p.proj_avg) / Math.max(p.proj_avg, 1) > 0.35)
        risks.push(`${p.name}'s results so far are far from his projection, so his value is less certain`);
    }
    const risk = risks.length >= 2 ? 'High' : risks.length ? 'Medium' : 'Low';
    const why = [];
    if (scout) {
      why.push(`${idea.team} is ${scout.record} (${g(scout.last3)} a week lately)`);
      if (scout.trades) why.push(`they've made ${scout.trades} trade${scout.trades !== 1 ? 's' : ''}`);
      else if (scout.adds) why.push(`they've made ${scout.adds} moves`);
    }
    return { fair, chance: pyRound2(chance), risk, risks: risks.slice(0, 3), scouting: why.join('; ') };
  }

  /* would you hand over the best player in the deal? (trades.star) */
  function star(give, get, roster) {
    if (!give.length || !get.length) return null;
    const bg = maxBy(give, v), bt = maxBy(get, v);
    const vg = v(bg), vt = v(bt);
    if (vg <= 0 || vt >= vg * (1 - STAR_GAP)) return null;
    const rank = 1 + roster.filter(p => v(p) > vg).length;
    const depth = get.length > give.length && vt < vg * 0.85;
    return { level: rank <= 2 || depth ? 'block' : 'warn', player: bg.name, best_back: bt.name, rank };
  }
  const blocked = d => (d.star || {}).level === 'block';

  function verdict(idea, sport, incoming = false) {
    const step = MIN_GAIN[sport], mg = idea.my_gain, tg = idea.their_gain;
    const words = incoming ? ['Accept', 'Counter', 'Decline'] : ['Worth sending', 'Close call', 'Not worth it'];
    let call, why;
    if (mg >= step && idea.risk !== 'High') {
      call = words[0];
      why = `Your starting lineup gets ${g(mg)} points a week better.`;
      if (!incoming && tg < THEIR_FLOOR[sport]) { call = words[1]; why += ` But it costs them ${g(Math.abs(tg))} a week, so they'll probably say no.`; }
    } else if (mg >= -step / 2) {
      call = words[1];
      why = incoming ? "It's close to even for you; ask for a little more." : 'It barely changes your lineup.';
    } else {
      call = words[2];
      why = `Your starting lineup gets ${g(Math.abs(mg))} points a week worse.`;
    }
    const s = idea.star;
    if (s) {
      const who = s.rank === 1 ? 'your best player' : s.rank === 2 ? 'one of your two best players' : 'the best player in this deal';
      if (s.level === 'block') {
        call = words[2];
        why = `You'd give up ${s.player}, ${who}, and nobody as good comes back (the best is ${s.best_back}). ` +
          "The lineup number can't see that: the side that gets the best player usually wins the trade.";
      } else if (call === words[0]) {
        call = words[1];
        why += ` But you'd give up ${s.player}, the best player in this deal (the best you'd get back is ${s.best_back}), so ask for more.`;
      }
    }
    if (idea.risk === 'High') why += ' The risk is high: ' + (idea.risks || []).join('; ') + '.';
    return { call, call_why: why };
  }

  /* any trade: you give giveIds to teamId and get getIds */
  function evaluate(lg, teamId, giveIds, getIds, incoming = false) {
    const sport = lg.sport, slots = lg.slots;
    const [teams] = teamsOf(lg);
    const theirs = teams[String(teamId)] || [];
    const gi = new Set(giveIds.map(String)), ge = new Set(getIds.map(String));
    const give = lg.roster.filter(p => gi.has(String(p.id)));
    const get = theirs.filter(p => ge.has(String(p.id)));
    const afterMe = lg.roster.filter(p => !gi.has(String(p.id))).concat(get);
    const afterThem = theirs.filter(p => !ge.has(String(p.id))).concat(give);
    const pool = lg.fa_pool || [];
    const myGain = lineupValue(afterMe, slots, sport, pool) - lineupValue(lg.roster, slots, sport, pool);
    const theirGain = lineupValue(afterThem, slots, sport, pool) - lineupValue(theirs, slots, sport, pool);
    const idea = { team_id: String(teamId), team: (lg.names || {})[String(teamId)] || `Team ${teamId}`, give, get,
      my_gain: pyRound2(myGain), their_gain: pyRound2(theirGain), score: myGain + 0.4 * theirGain };
    Object.assign(idea, research(idea, intelOf(lg)[String(teamId)], sport));
    const change = get.length - give.length;
    if (change > 0) {
      const bench = byValueUp(lg.roster.filter(p => !p.starter && !p.on_ir && !gi.has(String(p.id))), p => p.value || 0);
      idea.drop_needed = bench.slice(0, change).map(p => p.name);
    }
    idea.star = star(give, get, lg.roster);
    Object.assign(idea, verdict(idea, sport, incoming));
    return idea;
  }

  function* combos(list, nMax = 2) {
    for (let i = 0; i < list.length; i++) yield [list[i]];
    if (nMax < 2) return;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) yield [list[i], list[j]];
  }
  const ids = ps => ps.map(p => p.id);
  const sigOf = d => d.give.map(p => String(p.id)).sort().join(',') + '|' + d.get.map(p => String(p.id)).sort().join(',');
  function distinct(deals, limit) {
    const out = [], seen = new Set();
    for (const d of deals) {
      const k = sigOf(d);
      if (seen.has(k)) continue;
      seen.add(k); out.push(d);
      if (out.length >= limit) break;
    }
    return out;
  }
  const sortBy = (list, key) => list.map((x, i) => [x, i]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(x => x[0]);
  function maxBy(list, key) {  // Python's max(..., key=...): the first of the best; key may return [a, b] to compare in order
    let best = null, bk = null;
    const gt = (a, b) => Array.isArray(a) ? (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) : a > b;
    for (const x of list) { const k = key(x); if (best === null || gt(k, bk)) { best = x; bk = k; } }
    return best;
  }

  /* Cooper's trade finder: the best 1-for-1 and 2-for-1 ideas across the league (trades.find, without Claude) */
  function find(lg, limit = 10) {
    const sport = lg.sport, slots = lg.slots, mine = lg.roster, others = lg.others || {};
    const names = lg.names || {}, intel = intelOf(lg), pool = lg.fa_pool || [];
    const myBase = lineupValue(mine, slots, sport, pool);
    const myOffer = byValue(mine.filter(p => !p.on_ir)).slice(0, 12);
    const gives = myOffer.map(p => [p]);
    const rest = myOffer.slice(3);
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) gives.push([rest[i], rest[j]]);
    const ideas = [];
    for (const [tid, theirs] of Object.entries(others)) {
      const theirBase = lineupValue(theirs, slots, sport, pool);
      const targets = byValue(theirs.filter(p => !p.on_ir && (p.hurt || 0) < 2 && !STREAM.has(p.pos))).slice(0, 10);
      for (const get of targets) {
        for (const give of gives) {
          const giveIds = new Set(give.map(p => p.id));
          const afterMe = mine.filter(p => !giveIds.has(p.id)).concat([get]);
          const afterThem = theirs.filter(p => p.id !== get.id).concat(give);
          const myGain = lineupValue(afterMe, slots, sport, pool) - myBase;
          const theirGain = lineupValue(afterThem, slots, sport, pool) - theirBase;
          if (myGain < MIN_GAIN[sport] || theirGain < THEIR_FLOOR[sport]) continue;
          if (star(give, [get], mine)) continue;  // Cooper never suggests giving up the best player in the deal
          ideas.push({ team_id: tid, team: names[String(tid)] || `Team ${tid}`, give: give.slice(), get: [get],
            my_gain: pyRound2(myGain), their_gain: pyRound2(theirGain), score: myGain + 0.4 * theirGain });
        }
      }
    }
    const sorted = sortBy(ideas, x => -x.score);
    const out = [], perTeam = {}, used = new Set();
    for (const i of sorted) {
      const key = i.get[0].id;
      if ((perTeam[i.team_id] || 0) >= 2 || used.has(key)) continue;
      perTeam[i.team_id] = (perTeam[i.team_id] || 0) + 1;
      used.add(key);
      Object.assign(i, research(i, intel[String(i.team_id)], sport));
      out.push(i);
      if (out.length >= limit) break;
    }
    return out;
  }

  function deals(lg, tid, givesPool, getsPool, keep) {
    const out = [];
    for (const give of combos(givesPool)) for (const get of combos(getsPool)) {
      if (give.length === 2 && get.length === 2) continue;
      const d = evaluate(lg, tid, ids(give), ids(get));
      if (keep(d)) out.push(d);
    }
    return out;
  }

  /* the best trades with one team, both sides better off (or close) */
  function withTeam(lg, tid, limit = 6) {
    const sport = lg.sport;
    const [teams] = teamsOf(lg);
    const theirs = teams[String(tid)] || [];
    const mine = byValue(lg.roster.filter(p => !p.on_ir)).slice(0, 10);
    const targets = byValue(theirs.filter(p => !p.on_ir && (p.hurt || 0) < 2)).slice(0, 8);
    const ds = deals(lg, tid, mine, targets, d => d.my_gain >= MIN_GAIN[sport] / 2 && d.their_gain >= THEIR_FLOOR[sport] && !blocked(d));
    return distinct(sortBy(ds, d => -d.score), limit);
  }

  /* deals built around one player: yours (sell him) or theirs (get him) */
  function forPlayer(lg, playerId) {
    const sport = lg.sport;
    const [teams, where] = teamsOf(lg);
    const pid = String(playerId), owner = where[pid];
    if (owner == null) return { error: "That player isn't on a team in this league." };
    const found = [], tried = [];
    let subject;
    if (owner === 'me') {
      const meP = lg.roster.find(p => String(p.id) === pid);
      const bench = byValueUp(lg.roster.filter(p => !p.on_ir && String(p.id) !== pid), v).slice(0, 4);
      for (const [tid, theirs] of Object.entries(teams)) {
        if (tid === 'me') continue;
        const targets = byValue(theirs.filter(p => !p.on_ir && (p.hurt || 0) < 2)).slice(0, 8);
        for (const give of [[meP]].concat(bench.map(b => [meP, b]))) {
          for (const get of combos(targets)) {
            if (give.length === 2 && get.length === 2) continue;
            const d = evaluate(lg, tid, ids(give), ids(get));
            tried.push(d);
            if (d.their_gain >= THEIR_FLOOR[sport] && d.my_gain >= -MIN_GAIN[sport] && !blocked(d)) found.push(d);
          }
        }
      }
      subject = meP;
    } else {
      const theirs = teams[owner];
      const target = theirs.find(p => String(p.id) === pid);
      const extras = byValueUp(theirs.filter(p => !p.on_ir && String(p.id) !== pid), v).slice(0, 4);
      const mine = byValue(lg.roster.filter(p => !p.on_ir)).slice(0, 10);
      for (const give of combos(mine)) {
        for (const get of [[target]].concat(give.length === 2 ? extras.map(e => [target, e]) : [])) {
          const d = evaluate(lg, owner, ids(give), ids(get));
          tried.push(d);
          if (d.their_gain >= THEIR_FLOOR[sport] && d.my_gain >= -MIN_GAIN[sport] / 2 && !blocked(d)) found.push(d);
        }
      }
      subject = target;
    }
    if (!found.length) {
      const closest = maxBy(tried, d => Math.min(d.my_gain, d.their_gain));
      let why = '';
      if (closest) why = closest.their_gain < 0 ? ` The closest one costs them ${g(Math.abs(closest.their_gain))} a week, so they'd probably say no.`
        : ` The closest one costs you ${g(Math.abs(closest.my_gain))} a week.`;
      return { player: subject.name, owner, options: closest ? [{ label: 'Closest deal', deal: closest }] : [], compromises: [],
        note: 'No deal is clearly good for both teams right now.' + why };
    }
    const pick = [
      ['Fair deal', maxBy(found, d => Math.min(d.my_gain, d.their_gain) + 0.1 * (d.my_gain + d.their_gain))],
      ['Best for you', maxBy(found.filter(d => d.their_gain >= -0.2 * MIN_GAIN[sport] * 2), d => d.my_gain)],
      ['Easiest yes', maxBy(found.filter(d => d.my_gain >= 0), d => [d.their_gain, d.my_gain])],
    ];
    const options = [];
    for (const [label, d] of pick) if (d && !options.some(o => o.deal === d)) options.push({ label, deal: d });
    const shown = options.map(o => o.deal);
    const more = distinct(sortBy(found.filter(d => !shown.includes(d)), d => -Math.min(d.my_gain, d.their_gain)), 4);
    return { player: subject.name, owner, options, compromises: more };
  }

  /* small tweaks that make a deal fair */
  function compromises(lg, deal) {
    const sport = lg.sport;
    const [teams] = teamsOf(lg);
    const theirs = teams[String(deal.team_id)] || [];
    const giveIds = ids(deal.give), getIds = ids(deal.get);
    const tweaks = [];
    if (deal.their_gain < 0) {
      for (const p of byValueUp(lg.roster.filter(p => !p.on_ir && !giveIds.includes(p.id)), v).slice(0, 6)) {
        const d = evaluate(lg, deal.team_id, giveIds.concat([p.id]), getIds);
        if (d.their_gain >= 0 && d.my_gain >= 0) tweaks.push({ label: `Add ${p.name} to sweeten it`, deal: d, add: p.id, side: 'give' });
      }
    }
    if (deal.my_gain < MIN_GAIN[sport]) {
      for (const p of byValueUp(theirs.filter(p => !p.on_ir && !getIds.includes(p.id)), v).slice(0, 6)) {
        const d = evaluate(lg, deal.team_id, giveIds, getIds.concat([p.id]));
        if (d.my_gain > deal.my_gain && d.their_gain >= THEIR_FLOOR[sport]) tweaks.push({ label: `Also ask for ${p.name}`, deal: d, add: p.id, side: 'get' });
      }
    }
    return sortBy(tweaks, t => -Math.min(t.deal.my_gain, t.deal.their_gain)).slice(0, 3);
  }

  /* ---------- beyond trades.py: the "why" and the playoff picture ---------- */

  /* who moves in and out of a starting lineup: [{p, slot, how: 'in' | 'out' | 'fa'}] */
  function lineupChange(before, after, slots, sport, pool) {
    const a = bestLineup(before, slots, sport, pool).picks, b = bestLineup(after, slots, sport, pool).picks;
    const was = new Map(a.map(x => [x.p.id, x])), now = new Map(b.map(x => [x.p.id, x]));
    const out = [];
    for (const x of b) if (!was.has(x.p.id)) out.push({ p: x.p, slot: x.slot, how: x.p.fa ? 'fa' : 'in' });
    for (const x of a) if (!now.has(x.p.id)) out.push({ p: x.p, slot: x.slot, how: 'out' });
    return out;
  }
  function explain(lg, deal) {
    const [teams] = teamsOf(lg);
    const theirs = teams[String(deal.team_id)] || [];
    const gi = new Set(ids(deal.give).map(String)), ge = new Set(ids(deal.get).map(String));
    const pool = lg.fa_pool || [];
    return {
      me: lineupChange(lg.roster, lg.roster.filter(p => !gi.has(String(p.id))).concat(deal.get), lg.slots, lg.sport, pool),
      them: lineupChange(theirs, theirs.filter(p => !ge.has(String(p.id))).concat(deal.give), lg.slots, lg.sport, pool),
    };
  }

  /* Riley's season simulation (fantasy/odds.py) with each team's weekly points moved by `add` ({team id: points a
     week}) from next week on. Same random numbers with and without the trade, so the difference is the trade's. */
  function rng(seed) {
    let s = seed >>> 0, spare = null;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return (mu, sd) => {
      if (spare !== null) { const z = spare; spare = null; return mu + sd * z; }
      let x, y, r;
      do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (r === 0 || r >= 1);
      const f = Math.sqrt(-2 * Math.log(r) / r);
      spare = y * f;
      return mu + sd * x * f;
    };
  }
  function playoffs(sim, week, add = {}, sims = 4000) {
    if (!sim) return null;
    const gauss = rng(20261103);
    const teams = Object.keys(sim.start), made = Object.fromEntries(teams.map(t => [t, 0]));
    for (let n = 0; n < sims; n++) {
      const w = {}, pf = {}, nudge = {};
      for (const t of teams) { w[t] = sim.start[t][0]; pf[t] = sim.start[t][1]; nudge[t] = gauss(0, sim.doubt[t] || 0); }
      for (const [a, b, pa, pb] of sim.fixed) {
        pf[a] += pa; pf[b] += pb;
        if (pa === pb) { w[a] += 0.5; w[b] += 0.5; } else w[pa > pb ? a : b] += 1;
      }
      for (const [wk, a, b, ma0, sa, mb0, sb, later] of sim.rolls) {
        let ma = ma0, mb = mb0;
        if (later) { ma += nudge[a]; mb += nudge[b]; }
        if (wk > week) { ma += add[a] || 0; mb += add[b] || 0; }
        const pa = gauss(ma, sa), pb = gauss(mb, sb);
        pf[a] += pa; pf[b] += pb;
        w[pa > pb ? a : b] += 1;
      }
      const order = teams.slice().sort((x, y) => (w[y] - w[x]) || (pf[y] - pf[x]));
      for (let i = 0; i < sim.spots; i++) made[order[i]] += 1;
    }
    for (const t of teams) made[t] /= sims;
    return made;
  }
  /* the trade's effect on both teams' playoff odds: {me: [before, after], them: [before, after]} */
  function oddsChange(lg, deal) {
    const s = lg.sim;
    if (!s || !(lg.weeks_left > 1)) return null;
    const f = lg.factor || 1;
    const before = playoffs(s, lg.week), after = playoffs(s, lg.week, { [s.me]: deal.my_gain * f, [String(deal.team_id)]: deal.their_gain * f });
    if (!before || !after) return null;
    return { me: [before[s.me], after[s.me]], them: [before[String(deal.team_id)], after[String(deal.team_id)]] };
  }

  /* every player in the league, for typing a trade: [{p, owner: 'me' | team id}] */
  function everyone(lg) {
    const [teams] = teamsOf(lg);
    const out = [];
    for (const [tid, r] of Object.entries(teams)) for (const p of r) out.push({ p, owner: tid });
    return out;
  }
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  /* players matching what was typed, best first: whole name, last name, first letters, anywhere in the name */
  function search(lg, text, limit = 6, only = null) {
    const q = fold(text);
    if (!q) return [];
    const words = q.split(' ');
    const hits = [];
    for (const x of everyone(lg)) {
      if (only && !only(x)) continue;
      const n = fold(x.p.name), parts = n.split(' ');
      let s = 0;
      if (n === q) s = 100;
      else if (parts.slice(1).join(' ') === q || parts[parts.length - 1] === q) s = 85;
      else if (n.startsWith(q)) s = 75;
      else if (words.every(w => parts.some(pt => pt.startsWith(w)))) s = 65;
      else if (n.includes(q)) s = 45;
      else if (fold(x.p.team) === q || fold(x.p.pos) === q) s = 20;
      if (s) hits.push([s + Math.min(v(x.p), 30) / 10, x]);
    }
    return hits.sort((a, b) => b[0] - a[0]).slice(0, limit).map(h => h[1]);
  }
  /* "Kelce and Pacheco for Jefferson": [{side: 'give'|'get', hit}] for every name it recognizes */
  function parse(lg, text) {
    const sides = String(text).split(/\s+(?:for|4)\s+|\s*(?:⇄|<->|<=>|->|=>|=)\s*/i);
    if (sides.length !== 2) return null;
    const names = s => s.split(/\s*(?:,|&|\+|\band\b|\bplus\b)\s*/i).map(x => x.replace(/^(?:give|trade|send|my|i give|i trade)\s+/i, '').trim()).filter(Boolean);
    const out = [];
    for (const [i, side] of sides.entries()) {
      for (const n of names(side)) {
        const mineFirst = i === 0;
        const hit = search(lg, n, 1, x => mineFirst ? x.owner === 'me' : x.owner !== 'me')[0] || search(lg, n, 1)[0];
        if (hit) out.push({ side: hit.owner === 'me' ? 'give' : 'get', hit });
      }
    }
    return out;
  }

  return { FILL, MIN_GAIN, THEIR_FLOOR, league, v, bestLineup, lineupValue, evaluate, find, withTeam, forPlayer, compromises,
    explain, playoffs, oddsChange, everyone, search, parse, sigOf, pyRound2 };
})();
if (typeof module !== 'undefined') module.exports = Trade;
