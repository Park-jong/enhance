/* 검 강화하기 — 데이터 블록 (M0 + M1 상수).
 * 식별자는 docs/design/m1-constants-index.md 이름 그대로 사용한다.
 * 브라우저: window.SG.C / node: module.exports
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  // 실행 설정: 기본값 위에, 이 파일보다 먼저 로드된 페이지 전용 설정(SG.config — 예: js/test-mode.js)을 덮는다.
  // saveKey·legacySaveKey는 여기서 한 번 상수로 굳고, forceSuccess는 실행 중에도 바꿀 수 있다(규칙이 호출 시점에 읽음).
  SG.config = Object.assign({
    saveKey: 'sword-enhance-v2',
    legacySaveKey: 'sword-enhance-v1',   // null이면 v1 저장을 읽지 않는다(마이그레이션 없음)
    forceSuccess: false,                  // true면 강화 성공 100% · 파괴 0% (테스트 페이지 전용)
  }, SG.config);
  SG.C = factory(SG.config);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.C;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config) {
  'use strict';

  // ---------------------------------------------------------------- M0
  const MAX = 20;

  // n: 이름, a: 날 밝은색, b: 날 어두운색, g: 오라 색
  const SWORDS = [
    { n: '낡은 목검',        a: '#d2a679', b: '#7a4f2a', g: null },
    { n: '녹슨 철검',        a: '#c09070', b: '#6e4a2f', g: null },
    { n: '견습 기사의 검',   a: '#dfe3e7', b: '#868e97', g: null },
    { n: '강철 롱소드',      a: '#f1f4f7', b: '#95a3af', g: null },
    { n: '기사단의 검',      a: '#f7f9fc', b: '#a2b2c4', g: '#dfe8ff' },
    { n: '은빛 세이버',      a: '#ffffff', b: '#b6c3d8', g: '#e4ecff' },
    { n: '푸른 달의 검',     a: '#d4e6ff', b: '#4f7bd9', g: '#6aa8ff' },
    { n: '화염의 검',        a: '#ffd27a', b: '#e0482a', g: '#ff6a2a' },
    { n: '서리 송곳니',      a: '#e8fcff', b: '#56c3e6', g: '#8fefff' },
    { n: '뇌명검',           a: '#fff8b8', b: '#d9b800', g: '#ffe94a' },
    { n: '용의 이빨',        a: '#f6ead0', b: '#b08a3e', g: '#ffb347' },
    { n: '그림자 절단자',    a: '#7a68a0', b: '#1d1630', g: '#8a5cff' },
    { n: '성기사의 대검',    a: '#fffbe8', b: '#e3b84f', g: '#ffe28a' },
    { n: '마수 사냥꾼',      a: '#ffa0a0', b: '#8c1020', g: '#ff3355' },
    { n: '별빛 검',          a: '#ece8ff', b: '#7a6bff', g: '#b6a8ff' },
    { n: '혼돈의 검',        a: '#ff86de', b: '#3a0d5c', g: '#ff3dd2' },
    { n: '천공검',           a: '#e2fff9', b: '#2fc4a8', g: '#6fffe0' },
    { n: '시간을 베는 검',   a: '#fff2da', b: '#c08a2a', g: '#ffd27a' },
    { n: '신을 벤 검',       a: '#ffffff', b: '#e01e1e', g: '#ff4040' },
    { n: '태초의 검',        a: '#ffffff', b: '#5fd8f0', g: '#c0f8ff' },
    { n: '무한의 검',        a: '#ffffff', b: '#ff5ad1', g: '#ffffff' },
  ];

  // 등급 표시: min 단계 이상이면 해당 등급 (위에서부터 검사)
  const RARITY = [
    { min: 20, name: '신화', color: '#ff4d6d' },
    { min: 18, name: '전설', color: '#ff9f1c' },
    { min: 15, name: '영웅', color: '#b36bff' },
    { min: 10, name: '희귀', color: '#4da3ff' },
    { min: 5,  name: '고급', color: '#4cd97b' },
    { min: 0,  name: '일반', color: '#9aa4b2' },
  ];
  const BANNER_LV = [10, 15, 18];          // 첫 도달 시 배너를 띄우는 단계

  // 인덱스 = 현재 단계. 다음 단계로 가는 확률(%)
  const RATE    = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 7, 5];
  const DESTROY = [ 0,  0,  0,  0,  0,  2,  3,  5,  7, 10, 12, 15, 18, 20, 23, 25, 28, 30, 33, 35];
  const DROP_FROM = 10;                    // 이 단계부터 실패 시 1단계 하락
  const BLESS_BONUS = 10;                  // 축복 주문서 성공률 보너스(%p)
  const HUNT_CD = 2500;                    // 수동 사냥 쿨다운(ms)

  // M0 가격식 계수: cost(l) / sell(l) / huntReward(l)
  const COST_BASE = 20, COST_GROWTH = 1.55, COST_MIN = 20;
  const SELL_BASE = 30, SELL_GROWTH = 1.85;
  const HUNT_SELL_RATIO = 0.03, HUNT_MIN = 10;
  const GOLD_ROUND = 10;                   // 가격은 10G 단위 반올림
  const SELL_CONFIRM_LV = 8;               // 이 단계 이상 판매/납품은 2회 클릭 확인
  const SELL_CONFIRM_MS = 2500;

  // ---------------------------------------------------------------- 1. 보관함 / 저장
  const SAVE_KEY = config.saveKey;
  const SAVE_KEY_V1 = config.legacySaveKey;
  const SLOT_START = 3;
  const SLOT_MAX = 8;
  const SLOT_EXPAND_COST = [3000, 10000, 30000, 80000, 200000];
  const NEW_SWORD_PRICE = 100;
  const STACK_MAX = 99;
  const START_GOLD = 300;
  const NO_ACTIVE_SWORD = 0;               // S.active 값: 활성 검 없음(파괴 직후). 검 id는 1부터라 겹치지 않는다
  // 보관함 칸 드래그(Pointer Events): 마우스는 이동 거리로 클릭과 구분, 터치는 길게 눌러야 시작(가로 스와이프 스크롤 유지)
  const DRAG_THRESHOLD_PX = 6;
  const DRAG_LONG_PRESS_MS = 300;
  const DRAG_EDGE_PX = 32;                 // 끄는 중 포인터가 스트립 가장자리 이 거리 안이면 그쪽으로 자동 스크롤
  const DRAG_SCROLL_STEP_PX = 12;

  // ---------------------------------------------------------------- 2. 보호권 / 파편
  const PROTECT_USES = 2;
  const PROTECT_NEED_DIV = 5;
  const SHARD_BASE_PER_LV = 1;
  const SHARD_BAND = 5;
  const SHARD_COST = { bless: 10, protect: 25, keepdown: 20, sure: 10, anvil_1: 20, anvil_2: 50 };

  // ---------------------------------------------------------------- 3. 실패 보정 / 확률 상한
  const PITY_BAND_WIDTH = 5;               // band = floor(l / 5): +0~4, +5~9, +10~14, +15~19
  const PITY_STEP = [1, 1, 2, 2];
  const PITY_MAX = [5, 6, 8, 10];
  const BONUS_CAP = [20, 20, 14, 14];
  const SUCC_CEIL = 90;

  // ---------------------------------------------------------------- 3.1 후반 강화 보정 (M1.1: 천장 게이지 + 성공 숙련)
  // 배열 인덱스 i = 단계 l - *_FROM (+15..+19). 값만 바꿔 튜닝한다(m1.1-late-correction §7)
  const GAUGE_FROM = 15;
  const GAUGE_N = [4, 5, 6, 8, 10];        // 가득 차는 비성공 횟수 → 다음 시도 확정 성공
  const GAUGE_TO = GAUGE_FROM + GAUGE_N.length - 1;
  const MASTERY_FROM = 15;
  const MASTERY_STEP = [3, 3, 3, 4, 5];    // 그 단계 성공 기록 1회당 %p
  const MASTERY_MAX = [12, 12, 12, 12, 10];
  const MASTERY_TO = MASTERY_FROM + MASTERY_STEP.length - 1;
  // 한쪽 배열만 늘리면 숙련 상한이 조용히 undefined(NaN 보너스)가 되므로 로드 시점에 막는다
  if (MASTERY_MAX.length !== MASTERY_STEP.length) {
    throw new Error('MASTERY_MAX and MASTERY_STEP must have the same length');
  }
  // 저장 기록 상한: 이보다 많은 성공은 보너스를 더 올리지 않는다 → [4, 4, 4, 3, 2]
  const MASTERY_REC_MAX = MASTERY_MAX.map((max, i) => Math.ceil(max / MASTERY_STEP[i]));

  // ---------------------------------------------------------------- 4. 모루 / 광석
  // 인덱스 = 등급 g (1..3). 0번은 "모루 없음"
  const ANVIL_BONUS = [0, 2, 3, 4];
  const ANVIL_DURA = [0, 30, 40, 50];
  const ANVIL_CRAFT = {
    1: { ore: { iron: 60 }, gold: 0 },
    2: { ore: { iron: 100, silver: 60 }, gold: 5000 },
    3: { ore: { silver: 150, mithril: 80 }, gold: 20000 },
  };
  const ANVIL_REPAIR = {
    1: { iron: 30 },
    2: { iron: 40, silver: 40 },
    3: { silver: 50, mithril: 50 },
  };
  const ANVIL_SHOP_PRICE = 3000;
  const ANVIL_OWN_MAX = 6;
  const ANVIL_TOGGLE_MIN_LV = 5;           // 트레이 모루 토글은 +5부터(낮은 단계 내구도 낭비 방지)
  const ORES = ['iron', 'silver', 'mithril'];
  const ORE_PER_HUNT = { iron: 2, silver: 1, mithril: 0.5 };
  const ORE_UNLOCK_LV = { iron: 0, silver: 7, mithril: 12 };
  const ORE_MAX = 9999;

  // ---------------------------------------------------------------- 5. 의뢰
  const QUEST_UNLOCK_BEST = 3;
  const QUEST_SLOTS = 3;
  const QUEST_TIERS = ['easy', 'normal', 'hard'];   // 슬롯 인덱스 → 난이도
  const QUEST_LV_EASY_DIV = 2;
  const QUEST_LV_NORMAL_OFFSET = 3;
  const QUEST_LV_HARD_OFFSET = 1;
  const QUEST_LV_MIN = { easy: 2, normal: 3, hard: 4 };
  const QUEST_GOLD_MULT = { easy: 1.3, normal: 1.5, hard: 1.8 };
  const QUEST_ITEM_CHANCE = { easy: 0.5, normal: 0.8, hard: 1.0 };
  // n이 문자열이면 의뢰 단계에 따른 수량식 이름(rules의 QUEST_QTY 참조)
  const QUEST_ITEM_POOL = {
    easy:   [{ id: 'bless', n: 2 }, { id: 'keepdown', n: 1 }, { id: 'shard', n: 'shardGain' }],
    normal: [{ id: 'protect', n: 1 }, { id: 'anvil_1', n: 1 }, { id: 'keepdown', n: 1 }, { id: 'sure', n: 1 }],
    hard:   [{ id: 'protect', n: 2 }, { id: 'anvil_2', n: 1 }, { id: 'sure', n: 2 }, { id: 'booster', n: 1 }, { id: 'seal', n: 1 }],
  };
  const QUEST_SHARD_MIN_LV = 5;            // 쉬움 파편 보상 = shardGain(max(5, lv))
  const QUEST_FALLBACK_SHARD_ITEM = { booster: 'protect', seal: 'protect' };  // 파편 가치 없는 품목의 대체 기준
  const QUEST_COOLDOWN_SEC = 300;
  const QUEST_REROLL_MIN = 200;            // QUEST_REROLL_COST = max(200, 3 × cost(best))
  const QUEST_REROLL_COST_MULT = 3;

  // ---------------------------------------------------------------- 6. 방치 / 연출 스킵
  const AUTO_UNLOCK_BEST = 5;
  const AUTO_CD_MS = 5000;
  const AUTO_COST_RATIO = 0.1;
  const AUTO_MIN = 10;
  const AUTO_CATCHUP_MAX = 20;
  const OFFLINE_CAP_H = 8;
  const OFFLINE_EFF = 0.25;
  const OFFLINE_MIN_SEC = 60;
  const UP_MAX = 5;
  const UP_SPEED_STEP = 400;
  const UP_GOLD_STEP = 0.10;
  const UP_OFFLINE_STEP_H = 1;
  const UP_COST_BASE = { speed: 3000, gold: 5000, offline: 4000 };
  const UP_COST_GROWTH = 2.2;
  const UPGRADES = [
    { id: 'speed',   name: '자동 사냥 속도' },
    { id: 'gold',    name: '수확 보너스' },
    { id: 'offline', name: '오프라인 저장고' },
  ];
  const SKIP_KEEP_LV = 15;
  const SKIP_KEEP_DESTROY_LV = 10;
  const SKIP_MIN_INTERVAL_MS = 250;
  const SKIP_RESULT_MS = 500;

  // ---------------------------------------------------------------- 7. 소모품
  const PRICE = { bless: 1500, protect: 4000, keepdown: 3000, sure: 1500, seal: 2000 };
  const BOOSTER_PRICE_MIN = 3000;          // boosterPrice(best) = max(3000, round(40 × huntReward(best) / 100) × 100)
  const BOOSTER_PRICE_HUNT_MULT = 40;
  const BOOSTER_PRICE_ROUND = 100;
  const KEEPDOWN_MAX_LV = 15;
  const SURE_MAX_TARGET = 10;
  const BOOSTER_MULT = 1.5;
  const BOOSTER_DURATION_MIN = 10;
  const BOOSTER_MAX_MIN = 60;
  const SEAL_MULT = 1.3;
  const CONSUMABLES = ['bless', 'protect', 'keepdown', 'sure', 'booster', 'seal'];
  const TRAY_TOGGLES = ['bless', 'anvil', 'protect', 'keepdown', 'sure'];   // 강화 시도용 토글(행 순서)

  // ---------------------------------------------------------------- 8. 해금
  const FORGE_UNLOCK_BEST = 5;
  const BOOSTER_SEAL_UNLOCK_BEST = 5;
  const UNLOCK = { quests: QUEST_UNLOCK_BEST, forge: FORGE_UNLOCK_BEST, idle: AUTO_UNLOCK_BEST };

  // ---------------------------------------------------------------- 아이템 정의 (데이터 주도)
  // kind: consumable(inv 스택) / anvil(장비 인스턴스) / shard(파편)
  const ITEMS = {
    bless:    { kind: 'consumable', name: '축복 주문서',     desc: '이번 강화 성공 확률 +10%p (사용 시 소모)' },
    protect:  { kind: 'consumable', name: '파괴 보호권',     desc: '파괴될 때 대신 소모 · 한 단계에서 최대 2회 (발동 시 소모)' },
    keepdown: { kind: 'consumable', name: '하락 방지 주문서', desc: '+10~+14에서 실패해도 하락하지 않음 (발동 시 소모)' },
    sure:     { kind: 'consumable', name: '확정 강화권',     desc: '+9 이하에서 성공 100% · 파괴 0% (사용 시 소모)' },
    booster:  { kind: 'consumable', name: '골드 부스터',     desc: '10분간 사냥·자동·오프라인 골드 ×1.5' },
    seal:     { kind: 'consumable', name: '감정 인장',       desc: '다음 판매 또는 납품 골드 ×1.3' },
    anvil_1:  { kind: 'anvil', g: 1, name: '철 모루' },
    anvil_2:  { kind: 'anvil', g: 2, name: '강철 모루' },
    anvil_3:  { kind: 'anvil', g: 3, name: '미스릴 모루' },
    shard:    { kind: 'shard', name: '파편' },
  };
  const ORE_NAMES = { iron: '철광석', silver: '은광석', mithril: '미스릴 광석' };

  // 상점 진열 (action: grant=보관, boost=즉시 적용)
  const SHOP_ITEMS = [
    { id: 'bless',    action: 'grant' },
    { id: 'protect',  action: 'grant' },
    { id: 'keepdown', action: 'grant' },
    { id: 'sure',     action: 'grant' },
    { id: 'booster',  action: 'boost', unlockBest: BOOSTER_SEAL_UNLOCK_BEST },
    { id: 'seal',     action: 'grant', unlockBest: BOOSTER_SEAL_UNLOCK_BEST },
    { id: 'anvil_1',  action: 'grant', unlockBest: FORGE_UNLOCK_BEST },
  ];

  // 아이콘·효과음 자리 (콘텐츠 팀 에셋이 오면 여기서 교체)
  const ICONS = {
    gold: '🪙', shard: '💠', iron: '🪨', silver: '🥈', mithril: '💎',
    bless: '✨', protect: '🛡️', keepdown: '⬇️', sure: '🎯', booster: '🚀', seal: '🔏',
    anvil: '🔨', anvil_1: '🔨', anvil_2: '⚒️', anvil_3: '🛠️',
    shop: '🛒', forge: '🔨', quests: '📜', idle: '⏳', records: '📊',
    lock: '🔒', deliver: '📦', pity: '⬆', auto: '⟳', settings: '⚙️', sword: '⚔️',
  };
  // 게임 아이콘 id → 콘텐츠 팀 SVG 키(assets/m1-icons.js, window.M1_ICONS). 없으면 ICONS 이모지 사용
  const ICON_ASSET_KEYS = {
    gold: 'gold', shard: 'shard', iron: 'ore_iron', silver: 'ore_silver', mithril: 'ore_mithril',
    bless: 'bless', protect: 'protect', keepdown: 'keepdown', sure: 'sure', booster: 'booster', seal: 'seal',
    anvil: 'anvil_1', anvil_1: 'anvil_1', anvil_2: 'anvil_2', anvil_3: 'anvil_3',
    shop: 'tab_shop', forge: 'tab_forge', quests: 'tab_quest', idle: 'tab_idle', records: 'tab_log',
    lock: 'lock', pity: 'pity', auto: 'auto_hunt', deliver: 'deliver', sword: 'sword', settings: 'settings',
  };

  return Object.freeze({
    MAX, SWORDS, RARITY, BANNER_LV, RATE, DESTROY, DROP_FROM, BLESS_BONUS, HUNT_CD,
    COST_BASE, COST_GROWTH, COST_MIN, SELL_BASE, SELL_GROWTH, HUNT_SELL_RATIO, HUNT_MIN, GOLD_ROUND,
    SELL_CONFIRM_LV, SELL_CONFIRM_MS,
    SAVE_KEY, SAVE_KEY_V1, SLOT_START, SLOT_MAX, SLOT_EXPAND_COST, NEW_SWORD_PRICE, STACK_MAX, START_GOLD,
    NO_ACTIVE_SWORD, DRAG_THRESHOLD_PX, DRAG_LONG_PRESS_MS, DRAG_EDGE_PX, DRAG_SCROLL_STEP_PX,
    PROTECT_USES, PROTECT_NEED_DIV, SHARD_BASE_PER_LV, SHARD_BAND, SHARD_COST,
    PITY_BAND_WIDTH, PITY_STEP, PITY_MAX, BONUS_CAP, SUCC_CEIL,
    GAUGE_FROM, GAUGE_TO, GAUGE_N, MASTERY_FROM, MASTERY_TO, MASTERY_STEP, MASTERY_MAX, MASTERY_REC_MAX,
    ANVIL_BONUS, ANVIL_DURA, ANVIL_CRAFT, ANVIL_REPAIR, ANVIL_SHOP_PRICE, ANVIL_OWN_MAX, ANVIL_TOGGLE_MIN_LV,
    ORES, ORE_PER_HUNT, ORE_UNLOCK_LV, ORE_MAX,
    QUEST_UNLOCK_BEST, QUEST_SLOTS, QUEST_TIERS, QUEST_LV_EASY_DIV, QUEST_LV_NORMAL_OFFSET, QUEST_LV_HARD_OFFSET,
    QUEST_LV_MIN, QUEST_GOLD_MULT, QUEST_ITEM_CHANCE, QUEST_ITEM_POOL, QUEST_SHARD_MIN_LV, QUEST_FALLBACK_SHARD_ITEM,
    QUEST_COOLDOWN_SEC, QUEST_REROLL_MIN, QUEST_REROLL_COST_MULT,
    AUTO_UNLOCK_BEST, AUTO_CD_MS, AUTO_COST_RATIO, AUTO_MIN, AUTO_CATCHUP_MAX,
    OFFLINE_CAP_H, OFFLINE_EFF, OFFLINE_MIN_SEC,
    UP_MAX, UP_SPEED_STEP, UP_GOLD_STEP, UP_OFFLINE_STEP_H, UP_COST_BASE, UP_COST_GROWTH, UPGRADES,
    SKIP_KEEP_LV, SKIP_KEEP_DESTROY_LV, SKIP_MIN_INTERVAL_MS, SKIP_RESULT_MS,
    PRICE, BOOSTER_PRICE_MIN, BOOSTER_PRICE_HUNT_MULT, BOOSTER_PRICE_ROUND, KEEPDOWN_MAX_LV, SURE_MAX_TARGET,
    BOOSTER_MULT, BOOSTER_DURATION_MIN, BOOSTER_MAX_MIN, SEAL_MULT, CONSUMABLES, TRAY_TOGGLES,
    FORGE_UNLOCK_BEST, BOOSTER_SEAL_UNLOCK_BEST, UNLOCK,
    ITEMS, ORE_NAMES, SHOP_ITEMS, ICONS, ICON_ASSET_KEYS,
  });
});
