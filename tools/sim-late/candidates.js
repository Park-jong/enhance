/* STEP 2 - candidate mechanics vs current M1, per profile.
 * Usage: node tools/sim-late/candidates.js [set=final] [runs=2000] [lightRuns=300] [seed=20261118]
 *   set: final | sweep | <comma-separated case ids>
 */
'use strict';
const E = require('./lib/engine.js');
const P = require('./lib/profiles.js');
const M = require('./lib/mechanics.js');
const { summarize, row, HEADER, fmtN, pct } = require('./lib/report.js');

const set = process.argv[2] || 'final';
const runs = +process.argv[3] || 2000;
const lightRuns = +process.argv[4] || 300;
const seed = +process.argv[5] || 20261118;
const CAP_H = 150;
const { CASES, SETS } = require('./lib/cases.js');
const ids = SETS[set] || set.split(',');

const profiles = [[P.heavy, runs], [P.realistic, runs], [P.light, lightRuns]];

// sanity: wrappers must leave js/ constants untouched
const snapshot = () => JSON.stringify([E.C.RATE, E.C.BONUS_CAP, E.C.PITY_STEP, E.C.PITY_MAX, E.CONFIG.forceSuccess]);
const before = snapshot();

console.log(HEADER + '  | +19 att med/p90 | +20 via guarantee | late att med');
const summary = {};
ids.forEach(id => {
  if (!CASES[id]) throw new Error('unknown case ' + id);
  const mech = M.combine(CASES[id]);
  summary[id] = {};
  profiles.forEach(([prof, n]) => {
    const t = Date.now();
    const res = E.runMany(prof, mech, 'standard', n, seed, CAP_H);
    [15, 18, 20].forEach(m => {
      const s = summarize(res, m);
      let extra = '';
      if (m === 20) extra = `  | ${fmtN(s.att19Med)}/${fmtN(s.att19P90)} | ${pct(s.viaForced)} | ${fmtN(s.lateAtt)}  (${((Date.now() - t) / 1000).toFixed(0)}s)`;
      console.log(row(`${id} ${prof.name.slice(2)}`, s) + extra);
      summary[id][prof.kind + m] = s;
    });
  });
  console.log('');
});
if (snapshot() !== before) throw new Error('constants were not restored!');
console.log('constants restored: OK');
if (process.env.JSON_OUT) require('fs').writeFileSync(process.env.JSON_OUT, JSON.stringify(summary, null, 1));
