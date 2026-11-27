# M2 시간 이벤트 (F13)

> 담당: 기획(시스템). M2 배치 B. 이 문서는 시간 이벤트 **규칙·스폰·저장 필드·UI·인수 조건**의 단일 출처다. 골드 사용처 지도·가격식은 `m2-overview.md`, 특성 규칙은 `m2-traits.md`, 확률 구조(`BONUS_CAP`·`SUCC_CEIL`·게이지·숙련)는 `m1-pity-cap.md`·`m1.1-late-correction.md`가 가진다. 이 문서는 그 상수를 **이름으로만** 참조한다.
> 수치는 "잠정값"이며 **시뮬레이션으로 검증하지 않았다**(사용자 지시). 기획 판단 + `js/constants.js` 상수로 한 손계산이다(몇몇 표는 같은 상수로 결정식을 계산한 값이며 난수 시뮬레이션이 아니다). 플레이 테스트로 조정한다.
> 상태 표기: `(결정)` = 팀장/사용자 확정, `(초안)` = 기획이 정함(결정표 참조), `(잠정)` = 시각·문구 등 구현 단계에서 확정.
> 사용자 지시에 따라 열린 질문은 없다. 모든 갈림길은 §16 결정표에 권장안으로 기록했다.
> 용어: `H = huntReward(S.best)`, `cost(l)`·`huntReward(l)`·`autoReward(l)`은 `js/rules.js` 식 그대로. "활성 플레이 시간" = 이 탭이 활성 기록자(탭 잠금 아님)이고 페이지가 보이는 동안 게임 틱 `dt`를 누적한 시간.

## 1. 요약
| 항목 | 내용 |
| --- | --- |
| 모델 | 가끔 **자동 시작**하는 5분짜리 한시 버프. 한 번에 최대 1개(`S.events.active`). 이용권·구매·수락 버튼 **없음** (결정) |
| 시간 기준 | **활성 플레이 시간**(틱 `dt`, 틱당 상한 2초). 기기 시계와 무관. 게임을 닫으면 남은 시간이 멈춘다(`remainMs` 저장) (결정) |
| 오프라인 | 이벤트는 **오프라인 정산에 영향 없음**, 오프라인 중 시작·진행하지 않음 (결정) |
| 스폰 | 직전 이벤트 종료(또는 시작) 뒤 활성 플레이 15~30분(`[900,1800]`초, 주입 RNG 균등)이 쌓이면 1개 자동 시작 (결정 + 초안) |
| 종류 6 | 행운의 시간(성공 +5%p, 유일한 확률 이벤트) · 사냥 대목 · 자동 풍년 · 광맥 발견 · 모루 가호 · 의뢰소 특가 (초안) |
| 확률 이벤트 | `+5%p`를 **`BONUS_CAP`이 자르는 같은 보너스 합(raw)에 더한다**. 상한에 이미 찼으면 효과 0이고 UI가 그대로 보여 준다. `SUCC_CEIL` 초과 불가. 파괴율·pity·게이지·숙련 입력 불변, 이벤트 덕에 난 성공은 숙련 기록에 안 센다 (결정 + 초안) |
| 최대 가동률 | `300 ÷ (300 + 900)` = **25%** (§6.3) |
| 저장 | `events {active, sinceMs, nextAtMs}`, `stats.eventsSeen`. v2 유지, add-field + default-merge (결정) |
| 두 탭 | 기존 탭 잠금 그대로: 잠긴 탭은 틱·스폰·토스트·저장을 하지 않는다. 이어받기 때 저장의 `events`를 읽어 이어간다 (결정) |
| 환생 | 확정: m2-rebirth.md §8. 내용: `events` 초기화(진행 중 이벤트 취소), 카운터 유지 (§13) |

## 2. 하드 규칙 (결정)
1. **확률 이벤트는 하나뿐**이고 `chances()`의 보너스 합에만 들어간다. 다른 5종은 수입·광석·모루 소모·새로고침 비용만 건드리며 `chances()`와 결과 롤에 접근하지 않는다.
2. **이벤트는 골드 사용처 가격과 `huntReward`·`cost`·`sell`·가격식을 바꾸지 않는다.** 수입 배율(곱)만 임시로 붙는다. 소모품·기념비·특성 종류 변경·등급 올리기 가격은 이벤트 중에도 같다 (`m2-overview.md` H표 "F13이 사용처를 건드리는가: 없음"을 **확정**).
3. **오프라인 정산(`settleOffline`)은 `S.events`를 읽지 않는다.** 접속 중 정상 틱의 자동 사냥만 이벤트를 받는다. **`runAutoCatchup`이 벽시계 경과로 따라잡는 실행(숨김 탭·동결·시계 점프 뒤, 최대 `AUTO_CATCHUP_MAX`=20회)은 이벤트 보너스를 받지 않는다**(결정): 그 구간에는 이벤트 시계(`dt` ≤ 2초)가 멈춰 있었으므로 보너스를 주면 60초 미만 숨김으로 이벤트 없이 흐르지 않은 시간에 보너스를 받는 틈이 생긴다. 판정은 §6.2 호출 위치 참조.
4. 이벤트 시간은 `now()`(기기 시계)를 읽지 않는다. `advanceEvents`는 `dtMs`와 `rng`만 받는다.
5. 이벤트 상태가 없을 때(`active === null`) 모든 계산은 이벤트 도입 전과 **값·rng 호출 열이 같아야** 한다. 이벤트 항이 0이면 그 배율 항을 곱하지 않고 기존 식을 그대로 쓴다(`m2-traits.md` §3.1과 같은 규칙).

## 3. 기존 시스템과의 상호작용 표 (필수)
| 시스템 | 영향 | 이유 | AC |
| --- | --- | --- | --- |
| `BONUS_CAP` | 행운의 시간만: raw에 +5가 더해진 뒤 `min(raw, cap)`. 상한이 한계 | 상한이 이미 찬 사람에게 효과 0은 의도(UI가 정직하게 표시) | 7~12 |
| `SUCC_CEIL` | 행운의 시간만: `min(base+bonus+mastery, max(base, SUCC_CEIL))` 그대로 | 확률 계산 불변 | 11, 12 |
| 실패 보정(pity) | 불변. pity 보너스 계산은 `sword.pity`만 읽는다. 이벤트 덕 성공도 성공이라 pity는 0이 된다(일반 성공과 같음) | | 14 |
| 천장 게이지 | 입력 불변. 이벤트 덕 성공은 성공이므로 게이지가 0이 된다(일반 성공과 같음). 게이지 가득 확정 시도는 `certain()`이라 이벤트 항이 없다 | | 13, 15 |
| 숙련 | 입력 불변. **이벤트 덕 성공(`roll ≥ succNoEvent`)은 숙련 기록 +1을 하지 않는다**. 이벤트 없이도 성공이었던 롤은 기존대로 센다 | 숙련은 영구 보너스이므로 이벤트로 올리지 못하게 | 13, 14 |
| 파괴·보호 | 파괴율 불변(전 조합 전수 검사, AC 10). 보호권·`protectNeed`·파편 불변 | 파괴율 공식이 `min(DESTROY, 100-succ)`라 이론상 닿을 수 있으나 상수상 0건 | 10 |
| 확정 강화권·`forceSuccess` | `certain()` 경로라 이벤트 항 없음 | 확정은 확률 계산을 우회 | 15 |
| 축복·모루 토글의 "낭비" 표시 | `bonusWasted`·`bonusCapNote`는 이벤트 항을 **포함해** 계산한다. 이벤트+보정+모루가 이미 상한이면 축복이 "상한 도달"로 보인다(소모품을 아낄 수 있음) | 같은 풀을 나눠 쓰는 것이 정직한 표시 | 16 |
| 특성(batch A) | 곱연산 독립 인자(§5.3). 특성은 `chances()`를 읽지 않으므로 행운의 시간과 직접 충돌하지 않는다. 대장장이·광부·약탈자·일꾼과는 §5.3의 정수 순서 | | 20~29 |
| 골드 사용처(특성 관리·기념비) | 가격 불변. 사냥 대목·자동 풍년이 수입을 올려 사용처에 닿는 시간을 줄이지만 평균 ≤3%(§7.3) | 규칙 0 유지 | 30 |
| 골드 부스터 | 곱연산 독립. `boostFactor` 위치는 기존 그대로 | | 21, 23 |
| 감정 인장·판매·납품 | 이벤트 영향 없음 | | 31 |
| F4 의뢰 | 새로고침 **가격만** 할인. 보상·단계·쿨다운·생성은 불변. `QUEST_COOLDOWN_SEC`은 기존대로 실제 시각 기준 | 의뢰 시계는 별도 규칙(m1-quest)이다 | 28, 29 |
| 방치(접속 중) | 자동 풍년·광맥 발견이 정상 틱의 자동 사냥에 적용. **벽시계 따라잡기(catch-up) 실행은 이벤트 보너스 없음**(숨김 <60초 틈 차단, §6.2) | 이벤트 시계가 멈춘 구간에 보너스를 주지 않기 위해 | 22, 22a, 25 |
| 오프라인 | 무시. 이벤트 `remainMs`도 오프라인 구간만큼 줄지 않는다(복귀 정산은 시간을 흘리지 않는다) | 시계 조작·방치로 이벤트를 얻지 못하게 | 36, 37 |
| 탭 잠금 | 잠긴 탭은 이벤트를 진행·스폰·저장하지 않는다. 이어받기 때 저장에서 읽는다 | 이중 카운트·이중 스폰 방지 | 38~42 |
| 저장 | v2 유지, 필드 추가. 이벤트 시작·종료 즉시 `persist()` | 새로고침으로 이벤트 종류를 다시 뽑지 못하게 | 43~48 |
| 자동 저장 | 5초 주기(`AUTOSAVE_MS`)에 포함. 비정상 종료 시 `remainMs`가 최대 5초 늦다(플레이어에게 유리, 수용) | | 49 |
| 숨김 탭 | `document.hidden`이면 `tick`이 일찍 반환 → 이벤트 시간도 멈춤. 복귀(`resume`) 때 `dt` 기준점을 리셋해 숨긴 시간을 흘리지 않는다 | | 35 |
| `test.html` | 별도 저장 키라 실제 저장과 분리. 테스트 전용 `setEvent`만 제공 | | 50 |

## 4. 이벤트 표 (초안)
이벤트 id 순서 `EVENT_IDS` = 표 순서(가중치 누적·UI 정렬 기준). 지속 시간은 모두 300초(5분)로 같다(상수는 이벤트별로 둔다).

| id | 이름 | 가중치 | 해금(`S.best ≥`) | 추가 조건(스폰 시) | 지속 | 값 `v` | 효과 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `luck` | 행운의 시간 | 12 | 5 | 없음 | 300초 | 5 (%p) | 활성 검이 +5~+19일 때 강화 성공 확률 보너스 합(raw)에 +5%p |
| `hunt` | 사냥 대목 | 24 | 13 | 없음 | 300초 | 40 (%) | 수동 사냥 골드 +40% |
| `auto` | 자동 풍년 | 18 | 13 | `S.idle.autoOn` | 300초 | 50 (%) | 접속 중 자동 사냥 1회 골드 +50% |
| `ore` | 광맥 발견 | 16 | 5 | 없음 | 300초 | 50 (%) | 사냥당 광석 +50% (사냥(수동·자동) 1회당 광석 비율) |
| `anvil` | 모루 가호 | 16 | 5 | 모루 1개 이상 보유(`S.anvils.length > 0`) | 300초 | 40 (%) | 모루로 강화할 때 40% 확률로 내구도 보존 (모루를 쓴 강화 시도마다 내구도 미소모) |
| `quest` | 의뢰소 특가 | 14 | 5 | 없음 | 300초 | 50 (%) | 의뢰 새로고침 비용 −50% |

