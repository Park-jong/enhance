# M2 F11 환생(4-4) · 저장 필드 전체 표(4-5) · 확률 상한 관계 표 (배치 C)

> 이 문서는 **환생 규칙, 명성 상점, M2 저장 필드 전체 표(최종), 확률 상한과의 관계 표, 환생·구현 단계 인수 조건**을 소유한다. 관련 문서: `m2-overview.md`(가격식·골드 사용처 · 저장 표 D/D.2 원본) · `m2-traits.md` · `m2-achievements.md` · `m2-events.md` · `m1.1-late-correction.md`(§8 환생 메모를 이 문서 §5가 덮어씀) · `m1-storage.md`(정규화 규칙).
> 모든 수치는 기존 상수로 한 **손 계산**이며 시뮬레이션이 아니다(플레이 테스트로 조정). 사용자가 열린 결정을 모두 위임했고 **열린 질문은 없다**(§13 결정 기록에 전부 기록). `(초안)` = 기획 판단으로 정했고 플레이 테스트 대상.
> 사용자 방향(유지): **첫 런 +20 약 25~50분 페이스는 그대로**, 총 플레이 시간은 환생으로 늘린다. 수입은 깎지 않는다.

## 1. 요약 (결정)
| 항목 | 값 |
| --- | --- |
| 조건 | 보관함에 `lv == MAX(20)` 검이 있고 `gold ≥ REBIRTH_FEE`. 그 +20 검은 **제물로 소모** |
| 비용 | `REBIRTH_FEE = roundTo(100 × huntReward(20), 100)` = **19,846,200 G**(고정). 골드는 유지되지 않음 |
| 화폐 | **명성**(`fame`), 환생 1회당 **고정 3** |
| 상점 | 시작 골드 · 초반 수입(+%, `topLv ≤ 12`만) · 시작 칸 · 자동 사냥 면허. **확률 보너스 없음** |
| 숙련 | 환생 시 단계별 기록 **최대 1개만 상속**(`MASTERY_KEEP_REC`=1), 게이지는 전부 초기화 |
| 저장 | v2 유지, 필드 `rebirth` 하나 추가. 옛 클라이언트의 덮어쓰기 대비 미러 키 `sword-enhance-v2-rebirth`(§8.2, REQ-037) |

## 2. 상수 (js/constants.js에 추가)
| 이름 | 값 | 의미 |
| --- | --- | --- |
| `REBIRTH_FEE_MULT` | 100 | 의식 비용 배수(×`huntReward(MAX)`) |
| `REBIRTH_FEE_ROUND` | 100 | 반올림 단위(G). `TRAIT_PRICE_ROUND`와 같은 값이나 별도 상수 |
| `REBIRTH_FEE` | `roundTo(REBIRTH_FEE_MULT × huntReward(MAX), REBIRTH_FEE_ROUND)` = 19,846,200 | 파생 값. `huntReward`가 `rules.js`에 있어 `constants.js`가 아니라 `js/rebirth.js`가 만들고 `SG.rebirth.REBIRTH_FEE`·`rebirthFee()`로 노출 (2026-11-24 구현) |
| `FAME_PER_REBIRTH` | 3 | 환생 1회 획득량 |
| `MASTERY_KEEP_REC` | 1 | 환생 후 단계별 숙련 기록 상한 |
| `EARLY_INCOME_MAX_LV` | 12 | 초반 수입 효과가 적용되는 `topLv` 상한 |
| `REBIRTH_COUNT_MAX` | 1,000,000 | `rebirth.count` 정규화 상한. 환생의 `+1`도 이 값에서 멈춘다(런타임 = 로드 상한, V8) (2026-11-24 추가) |
| `FAME_MAX` | 1,000,000,000 | `rebirth.fame` 정규화 상한. 환생의 `+3`도 이 값에서 멈춘다 (2026-11-24 추가) |
| `FAME_SHOP` | §4 | 트랙별 `{name, values, costs}`(`name`은 (초안) 문구) |
| `FAME_TRACKS` | `Object.keys(FAME_SHOP)` = `['startGold','income','slots','autoStart']` | 순서 = UI 순서 |
- 로드 시 검사(`throw`): 모든 트랙에서 `values.length === costs.length ≥ 1`, `MASTERY_KEEP_REC ≥ 0`, `FAME_PER_REBIRTH ≥ 1`, `SLOT_START + max(FAME_SHOP.slots.values) ≤ SLOT_MAX`(넘으면 환생 결과의 `slots`가 정규화에서 잘려 §8.1 불변식이 깨진다) (2026-11-24 추가).

## 3. 환생 규칙 (4-4)
### 3.1 조건과 실패 사유
`canRebirth(S)` → `{ok:true}` 또는 `{ok:false, reason}`. 검사 순서(앞이 우선):
| 순서 | reason | 조건 |
| --- | --- | --- |
| 1 | `invalid` | `S`가 객체가 아니거나 `S.swords`가 배열이 아니거나 `S.rebirth`가 객체가 아님 |
| 2 | `notReached` | `S.swords`에 `lv === MAX` 검이 없음. **`S.best ≥ 20`만으로는 부족**(그 검을 팔았거나 납품했다면 다시 만들어야 한다) |
| 3 | `noGold` | `S.gold < REBIRTH_FEE` |
- 제물: `lv === MAX`인 검 중 **하나**(가장 앞 칸)를 소모하는 것으로 정의한다. 어차피 모든 검이 초기화되므로 제물이라는 의미를 주고, +20 검을 이미 판 경우에는 다시 만들어야 하게 해 "공짜 환생"을 막는다.
- 비용은 고정이다(제물이 항상 +20). 골드는 유지되지 않아 **수수료를 내고 남은 골드는 사라진다**. 확인 창이 "사라지는 골드"를 보여준다. 배치 A 사용처(특성·기념비, 최고 단계 기준 합계 약 219M)를 환생 전에 쓰는 것은 플레이어 선택이며, 수수료는 그 위에 **필수 관문**으로 얹힌다(= 219.12M + 19.85M ≈ 238.97M, 수수료는 약 8%).
- 환산: 수수료 = `100 × H(20)` = 연속 사냥 100회 = **4.2분**(듀티 50%면 8.3분, 25%면 16.7분). `H(20)=198,462`.
- 수수료는 선택 지출이 아니라 관문이므로 **`stats.sinkGold`·`stats.earned`에 넣지 않는다**(`sink_*` 업적 부풀림 방지, `m2-achievements.md`).

