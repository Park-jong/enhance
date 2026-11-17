/* M1 icon set (classic script, no modules). Exposes window.M1_ICONS = { key: '<svg>...' }.
 * All icons: viewBox 0 0 32 32, no width/height (size via CSS, e.g. font-size or svg{width:1em;height:1em}).
 * Colors: currentColor + CSS vars with fallbacks. No gradients/ids.
 * Keys:
 *  Items: shard, ore_iron, ore_silver, ore_mithril, anvil_1, anvil_2, anvil_3,
 *         keepdown, sure, booster, seal, bless, protect
 *  UI:    storage, tab_shop, tab_forge, tab_quest, tab_idle, tab_log,
 *         auto_hunt, fx_skip, pity, protect_left, offline, lock, gold
 * Tier palette: iron #8d7b6a/#5b4d41 | silver #e3edf8/#9db3cc | mithril #3ee6d0/#118a7c
 */
(function () {
  var G = 'var(--gold,#ffd166)', OK = 'var(--good,#4cd97b)', BAD = 'var(--bad,#ff4d6d)',
      WARN = 'var(--warn,#ff9f1c)', INFO = 'var(--info,#4da3ff)', AC = 'var(--accent,#7c5cff)';
  var FE = '#8d7b6a', FE2 = '#5b4d41', AG = '#e3edf8', AG2 = '#9db3cc', MI = '#3ee6d0', MI2 = '#118a7c';
  function s(body) {
    return '<svg viewBox="0 0 32 32" fill="none" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
  }
  function ore(a, b, glow) {
    return s((glow ? '<circle cx="16" cy="17" r="14" fill="' + a + '" opacity=".22"/>' : '') +
      '<path d="M5 22 8 11l7-5 9 3 4 9-3 8H9z" fill="' + b + '" stroke="' + a + '" stroke-width="1.5"/>' +
      '<path d="M8 11l7 4 9-6M15 15l-2 12M15 15l10 4" stroke="' + a + '" stroke-width="1.5"/>' +
      '<path d="M15 6l9 3-9 6-7-4z" fill="' + a + '"/>');
  }
  function anvil(top, base, trim, glow) {
    return s((glow ? '<circle cx="16" cy="16" r="14" fill="' + trim + '" opacity=".25"/>' : '') +
      '<path d="M4 9h20c0 4 3 5 5 5h-5c-2 0-4 2-4 4v2h-12v-2c0-2-1-4-3-4C6 14 4 12 4 9z" fill="' + top + '"/>' +
      '<path d="M9 22h14l2 5H7z" fill="' + base + '"/>' +
      (trim ? '<path d="M4 9h20" stroke="' + trim + '" stroke-width="2"/><path d="M7 27h18" stroke="' + trim + '" stroke-width="1.5"/>' : ''));
  }
  var shield = 'M16 3 6 7v8c0 7 4.5 11 10 14 5.5-3 10-7 10-14V7z';

  window.M1_ICONS = {
    shard: s('<path d="M16 2 24 12 20 29 11 27 7 13z" fill="' + INFO + '"/><path d="M16 2 14 15 11 27M16 2l6 14-2 13M7 13l7 2 8 1 2-4" stroke="#fff" stroke-opacity=".7" stroke-width="1.3"/>'),
    ore_iron: ore(FE, FE2, false),
    ore_silver: ore(AG, AG2, false),
    ore_mithril: ore(MI, MI2, true),
    anvil_1: anvil(FE, FE2, '', false),
    anvil_2: anvil(AG2, FE2, AG, false),
    anvil_3: anvil(MI2, '#0c4f55', MI, true),
    keepdown: s('<path d="M16 4v18M8 15l8 9 8-9" stroke="' + OK + '" stroke-width="3.5"/><path d="M6 28h20" stroke="currentColor" stroke-width="3"/>'),
    sure: s('<circle cx="16" cy="16" r="12" fill="' + OK + '" opacity=".2" stroke="' + OK + '" stroke-width="2"/><path d="M9.5 16.5l4.5 4.5 8.5-9.5" stroke="' + OK + '" stroke-width="3.5"/>'),
    booster: s('<path d="M18 2 6 18h8l-2 12 14-18h-8z" fill="' + WARN + '" stroke="' + G + '" stroke-width="1.5"/>'),
    seal: s('<circle cx="16" cy="16" r="12" fill="' + AC + '" opacity=".25" stroke="' + AC + '" stroke-width="2"/><path d="M16 7l2.5 6 6.5.5-5 4.2 1.7 6.3L16 20.5 10.3 24l1.7-6.3-5-4.2 6.5-.5z" fill="' + AC + '"/>'),
    bless: s('<path d="M7 4h15l4 4v20H7z" fill="' + G + '" opacity=".2" stroke="' + G + '" stroke-width="2"/><path d="M16.5 9v13M11 14h11" stroke="' + G + '" stroke-width="3"/><path d="M5 5 3 3M27 5l2-2M16 1v2" stroke="' + G + '" stroke-width="1.5"/>'),
    protect: s('<path d="' + shield + '" fill="' + INFO + '" opacity=".25" stroke="' + INFO + '" stroke-width="2.2"/><path d="M16 10v11M11 14h10" stroke="' + INFO + '" stroke-width="2.5"/>'),
    storage: s('<rect x="3" y="12" width="26" height="16" rx="2" fill="' + WARN + '" opacity=".25" stroke="currentColor" stroke-width="2"/><path d="M3 12 6 5h20l3 7" stroke="currentColor" stroke-width="2"/><path d="M3 19h26" stroke="currentColor" stroke-width="2"/><rect x="13" y="16" width="6" height="6" rx="1" fill="' + G + '"/>'),
    tab_shop: s('<path d="M4 12 6 5h20l2 7z" fill="' + G + '" opacity=".35" stroke="currentColor" stroke-width="2"/><path d="M4 12c0 3 4 3 4 0 0 3 4 3 4 0 0 3 4 3 4 0 0 3 4 3 4 0 0 3 4 3 4 0" stroke="currentColor" stroke-width="2"/><path d="M6 15v12h20V15M13 27v-7h6v7" stroke="currentColor" stroke-width="2"/>'),
    tab_forge: s('<path d="M3 8h19c0 4 3 5 7 5h-6c-2 0-3 2-3 4v2H11v-2c0-2-1-4-3-4C5 13 3 11 3 8z" fill="currentColor"/><path d="M8 21h14l2 7H6z" fill="currentColor" opacity=".6"/><path d="M24 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="' + WARN + '"/>'),
    tab_quest: s('<path d="M7 3h15l4 4v22H7z" fill="currentColor" opacity=".15" stroke="currentColor" stroke-width="2"/><path d="M11 12h10M11 17h10M11 22h6" stroke="currentColor" stroke-width="2"/><path d="M22 3v4h4" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="5" fill="' + OK + '"/><path d="M21.7 24l1.8 1.8 3-3.4" stroke="#fff" stroke-width="1.6"/>'),
    tab_idle: s('<circle cx="16" cy="16" r="12" fill="currentColor" opacity=".15" stroke="currentColor" stroke-width="2"/><path d="M16 8v8l5 3" stroke="currentColor" stroke-width="2.5"/><path d="M26 3l3 0-3 4h3M22 1l2 0-2 3h2" stroke="' + INFO + '" stroke-width="1.3"/>'),
    tab_log: s('<rect x="5" y="4" width="22" height="24" rx="2" fill="currentColor" opacity=".15" stroke="currentColor" stroke-width="2"/><path d="M10 22v-4M16 22V12M22 22v-7" stroke="' + G + '" stroke-width="3.5"/><path d="M9 25h14" stroke="currentColor" stroke-width="1.5"/>'),
    auto_hunt: s('<path d="M26 16a10 10 0 0 1-17 7M6 16a10 10 0 0 1 17-7" stroke="currentColor" stroke-width="2.8"/><path d="M24 3v7h-7M8 29v-7h7" stroke="currentColor" stroke-width="2.8"/><path d="M16 10l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5z" fill="' + G + '"/>'),
    fx_skip: s('<path d="M5 6l11 10L5 26z" fill="currentColor"/><path d="M16 6l11 10-11 10z" fill="currentColor" opacity=".6"/><path d="M29 5v22" stroke="' + WARN + '" stroke-width="3"/>'),
    pity: s('<path d="M16 28C5 20 3 14 5 9c3-5 9-3 11 1 2-4 8-6 11-1 2 5 0 11-11 19z" fill="' + BAD + '" opacity=".3" stroke="' + BAD + '" stroke-width="2"/><path d="M4 28h24" stroke="currentColor" stroke-width="2"/><path d="M4 28h14" stroke="' + G + '" stroke-width="3.5"/>'),
    protect_left: s('<path d="' + shield + '" fill="' + INFO + '" opacity=".25" stroke="' + INFO + '" stroke-width="2.2"/><path d="M10 4v22" stroke="currentColor" stroke-width="0"/><path d="M11 16h10M16 11v10" stroke="' + INFO + '" stroke-width="2.5" transform="rotate(45 16 16)"/>'),
    offline: s('<path d="M24 5A12 12 0 1 0 27 21 9 9 0 0 1 24 5z" fill="' + AC + '" opacity=".35" stroke="' + AC + '" stroke-width="2"/><path d="M20 4h6l-6 6h6" stroke="currentColor" stroke-width="2"/>'),
    lock: s('<rect x="6" y="14" width="20" height="14" rx="2" fill="currentColor" opacity=".25" stroke="currentColor" stroke-width="2"/><path d="M10 14v-4a6 6 0 0 1 12 0v4" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="21" r="2.2" fill="' + G + '"/>'),
    gold: s('<circle cx="16" cy="16" r="13" fill="' + G + '" stroke="' + WARN + '" stroke-width="2"/><circle cx="16" cy="16" r="8.5" stroke="' + WARN + '" stroke-width="1.5"/><path d="M16 10v12M13 13c0-2 6-2 6 0s-6 2-6 4 6 2 6 0" stroke="' + WARN + '" stroke-width="1.8"/>')
  };
})();