가중치 합 12+24+18+16+16+14 = **100**.
- 시스템 해금: `S.best ≥ EVENT_UNLOCK_BEST`(5). 그 미만에서는 `sinceMs`도 쌓이지 않고 스폰도 없다.
- **왜 사냥 대목·자동 풍년은 +13부터인가**: 골드 제한 구간(+5~+12)에서 수입을 올리면 +20 페이스를 줄인다. `m2-overview.md` C.5 추정은 약탈자 +30%가 그 구간 시간을 최대 `1 − 1/1.3 ≈ 23%` 줄인다. 이벤트 +40%가 구간 전체를 덮으면 `1 − 1/1.4 ≈ 29%`로 더 크다. +13 이후는 `m2-overview.md` B.5 결론대로 골드가 이미 남으므로 페이스에 영향이 없다.
- **왜 의뢰소 특가는 강화 비용이 아니라 새로고침만 깎는가**: 강화 비용 할인은 골드 제한 구간(+5~+12)을 직접 빠르게 한다. 새로고침은 선택 지출이고 +20에 필수가 아니라 페이스와 무관하다. 할인액도 작다(§7.5).
- **왜 파편 이벤트가 없는가**: 파편은 파괴가 있어야 늘고, 파괴는 행운의 시간과 같은 시점의 결과다. 따로 "파편 +%"를 주면 파괴를 반기게 되는 역설이 생기고 광맥 발견·모루 가호와 가치가 겹친다. 후보로 남기고 이번에는 뺀다(§16).
- 지속 시간 제한(로드 시 검사 권장): 모든 `durationSec ≤ EVENT_GAP_MIN_SEC ÷ 3` (=300). 최대 가동률 25% 보장의 전제(§6.3).

## 5. 효과 공식 (정수 계산 순서)
`vX` = 그 이벤트가 **활성일 때** `EVENTS[id].value`, 아니면 0. 특성 값은 `m2-traits.md`의 `vHunt`·`vWork`·`vOre`·`vAnvil`. **이벤트 항이 0이면 이벤트 곱을 붙이지 않고 기존 식·코드 경로를 그대로 쓴다.**

### 5.1 곱연산 규칙 (초안)
이벤트는 특성·부스터와 **덧셈이 아니라 곱**으로 겹친다(독립 인자). 이유: ① 특성 문서가 이미 부스터·수확 보너스와 곱연산이라 일관됨, ② 덧셈이면 특성이 큰 사람일수록 이벤트가 덜 가치 있어 균형이 거꾸로 감. 정수 순서는 "정수 `(100+v)`들을 먼저 곱한 뒤 **마지막에 한 번** 나눠 floor/round"(`m2-traits.md` §3.1과 같은 부동소수 오차 방지 규칙).

### 5.2 행운의 시간 (확률)
- 입력: `enhanceOpts(S)`에 `event: luckBonus(S, lv)`를 넣는다. `luckBonus` = `luck` 활성이고 `EVENT_LUCK_MIN_LV(5) ≤ lv ≤ EVENT_LUCK_MAX_LV(19)`면 5, 아니면 0.
- `chances(sword, opts)` 새 순서(굵은 글씨가 변경):
  ```
  parts = { bless, anvil, pity }                                 // 불변(부분 항 3개, 형태 그대로)
  event = opts.event || 0                                        // 최상위 필드(parts에 넣지 않음)
  raw   = bless + anvil + pity + event                           // raw는 이벤트를 포함한다
  cap   = BONUS_CAP[band];  bonus = min(raw, cap)
  mastery = masteryBonus(l, opts.mastery)                        // 불변
  succ  = min(base + bonus + mastery, max(base, SUCC_CEIL))      // 불변
  dest  = max(0, min(DESTROY[l], 100 - succ))                    // 불변
  succNoEvent = (event>0) ? 같은 식에서 event=0으로 계산한 succ : succ
  eventGain   = succ - succNoEvent                               // 상한·천장에 잘린 뒤 실제 증가 %p
  eventLost   = event - eventGain                                // 상한·천장에 잘려 사라진 몫
  반환에 최상위 필드 { event, succNoEvent, eventGain, eventLost } 추가   // parts 안이 아니다
  ```
- **`parts: null` 유지**: 코드의 `certain()`과 최대 단계(`l >= MAX`) 반환은 `parts: null`이고 `view.js`·`run-m1-qa-tests.js`가 이에 의존한다. 두 분기 모두 `parts`를 건드리지 않고 **최상위 필드만** 추가한다: `certain()`은 `event: 0, eventGain: 0, eventLost: 0, succNoEvent: succ`(= 100), 최대 단계 반환은 `event: 0, eventGain: 0, eventLost: 0, succNoEvent: succ`(= 0). 일반 분기의 `parts`도 `{bless, anvil, pity}` 그대로다(이벤트 항은 `parts`에 없다).
- `capped` 정의는 불변(`raw > cap || succ < base+bonus+mastery`).
- 결과 롤: `roll = rng() × 100`은 기존 한 번뿐. `eventAssist = (outcome === 'success') && event>0 && roll >= succNoEvent`. 이 값으로 `recordLateProgress`가 **숙련 기록만** 건너뛴다(게이지·pity·단계 변화는 일반 성공과 같음). `r.eventAssist`를 결과 객체에 둔다(토스트·로그용).
- 확률 분포: 성공 `succNoEvent → succ`(+`eventGain`), 파괴 불변, 실패 −`eventGain`. 롤 영역상 파괴 띠가 `eventGain`만큼 위로 이동할 뿐 폭은 같다.

실효 이득 `eventGain = min(5, max(0, cap − rawNoEvent))` (`rawNoEvent` = 이벤트를 **뺀** `bless+anvil+pity`; 천장이 닿지 않는 상수 조합에서; 천장은 §5.2 아래 "닿지 않는다" 참조). 모루 등급 0/철/강철/미스릴 = 0/2/3/4, 축복 10, pity 0일 때(`raw`는 이벤트 없는 합):

| 보유 | raw | 상한 20 구간(+5~+9) 이득 | 상한 14 구간(+10~+19) 이득 |
| --- | --- | --- | --- |
| 소모품 없음 | 0 | 5 | 5 |
| 미스릴 모루만 | 4 | 5 | 5 |
| 축복만 | 10 | 5 | 4 |
| 축복 + 철 | 12 | 5 | 2 |
| 축복 + 강철 | 13 | 5 | 1 |
| 축복 + 미스릴 | 14 | 5 | **0** |
| 축복 + 미스릴 + pity 횟수 6(+5~+9 구간 보너스 6) | 20 | 0(raw 20이 이미 상한 20) | 해당 없음(밴드 2·3은 pity 횟수 6 = 보너스 12라 raw 26, 0) |

- **어느 단계에서 실제로 효과가 있는가**: `BONUS_CAP = [20, 20, 14, 14]`(밴드 = `floor(l/5)`). 밴드 1(+5~+9)은 상한이 20이라 축복+미스릴(14)에도 6의 여유가 있어 **항상 +5 전부** 들어간다(pity가 6이어서 raw=20이 되는 극단만 0). 밴드 2·3(+10~+19)은 상한 14라 보유 소모품에 따라 5→0이며, **축복+미스릴을 다 쓰는 플레이는 +10 이상에서 효과 0**이다. 이것은 의도다: 이벤트가 `BONUS_CAP`을 넘지 않는다는 것이 하드 규칙이다.
- **`SUCC_CEIL`(90)은 상수상 닿지 않는다**: 밴드 1에서 `base + 20 ≤ 90`(+5: 70+20 = 90 정확히 천장)이고 밴드 0은 행운의 시간이 +5부터라 해당 없음. 그래도 `min(..., max(base, SUCC_CEIL))` 식은 그대로 두어 상수가 바뀌어도 안전하다(AC 11, 12가 주입값으로 검사).
- 파괴율: `+5~+19`의 **도달 가능한 상태** `bless(2) × anvilGrade(4) × pity 횟수 0..12(13) × 숙련 기록`(숙련은 +15~+19에서만, 기록 0..`MASTERY_REC_MAX[l−15]` = 4/4/4/3/2; +5~+14는 0 고정) = 3,328건에서 이벤트 +5 유무로 `dest`가 달라지는 경우는 **0건**(노드 한 줄 스크립트로 `chances()` 식을 재현해 확인, 3,328건·차이 0). 도달 불가 조합(+5~+14에서 숙련 > 0)까지 포함한 단순 격자는 7,800건이다. 규칙상 AC 10으로 전수 검사한다.

#### 5.2.1 행운의 시간 작업 예 (이벤트 `event=5` 켜짐, 숙련 0 별도 표기)
| 검 단계 | base | 구성 | raw(이벤트 전→후) | cap | succ 전 → 후 | eventGain |
| --- | --- | --- | --- | --- | --- | --- |
| +7 | 60 | 축복 10 + 미스릴 4 | 14 → 19 | 20 | 74 → 79 | 5 |
| +13 | 30 | 소모품 없음 | 0 → 5 | 14 | 30 → 35 | 5 |
| +13 | 30 | 축복 10 + 철 2 | 12 → 17 | 14 | 42 → 44 | 2 |
| +13 | 30 | 축복 10 + 미스릴 4 | 14 → 19 | 14 | 44 → 44 | **0** |
| +15 | 20 | 축복 + 강철 3, 숙련 기록 4(12%p) | 13 → 18 | 14 | 45 → 46 | 1 |
| +17 | 10 | 소모품 없음 | 0 → 5 | 14 | 10 → 15 | 5 |
| +19 | 5 | 축복 + 철 | 12 → 17 | 14 | 17 → 19 | 2 |
(+20은 최대 단계라 강화가 없다. 사냥·자동 이벤트의 +20 작업 예는 §5.3.)

### 5.3 수입·소모 이벤트와 특성·부스터 (정수 순서)
1. **사냥 대목** — 수동 사냥 골드:
   `manualHuntGold = floor(huntReward(topLv) × (100+vHunt) × (100+evHunt) × boostFactor / 10000)`.
   `vHunt`=0이면 `(100+vHunt)` 항을, `evHunt`=0이면 `(100+evHunt)` 항을 빼고 나눗수를 맞춘다(둘 다 0이면 기존 `floor(huntReward × boostFactor)`). `boostFactor`는 1 또는 1.5라 앞의 정수곱은 정확하다. 수확 보너스(`goldUpFactor`)는 수동 사냥에 적용하지 않는 규칙을 유지한다.
2. **자동 풍년** — 접속 중 자동 1회:
   `autoRunGold = round(autoReward(topLv) × goldUpFactor × boostFactor × (100+vWork) × (100+evAuto) / 10000)`(없는 항은 빼고 나눗수 조정). `round`의 위치는 기존과 같다. `goldUpFactor`는 소수(`1+0.1n`)라 기존 식의 부동소수 경계 위험은 그대로이며, 테스트는 정확한 `n=5`(×1.5)로 한다. `settleOffline`은 이 식을 쓰지 않는다(원래 `autoReward`를 직접 계산) → 이벤트 무시. **catch-up 실행(`wallDtMs > EVENT_DT_MAX_MS`인 틱의 `runAutoCatchup`)은 `evAuto = 0`**으로 계산해 기존 식 그대로(§6.2).
3. **광맥 발견** — 광석 비율을 **1/10000 단위 정수**로 계산:
   `rate1e4 = (ORE_PER_HUNT[k] × 2) × (100+vOre) × (100+evOre) / 2`.
   `ORE_PER_HUNT × 2`는 4/2/1(정수), `(100+vOre)`는 5의 배수, `evOre`는 10의 배수 → 곱이 50의 배수라 `/2`가 항상 정수(상수 검사 필요, §10). `whole = floor(rate1e4 / 10000)`, `frac = rate1e4 % 10000`, `gains = whole + (floor(rng() × 10000) < frac ? 1 : 0)`. 광석 종류당 rng **1회**(기존과 같음). **이벤트가 꺼져 있으면 `m2-traits.md` §3.1의 기존 경로를 그대로 쓴다**(`floor(rng()×100)` 비교 또는 특성 없음의 `rng() < rate - whole`). `expectedOre`(오프라인)는 이벤트를 쓰지 않는다. 광석 종류 해금(`ORE_UNLOCK_LV`)·상한(`ORE_MAX`)은 그대로.
4. **모루 가호** — `attemptEnhance`에서 **모루가 실제 적용된 시도**(`use.anvil` 유효, `anvil != null`)만 대상. 결과 롤 **다음**, `anvilBroke` 판정 **전**에 롤 1회:
   `saveP1e4 = 10000 − (100 − aTrait) × (100 − evAnvil)`, `aTrait` = 활성 검의 대장장이 특성 값(없으면 0), `evAnvil` = 0 또는 40. 이벤트가 켜져 있을 때만 `floor(rng() × 10000) < saveP1e4`이면 `anvil.dura++`(시도 내구도 소모 0). 이벤트가 꺼져 있으면 기존 대장장이 경로(`floor(rng()×100) < vAnvil`, 대장장이일 때만 1회). 두 효과는 **독립 확률의 합성**(1 − (1−a)(1−b))이다.
   - rng 호출 수: 이벤트 꺼짐은 기존과 같고(특성 있고 모루 적용이면 +1), **모루 가호 켜짐 + 모루 적용이면 특성 유무와 상관없이 +1**. 모루가 적용되지 않은 시도(토글 꺼짐·미장착·천장 확정)는 롤하지 않는다.
