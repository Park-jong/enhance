# M1 상수 총람 (Constants Index)

> **모든 수치 확정** (2026-11-17, `m1-balance.md`). 확정 열의 값이 기준이며, 시스템 문서 본문의 값과 다르면 이 표와 `m1-balance.md`가 우선한다. "변경" 표시는 잠정값에서 바뀐 항목, "규칙" 표시는 식/규칙까지 바뀐 항목(`m1-balance.md` §7 변경 이력).
> **M1.1 신규 상수(천장 게이지·성공 숙련)는 `m1.1-late-correction.md`가 기준**이며 아래 §3.1에 요약한다(수치는 시뮬레이션 미검증, 플레이테스트로 조정).
> 코드의 식별자는 이름 그대로 사용. 기존 M0 상수(`MAX`, `RATE`, `DESTROY`, `DROP_FROM`, `BLESS_BONUS`, `HUNT_CD`, `cost()`, `sell()`, `huntReward()`)는 유지하며 아래에서 `M0`로 표기. M1에서 `huntReward()`·`autoReward()`의 인자는 보관함 최고 단계 검 `topLv = max(swords[].lv)`다(헬퍼 `topLv()`, 신규 상수 없음, 사용자 확정, bal §3·§8 결정 2).
> 문서 약칭: storage=m1-storage, ps=m1-protect-shards, ao=m1-anvil-ore, q=m1-quest, pc=m1-pity-cap, idle=m1-idle, cons=m1-consumables, ov=m1-overview, bal=m1-balance.

## 1. 보관함 / 저장
| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `SAVE_KEY` | 저장 키 | `'sword-enhance-v2'` | storage |
| `SAVE_KEY_V1` | 이전 키(읽기 전용) | `'sword-enhance-v1'` | storage |
| `SLOT_START` | 시작 칸 수 | 3 | storage |
| `SLOT_MAX` | 최대 칸 수 | 8 | storage |
| `SLOT_EXPAND_COST[n]` | n번째 확장 비용(n=0..4) | [3000, 10000, 30000, 80000, 200000] | storage |
| `NEW_SWORD_PRICE` | 새 +0 검 구매가 | 100 | storage |
| `STACK_MAX` | 소모품 스택 상한 | 99 | storage |
| `START_GOLD` | 시작 골드 | 300 (M0) | storage |
| `NO_ACTIVE_SWORD` | `S.active` 값: 활성 검 없음(활성 검 파괴 직후). 검 id는 1부터라 겹치지 않음. 저장·로드에서 0 유지 (3-6) | 0 | storage |
| `DRAG_THRESHOLD_PX` | 보관함 카드 드래그(칸 순서 변경) 시작 이동 거리. 마우스·펜: 이 거리 이상 움직이면 시작(그 전에 떼면 클릭=활성 전환). 터치: 길게 누르기 전에 이 거리 이상 움직이면 스트립 가로 스크롤에 양보 (3-6) | 6 | storage/ov |
| `DRAG_LONG_PRESS_MS` | 터치 드래그 시작에 필요한 길게 누르기 시간(ms) (3-6) | 300 | storage/ov |
| `DRAG_EDGE_PX` | 끄는 중 포인터가 스트립 가장자리에서 이 거리 안이면 그쪽으로 자동 스크롤 (3-6) | 32 | storage/ov |
| `DRAG_SCROLL_STEP_PX` | 위 자동 스크롤의 프레임당 이동량(px) (3-6) | 12 | storage/ov |

## 2. 보호권 / 파편
| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `PROTECT_USES` | 단계당 보호 가능 횟수 | 2 (사용자 확정) | ps |
| `PROTECT_NEED_DIV` | `protectNeed = 1 + ⌊l/DIV⌋` | 5 (M0) | ps |
| `SHARD_BASE_PER_LV` | 파편 기본 배수 | 1 | ps |
| `SHARD_BAND` | 파편 단계 구간 폭 | 5 | ps |
| `SHARD_COST.bless` | 파편→축복 | **10** (변경, 1파편 ≈ 150G) | ps |
| `SHARD_COST.protect` | 파편→보호권 | **25** (변경) | ps |
| `SHARD_COST.keepdown` | 파편→하락 방지 | **20** (변경) | ps |
| `SHARD_COST.sure` | 파편→확정 강화권 | **10** (변경) | ps |
| `SHARD_COST.anvil_1` | 파편→철 모루 | **20** (변경) | ps |
| `SHARD_COST.anvil_2` | 파편→강철 모루 | **50** (변경) | ps |