### 3.2 함수 (새 모듈 `js/rebirth.js` = `SG.rebirth`, 순수 규칙, 난수 없음) (2026-11-24 구현)
- 로드 순서: `constants.js` → `events.js` → `rules.js` → `forge.js` → `idle.js` → `quests.js` → `save.js` → **`rebirth.js`** → `achievements.js` → … → `main.js`. `rebirth.js`는 `defaultState`(save.js)와 `huntReward`(rules.js)를 쓰므로 `save.js` 다음이다.
- 명성 효과 조회 `fameValue(S, track)`와 초반 수입 `earlyIncomePct(S)`(= §4.2 `pFame`)는 **`rules.js`**에 있다: `R.isUnlocked`(면허)와 `idle.js` 수입 식이 `rebirth.js`보다 먼저 로드되기 때문이다. `SG.rebirth.fameValue`·`famePct`는 같은 함수를 다시 내보낸다. `rebirth`가 없는 상태(직접 조립한 옛 테스트·도구 상태)는 0레벨로 본다.
| 함수 | 동작 |
| --- | --- |
| `rebirthFee()` | `REBIRTH_FEE` |
| `canRebirth(S)` | §3.1 |
| `rebirthPreview(S)` | 읽기 전용. `canRebirth` 결과(`ok`, 실패면 `reason`) + `{fee, gold, goldLost: max(0, gold − fee), fameGain: FAME_PER_REBIRTH, consumedSwordId(+20 검이 없으면 null), startGold: START_GOLD + startGoldBonus(S), slots: startSlots(S), incomePct: famePct(S,'income'), autoStart: bool, keptMastery: S.mastery.map(min MASTERY_KEEP_REC)}`. `invalid`면 `{ok:false, reason:'invalid'}`만 |
| `rebirth(S, now)` | `canRebirth` 실패면 `{ok:false, reason}`, **S 불변**. 성공이면 §3.3을 한 번에 적용해 **S를 제자리에서 환생 직후 상태로 통째로 바꾸고**(최상위 키 전부 교체) `{ok:true, fee, goldLost, fameGain, consumedSwordId, fame, count}` 반환. 입력은 정규화된 상태여야 한다. 호출 쪽(`main.js`)은 **정규화된 복사본(draft)에 호출하고 성공했을 때만 `S`를 교체한 뒤 `persist()`를 정확히 1번** 부른다(부분 상태 저장 없음. 자동 백업 불필요) |
| `buyFame(S, track)` | §4 |
| `famePct(S, track)` / `fameValue` | 현재 레벨의 값(0레벨·알 수 없는 트랙이면 0). 구현은 `R.fameValue`(위 참고), 두 이름은 같은 함수 |
| `startGoldBonus(S)` | `fameValue(S,'startGold')` |
| `startSlots(S)` | `SLOT_START + fameValue(S,'slots')` |
- `rebirth`는 새 상태를 **`defaultState(now)`를 기준으로** 만든다: §8 표에서 "초기화"인 필드는 `defaultState`의 값을 복사하고(나중에 필드가 추가돼도 기본값으로 초기화), "유지"인 필드만 원본에서 가져온다. 예외(기본값이 아닌 값)는 `gold`·`swords`·`active`·`slots`·`mastery`·`events` 일부뿐이며 §8에 적었다.
  - 구현(2026-11-24): 통째로 유지하는 필드는 `SG.rebirth.KEPT_FIELDS` = `found, settings, stats, monuments, achievements, title, daily`(깊은 복사). 그 밖에 원본에서 가져오는 값은 `nextSwordId`(새 검에 쓰고 +1)·`nextAnvilId`·`quests.nextId`·`rebirth`(+1·+3)·`mastery`(상한 `MASTERY_KEEP_REC`)이고, `gold`·`slots`는 명성 상점 값으로 계산한다. 나머지는 모두 `defaultState(now)` 값(`events`는 기본값 그대로 = 초기화). 표 구동 테스트(`tests/run-tests.js` `RB_FIELD_TABLE`)가 `defaultState`의 모든 최상위 키를 이 표로 분류한다(AC 12).

### 3.3 환생 전이 (한 번의 순수 전이)
1. `canRebirth` 통과 확인, 제물 검 제거(`goldLost = gold − fee` 계산).
2. §8 표대로 초기화·유지 적용. 새 검은 `{id: nextSwordId++, lv:0, prot: PROTECT_USES, pity:0}` 하나, `active` = 그 id, `trait` 없음.
3. `rebirth.count += 1`, `rebirth.fame += FAME_PER_REBIRTH`.
4. `idle.lastSeen = now`(환생 직후 오프라인 정산 없음), `idle.autoOn = false`.
5. 정규화한 결과가 자기 자신과 같다(§8 불변식).
- 환생 직후 `S.best = 0`이므로 기존 해금(`R.isUnlocked`, 의뢰·대장간·방치 탭, 일일 과제, 이벤트, 소모품 일부)이 `S.best`에 묶인 것이 **전부 다시 잠긴다**. 이는 의도된 "처음부터 다시"이며 `S.best`가 다시 올라가면 풀린다. 해금 토스트(`announceUnlocks`)도 다시 뜬다(허용, 낮은 중요도).
- **기억해 둘 의존**: 일일 과제 목표 밴드와 업적 보상 파편(`shardGain(max(5,best))`)·골드(`rewardGold`)는 **그 시점의 `S.best`**로 계산되므로 환생 직후에는 작다. 받지 않은 보상이 있으면 환생 전에 받는 편이 이득이다(확인 창에 한 줄 안내, §7).

## 4. 명성 상점 (영구, 확률 보너스 없음)
`FAME_SHOP`(이름은 (초안) 문구, 값이 결정):
| 트랙 id | 이름 | 값 `values[lv-1]` | 비용 `costs[lv-1]` | 합계 | 효과 |
| --- | --- | --- | --- | --- | --- |
| `startGold` | 여유 자금 | `[2000, 5000, 10000, 20000]` G(누적, 합산 아님) | `[1, 1, 2, 3]` | 7 | 환생 때 시작 골드 = `START_GOLD(300) + 값` |
| `income` | 초반 수완 | `[5, 10, 15, 20]` %(누적) | `[1, 2, 3, 4]` | 10 | `topLv ≤ EARLY_INCOME_MAX_LV(12)`일 때 수동 사냥·자동 사냥·오프라인 골드 +값% |
| `slots` | 넉넉한 보관함 | `[1, 2]` 칸(누적) | `[2, 3]` | 5 | 환생 때 시작 칸 = `SLOT_START(3) + 값`(최대 5). `SLOT_MAX`=8 불변 |
| `autoStart` | 자동 사냥 면허 | `[1]` | `[3]` | 3 | 매 런 처음부터 자동 사냥 해금(`AUTO_UNLOCK_BEST`=5 관문 생략) |
- **합계 25 명성 = 환생 9회**(`ceil(25/3)`). 3명성(환생 1회)으로 살 수 있는 조합 예: 여유 자금 1+2단계 + 초반 수완 1단계 = 1+1+1.
- **확률에 영향 없음**: 어떤 트랙도 `chances()`·`BONUS_CAP`·`SUCC_CEIL`·게이지·숙련의 입력이 아니다(§9).
- 구매는 기록 탭 환생 섹션에서 **언제든** 가능(환생 직후 포함). 시작 골드·칸은 **다음 환생 때** 적용(구매해도 지금 골드·칸은 안 변함). 수입·자동 사냥 면허는 **즉시** 적용된다(면허는 현재 런에서도 `idle`이 해금됨).
- 자동 사냥 면허의 부수 효과: `R.isUnlocked(S,'idle')`이 참이라 방치 업그레이드 구매도 처음부터 가능하다(골드로 제한되므로 문제 없음, 해금 토스트는 면허가 있으면 생략). 구현(2026-11-24): `rules.js`의 해금 키 → 트랙 표 `FAME_UNLOCK = {idle:'autoStart'}`로 `isUnlocked = best ≥ UNLOCK[key] || 그 트랙 값 > 0`. 토스트 생략은 `main.js` `UNLOCK_NOTICES`의 `licensed: 'autoStart'`.

### 4.1 `buyFame(S, track)`
| # | Given | Then |
| --- | --- | --- |
| F1 | 유효 트랙, 최대 레벨 아님, `fame ≥ cost` | `{ok:true, cost, level}`. `fame −= cost`, `up[track]++`. 골드·확률 값 불변 |
| F2 | `track`이 `FAME_SHOP`의 자기 속성(`hasOwn`)이 아니거나 문자열이 아님(`'constructor'`·`'__proto__'` 포함), 또는 `S.rebirth`가 객체가 아님 | `{ok:false, reason:'invalid'}` |
| F3 | `up[track] ≥ costs.length` | `{ok:false, reason:'maxed'}` |
| F4 | `fame < costs[up[track]]` | `{ok:false, reason:'noFame'}` |
- 검사 순서: invalid → maxed → noFame. 실패 시 상태 불변. 구매는 되돌릴 수 없다(환불 없음).