5. **의뢰소 특가** — `rerollCostBase = max(QUEST_REROLL_MIN, QUEST_REROLL_COST_MULT × cost(S.best))`(기존). 이벤트 활성이면 `rerollCost = max(QUEST_REROLL_MIN, floor(rerollCostBase × (100 − evQuest) / 100))`. `rerollBlock`의 `noGold` 판정과 `rerollQuest` 차감은 모두 이 값이다.

#### 5.3.1 작업 예 (best = 13 / 15 / 17 / 20)
`H`: 2,676 / 9,158 / 31,345 / 198,462. `autoReward`: 596 / 1,432 / 3,441 / 12,813. **"자동 1회" 행은 모두 수확 보너스(`S.idle.up.gold`) lv5(`goldUpFactor` ×1.5)를 가정한 값**이다. lv5가 없으면 이벤트 없음 = `autoReward` 그대로(best 13: 596, 풍년 +50 = 894). 예: 1,341 = `round(596 × 1.5(lv5) × 1.5(풍년))`. 사냥 행은 수확 보너스를 받지 않는다(수동 사냥).
| 항목 | 13 | 15 | 17 | 20 |
| --- | --- | --- | --- | --- |
| 사냥, 이벤트 없음 | 2,676 | 9,158 | 31,345 | 198,462 |
| 사냥, 대목(+40) | 3,746 | 12,821 | 43,883 | 277,846 |
| 사냥, 대목 + 부스터(×1.5) | 5,619 | 19,231 | 65,824 | 416,770 |
| 사냥, 대목 + 약탈자 3등급(+30) | 4,870 | 16,667 | 57,047 | 361,200 |
| 사냥, 대목 + 부스터 + 약탈자 3등급 | 7,305 | 25,001 | 85,571 | 541,801 |
| 자동 1회(수확 lv5 ×1.5), 이벤트 없음 | 894 | 2,148 | 5,162 | 19,220 |
| 자동 1회(수확 lv5), 풍년(+50) | 1,341 | 3,222 | 7,742 | 28,829 |
| 자동 1회(수확 lv5), 풍년 + 일꾼 3등급(+45) | 1,944 | 4,672 | 11,226 | 41,802 |
| 자동 1회(수확 lv5), 풍년 + 일꾼 3등급 + 부스터 | 2,917 | 7,008 | 16,839 | 62,704 |
| 새로고침 비용, 이벤트 없음 | 17,880 | 42,960 | 103,230 | 384,390 |
| 새로고침 비용, 특가(−50) | 8,940 | 21,480 | 51,615 | 192,195 |
- 검증 예: best 13 사냥 대목 = `floor(2676×100×140×1/10000)` = `floor(3746.4)` = 3,746. 약탈자 3등급+부스터 = `floor(2676×130×140×1.5/10000)` = `floor(7305.48)` = 7,305.
- 최악 중첩 배율: 사냥 `1.3 × 1.4 × 1.5 = 2.73`, 자동 `1.45(일꾼) × 1.5(풍년) × 1.5(부스터) = 3.26`(수확 보너스 미포함. lv5 ×1.5를 곱하면 약 4.89). 위 표 계산값은 코드(`R.percentScaled`·`autoRunGold`)로 재계산해 일치를 확인했다.
- 계산 순서(코드): 사냥은 `huntReward × boostFactor`를 먼저 곱한 뒤 `(100+v)`들을 곱하고 마지막에 한 번 나눠 `floor`, 자동은 `autoReward × goldUpFactor × boostFactor` 뒤 같은 방식으로 `round`.

광맥 발견(철/은/미스릴 사냥 1회당 기대 개수, 기본 2 / 1 / 0.5):
| 구성 | 철 | 은 | 미스릴 |
| --- | --- | --- | --- |
| 이벤트 없음 | 2 | 1 | 0.5 |
| 이벤트 +50 | 3 (`rate1e4`=30000) | 1.5 (15000) | 0.75 (7500) |
| 이벤트 + 광부 1등급(+20) | 3.6 (36000) | 1.8 (18000) | 0.9 (9000) |
| 이벤트 + 광부 3등급(+60) | 4.8 (48000) | 2.4 (24000) | 1.2 (12000) |

모루 가호 저장 확률(`saveP1e4`): 대장장이 없음 4,000(40%) · 1등급(15%) 4,900(49%) · 2등급(30%) 5,800(58%) · 3등급(45%) 6,700(67%).

## 6. 스폰 알고리즘 (결정 + 초안)

### 6.1 시작 방식: 자동 시작 + 토스트 (결정 근거)
| 방식 | 장점 | 단점 | 결정 |
| --- | --- | --- | --- |
| **자동 시작 + 토스트** | 버튼·UI 추가 없음, 놓친 이벤트가 없음, "가끔 열리는 한시 버프"(로드맵 F13)와 일치, 이용권 없이 골드 사용처를 늘리지 않음 | 하던 일과 안 맞는 이벤트(예: 모루 없는데 모루 가호)가 뜰 수 있음 → 스폰 조건(§4)으로 줄임 | **채택** |
| 수락 후 시작 | 원하는 타이밍에 쓸 수 있음 | 버튼·대기 상태·만료 규칙·저장 필드 추가. 행운의 시간을 "소모품을 다 쓴 뒤"로 미루는 최적화 숙제가 생김 | 기각 |
| 이용권(골드로 구매) | 골드 싱크가 늘어남 | 사용자 지시: 이용권·골드 사용처 **없음**. 이벤트 가치가 수입에 닿는다면 스스로 본전을 뽑는 사용처(규칙 0 위반) | 기각 |

### 6.2 상태와 알고리즘
상태 `S.events = { active: {id, remainMs} | null, sinceMs, nextAtMs }`(전부 정수 ms).
- `sinceMs`: 직전 이벤트 **종료(또는 최초)**부터 쌓인 활성 플레이 ms. 이벤트가 활성인 동안은 쌓지 않는다.
- `nextAtMs`: 다음 스폰 임계값(ms). 기본값 `EVENT_GAP_MIN_SEC × 1000`(=900,000, 첫 이벤트는 15분). 이후 값은 **이벤트 종료 때** 뽑는다(저장에 들어가 새로고침으로 다시 뽑을 수 없다).

`advanceEvents(S, dtMs, rng)` — 순수 함수, 틱마다 호출. 반환은 `{}`(변화 없음·잠김) · `{ started: id }`(스폰) · `{ ended: id }`(종료) 셋 중 하나이며, 키가 없으면 `undefined`다(`null` 값을 담지 않는다).
```
if S.best < EVENT_UNLOCK_BEST: return {}                         // 잠김: 아무것도 안 쌓음
dt = clamp(floor(dtMs), 0, EVENT_DT_MAX_MS)                      // 음수·NaN → 0, 상한 2000
if S.events.active:
    active.remainMs -= dt
    if active.remainMs <= 0:                                     // 종료 (남은 dt는 버림)
        ended = active.id;  active = null;  sinceMs = 0
        gapSec = EVENT_GAP_MIN_SEC + floor(rng() * (EVENT_GAP_MAX_SEC - EVENT_GAP_MIN_SEC + 1))   // rng 1회
        nextAtMs = gapSec * 1000
        return { ended }
else:
    sinceMs = min(sinceMs + dt, EVENT_GAP_MAX_SEC×1000)
    if sinceMs >= nextAtMs:                                      // 스폰
        list = eligibleEvents(S)                                 // EVENT_IDS 순서, best·추가 조건 통과분
        r = rng() * sum(weight of list)                          // rng 1회
        id = list의 누적 가중치를 순서대로 훑어 첫 'r < 누적' 항목
        active = { id, remainMs: EVENTS[id].durationSec * 1000 }
        S.stats.eventsSeen++
        return { started: id }
return {}
```
- **rng 호출 순서(결정적)**: 스폰 시 1회(종류), 종료 시 1회(다음 간격). 한 호출에서 두 전이가 겹치지 않는다(종료와 스폰은 서로 다른 호출). 그 외에는 rng를 쓰지 않는다. `rng()∈[0,1)`이므로 경계는 `<`.
- `eligibleEvents`가 빌 일은 없다(`hunt`는 best≥13, `luck`/`ore`/`quest`는 best≥5에서 추가 조건 없음 → 항상 최소 3종).
- 같은 이벤트가 연속으로 나올 수 있다(중복 방지 필드 없음, 결정표).
- `sinceMs` 상한: `advanceEvents`는 `sinceMs`를 더할 때 `EVENT_GAP_MAX_SEC×1000` 이하로 자른다(7-2). 따라서 스폰 틱에서도 §10의 범위가 런타임에 그대로 유지되며 `nextAtMs ≤ 상한`이라 스폰 시점과 rng 열은 바뀌지 않는다.
- 호출 위치(`main.js` `tick`): 오프라인 복귀 판정·`runAutoCatchup` **앞**에서 `advanceEvents(S, dt, rng)`. 종료·시작이 나오면 토스트(§9)와 **즉시 `persist()`**. 같은 틱의 자동 사냥·수동 사냥은 갱신된 상태를 읽는다(이벤트가 이 틱에 끝났다면 이 틱의 자동 사냥 몫은 보너스 없음).
- **catch-up 실행에는 이벤트 보너스를 주지 않는다**(결정): 이 틱의 벽시계 경과 `wallDtMs`(= `now()` 차이)가 `EVENT_DT_MAX_MS`(2000)를 넘으면 그 틱의 `runAutoCatchup`은 `evAuto = 0`과 광맥 `evOre = 0`(자동 사냥분)으로 호출한다. 이유: 숨김·동결 구간(예: 30초)에는 `advanceEvents`가 2초만 흘렸으므로 나머지 28초분 자동 사냥에 `+50%`를 주면 이벤트 시계 밖의 시간에 보너스를 주게 된다. `wallDtMs ≤ 2000`인 정상 틱은 보너스를 받는다. 기기 시계 점프는 이 판정에 영향을 줘도 보너스를 **줄이기만** 한다(늘리지 않음). 오프라인 복귀 정산(`settleOffline`)은 원래 이벤트 무시.
- `dt` 입력(주입 단조 시계, `main.js` `stepEventClock(t)`): `mono()`(기본 `performance.now()`, 없으면 `now()`)로 `dtMs = mono() − ui.eventLastMono`, 기기 시계로 `wallDtMs = now − ui.eventLastWall`을 구하고 **두 기준점(`eventLastMono`·`eventLastWall`)을 매 틱 갱신**한다. `advanceEvents(S, dtMs, rng)`는 `dtMs`만 쓰고(내부에서 2초로 자름), `wallDtMs`는 같은 틱의 `runAutoCatchup(S, t, nextAutoAt, rng, { noEvent: wallDtMs > EVENT_DT_MAX_MS })` 호출에 `opts.noEvent`로 넘기는 데만 쓴다.
- 기준점 리셋: `isSuspended()`·`document.hidden`으로 틱이 건너뛴 구간을 이벤트에 흘리지 않도록 **단조 기준점 `ui.eventLastMono = mono()`는 `resume`과 `resetUiFor`에서 리셋**한다(`main.js` `resetEventMono`). `takeOver`는 `adoptStoredSave(force)`(→ `resetUiFor`) 뒤 `resume()`을 부르므로 `resume`을 거쳐 포함되며 별도 리셋이 아니다.
- **`resume`은 기기 시계 기준점 `eventLastWall`을 옮기지 않는다.** `resetUiFor`만 `eventLastWall = t`로 맞춘다. 결과: 60초 미만 숨김 뒤 첫 틱은 `wallDtMs`가 숨긴 시간만큼 커서 `EVENT_DT_MAX_MS`를 넘으므로, 그 틱의 catch-up은 `noEvent`가 되어 보너스가 없다(AC 22a). 60초 이상 숨김은 첫 틱에서 `resume()`(오프라인 정산)이 처리한다. 기기 시계(`now()`)를 바꿔도 `mono`에는 영향이 없고, 시계 오류·정지로 `dt`가 커져도 틱당 2초가 한계다.

