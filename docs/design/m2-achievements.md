# M2 업적(F12) + 일일 과제

> 담당: 기획(시스템). M2 배치 B(4-2). 이 문서는 **업적·칭호·일일 과제 규칙**의 단일 출처다. 골드 사용처 지도·가격식은 `m2-overview.md`, 특성은 `m2-traits.md`, 납품 의뢰(F4)는 `m1-quest.md`, 저장 구조는 `m1-storage.md`가 가진다. 이 문서는 그 상수를 **이름으로만** 참조한다.
> 수치(목표·보상 배수)는 기획 판단 + 기존 상수로 한 산수이며 **시뮬레이션으로 검증하지 않았다**(사용자 지시). 플레이 테스트로 조정한다.
> 상태 표기: `(결정)` = 팀장/사용자 확정, `(초안)` = 기획이 정함(결정표 참조), `(잠정)` = 문구·시각은 5-B에서 확정.
> 사용자 지시에 따라 열린 질문은 없다. 모든 갈림길은 §17 결정표에 권장안으로 기록했다.
> 용어: `H = huntReward(S.best)`(보상을 **받는 시점**의 값), `H_L = huntReward(L)`. `roundTo(x, unit) = Math.round(x/unit)*unit`(`rules.js`).

## 1. 요약
| 항목 | 내용 |
| --- | --- |
| 업적 | 34개. 11개 트랙 × 3단계 + 단발 1개. 조건은 누적 카운터·최고 단계·기념비·특성. 달성하면 "받기 가능", 눌러서 **1회 보상** + **칭호** (결정) |
| 업적 보상 | 칭호(항상) + 소액 골드(`k × H`) + 소량 파편 + 소량 광석. **확률·게이지·숙련·`BONUS_CAP`에는 아무 효과 없음.** 업적 포인트 상점 없음 (결정) |
| 일일 과제 | 하루 3개(★ / ★★ / ★★★) + 3개 모두 달성 보너스 1개. 풀에서 주입 RNG로 생성, 목표는 **카운터 증가분**(생성 시점 기준값과의 차) (결정) |
| 날짜 | 지역 시간 **04:00** 기준 `dayKey`. 오프라인이 아무리 길어도 새 세트는 **1개**, 적립·연속 보상 없음 (결정) |
| 시계 조작 | 저장된 `daily.maxDay`가 단조 증가. 시계 역행 = 새 세트 없음. 앞으로 점프 = 세트 최대 1개 (결정) |
| 두 탭 | 수령은 **활성 탭만**. 항목별 `claimed` 플래그를 보상과 **같은 저장**에 쓰므로 멱등. 두 번째 수령은 `claimed` (결정) |
| UI | 새 탭 없음. **기록 탭**에 "일일 과제"·"업적" 섹션, 수령 가능하면 기록 탭에 **점**(기존 `TAB_DOT`) (결정) |
| 저장 | `achievements`, `daily`, `title`, `stats.*` 7개(`eventsSeen` 포함, F13 훅) (2026-11-23 변경). v2 유지, add-field + default-merge (결정) |
| 규모 | 업적 골드 합계 = `131 × H`(연속 사냥 **5.5분**, 1회성). 일일 과제 하루 = `16 × H`(연속 사냥 **0.67분/일**) (§7.3) |

### 1.1 기본 원칙
- **F12는 힘이 아니라 기록·수집·소액 보상이다.** `chances()`·게이지·숙련·`BONUS_CAP`·`SUCC_CEIL`·pity·특성 효과를 읽지도 쓰지도 않는다. 보상 종류(골드·파편·광석·칭호)가 모두 확률 입력이 아니다. (파편·광석은 이미 사냥·파괴·의뢰로 얻는 자원이고 양은 §7에서 사냥 몇 회분으로 제한한다.)
- **배치 A 사용처를 약화하지 않는다.** 업적·일일 골드는 H 기준 소액이라 특성 관리·기념비 가격(연속 사냥 3.3~20.8분, 한 번 사는 전체 약 46분, `m2-overview.md` C.4)에 비해 작고, "골드를 쓴 대가로 골드를 받는" 구조(소비 업적)도 보상이 사용 금액의 2% 이하다(§7.4).
- **초반 페이스 불변.** +5~+12 골드 제한 구간에서 받을 수 있는 골드는 §7.3 산술로 상한을 둔다.

## 2. 이름 규칙 (F4 의뢰와 혼동 금지) (결정)
| 시스템 | UI 이름 | 단위 이름 | 난이도 표기 | 보상 문구 | 버튼 | 코드 이름 |
| --- | --- | --- | --- | --- | --- | --- |
| F4 납품 의뢰 | **의뢰** (탭 "의뢰", 제목 "납품 의뢰") | 의뢰 | 쉬움/보통/어려움 | "보상" | 납품 | `quests`, `Q.*` |
| F12 일일 과제 | **일일 과제** (기록 탭 섹션) | 과제 | ★ / ★★ / ★★★ | "과제 보상" | 받기 | `daily`, `A.daily*` |
| F12 업적 | **업적** (기록 탭 섹션) | 업적 | 단계 `I·II·III` | "업적 보상" | 받기 | `achievements`, `A.*` |
- UI·토스트·툴팁에서 일일 과제를 "의뢰"·"퀘스트"라 쓰지 않는다. F4를 "과제"라 쓰지 않는다. "쉬움/보통/어려움"은 F4 전용이다.
- 일일 과제 중 "납품 1회" 같은 문장은 허용(F4 행동을 세는 과제)이지만 제목은 "납품하기"이며 의뢰 카드를 복제하지 않는다.
- 새 모듈 파일은 `js/achievements.js`(전역 `SG.ach`)로 한다. `quests.js`를 확장하지 않는다.

## 3. 기존 시스템과의 상호작용 (필수)
| 시스템 | 영향 | 이유 | AC |
| --- | --- | --- | --- |
| `BONUS_CAP` / `SUCC_CEIL` / pity | 없음 | F12는 확률 입력이 아님. `chances()`를 읽지 않음 | 37 |
| F16 게이지·숙련 | 없음 | 보상에 게이지·숙련 변경 없음. 강화 행동을 세기만 함 | 37 |
| 특성(F14) | 읽기 전용 훅: `stats.traitRolls`, 보유 검의 특성 종류 수, 등급 3 보유. 특성 효과 불변 | `m2-traits.md` §13이 위임한 항목을 여기서 확정 | 35 |
| 기념비·사용처 | 읽기 전용 훅: `monuments` 보유 수, `stats.sinkGold`. 보상은 사용 금액의 3% 이하 | 사용처를 약화하지 않음 | 34, §7.4 |
| F4 의뢰 | 읽기 전용 훅: `stats.delivered`. 이름·UI 분리(§2). 의뢰 상태·쿨다운·보상 불변. 일일 과제는 의뢰 보상 풀을 쓰지 않음 | 혼동·중복 방지 | 52, 54 |
| 수입(`huntReward` 등) | 변경 없음. 보상 골드는 `stats.earned`·`huntGold`·`offlineGold`에 더하지 **않고** `stats.rewardGold`에만 | 기존 통계 의미 보존 | 39 |
| 오프라인 정산 | 일일 과제 목표는 접속 중 카운터만(§8.3): 오프라인 골드·자동 횟수는 `autoRuns`·`huntGold`에 들어가지 않음. 복귀 시 `refreshDaily`는 세트 최대 1개 | 오프라인 적립 금지 | 10b, 19, 22 |
| 탭 잠금(`tab-guard.js`) | 수령은 활성 탭만. 멈춘 탭은 `refreshDaily`도 하지 않음 | §11 | 29~30c |
| 저장(`save.js`) | v2 유지, 새 필드 + 기본값 병합, 정규화 단일 관문 | §13 | 44~51 |
| 소모품·상점·모루·광석 | 변경 없음. 광석 보상은 `ORE_MAX`(9999)에 막힘 | | 40 |
| 환생(C) | 잠정: 업적·칭호·일일 상태 유지 (§18) | | - |

## 4. 카운터와 훅 (결정)
업적·일일 과제가 읽는 값. **통계 카운터는 평생 값이며 감소하지 않는다**(환생에서 어떤 값을 초기화할지는 C, §18).

| 지표 | 출처 | 상태 |
| --- | --- | --- |
| `stats.tries` / `success` / `destroy` / `delivered` / `crafted` / `huntGold` | 기존 | 기존 `STAT_KEYS` |
| `stats.sinkGold` / `traitRolls` | 배치 A | 이미 확정(`m2-overview.md` D) |
| **`stats.hunts`** | 수동 사냥 성공 1회마다 +1 (`idle.manualHunt`) | **신규** |
| **`stats.sells`** | `sellSword`로 `lv ≥ SELL_COUNT_MIN_LV`(5)인 검을 판 횟수 | **신규**. +0~+4 검은 세지 않음(싼 검 반복 구매·판매로 카운터를 올리는 것 방지) |
| **`stats.autoRuns`** | 접속 중 자동 사냥 실행 1회마다 +1 (`runAutoCatchup`의 `runs`). `settleOffline`은 세지 않음 | **신규** |
| **`stats.dailyDone`** | 일일 과제 1개 **수령** 시 +1 | **신규** |
| **`stats.dailyAll`** | 일일 보너스 **수령** 시 +1 | **신규** (업적에는 쓰지 않음, 기록 표시용·C에서 활용 가능) |
| **`stats.rewardGold`** | 업적·일일 보상으로 받은 골드 누적 | **신규** (표시·검증용) |
| `S.best` | 기존 | 최고 단계 |
| `monumentCount(S)` | `S.monuments`의 1의 개수 | 파생(`m2-overview.md` C.3 훅) |
| `traitKindCount(S)` | 현재 보유 검들의 서로 다른 특성 종류 수 | 파생 |
| `hasPerfectTrait(S)` | 보유 검 중 `trait.t === 3`이 있음 | 파생 |

### 4.1 파생 지표는 래치(latch)한다
`traitKindCount`·`hasPerfectTrait`는 검을 팔면 줄어들 수 있다. 업적은 **한 번 달성하면 `achievements[id] ≥ 1`로 저장**(래치)되고 이후 조건이 거짓이 돼도 유지된다. 카운터 지표도 같은 방식으로 판정한다(단조라 결과는 같다). 동기화 함수 `syncAchievements(S)`가 모든 미달성 업적을 훑어 새로 달성한 id 목록을 돌려준다(§6).

## 5. 업적 표 (34개) (초안)
조건은 `지표 ≥ 목표`. 보상: `k` = 골드 배수(§7.1), `파편 m` = `m × shardGain(max(5, S.best))`(§7.2), 광석 = 고정 개수. 칭호는 모두 보상에 포함. 단계 `I/II/III`.