## 3. 실패 보정 / 확률 상한
| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `PITY_BAND_WIDTH` | 실패 보정·상한 band 폭: `band = min(3, ⌊l / PITY_BAND_WIDTH⌋)` | 5 | pc |
| `PITY_STEP[band]` | 실패 1회당 보정 %p (band 0..3: +0~4, +5~9, +10~14, +15~19) | [1, 1, 2, 2] | pc |
| `PITY_MAX[band]` | 보정 최대 %p | [5, 6, 8, 10] | pc |
| `BONUS_CAP[band]` | 보너스 합계 상한 %p (bless+anvil+pity), band별 | **[20, 20, 14, 14]** (규칙: 단일값 → 배열) | pc |
| `SUCC_CEIL` | 절대 성공률 천장 % (`max(base, SUCC_CEIL)`) | 90 | pc |
| `BLESS_BONUS` | 축복 보너스 %p | 10 (M0) | pc/cons |

> `BONUS_CAP`, `PITY_STEP`, `PITY_MAX`, `SUCC_CEIL`: **M1.1 변경 없음**.

## 3.1 후반 강화 보정 (M1.1, 문서 m1.1 = m1.1-late-correction)
| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `GAUGE_FROM` / `GAUGE_TO` | 천장 게이지 대상 단계 | 15 / 19 | m1.1 |
| `GAUGE_N[i]` | 가득 차는 비성공 횟수(i=l-15) | [4, 5, 6, 8, 10] | m1.1 |
| `MASTERY_FROM` / `MASTERY_TO` | 성공 숙련 대상 단계 | 15 / 19 | m1.1 |
| `MASTERY_STEP[i]` | 성공 1회당 %p | [3, 3, 3, 4, 5] | m1.1 |
| `MASTERY_MAX[i]` | 숙련 최대 %p(`BONUS_CAP` 밖) | [12, 12, 12, 12, 10] | m1.1 |
| `MASTERY_REC_MAX[i]` | 저장 기록 상한 = `ceil(MAX/STEP)` | [4, 4, 4, 3, 2] | m1.1 |

## 4. 모루 / 광석
| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `ANVIL_BONUS[g]` | 등급별 성공률 %p (g=1..3) | **[2, 3, 4]** (변경) | ao |
| `ANVIL_DURA[g]` | 등급별 최대 내구도 | [30, 40, 50] | ao |
| `ANVIL_CRAFT[g]` | 제작 비용 | **1: iron 60 / 2: iron 100, silver 60, 5000G / 3: silver 150, mithril 80, 20000G** (변경) | ao |
| `ANVIL_REPAIR[g]` | 전체 수리 비용(내구도 비례) | **1: iron 30 / 2: iron 40, silver 40 / 3: silver 50, mithril 50** (변경) | ao |
| `ANVIL_SHOP_PRICE` | 1등급 상점가 | **3000** (변경) | ao |
| `ANVIL_OWN_MAX` | 모루 보유 한도 | 6 | ao |
| `ORE_PER_HUNT` | 사냥당 광석(기대값) | **{iron: 2, silver: 1, mithril: 0.5}** (규칙: 소수부는 확률 지급, 오프라인은 기대값 내림) | ao |
| `ANVIL_TOGGLE_MIN_LV` | 모루 토글·효과 최소 단계(활성 검이 이 미만이면 토글 비활성, 효과·내구도 소모 없음). 상점 철 모루 구매는 `best ≥ FORGE_UNLOCK_BEST` | 5 | ao/ov |
| `ORE_UNLOCK_LV` | 광석 해금 `best` | {iron: 0, silver: 7, mithril: 12} | ao |
| `ORE_MAX` | 광석 보유 상한 | 9999 | ao |

