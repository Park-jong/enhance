/* M2 icon set (classic script, no modules). Exposes a SEPARATE global window.M2_ICONS = { key: '<svg>...' }.
 * Same contract as M1 (assets/m1-icons.js): viewBox 0 0 32 32, no width/height (size via CSS, e.g. 1em),
 * currentColor + CSS vars with fallbacks, no gradients/ids. Tier pips for traits are CSS-only (not SVG).
 * Keys (21):
 *  Traits: trait_hunt, trait_work, trait_trade, trait_ore, trait_shard, trait_anvil
 *  Events: event_luck, event_hunt, event_auto, event_ore, event_anvil, event_quest
 *  Misc:   fame, rebirth, monument, achievement, title, sure_badge, mastery
 */
(function () {
  var G = 'var(--gold,#ffd166)', OK = 'var(--good,#4cd97b)', BAD = 'var(--bad,#ff4d6d)',
      WARN = 'var(--warn,#ff9f1c)', INFO = 'var(--info,#4da3ff)', AC = 'var(--accent,#7c5cff)';
  var WOOD = '#b07a45', STEEL = '#c9d6e6', STEEL2 = '#8a97ab';
  function s(body) {
    return '<svg viewBox="0 0 32 32" fill="none" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
  }
  function anvilBody(top, base, trim) {
    return '<path d="M4 9h20c0 4 3 5 5 5h-5c-2 0-4 2-4 4v2h-12v-2c0-2-1-4-3-4C6 14 4 12 4 9z" fill="' + top + '" stroke="' + trim + '" stroke-width="1.2"/>' +
      '<path d="M9 22h14l2 5H7z" fill="' + base + '"/>';
  }
  function spark(x, y, r, c) {
    var a = r * 0.28;
    return '<path d="M' + x + ' ' + (y - r) + 'L' + (x + a) + ' ' + (y - a) + 'L' + (x + r) + ' ' + y + 'L' + (x + a) + ' ' + (y + a) + 'L' + x + ' ' + (y + r) + 'L' + (x - a) + ' ' + (y + a) + 'L' + (x - r) + ' ' + y + 'L' + (x - a) + ' ' + (y - a) + 'z" fill="' + c + '"/>';
  }

  window.M2_ICONS = {
    trait_hunt: s('<path d="M7 28 21 12" stroke="' + WOOD + '" stroke-width="3.5"/><path d="M14 9c3-6 11-7 15-3-1 5-4 9-9 10l-3-3z" fill="' + STEEL + '" stroke="' + STEEL2 + '" stroke-width="1.8"/><path d="M19 8c2-1 5-1 7 0" stroke="' + STEEL2 + '" stroke-width="2"/>'),
    trait_work: s('<path d="M6 27 19 14" stroke="' + WOOD + '" stroke-width="4"/><path d="M12 9l6-6 11 11-6 6z" fill="' + STEEL2 + '" stroke="' + STEEL + '" stroke-width="1.8"/><path d="M16 5l11 11" stroke="' + STEEL + '" stroke-width="2"/>'),
    trait_trade: s('<path d="M11 7 9 3h14l-2 4" fill="' + WOOD + '" stroke="' + WOOD + '" stroke-width="1.5"/><path d="M12 8c-6 4-8 10-7 15 1 4 5 6 11 6s10-2 11-6c1-5-1-11-7-15z" fill="' + WOOD + '" stroke="' + G + '" stroke-width="2"/><path d="M11 9h10" stroke="' + G + '" stroke-width="3"/><circle cx="16" cy="19" r="5" fill="' + G + '" stroke="' + WARN + '" stroke-width="1.8"/><path d="M16 16.5v5" stroke="' + WARN + '" stroke-width="2"/>'),
    trait_ore: s('<path d="M7 29 17 12" stroke="' + WOOD + '" stroke-width="3.5"/><path d="M3 14C6 5 20 3 29 11c-5-1-8 0-10 3-3-3-9-3-16 0z" fill="' + STEEL + '" stroke="' + STEEL2 + '" stroke-width="2"/>'),
    trait_shard: s('<path d="M8 4h16l6 8-14 17L2 12z" fill="' + INFO + '" stroke="#1d6fd0" stroke-width="1.8"/><path d="M2 12h28M12 4l-3 8 7 17 7-17-3-8" stroke="#fff" stroke-opacity=".75" stroke-width="1.6"/>'),
    trait_anvil: s(anvilBody(STEEL2, '#5a6478', STEEL) + spark(25, 5, 5, WARN) + '<path d="M22 8l-3 2" stroke="' + G + '" stroke-width="2"/>'),

    event_luck: s('<circle cx="11.5" cy="11.5" r="6.5" fill="' + OK + '"/><circle cx="20.5" cy="11.5" r="6.5" fill="' + OK + '"/><circle cx="11.5" cy="20.5" r="6.5" fill="' + OK + '"/><circle cx="20.5" cy="20.5" r="6.5" fill="' + OK + '"/><path d="M16 16 25 29" stroke="#2a9d56" stroke-width="3"/><path d="M16 5v22M5 16h22" stroke="#1f7a42" stroke-width="1.6" opacity=".7"/><circle cx="16" cy="16" r="2.6" fill="#fff" opacity=".85"/>'),
    event_hunt: s('<path d="M10 3c15 3 15 23 0 26" stroke="' + WOOD + '" stroke-width="3.5"/><path d="M10 3 10 29" stroke="currentColor" stroke-width="1.6" opacity=".7"/><path d="M3 16h25" stroke="currentColor" stroke-width="2.6"/><path d="M23 10l7 6-7 6z" fill="' + BAD + '"/><path d="M3 16l-1-4M3 16l-1 4M7 16l-1-4M7 16l-1 4" stroke="' + BAD + '" stroke-width="2"/>'),
    event_auto: s('<path d="M16 30V10" stroke="' + WARN + '" stroke-width="2.6"/><ellipse cx="16" cy="6" rx="3" ry="4.5" fill="' + G + '"/><ellipse cx="10.5" cy="12" rx="3" ry="5" transform="rotate(-35 10.5 12)" fill="' + G + '"/><ellipse cx="21.5" cy="12" rx="3" ry="5" transform="rotate(35 21.5 12)" fill="' + G + '"/><ellipse cx="10.5" cy="19.5" rx="3" ry="5" transform="rotate(-35 10.5 19.5)" fill="' + G + '"/><ellipse cx="21.5" cy="19.5" rx="3" ry="5" transform="rotate(35 21.5 19.5)" fill="' + G + '"/><ellipse cx="11" cy="26" rx="2.4" ry="4" transform="rotate(-50 11 26)" fill="' + WARN + '"/><ellipse cx="21" cy="26" rx="2.4" ry="4" transform="rotate(50 21 26)" fill="' + WARN + '"/>'),
    event_ore: s('<path d="M3 22 6 11l8-6 9 3 6 9-4 9H8z" fill="#4a5068" stroke="#8a91a5" stroke-width="1.8"/><path d="M7 21 13 12l5 4 3-6M13 12l-1 12M18 16l5 6" stroke="' + G + '" stroke-width="3"/><path d="M12 24l4 2" stroke="' + WARN + '" stroke-width="2"/>' + spark(26, 6, 5.5, '#fff') + spark(5, 5, 3, G)),
    event_anvil: s('<circle cx="16" cy="16" r="14" fill="' + G + '" opacity=".25"/><circle cx="16" cy="16" r="13.5" stroke="' + G + '" stroke-width="2" stroke-dasharray="3 3"/><g transform="translate(5.5 7) scale(.66)">' + anvilBody(G, WARN, '#fff') + '</g>' + spark(26, 6, 4, '#fff') + spark(6, 26, 3.5, G) + spark(27, 26, 3, '#fff')),
    event_quest: s('<path d="M3 4h13l13 13-12 12L4 16z" fill="' + WARN + '" opacity=".35" stroke="' + G + '" stroke-width="2"/><circle cx="9" cy="10" r="2" fill="currentColor"/><circle cx="13" cy="14" r="2.3" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="21" r="2.3" stroke="currentColor" stroke-width="2"/><path d="M21 12 12 23" stroke="currentColor" stroke-width="2.2"/>'),

    fame: s('<circle cx="16" cy="16" r="14" fill="' + G + '" opacity=".22"/><circle cx="16" cy="16" r="10" fill="' + G + '" opacity=".2"/><path d="M16 4.5 18.9 12.4 27.4 12.8 20.8 18.2 23 26.4 16 21.7 9 26.4 11.2 18.2 4.6 12.8 13.1 12.4z" fill="' + G + '" stroke="' + WARN + '" stroke-width="1.6"/>'),
    rebirth: s('<path d="M26.5 16A10.5 10.5 0 1 1 22.6 7.9" stroke="' + OK + '" stroke-width="3"/><path d="M25 2.5V9.5H18" stroke="' + OK + '" stroke-width="3"/><path d="M16 24v-7" stroke="' + OK + '" stroke-width="2.4"/><path d="M16 18c-4.5 0-6-2.5-6-5.5 4.5 0 6 2.5 6 5.5zM16 17c0-3.5 2-6 6-6 0 3.5-2 6-6 6z" fill="' + OK + '"/>'),
    monument: s('<path d="M2.5 11 16 3.5 29.5 11z" fill="' + G + '" stroke="' + WARN + '" stroke-width="1.6"/><path d="M7.5 14v9M13 14v9M19 14v9M24.5 14v9" stroke="currentColor" stroke-width="3.2"/><rect x="3" y="24" width="26" height="3" rx="1" fill="currentColor"/><rect x="5" y="27" width="22" height="2.5" rx="1" fill="currentColor" opacity=".6"/>'),
    achievement: s('<path d="M9 8H4c0 6 2.5 8.5 6 8.5M23 8h5c0 6-2.5 8.5-6 8.5" stroke="' + G + '" stroke-width="2.4"/><path d="M8 3h16v9a8 8 0 0 1-16 0z" fill="' + G + '" stroke="' + WARN + '" stroke-width="1.8"/><path d="M12 7v5" stroke="#fff" stroke-opacity=".7" stroke-width="2.2"/><path d="M16 20v5" stroke="' + WARN + '" stroke-width="3"/><path d="M9 29v-3h14v3z" fill="' + WARN + '" stroke="' + WARN + '" stroke-width="1.5"/>'),
    title: s('<path d="M6.5 2v28" stroke="currentColor" stroke-width="2.8"/><path d="M8 4h19l-4 7 4 8-10-2.5L8 19z" fill="' + AC + '" stroke="' + AC + '" stroke-width="1.5"/><path d="M16 6.5 17.6 9.8 21.2 10.2 18.5 12.7 19.2 16.2 16 14.5 12.8 16.2 13.5 12.7 10.8 10.2 14.4 9.8z" fill="' + G + '"/>'),
    sure_badge: s('<circle cx="16" cy="16" r="10.5" fill="' + OK + '"/><path d="M16 1.5v3M16 27.5v3M1.5 16h3M27.5 16h3M5.7 5.7l2.1 2.1M24.2 24.2l2.1 2.1M26.3 5.7l-2.1 2.1M7.8 24.2l-2.1 2.1" stroke="' + OK + '" stroke-width="2.6"/><path d="M10.5 16.5l4 4 7.5-8.5" stroke="#fff" stroke-width="4"/>'),
    mastery: s('<path d="M9 18 6.5 30 12 27l3 3 1.5-11z" fill="' + INFO + '" stroke="' + INFO + '" stroke-width="1.4"/><path d="M23 18l2.5 12-5.5-3-3 3-1.5-11z" fill="' + AC + '" stroke="' + AC + '" stroke-width="1.4"/><circle cx="16" cy="12" r="9.5" fill="' + G + '" stroke="' + WARN + '" stroke-width="2"/><path d="M12 14.5l4-4 4 4M12 18.5l4-4 4 4" stroke="' + WARN + '" stroke-width="2.2"/>')
  };
})();
