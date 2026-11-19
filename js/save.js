/* 저장/불러오기: v2 기본 상태, 정합성 보정, v1 → v2 마이그레이션 (m1-storage §3).
 * 저장소는 { getItem, setItem } 인터페이스로 주입한다(브라우저: localStorage, 테스트: 메모리).
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.quests && typeof require === 'function') require('./quests.js');
  SG.save = factory(SG.C, SG.rules, SG.quests);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.save;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, R, Q) {
  'use strict';

  const SAVE_VERSION = 2;
  const CORRUPT_BACKUP_KEY = C.SAVE_KEY + '-corrupt';
  const MIN_MS = 60 * 1000;
  const STAT_KEYS = ['tries', 'success', 'fail', 'destroy', 'earned',
    'shardsGained', 'protectSaved', 'delivered', 'crafted', 'huntGold', 'offlineGold'];
  const V1_STAT_KEYS = ['tries', 'success', 'fail', 'destroy', 'earned'];
  const USE_KEYS = C.TRAY_TOGGLES.concat('seal');

  const zeros = keys => keys.reduce((o, k) => { o[k] = 0; return o; }, {});
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const obj = v => (isObj(v) ? v : {});

  /** 숫자로 읽을 수 있으면 정수로 내리고 [min,max]로 자름, 아니면 기본값. 범위는 항상 안전 정수 안 */
  function int(v, def, min, max) {
    if (typeof v !== 'number' && typeof v !== 'string') return def;
    const n = Number(v);
    if (!Number.isFinite(n) || v === '') return def;
    const lo = Math.max(-Number.MAX_SAFE_INTEGER, min === undefined ? -Infinity : min);
    const hi = Math.min(Number.MAX_SAFE_INTEGER, max === undefined ? Infinity : max);
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
      gauge: C.GAUGE_N.map(() => 0),
      mastery: C.MASTERY_REC_MAX.map(() => 0),
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

  /** 골드·보상 수량은 저장값을 믿지 않고 난이도·단계로 다시 계산한다. 풀에 없는 품목은 버림 */
  function normQuest(q, slot) {
    const tier = C.QUEST_TIERS[slot];
    if (!isObj(q) || q.tier !== tier) return null;
    const lv = int(q.lv, 1, 1, C.MAX);
    const item = isObj(q.item) ? Q.poolReward(tier, q.item.id, lv) : null;
    return { id: int(q.id, 0, 0), tier, lv, gold: Q.questGold(tier, lv), item };
  }

  function normQuests(v) {
    const d = obj(v);
    const list = Array.from({ length: C.QUEST_SLOTS }, (_, i) => normQuest(Array.isArray(d.list) ? d.list[i] : null, i));
    const readyAt = Array.from({ length: C.QUEST_SLOTS }, (_, i) => int(Array.isArray(d.readyAt) ? d.readyAt[i] : 0, 0, 0));
    const nextId = Math.max(int(d.nextId, 1, 1), maxId(list.filter(Boolean)) + 1);
    return { list, readyAt, nextId };
  }

  /** 단계별 정수 배열(gauge/mastery, M1.1): 배열이 아니면 0으로, 길이는 maxes에 맞추고 칸마다 0..maxes[i] */
  const normPerLevel = (v, maxes) => maxes.map((max, i) => int(Array.isArray(v) ? v[i] : 0, 0, 0, max));

  const normCounts = (v, keys, max) => keys.reduce((o, k) => { o[k] = int(obj(v)[k], 0, 0, max); return o; }, {});

  /** 저장 데이터(부분/손상 포함)를 기본값과 병합하고 정합성을 맞춘다 (m1-storage §3 로드 규칙 4·5) */
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
    // 저장된 숫자 0만 '활성 없음'으로 유지. 없는 id·손상 값은 예전처럼 최고 단계 검으로
    const active = int(d.active, null, 0);
    if (d.active === C.NO_ACTIVE_SWORD) S.active = C.NO_ACTIVE_SWORD;
    else S.active = Number.isInteger(d.active) && R.findSword(S, active) ? active : R.bestSword(S).id;
    S.best = Math.max(S.best, R.bestSword(S).lv);
    S.gauge = normPerLevel(d.gauge, C.GAUGE_N);
    S.mastery = normPerLevel(d.mastery, C.MASTERY_REC_MAX);

    S.inv = normCounts(d.inv, C.CONSUMABLES, C.STACK_MAX);
    const use = obj(d.use);
    USE_KEYS.forEach(k => { S.use[k] = bool(use[k], false); });

    S.anvils = normAnvils(d.anvils);
    S.nextAnvilId = Math.max(int(d.nextAnvilId, 1, 1), maxId(S.anvils) + 1);
    const anvilEq = int(d.anvilEq, null, 0);
    S.anvilEq = R.findAnvil(S, anvilEq) ? anvilEq : null;
    S.ore = normCounts(d.ore, C.ORES, C.ORE_MAX);

    S.quests = normQuests(d.quests);

    const idle = obj(d.idle);
    S.idle = {
      autoOn: bool(idle.autoOn, false),
      up: normCounts(idle.up, C.UPGRADES.map(u => u.id), C.UP_MAX),
      lastSeen: int(idle.lastSeen, now),
      boostUntil: int(idle.boostUntil, 0, 0, now + C.BOOSTER_MAX_MIN * MIN_MS),
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
  function writeRaw(storage, key, raw) {
    try { storage.setItem(key, raw); return true; } catch (e) { return false; }
  }
  const write = (storage, key, S) => writeRaw(storage, key, JSON.stringify(S));
  function parse(raw) {
    try { return JSON.parse(raw); } catch (e) { return undefined; }
  }

  const isEmpty = raw => raw === null || raw === undefined || raw === '';

  /**
   * 읽을 수 없는 v2 원문을 백업 키에 남긴다. 백업 키는 한 번만 쓴다(m1-storage AC 18):
   * 처음 손상된 원문이 가장 복구 가치가 높으므로 이후 손상 원문으로 덮어쓰지 않는다.
   * 결과: 'written' | 'same'(같은 원문이 이미 있음) | 'occupied'(다른 이전 백업을 지킴) | 'failed'
   */
  function backupCorrupt(storage, raw) {
    const existing = read(storage, CORRUPT_BACKUP_KEY);
    if (existing === raw) return 'same';
    if (!isEmpty(existing)) return 'occupied';
    return writeRaw(storage, CORRUPT_BACKUP_KEY, raw) ? 'written' : 'failed';
  }

  const loadResult = (state, source) => ({ state, source });
  /** 손상 결과(손상 v1 포함): backedUp은 keptAt에서 파생해 두 값이 어긋나지 않게 한다 */
  const corruptResult = (now, keptAt, earlierBackupAt) => ({
    state: defaultState(now),
    source: 'corrupt',
    backedUp: keptAt === CORRUPT_BACKUP_KEY,
    keptAt,
    earlierBackupAt,
  });

  /** 손상 v2 결과에는 백업 결과(backup)와 원문(raw)을 더한다: 백업이 실패하면 저장 관문이 그 원문을 지킨다 */
  function corruptV2Result(storage, raw, now) {
    const backup = backupCorrupt(storage, raw);
    const kept = backup === 'written' || backup === 'same';
    return Object.assign(
      corruptResult(now, kept ? CORRUPT_BACKUP_KEY : null, backup === 'occupied' ? CORRUPT_BACKUP_KEY : null),
      { backup, raw });
  }

  /**
   * 읽기 전용: 저장소의 v2 저장. 백업·마이그레이션 등 어떤 쓰기도 하지 않는다 (m1-storage AC 34).
   * 유효 → { state(정규화), corrupt:false } / 없음·'' → { state:null, corrupt:false } / 손상 → { state:null, corrupt:true, raw }
   */
  function peek(storage, now) {
    const raw = read(storage, C.SAVE_KEY);
    // 빈 문자열은 손상이 아니라 '저장 없음': 유효한 v1이 손상 처리에 가려지지 않게 한다
    if (isEmpty(raw)) return { state: null, corrupt: false };
    const d = parse(raw);
    return isObj(d) ? { state: normalize(d, now), corrupt: false } : { state: null, corrupt: true, raw };
  }

  /**
   * 로드 규칙: v2 → (없거나 빈 문자열이면) v1 마이그레이션 후 v2로 저장(v1 키는 남김) → 기본 상태.
   * source: 'v2' | 'v1' | 'new' | 'corrupt'
   * 읽을 수 없는 v2는 곧 새 게임으로 덮어쓰이므로 먼저 CORRUPT_BACKUP_KEY에 원문을 남긴다(backedUp).
   * keptAt: 이번 손상 원문이 남아 있는 키(v2 백업 키, 또는 덮어쓰지 않는 v1 키). 남지 않았으면 null
   * earlierBackupAt: 백업 키에 다른 이전 손상 원문이 있어 이번 원문을 보관하지 못했을 때 그 키, 아니면 null
   */
  function load(storage, now) {
    const v2 = peek(storage, now);
    if (v2.state) return loadResult(v2.state, 'v2');
    if (v2.corrupt) return corruptV2Result(storage, v2.raw, now);
    // legacy 키가 없으면(null — 테스트 페이지) v1을 아예 읽지 않는다. v1도 null·''이면 저장 없음(REQ-028)
    const raw1 = C.SAVE_KEY_V1 ? read(storage, C.SAVE_KEY_V1) : null;
    if (isEmpty(raw1)) return loadResult(defaultState(now), 'new');
    const d = parse(raw1);
    // 손상된 v1은 덮어쓰지 않으므로 원문은 v1 키에 그대로 남는다
    if (!isObj(d)) return corruptResult(now, C.SAVE_KEY_V1, null);
    const state = migrateV1(d, now);
    write(storage, C.SAVE_KEY, state);
    return loadResult(state, 'v1');
  }

  /** 저장할 때마다 오프라인 기준 시각을 갱신 */
  const touch = (S, now) => { S.idle.lastSeen = now; };
  function save(storage, S, now) {
    touch(S, now);
    return write(storage, C.SAVE_KEY, S);
  }

  /**
   * 저장 키 쓰기의 단일 관문 (m1-storage 저장 안전). 손상 원문의 백업이 실패하면 보호 모드가 되어
   * 그 원문(유일한 사본)을 덮어쓰지 않도록 모든 저장을 막는다. 게임 상태는 메모리에서 계속된다.
   */
  function createSaveKeeper(storage) {
    // 이미 처리한 손상 원문. guarding: 백업에 실패해 보호 중
    let corrupt = null;
    let lastFailed = false;
    const isProtected = () => !!corrupt && corrupt.guarding;

    /** 백업을 시도하고 결과로 보호 모드를 정한다. 결과는 backupCorrupt와 같다 */
    function guard(raw) {
      const backup = backupCorrupt(storage, raw);
      corrupt = { raw, guarding: backup === 'failed' };
      return backup;
    }

    return {
      isProtected,
      /** 보호 중인 손상 원문(복사용). 보호 모드가 아니면 null */
      guardedRaw: () => (isProtected() ? corrupt.raw : null),
      lastSaveFailed: () => lastFailed,
      /** 시작 로드: 손상 v2의 백업이 실패했으면 보호 모드로 시작한다 */
      load(now) {
        const r = load(storage, now);
        if (r.backup) corrupt = { raw: r.raw, guarding: r.backup === 'failed' };
        return r;
      },
      /**
       * 이어받기·복귀 때 저장소 확인. 처음 보는 손상 원문이면 다음 저장 전에 백업한다(backup: 그 결과, 아니면 null).
       * 저장 키에 손상 원문이 더 이상 없으면 지킬 사본도 없으므로 보호 모드를 끝낸다.
       */
      checkStored(now) {
        const stored = peek(storage, now);
        if (!stored.corrupt) {
          corrupt = null;
          return { state: stored.state, backup: null };
        }
        if (corrupt && corrupt.raw === stored.raw) return { state: null, backup: null };
        return { state: null, backup: guard(stored.raw) };
      },
      /** [백업 다시 시도]. 보호 모드가 아니면 null */
      retryBackup: () => (isProtected() ? guard(corrupt.raw) : null),
      /** [보존 포기하고 저장]: 보호를 풀어 다음 저장이 원문을 덮어쓰게 한다 */
      abandon() { if (corrupt) corrupt.guarding = false; },
      /** 결과: 'saved' | 'failed'(쓰기 실패) | 'blocked'(보호 모드라 쓰지 않음) */
      save(S, now) {
        if (isProtected()) {
          touch(S, now);   // 메모리 상태가 최신이므로, 오프라인 정산이 같은 구간을 다시 지급하지 않게 한다
          return 'blocked';
        }
        lastFailed = !save(storage, S, now);
        return lastFailed ? 'failed' : 'saved';
      },
    };
  }

  return { SAVE_VERSION, CORRUPT_BACKUP_KEY, defaultState, normalize, migrateV1, load, peek, save, createSaveKeeper };
});