### 4.2 초반 수입 정수 공식 (결정)
`pFame = (R.topLv(S) ≤ EARLY_INCOME_MAX_LV) ? famePct(S,'income') : 0`(구현: `R.earlyIncomePct(S)`). **`pFame = 0`이면 기존 코드 경로를 그대로 쓴다**(비트 동일: `idle.js`는 `pFame`을 `R.percentScaled`의 %p 목록에 넣고, `percentScaled`는 0인 항을 곱하지 않는다). 다른 정수 항과 **하나의 floor/round 안에서 곱하고 마지막에 한 번만 나눈다**(`m2-traits.md` §3.1·`m2-events.md` §5.3 방식). 없는 항은 빼고 나눗수는 `100^(항 수)`.
- 수동 사냥: `manualHuntGold = floor(huntReward(topLv) × (100+vHunt) × (100+pFame) × boost / 10000)`. 부스터(`boost=1.5`)는 정수 안전형 `× 3 / 20000`(= `×1.5/10000`)으로 쓸 수 있다.
- 자동 1회: `autoRunGold = round(autoReward(topLv) × goldUpFactor × boost × (100+vWork) × (100+pFame) / 10000)`.
- 오프라인: `gold = floor(runs × autoReward(topLv) × goldUpFactor × OFFLINE_EFF × boostFactor × (100+vWork) × (100+pFame) / 10000)`.
- **가격은 쓰지 않는다**: `boosterPrice`·`traitRekindCost`·`traitTierUpCost`·`monumentCost`·`REBIRTH_FEE`·판매·납품·의뢰 골드는 `huntReward` 등 기본값만 쓴다(수입 상승이 가격에 되먹임되지 않음).
- 적용 범위가 `topLv ≤ 12`인 이유: +13 이후 골드는 이미 남고(`m2-overview.md` B.5), 이벤트(`best≥13`)와 겹치지 않게 하며, 골드 제한 구간(+5~+12)만 돕는다. (`S.best ≥ 13`인데 `topLv ≤ 12`인 드문 경우는 두 효과가 곱으로 모두 적용되며 허용한다.)
- **계산 예**(`huntReward(10)=423`, `autoReward(10)=160`, 수확 보너스 lv5 = ×1.5):
  - 수동, 특성 없음, 부스터 없음, `pFame=20`: `floor(423×100×120/10000)` = floor(507.6) = **507**(없으면 423).
  - 같은 조건 + 부스터: `floor(423×100×120×3/20000)` = floor(761.4) = **761**(`floor(507×1.5)=760`과 다르다. 단일 floor가 정답).
  - 수동 + 약탈자 `vHunt=20` + `pFame=20`: `floor(423×120×120/10000)` = floor(609.1) = **609**.
  - 자동 1회(수확 lv5, 부스터 없음, `pFame=20`): `round(160×1.5×120/100)` = **288**(없으면 240).
  - 오프라인 8시간(런 5,760, 수확 lv5, `pFame=20`): `floor(5760×160×1.5×0.25×120/100)` = **414,720**(없으면 345,600).
  - `topLv=12`, `pFame=5`: `huntReward(12)=1,446` → `floor(1446×105/100)` = **1,518**. `topLv=13`이면 `pFame`은 0(항 없음).

## 5. 숙련·게이지 환생 처리 (high, `m1.1-late-correction.md` §8의 잠정 "숙련 전부 유지"를 **덮어씀**)
- 게이지: 전부 0.
- 숙련: `mastery[i] = min(mastery[i], MASTERY_KEEP_REC)`. 기록은 평소처럼 `MASTERY_REC_MAX`까지 다시 쌓인다.
- 이유: 숙련을 전부 유지하면 2회차부터 +15~+19 구간이 약 10배 덜 파괴된다. **손 계산(시뮬레이션 아님, 하락·보호·축복·파괴 후 재제작 무시, 상대 비교용)**: 단계 `l`의 한 번 올라가기 성공 확률(게이지 포함) `survive_l = p × Σ_{k<N} f^k + f^N`, `p = (RATE[l] + 숙련)/100`, `d = DESTROY[l]/100`, `f = 1 − p − d`, `N = GAUGE_N`. 깨끗이 오를 확률 `P = Π_{l=15..19} survive_l`.
| 상속 기록 수(단계별) | 숙련 %p (+15/+16/+17/+18/+19) | P | 0기록 대비 |
| --- | --- | --- | --- |
| 0 | 0/0/0/0/0 | 0.0013 | 1.0× |
| 1 | 3/3/3/4/5 | 0.0041 | 3.2× |
| 2 | 6/6/6/8/10 | 0.0083 | 6.4× |
| 3 | 9/9/9/12/10 | 0.0117 | 9.0× |
| 4(전부) | 12/12/12/12/10 | 0.0137 | 10.5× |
- 전부 유지는 기각(10.5배). **1개 상속**은 1런에서도 각 단계의 첫 성공 뒤 얻는 보너스를 앞당길 뿐이라(기록은 파괴 후에도 유지) 허용 범위로 본다(3.2×는 "단계당 첫 성공을 이미 한 상태"의 상대값이며 +20 시도 횟수 ~1,261회는 `m2-overview.md` C.5 기준).
- **플레이 가드레일**: 2런이 15분 미만이면 `MASTERY_KEEP_REC = 0`으로 낮춘다(상수만 바꿈, 코드 변경 없음).

## 6. 페이스 (결정 + 산수, 초안)
- 근거: 명성은 확률 보너스를 주지 않으므로 +20까지의 **강화 시도 횟수(약 1,261회, `m2-overview.md` C.5)는 변하지 않는다**. 줄 수 있는 것은 골드 제한 구간(+5~+12, `T_g ≤ 8분`으로 가정(초안), C.5는 "수 분")뿐이다.
- **페이스 바닥 `RUN_PACE_FLOOR`**: 같은 플레이 스타일에서 **어떤 런도 1런의 80%보다 빠르지 않다**(25분 기준 20분). 게임 규칙 상수가 아니라 밸런스 기준이다.
| 단축 요인(최대 투자) | 계산 | 최대 단축 |
| --- | --- | --- |
| 초반 수완 +20% | `T_g × (1 − 1/1.2)` = 8 × 0.1667 | 1.33분 |
| 여유 자금 20,000 G | +13의 약 50만 더미의 4% → 8 × 0.04 | 0.32분 |
| 자동 사냥 면허 | 가정(초안): +0~+4에서 자동은 미미 | ≤ 1분 |
| 상속 숙련 1기록 | 가정(초안, §5 가드레일) | ≤ 2분 |
| **합계** | | **≤ 약 4.7분 → ≥ 20.3분 = 1런 25분의 81%** |
| 시작 칸 | 시간 단축 없음(편의) | 0 |
- 목표(초안): **1런 25~50분(기존) · 2런 22~40분 · 5런 이후 20~40분**. 2런(명성 3: 여유 자금 2단계 + 초반 수완 1단계 가정) 단축은 숙련 ≤ 2분 + 약 0.5분이라 **≥ 22분**.
- **총 플레이 시간은 늘어난다**: 환생 한 주기 = 런(20~40분) + 수수료(+20 상태에서 연속 사냥 4.2분, 듀티 25~50%면 8.3~16.7분). 특성은 검과 함께 사라지고 +5 도달 때 다시 굴린다(1런과 같음). 명성 25를 다 모으는 데 **9주기**.
- 플레이 테스트 항목(10-1): 2런·5런 소요, `T_g` 실측(8분 가정), 면허·숙련 상속의 실제 단축. 바닥(80%)이 깨지면 `MASTERY_KEEP_REC`부터 낮추고 다음이 `FAME_SHOP.income` 값.