## 5. 의뢰
| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `QUEST_UNLOCK_BEST` | 해금 `best` | 3 | q |
| `QUEST_SLOTS` | 동시 의뢰 수 | 3 | q |
| `QUEST_LV_EASY_DIV` | 쉬움 요구 단계 = `max(QUEST_LV_MIN.easy, ⌊best/DIV⌋)` | 2 | q |
| `QUEST_LV_NORMAL_OFFSET` | 보통 = `max(QUEST_LV_MIN.normal, best-OFFSET)` | 3 | q |
| `QUEST_LV_HARD_OFFSET` | 어려움 = `max(QUEST_LV_MIN.hard, best-OFFSET)` | 1 | q |
| `QUEST_LV_MIN[tier]` | 난이도별 요구 단계 하한 | {easy: 2, normal: 3, hard: 4} | q |
| `QUEST_SHARD_MIN_LV` | 쉬움 파편 보상 = `shardGain(max(QUEST_SHARD_MIN_LV, lv))` | 5 | q |
| `QUEST_FALLBACK_SHARD_ITEM` | 파편 가치가 없는 품목의 대체 기준 품목 | {booster: 'protect', seal: 'protect'} | q |
| `QUEST_GOLD_MULT[tier]` | 골드 보상 = `sell(lv)×mult` | {easy: 1.3, normal: 1.5, hard: 1.8} | q |
| `QUEST_ITEM_CHANCE[tier]` | 아이템 보상 확률 | {easy: 0.5, normal: 0.8, hard: 1.0} | q |
| `QUEST_ITEM_POOL[tier]` | 보상 풀 | q §3 표 (변경 없음) | q |
| `QUEST_COOLDOWN_SEC` | 납품 후 재생성 대기 | 300 | q |
| `QUEST_REROLL_MIN` | 새로고침 비용 하한 | 200 | q |
| `QUEST_REROLL_COST_MULT` | 새로고침 비용 배수 | 3 | q |
| `QUEST_REROLL_COST` | 새로고침 골드 | `max(QUEST_REROLL_MIN, QUEST_REROLL_COST_MULT × cost(best))` | q |

## 6. 방치 / 연출 스킵
> 수입 기준 검: 수동 사냥 `huntReward(topLv)`, 자동·오프라인 `autoReward(topLv)`. `topLv = max(swords[].lv)`(활성 여부와 무관, 헬퍼 `topLv()`). 신규 상수 없음, 아래 값 변경 없음(사용자 확정).
> `AUTO_UNLOCK_BEST` = 5(무료 해금), `OFFLINE_EFF` = 0.25, `OFFLINE_CAP_H` = 8 사용자 확정.

| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `AUTO_UNLOCK_BEST` | 자동 사냥 해금 `best` | 5 | idle |
| `AUTO_CD_MS` | 자동 사냥 기본 간격 | 5000 | idle |
| ~~`AUTO_REWARD_RATE`~~ | (폐지) | `AUTO_COST_RATIO`로 대체 | idle |
| `AUTO_COST_RATIO` | 자동·오프라인 1회 보상 `autoReward(l) = max(AUTO_MIN, round(AUTO_COST_RATIO × cost(l)))` | **0.1** (규칙: 신규 식) | idle/bal |
| `AUTO_MIN` | 자동·오프라인 1회 보상 하한(G) | 10 | idle |
| `AUTO_CATCHUP_MAX` | 포그라운드 catch-up 최대 횟수 | 20 | idle |
| `HUNT_CD` | 수동 사냥 쿨다운 | 2500 (M0) | idle |
| `OFFLINE_CAP_H` | 오프라인 기본 상한 시간 | 8 | idle |
| `OFFLINE_EFF` | 오프라인 효율 | **0.25** (변경) | idle |
| `OFFLINE_MIN_SEC` | 팝업·정산 최소 경과 | 60 | idle |
| `UP_MAX` | 업그레이드 최대 레벨(종류별 공통) | 5 | idle |
| `UP_SPEED_STEP` | 레벨당 간격 감소 ms | 400 | idle |
| `UP_GOLD_STEP` | 레벨당 자동 골드 증가율 | 0.10 | idle |
| `UP_OFFLINE_STEP_H` | 레벨당 상한 시간 증가 | **1** (변경, 8→13시간) | idle |
| `UP_COST_BASE` | 업그레이드 기본 비용 | {speed: 3000, gold: 5000, offline: 4000} | idle |
| `UP_COST_GROWTH` | 레벨당 비용 증가율 | 2.2 | idle |
| `SKIP_KEEP_LV` | 스킵 중에도 짧은 연출을 보이는 성공 단계 | 15 | idle |
| `SKIP_KEEP_DESTROY_LV` | 스킵 중에도 짧은 연출을 보이는 파괴 단계 | 10 | idle |
| `SKIP_MIN_INTERVAL_MS` | 스킵 시 강화 최소 간격 | 250 | idle |
| `SKIP_RESULT_MS` | 스킵 시 결과 텍스트 표시 시간 | 500 | idle |

