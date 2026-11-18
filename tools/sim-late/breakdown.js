/* Where do attempts and destroys happen? Per-band means per player (run until +20 or the 150 h cap).
 * Usage: node tools/sim-late/breakdown.js [cases=M1,AC10] [runs=500] [lightRuns=100] [seed=20261118]
 */
'use strict';
const E = require('./lib/engine.js');
const P = require('./lib/profiles.js');
const M = require('./lib/mechanics.js');
const { CASES } = require('./lib/cases.js');

const ids = (process.argv[2] || 'M1,AC10').split(',');
const runs = +process.argv[3] || 500;
const lightRuns = +process.argv[4] || 100;
const seed = +process.argv[5] || 20261118;
const BANDS = [[0, 4], [5, 9], [10, 14], [15, 19]];

ids.forEach(id => {
  [[P.heavy, runs], [P.realistic, runs], [P.light, lightRuns]].forEach(([prof, n]) => {
    const att = Array(20).fill(0), dst = Array(20).fill(0), prot = Array(20).fill(0);
    const probe = { id: 'probe', post(S, r) {
      att[r.from]++;
      if (r.outcome === 'destroy') dst[r.from]++;
      if (r.outcome === 'protected') prot[r.from]++;
    } };
    E.runMany(prof, M.combine(CASES[id].concat([probe])), 'standard', n, seed, 150);
    const band = arr => BANDS.map(([a, b]) => (arr.slice(a, b + 1).reduce((x, y) => x + y, 0) / n).toFixed(arr === att ? 0 : 1)).join(' / ');
    const tot = att.reduce((x, y) => x + y, 0), below = att.slice(0, 15).reduce((x, y) => x + y, 0);
    const dTot = dst.reduce((x, y) => x + y, 0), dBelow = dst.slice(0, 15).reduce((x, y) => x + y, 0);
    console.log(`${id} ${prof.name}: attempts/run by band +0~4 / +5~9 / +10~14 / +15~19 = ${band(att)}` +
      ` | destroys = ${band(dst)} | share below +15: attempts ${(100 * below / tot).toFixed(0)}%, destroys ${(100 * dBelow / dTot).toFixed(0)}%`);
  });
});