| id | 이름 | 조건(지표 ≥ 목표) | 골드 k | 파편 m | 광석 | 칭호 |
| --- | --- | --- | --- | --- | --- | --- |
| `tries_1` | 첫 단련 | `tries` ≥ 100 | 1 | 0 | - | 견습 대장장이 |
| `tries_2` | 끝없는 망치질 | `tries` ≥ 1,000 | 3 | 1 | - | 숙련 대장장이 |
| `tries_3` | 불꽃의 장인 | `tries` ≥ 5,000 | 6 | 2 | - | 전설의 대장장이 |
| `succ_1` | 성공의 맛 | `success` ≥ 50 | 1 | 0 | - | 행운의 손 |
| `succ_2` | 단단한 손맛 | `success` ≥ 500 | 3 | 1 | - | 명장의 손 |
| `succ_3` | 필승의 대장장이 | `success` ≥ 2,500 | 6 | 2 | - | 백전백승 |
| `best_1` | 희귀한 검 | `best` ≥ 10 | 1 | 0 | - | 희귀 감정사 |
| `best_2` | 영웅의 검 | `best` ≥ 15 | 4 | 1 | - | 영웅 대장장이 |
| `best_3` | 무한의 검 | `best` ≥ 20 | 8 | 2 | - | 신화를 벼린 자 |
| `dest_1` | 첫 파괴 | `destroy` ≥ 1 | 1 | 0 | - | 깨진 검의 증인 |
| `dest_2` | 잿더미 속에서 | `destroy` ≥ 25 | 3 | 1 | - | 오뚝이 |
| `dest_3` | 파편의 왕 | `destroy` ≥ 100 | 5 | 2 | - | 폐허의 군주 |
| `hunt_1` | 사냥 입문 | `hunts` ≥ 100 | 1 | 0 | - | 초보 사냥꾼 |
| `hunt_2` | 단골 사냥터 | `hunts` ≥ 1,000 | 3 | 1 | 철광석 40 | 베테랑 사냥꾼 |
| `hunt_3` | 사냥터의 주인 | `hunts` ≥ 5,000 | 6 | 2 | 은광석 40 | 사냥왕 |
| `dlv_1` | 첫 납품 | `delivered` ≥ 5 | 1 | 0 | - | 심부름꾼 |
| `dlv_2` | 믿음직한 거래처 | `delivered` ≥ 25 | 3 | 1 | 철광석 30 | 단골 납품업자 |
| `dlv_3` | 왕실 납품업자 | `delivered` ≥ 100 | 6 | 1 | 은광석 30 | 납품왕 |
| `sink_1` | 첫 투자 | `sinkGold` ≥ 500,000 | 3 | 0 | - | 후원자 |
| `sink_2` | 아낌없는 손 | `sinkGold` ≥ 10,000,000 | 6 | 0 | - | 큰손 |
| `sink_3` | 황금의 강 | `sinkGold` ≥ 100,000,000 | 10 | 0 | - | 재벌 |
| `trt_1` | 첫 각인 | `traitRolls` ≥ 1 | 1 | 0 | - | 각인사 |
| `trt_2` | 각인 수집가 | `traitRolls` ≥ 5 | 3 | 1 | - | 각인 장인 |
| `trt_3` | 운명의 주사위 | `traitRolls` ≥ 20 | 5 | 2 | - | 각인의 달인 |
| `knd_1` | 세 가지 재능 | `traitKindCount` ≥ 3 | 1 | 0 | - | 재능 수집가 |
| `knd_2` | 다재다능 | `traitKindCount` ≥ 5 | 3 | 1 | - | 다재다능 |
| `knd_3` | 여섯 빛깔 | `traitKindCount` ≥ 6 | 6 | 2 | - | 전종 수집가 |
| `mon_1` | 첫 기념비 | `monumentCount` ≥ 1 | 3 | 0 | - | 기념비 건립자 |
| `mon_2` | 기념비의 숲 | `monumentCount` ≥ 4 | 6 | 1 | - | 기념비 수호자 |
| `mon_3` | 모든 기념비 | `monumentCount` ≥ 8 | 10 | 2 | - | 기념비의 주인 |
| `day_1` | 성실한 하루 | `dailyDone` ≥ 10 | 1 | 0 | - | 성실한 사람 |
| `day_2` | 꾸준한 습관 | `dailyDone` ≥ 50 | 3 | 1 | - | 꾸준한 사람 |
| `day_3` | 일과의 달인 | `dailyDone` ≥ 200 | 6 | 2 | - | 일과의 달인 |
| `perfect` | 완벽한 각인 | `hasPerfectTrait` | 2 | 1 | - | 완벽주의자 |

합계: 골드 k = **131**, 파편 m = **30**, 광석: 철 70 · 은 70. (트랙별 m 합: 3-단계 트랙 9개(tries·succ·best·dest·hunt·trt·knd·mon·day) 각 0+1+2 = 3 → 27, dlv 0+1+1 = 2, perfect 1, sink 0 → 27+2+1 = **30**. 트랙별 k 합: tries 10, succ 10, best 13, dest 9, hunt 10, dlv 10, sink 19, trt 9, knd 10, mon 19, day 10, perfect 2 = 131.)

- 칭호 34개는 모두 유일한 문자열이다. 칭호는 해당 업적을 **수령**해야 해금(달성만으로는 아님).
- 칭호 선택: `S.title` = 업적 id 또는 `''`(없음). UI에서 수령한 업적의 칭호 중 하나를 고른다(`setTitle`).
- `knd_*`에서 "보유 검"은 특성이 있는 현재 보관함 검만 센다. 보관함 8칸에 6종이 동시에 있으려면 `trt` 관리(best ≥ 13의 종류 변경)가 필요하다 → 의도된 후반 목표.
- `best_3`(+20)·`sink_3`·`mon_3` 등은 후반 목표다. 목표값은 절대치(고정)이며 best에 따라 스케일하지 않는다.

## 6. 업적 상태와 판정 (결정)
- 상태 `achievements[id]`: **없음/0** = 미달성, **1** = 달성(받기 가능), **2** = 수령 완료. 저장은 0이 아닌 항목만 둔다(희소 객체).
- `syncAchievements(S)`: 상태가 0인 업적마다 조건을 계산해 참이면 1로 올리고 새 id 목록을 반환한다. 이미 1·2인 항목은 건드리지 않는다(래치). 부작용 없음(RNG·골드 불변).
- 호출 위치(`main.js`): 부팅, 복귀(`resume`), `takeOver`, 그리고 상태를 바꾸는 모든 사용자 행동(강화·사냥·판매·납품·제작·사용처 구매·수령) 직후. 렌더 프레임마다 호출하지 않는다.
- 새로 달성하면 토스트 "업적 달성: <이름> — 기록 탭에서 보상을 받으세요"(여러 개면 합침: "업적 N개 달성"). `skipFx`와 무관하게 표시.
- 달성 후 수령 전에도 칭호는 아직 아니다. 수령 시 `claimed` + 칭호 해금 + 보상이 **한 번의 동기 처리**로 들어간다(§10).

## 7. 보상 공식 (정수 계산 순서 고정) (결정)

### 7.1 골드
```
pct(S)        = S.best < ACH_EARLY_BEST ? ACH_EARLY_PCT : 100        // 13 미만이면 50
rewardGold(S, k) = roundTo( floor( k * huntReward(S.best) * pct(S) / 100 ), ACH_ROUND )   // ACH_ROUND = 10
```
순서: ① 정수 `k`와 정수 `huntReward`와 정수 `pct`를 **모두 곱한다**(소수 없음, 안전 정수 안) → ② `/100` 후 `floor` → ③ 마지막에 `roundTo(…, 10)` 한 번. `H`는 **수령 시점** `S.best`로 계산하며 달성 시점 값을 저장하지 않는다.
- 반올림 단위 10: 초반 H가 작다(best 0~4에서 10)라 100G 반올림은 보상을 0 또는 100으로 왜곡한다. `GOLD_ROUND`(10)와 같다.
- 초반 50% 규칙(`S.best < 13`): 아래 §7.3 페이스 보호. 13 이상은 100%.

### 7.2 파편·광석
```
shardReward(S, m) = m * shardGain( max(QUEST_SHARD_MIN_LV, S.best) )     // QUEST_SHARD_MIN_LV = 5, 정수 곱
```
- 파편은 `S.shards += shardReward`. `stats.shardsGained`(파괴 통계)에는 **더하지 않는다**.
- 의미: `m`은 "해당 시점의 파괴 1회분" 파편이다. 보호권 1장 = 25파편이라 후반에는 대수롭지 않고 초반에는 작다(best 5~9에서 10~14파편).
- 광석: 정해진 개수를 `forge.addOre`로 더한다(`ORE_MAX` 상한은 기존 규칙, 초과분은 버림). 미스릴은 주지 않는다(해금 단계 `ORE_UNLOCK_LV`가 달라 초반 지급을 피함). 철 40개 = 사냥 20회분, 은 40개 = 사냥 40회분(`ORE_PER_HUNT`).

### 7.3 규모 (연속 사냥 분 = `k ÷ 24`, 24 = 연속 사냥 24회/분, `m2-overview.md` B.1)
| 묶음 | 합 k | 연속 사냥 분 (best ≥ 13, 100%) | best < 13 (50%) |
| --- | --- | --- | --- |
| 업적 전체(1회성) | 131 | **5.46분** | 2.73분 |
| 일일 과제 3개(하루) | 2+3+5 = 10 | 0.42분 | 0.21분 |
| 일일 보너스(하루) | 6 | 0.25분 | 0.13분 |
| 일일 하루 합계 | **16** | **0.67분/일** | 0.33분/일 |
- 배치 A 사용처와 비교: 한 검 특성 3종 + 기념비 전체를 한 번 사는 데 약 46분(`m2-overview.md` C.4). 업적 전체 5.5분은 그 약 12%이며 1회성이다. 일일은 하루 0.67분 = 사냥 16회분(듀티 25%라면 약 2.7분 플레이 분량)이다.
- 파편: 업적 전체 `30 × shardGain` — best 17에서 2,040파편(보호권 81장분. 보호권 4,000G 기준 약 32만G = best 17에서 사냥 약 10회분). 사냥·의뢰로 이미 얻는 자원이라 격차를 만들지 않는다.

**초반(+5~+12 골드 제한 구간) 가속 상한 — 산술**
- 이 구간의 필요 골드는 `Σ cost(l) / (성공률)`(l=5..12, 파괴·하락·pity 무시한 하한)이 약 25,400G로 사냥 약 78회분(각 단계 H 기준)이다. 파괴·하락까지 포함하면 사냥 100~150회분으로 본다.
- 이 구간에서 달성 가능한 업적(조건이 best 12 이하에서도 충족될 수 있는 것): `tries_1` 1, `succ_1` 1, `best_1` 1, `dest_1` 1, `dest_2` 3, `hunt_1` 1, `hunt_2` 3, `dlv_1` 1, `dlv_2` 3, `trt_1` 1, `knd_1` 1, `day_1` 1, `perfect` 2, `tries_2` 3 → 합 k ≤ **23**. 50% 적용으로 **사냥 11.5회분(0.48 연속 분)** 이하.
- 11.5 ÷ 78 ≈ 15% (파괴·하락 포함 100~150회분 기준이면 8~12%)의 골드이고 +20 전체(약 25분)로 보면 **약 0.48분(2% 안팎, 1.9%)** 이다. 플레이어가 이 업적들을 모두 이 구간에 받는 최악의 경우이며, 실제로는 `tries_2`·`dest_2`·`hunt_2`·`dlv_2`는 대부분 이후에 달성된다.
- 일일 과제는 best ≥ 5부터이고 하루 합계가 best < 13에서 0.33분(사냥 8회분)이다. **하루 1세트만** 받을 수 있으므로 한 세션(+20까지 약 25분) 동안 구간 가속은 사냥 8회분 이하다. 이것도 위 1~2% 범위에 포함해 총 가속 상한 **약 3.3% 이하**(0.48 + 0.33 = 0.81분 ÷ 25분)로 본다.
- 파편(파괴 1회분)·광석은 골드가 아니라 보호권/모루 재료다. 초반 지급 파편은 T2 이상 업적에서 `m=1`(best 5~9에서 10~14개)뿐이고 광석은 `hunt_2`·`dlv_2`(철 40·30) 이후다. 모루 제작(철 60)을 앞당기는 효과는 사냥 15~20회분이며 모루 성공 보너스는 +2%p뿐이라 페이스 효과는 무시할 수준이다.
- **플레이 테스트 항목**: +5~+12 구간 시간을 업적·일일 포함/제외로 비교해 기록한다. 기획 한계: 가속이 5%를 넘으면 `ACH_EARLY_PCT`를 낮춘다(25).

