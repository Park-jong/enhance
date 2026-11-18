/* Candidate late-game mechanics (A..F) as wrappers around the real rule functions.
 * Definitions follow the System Designer draft (merged into docs/design/m1.1-late-correction-proposal.md).
 * Sim-only state lives on S under underscore keys (S._gauge, S._mastery, S._smith, S._sure2); js/ is never touched.
 */
'use strict';
const { C, R } = require('./engine.js');

const LATE_FROM = 15, LATE_TO = 19;
const late = l => l >= LATE_FROM && l <= LATE_TO;

// ------------------------------------------------------------ A. ceiling gauge
/** scope 'account': gauge[l] shared by every sword, reset only by success at l (draft default).
 *  scope 'sword'  : stored per sword, lost on destroy (comparison). */
function gauge(p) {
  const N = p.N;                       // N[l-15] = fails allowed; attempt N+1 is guaranteed
  const scope = p.scope || 'account';
  const get = (S, sw) => (scope === 'account' ? S._gauge : (sw._gauge = sw._gauge || Array(21).fill(0)));
  return {
    id: 'A', init(S) { S._gauge = Array(21).fill(0); },
    forced(S, sw) { return late(sw.lv) && get(S, sw)[sw.lv] >= N[sw.lv - LATE_FROM] ? { gold: 0, by: 'A' } : null; },
    post(S, r) {
      if (!late(r.from)) return;
      const sw = R.findSword(S, r.swordId);
      if (scope === 'sword' && !sw) return;          // destroyed: per-sword gauge gone with it
      const g = scope === 'account' ? S._gauge : get(S, sw);
      if (r.outcome === 'success') g[r.from] = 0;
      else g[r.from] = Math.min(N[r.from - LATE_FROM], g[r.from] + 1);
    },
  };
}

// ------------------------------------------------------------ B. per-level mastery (account)
function mastery(p) {
  return {
    id: 'B', init(S) { S._mastery = Array(21).fill(0); },
    outside(S, sw) { return late(sw.lv) ? Math.min(p.maxPt, Math.floor(S._mastery[sw.lv] / p.perPt[sw.lv - LATE_FROM])) : 0; },
    post(S, r) { if (late(r.from)) S._mastery[r.from]++; },
  };
}

// ------------------------------------------------------------ C. smith mastery (account)
/** p.inCap: bonus joins raw (bless+anvil+pity) under BONUS_CAP instead of sitting outside it.
 *  p.initTries: starting counter (e.g. an M2 rebirth run that keeps smith mastery). */
function smith(p) {
  const bonus = (S, sw) => (sw.lv < p.bonusFrom ? 0 : p.bonus[p.tries.filter(t => S._smith >= t).length]);
  return {
    id: 'C', init(S) { S._smith = p.initTries || 0; },
    outside(S, sw) { return p.inCap ? 0 : bonus(S, sw); },
    inCap(S, sw) { return p.inCap ? bonus(S, sw) : 0; },
    post(S, r) { if (r.from >= p.countFrom) S._smith++; },
  };
}


// ------------------------------------------------------------ D. fusion (two same-level swords -> +1)
/** Policy: build swords up to parkLv and park them, fuse equal pairs (minLv..maxLv), roll anything >= rollFrom.
 *  Fusion succeeds with rate[l-10]%; on failure the material sword is lost. Fee = feeMult x cost(l). */
function fusion(p) {
  const parkOf = kind => (p.park && p.park[kind]) || 15;
  const fee = l => Math.round(p.feeMult * R.cost(l) / C.GOLD_ROUND) * C.GOLD_ROUND;
  function fuse(S, ctx, a, b) {
    const l = a.lv;
    S.gold -= fee(l);
    ctx.click();
    R.removeSword(S, b.id);
    if (ctx.rng() * 100 < p.rate[l - 10]) {
      a.lv = l + 1; a.pity = 0; a.prot = C.PROTECT_USES;
      S.found[a.lv] = true;
      if (a.lv > S.best) S.best = a.lv;
      ctx.st.fused++;
    }
    if (!R.findSword(S, S.active)) S.active = a.id;
  }
  return {
    id: 'D',
    manage(S, ctx, profile) {
      const park = parkOf(profile.kind);
      const rollFrom = p.maxLv + 1;
      // 1) fuse pairs, highest level first
      for (let l = p.maxLv; l >= p.minLv; l--) {
        const same = S.swords.filter(s => s.lv === l);
        if (same.length >= 2 && S.gold >= fee(l)) { fuse(S, ctx, same[0], same[1]); return; }
      }
      // 2) choose the sword to enhance
      const byLv = S.swords.slice().sort((a, b) => b.lv - a.lv);
      const roller = byLv.find(s => s.lv >= rollFrom);
      let pick = roller || byLv.find(s => s.lv < park);
      if (!pick) {
        if (S.swords.length < S.slots) { if (S.gold >= C.NEW_SWORD_PRICE) pick = R.buySword(S).sword; }
        else if (R.expandCost(S) !== null) {
          if (S.gold >= R.expandCost(S)) { R.expandSlots(S); ctx.click(); return; }
          ctx.hunt(); return;                          // save up for the next slot
        }
        if (!pick) pick = byLv[byLv.length - 1];        // all slots parked: roll the lowest parked sword
      }
      if (pick && S.active !== pick.id) R.setActive(S, pick.id);
    },
  };
}

