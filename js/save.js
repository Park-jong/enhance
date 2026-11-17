/* 저장/불러오기: v2 기본 상태, 정합성 보정, v1 → v2 마이그레이션 (m1-storage §3).
 * 저장소는 { getItem, setItem } 인터페이스로 주입한다(브라우저: localStorage, 테스트: 메모리).
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.rules && typeof require === 'function') require('./rules.js');
  SG.save = factory(SG.C, SG.rules);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.save;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, R) {
  'use strict';

  const SAVE_VERSION = 2;
  const STAT_KEYS = ['tries', 'success', 'fail', 'destroy', 'earned',
    'shardsGained', 'protectSaved', 'delivered', 'crafted', 'huntGold', 'offlineGold'];
  const V1_STAT_KEYS = ['tries', 'success', 'fail', 'destroy', 'earned'];
  const USE_KEYS = ['bless', 'protect', 'keepdown', 'sure', 'anvil', 'seal'];

  const zeros = keys => keys.reduce((o, k) => { o[k] = 0; return o; }, {});
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const obj = v => (isObj(v) ? v : {});

  /** 숫자로 읽을 수 있으면 정수로 내리고 [min,max]로 자름, 아니면 기본값 */
  function int(v, def, min, max) {
    if (typeof v !== 'number' && typeof v !== 'string') return def;
    const n = Number(v);
    if (!Number.isFinite(n) || v === '') return def;
    const lo = min === undefined ? -Infinity : min;
    const hi = max === undefined ? Infinity : max;
    return Math.min(hi, Math.max(lo, Math.floor(n)));
  }
  const bool = (v, def) => (typeof v === 'boolean' ? v : def);
  const maxId = list => list.reduce((m, x) => Math.max(m, x.id), 0);

  function defaultState(now) {
    return {
      v: SAVE_VERSION,
      gold: C.START_GOLD,
      shards: 0,
      best: 0,
      found: Array.from({ length: C.MAX + 1 }, (_, i) => i === 0),
      swords: [{ id: 1, lv: 0, prot: C.PROTECT_USES, pity: 0 }],
      nextSwordId: 2,
      active: 1,
      slots: C.SLOT_START,
      inv: zeros(C.CONSUMABLES),
      use: USE_KEYS.reduce((o, k) => { o[k] = false; return o; }, {}),
      anvils: [],
      nextAnvilId: 1,
      anvilEq: null,
      ore: zeros(C.ORES),
      quests: {
        list: Array(C.QUEST_SLOTS).fill(null),
        readyAt: Array(C.QUEST_SLOTS).fill(0),
        nextId: 1,
      },
      idle: { autoOn: false, up: zeros(C.UPGRADES.map(u => u.id)), lastSeen: now, boostUntil: 0 },
      settings: { muted: false, skipFx: false },
      stats: zeros(STAT_KEYS),
    };
  }

  // ------------------------------------------------------------ 필드별 보정
  function normFound(v) {
    const src = Array.isArray(v) ? v : [];
    return Array.from({ length: C.MAX + 1 }, (_, i) => i === 0 || src[i] === true);
  }

  function normSwords(v) {
    const seen = new Set();
    return (Array.isArray(v) ? v : []).filter(isObj).map(s => ({
      id: int(s.id, 0, 0),
      lv: int(s.lv, 0, 0, C.MAX),
      prot: int(s.prot, C.PROTECT_USES, 0, C.PROTECT_USES),
      pity: int(s.pity, 0, 0),
    })).filter(s => s.id > 0 && !seen.has(s.id) && seen.add(s.id)).slice(0, C.SLOT_MAX);
  }

  function normAnvils(v) {
    const seen = new Set();
    return (Array.isArray(v) ? v : []).filter(isObj).map(a => {
      const g = int(a.g, 0, 0);
      return { id: int(a.id, 0, 0), g, dura: int(a.dura, 0, 0, C.ANVIL_DURA[g] || 0) };
    }).filter(a => a.id > 0 && C.ANVIL_CRAFT[a.g] && !seen.has(a.id) && seen.add(a.id)).slice(0, C.ANVIL_OWN_MAX);
  }

  function normQuest(q, slot) {
    if (!isObj(q) || q.tier !== C.QUEST_TIERS[slot]) return null;
    const item = isObj(q.item) && C.ITEMS[q.item.id] ? { id: q.item.id, n: int(q.item.n, 1, 1) } : null;
    return { id: int(q.id, 0, 0), tier: q.tier, lv: int(q.lv, 1, 1, C.MAX), gold: int(q.gold, 0, 0), item };
  }

  function normQuests(v) {
    const d = obj(v);
    const list = Array.from({ length: C.QUEST_SLOTS }, (_, i) => normQuest(Array.isArray(d.list) ? d.list[i] : null, i));
    const readyAt = Array.from({ length: C.QUEST_SLOTS }, (_, i) => int(Array.isArray(d.readyAt) ? d.readyAt[i] : 0, 0, 0));
    const nextId = Math.max(int(d.nextId, 1, 1), maxId(list.filter(Boolean)) + 1);
    return { list, readyAt, nextId };
  }

  const normCounts = (v, keys, max) => keys.reduce((o, k) => { o[k] = int(obj(v)[k], 0, 0, max); return o; }, {});

  /** 저장 데이터(부분/손상 포함)를 기본값과 병합하고 정합성을 맞춘다 (m1-storage §3 로드 규칙 4) */
  function normalize(d, now) {
    const S = defaultState(now);
    if (!isObj(d)) return S;

    S.gold = int(d.gold, S.gold, 0);
    S.shards = int(d.shards, 0, 0);
    S.best = int(d.best, 0, 0, C.MAX);
    S.found = normFound(d.found);

    S.swords = normSwords(d.swords);
    S.nextSwordId = Math.max(int(d.nextSwordId, 1, 1), maxId(S.swords) + 1);
    if (S.swords.length === 0) R.createSword(S);
    S.slots = Math.max(int(d.slots, C.SLOT_START, C.SLOT_START, C.SLOT_MAX), S.swords.length);
    S.active = R.findSword(S, d.active) ? d.active : R.bestSword(S).id;
    S.best = Math.max(S.best, R.bestSword(S).lv);

    S.inv = normCounts(d.inv, C.CONSUMABLES, C.STACK_MAX);
    const use = obj(d.use);
    USE_KEYS.forEach(k => { S.use[k] = bool(use[k], false); });

    S.anvils = normAnvils(d.anvils);
    S.nextAnvilId = Math.max(int(d.nextAnvilId, 1, 1), maxId(S.anvils) + 1);
    S.anvilEq = R.findAnvil(S, d.anvilEq) ? d.anvilEq : null;
    S.ore = normCounts(d.ore, C.ORES, C.ORE_MAX);

    S.quests = normQuests(d.quests);

    const idle = obj(d.idle);
    S.idle = {
      autoOn: bool(idle.autoOn, false),
      up: normCounts(idle.up, C.UPGRADES.map(u => u.id), C.UP_MAX),
      lastSeen: int(idle.lastSeen, now),
      boostUntil: int(idle.boostUntil, 0, 0),
    };
    const settings = obj(d.settings);
    S.settings = { muted: bool(settings.muted, false), skipFx: bool(settings.skipFx, false) };
    S.stats = normCounts(d.stats, STAT_KEYS);

    R.cleanupUse(S);
    return S;
  }

  /** v1 저장 → v2 (m1-storage §3 매핑표). 마이그레이션 직후 오프라인 보상 없음(lastSeen=now) */
  function migrateV1(d, now) {
    if (!isObj(d)) return defaultState(now);
    const level = int(d.level, 0, 0, C.MAX);
    const inv = obj(d.inv);
    const use = obj(d.use);
    const stats = obj(d.stats);
    return normalize({
      v: SAVE_VERSION,
      gold: d.gold,
      best: Math.max(int(d.best, 0, 0, C.MAX), level),
      found: d.found,
      swords: [{ id: 1, lv: level, prot: C.PROTECT_USES, pity: 0 }],
      nextSwordId: 2,
      active: 1,
      inv: { bless: inv.bless, protect: inv.protect },
      use: { bless: use.bless, protect: use.protect },
      settings: { muted: d.muted },
      stats: V1_STAT_KEYS.reduce((o, k) => { o[k] = stats[k]; return o; }, {}),
      idle: { lastSeen: now },
    }, now);
  }

  // ------------------------------------------------------------ 저장소 입출력
  function read(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }
  function write(storage, key, S) {
    try { storage.setItem(key, JSON.stringify(S)); return true; } catch (e) { return false; }
  }
  function parse(raw) {
    try { return JSON.parse(raw); } catch (e) { return undefined; }
  }

  /**
   * 로드 규칙: v2 → (없으면) v1 마이그레이션 후 v2로 저장(v1 키는 남김) → 기본 상태.
   * source: 'v2' | 'v1' | 'new' | 'corrupt'
   */
  function load(storage, now) {
    const raw2 = read(storage, C.SAVE_KEY);
    if (raw2 !== null && raw2 !== undefined) {
      const d = parse(raw2);
      return isObj(d) ? { state: normalize(d, now), source: 'v2' } : { state: defaultState(now), source: 'corrupt' };
    }
    const raw1 = read(storage, C.SAVE_KEY_V1);
    if (raw1 !== null && raw1 !== undefined) {
      const d = parse(raw1);
      if (!isObj(d)) return { state: defaultState(now), source: 'corrupt' };
      const state = migrateV1(d, now);
      write(storage, C.SAVE_KEY, state);
      return { state, source: 'v1' };
    }
    return { state: defaultState(now), source: 'new' };
  }

  /** 저장할 때마다 오프라인 기준 시각을 갱신 */
  function save(storage, S, now) {
    S.idle.lastSeen = now;
    return write(storage, C.SAVE_KEY, S);
  }

  return { SAVE_VERSION, defaultState, normalize, migrateV1, load, save };
});