### 7.4 보상이 사용 금액 대비 작음 (소비형 업적 점검)
| 업적 | 조건 금액 | best 13에서 보상 | best 20에서 보상 | 비율(최대) |
| --- | --- | --- | --- | --- |
| `sink_1` (3H) | 500k | 8,030 | 595,390 | 1.6% / 119%(best 20에서 처음 받는 비현실적 경우) |
| `sink_2` (6H) | 10M | 16,060 | 1,190,770 | 0.16% / 11.9% |
| `sink_3` (10H) | 100M | 26,760 | 1,984,620 | 0.03% / 2.0% |
| `mon_3` (10H) | 64.3M(8기념비 합) | 26,760 | 1,984,620 | 0.04% / 3.1% |
- `sink_*`·`mon_*`는 실제로 그 금액을 쓰는 시점의 best(13~)에서 받는 값이 기준이다. `sink_1`(조건 500k)은 best 13~14에서 달성되므로 1.6%, `sink_2`(10M)는 best 16~17(보상 1.9% 이하), `sink_3`(100M)은 best 19~20(2.0%)로 **2% 이하**다. 소비 보상으로 사용처 가격이 사실상 할인되지 않는다.
- `mon_3`는 8개 기념비 합계(best 20 기준 64.3M)의 3.1% 이하다. best 20에 도달한 뒤에도 마지막 기념비는 29.8M이라 보상 2.0M은 6.7%이지만 1회성이다(결정표: 허용).

### 7.5 계산 예 (best 13 / 15 / 17 / 20)
`H` = 2,676 / 9,158 / 31,345 / 198,462. `shardGain(max(5,best))` = 39 / 60 / 68 / 100. 다음 모든 값은 `rewardGold`(pct=100, 순서 ①②③)로 계산(`js/rules.js` 상수로 확인).
| k | best 13 | best 15 | best 17 | best 20 |
| --- | --- | --- | --- | --- |
| 1 | 2,680 | 9,160 | 31,350 | 198,460 |
| 2 | 5,350 | 18,320 | 62,690 | 396,920 |
| 3 | 8,030 | 27,470 | 94,040 | 595,390 |
| 5 | 13,380 | 45,790 | 156,730 | 992,310 |
| 6 | 16,060 | 54,950 | 188,070 | 1,190,770 |
| 8 | 21,410 | 73,260 | 250,760 | 1,587,700 |
| 10 | 26,760 | 91,580 | 313,450 | 1,984,620 |
| 일일 하루 합(2+3+5+6, 각각 반올림 후 합) | 42,820 | 146,530 | 501,530 | 3,175,390 |
- 반올림 예: best 17, k=3 → `3×31,345 = 94,035` → `floor(94,035×100/100)` = 94,035 → `roundTo(94,035, 10)` = `Math.round(9,403.5)×10` = **94,040**. k=5 → 156,725 → **156,730**.
- 초반(pct=50) 예: best 7 (H=67): k=2 → `floor(2×67×50/100)` = 67 → roundTo 10 → **70**. best 10 (H=423): k=1 → `floor(423×50/100)` = 211 → **210**. best 4 (H=11): k=1 → `floor(11×50/100)` = 5 → `Math.round(0.5)×10` = **10**. 파편: `m=1`, best 7 → `shardGain(7)` = 14.
- 파편 예: `m=2`, best 17 → 2 × 68 = **136**.

## 8. 일일 과제

### 8.1 해금·구조 (결정)
- 해금: `S.best ≥ DAILY_UNLOCK_BEST`(5). 미해금이면 `refreshDaily`는 세트를 만들지도 `maxDay`를 올리지도 않는다(§9). 해금 뒤 첫 호출에서 현재 날에 대해 생성.
- 세트 = 과제 3개(슬롯 0 ★, 1 ★★, 2 ★★★) + 보너스. 과제: `{ e, goal, base, item, claimed }`.
  - `e` = 풀 항목 id, `goal` = 정수 목표(증가분), `base` = 생성 시점 지표값(스냅샷), `item` = `null | 'shard' | 'ore'`(생성 시 결정), `claimed` = 0/1.
  - 진행도 `progress = clamp(metric(S) − base, 0, goal)`, 달성 `done = metric(S) − base ≥ goal`. **카운터 증가분**이므로 평생 값·이전 날 값이 더해지지 않는다(이중 계산 없음).
  - 보너스: `daily.bonus` = 0/1(수령 여부). 수령 가능 = 3개 모두 `done` (수령까지는 불필요).
- 지표는 §4의 **통계 카운터만** 쓴다(파생 지표 없음 → 단조라 진행도 계산이 안전).

### 8.2 풀 (초안)
밴드 = 생성 시점 `S.best`: **0**: 5~9, **1**: 10~14, **2**: 15~19, **3**: 20 (`DAILY_BANDS = [5,10,15,20]`, 밴드 = `DAILY_BANDS` 중 `≤ best`인 개수 − 1). 목표는 밴드별 배열(고정 개수) 또는 H 배수(`goal = mult × huntReward(best 생성 시점)`).

| 슬롯 | 항목 id | 설명(UI 문구) | 지표 | 목표 밴드 0 / 1 / 2 / 3 | 해금 조건 |
| --- | --- | --- | --- | --- | --- |
| ★ (0) | `hunt_s` | 수동 사냥 N회 | `hunts` | 10 / 15 / 20 / 25 | 항상 |
| ★ (0) | `auto_s` | 자동 사냥 N회 실행 | `autoRuns` | 12 / 18 / 24 / 36 | 항상(best ≥ 5라 방치 해금) |
| ★ (0) | `tries_s` | 강화 N회 시도 | `tries` | 8 / 10 / 12 / 15 | 항상 |
| ★★ (1) | `succ_m` | 강화 N회 성공 | `success` | 3 / 4 / 4 / 4 | 항상 |
| ★★ (1) | `gold_m` | 사냥 골드 N 벌기(수동+자동, 접속 중) | `huntGold` | `mult×H` : 20 / 25 / 30 / 30 | 항상 |
| ★★ (1) | `sell_m` | 검(+5 이상) N자루 팔기 | `sells` | 2 / 3 / 3 / 4 | 항상 |
| ★★ (1) | `craft_m` | 모루 N개 제작 | `crafted` | 1 / 1 / 1 / 1 | `S.anvils.length < ANVIL_OWN_MAX`(6). 6개면 `forge.craftBlock`이 `'full'`을 돌려 제작 불가라 후보에서 뺀다(대장간 해금 best ≥ 5는 일일 해금과 같아 별도 조건 불필요) |
| ★★★ (2) | `dlv_l` | 납품하기 N회 | `delivered` | 1 / 1 / 1 / 2 | 항상(의뢰 해금 best ≥ 3) |
| ★★★ (2) | `hunt_l` | 수동 사냥 N회 | `hunts` | 30 / 45 / 60 / 80 | 지표 `hunts`가 슬롯 0에서 안 쓰였을 때 |
| ★★★ (2) | `tries_l` | 강화 N회 시도 | `tries` | 15 / 20 / 25 / 30 | 지표 `tries`가 슬롯 0에서 안 쓰였을 때 |
- **지표 중복 금지**: 슬롯 2의 후보는 앞 슬롯(0, 1)이 이미 쓴 **지표**를 가진 항목을 뺀다. 슬롯 2에 `dlv_l`이 항상 후보이므로 후보가 비는 일은 없다. 슬롯 0·1의 풀은 지표가 서로 겹치지 않아 지표 제외가 없다(슬롯 0 `hunts`/`autoRuns`/`tries`, 슬롯 1 `success`/`huntGold`/`sells`/`crafted`).
- **풀이 비지 않음(증명)**: 도달 가능한 모든 상태(`best ≥ 5`, 모루 0~6개)에서 후보 수는 슬롯 0 = 3(`hunt_s`·`auto_s`·`tries_s`, 게이트 모두 `true`), 슬롯 1 = 3 또는 4(`succ_m`·`gold_m`·`sell_m`는 게이트 `true`, `craft_m`만 `anvils.length < ANVIL_OWN_MAX`일 때 추가), 슬롯 2 ≥ 1(`dlv_l` 게이트 `true`이고 지표 `delivered`는 슬롯 0·1 어느 항목도 쓰지 않아 제외되지 않음; `hunt_l`·`tries_l`은 겹칠 때만 빠짐). 즉 `cands.length ≥ 1`이 항상 성립하며 `cands[min(len-1, …)]` 인덱스가 범위를 벗어나지 않는다. 모루 6개일 때 슬롯 1 후보는 3개이고 rng 호출은 여전히 9회(후보 수만 달라지고 호출 수는 불변). 새 항목을 풀에 추가할 때는 슬롯마다 게이트 `true`인 항목이 하나는 남아야 한다.
- 의도: 순수 사냥·강화·판매·납품·제작 같은 **자연스러운 행동**만 세고, 파괴·소비 지출(사용처)은 과제로 요구하지 않는다(기각: §17).
- 난이도 감각: ★ = 1분 미만의 행동, ★★ = 3~5분의 행동, ★★★ = 약 3분의 사냥(`hunt_l` 80회 = 연속 3.3분)이거나 납품 1~2회. 후반(밴드 2~3)에서도 `succ_m` 4회는 천장 게이지(`GAUGE_N`)로 보장되는 범위다.
- 보상(§8.5)은 슬롯 번호(★ 수)로만 정해지며 항목별로 다르지 않다.

### 8.3 오프라인·보너스 카운터
- `autoRuns`는 접속 중 `runAutoCatchup` 실행 횟수만 센다. 복귀 정산(`settleOffline`)은 `autoRuns`·`huntGold`·`hunts`를 늘리지 않는다(`offlineGold`만). 따라서 오프라인으로 일일 과제가 완료되지 않는다.
- `huntGold`는 기존대로 수동 사냥·접속 중 자동 사냥 골드를 더한다. `gold_m`의 `goal = mult × huntReward(생성 시점 S.best)`(정수 곱, 생성 시 저장).

### 8.4 생성 알고리즘 `generateDaily(S, day, rng)` (결정)
입력: `day`(정수 dayKey), 주입 `rng() ∈ [0,1)`. **RNG 호출은 정확히 9회**, 고정 순서:
```
band = bandOf(S.best)                         // rng 없음
used = []                                     // 앞 슬롯이 쓴 지표
for slot in 0..2:
    cands = POOL[slot].filter(e => gate(e, S) && !used.includes(e.metric))   // 풀 정의 순서 유지
    r1 = rng()   ; e = cands[ min(cands.length-1, floor(r1 * cands.length)) ]    // 1) 항목 선택
    r2 = rng()   ; hasItem = floor(r2 * 100) < DAILY_ITEM_CHANCE_PCT           // 2) 보상 아이템 유무 (40%)
    r3 = rng()   ; kind = floor(r3 * 2) === 0 ? 'shard' : 'ore'                 // 3) 아이템 종류 (항상 소비)
    goal = e.goals ? e.goals[band] : e.mult[band] * huntReward(S.best)          // 정수
    task = { e: e.id, goal, base: metricValue(S, e.metric), item: hasItem ? kind : null, claimed: 0 }
    used.push(e.metric)
set = { maxDay: day, tasks: [t0,t1,t2], bonus: 0 }
```
- `r2`, `r3`는 쓰이지 않아도 **항상 소비**한다 → 호출 횟수·순서가 항상 같아 시드 고정 테스트가 가능하다(슬롯당 순서: 항목, 유무, 종류).
- 같은 `S`·같은 rng 열이면 같은 세트(결정적). `gate`는 `entry.gate(S)`(`craft_m`만 `S.anvils.length < ANVIL_OWN_MAX`, 나머지 `true`).
- `rng`가 부적격(함수 아님)이면 호출자 책임(주입 필수).
- 생성은 `S.daily`를 **통째로 교체**한다: 이전 날의 `tasks`(수령 못 한 완료 포함)는 버려진다(§17 결정).