## 7. UI (기록 탭 맨 위 환생 섹션)
- 표시 조건: `S.best ≥ MAX` **또는 `rebirth.count ≥ 1`**. 환생 직후 `S.best`가 0이 되므로 `count ≥ 1` 조건이 없으면 명성 상점이 사라진다(**유저 결정안 보정**). 그 전에는 잠금 한 줄 문구("최고 강화 +20 달성 시 환생이 열립니다").
- 내용: 명성 잔액, 명성 상점 행(이름, 레벨 `n/최대`, 다음 비용, 효과 문구, 구매 버튼, 최대면 "최대"), [환생] 버튼(`canRebirth` 실패면 비활성 + 사유: `notReached` "+20 검이 보관함에 있어야 합니다", `noGold` "필요 19,846,200 G"), 환생 횟수.
- [환생] 클릭 → **확인 창**(모달): 수수료 · 현재 골드와 **수수료 후 사라지는 골드** · 명성 +3 · 소모될 +20 검 · "유지": 업적·칭호·기념비·도감·통계·설정·명성과 상점 · "사라짐": 골드, 파편, 모든 검(특성 포함), 소모품, 모루·광석, 의뢰, 방치 업그레이드·부스터, 숙련은 단계별 1개만 유지, 이벤트 진행 · 결과값(시작 골드, 시작 칸, 초반 수입 %, 자동 사냥 면허) · 받지 않은 업적·일일 보상이 있으면 한 줄 안내. 확인 버튼은 창이 열리면 바로 활성(입력 문구 없음), Esc·바깥 클릭은 취소(상태 불변).
- 확인 시 `canRebirth`를 **다시 검사**(그 사이 골드·검이 바뀐 경우), `rebirth` 1회 → `persist()` 1회 → 토스트("환생! 명성 +3") + 화면 맨 위 스크롤 + 이벤트·확인 창·진행 중 연출 취소(`epoch` 증가, `resetUiFor`와 같은 경로).
- 이 섹션은 탭 가드(두 탭) 규칙을 따른다: 소유 탭만 실행(다른 탭은 읽기 전용).

## 8. M2 저장 필드 전체 표 (4-5, **최종**)
저장 버전은 **v2 유지**: 필드 추가 + 기본값 병합, 이전 함수 없음, 버전 올리지 않음(§13). `int(v,def,min,max)`는 `js/save.js`의 `int`(내림, 숫자 문자열 허용). "환생" 열: **초기화**(→ 값) / **유지** / **상한 N**.
D = `m2-overview.md` D, D.2 = 같은 문서 D.2, M1S = `m1-storage.md` + `js/save.js` 정규화 함수.

| 필드 | 타입 | 기본값 | 범위·정규화 | 환생 | 출처 |
| --- | --- | --- | --- | --- | --- |
| `v` | 정수 | 2 | `SAVE_VERSION` | 유지(2) | M1S |
| `gold` | 정수 ≥0 | 300 | `int(v,300,0)` | **초기화** → `START_GOLD + startGoldBonus(S)` | M1S |
| `shards` | 정수 ≥0 | 0 | M1S | 초기화 → 0 | M1S |
| `best` | 0..20 | 0 | `max(best, 최고 검 lv)` | 초기화 → 0 | M1S |
| `found[]` | bool[21] | `[true,false…]` | `found[0]`=true | **유지**(영구 도감. 읽는 곳: `rules.js:353` 첫 도달 판정 `firstFound`, `main.js:132·182` 배너·연출, `view.js:644` 도감. 환생 후 이미 찾은 단계는 첫 도달 배너·연출이 다시 뜨지 않음) | M1S |
| `swords[]` | `{id,lv,prot,pity,trait}` ≤ `SLOT_MAX` | 검 1자루(+0) | `normSwords`, `trait` 규칙은 D | **초기화** → 새 +0 검 1자루(`id=nextSwordId`, `prot=PROTECT_USES`, `pity=0`, `trait=null`) | M1S, D |
| `swords[].trait` | `{k,t}` 또는 null | null | D | 초기화(검과 함께 사라짐) | m2-traits |
| `nextSwordId` | 정수 ≥1 | 2 | `max(v, 최대 id+1)` | **유지, 새 검에 쓰고 +1**(단조, 재사용 없음) | M1S |
| `active` | 정수 id 또는 0 | 1 | M1S | 초기화 → 새 검 id | M1S |
| `slots` | 3..8 | 3 | `max(int(...), swords.length)` | **초기화** → `SLOT_START + fameValue('slots')`(3~5) | M1S |
| `gauge[5]` | 정수[5] | 0 | `normPerLevel(GAUGE_N)` | **초기화** → 0 | M1S |
| `mastery[5]` | 정수[5] | 0 | `normPerLevel(MASTERY_REC_MAX)` | **상한 1** → `min(v, MASTERY_KEEP_REC)` | M1S |
| `inv{}` | 정수 ≤99 | 0 | `normCounts` | 초기화 → 0 | M1S |
| `use{}` | bool | false | M1S, `cleanupUse` | 초기화 → false | M1S |
| `anvils[]` | `{id,g,dura}` ≤ `ANVIL_OWN_MAX` | `[]` | `normAnvils` | 초기화 → `[]` | M1S |
| `nextAnvilId` | 정수 ≥1 | 1 | `max(v, 최대 id+1)` | **유지**(단조) | M1S |
| `anvilEq` | id 또는 null | null | 없는 id면 null | 초기화 → null | M1S |
| `ore{}` | 정수 ≤`ORE_MAX` | 0 | `normCounts` | 초기화 → 0 | M1S |
| `quests.list[3]` | 의뢰 또는 null | null×3 | `normQuest` | 초기화 → null×3 | M1S |
| `quests.readyAt[3]` | 정수 ≥0 | 0×3 | M1S | 초기화 → 0×3 | M1S |
| `quests.nextId` | 정수 ≥1 | 1 | M1S | **유지**(단조) | M1S |
| `idle.autoOn` | bool | false | M1S | 초기화 → false | M1S |
| `idle.up{}` | 정수 0..`UP_MAX` | 0 | `normCounts` | 초기화 → 0 | M1S |
| `idle.lastSeen` | 정수 ms | `now` | M1S | 초기화 → `now`(환생 직후 오프라인 보상 없음) | M1S |
| `idle.boostUntil` | 정수 ms | 0 | `≤ now + BOOSTER_MAX_MIN분` | 초기화 → 0 | M1S |
| `settings.muted` / `skipFx` | bool | false | M1S | **유지** | M1S |
| `stats.tries/success/fail/destroy/earned/shardsGained/protectSaved/delivered/crafted/huntGold/offlineGold` | 정수 ≥0 | 0 | `STAT_KEYS`, `normCounts` | **유지**(평생 카운터) | M1S |
| `stats.sinkGold` / `traitRolls` | 정수 ≥0 | 0 | D | **유지** | D |
| `stats.hunts/sells/autoRuns/dailyDone/dailyAll/rewardGold/eventsSeen` | 정수 ≥0 | 0 | D.2 | **유지** | D.2 |
| `monuments[8]` | 0/1 배열 | 0×8 | D | **유지**(영구 장식) | D |
| `achievements{}` | `{id:1\|2}` 희소 | `{}` | D.2 | **유지**(재수령 불가) | D.2 |
| `title` | 문자열 | `''` | D.2 | **유지** | D.2 |
| `daily.maxDay` / `tasks[]` / `bonus` | D.2 | `0` / `[]` / `0` | D.2 | **유지**(날짜 기반, 환생으로 새 세트 없음, 연속 출석 없음). `tasks[].base`는 `min(base, stats)`로 안전 | D.2 |
| `events.active` / `sinceMs` / `nextAtMs` | D.2 | `null` / `0` / `900000` | D.2 | **초기화** → 기본값(진행 중 이벤트 취소) | D.2 |
| **`rebirth.count`** | 정수 | 0 | `int(v,0,0,1e6)` | **유지**, 환생 때 +1(`REBIRTH_COUNT_MAX`에서 멈춤) | 이 문서 |
| **`rebirth.fame`** | 정수 | 0 | `int(v,0,0,1e9)` | **유지**, 환생 때 +3(`FAME_MAX`에서 멈춤), 구매로 감소 | 이 문서 |
| **`rebirth.up.startGold/income/slots/autoStart`** | 정수 | 0 | 각 `int(v,0,0,트랙 최대 레벨)`(4/4/2/1) | **유지** | 이 문서 |
- `rebirth` 정규화: 객체가 아니면(없음·배열·숫자·문자열·null) 기본값. `up`도 객체가 아니면 `{0,0,0,0}`. 알 수 없는 키는 버린다(`{count,fame,up}`·`up` 4키만 남김). **지출 ≤ 획득은 강제하지 않는다**(변조의 피해는 편의뿐, 확률 영향 없음). `stats.rebirths`는 만들지 않는다(`rebirth.count` 사용).
- 옛 저장(`rebirth` 없음)은 기본값으로 로드되고 나머지는 불변. 옛 클라이언트가 새 저장을 읽으면 `rebirth`를 무시한다(배치 A·B와 같은 수용). 옛 클라이언트가 그 저장을 **다시 쓰면** `rebirth`가 빠지므로 아래 §8.2 미러 키로 지킨다(REQ-037).
- 분류 완전성: `defaultState`의 **모든 최상위 키가 이 표에 있다**(`v, gold, shards, best, found, swords, nextSwordId, active, slots, gauge, mastery, inv, use, anvils, nextAnvilId, anvilEq, ore, quests, idle, settings, stats` + M2 `monuments, achievements, title, daily, events, rebirth`). 새 필드가 생기면 이 표를 먼저 고친다.

