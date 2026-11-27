/* 검 강화하기 — 데이터 블록 (M0~M2 상수).
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

  // 화면(설정 팝오버)에 보이는 게임 버전. 루트 VERSION 파일과 같아야 한다(tests/run-tests.js가 비교)
  const VERSION = '1.1.0';

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
  const MAX_PARTICLES = 400;               // 동시에 그리는 파티클 상한(연타 시 프레임 저하 방지). 한 번의 최대 버스트는 140개

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

  // ---------------------------------------------------------------- M2-A. 검 랜덤 특성 (F14, m2-traits §12)
  const PERCENT = 100;                     // %p 정수 배율의 분모: x × (PERCENT + v) / PERCENT (m2-traits §3.1)
  const TRAIT_ROLL_LV = 5;                 // 이 단계 이상이 되면 자동·무료 각인
  const TRAIT_KINDS = ['hunt', 'work', 'trade', 'ore', 'shard', 'anvil'];   // 롤·UI 순서
  const TRAIT_KIND_WEIGHT = { hunt: 20, work: 15, trade: 20, ore: 15, shard: 15, anvil: 15 };
  const TRAIT_TIER_WEIGHT = [70, 25, 5];   // 등급 1·2·3 (%)
  const TRAIT_TIER_MAX = 3;
  // income: 수입형(최고 단계 검들 중 종류별 최댓값만 적용, m2-traits §4). false면 거래형('이 검'에만 적용)
  const TRAITS = {
    hunt:  { name: '약탈자',   short: '약', values: [10, 20, 30], income: true },
    work:  { name: '일꾼',     short: '일', values: [15, 30, 45], income: true },
    trade: { name: '상인',     short: '상', values: [10, 20, 30], income: false },
    ore:   { name: '광부',     short: '광', values: [20, 40, 60], income: true },
    shard: { name: '수집가',   short: '집', values: [15, 30, 50], income: false },
    anvil: { name: '대장장이', short: '장', values: [15, 30, 45], income: false },
  };
  const TRAIT_TIER_NAME = ['평범한', '정교한', '완벽한'];
  // 후반 골드 사용처 (m2-overview §C·§E). 가격 = roundTo(배수 × huntReward(기준 단계), TRAIT_PRICE_ROUND)
  const TRAIT_MGMT_UNLOCK_BEST = 13;
  const TRAIT_PRICE_ROUND = 100;
  const TRAIT_REKIND_MULT = 80;
  const TRAIT_TIER_UP_MULT = [200, 500];   // 인덱스 = 현재 등급 - 1
  const MONUMENT_FROM = 13;
  const MONUMENT_COUNT = 8;
  const MONUMENT_MULT = 150;
  // 롤 함수는 종류·등급 표가 서로 맞는다고 가정하고(누락 시 조용히 다른 분포) 화면은 income 구분을 읽으므로 로드 시점에 막는다
  if (TRAIT_TIER_WEIGHT.length !== TRAIT_TIER_MAX || TRAIT_TIER_UP_MULT.length !== TRAIT_TIER_MAX - 1 ||
      TRAIT_KINDS.some(k => !TRAITS[k] || !TRAIT_KIND_WEIGHT[k] || TRAITS[k].values.length !== TRAIT_TIER_MAX || typeof TRAITS[k].income !== 'boolean')) {
    throw new Error('TRAIT_* tables are inconsistent');
  }
  if (MONUMENT_COUNT !== MAX - MONUMENT_FROM + 1) throw new Error('MONUMENT_COUNT must equal MAX - MONUMENT_FROM + 1');

  // ---------------------------------------------------------------- M2-B. 업적·칭호·일일 과제 (F12, m2-achievements §14)
  const byId = list => list.reduce((o, e) => { o[e.id] = e; return o; }, {});
  const ACH_ROUND = 10;                    // 업적·일일 골드 반올림 단위(G)
  const ACH_EARLY_BEST = 13;               // S.best가 이 값 미만이면 골드를 ACH_EARLY_PCT%로 지급
  const ACH_EARLY_PCT = 50;
  const ACH_REACHED = 1;                   // achievements[id]: 없음 = 미달성, 1 = 달성(받기 가능), 2 = 수령 완료
  const ACH_CLAIMED = 2;
  const SELL_COUNT_MIN_LV = 5;             // stats.sells에 세는 최소 검 단계
  const TITLE_NONE = '';
  // 지표 분류: stat = S.stats[이름], best = S.best, derived = achievements.js의 파생 함수
  const ACH_METRICS = {
    tries: 'stat', success: 'stat', destroy: 'stat', hunts: 'stat', delivered: 'stat', sinkGold: 'stat',
    traitRolls: 'stat', dailyDone: 'stat', best: 'best',
    monumentCount: 'derived', traitKindCount: 'derived', hasPerfectTrait: 'derived',
  };
  // [id, track, tier, 이름, 칭호, 지표, 목표, 골드 k, 파편 m, 광석]. hasPerfectTrait는 참이면 1
  const ACHIEVEMENTS = [
    ['tries_1', 'tries', 1, '첫 단련', '견습 대장장이', 'tries', 100, 1, 0],
    ['tries_2', 'tries', 2, '끝없는 망치질', '숙련 대장장이', 'tries', 1000, 3, 1],
    ['tries_3', 'tries', 3, '불꽃의 장인', '전설의 대장장이', 'tries', 5000, 6, 2],
    ['succ_1', 'succ', 1, '성공의 맛', '행운의 손', 'success', 50, 1, 0],
    ['succ_2', 'succ', 2, '단단한 손맛', '명장의 손', 'success', 500, 3, 1],
    ['succ_3', 'succ', 3, '필승의 대장장이', '백전백승', 'success', 2500, 6, 2],
    ['best_1', 'best', 1, '희귀한 검', '희귀 감정사', 'best', 10, 1, 0],
    ['best_2', 'best', 2, '영웅의 검', '영웅 대장장이', 'best', 15, 4, 1],
    ['best_3', 'best', 3, '무한의 검', '신화를 벼린 자', 'best', 20, 8, 2],
    ['dest_1', 'dest', 1, '첫 파괴', '깨진 검의 증인', 'destroy', 1, 1, 0],
    ['dest_2', 'dest', 2, '잿더미 속에서', '오뚝이', 'destroy', 25, 3, 1],
    ['dest_3', 'dest', 3, '파편의 왕', '폐허의 군주', 'destroy', 100, 5, 2],
    ['hunt_1', 'hunt', 1, '사냥 입문', '초보 사냥꾼', 'hunts', 100, 1, 0],
    ['hunt_2', 'hunt', 2, '단골 사냥터', '베테랑 사냥꾼', 'hunts', 1000, 3, 1, { iron: 40 }],
    ['hunt_3', 'hunt', 3, '사냥터의 주인', '사냥왕', 'hunts', 5000, 6, 2, { silver: 40 }],
    ['dlv_1', 'dlv', 1, '첫 납품', '심부름꾼', 'delivered', 5, 1, 0],
    ['dlv_2', 'dlv', 2, '믿음직한 거래처', '단골 납품업자', 'delivered', 25, 3, 1, { iron: 30 }],
    ['dlv_3', 'dlv', 3, '왕실 납품업자', '납품왕', 'delivered', 100, 6, 1, { silver: 30 }],
    ['sink_1', 'sink', 1, '첫 투자', '후원자', 'sinkGold', 500000, 3, 0],
    ['sink_2', 'sink', 2, '아낌없는 손', '큰손', 'sinkGold', 10000000, 6, 0],
    ['sink_3', 'sink', 3, '황금의 강', '재벌', 'sinkGold', 100000000, 10, 0],
    ['trt_1', 'trt', 1, '첫 각인', '각인사', 'traitRolls', 1, 1, 0],
    ['trt_2', 'trt', 2, '각인 수집가', '각인 장인', 'traitRolls', 5, 3, 1],
    ['trt_3', 'trt', 3, '운명의 주사위', '각인의 달인', 'traitRolls', 20, 5, 2],
    ['knd_1', 'knd', 1, '세 가지 재능', '재능 수집가', 'traitKindCount', 3, 1, 0],
    ['knd_2', 'knd', 2, '다재다능', '다재다능', 'traitKindCount', 5, 3, 1],
    ['knd_3', 'knd', 3, '여섯 빛깔', '전종 수집가', 'traitKindCount', 6, 6, 2],
    ['mon_1', 'mon', 1, '첫 기념비', '기념비 건립자', 'monumentCount', 1, 3, 0],
    ['mon_2', 'mon', 2, '기념비의 숲', '기념비 수호자', 'monumentCount', 4, 6, 1],
    ['mon_3', 'mon', 3, '모든 기념비', '기념비의 주인', 'monumentCount', 8, 10, 2],
    ['day_1', 'day', 1, '성실한 하루', '성실한 사람', 'dailyDone', 10, 1, 0],
    ['day_2', 'day', 2, '꾸준한 습관', '꾸준한 사람', 'dailyDone', 50, 3, 1],
    ['day_3', 'day', 3, '일과의 달인', '일과의 달인', 'dailyDone', 200, 6, 2],
    ['perfect', 'perfect', 1, '완벽한 각인', '완벽주의자', 'hasPerfectTrait', 1, 2, 1],
  ].map(([id, track, tier, name, title, metric, need, k, shard, ore]) =>
    ({ id, track, tier, name, title, metric, need, k, shard, ore: ore || null }));
  const ACH_BY_ID = byId(ACHIEVEMENTS);

  const DAILY_UNLOCK_BEST = 5;
  const DAILY_RESET_HOUR = 4;              // 지역 시간 04:00에 새 날
  const DAY_MS = 86400000;
  const DAILY_TASKS = 3;                   // 슬롯 0 ★, 1 ★★, 2 ★★★
  const DAILY_BANDS = [5, 10, 15, 20];     // 목표 밴드 하한(best)
  // goals: 밴드별 목표, mult: 밴드별 huntReward(best) 배수. gate: achievements.js DAILY_GATES 이름(없으면 항상 후보)
  const DAILY_POOL = [
    { id: 'hunt_s',  slot: 0, metric: 'hunts',     goals: [10, 15, 20, 25] },
    { id: 'auto_s',  slot: 0, metric: 'autoRuns',  goals: [12, 18, 24, 36] },
    { id: 'tries_s', slot: 0, metric: 'tries',     goals: [8, 10, 12, 15] },
    { id: 'succ_m',  slot: 1, metric: 'success',   goals: [3, 4, 4, 4] },
    { id: 'gold_m',  slot: 1, metric: 'huntGold',  mult: [20, 25, 30, 30] },
    { id: 'sell_m',  slot: 1, metric: 'sells',     goals: [2, 3, 3, 4] },
    { id: 'craft_m', slot: 1, metric: 'crafted',   goals: [1, 1, 1, 1], gate: 'anvilRoom' },
    { id: 'dlv_l',   slot: 2, metric: 'delivered', goals: [1, 1, 1, 2] },
    { id: 'hunt_l',  slot: 2, metric: 'hunts',     goals: [30, 45, 60, 80] },
    { id: 'tries_l', slot: 2, metric: 'tries',     goals: [15, 20, 25, 30] },
  ];
  const DAILY_POOL_BY_ID = byId(DAILY_POOL);
  const DAILY_TASK_K = [2, 3, 5];          // ★/★★/★★★ 골드 배수
  const DAILY_ALL_K = 6;                   // 3개 달성 보너스 골드 배수
  const DAILY_ALL_SHARD_MULT = 2;          // 보너스 파편 = 배수 × shardGain
  const DAILY_ITEM_CHANCE_PCT = 40;
  const DAILY_ITEM_KINDS = ['shard', 'ore'];   // 과제 아이템 종류(생성 rng 3번째 값의 인덱스)
  const DAILY_ITEM_SHARD_MULT = 1;         // 파편 아이템 = 배수 × shardGain
  const DAILY_ORE_N = 20;
  const DAILY_GOAL_MAX = 1e12;
  const DAILY_MAXDAY_CAP = 1000000;
  // 생성 알고리즘은 빈 후보가 없다고 가정하므로(빈 후보 = undefined 과제) 로드 시점에 막는다: id 중복 없음, 표 길이 일치,
  // 슬롯마다 앞 슬롯 항목들의 지표와 겹치지 않는 게이트 없는 항목 1개 이상(앞 슬롯이 무엇을 뽑아도 후보가 남는다).
  // 게이트 이름은 achievements.js, 지표 이름(stats 키)은 save.js가 로드 시점에 검사한다
  const earlierSlotMetrics = slot => DAILY_POOL.filter(e => e.slot < slot).map(e => e.metric);
  const hasSafeEntry = slot => DAILY_POOL.some(e => e.slot === slot && !e.gate && !earlierSlotMetrics(slot).includes(e.metric));
  if (ACHIEVEMENTS.length !== Object.keys(ACH_BY_ID).length || DAILY_POOL.length !== Object.keys(DAILY_POOL_BY_ID).length ||
      DAILY_TASK_K.length !== DAILY_TASKS ||
      DAILY_POOL.some(e => (e.goals || e.mult).length !== DAILY_BANDS.length) ||
      DAILY_TASK_K.some((_, slot) => !hasSafeEntry(slot))) {
    throw new Error('ACHIEVEMENTS / DAILY_* tables are inconsistent');
  }

  // ---------------------------------------------------------------- M2-C. 시간 이벤트 (F13, m2-events §11)
  const PERCENT_SQ = PERCENT * PERCENT;    // 1/10000 단위 정수 확률의 분모: (100+a) × (100+b)처럼 %p 두 개를 곱한 값 (m2-events §5.3)
  const EVENT_UNLOCK_BEST = 5;
  const EVENT_DT_MAX_MS = 2000;            // 틱당 반영하는 최대 dt (TICK 500ms의 4배)
  const EVENT_GAP_MIN_SEC = 900;           // 직전 종료 후 다음 스폰까지 활성 플레이(초). 첫 이벤트도 이 값
  const EVENT_GAP_MAX_SEC = 1800;
  const EVENT_LUCK_MIN_LV = 5;             // 행운의 시간이 적용되는 활성 검 단계 범위
  const EVENT_LUCK_MAX_LV = 19;
  const EVENT_WEIGHT_TOTAL = 100;
  const EVENT_DUTY_GAP_DIV = 3;            // durationSec ≤ GAP_MIN / 3 ⇔ 최대 가동률 D / (D + GAP_MIN) ≤ 25% (m2-events §6.3)
  const EVENT_ORE_VALUE_STEP = 10;         // 광맥 값이 이 배수여야 rate1e4 = (rate × SCALE)(100+광부)(100+이벤트) / SCALE가 정수
  const EVENT_ORE_SCALE = 2;               // ORE_PER_HUNT(0.5 단위)를 정수로 만드는 배수 (m2-events §5.3-3)
  const EVENT_IDS = ['luck', 'hunt', 'auto', 'ore', 'anvil', 'quest'];   // 가중치 누적·UI 순서
  // icon: 토스트·로그(textContent)용 이모지 폴백. 칩·팝오버는 ic('event_<id>')의 SVG를 쓴다. desc: 효과 문장(값 v로 만든다).
  // need: 스폰 추가 조건 이름(events.js EVENT_NEEDS), 없으면 null.
  // incomeLabel: 수입 줄(#incomeNote)에 " · 이벤트 <짧은 이름> +v%"로 붙는 수입 이벤트의 짧은 이름, 수입 이벤트가 아니면 null
  const eventEntry = (icon, name, weight, minBest, durationSec, value, desc, extra = {}) =>
    ({ icon, name, weight, minBest, durationSec, value, desc: desc(value), need: extra.need || null, incomeLabel: extra.incomeLabel || null });
  const EVENTS = {
    luck:  eventEntry('🍀', '행운의 시간', 12, 5, 300, 5, v => `강화 성공 확률 +${v}%p`),
    hunt:  eventEntry('🏹', '사냥 대목', 24, 13, 300, 40, v => `수동 사냥 골드 +${v}%`, { incomeLabel: '사냥' }),
    auto:  eventEntry('🌾', '자동 풍년', 18, 13, 300, 50, v => `자동 사냥 골드 +${v}%`, { need: 'autoOn', incomeLabel: '자동' }),
    ore:   eventEntry('⛏️', '광맥 발견', 16, 5, 300, 50, v => `사냥당 광석 +${v}%`),
    anvil: eventEntry('💫', '모루 가호', 16, 5, 300, 40, v => `모루로 강화할 때 ${v}% 확률로 내구도 보존`, { need: 'hasAnvil' }),
    quest: eventEntry('🏷️', '의뢰소 특가', 14, 5, 300, 50, v => `의뢰 새로고침 비용 −${v}%`),
  };
  // 스폰·효과 코드는 아래 성질을 전제로 하므로(누락 id = undefined 정의, 가동률 25% 상한, 광석 정수 계산) 로드 시점에 막는다
  // 집합으로 같아야 한다: EVENT_IDS 항목은 서로 다르고, 양쪽이 서로의 항목을 모두 포함한다
  const eventKeys = Object.keys(EVENTS);
  if (new Set(EVENT_IDS).size !== EVENT_IDS.length || eventKeys.length !== EVENT_IDS.length ||
      EVENT_IDS.some(id => !eventKeys.includes(id)) || eventKeys.some(k => !EVENT_IDS.includes(k))) {
    throw new Error('EVENT_IDS must equal the EVENTS keys as a set (no duplicates)');
  }
  if (EVENT_IDS.reduce((s, id) => s + EVENTS[id].weight, 0) !== EVENT_WEIGHT_TOTAL) {
    throw new Error('EVENTS weights must sum to EVENT_WEIGHT_TOTAL');
  }
  if (EVENT_IDS.some(id => EVENTS[id].durationSec > EVENT_GAP_MIN_SEC / EVENT_DUTY_GAP_DIV)) {
    throw new Error('EVENTS durationSec must be <= EVENT_GAP_MIN_SEC / EVENT_DUTY_GAP_DIV');
  }
  if (EVENTS.ore.value % EVENT_ORE_VALUE_STEP !== 0 || ORES.some(k => !Number.isInteger(ORE_PER_HUNT[k] * EVENT_ORE_SCALE))) {
    throw new Error('EVENTS.ore.value must be a multiple of EVENT_ORE_VALUE_STEP and ORE_PER_HUNT x EVENT_ORE_SCALE integers');
  }
  if (EVENT_GAP_MIN_SEC >= EVENT_GAP_MAX_SEC) throw new Error('EVENT_GAP_MIN_SEC must be < EVENT_GAP_MAX_SEC');
  if (EVENT_LUCK_MAX_LV > MAX - 1) throw new Error('EVENT_LUCK_MAX_LV must be <= MAX - 1');

  // ---------------------------------------------------------------- M2-D. 환생·명성 (F11, m2-rebirth §2·§4)
  // 의식 비용 = roundTo(REBIRTH_FEE_MULT × huntReward(MAX), REBIRTH_FEE_ROUND). huntReward가 rules.js에 있어 값은 rebirth.js가 만든다
  const REBIRTH_FEE_MULT = 100;
  const REBIRTH_FEE_ROUND = 100;
  const FAME_PER_REBIRTH = 5;
  const MASTERY_KEEP_REC = 1;              // 환생 후 단계별 숙련 기록 상한
  const EARLY_INCOME_MAX_LV = 12;          // 초반 수입(income) 효과가 적용되는 topLv 상한
  const REBIRTH_COUNT_MAX = 1e6;           // 저장 정규화 상한(rebirth.count·fame). 런타임 증가도 같은 상한에서 멈춘다(V8)
  const FAME_MAX = 1e9;
  // values[lv-1] = 그 레벨의 누적 값, costs[lv-1] = 그 레벨 구매 비용(명성). 키 순서 = UI 순서.
  // 성공 확률 항은 없다(§9). destroyCut·dropCut은 succ가 정해진 뒤 파괴·하락 몫만 상대 %로 덜어 낸다(§15.3)
  const FAME_SHOP = {
    destroyCut: { name: '파괴 저항', values: [15, 25, 35, 45], costs: [1, 1, 2, 3] },
    dropCut:    { name: '하락 저항', values: [15, 25, 35, 45], costs: [1, 1, 2, 3] },
    startGold:  { name: '여유 자금', values: [3000, 8000, 20000, 50000], costs: [1, 1, 2, 3] },
    income:     { name: '초반 수완', values: [6, 12, 18, 25], costs: [1, 2, 3, 4] },
    slots:      { name: '넉넉한 보관함', values: [1, 2], costs: [2, 3] },
    autoStart:  { name: '자동 사냥 면허', values: [1], costs: [3] },
  };
  const FAME_TRACKS = Object.keys(FAME_SHOP);
  // 레벨·정규화 상한이 values/costs 길이에 묶이고, 시작 칸이 SLOT_MAX를 넘으면 환생 결과가 정규화에서 잘린다
  if (FAME_TRACKS.some(k => FAME_SHOP[k].values.length < 1 || FAME_SHOP[k].values.length !== FAME_SHOP[k].costs.length) ||
      MASTERY_KEEP_REC < 0 || FAME_PER_REBIRTH < 1 || SLOT_START + Math.max(...FAME_SHOP.slots.values) > SLOT_MAX) {
    throw new Error('REBIRTH / FAME_SHOP constants are inconsistent');
  }
  // 100% 이상이면 dest가 0이 되어 보호 토글 판정(DESTROY[lv] > 0)이 깨지고, 순증가가 아니면 상점 '지금 → 다음'이 거꾸로 간다(§2)
  const FAME_CUT_MIN = 1;
  const FAME_CUT_MAX = 99;
  const isCutTable = v => v.every((x, i) => Number.isInteger(x) && x >= FAME_CUT_MIN && x <= FAME_CUT_MAX && (i === 0 || x > v[i - 1]));
  if (!isCutTable(FAME_SHOP.destroyCut.values) || !isCutTable(FAME_SHOP.dropCut.values)) {
    throw new Error('FAME_SHOP destroyCut / dropCut values must be strictly increasing integers in 1..99');
  }

  // ---------------------------------------------------------------- 아이템 정의 (데이터 주도)
  // kind: consumable(inv 스택) / anvil(장비 인스턴스) / shard(파편)
  const ITEMS = {
    bless:    { kind: 'consumable', name: '축복 주문서',     desc: `이번 강화 성공 확률 +${BLESS_BONUS}%p (사용 시 소모)` },
    protect:  { kind: 'consumable', name: '파괴 보호권',     desc: `파괴될 때 대신 소모 · 한 단계에서 최대 ${PROTECT_USES}회 (발동 시 소모)` },
    keepdown: { kind: 'consumable', name: '하락 방지 주문서', desc: `+${DROP_FROM}~+${KEEPDOWN_MAX_LV - 1}에서 실패해도 하락하지 않음 (발동 시 소모)` },
    sure:     { kind: 'consumable', name: '확정 강화권',     desc: `+${SURE_MAX_TARGET - 1} 이하에서 성공 100% · 파괴 0% (사용 시 소모)` },
    booster:  { kind: 'consumable', name: '골드 부스터',     desc: `${BOOSTER_DURATION_MIN}분간 사냥·자동·오프라인 골드 ×${BOOSTER_MULT}` },
    seal:     { kind: 'consumable', name: '감정 인장',       desc: `다음 판매 또는 납품 골드 ×${SEAL_MULT}` },
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

  // 아이콘 이모지 폴백(SVG가 없거나 textContent에 쓸 때). SVG는 ICON_ASSET_KEYS가 가리킨다.
  const ICONS = {
    gold: '🪙', shard: '💠', iron: '🪨', silver: '🥈', mithril: '💎',
    bless: '✨', protect: '🛡️', keepdown: '⬇️', sure: '🎯', booster: '🚀', seal: '🔏',
    anvil: '🔨', anvil_1: '🔨', anvil_2: '⚒️', anvil_3: '🛠️',
    shop: '🛒', forge: '🔨', quests: '📜', idle: '⏳', records: '📊',
    lock: '🔒', deliver: '📦', pity: '⬆', auto: '⟳', settings: '⚙️', sword: '⚔️', monument: '🏛️', fame: '🌟',
    rebirth: '♻️', achievement: '🏆', title: '📛', sure_badge: '✅', mastery: '🎖️',
    // trait_*는 폴백 이모지가 없다: SVG가 없으면 칩이 TRAITS[k].short 글자로 돌아간다
    ...Object.fromEntries(EVENT_IDS.map(id => ['event_' + id, EVENTS[id].icon])),
  };
  // 게임 아이콘 id → SVG 키(assets/m1-icons.js·m2-icons.js, window.M1_ICONS·M2_ICONS). 없으면 ICONS 이모지 사용
  const ICON_ASSET_KEYS = {
    gold: 'gold', shard: 'shard', iron: 'ore_iron', silver: 'ore_silver', mithril: 'ore_mithril',
    bless: 'bless', protect: 'protect', keepdown: 'keepdown', sure: 'sure', booster: 'booster', seal: 'seal',
    anvil: 'anvil_1', anvil_1: 'anvil_1', anvil_2: 'anvil_2', anvil_3: 'anvil_3',
    shop: 'tab_shop', forge: 'tab_forge', quests: 'tab_quest', idle: 'tab_idle', records: 'tab_log',
    lock: 'lock', pity: 'pity', auto: 'auto_hunt', deliver: 'deliver', sword: 'sword', settings: 'settings',
    fame: 'fame', rebirth: 'rebirth', monument: 'monument', achievement: 'achievement', title: 'title',
    sure_badge: 'sure_badge', mastery: 'mastery',
    ...Object.fromEntries(TRAIT_KINDS.map(k => ['trait_' + k, 'trait_' + k])),
    ...Object.fromEntries(EVENT_IDS.map(id => ['event_' + id, 'event_' + id])),
  };

  return Object.freeze({
    VERSION,
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
    SKIP_KEEP_LV, SKIP_KEEP_DESTROY_LV, SKIP_MIN_INTERVAL_MS, SKIP_RESULT_MS, MAX_PARTICLES,
    PRICE, BOOSTER_PRICE_MIN, BOOSTER_PRICE_HUNT_MULT, BOOSTER_PRICE_ROUND, KEEPDOWN_MAX_LV, SURE_MAX_TARGET,
    BOOSTER_MULT, BOOSTER_DURATION_MIN, BOOSTER_MAX_MIN, SEAL_MULT, CONSUMABLES, TRAY_TOGGLES,
    FORGE_UNLOCK_BEST, BOOSTER_SEAL_UNLOCK_BEST, UNLOCK,
    PERCENT, TRAIT_ROLL_LV, TRAIT_KINDS, TRAIT_KIND_WEIGHT, TRAIT_TIER_WEIGHT, TRAIT_TIER_MAX, TRAITS, TRAIT_TIER_NAME,
    TRAIT_MGMT_UNLOCK_BEST, TRAIT_PRICE_ROUND, TRAIT_REKIND_MULT, TRAIT_TIER_UP_MULT,
    MONUMENT_FROM, MONUMENT_COUNT, MONUMENT_MULT,
    ACH_ROUND, ACH_EARLY_BEST, ACH_EARLY_PCT, ACH_REACHED, ACH_CLAIMED, SELL_COUNT_MIN_LV, TITLE_NONE,
    ACH_METRICS, ACHIEVEMENTS, ACH_BY_ID,
    DAILY_UNLOCK_BEST, DAILY_RESET_HOUR, DAY_MS, DAILY_TASKS, DAILY_BANDS, DAILY_POOL, DAILY_POOL_BY_ID,
    DAILY_TASK_K, DAILY_ALL_K, DAILY_ALL_SHARD_MULT, DAILY_ITEM_CHANCE_PCT, DAILY_ITEM_KINDS, DAILY_ITEM_SHARD_MULT, DAILY_ORE_N, DAILY_GOAL_MAX, DAILY_MAXDAY_CAP,
    PERCENT_SQ, EVENT_UNLOCK_BEST, EVENT_DT_MAX_MS, EVENT_GAP_MIN_SEC, EVENT_GAP_MAX_SEC, EVENT_LUCK_MIN_LV, EVENT_LUCK_MAX_LV,
    EVENT_WEIGHT_TOTAL, EVENT_ORE_VALUE_STEP, EVENT_ORE_SCALE, EVENT_IDS, EVENTS,
    REBIRTH_FEE_MULT, REBIRTH_FEE_ROUND, FAME_PER_REBIRTH, MASTERY_KEEP_REC, EARLY_INCOME_MAX_LV, REBIRTH_COUNT_MAX, FAME_MAX,
    FAME_SHOP, FAME_TRACKS,
    ITEMS, ORE_NAMES, SHOP_ITEMS, ICONS, ICON_ASSET_KEYS,
  });
});