### 8.5 일일 보상 (정수 계산 순서는 §7과 같음)
| 항목 | 골드 k | 파편 | 광석 |
| --- | --- | --- | --- |
| ★ 과제 | 2 | `item==='shard'`면 `1 × shardGain(max(5,best))` | `item==='ore'`면 `DAILY_ORE_N`(20)개 |
| ★★ 과제 | 3 | 같음 | 같음 |
| ★★★ 과제 | 5 | 같음 | 같음 |
| 3개 달성 보너스 | 6 | `DAILY_ALL_SHARD_MULT`(2) × `shardGain(max(5,best))` | - |
- 광석 종류: `S.best ≥ ORE_UNLOCK_LV.silver`(7)이면 은광석, 아니면 철광석(수량 20, `ORE_MAX` 상한은 기존 규칙). 수령 시점 `S.best`로 결정(저장하지 않음). 20개는 사냥 10~20회분이다.
- 하루 합계(전부 수령): 골드 `16H`(= 연속 사냥 0.67분), 보너스 파편 `2 × shardGain`, 아이템은 평균 과제당 40% × 1개(파편 `1×shardGain` 또는 광석 20개).
- 수령은 §10(골드·파편·광석 모두 같은 저장에 `claimed`와 함께 기록).
- 하루에 받을 수 있는 최대 가치: 사냥 약 16회분 + 파편 최대 5×`shardGain` + 광석 최대 60개. "하루 몇 분" 이내.

## 9. 날짜 키와 시계 규칙 (결정)

### 9.1 `dayKey` (지역 04:00 기준)
```
DAY_MS        = 86400000
localMs       = nowMs - tzOffsetMin(nowMs) * 60000          // tzOffsetMin = Date.getTimezoneOffset() 규약: UTC보다 서쪽이면 양수 (KST = -540)
dayKey(nowMs) = floor( (localMs - DAILY_RESET_HOUR * 3600000) / DAY_MS )    // DAILY_RESET_HOUR = 4
```
- 오프셋 얻는 방법: **주입 함수** `env.tzOffsetMin(nowMs)`. 브라우저 기본값은 `ms => new Date(ms).getTimezoneOffset()`(해당 시각의 오프셋이라 서머타임 반영). `rules`는 `Date`를 직접 부르지 않는다. 시각 `nowMs`도 주입 시계(`now()`)에서 받는다.
- 정수 연산만 쓴다. `nowMs`가 유한 숫자가 아니면 `refreshDaily`는 아무것도 하지 않는다(`{created:false, reason:'badClock'}`).
- 검증 예(`tzOffsetMin = -540`, KST): `2026-11-19T18:59:59Z`(ms 1795114799000) → **20776**, `2026-11-19T19:00:00Z`(= 04:00 KST, 1795114800000) → **20777**. UTC(`0`): `2026-11-20T03:59:59Z` → 20776, `04:00:00Z` → 20777. EST(`300`): `2026-11-20T08:59:59Z` → 20776, `09:00:00Z` → 20777.
- 서머타임: 전환은 대부분 01~03시라 04:00 경계를 넘지 않고, 넘더라도 단조 `maxDay`가 흡수한다(역행 = 새 세트 없음).

### 9.2 `refreshDaily(S, now, rng, env)` (결정)
1. `S.best < DAILY_UNLOCK_BEST` → `{created:false, reason:'locked'}`. 상태 불변.
2. `now`가 유한 숫자가 아니면 `{created:false, reason:'badClock'}`.
3. `day = dayKey(now)`.
4. `day < S.daily.maxDay` → `{created:false, reason:'rollback'}`. **상태·rng 불변**. 경고·로그·통계 없음(조용히 유지).
5. `day === maxDay`이고 `tasks.length === 3` → `{created:false, reason:'same'}`.
6. 그 외(`day > maxDay`, 또는 `day === maxDay`인데 `tasks`가 비어 있음 = 첫 생성·손상 복구) → `generateDaily(S, day, rng)`, `{created:true, day}`.
- 앞으로 얼마나 점프해도(1일이든 10,000일이든) **세트는 1개**이고 `maxDay = day`다. 7일을 넘는 점프도 같다(별도 처리 없음).
- `maxDay`가 `DAILY_MAXDAY_CAP`을 넘는 값으로 저장돼 있어도 로드 시 `DAILY_MAXDAY_CAP`으로 자른다.

### 9.3 시계 조작 분석
| 상황 | 결과 | 허용 근거 |
| --- | --- | --- |
| 시계를 뒤로 | 새 세트 없음, 기존 세트·진행·수령 상태 유지, 경고 없음, 로그 없음 | 세트가 늘지 않으므로 이득 없음 |
| 뒤로 갔다가 원래대로 | 같은 날 세트 재생성 없음(`maxDay` 불변) | 수령한 보상을 다시 받을 수 없음 |
| 하루 앞으로 | 세트 1개(최대 `16H`, 0.67 연속 분) | 실제 날짜가 하루 지난 것과 같음 |
| 7일 넘게 앞으로 | 세트 1개 | 같음 |
| 앞으로 점프를 반복 | 점프 1회당 세트 1개. 단 `maxDay`가 앞으로 커져 **실제 날짜가 따라올 때까지 새 세트 없음** | 점프를 많이 하려면 시계를 계속 조작해야 하고, 그만큼 미래의 정상 날을 소모한다 |
- 앞으로 조작으로 얻는 이득은 **점프 1회당 사냥 16회분 + 소량 아이템**(확률·게이지·숙련·`BONUS_CAP` 효과 없음)이다. 같은 시간에 사냥을 직접 하면 더 벌 수 있다(연속 사냥은 분당 24H). 조작할 동기가 약해 별도 방어(서버·검증)는 만들지 않는다.
- 기기 시계를 실수로 먼 미래로 맞췄다가 되돌린 경우: 일일 과제는 실제 날짜가 `maxDay`를 따라올 때까지 새로 생기지 않는다(업적은 영향 없음). 수용(결정표). 같은 처지의 `idle.lastSeen` 역행 처리와는 별개(`quests.js`의 `readyAt` 보정과 무관).
- 업적은 시계를 쓰지 않는다(카운터 기반) → 시계 조작이 영향 없다.

## 10. 수령 규칙 (결정)
### 10.1 공통
- `ctx = { active: boolean, storedClaimed?: (kind, key, day) => boolean|'stale' }`. `active`는 `!tabGuard.isSuspended()`(§11). `storedClaimed`는 저장소의 현재 저장을 읽어 해당 항목이 이미 수령됐는지 알려 주는 선택 주입 함수(없으면 확인 생략). 일일(`kind='daily'`)은 `day = S.daily.maxDay`(이 탭 메모리의 세트 날짜)를 함께 넘기며, 구현은 **저장된 `daily.maxDay !== day`이면 `'stale'`**, 같은 날이고 해당 항목 플래그가 1이면 `true`, 아니면 `false`를 돌려준다(업적은 `true`/`false`).
- **검사 순서(고정)**, 실패하면 **상태·rng·저장 불변**:
  1. `inactiveTab` — `ctx.active !== true`
  2. `invalid` — 알 수 없는 id(업적은 `hasOwn`으로 표 확인, 일일은 `which`가 0·1·2·`'bonus'`가 아님)
  3. (일일만) `noDaily` — `daily.tasks.length !== 3`
  4. `claimed` — 메모리 상태에서 이미 수령(업적 `=== 2`, 일일 `task.claimed === 1` / `bonus === 1`)
  5. 저장소 재확인 `ctx.storedClaimed(kind, key, day)`: (a) 결과 `'stale'`(일일만: 저장된 `daily.maxDay`가 이 탭의 `S.daily.maxDay`와 다름 = 다른 탭이 이미 새 날 세트로 교체함) → `stale`. 보상·플래그·저장 불변, 메모리 `daily`도 건드리지 않는다(호출자 `main.js`가 최신 저장을 이어받아 `refreshDaily` 후 다시 그림). (b) 결과 `true`(같은 날이고 다른 탭이 이미 저장함) → `claimed`. 이때 메모리 상태도 수령 완료로 맞춘다(보상은 주지 않음)
  6. `notReached` (업적: 달성 여부를 `syncAchievements`로 갱신한 뒤 상태가 0) / `notDone` (일일: 증가분이 목표 미달, 보너스는 3개 미달성)
  7. 성공
- 성공 시 **한 번의 동기 처리**로: 플래그(`achievements[id] = 2` / `task.claimed = 1` / `bonus = 1`) → 보상 지급(골드·파편·광석) → 통계(`rewardGold`, `dailyDone`/`dailyAll`) → (업적) 칭호 해금(수령 상태 2가 곧 해금). 함수가 끝나면 호출자(`main.js`)가 **즉시 강제 저장**(디바운스 아님)한다. 보상과 플래그는 같은 JSON에 있으므로 새로고침·크래시 후에도 이중 지급이 없다(플래그만 저장되거나 보상만 저장되는 상태가 없다).
- 반환: 성공 `{ok:true, gold, shards, ore:{iron?,silver?}, title?}`, 실패 `{ok:false, reason}`.

### 10.2 함수와 이유 표
| 함수 | 실패 이유(우선순위 순) |
| --- | --- |
| `claimAchievement(S, id, ctx)` | `inactiveTab` → `invalid` → `claimed` → `notReached` |
| `claimDaily(S, which, ctx)` (`which` ∈ 0,1,2,`'bonus'`) | `inactiveTab` → `invalid` → `noDaily` → `claimed`(메모리) → `stale`(저장의 `maxDay` 불일치) → `claimed`(저장) → `notDone` |
| `claimAll(S, ctx)` | `inactiveTab`만 반환(전체 실패). 활성이면 수령 가능한 항목을 **업적 표 순서 → 일일 슬롯 0,1,2 → 보너스** 순으로 각각 위 함수로 수령하고 `{ok:true, claimed:[…], gold, shards, ore}` 반환. 수령 가능 항목이 없으면 `{ok:true, claimed:[]}` |
- `setTitle(S, id)`: `id`가 `''`이거나 수령 완료(상태 2)한 업적이면 `S.title = id`, 아니면 `{ok:false, reason:'invalid'}`(상태 불변). 이 함수는 칭호가 확률과 무관한 장식이라 탭 잠금 검사를 하지 않는다(멈춘 탭에서는 `whenActive`가 입력을 막음).

