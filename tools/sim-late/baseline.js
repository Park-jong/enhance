/* STEP 1 - baseline reconciliation on current M1 rules.
 * Usage: node tools/sim-late/baseline.js [runs=2000] [lightRuns=300] [seed=20261118]
 */
'use strict';
const E = require('./lib/engine.js');
const P = require('./lib/profiles.js');
const M = require('./lib/mechanics.js');
const { summarize, row, HEADER, fmtN, pct } = require('./lib/report.js');

const runs = +process.argv[2] || 2000;
const lightRuns = +process.argv[3] || 300;
const seed = +process.argv[4] || 20261118;
const none = M.combine([]);
const CAP_H = 150;          // active-hour cap per player (P-Light never finishes)

function block(label, profile, timeModel, n, capH) {
  const t = Date.now();
  const res = E.runMany(profile, none, timeModel, n, seed, capH);
  E.MILESTONES.forEach(m => console.log(row(label, summarize(res, m))));
  const s = summarize(res, 20);
  console.log(`   used/+20 (mean of finishers): bless ${fmtN(s.bless)} protect ${fmtN(s.protect)} keepdown ${fmtN(s.keepdown)} sure ${fmtN(s.sure)}; late(+15~19) attempts med ${fmtN(s.lateAtt)}  [${n} runs, ${((Date.now() - t) / 1000).toFixed(1)}s]`);
  return res;
}

console.log('Formulas at late levels (real js/rules.js):');
console.log(' lv  cost   hunt   auto  sell    hunt/cost');
for (let l = 10; l <= 19; l++) {
  console.log(String(l).padStart(3), fmtN(E.R.cost(l)).padStart(6), fmtN(E.R.huntReward(l)).padStart(6),
    fmtN(E.R.autoReward(l)).padStart(6), fmtN(E.R.sell(l)).padStart(6), (E.R.huntReward(l) / E.R.cost(l)).toFixed(2).padStart(7));
}
console.log('\n' + HEADER);
block('Heavy legacy(cont,0.35s)', P.heavy, 'legacy', runs, CAP_H);
block('P-Heavy std', P.heavy, 'standard', runs, CAP_H);
block('P-Realistic std', P.realistic, 'standard', runs, CAP_H);
block('P-Light std (cap 150h)', P.light, 'standard', lightRuns, CAP_H);
// sensitivity: realistic with skip ON
block('P-Realistic skipON', Object.assign({}, P.realistic, { skip: true }), 'standard', Math.min(runs, 1000), CAP_H);
