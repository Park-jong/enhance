/* Summaries and fixed-width table printing. Unreached milestones count as Infinity (shown as ">cap"). */
'use strict';
const { median, p90, mean } = require('./prng.js');

function summarize(results, m) {
  const pick = f => results.map(r => (r.ms[m] ? f(r.ms[m]) : Infinity));
  const hit = results.filter(r => r.ms[m]);
  const avg = f => (hit.length ? mean(hit.map(x => f(x.ms[m]))) : NaN);
  return {
    m, n: results.length, reach: hit.length / results.length,
    attMed: median(pick(x => x.attempts)), attP90: p90(pick(x => x.attempts)),
    goldMed: median(pick(x => x.gold)),
    hMed: median(pick(x => x.h)), hP90: p90(pick(x => x.h)),
    dMed: median(pick(x => x.days)), dP90: p90(pick(x => x.days)),
    huntFrac: avg(x => x.huntFrac), destroys: median(pick(x => x.destroys)),
    lateAtt: median(pick(x => x.lateAttempts)), forced: avg(x => x.forced), fused: avg(x => x.fused),
    bless: avg(x => x.used.bless), protect: avg(x => x.used.protect), keepdown: avg(x => x.used.keepdown),
    sure: avg(x => x.used.sure), sure2: avg(x => x.used.sure2),
    att19Med: median(pick(x => x.att19)), att19P90: p90(pick(x => x.att19)),
    viaForced: hit.length ? hit.filter(x => x.ms[m].via === 'forced').length / hit.length : NaN,
  };
}

const fmtN = v => {
  if (v === Infinity) return '>cap';
  if (!Number.isFinite(v)) return '-';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
};
const pct = v => (Number.isFinite(v) ? (v * 100).toFixed(0) + '%' : '-');

function row(label, s) {
  return [label.padEnd(26), ('+' + s.m).padStart(4), pct(s.reach).padStart(5),
    fmtN(s.attMed).padStart(7), fmtN(s.attP90).padStart(7), fmtN(s.goldMed).padStart(7),
    fmtN(s.hMed).padStart(6), fmtN(s.hP90).padStart(6), fmtN(s.dMed).padStart(5), fmtN(s.dP90).padStart(5),
    (s.hP90 / s.hMed).toFixed(2).padStart(5), pct(s.huntFrac).padStart(5), fmtN(s.destroys).padStart(5)].join(' ');
}
const HEADER = ['case'.padEnd(26), 'lv'.padStart(4), 'reach'.padStart(5), 'attMed'.padStart(7), 'attP90'.padStart(7),
  'gold'.padStart(7), 'hMed'.padStart(6), 'hP90'.padStart(6), 'dMed'.padStart(5), 'dP90'.padStart(5),
  'p9/md'.padStart(5), 'hunt'.padStart(5), 'dstr'.padStart(5)].join(' ');

module.exports = { summarize, row, HEADER, fmtN, pct };