### 6.3 최대 가동률 (손계산)
- 한 주기 = 이벤트 `D` + 다음 스폰까지 활성 플레이 `G`. `G ∈ [900, 1800]`(균등), `D = 300`.
- **최대 가동률 = D ÷ (D + G_min) = 300 ÷ 1,200 = 25%**(모든 간격이 최소). 평균 가동률 = 300 ÷ (300 + 1,350) ≈ **18.2%**.
- 이벤트별 평균 가동률 = 가중치 비율 × 18.2%: 행운 12% → **2.18%**, 사냥 24% → 4.36%, 자동 18% → 3.27%, 광맥 2.9%, 모루 2.9%, 의뢰 2.5%. (해금 조건 때문에 +5~+12에서는 후보가 줄어 행운이 더 자주 나온다: 후보 `luck 12 + ore 16 + quest 14`(모루 없음) = 42 → 행운 28.6%, 모루 보유 시 `+16` = 58 → 20.7%.)
- 세션·일일 상한은 필요 없다: 이벤트 시간과 스폰 시간이 모두 **활성 플레이 시간**이라 하루 24시간 켜 둬도 가동률은 25%를 넘을 수 없다.
- 첫 이벤트는 `S.best ≥ 5`가 된 뒤 활성 플레이 15분 시점이다. +20까지 약 25분인 플레이는 **많아야 이벤트 1번**을 겪는다(15분에 시작해 20분에 끝, 다음은 최소 35분 시점).

## 7. 페이스 분석 (손계산, 시뮬레이션 아님)

### 7.1 행운의 시간
기대 시도는 `Σ 1/p`(단계마다 한 번 통과, 하락·재제작 제외 — **상대 비교용 근사**이며 게이지·숙련은 시도 수를 더 줄이므로 이 근사는 이벤트 효과를 **과대평가**한다). 단계 +5~+19, 이벤트 가동률 100%일 때 시도 수 변화:

| 보유 구성 | 이벤트 없음 | 이벤트 +5 | 감소 | 1,261회 기준 5분 창(250회)의 절약 |
| --- | --- | --- | --- | --- |
| 소모품 없음 | 79.3 | 54.7 | 31.0% | 6.2% (이 구성은 1,261회로 끝나지 않으므로 참고) |
| 미스릴 모루만 | 58.0 | 45.3 | 21.9% | 4.3% |
| 축복만 | 43.5 | 37.7 | 13.3% | 2.6% |
| 축복 + 철 | 40.4 | 37.6 | 7.1% | 1.4% |
| 축복 + 강철 | 39.1 | 37.5 | 4.1% | 0.8% |
| 축복 + 미스릴 | 37.8 | 37.4 | 1.2% | 0.2% |
- 계산: 감소 = `1 − Σ(이벤트)/Σ(없음)`, 5분 창 절약 = `250 × 감소 ÷ 1,261`(50회/분 × 5분 = 250회, 사용자 기록 1,261회 ≈ 25분 기준).
- **1,261회 안에 +20에 도달하는 플레이(= 소모품을 상당히 쓴 플레이)는 5분 창 한 번의 절약이 최대 1.4~4.3%**이다. 이벤트가 한 번도 안 나오는 런이 더 많다: 첫 이벤트가 행운일 확률은 12~29%(§6.3), 그 뒤 두 번째 이벤트는 시작이 +20 도달 이후다.
- **런당 기대 단축** ≈ 행운 확률 × 창 절약 ≈ 0.29 × 4.3% = **최대 1.2%**, 보통(축복+철, 21%) 0.3%.
- **결론**: +5%p, 단계 +5~+19 전체에 적용해도 약 5% 한계 안이다. **%p 감소나 단계 제한은 하지 않는다.** 플레이 테스트에서 +20 단축이 5%를 넘으면 ① `value` 5 → 3, ② 그래도 크면 `EVENT_LUCK_MIN_LV`를 10으로 올려 +5~+9를 제외한다.
- 확률 외 불변: 이 계산은 `chances()` 안에서 `BONUS_CAP` 상한이 가장 큰 방어선임을 보여 준다. 축복+미스릴 사용자는 +10~+19에서 효과 0(0.2~1.2%)이다.

### 7.2 +5~+12 골드 제한 구간
행운의 시간만 해당(사냥·자동은 +13부터). 밴드 1(+5~+9)은 소모품이 있어도 이득이 거의 항상 +5라 이 구간이 이벤트의 주 효과다. 단 이 구간은 시도 수 자체가 작다(§7.1 근사: 축복 보유 시 `Σ1/p` 7.2 → 6.7, 약 7% 감소). 한 번의 5분 창이 이 구간의 시도 수를 줄여 얻는 시간은 수십 초 수준이고 +20 전체에서는 1~2% 이하다.

### 7.3 사용처(특성 관리·기념비) 보호
- 한 번의 사냥 대목이 줄 수 있는 최대 골드: `24회/분 × 5분 × 40% × H = 48H`(연속 사냥), 듀티 25%면 `12H`. **가장 싼 사용처(종류 변경 80H)보다 작다.**
- 장기 평균: 사냥 대목 평균 가동률 4.36% × 40% = 수동 수입 **+1.7%**, 자동 풍년 3.27% × 50% = 자동 수입 **+1.6%**. `m2-overview.md` C.4의 "전부 사는 데 듀티 25%에서 약 3.1시간"은 최대 약 3% 줄어 약 5분 단축. 사용처가 무력화되지 않는다.
- 이벤트는 가격을 바꾸지 않는다(하드 규칙 2).

### 7.4 광맥·모루·의뢰
광석·모루 내구도·새로고침은 골드 흐름이나 확률에 닿지 않아 페이스 영향이 없다. 모루 가호의 가치는 철 모루(`ANVIL_DURA` 30)에서 5분 약 20~30회 시도의 40% ≈ 8~12 내구도 절약 정도다.

### 7.5 의뢰소 특가의 절약 규모
best 15에서 새로고침 42,960 → 21,480G(−21,480 ≈ 2.3H). 가장 비싼 best 20도 −192,195G ≈ 0.97H. 사냥 1회 안쪽이라 골드 사용처 구도를 흔들지 않는다.

## 8. 이벤트 상태 API (순수 함수 목록)
새 파일 `js/events.js`(`SG.events`)와 기존 모듈 변경:
| 함수 | 위치 | 설명 |
| --- | --- | --- |
| `eventDef(id)` | events.js | `EVENTS[id]` 또는 null(`hasOwn` 사용) |
| `eventsUnlocked(S)` | events.js | `S.best ≥ EVENT_UNLOCK_BEST` |
| `activeEvent(S)` | events.js | 해금됐고 `active.id`가 유효하면 `{id, remainMs, def}`, 아니면 null |
| `eventValue(S, id, opts)` | events.js | 그 이벤트가 활성이면 `def.value`, 아니면 0. `opts.noEvent`가 참이면 **항상 0**(벽시계 따라잡기 실행, §6.2) |
| `eligibleEvents(S)` | events.js | `EVENT_IDS` 순서, `minBest`·추가 조건(autoOn, 모루 보유) 통과한 id 배열 |
| `pickEvent(S, rng)` | events.js | 가중치 선택, rng 1회 |
| `drawGapMs(rng)` | events.js | 다음 간격(ms), rng 1회 |
| `advanceEvents(S, dtMs, rng)` | events.js | §6.2 |
| `luckBonus(S, lv)` | events.js | 행운의 시간 보너스(%p) 또는 0 |
| `fmtEventClock(ms)` | events.js | `m:ss`(올림). 효과 문장은 따로 돌려주는 함수 없이 화면이 `constants.js`의 `EVENTS[id].desc`(값 `v`로 만든 효과 문장, 9-2에서 확정: ore `사냥당 광석 +N%`, anvil `모루로 강화할 때 N% 확률로 내구도 보존`)를 직접 읽는다 (2026-11-27 변경: 쓰이지 않던 `eventDescription(id)` 제거, REQ-047) |
| `setEvent(S, id, remainMs)` | events.js | **테스트 전용**. 잘못된 id → `{ok:false, reason:'badEvent'}`, `remainMs`가 정수가 아니거나 1..duration 밖 → `'badTime'`. 상태 불변. `index.html` UI에서 호출 금지 |
| `chances` | rules.js | §5.2: `opts.event`, 최상위 `event`·`succNoEvent`·`eventGain`·`eventLost` 추가(`parts`·`certain()`·최대 단계 `parts: null` 불변) |
| `enhanceOpts` | rules.js | `event: luckBonus(S, lv)` 추가 |
| `recordLateProgress(S, l, outcome, assisted)` | rules.js | `assisted`면 숙련 기록 건너뜀 |
| `rollAnvilKeep(S, sw, rng)` | rules.js(내부 함수, 비공개) | 모루가 적용된 시도의 내구도 미소모 판정(`attemptEnhance`가 결과 롤 다음에 호출). 모루 가호 활성(`ev>0`)이면 합성 확률 `1−(1−a)(1−b)`로 rng 1회(1/10000 단위: `floor(rng()×10000) < 10000 − (100−v)(100−ev)`, `v`=대장장이 값, 없으면 0). 아니면 대장장이 값 `v>0`일 때만 rng 1회(`floor(rng()×100) < v`), `v=0`이면 rng 없음 |
| `attemptEnhance` | rules.js | `r.eventAssist`, 모루 가호 롤(`rollAnvilKeep`, §5.3-4). 이벤트 인자(`opts`) 없음: 시도는 벽시계 따라잡기와 무관 |
| `idle.manualHuntGold(S, now)` | idle.js | §5.3-1 곱 적용(`opts` 없음, 수동 사냥은 항상 이벤트를 받는다) |
| `idle.autoRunGold(S, t, opts)` | idle.js | §5.3-2 곱 적용. 선택 인자 `opts = { noEvent }`: 참이면 자동 풍년 항 0 |
| `idle.runAutoCatchup(S, now, nextAutoAt, rng, opts)` | idle.js | 선택 인자 `opts = { noEvent }`를 `autoRunGold`·`forge.rollOre`에 그대로 넘긴다. rng 호출 수는 `opts`와 무관하게 같다 |
| `forge.rollOre(S, rng, opts)` | forge.js | §5.3-3. 선택 인자 `opts = { noEvent }`: 참이면 광맥 항 0(기존 경로). 광석 종류당 rng 1회는 불변. `manualHunt`는 `opts`를 주지 않는다 |
| `quests.rerollCost` | quests.js | §5.3-5 |
| `normEvents` | save.js | §10 |

