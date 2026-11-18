/* Seeded PRNG (mulberry32) and small statistics helpers. */
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quantile with "not reached" entries as Infinity (so p90 can be "> cap"). */
function quantile(values, q) {
  if (!values.length) return NaN;
  const s = values.slice().sort((x, y) => x - y);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
}
const median = v => quantile(v, 0.5);
const p90 = v => quantile(v, 0.9);
const mean = v => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

module.exports = { mulberry32, quantile, median, p90, mean };