### 8.1 환생 전이 불변식
1. 환생 직후 `normalize(S)`가 `S`와 깊은 비교로 같다(정규화 멱등).
2. `save → load` 왕복 후 상태가 같고 `v === 2`다.
3. `S.swords.length === 1`, `S.active`는 그 검의 id, `S.best === 0`, `S.slots ≥ S.swords.length`.
4. `nextSwordId`·`nextAnvilId`·`quests.nextId`는 감소하지 않는다(재사용 없음).
5. 유지 필드(`found, settings, stats.*, monuments, achievements, title, daily, rebirth.up`)는 깊은 비교로 같고 `rebirth.fame`·`count`는 +3·+1(구매 지출만 별도)이다.
6. 환생으로 줄어드는 업적 지표(`best`, 특성 종류 수, 보유 검 기반 지표. `monuments`는 유지)는 **`syncAchievements` 래치**(`m2-achievements.md` §4.1)가 이미 달성한 `achievements[id]`를 내리지 않는다(`best_*`, `knd_*`, `perfect`; 래치가 지키는 것은 이 셋이다) (2026-11-23 변경). 새 달성은 환생으로 생기거나 사라지지 않는다.
7. 이벤트 해금 기준은 그대로 `S.best ≥ EVENT_UNLOCK_BEST(5)`(새 필드 없음). 환생 후 +5에 다시 도달해야 이벤트가 나온다.

### 8.2 환생 미러 키 (REQ-037, 2026-11-24 구현)
옛 클라이언트(8-A 이전 버전·캐시된 탭)는 `rebirth`를 모르므로 새 저장을 읽고 다시 저장하면 구매한 명성 진행(`count`·`fame`·`up`)이 조용히 사라진다. 이를 막으려고 `rebirth` 사본을 옛 클라이언트가 모르는 별도 키에 둔다.
- 키: `저장 키 + '-rebirth'` = `sword-enhance-v2-rebirth`(테스트 페이지는 `sword-enhance-test-rebirth`, `-corrupt` 백업 키와 같은 파생). 값은 정규화된 `rebirth` JSON. `SV.REBIRTH_MIRROR_KEY`.
- 쓰기: `SV.save`가 저장 키 쓰기에 **성공한 직후** 같은 `rebirth`를 쓴다(같은 `persist` 안). 미러에 이미 같은 값이 있거나, 미러가 없고 값이 기본값이면 쓰지 않는다. 저장 키 쓰기가 실패했거나 보호 모드(`blocked`)면 미러도 쓰지 않는다. 미러 쓰기 실패는 무시한다(저장 결과 `saved`·보호 모드에 영향 없음).
- 읽기: 저장 키에서 유효한 v2를 읽을 때마다(`SV.peek` → `load`·`checkStored`(이어받기·복귀)·수령 재확인) 미러를 읽어 **미러의 `count`가 저장 키 `rebirth.count`보다 크면** 미러의 `rebirth` 전체를 채택한다. 미러는 저장 필드와 같은 `normRebirth`로 정규화한다(변조는 잘림). 없음·빈 문자열·파싱 불가·객체 아님·읽기 예외는 미러 없음으로 본다. 새 게임·v1 마이그레이션·손상 저장으로 시작한 상태에는 적용하지 않는다(저장 키에서 읽은 상태가 아님).
- `count`만 비교하는 이유: 옛 클라이언트가 덮어쓴 저장은 `rebirth`가 없어 `count = 0`이 되므로 이것으로 충분하다. `fame`으로 비교하면 정상 구매(같은 `count`에서 `fame` 감소) 뒤 미러 쓰기만 실패한 경우 구매가 되돌려진다.
- 새 게임(기본 `rebirth`)을 저장하면 미러도 기본값으로 덮어쓰므로 다시 불러와도 예전 명성이 돌아오지 않는다.