### 10.3 토스트 문구 (잠정)
| 상황 | 문구 |
| --- | --- |
| 업적 달성 | `업적 달성: <이름> — 기록 탭에서 보상을 받으세요` (여러 개: `업적 N개 달성`) |
| 업적 수령 | `업적 보상: +<골드>G · 파편 <n> · <광석> <n> · 칭호 「<칭호>」` (0인 항목은 생략) |
| 일일 수령 | `일일 과제 보상: +<골드>G` + 아이템이 있으면 ` · 파편 <n>`/` · <광석> <n>` |
| 보너스 수령 | `오늘의 과제 완료! 보너스: +<골드>G · 파편 <n>` |
| 새 세트 도착 | `새 일일 과제가 도착했습니다` (기록 탭 점과 함께, 기존 새로고침은 아님) |
| `claimed` | `이미 받은 보상입니다` |
| `stale` | `일일 과제가 갱신되었습니다` (보상 없음, 화면을 최신 저장으로 다시 그림) |
| `notReached` / `notDone` | `아직 달성하지 못했습니다` |
| `inactiveTab` | 탭 잠금 화면이 이미 떠 있으므로 별도 문구 없음(방어용 `다른 탭에서 진행 중입니다`) |
| 시계 역행 | **표시하지 않음** |

## 11. 두 탭 규칙 (결정)
- 저장은 한 키 `sword-enhance-v2`를 쓰고 `tab-guard.js`가 다른 탭의 저장을 감지하면 이 탭을 멈춘다(`isSuspended()`). **멈춘 탭은 입력을 무시하고(`whenActive`) 저장하지 않는다.**
- 수령·`refreshDaily`·`syncAchievements`의 저장 부작용은 활성 탭만 일으킨다. 멈춘 탭의 `claimAchievement`/`claimDaily`/`claimAll` 호출은 `{ok:false, reason:'inactiveTab'}`(검사 1순위).
- **탭 잠금 이벤트 지연 방어**: `storage` 이벤트는 비동기라 다른 탭이 저장한 직후 이 탭이 아직 멈추기 전에 같은 항목을 수령할 수 있다. 그래서 검사 5(`storedClaimed`)가 저장소의 현재 저장을 읽어 이미 수령된 항목이면 `claimed`를, 일일 과제에서 저장된 `daily.maxDay`가 이 탭과 다르면(다른 탭이 이미 새 날 세트로 교체해 슬롯 번호가 다른 과제를 가리킬 수 있음) `stale`을 돌려주고 보상을 주지 않는다. `main.js`는 `storedClaimed`를 읽기 전용 `SV.peek`(저장소를 건드리지 않고 정규화 결과만 반환)로 읽는 함수로 주입한다(`save.load` 아님) (2026-11-23 변경).
- 이어받기(`takeOver`)·복귀 시 상태 전체를 최신 저장으로 교체하므로 `achievements`·`daily`도 최신 값으로 바뀐다(수령 플래그 유지). 그 직후 `refreshDaily`·`syncAchievements`를 호출한다.
- 두 탭이 같은 날 동시에 `refreshDaily`로 세트를 만들 수 있다? 한 탭만 활성이라 그럴 수 없다. 멈춘 탭이 이어받기 하면 최신 저장(이미 `maxDay`가 새 값)을 받으므로 같은 날 세트를 다시 만들지 않는다.

## 12. UI 사양 (잠정, 5-B에서 확정)
### 12.1 위치·알림
- **새 탭 없음**(데스크톱 사이드 패널 탭 5개, 모바일 하단 바 5개: 상점·대장간·의뢰·방치·기록). 일일 과제·업적은 **기록 탭**(`data-panel="records"`, 이름 "기록")의 새 섹션이다. 기록 탭 패널은 이미 통계·숙련·(A의) 기념비를 가진다.
- 섹션 순서(위→아래): **일일 과제** → 통계 → 숙련 → 기념비 → **업적**. 일일은 매일 보는 것이라 위, 업적은 긴 목록이라 아래.
- **탭 점**: `view.js`의 `TAB_DOT`에 `records: S => A.claimableAny(S)`를 추가한다(기존 `.tab-btn .dot`, 빨간 8px 점). 기록 탭에는 `TAB_COUNT`를 만들지 않는다(개수 배지는 의뢰 전용, 의미 혼동 방지). `claimableAny(S)` = (달성했지만 미수령 업적이 있음) 또는 (일일 과제 중 달성·미수령이 있음) 또는 (보너스 수령 가능). 수령을 모두 하면 점이 사라진다.
- 모바일 하단 바에서도 같은 점이 보인다(기존 규칙). 점이 5번째 탭 라벨·아이콘을 가리지 않는다.

### 12.2 일일 과제 섹션
- 제목: `일일 과제` + 오른쪽 `muted` 문구 `다음 갱신까지 HH:MM`(04:00까지 남은 시간, `dayKey` 경계와 같은 시계). 미해금: 기존 `lockedHTML` 방식 `최고 +5 이상에서 열림`.
- 카드 3장(★/★★/★★★ 표기): 한 줄 설명(예: `수동 사냥 20회`), 진행 막대 `progress/goal`(숫자 포맷은 `fmt`), 보상 요약(`+2,680G` + 아이템 있으면 `💠`/광석 아이콘). 상태 표시:
  | 상태 | 표시 | 버튼 |
  | --- | --- | --- |
  | 진행 중 | 막대 + `진행/목표` | 없음(비활성 `받기` 대신 숨김) |
  | 달성(미수령) | 막대 가득 + 강조 테두리 | `받기`(활성) |
  | 수령 완료 | 흐리게 + `✔ 받음` | 없음 |
  | 멈춘 탭 | 탭 잠금 화면이 이미 입력을 막음 | - |
- 하단 보너스 줄: `오늘 3개 모두 달성: 보너스 +<골드>G · 파편 <n>`, 상태 같음. 3개 달성 전엔 `n/3 달성`.
- 세트가 없을 때(미해금·첫 생성 전): 섹션 대신 안내 문구.
- 모든 보상 금액은 §7 공식 값을 **지금 best 기준**으로 미리 보여 준다(수령 시점 값과 같다).

### 12.3 업적 섹션
- 제목: `업적` + `수령 N/34`. 트랙별 그룹(11개 트랙 + 단발): 트랙 이름과 단계 `I II III` 칩.
- 행(한 업적): 이름, 조건 문장(`강화 1,000회 시도`), 진행 `현재/목표`(카운터·best·기념비·특성 종류 수), 보상 요약(`+3H`가 아니라 **금액**과 파편·광석·칭호). 상태: 잠김(진행률 막대 표시) / 달성(미수령, 강조, `받기`) / 수령 완료(`✔`, 칭호 이름).
- 상단에 `모두 받기` 버튼(수령 가능 항목이 없으면 비활성). 일일 수령 가능 항목도 같이 받는다.
- 칭호: 섹션 하단 또는 상단에 `칭호` 선택(수령한 업적의 칭호 목록, 없음 선택 가능). 현재 칭호는 기록 탭 상단 요약과 상단 바(이름 옆, 잠정)에 `「칭호」`로 표기. **칭호는 순수 장식**이다.
- 모바일 360px: 행이 한 줄로 줄어 내용이 넘치면 보상 요약이 줄바꿈하되 카드 밖으로 넘치지 않는다(`overflow:hidden`·줄바꿈). 가로 스크롤이 생기지 않는다(최근 카드 넘침 수정 f79e94f 규칙을 따른다).
- 접근성: 상태를 색만으로 구분하지 않고 글자(`받기`/`✔ 받음`/`진행 중`)를 병기한다.

## 13. 저장 필드 (`m1-storage.md` 형식, v2 유지: add-field + default-merge)
| 필드 | 타입 | 기본값 | 범위 | 정규화 | 담당 |
| --- | --- | --- | --- | --- | --- |
| `achievements` | 객체 `{ [id]: 1\|2 }`(희소) | `{}` | 키 = 업적 표 id(34개) | 객체가 아니면 `{}`. 키가 `hasOwn(ACH_BY_ID)`가 아니면 버림(`constructor`·`__proto__` 방어). 값은 `int(v, 0, 0, 2)`; 0이면 버림 | `achievements.js`, `save.js` |
| `title` | 문자열 | `''` | `''` 또는 업적 id | 문자열이 아니거나, 그 id가 `achievements`에서 2가 아니면 `''` | `save.js` |
| `daily.maxDay` | 정수 | 0 | 0..`DAILY_MAXDAY_CAP`(1,000,000) | `int(v, 0, 0, DAILY_MAXDAY_CAP)` | `achievements.js` |
| `daily.tasks` | 길이 0 또는 3 배열 | `[]` | 과제 객체 3개 또는 빈 배열 | 배열이 아니거나 길이가 3이 아니거나 하나라도 무효면 전체 `[]`. 아래 필드 규칙 | 〃 |
| `daily.tasks[].e` | 문자열 | - | 해당 슬롯 풀의 항목 id | `hasOwn(POOL_BY_ID)`가 아니거나 그 슬롯 풀 소속이 아니면 과제 무효(→ 전체 `[]`) | 〃 |
| `daily.tasks[].goal` | 정수 | - | 1..`DAILY_GOAL_MAX`(1e12) | `int(v, 1, 1, DAILY_GOAL_MAX)` | 〃 |
| `daily.tasks[].base` | 정수 | 0 | 0..현재 `stats[지표]` | `int(v, 0, 0)` 후 **현재 지표값으로 자른다**(`min(base, stats[metric])`) — 평생 지표가 줄어든 저장(수동 편집·환생 초기화)에서도 과제가 영원히 안 끝나지 않게 | 〃 |
| `daily.tasks[].item` | `null\|'shard'\|'ore'` | `null` | | 그 외 값은 `null` | 〃 |
| `daily.tasks[].claimed` | 0/1 | 0 | | truthy이면 1 | 〃 |
| `daily.bonus` | 0/1 | 0 | | truthy이면 1 | 〃 |
| `stats.hunts` / `sells` / `autoRuns` / `dailyDone` / `dailyAll` / `rewardGold` | 정수 ≥ 0 | 0 | | `STAT_KEYS`에 7개 추가(기존 `normCounts`): 위 6개 + `eventsSeen`(F13 훅, `m2-events.md`, 수용) (2026-11-23 변경) | `save.js` |
- `daily.tasks`가 빈 배열인데 `maxDay`가 큰 값이면(손상 복구 등): `refreshDaily` 5·6단계 규칙에 따라 `day === maxDay`일 때만 다시 만든다(역행이면 만들지 않음).
- 버전 `v`는 2 유지(마이그레이션 없음). 옛 저장은 기본값으로 로드되고, 옛 클라이언트가 새 저장을 읽으면 새 필드를 무시한다(옛 클라이언트가 다시 저장하면 `achievements`·`daily`가 사라지는 것은 배치 A의 `trait`와 같은 수용). 실제 구현 중 `defaultState`에 위 필드를 넣는다.
- `normalize`는 항상 `achievements`·`title`·`daily`를 정규화하고 다른 필드는 그대로 둔다. `S.daily`는 `daily.tasks`가 없거나 무효여도 에러 없이 기본 객체를 만든다.