## 9. UI 사양 (잠정)
- **칩**: `index.html`·`test.html` 헤더, 저장 실패 배지(`#saveBadge`) 바로 뒤(`.spacer` 앞)에 팝오버 기준 상자 `<span class="event-wrap" id="eventWrap" hidden>`을 두고 그 안에 `<button class="event-chip" id="eventChip" aria-haspopup="dialog" aria-expanded="false" aria-controls="eventPop" hidden>`과 `#eventPop`을 넣는다. 이벤트가 없으면 칩과 감싼 상자 모두 `hidden`(헤더 간격도 생기지 않음). 있으면 `🍀 행운의 시간 4:12`(아이콘 + 이름 + `m:ss`). 남은 시간은 올림이라 마지막 순간에도 `0:01`이다. 칩 `title`은 전체 문장(`행운의 시간 4:12 남음 · 강화 성공 확률 +5%p`). 매 틱 `V.render()` 안의 `renderEventChip(S)`가 갱신(`setHTML` 캐시 사용). 아이콘은 M2 SVG(`ic("event_"+id)`)이며 SVG가 없으면 `EVENTS[id].icon` 이모지로 대체한다.
- **상세**: 칩을 누르면(모든 폭, 설정 팝오버와 같은 토글) `#eventPop`이 열린다: 아이콘·이름, 효과 문장(예: "수동 사냥 골드 +40%"), 남은 시간, 한 줄 안내 "접속 중에만 흐르고 오프라인에서는 적용되지 않습니다". 데스크톱 호버는 칩 `title` 툴팁으로 같은 내용을 보여 주고 팝오버를 열지 않는다(호버로 열린 상태가 남지 않게). 닫힘: 칩 다시 누름, 바깥 클릭, `Esc`, 탭 전환, 상태 교체(이어받기·새 게임, `resetUiFor`), 다른 탭 때문에 멈춤, 이벤트 종료(활성 이벤트가 없으면 렌더가 팝오버를 숨긴다). 행운의 시간이 켜져 있지만 지금 효과가 없으면 사유를 한 줄 덧붙인다(판정은 `luckBonus`·`currentChances()`): 활성 검 없음 / 현재 검이 적용 범위(+5~+19) 밖(+4 이하·+20) / 확정 시도(천장 게이지·확정 강화권·테스트 강제, `event = 0`) / 상한 도달 / 천장(`SUCC_CEIL`) 도달. 상한·천장 구분은 아래 확률 내역 줄과 같은 원인 판정이다.
- **모바일**: 헤더는 모든 폭에서 `flex-wrap`이다(2026-11-24 변경, 9-1: 한 줄에 다 들어가면 한 줄, 넘치면 다음 줄. 721px 이상 데스크톱 팝오버는 칩 아래 떠 있는 상자 그대로). 칩은 한 줄로 줄바꿈되어 내려갈 수 있고, 520px 이하에서는 아이콘 + `m:ss`만 보인다. 이름은 화면에서만 감추고(시각적 숨김) 스크린 리더는 버튼 이름으로 그대로 읽으며, 전체 문구는 팝오버에 있다. 720px 이하에서 팝오버는 칩 아래 떠 있는 상자 대신 헤더의 마지막 줄(전체 폭, 흐름 배치)로 열려 칩 위치와 상관없이 화면 밖으로 나가지 않는다. 가로 스크롤이 생기면 안 된다(360·375·520·521·720·1280px 확인).
- **확률 내역 줄(`breakdownHTML`)**: 행운의 시간이 켜져 있고 `chances().event > 0`이면 항을 `보정` 뒤에 추가한다.
  - 예(상한 도달, +13, 축복+철): `기본 30% + 축복 10 + 모루 2 + 이벤트 5 = +17 → <s>+17</s> +14 [상한 14] · 이벤트 실효 +2%p`.
  - 예(효과 없음, +13, 축복+미스릴): `기본 30% + 축복 10 + 모루 4 + 이벤트 5 = +19 → <s>+19</s> +14 [상한 14] · 이벤트 효과 없음(상한)`.
  - `eventGain = 0`이고 원인이 상한이 아니라 천장이면 `(천장)`. 원인 판정: `raw − event ≥ cap`이면 상한, 아니면 천장. 확정 시도(`gaugeFull`·`sure`·`forced`)는 기존 한 줄 문구만(이벤트 항 없음).
  - 기존 규칙(상한 뱃지, 취소선, 숙련 항, 천장 뱃지)은 그대로. 숙련은 이벤트 항 뒤 별도 항이다.
  - 이벤트 메모(`이벤트 실효 +N%p`·`이벤트 효과 없음(…)`)는 줄의 **맨 끝**(숙련 항·천장 뱃지 뒤)에 붙는다. 이벤트 +5가 전부 들어가면(`eventGain = event`) 메모는 없다. 예(숙련, +15, 축복+강철, 숙련 기록 4): `기본 20% + 축복 10 + 모루 3 + 이벤트 5 = +18 → <s>+18</s> +14 [상한 14] + 숙련 +12 = 46% · 이벤트 실효 +1%p`. 줄은 `chances()` 반환 필드(`parts`·`event`·`raw`·`cap`·`eventGain`)로만 만든다.
- **수입 표시**: `#incomeNote`에 사냥 대목·자동 풍년이 켜져 있으면 ` · 이벤트 사냥 +40%`·` · 이벤트 자동 +50%`를 덧붙인다(값은 효과 계산과 같은 `eventValue`, 짧은 이름 `사냥`·`자동`과 대상 이벤트는 `EVENTS[id].incomeLabel`이 있는 항목, 2026-11-27 변경: 화면 하드코딩에서 데이터로, REQ-047). 의뢰 새로고침 버튼은 할인된 가격(`rerollCost`, 차감과 같은 함수)과 "특가" 뱃지(원래 가격은 따로 보이지 않음), 모루 가호는 트레이 모루 행(모루 장착 시)에 "가호 40%" 태그, 광맥 발견은 대장간 광석 칸의 `사냥당 +2` 뒤에 `+50%`, 방치 탭 광석 줄에 `+50%(광맥 발견)`.
- **토스트**: 시작 `🍀 이벤트 시작: 행운의 시간 — 5분간 강화 성공 확률 +5%p` (`아이콘 이벤트 시작: 이름 — (지속 시간)간 효과 문장`, 지속 시간은 분 단위면 `N분`, 아니면 `N분 S초`(1분 미만은 `S초`)로 쓰고 `4.5분` 같은 소수 분은 쓰지 않는다(2026-11-27 변경, REQ-047). 초록 테두리 `good` 종류를 새로 추가), 종료 `이벤트 종료: 행운의 시간`. 같은 문장을 기록 탭 로그에도 남긴다. 한 틱당 한 번, `skipFx`와 무관하게 표시, **잠긴 탭·숨김 탭에서는 표시하지 않는다**(복귀 때 이미 지나간 종료는 알리지 않음). 틱 안에서 `advanceEvents`와 동결 복귀 판정(기기 시계로 `OFFLINE_MIN_SEC` 이상 지나 `resume` 정산) 뒤에 바로 띄우고(지연 콜백 없음) 띄우는 순간에 멈춤·숨김을 다시 확인한다. 동결 복귀 정산이 다른 탭의 더 최근 저장을 이어받으면 그 틱의 시작·종료는 옛 상태와 함께 버려졌으므로 알리지 않는다(2026-11-27 변경, REQ-047).
- **이벤트 덕 성공**: `r.eventAssist`가 참이면 결과 로그에 `🍀 이벤트 덕에 성공`을 한 줄 추가하고, 숙련 구간(+15~+19)이면 ` — 숙련 기록에는 세지 않습니다`를 붙인다(+5~+14는 원래 숙련 기록이 없음).
- **테스트 페이지(`test.html`, AC 50)**: 조작판에 이벤트 선택(`#testEventId`, `EVENT_IDS` 순서) + "이벤트 시작"(`SG.events.setEvent`로 전체 지속 시간) + "이벤트 끝내기"(남은 시간을 1ms로 지정 → 다음 틱이 실제 종료 경로: 종료 토스트·다음 간격 추첨·즉시 저장). 선택값이 `EVENTS`에 없는 id면 오류 없이 실패 알림(`badEvent`)만 띄우고 상태·저장은 그대로다(2026-11-27, REQ-047). `index.html`에는 진입점이 없다.
- 문구 목록과 아이콘은 콘텐츠 팀이 채운다(선택 요청). 아이콘은 9-2에서 M2 SVG(`assets/m2-icons.js`의 `event_<id>`)로 바뀌었고 칩·팝오버가 `ic('event_<id>')`로 그린다. `EVENTS[id].icon`은 토스트·로그(`textContent`)·테스트 패널 `<option>`용 이모지 폴백으로 남는다: 🍀 행운의 시간 · 🏹 사냥 대목 · 🌾 자동 풍년 · ⛏️ 광맥 발견 · 💫 모루 가호 · 🏷️ 의뢰소 특가.

## 10. 저장 데이터 (v2 유지)
| 필드 | 타입 | 기본값 | 범위 | 정규화 |
| --- | --- | --- | --- | --- |
| `events` | 객체 | `{ active:null, sinceMs:0, nextAtMs:900000 }` | | 객체가 아니면(없음·배열·숫자·문자열 포함) 기본값. 아래 3필드는 각자 정규화 |
| `events.active` | `{id: string, remainMs: int}` 또는 `null` | `null` | `id` ∈ `EVENT_IDS`, `1 ≤ remainMs ≤ durationSec×1000` | 객체가 아니거나 `id`가 `EVENTS`의 자기 속성(`hasOwn`)이 아니면(`'constructor'`·`'__proto__'` 포함) `null`. `remainMs`는 `int(v, 0, 0, durationMs)`(숫자 문자열 허용, 내림, 비수치 0) 후 **0이면 `null`**(만료로 간주), 큰 값은 그 이벤트 자신의 지속 시간으로 clamp. `{id, remainMs}`만 남기고 다른 필드는 버린다 |
| `events.sinceMs` | 정수 ≥ 0 | 0 | `0 ≤ v ≤ EVENT_GAP_MAX_SEC×1000` | `int(v, 0, 0, 1800000)`. 음수 → 0, 큰 값 → 1,800,000(곧 스폰) |
| `events.nextAtMs` | 정수 | 900000 | `900000 ≤ v ≤ 1800000` | `int(v, 900000, 900000, 1800000)`. 변조로 간격을 줄여도 최소 15분 |
| `stats.eventsSeen` | 정수 ≥ 0 | 0 | | `STAT_KEYS`에 추가(기존 `normCounts`가 정수 ≥0·기본 0 처리). **스폰될 때마다 +1**(종류 무관, 같은 이벤트도 매번 센다). F12 업적이 읽는 단일 카운터 |
- `defaultState`에 `events` 추가. 마이그레이션 없음, `v`는 2 유지. 옛 저장은 기본값으로 로드. **옛 클라이언트가 새 저장을 읽으면** `events`를 무시하고 다시 저장하면 사라진다(수용: 이벤트 하나 잃는 정도).
- 변조된 `active`가 `S.best < minBest`인 이벤트(예: best 5에서 `hunt`)를 가리켜도 정규화하지 않는다(장식에 가깝고 5분 뒤 끝). 효과 함수는 `eventsUnlocked(S)`를 확인한다(best<5면 모든 이벤트 효과 0).
- 이벤트 시작·종료 즉시 `persist()`, 그 외에는 기존 자동 저장 주기(5초)에 포함.
- `settleOffline`은 `lastSeen`만 만지고 `events`를 읽지도 쓰지도 않는다.

## 11. 제안 상수 (`js/constants.js`)
| 상수 | 값 | 의미 |
| --- | --- | --- |
| `EVENT_UNLOCK_BEST` | 5 | 시스템 해금(`S.best ≥ 값`) |
| `EVENT_DT_MAX_MS` | 2000 | 틱당 반영하는 최대 `dt`(`TICK_MS` 500의 4배) |
| `EVENT_GAP_MIN_SEC` | 900 | 직전 종료 후 다음 스폰까지 활성 플레이 최소(초). 첫 이벤트도 이 값 |
| `EVENT_GAP_MAX_SEC` | 1800 | 같은 최대(초) |
| `EVENT_IDS` | `['luck','hunt','auto','ore','anvil','quest']` | 선택·UI 순서 |
| `EVENTS` | 각 항목 `{ icon, name, weight, minBest, durationSec, value, desc, need, incomeLabel }`. `luck`(🍀, 행운의 시간, 12, 5, 300, 5, need null), `hunt`(🏹, 사냥 대목, 24, 13, 300, 40, null), `auto`(🌾, 자동 풍년, 18, 13, 300, 50, `'autoOn'`), `ore`(⛏️, 광맥 발견, 16, 5, 300, 50, null), `anvil`(💫, 모루 가호, 16, 5, 300, 40, `'hasAnvil'`), `quest`(🏷️, 의뢰소 특가, 14, 5, 300, 50, null). `icon`은 토스트·로그용 이모지 폴백(칩·팝오버는 M2 SVG), `desc`는 `value`로 만든 효과 문장(확정, 예 `수동 사냥 골드 +40%`), `need`는 스폰 추가 조건 이름(`events.js`의 `EVENT_NEEDS`, 없으면 `null`), `incomeLabel`은 수입 줄(§9 수입 표시)에 붙는 짧은 이름(`hunt` `사냥`, `auto` `자동`, 나머지 `null`. 2026-11-27 추가, REQ-047. 저장 데이터와 무관) | 이벤트 정의(데이터 주도). §4 표와 일치(확인함) |
| `EVENT_LUCK_MIN_LV` | 5 | 행운의 시간이 적용되는 검 최저 단계 |
| `EVENT_LUCK_MAX_LV` | 19 | 같은 최고 단계(= `MAX − 1`) |
| `EVENT_WEIGHT_TOTAL` | 100 | 가중치 합 검사값 |
| `EVENT_DUTY_GAP_DIV` | 3 | `durationSec ≤ EVENT_GAP_MIN_SEC ÷ 값` 검사의 나눗수(내부 상수, 비공개) |
| `EVENT_ORE_VALUE_STEP` | 10 | 광맥 `value`가 이 값의 배수여야 한다는 검사값 |
| `EVENT_ORE_SCALE` | 2 | `ORE_PER_HUNT`(0.5 단위)를 정수로 만드는 배수(§5.3-3 `×2 … /2`) |
| `PERCENT_SQ` | 10000 | `PERCENT × PERCENT`. 1/10000 단위 정수 확률의 분모(§5.3-3·4) |