// ------------------------------------------------------------ E. late guaranteed scroll sure2
/** price(S,l) per scroll; need[l-15] scrolls per use. Heavy buys whenever useful, realistic only from surplus,
 *  light only uses scrolls exchanged from shards. */
function sure2(p) {
  const price = (S, l) => {
    if (p.priceMode === 'hunt') return Math.max(p.minPrice || 0, Math.round(p.huntMult * R.huntReward(l) / 100) * 100);
    if (p.priceMode === 'table') return p.priceTable[l - LATE_FROM];
    return p.price;
  };
  return {
    id: 'E', init(S) { S._sure2 = 0; S._shardSure2 = 0; },
    forced(S, sw, ctx) {
      const l = sw.lv;
      if (!late(l) || S.best < p.unlockBest) return null;
      if (p.maxLv !== undefined && l > p.maxLv) return null;
      const need = p.need[l - LATE_FROM];
      const short = Math.max(0, need - S._sure2);
      const kind = ctx.st.profile.kind;
      if (short > 0 && kind === 'light') return null;
      const gold = short * price(S, l);
      if (kind === 'realistic' && S.gold - R.cost(l) < gold) return null;
      // heavy = gold-minimising player: buys only when the scroll costs less than the level's expected M1 gold cost
      if (kind === 'heavy' && p.heavyValue && gold > p.heavyValue[l - LATE_FROM]) return null;
      return { gold, by: 'E', pay(S2) { S2.gold -= gold; S2._sure2 += short; S2._sure2 -= need; ctx.st.used.sure2 += need; ctx.click(); } };
    },
    manage(S) {
      // shards -> sure2 only for light (others spend shards on protect first; light keeps its protect exchange too)
      if (p.shardCost && S.shards >= p.shardCost && S.best >= p.unlockBest) { S.shards -= p.shardCost; S._sure2++; }
    },
  };
}

// ------------------------------------------------------------ F. pity / cap constants
function pityCap(p) { return { id: 'F', consts: p }; }

// ------------------------------------------------------------ combine
function combine(list) {
  const parts = list.filter(Boolean);
  const consts = {};
  parts.forEach(m => { if (m.consts) Object.keys(m.consts).forEach(k => { consts[k] = Object.assign(consts[k] || {}, m.consts[k]); }); });
  return {
    ids: parts.map(m => m.id).join('+') || 'M1',
    consts,
    init(S, ctx) { parts.forEach(m => m.init && m.init(S, ctx)); },
    manage(S, ctx, profile) { parts.forEach(m => m.manage && m.manage(S, ctx, profile)); },
    levelOverrides(S, sw) {
      const x = parts.reduce((s, m) => s + (m.outside ? m.outside(S, sw) : 0), 0);
      if (!x || sw.lv >= C.MAX) return () => {};
      const l = sw.lv, old = C.RATE[l];
      C.RATE[l] = old + x;
      return () => { C.RATE[l] = old; };
    },
    /** in-cap bonus b: base + min(raw + b, cap) == base + min(raw, cap) + max(0, min(b, cap - min(raw, cap))) */
    inCapOverrides(S, sw, use) {
      const b = parts.reduce((s, m) => s + (m.inCap ? m.inCap(S, sw) : 0), 0);
      if (!b || sw.lv >= C.MAX) return () => {};
      const a = use.anvil ? R.equippedAnvil(S) : null;
      const ch = R.chances(sw, { bless: use.bless, anvilGrade: a ? a.g : 0 });
      const x = Math.max(0, Math.min(b, ch.cap - Math.min(ch.raw, ch.cap)));
      if (!x) return () => {};
      const l = sw.lv, old = C.RATE[l];
      C.RATE[l] = old + x;
      return () => { C.RATE[l] = old; };
    },
    forced(S, sw, ctx) {
      for (const m of parts) { const f = m.forced && m.forced(S, sw, ctx); if (f) return f; }
      return null;
    },
    planHook(S, sw, plan, ctx) { parts.forEach(m => m.planHook && m.planHook(S, sw, plan, ctx)); },
    post(S, r, ctx, forced) { parts.forEach(m => m.post && m.post(S, r, ctx, forced)); },
  };
}

module.exports = { gauge, mastery, smith, fusion, sure2, pityCap, combine, LATE_FROM };
