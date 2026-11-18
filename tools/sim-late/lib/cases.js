/* Case table shared by candidates.js and breakdown.js. */
'use strict';
const M = require('./mechanics.js');

const F_DRAFT = { PITY_STEP: { 3: 3 }, PITY_MAX: { 3: 15 }, BONUS_CAP: { 3: 18 } };
const D_RATE = [90, 85, 80, 75, 70, 60, 50, 40, 30];

const SMITH_T = [100, 250, 500, 1000, 2000], SMITH_B = [0, 2, 4, 6, 8, 10];
const smithRec = extra => M.smith(Object.assign({ countFrom: 10, tries: SMITH_T, bonus: SMITH_B, bonusFrom: 15 }, extra));
const gaugeRec = () => M.gauge({ N: [4, 5, 6, 8, 10] });
const HEAVY_LV_GOLD = [110500, 272000, 730000, 2030000, 5880000];   // m1-balance §6.3 "M1 일반" gold per level 15..19

const CASES = {
  M1: [],
  // A ceiling gauge (account, per level; reset by success at that level)
  A_draft: [M.gauge({ N: [5, 7, 10, 14, 20] })],
  A_sword: [M.gauge({ N: [5, 7, 10, 14, 20], scope: 'sword' })],
  A_rec: [gaugeRec()],
  A_hard: [M.gauge({ N: [2, 3, 4, 5, 6] })],
  // B per-level mastery (outside cap)
  B_draft: [M.mastery({ perPt: [10, 12, 15, 20, 25], maxPt: 10 })],
  B_fast: [M.mastery({ perPt: [4, 5, 6, 8, 10], maxPt: 10 })],
  // C smith mastery (account tries at +10 and up -> outside-cap bonus at +15 and up)
  C_draft: [M.smith({ countFrom: 10, tries: [300, 1000, 2500, 5000, 10000], bonus: [0, 1, 2, 3, 4, 5], bonusFrom: 15 })],
  C_rec: [smithRec()],
  C_inCap: [smithRec({ inCap: true })],
  // D fusion
  D_draft: [M.fusion({ minLv: 10, maxLv: 18, rate: D_RATE, feeMult: 1.0, park: { heavy: 16, realistic: 15, light: 14 } })],
  D_sure: [M.fusion({ minLv: 10, maxLv: 18, rate: Array(9).fill(100), feeMult: 1.0, park: { heavy: 16, realistic: 15, light: 14 } })],
  // E sure2
  E_draft: [M.sure2({ price: 40000, need: [1, 1, 2, 2, 3], unlockBest: 15 })],
  E_scaled: [M.sure2({ priceMode: 'table', priceTable: HEAVY_LV_GOLD.map(x => Math.round(x * 1.5 / 1000) * 1000),
    need: [1, 1, 1, 1, 1], unlockBest: 15, heavyValue: HEAVY_LV_GOLD })],
  // F pity/cap
  F_draft: [M.pityCap(F_DRAFT)],
  F_cap20: [M.pityCap({ BONUS_CAP: { 3: 20 }, PITY_STEP: { 3: 3 }, PITY_MAX: { 3: 15 } })],
  // packages
  AF: [gaugeRec(), M.pityCap(F_DRAFT)],
  AC: [gaugeRec(), smithRec()],                         // alternative: smith bonus only at +15 and up
  AC10: [gaugeRec(), smithRec({ bonusFrom: 10 })],     // RECOMMENDED: smith bonus from +10
  // M2 rebirth second run: smith kept at max, gauge reset
  AC_rebirth: [gaugeRec(), smithRec({ initTries: 2000 })],
  AC10_rebirth: [gaugeRec(), smithRec({ bonusFrom: 10, initTries: 2000 })],
};

const SETS = {
  final: ['M1', 'A_draft', 'A_rec', 'B_draft', 'C_draft', 'C_rec', 'D_draft', 'E_draft', 'E_scaled', 'F_draft', 'AF', 'AC', 'AC10'],
  extra: ['A_sword', 'A_hard', 'B_fast', 'C_inCap', 'D_sure', 'F_cap20', 'AC_rebirth', 'AC10_rebirth'],
  sweep: null,
};
SETS.sweep = Object.keys(CASES);

module.exports = { CASES, SETS };