로드 시 검사(어기면 `throw`, `MASTERY_MAX` 검사와 같은 방식): ① `EVENT_IDS`와 `EVENTS` 키 일치, ② 가중치 합 `EVENT_WEIGHT_TOTAL`(100), ③ `durationSec ≤ EVENT_GAP_MIN_SEC ÷ EVENT_DUTY_GAP_DIV`(=300), ④ `EVENTS.ore.value`는 `EVENT_ORE_VALUE_STEP`(10)의 배수이고 모든 `ORE_PER_HUNT[k] × EVENT_ORE_SCALE`이 정수, ⑤ `EVENT_GAP_MIN_SEC < EVENT_GAP_MAX_SEC`, ⑥ `EVENT_LUCK_MAX_LV ≤ MAX − 1`. `events.js`는 로드 때 추가로 모든 `EVENTS[id].need`가 `EVENT_NEEDS`에 있는지 검사한다(없으면 `throw`).
`save.js`: `STAT_KEYS`에 `'eventsSeen'`, `normEvents(v)`, `defaultState`에 `events`.

## 12. 두 탭과 탭 잠금 (결정)
- **기존 구조를 그대로 쓴다**: `js/tab-guard.js`는 다른 탭이 같은 저장 키를 쓰면 이 탭을 멈추고 **잠금 화면**(헤더·메인 `inert`)을 띄운다. 별도의 "읽기 전용 화면"은 만들지 않는다(§16).
- **잠긴 탭**: `tick`이 `isSuspended()`로 일찍 반환 → `advanceEvents`·스폰·토스트·`persist` 모두 안 함. 칩은 잠금 화면 뒤에서 멈춘 값으로 남는다.
- **이어받기**: `takeOver` → `adoptStoredSave(force)`가 저장의 `events`(`remainMs` 포함)를 읽어 `S`를 교체 → `resume()`이 `ui.eventLastMono`를 리셋. 이후 이 탭만 카운트다운한다. 이전 탭은 잠겨 있으므로 이중 카운트가 없다.
- **이중 스폰 방지**: 스폰은 **활성 기록자**만 한다. 스폰 직후 즉시 `persist()`하므로 새로고침·탭 교체 뒤에는 저장된 `active`를 이어받는다(재추첨 없음). `nextAtMs`도 종료 시점에 저장돼 재추첨되지 않는다.
- **오래된 탭의 복귀**: `resume`의 비강제 `adoptStoredSave`는 `lastSeen`이 더 최근일 때만 저장을 이어받는다(기존 규칙). 이벤트 상태는 `S`에 붙어 같이 이어받는다.
- **테스트**: 주입 시계·RNG·탭 잠금(`createTabGuard`에 가짜 `win`·`storageArea`·DOM)으로 두 탭을 만든다(§15, AC 38~42).

## 13. C에서 확정됨 (확정: m2-rebirth.md §8·§9, 아래 표는 잠정값 기록)
| 항목 | 잠정 기본값 |
| --- | --- |
| 환생 시 `events` | **초기화**: `active = null`, `sinceMs = 0`, `nextAtMs = 900000`(진행 중 이벤트 취소) |
| 환생 시 `stats.eventsSeen` | **유지**(카운터, 업적용) |
| 환생 후 이벤트 해금 | `S.best`가 초기화되면 `EVENT_UNLOCK_BEST`(5)부터 다시 쌓임. 확정: m2-rebirth.md §8.1 — `S.best` 기준 유지(새 필드 없음) |
| 환생 보상이 확률을 올릴 때 행운의 시간 | 확정: m2-rebirth.md §9 — 환생·명성은 확률 항을 더하지 않아 합산 문제 없음(`m1.1-late-correction.md` §8 해소). 이 문서의 하드 규칙(이벤트는 `BONUS_CAP`·`SUCC_CEIL` 안)은 그대로 유지 |
| 환생 의식 비용과 이벤트 | 연동 없음 |
| 이벤트가 활성인 채 환생 | 취소(위와 같음) |

## 14. 수용 기준 (Given / When / Then)
표기: rng는 주입 함수, `S`는 상태, `adv(dtMs)`는 `advanceEvents(S, dtMs, rng)`. 정확한 가중치 경계값은 부동소수 때문에 테스트하지 않는다(경계 양옆 값 사용).

**스폰·진행**
1. Given 기본 상태(`best=5`, `sinceMs=0`, `nextAtMs=900000`) / When `adv(2000)`을 449번 호출 / Then 스폰 없음, `sinceMs=898000`, rng 호출 0회.
2. Given 위 상태에서 449번 호출 후 / When 450번째 `adv(2000)` 호출, rng가 `[0.0]`이면 / Then `started='luck'`, `active={id:'luck', remainMs:300000}`, rng 호출 정확히 1회, `stats.eventsSeen=1`.
3. Given `best=13`, `autoOn=true`, 모루 1개 보유 / When `pickEvent`에 rng 값 `0.11, 0.13, 0.35, 0.37, 0.53, 0.55, 0.69, 0.71, 0.85, 0.87, 0.99` / Then 순서대로 `luck, hunt, hunt, auto, auto, ore, ore, anvil, anvil, quest, quest`(누적 12/36/54/70/86/100).
4. Given `best=5`, `autoOn=false`, 모루 없음 / When `pickEvent`에 rng `0.28, 0.30, 0.66, 0.70` / Then `luck, ore, ore, quest`(후보 `luck 12 + ore 16 + quest 14 = 42`, `r = rng × 42`). `hunt`·`auto`·`anvil`은 절대 나오지 않는다.
5. Given 활성 이벤트 `{id:'hunt', remainMs:1000}`, `sinceMs=0` / When `adv(2000)`, rng `[0.5]` / Then `ended='hunt'`, `active=null`, `sinceMs=0`, `nextAtMs=1350000`(= (900 + floor(0.5×901)) × 1000), rng 호출 1회. 남은 `dt`는 버려진다.
6. Given `drawGapMs` / When rng `0` / Then 900000. rng `0.5` → 1350000. rng `0.9999` → 1800000. 항상 [900000, 1800000]의 1000의 배수.
6a. Given 활성 이벤트 / When `adv(2000)`을 호출(만료 전) / Then `remainMs`만 2000 줄고 `sinceMs`는 그대로(활성 중에는 스폰 시간이 쌓이지 않음), rng 호출 0회.
6b. Given `best=4` / When `adv(2000)` / Then 모든 필드 불변, rng 0회. `dtMs`가 `-5000`·`NaN`이면 0으로, `3600000`이면 2000으로 처리된다.
6c. Given rng를 항상 `0`으로 고정(간격 최소, 첫 종류 `luck`) / When 활성 플레이 12,000초를 `adv(2000)` 6,000번으로 진행 / Then 활성이었던 시간 ÷ 전체 ≤ 0.25 + 한 틱(2초) 오차. 연속 스폰 사이 간격은 항상 ≥ 900초. 동시에 활성 이벤트는 1개.

**행운의 시간: 상한·천장·불변**
7. Given `+13`, 축복+철 모루(raw 12), pity 0, `opts.event=5` / When `chances()` / Then `parts={bless:10, anvil:2, pity:0}`(이벤트 항 없음), `event=5`, `raw=17`, `cap=14`, `bonus=14`, `capped=true`, `succ=44`, `succNoEvent=42`, `eventGain=2`.
8. Given `+13`, 축복+미스릴(raw 14), `opts.event=5` / Then `succ=44`, `succNoEvent=44`, `eventGain=0`(상한 도달로 효과 없음).
9. Given `+7`, 축복+미스릴, `opts.event=5` / Then `succ=79`, `succNoEvent=74`, `eventGain=5`(상한 20 안). Given `+13`, 소모품 없음 / Then 30 → 35. Given `+17`, 소모품 없음 / Then 10 → 15. Given `+19`, 축복+철 / Then 17 → 19.
9a. Given `+15`, 축복+강철(raw 13), 숙련 기록 4(12%p) / Then `succNoEvent=45`, `succ=46`, `eventGain=1`(숙련은 상한 밖이라 그대로 더해진다).
10. Given `+5..+19` 전 단계 × 축복 유무(2) × 모루 등급 0..3 × pity **횟수** 0..12 × 숙련 **기록 횟수**(+15~+19만 0..`MASTERY_REC_MAX[l−15]`, 즉 4/4/4/3/2건; +5~+14는 0) — 도달 가능한 **3,328조합**(도달 불가인 +5~+14 숙련 > 0까지 넣은 격자는 7,800) / When `opts.event=5`와 0으로 `chances()` / Then 모든 조합에서 `dest`가 같고 `succ + dest ≤ 100`, `fail ≥ 0`.
11. Given 테스트에서 주입한 큰 값 `opts.event=50`, `+13`, 축복+미스릴 / Then `bonus=14`(`BONUS_CAP`이 한계), `succ=44`.
12. Given `opts.event=50`, `+5`, 축복+미스릴+pity 6 / Then `succ ≤ 90`(`SUCC_CEIL`), 정확히 90. 같은 입력의 `eventGain`은 0.
13. Given 행운의 시간 켜짐, `+15` 시도의 롤이 `succNoEvent` 이상 `succ` 미만이고 숙련 기록이 **최대(`MASTERY_REC_MAX[0]`=4) 미만**: 숙련 기록 2, 게이지 3, 축복 + 강철 모루(등급 2) → `succNoEvent=39`, `succ=40` / When `attemptEnhance`, rng 값 `0.395`(`roll=39.5`) / Then `outcome='success'`, `r.eventAssist=true`, 검 +16, `pity=0`, `gauge[0]=0`, **`mastery[0]`는 2 그대로**(기록 안 함, `r.mastery=null`). 같은 상태에서 rng `0.385`(`roll=38.5 < succNoEvent`)이면 `r.eventAssist=false`이고 `mastery[0]`이 3(+1)이 된다(테스트 `AC13: mastery below REC_MAX`). 참고: 기록이 이미 최대(4)이면 기록이 원래 늘지 않으므로(예: `succNoEvent=45, succ=46`, `roll=45.5`) 이 규칙을 보여 주지 못한다 — 그 경우도 `eventAssist=true`, `mastery[0]=4` 불변(테스트 `AC13: +15 roll in [succNoEvent, succ)`).
14. Given 행운의 시간 켜짐·실패 롤 / Then `pity`는 +1, 게이지 +1, 숙련 불변 — 이벤트 없을 때와 같다. 이벤트 유무로 `pity`·`gauge`·`mastery`를 `chances()`에 넘기는 입력값이 같다(`enhanceOpts`의 `gaugeFull`·`mastery` 동일).
15. Given 천장 게이지 가득 / `use.sure` 켜짐(`+9` 이하) / `forceSuccess` / Then `chances()`는 `certain()`(`succ=100`)이며 `parts===null`(불변), 최상위 `event=0`, `eventGain=0`, `succNoEvent=100`. 행운의 시간이 켜져 있어도 같다. `+20`(최대 단계) 반환도 `parts===null`에 최상위 `event=0`, `eventGain=0`, `succNoEvent=0`.
15a. Given 활성 검이 `+4` 이하 또는 `+20` / Then `luckBonus=0`, `opts.event=0`. 활성 검이 없으면 `enhanceOpts`는 null이고 이벤트 항은 의미 없다.
15b. Given 행운의 시간 꺼짐 / When `chances()` / Then 기존 필드(`parts`는 `{bless,anvil,pity}` 또는 `null` 그대로)가 모두 이전과 같고 최상위 `event=0`, `eventGain=0`, `succNoEvent=succ`.
15c. Given 행운의 시간 켜짐, 모루 미사용 / When `attemptEnhance` / Then rng 호출은 정확히 1회(이벤트가 결과 롤 외 호출을 추가하지 않는다).
16. Given `+13`(pity 보너스 = `min(PITY_MAX[2]=8, 횟수×PITY_STEP[2]=2)`), 모루 미스릴(4) + pity **횟수 3(보너스 6)** + 축복 켜짐 + 행운의 시간(축복 포함 raw 10+4+6+5=25) / When `bonusWasted(S,'bless')` / Then `true`(축복을 빼도 `4+6+5=15 ≥ 14`라 성공률 동일). 이벤트가 꺼지면 같은 상태에서 `false`(`4+6=10 < 14`). 참고: pity 횟수 6이면 +13 보너스가 12(8 상한 이내)라 이벤트 없이도 `4+12 ≥ 14`가 되어 이 검사에 쓸 수 없다.