## 9. 확률 상한과의 관계 표 (4단계 완료 조건)
성공 확률의 모든 출처와 상한 위치(`js/rules.js` `chances`):
| 출처 | 값 | 상한 안/밖 | 비고 |
| --- | --- | --- | --- |
| 기본 `RATE[l]` | 95…5 | - | 시작점 |
| 축복 `BLESS_BONUS` | +10 | `BONUS_CAP` 안(raw에 합산) | |
| 모루 `ANVIL_BONUS` | +2/+3/+4 | `BONUS_CAP` 안 | |
| 실패 보정(pity) | `PITY_STEP [1,1,2,2]`, `PITY_MAX [5,6,8,10]` | `BONUS_CAP` 안 | |
| 행운의 시간(F13) | +5(+5~+19), 실효 `min(5, max(0, cap − rawNoEvent))` | `BONUS_CAP` 안(raw에 합산, 상한이 한계) | `m2-events.md` |
| **`BONUS_CAP`** | 밴드별 `[20, 20, 14, 14]`(+0~4/+5~9/+10~14/+15~19) | raw = 축복+모루+pity(+이벤트)를 **자름** | |
| 숙련(F16) | 기록 1개당 `[3,3,3,4,5]`, 최대 `[12,12,12,12,10]`(+15~+19) | **`BONUS_CAP` 밖**, `SUCC_CEIL` 안 | 유일한 "상속" 항 |
| **`SUCC_CEIL`** | 90 | `succ = min(base + bonus + mastery, max(base, 90))` | |
| 게이지 가득 | 100 | `SUCC_CEIL`·`BONUS_CAP` **우회**(`certain`) | +15~+19 |
| 확정 강화권 `sure` | 100 | **우회**, `lv < SURE_MAX_TARGET(10)` | |
| `forceSuccess` | 100 | 테스트 전용 | `test.html` |
| 특성(F14) | 없음 | - | 확률 비간섭(`m2-traits.md` §2) |
| 환생·명성(F11) | **없음** | - | 이 문서 §4·§5 |
- **최대 도달 확률**(축복 + 강철 모루(+4) + pity 최대 + 숙련 최대, 우회 제외. `chances()`로 확인):
| 현재 단계 | base | bonus(캡 후) | 숙련 | 합 | 천장 |
| --- | --- | --- | --- | --- | --- |
| +15 | 20 | 14 | 12 | **46** | - |
| +16 | 15 | 14 | 12 | **41** | - |
| +17 | 10 | 14 | 12 | **36** | - |
| +18 | 7 | 14 | 12 | **33** | - |
| +19 | 5 | 14 | 10 | **29** | - |
- **천장 90은 낮은 단계에서만 작동한다**: +0은 base 95 > 90이라 95(천장은 `max(base,90)`), +1 90, +2~+4는 base+bonus가 104/99/94 → **90으로 잘림**, +5는 70+20 = 90(딱 같음), +6부터 85, 80, … +9 70, +10~ 59 이하. 따라서 +10 이상에서는 천장이 닿지 않고 `BONUS_CAP`이 한계다.
- **결론**: 환생·명성은 확률 항에 **0을 더한다**. 환생을 통해 이월되는 확률 항은 숙련 하나이고 `MASTERY_KEEP_REC`(1)기록으로 단계별 최대 `[3,3,3,4,5]`%p로 묶인다(전부 유지했다면 최대 `[12,12,12,12,10]`). 따라서 `m1.1-late-correction.md` §8의 "환생 보상과 숙련 합산 상한" 경고와 `m2-events.md` §13의 "환생이 확률을 올릴 때의 이벤트" 문제는 **해소**됐다: 이벤트 하드 규칙(`BONUS_CAP`·`SUCC_CEIL` 안)은 그대로다.

## 10. 인수 조건 (Given/When/Then)
**조건·비용·소비**
1. Given `S`가 객체가 아니거나 `S.swords`가 배열이 아니거나 `S.rebirth`가 객체가 아님 / When `canRebirth` / Then `{ok:false, reason:'invalid'}`. `rebirth(S)`도 같은 사유이고 `S` 불변.
2. Given `S.best=20`이나 보관함 최고 검이 +19, 골드 10^9 / When `canRebirth` / Then `reason:'notReached'`.
3. Given +20 검 보유, 골드 = `REBIRTH_FEE − 1` / Then `noGold`. 골드 = `REBIRTH_FEE`이면 `ok`.
4. Given +20 검이 없고 골드 0 / Then `notReached`(`noGold` 아님, 검사 순서).
5. `REBIRTH_FEE === 19846200`(= `roundTo(100 × huntReward(20), 100)`, `huntReward(20)=198462`). 골드·`S.best`·명성에 따라 변하지 않는다.
6. Given +20 검 둘과 +5 검 하나 / When `rebirth` / Then 환생 후 검은 정확히 1자루(+0)이고 이전 검 id는 하나도 남지 않는다. `ok` 결과의 `consumedSwordId`는 환생 전 보관함의 +20 검 중 하나다.
7. 모든 실패 사유에서 `S`는 깊은 비교로 불변이고 호출 쪽에서 `persist`가 호출되지 않는다.
8. Given 골드 30,000,000 / When `rebirth` / Then `goldLost = 30,000,000 − 19,846,200 = 10,153,800`, 환생 후 골드 = `300 + startGoldBonus`(남은 골드 유지 안 됨), `stats.sinkGold`·`stats.earned` 불변.
9. Given `rebirth.count=0`, `fame=0` / When 환생 성공 / Then `count=1`, `fame=3`. 한 번 더 환생하면 `count=2`, `fame=6`(구매 안 했다면).

**초기화·유지**
10. (표 구동 테스트) Given 모든 필드에 비기본값을 채운 `S` / When `rebirth` / Then §8 표의 "초기화" 행이 각각 표의 값이다: `gold=300+보너스, shards=0, best=0, swords=[+0 하나, trait null, prot=PROTECT_USES, pity=0], active=새 id, slots=3+칸, gauge=[0×5], inv·use·ore=0/false, anvils=[], anvilEq=null, quests.list=null×3, quests.readyAt=0×3, idle.autoOn=false, idle.up=0, idle.boostUntil=0, idle.lastSeen=now, events={active:null,sinceMs:0,nextAtMs:900000}`.
11. (표 구동) 같은 `S`에서 `found, settings, stats.*(전부), monuments, achievements, title, daily(전체), rebirth.up`이 환생 전후 깊은 비교로 같다.
12. (분류 가드) `defaultState(now)`의 모든 최상위 키가 §8 표(초기화/유지 목록 상수)에 분류돼 있다. 목록에 없는 키가 있으면 테스트 실패.
13. Given `nextSwordId=57`, `nextAnvilId=9`, `quests.nextId=12` / When `rebirth` / Then 새 검 `id=57`, `nextSwordId=58`, `nextAnvilId=9`, `quests.nextId=12`(감소·재사용 없음). 두 번째 환생의 새 검 id는 더 큰 값이다.
14. Given `mastery=[4,3,0,2,1]` / When `rebirth` / Then `[1,1,0,1,1]`. Given `mastery=[0,0,0,0,0]`이면 그대로. `MASTERY_KEEP_REC=0`이면 항상 0. `gauge`는 어떤 입력이든 `[0,0,0,0,0]`.
15. Given `mastery=[4,4,4,3,2]`, 환생 후 +15 검 / When `chances({lv:15,pity:0}, {mastery:S.mastery[0]})` / Then `mastery` 항 = 3(= 1×`MASTERY_STEP[0]`), 같은 입력의 환생 전 값은 12.
16. Given 행운의 시간 활성(`remainMs>0`)·`stats.eventsSeen=7` / When 환생 / Then `events.active=null`, `sinceMs=0`, `nextAtMs=900000`, `eventsSeen=7`.
17. Given 환생 직후(`best=0`) / When `advanceEvents`를 오래 진행 / Then 이벤트가 나오지 않는다. `best`가 5가 되면 정상 간격으로 나온다.
18. Given 업적(1·2 혼재)·칭호·일일 과제(일부 수령)·기념비 3개 / When 환생 후 `syncAchievements`·`refreshDaily`(같은 날) / Then `achievements`·`title`·`daily`·`monuments`가 변하지 않고, `best_*` 같은 래치 업적이 내려가지 않으며, 수령 완료(2) 업적은 다시 수령되지 않는다(`claim` 실패).
19. Given `found[15]=true` / When 환생 후 +15에 다시 도달 / Then `firstFound=false`(배너·첫 도달 연출 없음). `found` 배열은 환생 전과 같다.
20. Given 환생 직후 `now`와 `settleOffline(S, now + 8h)` / Then 지급은 `lastSeen=now` 기준이다(환생 시점 이후 시간만 계산). 환생 시점 자체에는 오프라인 골드가 없다.

