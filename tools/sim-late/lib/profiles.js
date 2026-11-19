/* Player policies. Each policy only calls real rule functions (buy/exchange/craft/repair/equip via ctx or R/F).
 *   heavy      : old m1-balance "M1 일반" policy - perfect consumable use, hunts to afford every profitable item.
 *   realistic  : anvil if owned/craftable, buys bless/protect only from surplus after the next attempt cost,
 *                never keepdown/sure, keeps animation skip OFF (default).
 *   light      : no bless/keepdown/sure purchases, protect only from free shards, iron anvil only, skip OFF.
 */
'use strict';
const { C, R, F } = require('./engine.js');

function manageAnvils(S, ctx, o) {
  if (!R.isUnlocked(S, 'forge')) return;
  const lv = R.activeSword(S).lv;
  S.anvils.forEach(a => {
    if (a.dura <= 0 && o.craft.includes(a.g) && F.repairBlock(S, a.id) === null) { F.repairAnvil(S, a.id); ctx.click(); }
  });
  const bestG = S.anvils.filter(a => a.dura > 0).reduce((m, a) => Math.max(m, a.g), 0);
  const grades = o.craft.slice().sort((x, y) => y - x);
  for (const g of grades) {
    if (g <= bestG) break;
    if (S.best < (o.craftMinBest[g] || 0)) continue;
    if (S.gold - F.craftCost(g).gold < R.cost(lv)) continue;
    if (F.craftBlock(S, g) === null) { F.craftAnvil(S, g); ctx.click(); break; }
  }
  if (o.shop && !S.anvils.some(a => a.dura > 0) && lv >= o.shopFromLv && S.anvils.length < C.ANVIL_OWN_MAX &&
      S.gold >= C.ANVIL_SHOP_PRICE + R.cost(lv)) ctx.buy('anvil_1');
  const best = S.anvils.filter(a => a.dura > 0).sort((a, b) => b.g - a.g || b.dura - a.dura)[0];
  if (best && S.anvilEq !== best.id) F.equipAnvil(S, best.id);
}

function shardsToProtect(S, ctx) {
  while (R.exchangeBlock(S, 'protect') === null) { R.exchangeShards(S, 'protect'); ctx.click(); }
}

const anvilGrade = (S, sw) => {
  const a = R.equippedAnvil(S);
  return a && a.dura > 0 && sw.lv >= C.ANVIL_TOGGLE_MIN_LV ? a.g : 0;
};

/** cheapest toggle set that still reaches the best success rate (perfect play: no wasted bless/durability) */
function bestCombo(S, sw, allowBless, gA) {
  const base = R.enhanceOpts(S);   // game's own options (gaugeFull, mastery); only the toggles vary
  const s = (b, a) => R.chances(sw, Object.assign({}, base, { bless: b, anvilGrade: a })).succ;
  const top = s(allowBless, gA);
  if (s(false, 0) >= top) return { bless: false, anvil: false };
  if (gA && s(false, gA) >= top) return { bless: false, anvil: true };
  if (allowBless && s(true, 0) >= top) return { bless: true, anvil: false };
  return { bless: allowBless, anvil: !!gA };
}

function addProtect(S, sw, plan, buyShort) {
  if (C.DESTROY[sw.lv] <= 0 || sw.prot <= 0) return;
  const need = R.protectNeed(sw.lv);
  const short = Math.max(0, need - S.inv.protect);
  if (short > 0 && !buyShort) return;
  plan.use.protect = true;
  if (short > 0) { plan.buy.protect = short; plan.gold += short * C.PRICE.protect; }
}

const heavy = {
  name: 'P-Heavy', kind: 'heavy', skip: true, huntEff: 1.0,
  manage(S, ctx) {
    manageAnvils(S, ctx, { craft: [1, 2, 3], craftMinBest: { 1: 5, 2: 10, 3: 12 }, shop: true, shopFromLv: 10 });
    shardsToProtect(S, ctx);
  },
  plan(S, sw) {
    const l = sw.lv;
    const plan = { use: {}, buy: {}, gold: 0 };
    const gA = anvilGrade(S, sw);
    if (l < 5) return plan;
    if (l === 9) {
      plan.use.sure = true;
      if (S.inv.sure < 1) { plan.buy.sure = 1; plan.gold += C.PRICE.sure; }
      return plan;
    }
    const combo = bestCombo(S, sw, l >= 12, gA);
    plan.use.anvil = combo.anvil;
    if (combo.bless) { plan.use.bless = true; if (S.inv.bless < 1) { plan.buy.bless = 1; plan.gold += C.PRICE.bless; } }
    if (l >= 11) addProtect(S, sw, plan, true);
    if (l >= 11 && l < C.KEEPDOWN_MAX_LV) {
      plan.use.keepdown = true;
      if (S.inv.keepdown < 1) { plan.buy.keepdown = 1; plan.gold += C.PRICE.keepdown; }
    }
    return plan;
  },
};

const realistic = {
  name: 'P-Realistic', kind: 'realistic', skip: false, huntEff: 0.8,
  manage(S, ctx) {
    manageAnvils(S, ctx, { craft: [1, 2, 3], craftMinBest: { 1: 5, 2: 7, 3: 12 }, shop: true, shopFromLv: 10 });
    shardsToProtect(S, ctx);
  },
  plan(S, sw) {
    const l = sw.lv;
    const plan = { use: {}, buy: {}, gold: 0 };
    plan.use.anvil = anvilGrade(S, sw) > 0;
    if (l < 10) return plan;
    let surplus = S.gold - R.cost(l);
    if (C.DESTROY[l] > 0 && sw.prot > 0) {
      const need = R.protectNeed(l);
      const short = Math.max(0, need - S.inv.protect);
      if (short * C.PRICE.protect <= surplus) {
        plan.use.protect = true;
        if (short) { plan.buy.protect = short; plan.gold += short * C.PRICE.protect; surplus -= short * C.PRICE.protect; }
      }
    }
    if (S.inv.bless > 0) plan.use.bless = true;
    else if (surplus >= C.PRICE.bless) { plan.use.bless = true; plan.buy.bless = 1; plan.gold += C.PRICE.bless; }
    return plan;
  },
};

const light = {
  name: 'P-Light', kind: 'light', skip: false, huntEff: 0.8,
  manage(S, ctx) {
    manageAnvils(S, ctx, { craft: [1], craftMinBest: { 1: 5 }, shop: true, shopFromLv: 10 });
    shardsToProtect(S, ctx);
  },
  plan(S, sw) {
    const plan = { use: {}, buy: {}, gold: 0 };
    plan.use.anvil = anvilGrade(S, sw) > 0;
    if (sw.lv >= 10) addProtect(S, sw, plan, false);
    return plan;
  },
};

module.exports = { heavy, realistic, light, manageAnvils, bestCombo, anvilGrade };