**수입·광석·모루·의뢰 (정수 순서)**
20. Given `best=13`, 사냥 대목 활성, 특성 없음, 부스터 없음 / When `manualHuntGold` / Then `floor(2676×100×140×1/10000)` = **3,746**. 이벤트 없음은 2,676.
21. Given 대목 + 약탈자 3등급(`vHunt=30`) + 부스터(×1.5) / Then **7,305**(`best=13`). 대목 + 약탈자 3등급(부스터 없음)은 4,870.
22. Given `best=15`, 수확 보너스 lv5, 자동 풍년 활성 / When 정상 틱(`wallDtMs ≤ 2000`)의 자동 1회(`autoRunGold`) / Then **3,222**. 풍년 + 일꾼 3등급(`vWork=45`) = 4,672, + 부스터 = 7,008. 이벤트 없음은 2,148.
22a. Given 자동 풍년·광맥 발견 활성, 자동 사냥 ON, 탭이 30초 숨김(60초 미만)이었다가 복귀(주입 `now`가 30초 전진, `mono`는 `dt`≤2000만 반영) / When 첫 틱의 `runAutoCatchup`이 따라잡기 실행(≤ `AUTO_CATCHUP_MAX`=20회) / Then 그 실행들의 골드·광석은 이벤트 **없는** 값과 정확히 같다(보너스 0), `remainMs`는 `dt`(≤2000)만 줄어 있다. 같은 상태에서 `wallDtMs ≤ 2000`인 정상 틱은 보너스를 받는다(AC 22). 이벤트가 꺼져 있으면 기존과 동일.
23. Given 사냥 대목 활성 / When `settleOffline`(8시간 간격, 자동 ON) / Then 지급 골드가 이벤트 없는 상태와 **정확히 같다**.
24. Given `best=20`, 대목(+40) / Then 수동 사냥 **277,846**, 대목+부스터 **416,770**, 대목+약탈자 3등급+부스터 **541,801**.
25. Given 광맥 발견 활성, `ORE_PER_HUNT` 철 2, 광부 없음 / When `rollOre` / Then `rate1e4=30000`, `whole=3`, 항상 3개(rng 값 무관). 은(1): `rate1e4=15000` → rng `0.49` → 2개, `0.51` → 1개. 미스릴(0.5): `7500` → rng `0.74` → 1, `0.76` → 0. 광석 종류당 rng 호출 1회.
26. Given 광맥 발견 + 광부 3등급(+60) / Then 철 `rate1e4=48000`(4.8), 은 24000, 미스릴 12000. 이벤트 꺼짐이면 `m2-traits.md` AC 27의 값(철 `rate100=320`)과 같고 rng는 `floor(rng()×100)` 경로를 쓴다.
26a. Given 광맥 발견 / When `expectedOre`(오프라인) / Then 이벤트 없는 값과 같다. `ORE_UNLOCK_LV` 미해금 광석은 지급되지 않는다.
27. Given 모루 가호 활성, 모루 적용, 대장장이 없음 / When `attemptEnhance`의 두 번째 rng 값이 `0.39` / Then 모루 `dura`가 시도 전과 같고, `0.41`이면 1 줄어든다. rng 호출은 정확히 2회.
28. Given 모루 가호 + 대장장이 3등급(45%) / Then `saveP1e4 = 10000 − 55×60 = 6700`: 두 번째 rng `0.66` → 내구도 보존, `0.68` → 소모. 호출 2회(독립 롤 두 번이 아니라 합성 한 번).
29. Given 모루 가호 활성이지만 모루 토글 꺼짐·미장착·천장 확정 / Then 모루 가호 롤용 rng를 호출하지 않는다(호출 1회). Given 모루 `dura=1`·가호 보존 성공 / Then `anvilBroke`가 없다.
29a. Given 의뢰소 특가 활성, `best=15`, 슬롯에 의뢰 있음 / When `rerollCost` / Then **21,480**(이벤트 없음 42,960). `rerollQuest`는 21,480을 차감한다. `best=5`는 `max(200, floor(540×50/100)=270)` = 270. 골드가 21,479면 `noGold`.
29b. Given 의뢰소 특가 / Then 의뢰 보상·단계·쿨다운(`QUEST_COOLDOWN_SEC`)·생성 규칙은 이벤트 없는 경우와 같다.
30. Given 어떤 이벤트가 활성이든 / When `traitRekindCost`·`traitTierUpCost`·`monumentCost`·`boosterPrice`·`cost`·`sell`·`huntReward` / Then 값이 이벤트 없는 경우와 같다.
31. Given 판매·납품 / Then 이벤트 영향 없음(`payoutPreview`·`sellSword`·`deliver` 불변).

**UI**
32. Given 활성 이벤트 없음 / Then 칩이 `hidden`이다. 활성이면 이름과 `m:ss`가 보이고, 남은 `remainMs = 1`이면 `0:01`이다(올림).
33. Given 행운의 시간 + `+13` 축복+철 / Then 내역 줄에 `이벤트 5` 항과 `상한 14` 뱃지, `이벤트 실효 +2%p`가 보인다. 축복+미스릴이면 `이벤트 효과 없음(상한)`이 보인다. 이벤트가 없으면 기존 내역 줄과 문자열이 같다.
34. Given 이벤트 시작·종료 / Then 토스트가 각각 정확히 1회 나온다. 잠긴 탭·숨김 탭에서는 나오지 않는다.
34a. Given 모바일 최소 폭 360px에서 칩이 켜진 헤더 / Then 가로 스크롤이 없고 헤더가 줄바꿈으로 내려가도 다른 버튼이 가려지지 않는다. 팝오버는 탭으로 열고 닫힌다.

**시계·숨김·오프라인**
35. Given 탭이 숨김(`document.hidden`) 후 10분 뒤 복귀 / When `resume` 직후 첫 틱 / Then `remainMs`는 숨기기 전 값에서 첫 틱 `dt`(≤ 2초)만 줄어 있다(숨긴 시간은 흐르지 않는다). 숨기는 동안 스폰도 없다.
36. Given 이벤트 `remainMs=240000`, 접속 종료 후 8시간 뒤 접속(`settleOffline` 발생) / Then `remainMs`는 `240000`에서 시작해 이후 틱으로만 줄고, 오프라인 정산 골드는 이벤트 없는 값과 같다.
37. Given 활성 이벤트가 있는 상태에서 `settleOffline`을 호출 / Then `events` 객체가 변하지 않는다(읽기·쓰기 없음).
37a. Given 주입한 `mono`는 500ms 간격으로 진행하고 기기 시계 `now()`를 **+1시간 / −1시간 / +1일** 바꿈 / When 틱을 반복 / Then `remainMs`가 `mono`의 흐름대로만 줄어든다(시계 점프가 이벤트를 연장·단축하지 않는다).
37b. Given `mono`가 한 틱에 10분 점프(탭 동결 등) / Then 그 틱에 반영되는 `dt`는 2000ms다.

**두 탭**
38. Given 탭 A(활성)와 탭 B가 같은 저장을 공유(가짜 `storageArea`·`createTabGuard`) / When A가 이벤트를 스폰하고 `persist` / Then B의 `storage` 이벤트로 B가 잠기고(`isSuspended()=true`), B의 `tick`은 `advanceEvents`·rng·`persist`를 호출하지 않는다.
39. Given B가 잠긴 동안 A에서 이벤트가 30초 진행 / Then B의 메모리 `events`는 변하지 않는다(이중 카운트 없음).
40. Given B가 `takeOver`(이어받기) / Then `S.events`가 저장의 값(`id`, `remainMs`)으로 교체되고, 이후 B만 줄어든다. A는 잠겨 있다.
41. Given 두 탭 모두 `sinceMs ≥ nextAtMs`인 순간 / Then 스폰은 활성 기록자(A) 한 번만 일어난다. B가 이어받은 뒤에는 저장된 `active`를 읽어 두 번째 스폰이 없다. `stats.eventsSeen`은 1이다.
42. Given 스폰 직후 즉시 `persist()` 되었을 때 / When 탭을 새로고침 / Then 같은 `id`·같은 `remainMs`(±마지막 틱 `dt`)로 복원되고 rng는 호출되지 않는다.

**저장**
43. Given 새 게임 / Then `events={active:null, sinceMs:0, nextAtMs:900000}`, `stats.eventsSeen=0`.
44. Given 저장에 `events`가 없음 / `[]` / `5` / `"x"` / Then 로드 후 기본값.
45. Given `events.active`가 `{id:'x'}` / `{id:'constructor', remainMs:1000}` / `{id:'luck', remainMs:-5}` / `{id:'luck', remainMs:'abc'}` / Then 모두 `null`(음수·비수치는 0 → 만료). `{id:'luck', remainMs:99999999}` → `remainMs=300000`, `{id:'hunt', remainMs:'120000'}` → 120000, `{id:'luck', remainMs:1000.9}` → 1000, 추가 필드는 버려진다.
46. Given `sinceMs`가 `-1` / `1e12` / `"500"` / Then `0` / `1800000` / `500`. `nextAtMs`가 `100` / `9e9` / 없음 / Then `900000` / `1800000` / `900000`.
47. Given `stats.eventsSeen`이 없음 / 음수 / 문자 / 소수 / Then 0 이상 정수로 보정.
48. Given 상태를 `save → load` / Then `events`·`stats.eventsSeen`이 그대로 복원된다. 저장 `v`는 2.
49. Given 자동 저장 주기 5초 사이에 새로고침 / Then `remainMs`는 마지막 저장값(최대 5초 늦음)이며 규칙 위반이 아니다.
50. Given `test.html` 모드 / When `setEvent(S, 'luck', 120000)` / Then `active={id:'luck',remainMs:120000}`이고 잘못된 id(`'x'`,`'constructor'`)·시간(`0`, `300001`)은 `badEvent`/`badTime`으로 상태 불변. `index.html` UI에는 진입점이 없다.

**회귀·통합**
51. Given 이벤트 상태 `active=null`인 모든 기존 시나리오(M1·M1.1·특성 테스트) / Then 결과가 변하지 않는다. 특히 rng 호출 열이 같다(`attemptEnhance` 모루 미사용 1회, 대장장이는 기존 규칙).
52. Given `S.best=4`로 변조된 `events.active={luck}` / Then 모든 이벤트 효과 0(`eventsUnlocked` 검사).
53. Given `+15` 행운의 시간 중 게이지 가득 확정 시도 / Then `r.eventAssist=false`, 확정 성공의 숙련 기록은 기존 규칙대로 +1(확정 성공은 `roll`과 무관한 `certain`이다).

## 15. 테스트 설계 메모
- 순수 함수 단위: `advanceEvents`·`pickEvent`·`drawGapMs`·`chances`·`rollOre`·`attemptEnhance`는 가짜 rng 배열(호출 횟수 기록)로 검증한다. `advanceEvents`는 시계를 받지 않으므로 시계 변경 면역(AC 37a)은 `main` 통합(가짜 `mono`·`now`)에서 확인한다.
- 탭 시나리오: `tests/run-tests.js` 기존 탭 잠금 테스트와 같은 방식으로 가짜 `win`(addEventListener 스텁)·`storageArea`·overlay/takeover 요소를 주입한다.
- 경계: 확률 경계(`roll == succNoEvent`)는 `<` 비교 규칙으로 명세하되 부동소수가 개입하는 정확한 경계 값 대신 경계 양옆을 쓴다.
- QA 우선 확인: catch-up 무보너스(22a), 파괴율 전수(10), 숙련 제외(13), rng 호출 열(15c, 27~29), 오프라인 무시(23, 36, 37), 시계 면역(37a), 두 탭(38~42), 저장 변조(44~47), 모바일 헤더(34a).

## 16. 결정표
중요도: high = 방향이 바뀌면 다른 문서·코드가 크게 달라짐 / low = 수치·표현 조정으로 되돌릴 수 있음.