## 14. 제안 상수 (`js/constants.js` 추가)
| 이름 | 값 | 의미 |
| --- | --- | --- |
| `ACH_ROUND` | 10 | 업적·일일 골드 반올림 단위(G) |
| `ACH_EARLY_BEST` | 13 | `S.best`가 이 값 미만이면 골드를 `ACH_EARLY_PCT`%로 지급(§7.3) |
| `ACH_EARLY_PCT` | 50 | 초반 골드 비율(%) |
| `SELL_COUNT_MIN_LV` | 5 | `stats.sells`에 세는 최소 검 단계 |
| `ACHIEVEMENTS` | §5 표의 34개 배열(id, track, tier, name, title, metric, need, k, shard, ore) | 데이터 주도 |
| `ACH_METRICS` | `{tries,success,destroy,hunts,delivered,sinkGold,traitRolls,dailyDone: 'stat', best: 'best', monumentCount: 'derived', traitKindCount: 'derived', hasPerfectTrait: 'derived'}` | 지표 분류 |
| `DAILY_UNLOCK_BEST` | 5 | 일일 과제 해금(`S.best ≥ 값`) |
| `DAILY_RESET_HOUR` | 4 | 갱신 시각(지역 시간) |
| `DAY_MS` | 86400000 | 하루(ms) |
| `DAILY_TASKS` | 3 | 과제 수 |
| `DAILY_BANDS` | `[5, 10, 15, 20]` | 목표 밴드 하한(best) |
| `DAILY_POOL` | §8.2 표의 10개 항목(슬롯별 배열) | `{id, slot, metric, goals\|mult, gate}`. `craft_m.gate = S => S.anvils.length < ANVIL_OWN_MAX`, 나머지 `S => true`. 구현의 `constants.js`는 게이트를 함수가 아닌 **이름 문자열**로 저장한다(`craft_m`은 `'anvilRoom'`). `achievements.js`의 `DAILY_GATES.anvilRoom`이 함수로 해석한다 (2026-11-23 변경) |
| `DAILY_TASK_K` | `[2, 3, 5]` | ★/★★/★★★ 골드 배수 |
| `DAILY_ALL_K` | 6 | 3개 달성 보너스 골드 배수 |
| `DAILY_ALL_SHARD_MULT` | 2 | 보너스 파편 배수(×`shardGain`) |
| `DAILY_ITEM_CHANCE_PCT` | 40 | 과제 아이템 확률(%) |
| `DAILY_ORE_N` | 20 | 광석 아이템 수량 |
| `DAILY_GOAL_MAX` | 1e12 | 저장 목표 상한 |
| `DAILY_MAXDAY_CAP` | 1000000 | 저장 `maxDay` 상한(약 2700년 후, 방어용) |
| `TITLE_NONE` | `''` | 칭호 없음 |

`STAT_KEYS`(save.js)에 `hunts`, `sells`, `autoRuns`, `dailyDone`, `dailyAll`, `rewardGold`, `eventsSeen`(F13 이벤트 훅, 수용) 총 7개 추가 (2026-11-23 변경).

## 15. `rules`·`achievements.js`에 추가할 순수 함수 (코드는 이 문서에서 작성하지 않음)
- `rewardGold(S, k)`, `shardReward(S, m)` — §7.
- `achMetric(S, metric)`, `monumentCount(S)`, `traitKindCount(S)`, `hasPerfectTrait(S)` — 지표.
- `syncAchievements(S)` → 새 달성 id 배열 (§6).
- `claimAchievement(S, id, ctx)`, `claimDaily(S, which, ctx)`, `claimAll(S, ctx)`, `setTitle(S, id)` — §10.
- `claimableAny(S)`, `claimableCount(S)` — UI 점·`모두 받기`.
- `dayKey(nowMs, tzOffsetMin)`, `bandOf(best)`, `dailyProgress(S, slot)`, `dailyDone(S, slot)`, `dailyAllDone(S)`, `generateDaily(S, day, rng)`, `refreshDaily(S, now, rng, env)` — §8·§9.
- 훅 수정: `idle.manualHunt`(`hunts++`), `idle.runAutoCatchup`(`autoRuns += runs`), `rules.sellSword`(`lv ≥ SELL_COUNT_MIN_LV`이면 `sells++`). `save.js`: `STAT_KEYS`, `defaultState`, `normAchievements`, `normDaily`, `normTitle`. `main.js`: `syncAchievements`·`refreshDaily` 호출 위치(§6, §9), 강제 저장, `storedClaimed` 주입, 토스트. `view.js`: `TAB_DOT.records`, 섹션 렌더. `index.html`은 기록 패널 안에 섹션 컨테이너만 추가.

## 16. 인수 조건 (Given/When/Then)
시계는 `now`·`tzOffsetMin`을 주입, RNG는 시드 고정 가짜 함수, 저장소는 메모리.

**날짜 키·시계**
1. Given `tzOffsetMin=-540` / When `dayKey(1795114799000)`와 `dayKey(1795114800000)` / Then 20776과 20777(04:00 KST 경계).
2. Given `tzOffsetMin=0`, `300` / When 04:00 경계 `1795147199000`/`1795147200000`(UTC), `1795165199000`/`1795165200000`(EST) / Then 각각 20776/20777.
3. Given `tzOffsetMin`이 시각에 따라 달라지는 주입 함수(전환 전 300, 후 240) / When 같은 `nowMs`로 두 번 호출 / Then 결과는 항상 같다(결정적). 오프셋은 `nowMs`를 인수로 받아 호출된다.
4. Given `S.best=4` / When `refreshDaily` / Then `{created:false, reason:'locked'}`, `daily`·rng 호출 0. Given `S.best=5` / Then 세트 생성.
5. Given 새 게임 상태(`maxDay=0`)·best 5·`day=20777` / When `refreshDaily` / Then `created:true`, `maxDay=20777`, `tasks.length=3`, rng 정확히 9회 호출.
6. Given 같은 `day`에서 다시 `refreshDaily` / Then `{created:false, reason:'same'}`, rng 호출 0, 세트 불변.
7. Given `maxDay=20777`, 세트·진행 있음 / When `now`가 `dayKey=20776`(하루 뒤로) / Then `reason:'rollback'`, 세트·진행·수령 플래그·rng 모두 불변, 어떤 토스트·로그도 만들지 않는다.
8. Given 위 뒤로 간 상태에서 시계를 `20777`로 되돌림 / Then `same`: 세트가 다시 생성되지 않고, 이미 수령한 과제를 다시 받을 수 없다(`claimed`).
9. Given `maxDay=20777` / When `dayKey=20778`(하루 앞) / Then 세트 1개 생성, `maxDay=20778`, 이전 세트 폐기(진행·수령 상태 초기화).
10. Given `maxDay=20777` / When `dayKey=20777+30`, `+8`, `+10000` / Then 각각 세트 **1개**만 생성(rng 9회), `maxDay`는 새 값.
10a. Given 위 `+30` 점프 직후 `dayKey=20778`(실제 날짜가 정상으로 돌아옴) / Then `rollback`(새 세트 없음). 실제 날짜가 `maxDay`를 따라잡은 뒤에야 다시 생성된다.
10b. Given 1주 오프라인(자동 ON) 후 복귀 / When `resume` → `refreshDaily` / Then 세트 1개, 누적·연속 보너스 없음, 이전 세트의 미수령 보상 없음.
10c. Given `nowMs`가 `NaN`/`Infinity`/문자열 / When `refreshDaily` / Then `{created:false, reason:'badClock'}`, 상태 불변.

**생성 알고리즘**
11. Given 시드 고정 rng 열 `[0.0, 0.0, 0.0,  0.0, 0.0, 0.0,  0.0, 0.0, 0.0]`, best 5(밴드 0) / When `generateDaily` / Then 슬롯별 항목은 각 풀의 첫 후보(`hunt_s`, `succ_m`, `dlv_l`), 아이템 확률 `floor(0×100)=0 < 40`이라 모두 아이템 있음, 종류는 모두 `'shard'`. rng 호출은 9회이고 슬롯마다 (항목, 유무, 종류) 순서다.
12. Given 모루 보유 < 6, rng 열 전부 `0.99` / When 생성 / Then 슬롯 0은 `tries_s`, 슬롯 1은 `craft_m`(후보 4개의 마지막), 슬롯 2는 `tries`가 이미 쓰였으므로 후보 `[dlv_l, hunt_l]`의 마지막인 `hunt_l`, 아이템 없음(`99 < 40` 거짓), 종류 값은 소비만 됨. 호출 9회.
13. Given 슬롯 0이 `hunt_s`(지표 `hunts`)를 골랐을 때 / When 슬롯 2 후보를 계산 / Then `hunt_l`은 후보에서 빠지고 `dlv_l`/`tries_l`만 남는다. 슬롯 0이 `auto_s`이면 `hunt_l`·`tries_l`·`dlv_l` 모두 후보.
14. Given 같은 `S`·같은 rng 열로 두 번 생성 / Then 세트가 완전히 같다.
15. Given best 5/10/15/20 / When 같은 항목이 뽑히면 / Then 목표는 밴드 0/1/2/3의 값(예: `hunt_s` 10/15/20/25). `gold_m`은 `goal = 20/25/30/30 × huntReward(best)`(정수).
16. Given 생성 직후 / Then 각 과제의 `base`는 그 시점의 지표값이고 진행도는 0이다. 이후 지표가 +n 되면 진행도 `min(n, goal)`, 평생 값이나 생성 이전 증가분은 더해지지 않는다.
17. Given best 5에서 `sinkGold`/`hunts` 등 지표가 큰 값(예: `hunts=500`) / When 세트 생성 / Then `base=500`이고 진행도 0이다(이중 계산 없음).
18a. Given 모루 6개 보유(`ANVIL_OWN_MAX`), rng 열 전부 `0.99` / When 생성 / Then 슬롯 1 후보는 `[succ_m, gold_m, sell_m]` 3개이고 선택은 `sell_m`(`craft_m` 없음). 모루 5개면 `craft_m` 후보 포함. 두 경우 모두 rng 정확히 9회.
18b. Given best 5·10·15·20 × 모루 0·5·6개 × rng 열 전부 `0`과 전부 `0.99`(24가지) / When 생성 / Then 예외 없이 `tasks.length=3`, 모든 슬롯 후보 수 ≥ 1, 슬롯 2 후보에 `dlv_l`이 항상 포함(지표 제외 후에도), 선택 항목이 `undefined`인 경우 없음, rng 9회.
18. Given best 13이어도 / Then 풀에 사용처·파괴 과제는 없다(§8.2 항목만 생성).

**진행·오프라인**
19. Given `autoOn`이고 `runAutoCatchup`이 3회 실행 / Then `stats.autoRuns`가 3 늘고, `settleOffline`(복귀 정산)은 `autoRuns`·`hunts`·`huntGold`를 늘리지 않는다(`offlineGold`만).
20. Given `lv ≥ 5`인 검 판매 / Then `stats.sells`+1. `lv 0~4` 검 판매는 `sells` 불변.
21. Given 수동 사냥 1회 / Then `stats.hunts`+1.
22. Given 오프라인 8시간 복귀 / Then 일일 과제 진행도가 오프라인 지급으로 오르지 않는다.

**일일 수령**
23. Given 과제 슬롯 1이 달성·미수령, best 13 / When `claimDaily(S, 1, {active:true})` / Then `{ok:true}`, 골드 `rewardGold(S, 3)` = 8,030 증가(H=2,676), `task.claimed=1`, `stats.rewardGold`·`dailyDone` +1, 아이템이 있으면 파편 `1×39`(best 13) 또는 광석 20개(은광석, best ≥ 7) 증가.
24. Given 같은 호출을 한 번 더 / Then `{ok:false, reason:'claimed'}`, 골드·파편·광석 불변.
25. Given 과제 진행도가 목표 미만 / Then `{ok:false, reason:'notDone'}`.
26. Given `which`가 `3`, `-1`, `'x'`, `undefined` / Then `invalid`. Given `S.daily.tasks=[]` / Then `noDaily`(단 `which`는 유효).
27. Given 3개 모두 달성·미수령 / When `claimDaily(S,'bonus',…)` / Then `ok`, 골드 `rewardGold(S,6)`(best 13: 16,060), 파편 `2×39`, `daily.bonus=1`, `dailyAll`+1. 3개 중 하나라도 미달성이면 `notDone`. 이미 받았으면 `claimed`.
27a. Given 3개 달성했지만 일부 과제는 미수령 / When 보너스 수령 / Then 허용(수령 불필요, 달성만 필요).
28. Given 검사 순서 / When 상태가 모두 실패 조건(비활성·잘못된 인자·이미 수령·미달성)을 동시에 만족 / Then 반환 이유는 `inactiveTab`(최우선) → `invalid` → `noDaily` → `claimed` → `notDone` 순서다.

