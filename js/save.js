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
  const SEC_MS = 1000;
  const MIN_MS = 60 * SEC_MS;
  // 시간 이벤트 다음 스폰 임계값 범위(m2-events §10): 변조로 간격을 줄여도 최소 간격은 지킨다
  const EVENT_GAP_MIN_MS = C.EVENT_GAP_MIN_SEC * SEC_MS;
  const EVENT_GAP_MAX_MS = C.EVENT_GAP_MAX_SEC * SEC_MS;
  const STAT_KEYS = ['tries', 'success', 'fail', 'destroy', 'earned',
    'shardsGained', 'protectSaved', 'delivered', 'crafted', 'huntGold', 'offlineGold', 'sinkGold', 'traitRolls',
    'hunts', 'sells', 'autoRuns', 'dailyDone', 'dailyAll', 'rewardGold', 'eventsSeen'];
  const V1_STAT_KEYS = ['tries', 'success', 'fail', 'destroy', 'earned'];
  // 일일 과제 지표가 stats 키가 아니면 진행도가 NaN이 되므로 로드 시점에 막는다(풀 표 자체 검사는 constants.js)
  if (C.DAILY_POOL.some(e => !STAT_KEYS.includes(e.metric))) throw new Error('DAILY_POOL metric is not a stats key');
  const USE_KEYS = C.TRAY_TOGGLES.concat('seal');

  const zeros = keys => keys.reduce((o, k) => { o[k] = 0; return o; }, {});
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const obj = v => (isObj(v) ? v : {});
  const emptyDaily = maxDay => ({ maxDay, tasks: [], bonus: 0 });
  const defaultEvents = () => ({ active: null, sinceMs: 0, nextAtMs: EVENT_GAP_MIN_MS });

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
      swords: [{ id: 1, lv: 0, prot: C.PROTECT_USES, pity: 0, trait: null }],
      nextSwordId: 2,
      active: 1,
      slots: C.SLOT_START,
      gauge: C.GAUGE_N.map(() => 0),
      mastery: C.MASTERY_REC_MAX.map(() => 0),
      monuments: Array(C.MONUMENT_COUNT).fill(0),
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
      achievements: {},
      title: C.TITLE_NONE,
      daily: emptyDaily(0),
      events: defaultEvents(),
    };
  }

  // ------------------------------------------------------------ 필드별 보정
  function normFound(v) {
    const src = Array.isArray(v) ? v : [];
    return Array.from({ length: C.MAX + 1 }, (_, i) => i === 0 || src[i] === true);
  }

  /** 검 특성(m2-traits §10): 객체가 아니거나 알 수 없는 종류면 null, 등급은 1..TRAIT_TIER_MAX 정수. {k, t}만 남긴다 */
  function normTrait(v) {
    if (!isObj(v) || !R.traitDef(v.k)) return null;
    return { k: v.k, t: int(v.t, 1, 1, C.TRAIT_TIER_MAX) };
  }

  function normSwords(v) {
    const seen = new Set();
    return (Array.isArray(v) ? v : []).filter(isObj).map(s => ({
      id: int(s.id, 0, 0),
      lv: int(s.lv, 0, 0, C.MAX),
      prot: int(s.prot, C.PROTECT_USES, 0, C.PROTECT_USES),
      pity: int(s.pity, 0, 0),
      trait: normTrait(s.trait),
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

  /** 기념비 보유(m2-overview §D): 길이 MONUMENT_COUNT로 맞추고 칸마다 truthy면 1. S.best와의 일관성은 강제하지 않는다 */
  const normMonuments = v => Array.from({ length: C.MONUMENT_COUNT }, (_, i) => (Array.isArray(v) && v[i] ? 1 : 0));

  const normCounts = (v, keys, max) => keys.reduce((o, k) => { o[k] = int(obj(v)[k], 0, 0, max); return o; }, {});

  /** 업적 상태(m2-achievements §13): 업적 표에 있는 id만, 값 1..ACH_CLAIMED. 0·무효는 버린다(희소 객체) */
  function normAchievements(v) {
    const src = obj(v);
    return C.ACHIEVEMENTS.reduce((o, a) => {
      const state = R.hasOwn(src, a.id) ? int(src[a.id], 0, 0, C.ACH_CLAIMED) : 0;
      if (state > 0) o[a.id] = state;
      return o;
    }, {});
  }

  /** 칭호: 수령 완료한 업적 id만, 아니면 없음 */
  const normTitle = (v, achievements) =>
    (typeof v === 'string' && R.hasOwn(achievements, v) && achievements[v] === C.ACH_CLAIMED ? v : C.TITLE_NONE);

  /** 일일 과제 1개: 그 슬롯 풀의 항목이 아니면 null. base는 현재 지표값을 넘지 않는다(줄어든 평생 지표에서도 끝날 수 있게) */
  function normDailyTask(t, slot, stats) {
    if (!isObj(t) || typeof t.e !== 'string' || !R.hasOwn(C.DAILY_POOL_BY_ID, t.e)) return null;
    const entry = C.DAILY_POOL_BY_ID[t.e];
    if (entry.slot !== slot) return null;
    return {
      e: t.e,
      goal: int(t.goal, 1, 1, C.DAILY_GOAL_MAX),
      base: Math.min(int(t.base, 0, 0), stats[entry.metric]),
      item: C.DAILY_ITEM_KINDS.includes(t.item) ? t.item : null,
      claimed: t.claimed ? 1 : 0,
    };
  }

  /** 일일 세트: 과제가 정확히 DAILY_TASKS개이고 모두 유효할 때만 유지, 아니면 빈 세트(maxDay는 유지) */
  function normDaily(v, stats) {
    const d = obj(v);
    const maxDay = int(d.maxDay, 0, 0, C.DAILY_MAXDAY_CAP);
    const src = Array.isArray(d.tasks) && d.tasks.length === C.DAILY_TASKS ? d.tasks : [];
    const tasks = src.map((t, slot) => normDailyTask(t, slot, stats));
    if (tasks.length === 0 || tasks.includes(null)) return emptyDaily(maxDay);
    return { maxDay, tasks, bonus: d.bonus ? 1 : 0 };
  }

  /** 진행 중 시간 이벤트: 이벤트 표의 자기 속성 id만, 남은 시간은 그 이벤트 지속 시간 안. 0이면 만료로 보고 null. {id, remainMs}만 남긴다 */
  function normActiveEvent(v) {
    if (!isObj(v) || typeof v.id !== 'string' || !R.hasOwn(C.EVENTS, v.id)) return null;
    const remainMs = int(v.remainMs, 0, 0, C.EVENTS[v.id].durationSec * SEC_MS);
    return remainMs > 0 ? { id: v.id, remainMs } : null;
  }

  /** 시간 이벤트 상태(m2-events §10): 객체가 아니면 기본값, 아니면 세 필드를 각자 보정 */
  function normEvents(v) {
    if (!isObj(v)) return defaultEvents();
    return {
      active: normActiveEvent(v.active),
      sinceMs: int(v.sinceMs, 0, 0, EVENT_GAP_MAX_MS),
      nextAtMs: int(v.nextAtMs, EVENT_GAP_MIN_MS, EVENT_GAP_MIN_MS, EVENT_GAP_MAX_MS),
    };
  }

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
    S.monuments = normMonuments(d.monuments);

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
    S.achievements = normAchievements(d.achievements);
    S.title = normTitle(d.title, S.achievements);
    S.daily = normDaily(d.daily, S.stats);
    S.events = normEvents(d.events);

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
  /** 읽기 예외를 '저장 없음'(null)과 구분한다: { raw } 또는 { failed: true } */
  function tryRead(storage, key) {
    try { return { raw: storage.getItem(key) }; } catch (e) { return { failed: true }; }
  }
  function read(storage, key) {
    const got = tryRead(storage, key);
    return got.failed ? null : got.raw;
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
   * 읽기 예외 → { state:null, corrupt:false, readFailed:true } (저장 없음으로 보지 않도록 표시만 더한다)
   */
  function peek(storage, now) {
    const got = tryRead(storage, C.SAVE_KEY);
    if (got.failed) return { state: null, corrupt: false, readFailed: true };
    const raw = got.raw;
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

    /** 손상 원문과 그 백업 결과를 기억하고 보호 모드를 정한다(백업 실패 = 보호). backup을 그대로 돌려준다 */
    function remember(raw, backup) {
      corrupt = { raw, guarding: backup === 'failed' };
      return backup;
    }
    /** 백업을 시도하고 결과로 보호 모드를 정한다. 결과는 backupCorrupt와 같다 */
    const guard = raw => remember(raw, backupCorrupt(storage, raw));

    return {
      isProtected,
      /** 보호 중인 손상 원문(복사용). 보호 모드가 아니면 null */
      guardedRaw: () => (isProtected() ? corrupt.raw : null),
      lastSaveFailed: () => lastFailed,
      /** 시작 로드: 손상 v2의 백업이 실패했으면 보호 모드로 시작한다 */
      load(now) {
        const r = load(storage, now);
        if (r.backup) remember(r.raw, r.backup);
        return r;
      },
      /**
       * 이어받기·복귀 때 저장소 확인. 처음 보는 손상 원문이면 다음 저장 전에 백업한다(backup: 그 결과, 아니면 null).
       * 저장 키에 손상 원문이 더 이상 없으면 지킬 사본도 없으므로 보호 모드를 끝낸다.
       * 읽기 자체가 실패하면 원문이 사라졌는지 알 수 없으므로 아무것도 바꾸지 않는다(보호 유지, 이어받기 없음).
       */
      checkStored(now) {
        const stored = peek(storage, now);
        if (stored.readFailed) return { state: null, backup: null };
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