| 질문 | 선택 | 대안 | 이유 | 중요도 |
| --- | --- | --- | --- | --- |
| 시간 기준 | **활성 플레이 시간**(틱 `dt`, `remainMs` 저장) | 실제 시각 만료 | 사용자 결정. 기기 시계 조작·방치로 이벤트를 얻거나 늘릴 수 없음 | high |
| 오프라인과 이벤트 | 이벤트는 오프라인 정산 무시, 오프라인에서 시작·진행 안 함 | 오프라인 구간에 이벤트 반영 | 사용자 결정. 시계 조작 면역과 오프라인 수입 곡선(`m1-idle`) 보존 | high |
| 시작 방식 | **자동 시작 + 토스트** | 수락 후 시작, 이용권 구매 | UI·상태·저장 최소. "가끔 열리는 한시 버프" 의도. 이용권은 사용자 지시로 기각 | high |
| 이용권·골드 사용처 | **없음**(m2-overview 확정) | 골드로 이벤트 구매 | 사용자 지시, 규칙 0 | high |
| 스폰 간격 | 직전 종료 후 활성 15~30분 균등 | 고정 간격, 지수 분포 | 사용자 예시 범위. 균등+하한으로 가동률 상한(25%)을 계산할 수 있음 | low |
| 첫 이벤트 시점 | 기본 `nextAtMs`=900초(간격 최소와 같은 값) | 별도 짧은 첫 간격 | 정규화 범위 `[900,1800]` 하나로 단순, 변조로 줄여도 15분 보장 | low |
| 지속 시간 | 전 이벤트 300초 | 이벤트별 상이 | 최대 가동률 25% 보장이 단순해짐(제약 `duration ≤ GAP_MIN/3`) | low |
| 이벤트 종류 수 | **6종**(확률 1 + 수입 2 + 광석 1 + 모루 1 + 의뢰 1) | 4종, 파편 포함 7종 | 확률은 정확히 1개, 비확률이 다수. 파편은 파괴를 반기게 하고 가치가 겹쳐 제외 | low |
| 확률 이벤트 값 | **+5%p**(사용자 예시) | +3%p, +10%p | 7.1 손계산: 1,261회 기준 5분 창 절약 0.2~4.3%, 런 기대 ≤1.2% | high |
| 확률 이벤트 위치 | **같은 보너스 합(raw)에 더하고 `BONUS_CAP`이 한계** | 상한 밖 가산(숙련식), 별도 곱 | 하드 규칙: 상한이 한계. 숙련식은 +15~19 곡선을 흔들고 `SUCC_CEIL`까지 열어 줌 | high |
| 확률 이벤트 적용 단계 | 활성 검 +5~+19 | +10 이상만, +15 이상만 | 밴드 1에서 항상 효과 있어 발견이 쉽고 상한 도달 구간은 0이라 안전. 5%를 넘으면 `MIN_LV` 10으로 | low |
| 이벤트 덕 성공의 숙련 기록 | **세지 않는다**(`roll ≥ succNoEvent`) | 전부 센다, 이벤트 중 성공 전부 제외 | 지시: 숙련 기록에 안 셈. 이벤트 없이도 났을 성공까지 빼는 것은 과함 | high |
| 이벤트 덕 성공의 게이지·pity | 일반 성공과 같음(0으로 리셋) | 비성공으로 취급해 게이지 +1 | 성공이라는 사실을 부정하면 규칙이 꼬임. 게이지를 잃는 것이 운 좋은 대가 | low |
| 낭비 표시 | `bonusWasted`가 이벤트 항 포함 | 이벤트 제외 | 같은 상한 풀을 쓰는 정직한 표시, 소모품 절약 정보 | low |
| 사냥·자동 이벤트 해금 | **`best ≥ 13`** | +5부터 | 골드 제한 구간(+5~+12)의 단축 방지. 이벤트 +40%가 구간을 덮으면 최대 29% 단축 vs 약탈자 23% | high |
| 의뢰 이벤트 | 새로고침 비용만 −50% | 강화 비용 할인, 보상 증가 | 강화 비용 할인은 +5~+12 골드 제한을 직접 단축. 새로고침은 선택 지출 | high |
| 이벤트·특성·부스터 겹침 | **곱연산 독립 인자**, 정수 `(100+v)` 곱 후 마지막 1회 나눔 | 덧셈 | 특성 문서와 일관. 덧셈이면 특성이 큰 사람이 이벤트를 덜 누림 | high |
| 모루 가호와 대장장이 | 독립 확률 합성 `1−(1−a)(1−b)`, 롤 1회(1/10000 단위) | 롤 2회, 큰 값만 | rng 열 단순(+1회), 합성 확률이 직관적 | low |
| 광석 비율 계산 | 이벤트 켜짐일 때만 1/10000 정수 경로, 꺼짐은 기존 경로 | 항상 1/10000 | 이벤트 없음의 기존 값·rng 열 비트 동일 유지 | low |
| 스폰 후보 조건 | `minBest` + (`auto`는 `autoOn`, `anvil`은 모루 보유) | 조건 없이 아무거나 | 쓸 수 없는 이벤트가 뜨는 허무함 방지. rng 호출은 여전히 1회 | low |
| 이벤트 중복 방지 | 두지 않음(연속 같은 이벤트 가능) | 직전 이벤트 제외 필드 | 저장 필드·규칙 최소. 확률 이벤트라도 가동률 상한은 같음 | low |
| 시간 단위 | **정수 ms**(`remainMs`, `sinceMs`, `nextAtMs`) | 정수 초 `remainingSec` | 틱 500ms라 초 단위는 부동소수·올림 오차가 누적됨. 지시의 `remainingSec`에서 이름만 바꿈 | low |
| `dt` 입력 | 주입 단조 시계(`performance.now`, 없으면 `now`) + 틱당 2초 상한 | `now()` 차이 | 기기 시계 변경에 면역. 동결·정지 후 큰 점프를 2초로 제한 | high |
| 스폰·시간이 흐르는 조건 | 활성 기록자 + 페이지 보임 + 해금 | 숨김에서도 흐름 | 지시: 활성 플레이 기준. 숨김은 오프라인 정산이 대신함 | low |
| 이벤트 시작·종료 저장 | 즉시 `persist()` | 자동 저장 주기에 맡김 | 새로고침으로 이벤트 종류를 재추첨하는 악용 차단 | low |
| 두 번째 탭 표시 | **기존 잠금 화면 유지**(읽기 전용 화면 안 만듦) | 읽기 전용 실시간 표시 | 지시는 "읽기 전용 표시"였으나 현 구조는 잠금+inert이며, 실시간 표시는 저장 구독·렌더 분기가 새로 필요(M2 범위 밖). 동작 요구(이중 카운트·이중 스폰 방지)는 모두 충족 | low |
| 이어받기 | 저장의 `events`를 읽어 이어감 | 새로 시작 | 지시. 진행 중 이벤트를 잃지 않음 | low |
| 통계 | `stats.eventsSeen` 하나(스폰마다 +1) | 종류별 카운터, 도감 | F12 업적 최소 훅. 종류별은 필요해지면 추가 | low |
| 저장 버전 | v2 유지 + 필드 추가 | v3 | 새 필드 모두 기본값 가능 | low |
| 변조 정규화 | 알 수 없는 id·0 이하 → `null`, 큰 값 → 자기 지속 시간으로 clamp, 간격 `[900,1800]`초 | 거부·초기화 | 장식에 가까운 변조. 단일 관문 `normalize` | low |
| 환생 | 확정: m2-rebirth.md §8 — `events` 초기화·카운터 유지 | 유지 | 검·`best`가 초기화되므로 | high |

## 17. 열린 질문 (사용자 확인)
없음. 모든 갈림길은 §16에 권장안으로 기록했다. 플레이 테스트에서 볼 항목만 적는다: ① 행운의 시간 도입 뒤 +20 도달 시간 변화(5% 한계), ② 축복+미스릴 사용자에게 "효과 없음"이 불만으로 나오는지(그러면 안내 문구 보강), ③ 첫 이벤트 15분이 짧거나 긴지.

## 18. 다른 팀 요청
- **Tech**: `js/events.js` 신설 + `index.html` 로드 순서(`constants.js` → `events.js` → `rules.js` → `forge.js` → `idle.js` → `quests.js` → … → `main.js`; `events.js`는 상수만 읽고 rules·forge·idle·quests가 이를 읽으므로 `rules.js`보다 먼저), `constants.js` 상수·로드 검사(§11), `rules.js`(`chances`·`enhanceOpts`·`recordLateProgress`·`attemptEnhance`, §5.2·5.3), `idle.js`(`manualHuntGold`·`autoRunGold`), `forge.js`(`rollOre`), `quests.js`(`rerollCost`), `save.js`(`normEvents`·`defaultState`·`STAT_KEYS`), `main.js`(`tick`의 `stepEventClock`→`advanceEvents`, `mono` 주입, `resume`·`resetUiFor`의 단조 기준점 리셋(`takeOver`는 `resume`을 거쳐 포함, §6.2), 토스트, 시작·종료 즉시 `persist`), `view.js`(칩·내역 줄·수입 표시), `test-panel.js`(테스트 조작판의 이벤트 지정·끝내기 버튼, `events.js`의 테스트 전용 `setEvent` 호출).
- **Content(선택)**: 이벤트 아이콘 6종, 시작 토스트 문구 6종, 효과 문장 6종. 효과 문장은 `constants.js`의 `EVENTS[id].desc`(값 `v`로 만든 문장, 예 `수동 사냥 골드 +40%`)이며 9-2에서 확정됐다(`docs/content/m2-wording.md`). 화면이 `desc`를 직접 읽는다.
- **Tech(소비자 영향)**: `tools/sim-late`(`mechanics.js:158`, `profiles.js:41`이 `R.chances`·`R.enhanceOpts`를 호출하고 selfcheck가 결과를 비교)는 이벤트 필드 추가·`enhanceOpts`의 `event`에 영향받는다. **이벤트가 활성이 아니면 시뮬레이션 결과가 이전과 완전히 같아야 한다**(`event=0`, 최상위 신규 필드만 추가, `parts` 불변). 이벤트를 시뮬레이션에 넣는 것은 이번 범위 밖.
- **QA**: §15 우선 확인 목록, 기존 `chances()` 깊은 비교 테스트(`event`·`eventGain`·`succNoEvent`·`eventLost` 신규 최상위 필드로 인한 깨짐 확인; `parts`는 불변이라 `parts:null` 의존 코드는 영향 없음).

## 19. m2-overview 갱신 제안
`m2-overview.md`를 다음과 같이 고친다(이 문서 기준).
| 위치 | 현재 | 제안 |
| --- | --- | --- |
| A.2 배치 B 행 | "시간 이벤트 ... '이벤트 이용권' 확정" | 이벤트 이용권은 **없음으로 확정**(자동 시작 이벤트, `m2-events.md`) |
| A.3 4-3 행 | 배치 B 대기 / (예정) | **배치 B 기획 완료**(`m2-events.md` 작성). 구현 전 / 담당 문서 `m2-events` |
| A.4 지도 "시간 이벤트 이용권" 행 | 잠정 없음 / B에서 확정 | **없음(확정)** — 이벤트는 골드를 쓰지 않고 가격도 바꾸지 않는다 |
| C.1 4번 | "시간 이벤트 이용권(B에서 확정, 잠정 없음)" | "시간 이벤트 이용권: 없음(확정)"으로 정리 |
| D 표 | 배치 A 필드만 | `events`(객체: `active`·`sinceMs`·`nextAtMs`)와 `stats.eventsSeen` 행 추가, 담당 문서 `m2-events` |
| D.1 예약 필드 | `events`(시간 이벤트 상태) 예약 | 예약에서 빼고 D 표로 올림(확정), `achievements`·`daily`·`rebirth`는 예약 유지 |
| E 상수표 | 사용처 상수만 | 사용처 상수는 그대로. 이벤트 상수는 `m2-events.md` §11이 소유한다는 한 줄 참조 추가 |
| F 상호작용 표 | | "시간 이벤트": 확률은 행운의 시간 하나(`BONUS_CAP` 안), 수입은 사냥 대목·자동 풍년(`best≥13`, 곱연산), 사용처 가격 불변, 오프라인 무시 — `m2-events.md` 참조 |
| G 결정표 | | "F13: 이용권 없음·자동 시작·활성 플레이 시간 기준·오프라인 무시" 행 추가(high) |
| H 표 "F13 시간 이벤트가 사용처를 건드리는지" | 잠정 없음 / B에서 확정 | **없음(확정)** |
| H 표 신규 | | "환생 시 이벤트 상태: 잠정 초기화, 카운터 유지(C에서 확정)" |
| C.5 페이스 보호 | 특성만 언급 | "시간 이벤트의 확률 효과(+5%p, 상한 안)는 1,261회 기준 5분 창 최대 4.3%·런 기대 ≤1.2%(`m2-events.md` §7)" 한 줄 |