**두 탭·수령 멱등**
29. Given `ctx.active=false` / When 어떤 수령 함수든 / Then `{ok:false, reason:'inactiveTab'}`, 골드·플래그·rng·저장 불변(다른 모든 조건이 충족돼 있어도).
30. Given 두 인스턴스(탭 A, B)가 같은 메모리 저장소를 공유하고 A가 항목 X를 수령해 저장 / When B(`active:true`, 아직 멈추지 않은 상태, 오래된 상태)가 `ctx.storedClaimed`를 주입해 X를 수령 시도 / Then `claimed`, 보상·플래그 변화 없음, B의 메모리 상태도 수령 완료로 맞춰진다.
30d. Given 탭 B의 메모리 `daily.maxDay=20777`·슬롯 1 달성·미수령, 저장소(탭 A가 저장)의 `daily.maxDay=20778`(새 세트, 슬롯 1 미수령·미달성) / When B(`active:true`)가 `claimDaily(S,1,{active:true, storedClaimed})` / Then `{ok:false, reason:'stale'}`, 골드·파편·광석·플래그·`stats`·B의 메모리 `daily`·저장 모두 불변(`claimed`가 아님). 같은 호출에서 저장 `maxDay=20777`이고 슬롯 1이 수령됨이면 `claimed`. 저장 `maxDay`가 같고 미수령이면 정상 수령. 업적은 `maxDay` 비교 없음.
30a. Given A가 수령하고 저장한 뒤 B가 `takeOver`(최신 저장 이어받기) / Then B의 `achievements`·`daily` 수령 플래그가 A의 값과 같고, 다시 수령해도 `claimed`.
30b. Given 수령 성공 직후 저장 JSON / Then 같은 JSON에 보상 반영(`gold`/`shards`/`ore`)과 수령 플래그가 함께 있다(플래그만 또는 보상만 있는 저장이 없다). 저장 후 다시 불러와 같은 항목을 수령하면 `claimed`.
30c. Given 멈춘 탭 / When `refreshDaily`/`syncAchievements` 호출 / Then `main`이 호출하지 않는다(멈춘 탭은 상태 변경·저장 없음). 이어받기 후에는 최신 저장 기준으로 호출한다.

**업적 판정·수령**
31. Given 업적 표 34개 / Then id가 유일하고, 각 `need`·`k`·`shard`·`ore`·`title`이 §5 표와 같고 칭호 34개가 서로 다르다. `k` 합 131, `shard` 합 30(3-단계 트랙 9개 × 3 + `dlv` 2 + `perfect` 1).
32. Given `stats.tries=99` / When `syncAchievements` / Then `tries_1`은 0 유지. `tries=100`이면 1이 되고 반환 목록에 `tries_1`이 있다. 다시 호출해도 반환 목록은 빈 배열(멱등).
33. Given `knd_1`이 래치(1)된 뒤 검을 팔아 종류 수가 2로 줄어듦 / When `syncAchievements` / Then `knd_1`은 1 유지(래치). 수령 완료(2)는 절대 내려가지 않는다.
34. Given `monuments=[1,0,1,0,0,0,0,0]` / Then `monumentCount=2`, `mon_1`만 달성. 8칸 모두 1이면 `mon_3`.
35. Given `swords`의 특성이 `{hunt,2}`, `{work,1}`, `{trade,3}`, `null` / Then `traitKindCount=3`(`knd_1` 달성), `hasPerfectTrait=true`(`perfect` 달성). 같은 종류 두 자루는 1로 센다.
36. Given 업적 수령 (`best_1`, best 10) / Then 골드 = `rewardGold` 50% 적용: `floor(1×423×50/100)=211` → `roundTo(211,10)=210`. best 13이면 100%: 2,680.
37. Given 업적 수령 직후 `chances(sword, opts)`·게이지·숙련·`BONUS_CAP` / Then 수령 전과 같다(확률 불간섭). `claim*`·`setTitle`·`refreshDaily`는 이 값을 읽지도 쓰지도 않는다.
38. Given 달성했지만 수령 전 / Then 칭호가 선택 불가(`setTitle` → `invalid`). 수령 후 `setTitle(S, id)` → `ok`, `S.title=id`. `setTitle(S,'')`는 `ok`(없음).
39. Given 수령 성공 / Then 보상의 골드는 `S.gold`·`stats.rewardGold`에만 더해지고 `stats.earned`·`huntGold`·`offlineGold`·`shardsGained`는 불변.
40. Given 광석 보상 `hunt_2`(철 40) 시 철광석이 9990개 / Then 철광석은 9999(상한), 수령은 성공(`claimed` 처리)이다.
41. Given best 17, `tries_3` 수령 / Then 골드 `rewardGold(S,6)` = 188,070, 파편 `2×68=136`. best 20, `best_3`(k=8) / Then 골드 1,587,700, 파편 `2×100`.
42. Given 보상 계산 순서 / Then `roundTo`는 마지막에 한 번만 적용된다(best 17, k=3 → 94,040; k=5 → 156,730). 중간에 소수를 만들지 않는다.
43. Given `claimAll` / When 수령 가능 업적 2개 + 일일 1개 + 보너스 불가 / Then 업적 표 순서 → 일일 슬롯 순서로 각각 수령하고 반환 `claimed`에 순서대로 들어간다. 비활성 탭이면 `inactiveTab`.

**저장·정규화**
44. Given 새 게임 / Then `achievements={}`, `title=''`, `daily={maxDay:0, tasks:[], bonus:0}`, 새 `stats` 7개(`hunts`·`sells`·`autoRuns`·`dailyDone`·`dailyAll`·`rewardGold`·`eventsSeen`) 0 (2026-11-23 변경).
45. Given 저장의 `achievements`가 `[]`, `"x"`, `{tries_1:2, bogus:1, constructor:2, succ_1:'1', best_1:9, dest_1:0}` / When 로드 / Then `{}`, `{}`, `{tries_1:2, succ_1:1, best_1:2}`(알 수 없는 키 버림, 값 clamp, 0 버림)이다. 예외 없음.
46. Given `title`이 `5`, `'tries_1'`(아직 미수령), `'tries_1'`(수령 완료) / Then `''`, `''`, `'tries_1'`.
47. Given `daily`가 없음/`null`/`[]`/`tasks`가 길이 2 / Then 기본 `daily`(`tasks=[]`)이고 `maxDay`가 있으면 유지.
48. Given `tasks[].e`가 슬롯 풀 밖(예: 슬롯 0에 `succ_m`) / Then 전체 `tasks=[]`(복구). `goal` 문자열 `'20'` → 20, `0` → 1, `base`가 현재 지표보다 큼 → 현재 지표값으로 자름.
49. Given `maxDay`가 `'20777'`, `-5`, `1e9` / Then 20777, 0, `1,000,000`.
50. Given 옛 v2 저장(새 필드 없음) / When 로드 / Then 새 필드가 기본값으로 채워지고 다른 필드·`v=2`는 그대로, 저장 후 다시 불러와도 같은 상태.
51. Given `daily.tasks`가 빈 배열이고 `maxDay=D`, `dayKey=D` / When `refreshDaily` / Then 복구 생성(rng 9회). `dayKey<D`면 생성하지 않는다.

**기존 시스템 회귀**
52. Given F4 의뢰 상태·`readyAt`·`deliver` 결과 / When F12 코드가 적용된 뒤 같은 입력 / Then 변하지 않는다. `stats.delivered`는 기존대로 +1.
53. Given 기존 수입(`huntReward`·`autoReward`·`boosterPrice`·`cost`·`sell`) / Then 출력 불변. `manualHunt`의 반환 `gold`·`ore`는 같고 `hunts`만 늘어난다.
54. Given 이름 규칙 / Then 기록 탭의 일일 과제 UI 문구에 "의뢰"·"퀘스트"가 없고, 의뢰 탭 문구에 "과제"·"일일"이 없다(문자열 검사).

**UI**
55. Given 수령 가능한 업적/일일/보너스가 하나도 없음 / Then 기록 탭에 점이 없다. 하나라도 생기면 점이 보이고, 모두 수령하면 사라진다. 의뢰 탭의 개수 배지는 영향 없다.
56. Given 기록 탭 / Then 섹션 순서가 일일 과제 → 통계 → 숙련 → 기념비 → 업적이다. 새 탭 버튼은 없고 탭바는 5칸 그대로다.
57. Given 달성·미수령 항목 / Then `받기` 버튼이 보이고 클릭하면 §10.3 토스트가 나온다. 수령 완료는 `✔`와 흐린 스타일, 진행 중은 막대와 `현재/목표`.
58. Given 모바일 360px / Then 일일·업적 행에서 가로 스크롤과 카드 밖 넘침이 없다.
59. Given 시계 역행 / Then 어떤 경고·토스트도 표시되지 않고 일일 섹션은 기존 세트를 그대로 보여 준다. `다음 갱신까지` 표시는 현재 시계 기준(역행이어도 오류 없음, 음수면 `00:00`으로 표시).