**명성 상점**
21. `FAME_SHOP`: `startGold` 값 `[2000,5000,10000,20000]`·비용 `[1,1,2,3]`, `income` 값 `[5,10,15,20]`·비용 `[1,2,3,4]`, `slots` 값 `[1,2]`·비용 `[2,3]`, `autoStart` 값 `[1]`·비용 `[3]`. 모든 비용 합 = 25. `FAME_TRACKS` 순서 고정.
22. Given `fame=3`, `up.startGold=0` / When `buyFame(S,'startGold')` / Then `{ok:true, cost:1, level:1}`, `fame=2`. 연속 구매 시 비용 1, 2, 3(2·3레벨), 4레벨 뒤 `maxed`. 골드·`chances()` 출력 불변.
23. Given `track`이 `'constructor'`, `'__proto__'`, `7`, `null`, `undefined` / Then `reason:'invalid'`, 상태 불변.
24. Given `up.slots=2` / When `buyFame(S,'slots')` / Then `maxed`. Given `fame=0`이고 `up.income=4` / Then `maxed`(`noFame` 아님, 검사 순서). Given `fame=1`, 다음 비용 2 / Then `noFame`.
25. Given `up.startGold = 1..4` / When 환생 / Then 시작 골드 = 2,300 / 5,300 / 10,300 / 20,300. `up.startGold=0`이면 300.
26. Given `up.slots = 0 / 1 / 2` / When 환생 / Then `slots = 3 / 4 / 5`, 검 1자루, `expandCost(S)`(slots=5) = 30,000(`SLOT_EXPAND_COST[2]`), `SLOT_MAX=8` 불변.
27. Given `up.autoStart=1`, `best=0` / Then `R.isUnlocked(S,'idle')`가 참, `setAutoOn(S,true)` 성공. `autoStart=0`이면 `'locked'`. 의뢰·대장간 해금은 면허와 무관(`best` 기준).
28. (수동 사냥) `topLv=10`, 수확 무관, `pFame=20`, 부스터 없음 / Then 507. 부스터 있음 → 761. `vHunt=20` 추가 → 609(부스터 없음). `topLv=12`, `up.income=1` → 1,518. `topLv=13`, `up.income=4` → 2,676(적용 안 됨).
29. (자동 1회) `topLv=10`, 수확 lv5, `pFame=20`, 부스터 없음 / Then 288. `up.income=0`이면 240. `topLv=13`이면 `up.income`과 무관.
30. (오프라인) `topLv=10`, 자동 ON, 수확 lv5, 저장고 기본 8시간, `pFame=20` / Then `settleOffline` 골드 414,720. `up.income=0`이면 345,600.
31. `up.income = 0`(그리고 `rebirth` 기본값)이면 `manualHuntGold`·`autoRunGold`·`settleOffline`이 `topLv` 0..20 전 구간에서 환생 필드가 없는 코드와 **비트 단위로 같다**(기존 `huntReward`·`autoReward` 회귀 포함).
32. Given `up.income=4`(최대) / Then `boosterPrice`, `traitRekindCost`, `traitTierUpCost`, `monumentCost`, `rebirthFee`, `sell`, 의뢰 골드가 `up.income=0`일 때와 같다.

**저장·회귀**
33. `normalize`: `rebirth`가 없음/`null`/`[]`/`5`/`'x'` → 기본값(`{count:0,fame:0,up:{0,0,0,0}}`). `{count:'3.7', fame:-5, up:{startGold:9, income:'2', slots:3, autoStart:5, junk:1}, extra:1}` → `count=3, fame=0, up={startGold:4, income:2, slots:2, autoStart:1}`, `junk`·`extra` 버림. `count=1e12` → 1,000,000. `up`이 문자열 → `{0,0,0,0}`.
34. Given 지출이 획득보다 큰 저장(`fame` 0, `up` 전부 최대) / When 로드 / Then 그대로 둔다(보정·거부 없음).
35. Given `rebirth` 필드가 없는 옛 v2 저장 / When 로드 / Then 기본 `rebirth`가 채워지고 다른 필드 불변, `v=2`. 저장 후 다시 불러도 같은 상태.
36. Given 환생 직후 `S` / Then `normalize(S)` 깊은 비교로 `S`와 같고, `save→load` 왕복도 같다(§8.1-1·2). `v=2`.
37. 환생 1회는 `persist()`를 **정확히 1번** 부른다: 저장 키 `setItem` 1번 + 미러 키(§8.2) `setItem` 1번. 실패 사유일 때와 멈춘 탭(탭 잠금)에서는 0번 (2026-11-24 변경: 미러 키).
38. 회귀: `rebirth.count=0`, `up` 전부 0, `fame=0`일 때 M1·M2의 `chances()` 출력, 모든 가격식, `huntReward`/`autoReward`, 일일·이벤트·업적 출력이 환생 기능이 없던 때와 같다.
39. `chances()`·`enhanceOpts()`·`attemptEnhance`는 `S.rebirth`를 읽지 않는다: `S.rebirth`를 최대값으로 바꿔도 같은 `{lv, pity}`·같은 `mastery` 벡터·같은 옵션에서 출력이 깊은 비교로 같다. 환생 전후 같은 검·같은 숙련 벡터면 `chances()`가 같고 달라지는 것은 상속된 `mastery` 입력뿐이다.
40. 두 번째 환생: Given 환생 후 +20 검을 다시 만들고(테스트 도우미) 골드 충분 / When `rebirth` / Then 성공, `count=2`, 유지·초기화 규칙이 같다(구조 멱등).
41. (화면) 확인 창의 수수료·사라지는 골드·명성 +3·시작 골드·칸·수입 %가 `rebirthPreview` 값과 같다. Esc·바깥 클릭은 상태 불변. 확인 시 `canRebirth` 재검사. 표시 조건은 `S.best ≥ 20 || rebirth.count ≥ 1`. 360px 폭에서 가로 넘침 없음(`tests/browser-strip.js` 방식).

- 플레이 테스트(게이트 아님, 10-1): §6 페이스 항목. 2런이 15분 미만이면 `MASTERY_KEEP_REC=0`.

## 11. 구현 단계별 인수 훅 (TODO.md 5~8단계)
| 단계 | 반드시 통과 | 이 문서에서 받는 요구 |
| --- | --- | --- |
| 5(특성) | 이 문서 AC 12·38·39(`chances()` 비간섭·분류 가드) + 각 문서 AC | `defaultState`에 `swords[].trait`·`monuments`·`stats.sinkGold/traitRolls`를 넣고 `defaultSword`/`createSword` 한 곳에서 `trait:null`을 만든다(환생이 재사용) |
| 6(업적·일일) | AC 11·18(유지·래치) 중 데이터 부분 + `m2-achievements.md` §16 | `defaultAchievements`/`defaultDaily`를 `defaultState`와 같은 곳에서 만든다. `daily.tasks[].base = min(base, stats)` 구현(환생 안전) |
| 7(이벤트) | AC 16·17 + `m2-events.md` §14 | `defaultEvents()`를 노출해 환생이 같은 기본값을 쓴다(`{active:null, sinceMs:0, nextAtMs:900000}`) |
| 8-A(환생 규칙) | **AC 1~40 전부** | §2 상수·§3 함수·§4 `FAME_SHOP`·`rebirth` 정규화·`R.isUnlocked` 면허 분기·수입 공식(`idle.js`) |
| 8-B(화면) | AC 41 + 환생 후 기록 탭 표시 | §7. 환생 횟수·명성은 기록 탭 환생 섹션(탭 추가 없음, 9단계 탭 정리와 무관) |
| 8 완료 조건 | 표 구동 테스트(AC 10·11·12), 왕복(AC 36), 2회차 속도(플레이 테스트, §6) | TODO 8단계 완료 조건과 일치 |
- 앞 단계가 새 저장 필드를 추가하려면 §8 표를 먼저 고친다(환생 분류 필수).