## 7. 소모품
| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `PRICE.bless` | 축복 주문서 | 1500 (M0) | cons |
| `PRICE.protect` | 파괴 보호권 | 4000 (M0) | cons |
| `PRICE.keepdown` | 하락 방지 주문서 | **3000** (변경) | cons |
| `PRICE.sure` | 확정 강화권 | **1500** (변경) | cons |
| `PRICE.booster` → `boosterPrice(best)` | 골드 부스터(상점 구매 시 즉시 적용) | **`max(BOOSTER_PRICE_MIN, round(BOOSTER_PRICE_HUNT_MULT × huntReward(best) / BOOSTER_PRICE_ROUND) × BOOSTER_PRICE_ROUND)`** (규칙, 100G 단위 반올림) | cons |
| `BOOSTER_PRICE_MIN` | 부스터 최저가 | 3000 | cons/bal |
| `BOOSTER_PRICE_ROUND` | 부스터 가격 반올림 단위(G) | 100 | cons/bal |
| `BOOSTER_PRICE_HUNT_MULT` | 부스터 가격 배수 | **40** (신규) | cons/bal |
| `PRICE.seal` | 감정 인장 | 2000 | cons |
| `DROP_FROM` | 하락이 시작되는 단계(= `keepdown` 유효 시작) | 10 (M0) | cons |
| `KEEPDOWN_MAX_LV` | `keepdown` 유효 단계 상한(미만), `DROP_FROM ≤ l < 15` | **15** (신규, 규칙) | cons |
| `SURE_MAX_TARGET` | `sure`가 유효한 현재 단계 상한(미만) | 10 | cons |
| `BOOSTER_MULT` | 부스터 골드 배율 | 1.5 | cons |
| `BOOSTER_DURATION_MIN` | 1회 지속 분 | 10 | cons |
| `BOOSTER_MAX_MIN` | 잔여 시간 누적 상한 분 | 60 | cons |
| `SEAL_MULT` | 감정 인장 배율 | 1.3 | cons |

## 8. 해금 (overview)
| 이름 | 의미 | 확정값 | 문서 |
| --- | --- | --- | --- |
| `FORGE_UNLOCK_BEST` | 대장간 탭 해금 | 5 | ov |
| `QUEST_UNLOCK_BEST` / `AUTO_UNLOCK_BEST` | 위 표 참조 | 3 / 5 | ov |
| `BOOSTER_SEAL_UNLOCK_BEST` | `booster`·`seal` 상점 노출 | 5 | ov |

## 구조 테이블 / M0 계수 포인터
구조 테이블(`ORES`, `QUEST_TIERS`, `UPGRADES`, `CONSUMABLES`, `TRAY_TOGGLES`, `UNLOCK`, `ITEMS`, `SHOP_ITEMS`)과 M0 가격식 계수(`COST_BASE`, `COST_GROWTH`, `COST_MIN`, `SELL_BASE`, `SELL_GROWTH`, `HUNT_SELL_RATIO`, `HUNT_MIN`, `GOLD_ROUND` 등)는 `js/constants.js`가 기준(source of truth)이다. 이 문서에 복사하지 않는다.

## 확인 필요(밸런스 담당 전달) — 처리 결과
- (해결) 고단계 방치 수입: 자동·오프라인 전용 식 `autoReward(l)` 도입(bal §3).
- (해결) `BONUS_CAP` band별 배열 전환 `[20, 20, 14, 14]`(bal §2.3, pc).
- (해결) `SHARD_COST`: 파괴 1회 평균 14~40파편, 보통 플레이에서 파편 1개당 583G 이상 소비 → 1파편 ≈ 150G로 상향(bal §4).
- (해결) 수입 기준 검 = 보관함 최고 단계 검(사용자 확정). `topLv = max(swords[].lv)`, 헬퍼 `topLv()`. 상수 변경 없음(bal §3·§7 #6).
- (해결) F15 소모품 확정: 4종 신규(`keepdown`, `sure`, `booster`, `seal`), `SURE_MAX_TARGET` = 10 (`sure`는 +9까지), 후보 3종 제외(사용자 확정).
- (해결) 자동 사냥 `AUTO_UNLOCK_BEST` = 5 무료, `OFFLINE_EFF` = 0.25, `OFFLINE_CAP_H` = 8 사용자 확정.
- (해결) `BONUS_CAP` [20, 20, 14, 14]·`KEEPDOWN_MAX_LV` = 15 유지(+20 속도 유지), `huntReward` M0 식 M1 유지(M2 재검토), `QUEST_ITEM_CHANCE` 유지 — 사용자 확정(bal §8).