## 17. 결정표
중요도: high = 바뀌면 다른 문서·코드가 크게 달라짐 / low = 수치·표현으로 되돌릴 수 있음.
| 질문 | 선택 | 대안 | 이유 | 중요도 |
| --- | --- | --- | --- | --- |
| 업적 보상 형태 | **칭호 + 소액 골드(`k×H`) + 파편 + 광석, 1회성** | 업적 포인트 상점, 영구 보너스 | 사용자 결정. 포인트 상점은 배치 A 사용처와 경쟁하고 영구 보너스는 확률·수입을 건드릴 위험 | high |
| 확률 효과 | **없음**(`chances()` 미접촉) | 업적 보너스 확률 | 하드 규칙(`m2-traits.md` §2와 같은 이유: 페이스 보존) | high |
| 업적 수와 구성 | **34개(11트랙×3 + 단발 1)** | 50+, 트랙 4~5개 | 25~35 목표, 모든 지표를 한 번씩 훅 | low |
| 골드 규모 | **업적 합 131H(연속 사냥 5.5분), 일일 하루 16H(0.67분)** | 더 크게 | 배치 A 사용처(약 46분) 대비 12%, 1회성. 일일은 하루 몇 분 이내 | high |
| 초반 골드 50% | **`best < 13`이면 50%** | 없음, 초반 보상 없음 | +5~+12 구간 가속을 사냥 10회분 이하로 제한. 완전 제외보다 보상 체감 유지 | high |
| 보상 기준 시점 | **수령 시점 `H`** | 달성 시점 저장 | 저장 필드 없음, 계산 단순, 어떤 시점이든 `k÷24`분 상한 | low |
| 골드 계산 순서 | **`k×H×pct` 곱 → `/100` floor → `roundTo(10)`** | 소수 곱, 100 반올림 | 정수 안전, 초반 H(10)에서 100 반올림은 왜곡 | low |
| 반올림 단위 | **10G** | 100G | 초반 H가 10 단위(`GOLD_ROUND`와 동일) | low |
| 파편 보상 | **`m × shardGain(max(5,best))`**, 통계 `shardsGained`에는 미포함 | 고정 개수 | 초반 폭주·후반 무의미 방지, `QUEST_SHARD_MIN_LV` 선례 | low |
| 광석 보상 | **철·은만 고정 개수**(미스릴 없음) | 미스릴 포함 | `ORE_UNLOCK_LV`가 달라 초반 지급 방지 | low |
| 소비 업적 비율 | **보상 ≤ 사용 금액의 3%** | 더 크게 | 사용처 가격 실효 할인 방지(§7.4) | high |
| 업적 판정 방식 | **래치 + `syncAchievements`**(행동 직후 호출) | 렌더마다 계산 | 파생 지표(검 판매로 감소) 대응, 저렴 | low |
| 업적 저장 | **희소 객체 `{id: 1\|2}`** | 배열, 비트마스크 | 알 수 없는 id 버림·가독성 | low |
| 칭호 | **수령해야 해금, 선택 1개 `S.title`**, 장식 전용 | 자동 해금 | 수령 의미 부여 | low |
| 일일 과제 이름 | **"일일 과제"(★ 표기)** | "일일 의뢰" | F4 "의뢰"·쉬움/보통/어려움과 구분(§2) | high |
| 일일 해금 | **`S.best ≥ 5`** | 처음부터, 13 | 방치·대장간 해금과 맞춤, 첫 분의 혼란 방지 | low |
| 일일 목표 방식 | **카운터 증가분(`base` 스냅샷)** | 평생 값 비교 | 이중 계산·이전 날 진행 방지 | high |
| 일일 풀 | **사냥·자동·강화·성공·골드·판매·제작·납품만** | 파괴·사용처 과제 | 자연스러운 행동만. 파괴·소비를 강요하지 않음(사용처 과제는 골드가 없으면 불가능해져 짜증) | high |
| 슬롯 풀 겹침 | **지표 중복 금지(슬롯 2에서 제외)** | 중복 허용 | "수동 사냥 10회 + 30회" 같은 이중 과제 방지 | low |
| RNG 호출 | **9회 고정(슬롯당 항목·유무·종류, 미사용분도 소비)** | 가변 | 시드 고정 테스트 | low |
| 일일 보상 | **k=[2,3,5], 보너스 6, 아이템 40%(파편 1회분 또는 광석 20)** | 더 큼 | 하루 0.67분, 소량 | low |
| 보너스 조건 | **3개 달성(수령 불필요)** | 3개 수령 | 순서 강요 없음 | low |
| 이전 날 미수령 | **버린다**(새 세트로 교체) | 하루 유예 보관 | 규칙·저장 단순. 보상이 작고 `다음 갱신까지` 표시로 인지 가능 | low |
| 날짜 기준 | **지역 04:00**(`dayKey`) | 자정 | 밤샘 플레이 배려, 사용자 결정 | high |
| 시간대 얻는 법 | **주입 `tzOffsetMin(nowMs)`(기본 `Date.getTimezoneOffset`)** | `Date` 직접 호출 | 테스트·서머타임, 순수 함수 유지 | high |
| 오프라인 | **세트 1개(적립·연속 없음)** | 쌓기·연속 | 사용자 결정 | high |
| 시계 조작 | **`maxDay` 단조: 역행 무시, 앞 점프 세트 1개** | 서버 시간, 하루 1회 제한 | 오프라인 전용(서버 없음). 점프 1회당 0.67분, 확률 효과 없음 | high |
| 역행 경고 | **표시·로그 없음, 상태 유지** | 경고 | 사용자 결정(가짜 경고로 정상 사용자 불편 방지) | low |
| 먼 미래 시계 실수 | **복구 없음**(실제 날짜가 따라올 때까지 일일만 정지) | N년 초과 시 허용 | 사용자 결정 규칙(역행 = 새 세트 없음)과 일관. 업적은 영향 없음. `DAILY_MAXDAY_CAP` 방어만 | low |
| 수령 멱등성 | **항목별 `claimed` + 보상과 같은 저장, 저장소 재확인(`storedClaimed`)** | 낙관적 쓰기 | 탭 잠금 이벤트 지연 방어 | high |
| 수령 검사 순서 | **inactiveTab → invalid → (noDaily) → claimed → (stale, 일일만) → claimed(저장) → notReached/notDone** | 다른 순서 | 활성 아님이면 아무것도 읽지 않는다 | high |
| UI 위치 | **기록 탭 섹션 + 탭 점(`TAB_DOT.records`)** | 새 탭 | 탭 5칸 가득, 사용자 결정 | high |
| 탭 점 vs 개수 | **점만**(개수 배지는 의뢰 전용) | 개수 | 의미 혼동 방지 | low |
| 섹션 순서 | **일일 → 통계 → 숙련 → 기념비 → 업적** | 업적 위 | 매일 보는 것이 위 | low |
| 연속 출석 | **없음** | 연속 보너스 | 사용자 결정(B에선 없음, 환생 연동은 C) | high |
| 모두 받기 | **있음**(`claimAll`) | 개별만 | 34개 업적 + 일일을 한 번에 | low |
| 지표 `sells` 최소 단계 | **+5 이상만 센다** | 모두 | 싼 검 반복 구매·판매 카운터 방지 | low |
| 새 모듈 | **`js/achievements.js`** | `quests.js` 확장 | F4와 이름·코드 분리 | low |
| 저장 버전 | **v2 유지** | v3 | 필드 추가만 | low |

## 18. C(환생)에서 확정됨 (확정: m2-rebirth.md §8·§13, 아래 표는 잠정값 기록)
| 항목 | 잠정 기본값 |
| --- | --- |
| 업적(`achievements`)·칭호(`title`) | **유지**(영구 수집) |
| 일일 상태(`daily`) | **유지**(날짜 기반이며 진행 기반이 아님). 환생으로 세트를 새로 주지 않음 |
| 평생 카운터(`stats.tries` 등) | **초기화하지 않음** 잠정. C가 초기화하는 카운터가 있으면 일일 `base`는 정규화(`min(base, stats)`)로 안전하게 처리됨 |
| 환생 후 초기화될 수 있는 지표 | `best`(`best_*` 래치로 보호), `monuments`(환생 시 기념비 유지, m2-rebirth.md §8), 특성 종류 수(래치). 래치는 34개 업적 전부에 적용되며, 환생으로 줄어드는 지표 중 래치가 지키는 것: best_*·knd_*·perfect (2026-11-23 변경) |
| 환생 후 새 업적 | 확정: m2-rebirth.md §13 — M2에서는 없음(후속 선택) |
| 업적 보상 재수령 | **불가**(수령 상태 유지) |
| 연속 출석 | 확정: 없음(m2-rebirth.md §8) |
| `stats.dailyAll`·`rewardGold` 활용 | 확정: 새 용도 없음(m2-rebirth.md §13) |

## 19. 열린 질문 (사용자 결정 필요)
없음. 모든 갈림길은 §17 결정표에 권장안으로 기록했다.

## 20. m2-overview 갱신 제안
`m2-overview.md`가 이 배치에서 바꿔야 할 항목:
1. **A.2·A.3 상태표**: 4-2 F12 업적·일일 → "배치 B 기획 완료(`m2-achievements.md`), 구현 전"로 변경. A.4 지도의 "업적 보상 상점" 행은 **"없음(확정): 업적 보상은 무료 지급, 상점 없음"**으로 확정 표기.
2. **D 저장 필드 표**: 배치 B 필드를 추가 — `achievements`(희소 객체), `title`(문자열), `daily`(`maxDay`, `tasks[]`, `bonus`), `stats.hunts`/`sells`/`autoRuns`/`dailyDone`/`dailyAll`/`rewardGold`(정규화는 이 문서 §13). **D.1의 "배치 B/C 예약 필드" 중 `achievements`·`daily`를 예약에서 확정 표로 옮기고** `events`·`rebirth`만 예약으로 남긴다.
3. **E 상수표**: 이 문서 §14의 상수(`ACH_*`, `DAILY_*`, `SELL_COUNT_MIN_LV` 등)를 담당 문서 `m2-achievements`로 추가(가격 상수가 아니라 가격식 `k×H`이므로 "가격식" 열에 `rewardGold`를 추가).
4. **F 상호작용 요약**: "업적·일일: 확률·수입 효과 없음, 보상 골드는 `rewardGold(k×H)`로 `stats.rewardGold`에만 반영(`earned`·`huntGold`·`offlineGold` 불변). 기록 탭에 일일 과제·업적 섹션과 탭 점 추가"를 한 행으로 추가. 기존 "기록 탭: 기념비 섹션 추가(잠정)"를 "기념비·일일 과제·업적 섹션(순서는 m2-achievements §12)"로 갱신.
5. **C.3 / H의 기념비 훅**: "기념비 F12 업적 훅(B에서 확정)"을 **확정**으로 — 업적 `mon_1/2/3`(보유 1·4·8개)가 `monumentCount`를 읽는다. `stats.sinkGold`는 `sink_1/2/3`(50만·1,000만·1억)에 쓰인다. H표의 "업적 보상 상점 / 잠정 없음 / B"는 확정으로, "F13 시간 이벤트가 사용처를 건드리는지"는 그대로.
6. **골드 사용처 지도 점검 문장 추가**: 업적·일일 골드의 합계(업적 `131H` = 연속 사냥 5.5분 1회성, 일일 하루 `16H` = 0.67분)가 배치 A 사용처 합계(약 46분)의 약 12%이고 소비형 업적 보상은 사용 금액의 3% 이하라 사용처 가치를 줄이지 않는다는 계산(`m2-achievements.md` §7.3·§7.4) 참조를 C.5 페이스 보호에 추가.
7. **I 인수 조건**: 항목 7(기존 수입·가격 회귀)과 8(페이스 보호)에 "F12의 `claim*`·`refreshDaily`·`syncAchievements`도 `chances()`·게이지·숙련·`BONUS_CAP`을 바꾸지 않는다"를 포함하도록 문장 확장(이 문서 AC 37).
8. **H표 항목 추가**: "업적·일일 환생 처리: 유지 / C에서 확정(`m2-achievements.md` §18)".
9. **A.1 순서·이유**: 변경 없음(업적이 특성·기념비 훅을 읽으므로 2순위 유지).

## 21. 다른 팀 요청
- **Tech**: `js/achievements.js` 신설(§15 함수), `idle.js`(`hunts`, `autoRuns`), `rules.js`(`sellSword`의 `sells`), `save.js`(`STAT_KEYS` 7개 추가(`eventsSeen` 포함) (2026-11-23 변경), `achievements`·`title`·`daily` 정규화·기본값), `main.js`(`syncAchievements`·`refreshDaily` 호출 위치, 수령 후 강제 저장, `storedClaimed`·`tzOffsetMin` 주입, 토스트), `view.js`(`TAB_DOT.records`, 기록 탭 섹션 렌더, `TABS` 변경 없음), `index.html`(기록 패널 안 컨테이너만), `constants.js`(§14).
- **Content(선택)**: 칭호·업적 이름 문구 점검(§5), 일일 과제 설명 문구, 업적 아이콘(선택).
- **QA**: §16 AC 전수. 특히 시계 조작(7~10c, 주입 시계), 두 탭(29~30c), 반올림 순서(36·41·42), rng 9회(5, 11, 12), 저장 정규화(44~51), 이름 규칙 문자열(54), 모바일 360px(58).
