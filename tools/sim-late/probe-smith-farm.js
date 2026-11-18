/* Exploit probe: deliberate smith-mastery farming.
 * The player owns a parked high sword (topLv income), enhances throwaway swords with the P-Heavy policy only inside
 * +10..+14 (sells any sword that reaches +15 and starts a new one), until smithTries reaches the max tier (2000).
 * Usage: node tools/sim-late/probe-smith-farm.js [runs=200] [seed=9000]
 */
'use strict';
const E = require('./lib/engine.js');
const P = require('./lib/profiles.js');
const M = require('./lib/mechanics.js');
const { median, p90 } = require('./lib/prng.js');
const { R } = E;

const runs = +process.argv[2] || 200;
const seed = +process.argv[3] || 9000;
const PARK_ID = 99;

[18, 15].forEach(parkLv => {
  const times = [];
  for (let i = 0; i < runs; i++) {
    let doneH = Infinity;
    const farm = {
      id: 'farm',
      init(S) {
        S.swords.push({ id: PARK_ID, lv: parkLv, prot: 2, pity: 0 });
        S.best = parkLv;
        for (let l = 0; l <= parkLv; l++) S.found[l] = true;
        S.gold = 50000;
        S.ore = { iron: 500, silver: 300, mithril: 200 };
      },
      manage(S) {
        let a = S.swords.find(s => s.id !== PARK_ID);
        if (a && a.lv >= 15) { R.sellSword(S, a.id); a = null; }
        if (!a) a = R.createSword(S);
        if (S.active !== a.id) R.setActive(S, a.id);
      },
      post(S, r, ctx) { if (doneH === Infinity && S._smith >= 2000) doneH = ctx.st.active / 3600; },
    };
    const smith = M.smith({ countFrom: 10, tries: [100, 250, 500, 1000, 2000], bonus: [0, 2, 4, 6, 8, 10], bonusFrom: 10 });
    E.runOne(P.heavy, M.combine([smith, farm]), 'standard', seed + i, 20);
    times.push(doneH);
  }
  console.log(`parked +${parkLv}: active hours to smith max (2000 tries at +10..14): median ${median(times).toFixed(2)}, p90 ${p90(times).toFixed(2)} [${runs} runs]`);
});