### 11.1 구현 팀 요청 통합(배치 A·B·C, 요약)
- **Tech**
  - 배치 A(`m2-traits.md` §17): `rules.js`에 특성 헬퍼·`payoutPreview`·`buyMonument`·가격식, `idle.js`·`forge.js` 수입 곱, `attemptEnhance` 모루 내구도 되돌림, `quests.deliver`·`sellSword` 상인, 파괴 `shardGain` 수집가, `save.js` `normSwords`·`monuments`·`STAT_KEYS`, `main.js` 각인 호출·토스트, `SG.rules.setTrait`(`test-mode.js`는 로드 순서상 불가, 호출은 `js/test-panel.js`) (2026-11-23 변경).
  - 배치 B(`m2-achievements.md` §21, `m2-events.md` §18): `js/achievements.js`·`js/events.js` 신설과 `index.html` 로드 순서, `chances`·`enhanceOpts`(이벤트 `event` 입력), `idle.js`·`forge.js`·`quests.js` 이벤트 곱·새로고침 −50%, `save.js` 정규화·`STAT_KEYS` 확장, `main.js` 틱·토스트·즉시 저장·시계 주입, `view.js` 기록 탭 섹션·`TAB_DOT.records`, `test-panel.js`(테스트 전용 `setEvent` 조작판), `tools/sim-late`는 이벤트 비활성 시 결과 동일해야 함.
  - 배치 C(이 문서): `js/rebirth.js` 신설과 로드 순서(§3.2), `constants.js` §2, `save.js` `rebirth` 정규화·`defaultState`·미러 키(§8.2), `rules.js` `fameValue`·`earlyIncomePct`·`R.isUnlocked('idle')` 면허 분기, `idle.js`(수동·자동·오프라인) `pFame` 곱, `main.js` 환생 흐름(draft → 교체 → `persist` 1회 → `epoch` 증가·UI 리셋·토스트·스크롤), `view.js` 환생 섹션·확인 창·명성 상점, `test-mode.js` 환생 도우미(+20 검 지급).
- **Content(선택)**: 특성 아이콘 6종·문구, 이벤트 아이콘·토스트 문구 6종, 업적·칭호 문구, **명성 아이콘·환생 확인 창 문구·명성 상점 이름 4종**.
- **QA**: 각 문서 AC 전수 + 이 문서 AC 1~41. 중점: 표 구동 초기화/유지(10·11·12), 정수 순서(28~30), 숙련 상속(14·15), 단일 `persist`(37), 두 탭(`tab-guard`)에서 환생, 저장 왕복(36), 360px(41), 옛 저장 부팅(35).

## 12. 열린 질문
없음. 모든 갈림길은 §13에 기록했다.

## 13. 결정 기록 (사용자 위임)
| 질문 | 선택 | 대안 | 이유 | 중요도 |
| --- | --- | --- | --- | --- |
| 환생 조건 | 보관함에 +20 검 + 수수료. **+20 검은 제물로 소모** | `S.best≥20`만, 검 유지 | 검이 초기화되니 의미·"공짜 환생 방지"가 맞다. 팔았다면 다시 만들어야 함 | high |
| 수수료 | `100 × H(20)` = 19,846,200 G 고정, 골드는 유지 안 됨 | 가변(보유 골드 비례), 낮은 수수료 | 연속 사냥 4.2분. 관문이라 `sinkGold`에 넣지 않음. 총 사용처(≈219M)에 더해도 약 8% | high |
| 골드·소모품·검 | 전부 초기화 | 골드 일부 유지 | "처음부터". 유지하면 2런이 지나치게 빨라짐(페이스 바닥) | high |
| 화폐와 획득량 | 명성, 고정 3 | 성과 비례 | 천천히 하는 이득 없음, 결정적 | low |
| 상점 내용 | 시작 골드·초반 수입(topLv≤12)·시작 칸·자동 사냥 면허. **확률 보너스 없음** | 성공률 +%p, 파괴율 −%p | +20 시도 횟수(약 1,261회)가 안 변해 페이스 보호, 상한 문제 해소 | high |
| 초반 수입 적용 | `topLv ≤ 12`, 단일 floor, 가격에는 미적용 | 전 구간 | +13 이후 골드는 남는다. 가격 되먹임 방지 | low |
| 숙련 상속 | 단계별 최대 1기록, 게이지 전부 초기화(`m1.1` §8 덮어씀) | 전부 유지(10.5×) / 0 | 전부 유지는 파괴 10배 감소로 2런이 너무 쉬움. 1기록은 1런에서도 곧 얻는 값 | high |
| 페이스 | 바닥 `RUN_PACE_FLOOR` 80%, 1런 25~50 / 2런 22~40 / 5런+ 20~40 | 환생마다 점점 빠르게 | 사용자 방향: 총 플레이 시간은 환생으로, 수입은 안 깎는다 | high |
| `found` | 유지 | 초기화 | 도감·첫 도달 배너 전용이라 영구 수집. 코드 확인: 다른 영향 없음 | low |
| 기념비 | 유지 | 초기화 | 영구 장식(`m2-overview.md` H) | low |
| 업적·칭호 | 유지, 재수령 불가, 래치로 지표 보호 | 초기화 | `m2-achievements.md` §18 | low |
| 일일 과제 | 유지(날짜 기반), 새 세트 없음, 연속 출석 없음 | 환생마다 새 세트 | 보상 파밍 방지 | low |
| 평생 카운터(`stats.*`) | 유지 | 초기화 | 업적 지표가 줄면 곤란. `base` 클램프는 안전망 | low |
| 이벤트 | 환생 시 초기화, `eventsSeen` 유지, 해금 기준 `S.best ≥ 5` 그대로 | 환생 횟수 기반 해금 | 새 필드 불필요, 초반 구간을 이벤트 없이 | low |
| 의식 비용과 이벤트 | 연동 없음 | 이벤트 할인 | `m2-events.md` 규칙 0과 일치 | low |
| 새 업적 | M2에서는 없음(선택: 나중에 `rebirth.count` 트랙, `dailyAll`·`rewardGold` 활용) | 환생 업적 추가 | 34개로 충분, 범위 축소 | low |
| 저장 버전 | v2 유지 + 기본값 병합 | v3 + 이전 함수 | 모든 신규 필드가 안전한 기본값, 변환할 데이터 없음, 되돌릴 수 없는 이전을 피함 | low |
| 환생 UI 표시 조건 | `S.best≥20 \|\| count≥1`(보정) | `S.best≥20`만 | 환생 직후 `best=0`이라 상점이 사라지는 것 방지 | low |
| 명성 지출·획득 정합 | 강제 안 함 | 로드 시 보정 | 변조 피해가 편의뿐이라 단순화 | low |
| 환생 후 잠금 | `S.best`에 묶인 해금이 다시 잠김(의도) | 해금 유지 | "처음부터". 면허만 예외 | low |

## 14. 덧붙이는 확인 사항 (코드 대조 결과)
- `found`는 `rules.js:353`(첫 도달 `firstFound`), `main.js:132·182`(배너·연출 건너뛰기 판단), `view.js:644·649`(도감)에서만 쓰인다. 유지해도 규칙·확률에 영향 없음.
- `SLOT_EXPAND_COST[slots − SLOT_START]`: 시작 칸이 늘면 확장 첫 가격이 30,000(칸 5)부터라 앞의 싼 칸 2개(13,000 G)를 면제받는 효과가 있다(시작 칸 상점의 일부, 허용).
- `R.isUnlocked(S,key) = S.best ≥ UNLOCK[key]`이므로 환생 직후 의뢰·대장간·방치가 잠기고 `UNLOCK_NOTICES` 토스트가 다시 나온다(`announceUnlocks(prevBest)`는 `prevBest < best`일 때만 발동). 면허가 있으면 방치 토스트 생략.
- 현재 `chances()`는 이벤트 입력을 아직 받지 않는다(배치 B 구현 전). §9 최대 도달 표는 이벤트 없이 계산했고, 이벤트(+5)가 raw에 들어가도 +10 이상은 `BONUS_CAP`(14)이 그대로 한계다.
