# M2 F11 환생(4-4) · 저장 필드 전체 표(4-5) · 확률 상한 관계 표 (배치 C)

> 이 문서는 **환생 규칙, 명성 상점, M2 저장 필드 전체 표(최종), 확률 상한과의 관계 표, 환생·구현 단계 인수 조건**을 소유한다. 관련 문서: `m2-overview.md`(가격식·골드 사용처 · 저장 표 D/D.2 원본) · `m2-traits.md` · `m2-achievements.md` · `m2-events.md` · `m1.1-late-correction.md`(§8 환생 메모를 이 문서 §5가 덮어씀) · `m1-storage.md`(정규화 규칙).
> 모든 수치는 기존 상수로 한 **손 계산**이며 시뮬레이션이 아니다(플레이 테스트로 조정). 사용자가 열린 결정을 모두 위임했고 **열린 질문은 없다**(§13 결정 기록에 전부 기록). `(초안)` = 기획 판단으로 정했고 플레이 테스트 대상.
> 사용자 방향(유지): **첫 런 +20 약 25~50분 페이스는 그대로**, 총 플레이 시간은 환생으로 늘린다. 수입은 깎지 않는다.
> (2026-11-27 변경: §15) 사용자 요청("환생 이득이 너무 적다")으로 **명성 상점을 보강**했다: 파괴 저항·하락 저항 2트랙 추가(파괴·하락 확률만 줄이고 **성공 확률은 올리지 않음**), 환생당 명성 3 → 5, 상점 6트랙·합계 39명성(환생 8회), 시작 골드·초반 수입 값 상향. 새 목표는 **2런 약 15분 · 상점 완성 상태 약 10분**이며, 위 "총 플레이 시간은 환생으로 늘린다"는 이 변경에서 **해제**됐다(§15.1·§15.6·§13). 전체 규칙은 §15, 바뀐 곳에는 같은 표시를 달았다.

## 1. 요약 (결정)
| 항목 | 값 |
| --- | --- |
| 조건 | 보관함에 `lv == MAX(20)` 검이 있고 `gold ≥ REBIRTH_FEE`. 그 +20 검은 **제물로 소모** |
| 비용 | `REBIRTH_FEE = roundTo(100 × huntReward(20), 100)` = **19,846,200 G**(고정). 골드는 유지되지 않음 |
| 화폐 | **명성**(`fame`), 환생 1회당 **고정 5**(`FAME_PER_REBIRTH`) (2026-11-27 변경: §15) (전에는 3) |
| 상점 | 파괴 저항 · 하락 저항 · 시작 골드 · 초반 수입(+%, `topLv ≤ 12`만) · 시작 칸 · 자동 사냥 면허(6트랙, 합계 39명성). **성공 확률 보너스는 없음**(파괴·하락 확률만 줄임, §15) (2026-11-27 변경: §15) |
| 숙련 | 환생 시 단계별 기록 **최대 1개만 상속**(`MASTERY_KEEP_REC`=1), 게이지는 전부 초기화 |
| 저장 | v2 유지, 필드 `rebirth` 하나 추가. 옛 클라이언트의 덮어쓰기 대비 미러 키 `sword-enhance-v2-rebirth`(§8.2, REQ-037) |

## 2. 상수 (js/constants.js에 추가)
| 이름 | 값 | 의미 |
| --- | --- | --- |
| `REBIRTH_FEE_MULT` | 100 | 의식 비용 배수(×`huntReward(MAX)`) |
| `REBIRTH_FEE_ROUND` | 100 | 반올림 단위(G). `TRAIT_PRICE_ROUND`와 같은 값이나 별도 상수 |
| `REBIRTH_FEE` | `roundTo(REBIRTH_FEE_MULT × huntReward(MAX), REBIRTH_FEE_ROUND)` = 19,846,200 | 파생 값. `huntReward`가 `rules.js`에 있어 `constants.js`가 아니라 `js/rebirth.js`가 만들고 `SG.rebirth.REBIRTH_FEE`·`rebirthFee()`로 노출 (2026-11-24 구현) |
| `FAME_PER_REBIRTH` | 5 | 환생 1회 획득량 (2026-11-27 변경: §15) (전에는 3) |
| `MASTERY_KEEP_REC` | 1 | 환생 후 단계별 숙련 기록 상한 |
| `EARLY_INCOME_MAX_LV` | 12 | 초반 수입 효과가 적용되는 `topLv` 상한 |
| `REBIRTH_COUNT_MAX` | 1,000,000 | `rebirth.count` 정규화 상한. 환생의 `+1`도 이 값에서 멈춘다(런타임 = 로드 상한, V8) (2026-11-24 추가) |
| `FAME_MAX` | 1,000,000,000 | `rebirth.fame` 정규화 상한. 환생의 `+FAME_PER_REBIRTH`도 이 값에서 멈춘다 (2026-11-24 추가, 2026-11-27 문구: 전에는 `+3`) |
| `FAME_SHOP` | §4 | 트랙별 `{name, values, costs}`(`name`은 (초안) 문구) |
| `FAME_TRACKS` | `Object.keys(FAME_SHOP)` = `['destroyCut','dropCut','startGold','income','slots','autoStart']` | 순서 = UI 순서 (2026-11-27 변경: §15) |
- 로드 시 검사(`throw`): 모든 트랙에서 `values.length === costs.length ≥ 1`, `MASTERY_KEEP_REC ≥ 0`, `FAME_PER_REBIRTH ≥ 1`, `SLOT_START + max(FAME_SHOP.slots.values) ≤ SLOT_MAX`(넘으면 환생 결과의 `slots`가 정규화에서 잘려 §8.1 불변식이 깨진다) (2026-11-24 추가). (2026-11-27 변경: §15) **추가 검사**: `destroyCut`·`dropCut`의 `values`는 모두 정수이고 `1..99` 범위에서 **순증가**(100 이상이면 `dest`가 0이 되어 보호 토글 판정(`DESTROY[lv] > 0`)이 깨질 수 있고, 순증가가 아니면 상점 "지금 → 다음" 문구가 거꾸로 간다).

## 3. 환생 규칙 (4-4)
### 3.1 조건과 실패 사유
`canRebirth(S)` → `{ok:true}` 또는 `{ok:false, reason}`. 검사 순서(앞이 우선):
| 순서 | reason | 조건 |
| --- | --- | --- |
| 1 | `invalid` | `S`가 객체가 아니거나 `S.swords`가 배열이 아니거나 `S.rebirth`가 객체가 아님. 또는 `S.gold`·`S.rebirth.count`·`S.rebirth.fame` 중 유한수가 아닌 값이 있음(정규화를 거치지 않은 입력이 NaN 상태를 만들지 않게, 2026-11-24 8-B 추가) |
| 2 | `notReached` | `S.swords`에 `lv === MAX` 검이 없음. **`S.best ≥ 20`만으로는 부족**(그 검을 팔았거나 납품했다면 다시 만들어야 한다) |
| 3 | `noGold` | `S.gold < REBIRTH_FEE` |
- 제물: `lv === MAX`인 검 중 **하나**(가장 앞 칸)를 소모하는 것으로 정의한다. 어차피 모든 검이 초기화되므로 제물이라는 의미를 주고, +20 검을 이미 판 경우에는 다시 만들어야 하게 해 "공짜 환생"을 막는다.
- 비용은 고정이다(제물이 항상 +20). 골드는 유지되지 않아 **수수료를 내고 남은 골드는 사라진다**. 확인 창이 "사라지는 골드"를 보여준다. 배치 A 사용처(특성·기념비, 최고 단계 기준 합계 약 219M)를 환생 전에 쓰는 것은 플레이어 선택이며, 수수료는 그 위에 **필수 관문**으로 얹힌다(= 219.12M + 19.85M ≈ 238.97M, 수수료는 약 8%).
- 환산: 수수료 = `100 × H(20)` = 연속 사냥 100회 = **4.2분**(듀티 50%면 8.3분, 25%면 16.7분). `H(20)=198,462`.
- 수수료는 선택 지출이 아니라 관문이므로 **`stats.sinkGold`·`stats.earned`에 넣지 않는다**(`sink_*` 업적 부풀림 방지, `m2-achievements.md`).

### 3.2 함수 (새 모듈 `js/rebirth.js` = `SG.rebirth`, 순수 규칙, 난수 없음) (2026-11-24 구현)
- 로드 순서: `constants.js` → `events.js` → `rules.js` → `forge.js` → `idle.js` → `quests.js` → `save.js` → **`rebirth.js`** → `achievements.js` → … → `main.js`. `rebirth.js`는 `defaultState`(save.js)와 `huntReward`(rules.js)를 쓰므로 `save.js` 다음이다.
- 명성 효과 조회 `fameValue(S, track)`와 초반 수입 `earlyIncomePct(S)`(= §4.2 `pFame`)는 **`rules.js`**에 있다: `R.isUnlocked`(면허)와 `idle.js` 수입 식이 `rebirth.js`보다 먼저 로드되기 때문이다. `SG.rebirth.fameValue`·`famePct`는 같은 함수를 다시 내보낸다. (2026-11-27 변경: §15) 파괴 저항·하락 저항의 값은 `enhanceOpts`가 이 함수로 읽어 `chances()`의 `opts.destroyCut`·`opts.dropCut`(정수 %)으로 넘긴다(§15.3). `chances()` 자체는 `S`를 모른다. `rebirth`가 없는 상태(직접 조립한 옛 테스트·도구 상태)는 0레벨로 본다. 레벨 하나의 값은 `R.fameValueAt(track, lv)`(0레벨·범위 밖은 0)이며 `fameValue`와 상점 화면의 "지금 → 다음" 문구가 같이 쓴다(2026-11-24 8-B).
| 함수 | 동작 |
| --- | --- |
| `rebirthFee()` | `REBIRTH_FEE` |
| `canRebirth(S)` | §3.1 |
| `rebirthPreview(S)` | 읽기 전용(`destroyCut`·`dropCut` 추가 (2026-11-27 변경: §15)). `canRebirth` 결과(`ok`, 실패면 `reason`) + `{fee, gold, goldLost: max(0, gold − fee), fameGain: FAME_PER_REBIRTH, consumedSwordId(+20 검이 없으면 null), startGold: START_GOLD + startGoldBonus(S), slots: startSlots(S), incomePct: famePct(S,'income'), destroyCut: famePct(S,'destroyCut'), dropCut: famePct(S,'dropCut'), autoStart: bool, keptMastery: S.mastery.map(min MASTERY_KEEP_REC)}`. `invalid`면 `{ok:false, reason:'invalid'}`만 |
| `rebirth(S, now)` | `canRebirth` 실패면 `{ok:false, reason}`, **S 불변**. 성공이면 §3.3을 한 번에 적용해 **S를 제자리에서 환생 직후 상태로 통째로 바꾸고**(최상위 키 전부 교체) `{ok:true, fee, goldLost, fameGain, consumedSwordId, fame, count}` 반환. 입력은 정규화된 상태여야 한다(숫자 필드가 유한수가 아니면 §3.1 `invalid`). 호출 쪽(`main.js`)은 **정규화된 복사본(draft)에 호출하고 성공했을 때만 `S`를 교체한 뒤 `persist()`를 정확히 1번** 부른다(부분 상태 저장 없음. 자동 백업 불필요). **강화 연출 중(`ui.busy`)에는 호출 쪽이 환생하지 않는다**(결과 공개·지연 토스트를 끊지 않게, 디렉터 결정 2026-11-24. 확인 창은 닫고 다시 시도 안내 토스트, §7.1) |
| `buyFame(S, track)` | §4.1 |
| `fameBlock(S, track)` | §4.1의 사유(`invalid`·`maxed`·`noFame`) 또는 `null`(살 수 있음). `buyFame`과 상점 버튼 비활성이 같이 쓴다 (2026-11-24 8-B) |
| `nextFameCost(S, track)` / `fameMaxLevel(track)` | 다음 레벨 비용(최대 레벨이면 `null`) / 트랙 최대 레벨(= `costs.length`). 화면의 "최대" 판정은 사유가 아니라 `nextFameCost === null`로 한다(V7) (2026-11-24 8-B) |
| `rebirthUnlocked(S)` | 기록 탭 환생 섹션 표시 조건 `S.best ≥ MAX || rebirth.count ≥ 1`(§7) (2026-11-24 8-B) |
| `famePct(S, track)` / `fameValue` | 현재 레벨의 값(0레벨·알 수 없는 트랙이면 0). 구현은 `R.fameValue`(위 참고), 두 이름은 같은 함수 |
| `startGoldBonus(S)` | `fameValue(S,'startGold')` |
| `startSlots(S)` | `SLOT_START + fameValue(S,'slots')` |
- `rebirth`는 새 상태를 **`defaultState(now)`를 기준으로** 만든다: §8 표에서 "초기화"인 필드는 `defaultState`의 값을 복사하고(나중에 필드가 추가돼도 기본값으로 초기화), "유지"인 필드만 원본에서 가져온다. 예외(기본값이 아닌 값)는 `gold`·`swords`·`active`·`slots`·`mastery`·`events` 일부뿐이며 §8에 적었다.
  - 구현(2026-11-24): 통째로 유지하는 필드는 `SG.rebirth.KEPT_FIELDS` = `found, settings, stats, monuments, achievements, title, daily`(깊은 복사). 그 밖에 원본에서 가져오는 값은 `nextSwordId`(새 검에 쓰고 +1)·`nextAnvilId`·`quests.nextId`·`rebirth`(+1·+`FAME_PER_REBIRTH`)·`mastery`(상한 `MASTERY_KEEP_REC`)이고, `gold`·`slots`는 명성 상점 값으로 계산한다. 나머지는 모두 `defaultState(now)` 값(`events`는 기본값 그대로 = 초기화). 표 구동 테스트(`tests/run-tests.js` `RB_FIELD_TABLE`)가 `defaultState`의 모든 최상위 키를 이 표로 분류한다(AC 12).

### 3.3 환생 전이 (한 번의 순수 전이)
1. `canRebirth` 통과 확인, 제물 검 제거(`goldLost = gold − fee` 계산).
2. §8 표대로 초기화·유지 적용. 새 검은 `{id: nextSwordId++, lv:0, prot: PROTECT_USES, pity:0}` 하나, `active` = 그 id, `trait` 없음.
3. `rebirth.count += 1`, `rebirth.fame += FAME_PER_REBIRTH`(= 5).
4. `idle.lastSeen = now`(환생 직후 오프라인 정산 없음), `idle.autoOn = false`.
5. 정규화한 결과가 자기 자신과 같다(§8 불변식).
- 환생 직후 `S.best = 0`이므로 기존 해금(`R.isUnlocked`, 의뢰·대장간·방치 탭, 일일 과제, 이벤트, 소모품 일부)이 `S.best`에 묶인 것이 **전부 다시 잠긴다**. 이는 의도된 "처음부터 다시"이며 `S.best`가 다시 올라가면 풀린다. 해금 토스트(`announceUnlocks`)도 다시 뜬다(허용, 낮은 중요도).
- **기억해 둘 의존**: 일일 과제 목표 밴드와 업적 보상 파편(`shardGain(max(5,best))`)·골드(`rewardGold`)는 **그 시점의 `S.best`**로 계산되므로 환생 직후에는 작다. 받지 않은 보상이 있으면 환생 전에 받는 편이 이득이다(확인 창에 한 줄 안내, §7).

## 4. 명성 상점 (영구, 성공 확률 보너스 없음) (2026-11-27 변경: §15)
`FAME_SHOP`(이름은 (초안) 문구, 값이 결정). 키 순서 = UI 순서. 왜 이 값인지·계산은 §15.2·§15.6:
| 트랙 id | 이름 | 값 `values[lv-1]` | 비용 `costs[lv-1]` | 합계 | 효과 |
| --- | --- | --- | --- | --- | --- |
| `destroyCut` | 파괴 저항 | `[15, 25, 35, 45]` %(누적, **상대** 감소) | `[1, 1, 2, 3]` | 7 | 그 단계 파괴 확률(`DESTROY[lv]`, 성공 확률로 잘린 값)의 값%를 **내림으로** 덜어 낸다. 덜어 낸 몫은 `하락 없는 실패`가 된다(§15.3) |
| `dropCut` | 하락 저항 | `[15, 25, 35, 45]` %(누적, **상대**) | `[1, 1, 2, 3]` | 7 | `+10`(`DROP_FROM`) 이상에서 `파괴가 아닌 실패`의 값%가 하락하지 않는 실패로 바뀐다(내림, §15.3) |
| `startGold` | 여유 자금 | `[3000, 8000, 20000, 50000]` G(누적, 합산 아님) (전에는 2000/5000/10000/20000) | `[1, 1, 2, 3]` | 7 | 환생 때 시작 골드 = `START_GOLD(300) + 값` |
| `income` | 초반 수완 | `[6, 12, 18, 25]` %(누적) (전에는 5/10/15/20) | `[1, 2, 3, 4]` | 10 | `topLv ≤ EARLY_INCOME_MAX_LV(12)`일 때 수동 사냥·자동 사냥·오프라인 골드 +값% |
| `slots` | 넉넉한 보관함 | `[1, 2]` 칸(누적) | `[2, 3]` | 5 | 환생 때 시작 칸 = `SLOT_START(3) + 값`(최대 5). `SLOT_MAX`=8 불변 |
| `autoStart` | 자동 사냥 면허 | `[1]` | `[3]` | 3 | 환생 후 처음부터 자동 사냥 해금(`AUTO_UNLOCK_BEST`=5 관문 생략) |
- **합계 39 명성 = 환생 8회**(`ceil(39/5)`; 전에는 25명성 = 9회). 5명성(환생 1회)으로 살 수 있는 조합 예: 파괴 저항 1+2레벨(1+1) + 하락 저항 1+2레벨(1+1) + 여유 자금 1레벨(1).
- **성공 확률에는 영향 없음**: 어떤 트랙도 `succ`·`BONUS_CAP`·`SUCC_CEIL`·게이지·숙련의 입력이 아니다(§9). **파괴 저항·하락 저항만** `chances()`가 `succ` 계산이 끝난 **뒤에** 파괴·하락 몫을 나눌 때 읽는다(§15.3).
- 구매는 기록 탭 환생 섹션에서 **언제든** 가능(환생 직후 포함). 시작 골드·칸은 **다음 환생 때** 적용(구매해도 지금 골드·칸은 안 변함). 수입·자동 사냥 면허·**파괴 저항·하락 저항은 즉시** 적용된다(면허는 현재 런에서도 `idle`이 해금됨). 그래서 환생 직후(명성을 받은 뒤)에 산 여유 자금은 **그다음 환생**부터 효과가 있다(§15.6의 2런 계산이 이를 반영).
- 자동 사냥 면허의 부수 효과: `R.isUnlocked(S,'idle')`이 참이라 방치 업그레이드 구매도 처음부터 가능하다(골드로 제한되므로 문제 없음, 해금 토스트는 면허가 있으면 생략). 구현(2026-11-24): `rules.js`의 해금 키 → 트랙 표 `FAME_UNLOCK = {idle:'autoStart'}`로 `isUnlocked = best ≥ UNLOCK[key] || 그 트랙 값 > 0`. 토스트 생략은 `main.js` `UNLOCK_NOTICES`의 `licensed: 'autoStart'`.

### 4.1 `buyFame(S, track)`
| # | Given | Then |
| --- | --- | --- |
| F1 | 유효 트랙, 최대 레벨 아님, `fame ≥ cost` | `{ok:true, cost, level}`. `fame −= cost`, `up[track]++`. 골드·확률 값 불변 |
| F2 | `track`이 `FAME_SHOP`의 자기 속성(`hasOwn`)이 아니거나 문자열이 아님(`'constructor'`·`'__proto__'` 포함), 또는 `S.rebirth`(·`up`)가 객체가 아님, 또는 `fame`이 유한수가 아니거나 `up[track]`이 0 이상 정수가 아님(음수 레벨 포함, 정규화를 거치지 않은 입력, 2026-11-24 8-B 추가) | `{ok:false, reason:'invalid'}` |
| F3 | `up[track] ≥ costs.length` | `{ok:false, reason:'maxed'}` |
| F4 | `fame < costs[up[track]]` | `{ok:false, reason:'noFame'}` |
- 검사 순서: invalid → maxed → noFame. 실패 시 상태 불변. 구매는 되돌릴 수 없다(환불 없음). 사유 판정은 `fameBlock(S, track)` 하나에 있고 `buyFame`은 그 결과를 쓴다(상점 버튼 비활성과 같은 판정).
- 실패 문구(`view.js` `REASON`): `maxed` "이미 최대 단계입니다", `noFame` "명성이 부족합니다", `invalid` "대상을 찾을 수 없습니다." (2026-11-24 8-B)

### 4.2 초반 수입 정수 공식 (결정)
`pFame = (R.topLv(S) ≤ EARLY_INCOME_MAX_LV) ? famePct(S,'income') : 0`(구현: `R.earlyIncomePct(S)`). **`pFame = 0`이면 기존 코드 경로를 그대로 쓴다**(비트 동일: `idle.js`는 `pFame`을 `R.percentScaled`의 %p 목록에 넣고, `percentScaled`는 0인 항을 곱하지 않는다). 다른 정수 항과 **하나의 floor/round 안에서 곱하고 마지막에 한 번만 나눈다**(`m2-traits.md` §3.1·`m2-events.md` §5.3 방식). 없는 항은 빼고 나눗수는 `100^(항 수)`.
- 수동 사냥: `manualHuntGold = floor(huntReward(topLv) × (100+vHunt) × (100+pFame) × boost / 10000)`. 부스터(`boost=1.5`)는 정수 안전형 `× 3 / 20000`(= `×1.5/10000`)으로 쓸 수 있다.
- 자동 1회: `autoRunGold = round(autoReward(topLv) × goldUpFactor × boost × (100+vWork) × (100+pFame) / 10000)`.
- 오프라인: `gold = floor(runs × autoReward(topLv) × goldUpFactor × OFFLINE_EFF × boostFactor × (100+vWork) × (100+pFame) / 10000)`.
- **가격은 쓰지 않는다**: `boosterPrice`·`traitRekindCost`·`traitTierUpCost`·`monumentCost`·`REBIRTH_FEE`·판매·납품·의뢰 골드는 `huntReward` 등 기본값만 쓴다(수입 상승이 가격에 되먹임되지 않음).
- 적용 범위가 `topLv ≤ 12`인 이유: +13 이후 골드는 이미 남고(`m2-overview.md` B.5), 이벤트(`best≥13`)와 겹치지 않게 하며, 골드 제한 구간(+5~+12)만 돕는다. (`S.best ≥ 13`인데 `topLv ≤ 12`인 드문 경우는 두 효과가 곱으로 모두 적용되며 허용한다.)
- **계산 예**(`huntReward(10)=423`, `autoReward(10)=160`, 수확 보너스 lv5 = ×1.5; 2026-11-27에 `income` 최대 25%·1레벨 6%로 다시 계산하고 `rules.js`로 확인) (2026-11-27 변경: §15):
  - 수동, 특성 없음, 부스터 없음, `pFame=25`: `floor(423×100×125/10000)` = floor(528.75) = **528**(없으면 423).
  - 같은 조건 + 부스터: `floor(423×100×125×3/20000)` = floor(793.1) = **793**(`floor(528×1.5)=792`와 다르다. 단일 floor가 정답).
  - 수동 + 약탈자 `vHunt=20` + `pFame=25`: `floor(423×120×125/10000)` = floor(634.5) = **634**.
  - 자동 1회(수확 lv5, 부스터 없음, `pFame=25`): `round(160×1.5×125/100)` = **300**(없으면 240).
  - 오프라인 8시간(런 5,760, 수확 lv5, `pFame=25`): `floor(5760×160×1.5×0.25×125/100)` = **432,000**(없으면 345,600).
  - `topLv=12`, `income` 1레벨(`pFame=6`): `huntReward(12)=1,446` → `floor(1446×106/100)` = **1,532**. `topLv=13`이면 `pFame`은 0(항 없음): `huntReward(13)=2,676` 그대로.

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
- **플레이 가드레일** (2026-11-27 변경: §15): 2런이 **12분 미만**이면 먼저 파괴·하락 저항 2레벨 값(25 → 20)을 낮추고, 그래도 빠르면 `MASTERY_KEEP_REC = 0`으로 낮춘다(상수만 바꿈, 코드 변경 없음). 전체 가드레일 순서는 §15.6. 위 상속 표와 `MASTERY_KEEP_REC = 1`은 그대로다(숙련은 성공 확률 쪽 항이고 이 변경은 건드리지 않는다).

## 6. 페이스 (결정 + 산수, 초안) (2026-11-27 변경: §15)
- **원안(2026-11-24)은 폐기**: "명성은 확률 보너스가 없어 +20 시도 횟수(약 1,261회)가 안 변한다 → 줄 수 있는 것은 골드 제한 구간(+5~+12) 최대 약 4.7분뿐, 어떤 런도 1런의 80%(20분)보다 빠르지 않다(`RUN_PACE_FLOOR`)"였다. 사용자 요청으로 파괴 저항·하락 저항(시도 횟수를 줄임)을 넣으면서 이 바닥과 "2런 22~40분 · 5런 이후 20~40분" 목표는 **더 이상 유효하지 않다**.
- **새 목표(초안, 2026-11-27)**: 1런 약 25분(변함없음) · **2런 약 15분 · 상점 완성 상태 약 10분** · **어떤 상점 상태에서도 8분(= 완성 10분의 80%)보다 빠른 런이 없고, 2런은 12분보다 빠르지 않다**. 계산·구매 계획·가드레일은 §15.6.
- 유지되는 가정: +5~+12 골드 제한 구간 `T_g` ≈ 8분(초안, `m2-overview.md` C.5는 "수 분"). 이 구간이 1런 25분의 약 3분의 1이라 시작 골드·초반 수입이 이를 줄이고, 나머지(약 17분)는 +15 이후 시도 횟수이며 파괴·하락 저항이 줄인다.
- **총 플레이 시간은 줄어든다**(방향 변경, 머리말의 "총 플레이 시간은 환생으로 늘린다"를 사용자가 해제): 상점 완성까지 약 2.9~4.0시간(전에는 4.7~6.0시간, 약 35% 감소). 환생 한 주기 = 런 + 수수료(+20 상태에서 연속 사냥 4.2분, 듀티 25~50%면 8.3~16.7분). 특성은 검과 함께 사라지고 +5 도달 때 다시 굴린다(1런과 같음). 명성 39를 다 모으는 데 **8회 환생**.
- 플레이 테스트 항목(10-1): 2런 소요, 상점 완성 상태 소요, 런마다 파괴·하락 횟수, 파편 수입, `T_g` 실측(8분 가정). 가드레일은 §15.6.

## 7. UI (기록 탭 맨 위 환생 섹션)
- 표시 조건: `S.best ≥ MAX` **또는 `rebirth.count ≥ 1`**. 환생 직후 `S.best`가 0이 되므로 `count ≥ 1` 조건이 없으면 명성 상점이 사라진다(**유저 결정안 보정**). 그 전에는 잠금 한 줄 문구("최고 강화 +20 달성 시 환생이 열립니다").
- 내용: 명성 잔액, 명성 상점 행(이름, 레벨 `n/최대`, 다음 비용, 효과 문구, 구매 버튼, 최대면 "최대"), [환생] 버튼(`canRebirth` 실패면 비활성 + 사유: `notReached` "+20 검이 보관함에 있어야 합니다", `noGold` "필요 19,846,200 G"), 환생 횟수.
- [환생] 클릭 → **확인 창**(모달): 수수료 · 현재 골드와 **수수료 후 사라지는 골드** · 명성 +5(`rebirthPreview.fameGain`) · 소모될 +20 검 · "유지": 업적·칭호·일일 과제·기념비·도감·통계·설정·명성·명성 상점 · "사라짐": 골드, 파편, 모든 검(특성 포함), 소모품, 모루·광석, 의뢰, 방치 업그레이드·부스터, 이벤트 진행, 숙련 기록(단계별 1개만 남김) · 결과값(시작 골드, 시작 칸, 초반 수입 %, 자동 사냥 면허, 파괴 저항·하락 저항 % — (2026-11-27 변경: §15)) · 받지 않은 업적·일일 보상이 있으면 한 줄 안내. 확인 버튼은 창이 열리면 바로 활성(입력 문구 없음), Esc·바깥 클릭은 취소(상태 불변).
- 확인 시 `canRebirth`를 **다시 검사**(그 사이 골드·검이 바뀐 경우), `rebirth` 1회 → `persist()` 1회 → 토스트("환생! 명성 +5") + 화면 맨 위 스크롤 + 이벤트·확인 창·진행 중 연출 취소(`epoch` 증가, `resetUiFor`와 같은 경로).
- 이 섹션은 탭 가드(두 탭) 규칙을 따른다: 소유 탭만 실행(다른 탭은 읽기 전용).

### 7.1 구현 (2026-11-24 8-B, 위 서술과 다르거나 더 정한 부분)
- 위치: `index.html`·`test.html` 기록 탭 `#rebirthSection`(일일 과제 `#dailySection` 앞). 내용은 `view.js` `rebirthSectionHTML`. 표시 조건은 `RB.rebirthUnlocked(S)`. 잠금 상태는 제목 없이 잠금 아이콘 + 문구 한 줄(`.rebirth-locked`).
- 열린 상태: 머리 줄 "환생 n회"(왼쪽) · "명성 N"(오른쪽) → "명성 상점" 6행(`.fame-row[data-track]`, 트랙 키 순서, (2026-11-27 변경: §15): 이름, `Lv n/최대`, 효과 "지금 → 다음"(0레벨은 1레벨 값, 최대는 지금 값), 적용 시점 "다음 환생부터"(시작 골드·칸)/"즉시 적용"(수입·면허), 버튼 `data-act="buyFame" data-id=트랙` = 다음 비용(명성), 최대면 "최대") → [환생] 버튼(`data-act="askRebirth"`)과 한 줄(가능하면 "수수료 19,846,200 G · +20 검 1자루를 바치고 명성 +5"(숫자는 `FAME_PER_REBIRTH`), 막히면 사유). 기록 탭 제목(`h2 기록`)은 바꾸지 않았다(횟수는 섹션 머리에).
- 버튼 비활성: 상점은 `fameBlock`이 사유를 돌려주면(명성 부족·최대), [환생]은 `canRebirth` 실패 또는 강화 연출 중(`ui.busy`). 사유 문구는 `view.js` `REBIRTH_REASON`(`REASON`을 복사해 `notReached` "+20 검이 보관함에 있어야 합니다", `noGold` "필요 19,846,200 G"(수수료는 `RB.REBIRTH_FEE`를 `fmt`)로 바꿈). 기념비의 `notReached` 문구는 그대로이며, 어느 문구를 쓸지는 사유 키가 아니라 호출 맥락(환생 동작은 `REBIRTH_REASON`)으로 고른다(V7).
- 확인 창: 기존 `#modal`(오프라인 보상과 같은 자리)을 쓰고 `data-kind="rebirth"`로 구분한다. 내용은 `view.js` `rebirthConfirmHTML`(숫자는 모두 `rebirthPreview`), 버튼은 취소(`data-act="cancelRebirth"`)와 환생하기(`data-act="rebirth"`). 열린 동안 자동 사냥 등으로 골드가 바뀌면 "현재 골드·사라지는 골드"만 다시 쓴다(`renderRebirthConfirm`, 버튼은 다시 그리지 않음).
  - 열기: 강화 연출 중에는 열지 않는다(V1·V9). `canRebirth` 실패면 사유 토스트만.
  - 포커스: 열리면 **취소 버튼**으로 옮긴다(되돌릴 수 없는 동작이 Enter 한 번으로 실행되지 않게). 닫히면 연 요소가 아직 화면에 있으면 그리로 돌려준다. 창이 열린 동안 창 뒤의 단축키(Space 강화·S 판매·H 사냥)는 무시하고 Esc만 받는다.
  - 창 뒤 막기(V1): `#modal`이 열린 동안(환생 확인·오프라인 보상 모두) `body`의 다른 자식(헤더·본문, 테스트 페이지의 `#testBar` 등)에 `inert`를 걸어 키보드·포인터가 창 뒤 버튼(업적 수령·명성 구매·강화 등)에 닿지 않게 한다. 창이 건 `inert`만 기억했다가 닫을 때 되돌리며(탭 잠금이 건 `inert`는 건드리지 않음), 모든 닫힘 경로가 `closeModal` 한 곳을 지나므로 `inert`가 남지 않는다. Tab/Shift+Tab은 창 안의 포커스 가능한 요소 사이에서만 돈다(마지막에서 Tab → 처음, 처음에서 Shift+Tab → 마지막, 포커스가 창 밖이면 창 안으로). 환생 확인 창이 열린 동안은 강화가 시작되지 않는다(버튼·단축키 모두, 창 뒤에서 `ui.busy`·미리보기가 바뀌지 않게).
  - 닫힘(상태 불변): 취소, Esc, 바깥(배경) 클릭, 상태 교체(`resetUiFor`: 이어받기·복귀 채택·새 게임·환생), 다른 탭 잠금(멈춤). 오프라인 보상 창은 상태 교체로 닫지 않는다(그 창은 이미 지급한 결과 안내).
  - 확인: `rebirth` 동작은 환생 확인 창이 열려 있을 때만 실행된다(창 없이 `data-act="rebirth"`가 눌리면 무시). 1번 = 창을 닫고 정규화 복사본에 `RB.rebirth`(내부에서 `canRebirth` 재검사). 실패면 `REBIRTH_REASON` 토스트, 상태·저장 불변. 성공이면 `resetUiFor` → 토스트 "환생! 명성 +5"(`r.fameGain`) → `persist` 1번 → 맨 위 스크롤(`window.scrollTo(0,0)`과 데스크톱 오른쪽 패널 `.side`의 `scrollTop = 0`).
  - 강화 연출 중 확인: 창을 닫고 토스트 "강화 연출이 끝난 뒤 다시 시도하세요"(`REBIRTH_REASON.busy`), 환생·저장 없음. 창이 열린 동안 강화가 시작되지 않으므로 화면 조작으로는 닿지 않는 방어 분기다.
- 새 트랙 효과 문구 (2026-11-27 변경: §15) (초안, 최종 문구는 콘텐츠 몫): 효과는 "지금 → 다음" 형식을 그대로 쓴다. 파괴 저항 "파괴 확률 15% 감소 → 25% 감소"(0레벨은 "없음 → 15% 감소", 최대는 지금 값만), 하락 저항 "+10 이상 하락 확률 15% 감소 → 25% 감소"(구현: +10 범위를 문구에 명시; 0레벨 "없음 →" 형태는 두 저항 트랙에만 적용; 강제 성공(테스트 페이지)에서는 예시 줄과 확률 줄을 숨김; 확률 줄은 `#oddsSplit`, +10 이상은 유지 실패 0%도 표시), 파괴 저항에는 예시 한 줄 "+19 파괴 35% → 30%"(다음 레벨 값을 +19의 `DESTROY`에 적용한 값. 0레벨이면 1레벨 값, 최대 레벨이면 줄을 숨김). 적용 시점 문구는 "즉시 적용". 수입·시작 골드의 값은 새 표를 `R.fameValueAt`로 읽는다. 강화 확률 표시(트레이)의 변경은 §15.3 UI.
- 터치 영역(2026-11-24, 9-1): 720px 이하에서 [환생]·명성 상점 구매 버튼은 높이 44px 이상(데스크톱 크기는 그대로). 확인 창의 취소·환생하기 버튼은 `#modal .small-btn` 규칙으로 모든 폭에서 44px.

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
| **`rebirth.fame`** | 정수 | 0 | `int(v,0,0,1e9)` | **유지**, 환생 때 +`FAME_PER_REBIRTH`(5, `FAME_MAX`에서 멈춤, 전에는 +3), 구매로 감소 | 이 문서 |
| **`rebirth.up.destroyCut/dropCut/startGold/income/slots/autoStart`** | 정수 | 0 | 각 `int(v,0,0,트랙 최대 레벨)`(4/4/4/4/2/1) (2026-11-27 변경: §15) | **유지** | 이 문서 |
- `rebirth` 정규화: 객체가 아니면(없음·배열·숫자·문자열·null) 기본값. `up`도 객체가 아니면 6키 전부 0. 알 수 없는 키는 버린다(`{count,fame,up}`·`up` 6키만 남김). (2026-11-27 변경: §15) 6키 순서는 `FAME_TRACKS`와 같고, **새 키가 없는 옛 저장**(4키)은 `destroyCut`·`dropCut`이 0으로 채워진다(§15.7). **지출 ≤ 획득은 강제하지 않는다**(변조의 피해는 편의뿐, 확률 영향 없음). `stats.rebirths`는 만들지 않는다(`rebirth.count` 사용).
- 옛 저장(`rebirth` 없음, 또는 `up`에 새 두 키가 없음)은 기본값(새 키 0)으로 로드되고 나머지는 불변. 옛 클라이언트가 새 저장을 읽으면 `rebirth`를 무시한다(배치 A·B와 같은 수용). 옛 클라이언트가 그 저장을 **다시 쓰면** `rebirth`가 빠지므로 아래 §8.2 미러 키로 지킨다(REQ-037).
- 분류 완전성: `defaultState`의 **모든 최상위 키가 이 표에 있다**(`v, gold, shards, best, found, swords, nextSwordId, active, slots, gauge, mastery, inv, use, anvils, nextAnvilId, anvilEq, ore, quests, idle, settings, stats` + M2 `monuments, achievements, title, daily, events, rebirth`). 새 필드가 생기면 이 표를 먼저 고친다.

### 8.1 환생 전이 불변식
1. 환생 직후 `normalize(S)`가 `S`와 깊은 비교로 같다(정규화 멱등).
2. `save → load` 왕복 후 상태가 같고 `v === 2`다.
3. `S.swords.length === 1`, `S.active`는 그 검의 id, `S.best === 0`, `S.slots ≥ S.swords.length`.
4. `nextSwordId`·`nextAnvilId`·`quests.nextId`는 감소하지 않는다(재사용 없음).
5. 유지 필드(`found, settings, stats.*, monuments, achievements, title, daily, rebirth.up`)는 깊은 비교로 같고 `rebirth.fame`·`count`는 +`FAME_PER_REBIRTH`·+1(구매 지출만 별도)이다.
6. 환생으로 줄어드는 업적 지표(`best`, 특성 종류 수, 보유 검 기반 지표. `monuments`는 유지)는 **`syncAchievements` 래치**(`m2-achievements.md` §4.1)가 이미 달성한 `achievements[id]`를 내리지 않는다(`best_*`, `knd_*`, `perfect`; 래치가 지키는 것은 이 셋이다) (2026-11-23 변경). 새 달성은 환생으로 생기거나 사라지지 않는다.
7. 이벤트 해금 기준은 그대로 `S.best ≥ EVENT_UNLOCK_BEST(5)`(새 필드 없음). 환생 후 +5에 다시 도달해야 이벤트가 나온다.

### 8.2 환생 미러 키 (REQ-037, 2026-11-24 구현)
옛 클라이언트(8-A 이전 버전·캐시된 탭)는 `rebirth`를 모르므로 새 저장을 읽고 다시 저장하면 구매한 명성 진행(`count`·`fame`·`up`)이 조용히 사라진다. 이를 막으려고 `rebirth` 사본을 옛 클라이언트가 모르는 별도 키에 둔다.
- 키: `저장 키 + '-rebirth'` = `sword-enhance-v2-rebirth`(테스트 페이지는 `sword-enhance-test-rebirth`, `-corrupt` 백업 키와 같은 파생). 값은 정규화된 `rebirth` JSON. `SV.REBIRTH_MIRROR_KEY`.
- 값(2026-11-24 8-B 변경): 정규화된 `rebirth` + **기준값 `mark`** = `{count, fame, up, mark}`. `mark`는 미러의 `count`를 올린 저장의 `nextSwordId`(환생 직후 값: 새 검이 id 하나를 썼으므로 환생 전보다 1 크다). `normRebirth`가 모르는 키를 버리므로 `mark`는 `S.rebirth`에 넣지 않고 미러 JSON에만 둔다(읽을 때 떼어 낸다). `count = 0`이면 채택될 일이 없어 `mark`를 붙이지 않는다.
- 쓰기: `SV.save`가 저장 키 쓰기에 **성공한 직후** 쓴다(같은 `persist` 안). 저장 키 쓰기가 실패했거나 보호 모드(`blocked`)면 미러도 쓰지 않는다. 미러 쓰기 실패는 무시한다(저장 결과 `saved`·보호 모드에 영향 없음). 규칙:
  1. **낮추지 않는다**: 저장하는 상태의 `count`가 미러의 `count`보다 작으면(오래된 탭·환생 전 상태) 미러를 쓰지 않는다. 유일한 예외는 **명시적 새 게임**: `SV.save(storage, S, now, {newGame:true})`(`keeper.save`도 같은 `opts`, `main.js` `startNewGame`이 `persist({newGame:true})`로 부름)는 미러를 그 상태의 `rebirth`(기본값)로 덮어쓴다.
  2. **기준값 고정**: `count`가 같으면(명성 구매) 기존 `mark`를 그대로 둔다. `count`가 오를 때(환생)만 `mark = 지금 S.nextSwordId`. 미러가 없거나 읽을 수 없으면 새로 쓰며 `mark = 지금 S.nextSwordId`.
  3. 이미 같은 원문이 있거나, 미러가 없고 값이 기본값이면 쓰지 않는다.
- 읽기: 저장 키에서 유효한 v2를 읽을 때마다(`SV.peek` → `load`·`checkStored`(이어받기·복귀)·수령 재확인) 미러를 읽어 **미러의 `count`가 저장 키 `rebirth.count`보다 크고, 저장 키 상태의 `nextSwordId ≥ mark`이면** 미러의 `rebirth` 전체를 채택한다. 미러는 저장 필드와 같은 `normRebirth`로 정규화하고 `mark`는 `int(v, 없음, 1)`(숫자 문자열·소수는 내림, 1 미만은 1, 숫자로 읽을 수 없으면 없음). 없음·빈 문자열·파싱 불가·객체 아님·읽기 예외는 미러 없음으로 본다. 새 게임·v1 마이그레이션·손상 저장으로 시작한 상태에는 적용하지 않는다(저장 키에서 읽은 상태가 아님).
- 기준값의 뜻: 옛 클라이언트가 환생 뒤 저장을 다시 쓰면 `rebirth`는 사라져도 `nextSwordId`는 남고 단조로 커지므로(`≥ mark`) 계속 복구된다. 환생 **전** 저장(백업 복원·오래된 탭)은 `nextSwordId`가 `mark`보다 작아 새 명성과 합쳐지지 않는다: 같은 +20 검으로 환생을 두 번 해 명성을 두 배로 받는 틈을 막는다(QA 8-A 지적).
- **8-A 형식 미러(`mark` 없음) 호환**: 8-A가 쓴 미러는 예전 규칙대로 `count`만 비교해 채택한다. 같은 `count`의 쓰기(명성 구매)는 `mark` 없이 유지하고, 다음 환생(`count` 증가) 때 `mark`가 붙은 미러로 바뀐다.
- `count`를 비교하는 이유(유지): 옛 클라이언트가 덮어쓴 저장은 `rebirth`가 없어 `count = 0`이 된다. `fame`으로 비교하면 정상 구매(같은 `count`에서 `fame` 감소) 뒤 미러 쓰기만 실패한 경우 구매가 되돌려진다.
- (2026-11-27 변경: §15.7) 미러의 `rebirth`도 `up` 6키를 가진다(`destroyCut`·`dropCut` 포함, 같은 `normRebirth`). **새 키가 없는 4키 미러(1.0.0이 쓴 것)를 채택하면 새 두 키는 0이 된다**. 채택은 미러 `count`가 저장 키보다 클 때만 일어나므로 이 경우 이 클라이언트에서 산 새 트랙 레벨은 함께 사라질 수 있다(옛 탭이 저장을 덮어쓴 드문 경우와 같은 수용 틈).
- 새 게임(`newGame`)은 미러를 기본값으로 덮어쓰므로 다시 불러와도 예전 명성이 돌아오지 않는다.
- 남은 틈(수용): (1) 옛 탭이 환생 전 상태로 검을 더 사서 `nextSwordId`가 `mark`를 넘긴 뒤 저장하면 다시 합쳐진다(드묾, 디렉터 결정). (2) 새 게임의 저장 키 쓰기가 실패하거나 보호 모드면 미러가 낮아지지 않고, 이후 일반 저장도 낮추지 않는다. `mark`가 있는 미러는 새 게임(`nextSwordId` 작음)에 채택되지 않지만 8-A 형식 미러는 채택된다. (3) 쓰기 때 미러 읽기가 실패하면 미러 없음으로 보고 쓴다(대개 쓰기도 실패).

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
| 환생·명성(F11), 성공 확률 | **없음** | - | 이 문서 §4·§5. `succ`의 입력이 아니다 |
| 파괴 저항(F11) (2026-11-27 변경: §15) | `dest`를 `D0 − floor(D0×v/100)`로(v = 15/25/35/45) | `succ`와 무관, `dest`·`stay` 분할만 | `succ` **계산이 끝난 뒤** 적용. `BONUS_CAP`·`SUCC_CEIL`과 겹치지 않음. §15.3 |
| 하락 저항(F11) (2026-11-27 변경: §15) | `+10` 이상 `drop`을 `fail0 − floor(fail0×v/100)`로(v = 15/25/35/45) | `succ`와 무관 | 성공이 아닌 결과를 `stay`/`drop`으로 나눌 뿐. §15.3 |
- **최대 도달 확률**(축복 + 강철 모루(+4) + pity 최대 + 숙련 최대, 우회 제외. `chances()`로 확인):
| 현재 단계 | base | bonus(캡 후) | 숙련 | 합 | 천장 |
| --- | --- | --- | --- | --- | --- |
| +15 | 20 | 14 | 12 | **46** | - |
| +16 | 15 | 14 | 12 | **41** | - |
| +17 | 10 | 14 | 12 | **36** | - |
| +18 | 7 | 14 | 12 | **33** | - |
| +19 | 5 | 14 | 10 | **29** | - |
- **천장 90은 낮은 단계에서만 작동한다**: +0은 base 95 > 90이라 95(천장은 `max(base,90)`), +1 90, +2~+4는 base+bonus가 104/99/94 → **90으로 잘림**, +5는 70+20 = 90(딱 같음), +6부터 85, 80, … +9 70, +10~ 59 이하. 따라서 +10 이상에서는 천장이 닿지 않고 `BONUS_CAP`이 한계다.
- **결론** (2026-11-27 변경: §15): 환생·명성은 **성공 확률 항에 0을 더한다**. 파괴 저항·하락 저항은 **파괴·하락 확률을 줄이는 항**이며 `succ`의 입력이 아니다(`succ`·`BONUS_CAP`·`SUCC_CEIL`·게이지·숙련·이벤트는 지금과 비트 단위로 같다, AC 42·54). 환생·명성은 성공 확률 항에 **0을 더한다**. 환생을 통해 이월되는 확률 항은 숙련 하나이고 `MASTERY_KEEP_REC`(1)기록으로 단계별 최대 `[3,3,3,4,5]`%p로 묶인다(전부 유지했다면 최대 `[12,12,12,12,10]`). 따라서 `m1.1-late-correction.md` §8의 "환생 보상과 숙련 합산 상한" 경고와 `m2-events.md` §13의 "환생이 확률을 올릴 때의 이벤트" 문제는 **해소**됐다: 이벤트 하드 규칙(`BONUS_CAP`·`SUCC_CEIL` 안)은 그대로다(새 두 트랙은 성공 확률 합산 문제를 만들지 않는다. 이벤트 성공 보너스가 오른 `succ`에서 `dest`가 `100 − succ`로 잘리는 규칙도 그대로이며 저항은 그 뒤에 적용된다, §15.4).

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
9. Given `rebirth.count=0`, `fame=0` / When 환생 성공 / Then `count=1`, `fame=5`(`FAME_PER_REBIRTH`). 한 번 더 환생하면 `count=2`, `fame=10`(구매 안 했다면) (2026-11-27 변경: §15).

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
21. `FAME_SHOP` (2026-11-27 변경: §15): `destroyCut` 값 `[15,25,35,45]`·비용 `[1,1,2,3]`, `dropCut` 값 `[15,25,35,45]`·비용 `[1,1,2,3]`, `startGold` 값 `[3000,8000,20000,50000]`·비용 `[1,1,2,3]`, `income` 값 `[6,12,18,25]`·비용 `[1,2,3,4]`, `slots` 값 `[1,2]`·비용 `[2,3]`, `autoStart` 값 `[1]`·비용 `[3]`. 모든 비용 합 = 39. `FAME_TRACKS` = `['destroyCut','dropCut','startGold','income','slots','autoStart']`. (자세한 검사는 AC 50.)
22. Given `fame=3`, `up.startGold=0` / When `buyFame(S,'startGold')` / Then `{ok:true, cost:1, level:1}`, `fame=2`. 연속 구매 시 비용 1, 1, 2, 3(1~4레벨), 4레벨 뒤 `maxed`(2026-11-27: 비용 나열을 `costs`와 일치시킴). 골드·`chances()` 출력 불변.
23. Given `track`이 `'constructor'`, `'__proto__'`, `7`, `null`, `undefined` / Then `reason:'invalid'`, 상태 불변.
24. Given `up.slots=2` / When `buyFame(S,'slots')` / Then `maxed`. Given `fame=0`이고 `up.income=4` / Then `maxed`(`noFame` 아님, 검사 순서). Given `fame=1`, 다음 비용 2 / Then `noFame`.
25. Given `up.startGold = 1..4` / When 환생 / Then 시작 골드 = 3,300 / 8,300 / 20,300 / 50,300. `up.startGold=0`이면 300 (2026-11-27 변경: §15).
26. Given `up.slots = 0 / 1 / 2` / When 환생 / Then `slots = 3 / 4 / 5`, 검 1자루, `expandCost(S)`(slots=5) = 30,000(`SLOT_EXPAND_COST[2]`), `SLOT_MAX=8` 불변.
27. Given `up.autoStart=1`, `best=0` / Then `R.isUnlocked(S,'idle')`가 참, `setAutoOn(S,true)` 성공. `autoStart=0`이면 `'locked'`. 의뢰·대장간 해금은 면허와 무관(`best` 기준).
28. (수동 사냥) `topLv=10`, 수확 무관, `pFame=25`(`up.income=4`), 부스터 없음 / Then 528. 부스터 있음 → 793. `vHunt=20` 추가 → 634(부스터 없음). `topLv=12`, `up.income=1`(`pFame=6`) → 1,532. `topLv=13`, `up.income=4` → 2,676(적용 안 됨) (2026-11-27 변경: §15).
29. (자동 1회) `topLv=10`, 수확 lv5, `pFame=25`, 부스터 없음 / Then 300. `up.income=0`이면 240 (2026-11-27 변경: §15). `topLv=13`이면 `up.income`과 무관.
30. (오프라인) `topLv=10`, 자동 ON, 수확 lv5, 저장고 기본 8시간, `pFame=25` / Then `settleOffline` 골드 432,000. `up.income=0`이면 345,600 (2026-11-27 변경: §15).
31. `up.income = 0`(그리고 `rebirth` 기본값)이면 `manualHuntGold`·`autoRunGold`·`settleOffline`이 `topLv` 0..20 전 구간에서 환생 필드가 없는 코드와 **비트 단위로 같다**(기존 `huntReward`·`autoReward` 회귀 포함).
32. Given `up.income=4`(최대) / Then `boosterPrice`, `traitRekindCost`, `traitTierUpCost`, `monumentCost`, `rebirthFee`, `sell`, 의뢰 골드가 `up.income=0`일 때와 같다.

**저장·회귀**
33. `normalize` (2026-11-27 변경: §15): `rebirth`가 없음/`null`/`[]`/`5`/`'x'` → 기본값(`{count:0,fame:0,up:{destroyCut:0,dropCut:0,startGold:0,income:0,slots:0,autoStart:0}}`). `{count:'3.7', fame:-5, up:{destroyCut:'9', dropCut:-1, startGold:9, income:'2', slots:3, autoStart:5, junk:1}, extra:1}` → `count=3, fame=0, up={destroyCut:4, dropCut:0, startGold:4, income:2, slots:2, autoStart:1}`, `junk`·`extra` 버림. `count=1e12` → 1,000,000. `up`이 문자열 → 6키 전부 0.
34. Given 지출이 획득보다 큰 저장(`fame` 0, `up` 전부 최대) / When 로드 / Then 그대로 둔다(보정·거부 없음).
35. Given `rebirth` 필드가 없는 옛 v2 저장(또는 `up`에 `destroyCut`·`dropCut`이 없는 1.0.0 저장, AC 52) / When 로드 / Then 기본 `rebirth`(새 두 키는 0)가 채워지고 다른 필드 불변, `v=2`. 저장 후 다시 불러도 같은 상태.
36. Given 환생 직후 `S` / Then `normalize(S)` 깊은 비교로 `S`와 같고, `save→load` 왕복도 같다(§8.1-1·2). `v=2`.
37. 환생 1회는 `persist()`를 **정확히 1번** 부른다: 저장 키 `setItem` 1번 + 미러 키(§8.2) `setItem` 1번. 실패 사유일 때와 멈춘 탭(탭 잠금)에서는 0번 (2026-11-24 변경: 미러 키).
38. 회귀: `rebirth.count=0`, `up` 전부 0(6키), `fame=0`일 때 M1·M2의 `chances()` 출력(기존 필드 전부. 새 필드 `destBase·destSaved·dropRelief·stay·drop`은 AC 42의 값), 모든 가격식, `huntReward`/`autoReward`, 일일·이벤트·업적 출력이 환생 기능이 없던 때와 같다.
39. (2026-11-27 AC 54로 대체) `chances()`는 `S`를 모른다. `enhanceOpts()`는 `S.rebirth`에서 **`destroyCut`·`dropCut`만** 읽고 그 밖의 성공 확률 입력은 읽지 않는다: `S.rebirth`를 최대값으로 바꿔도 같은 `{lv, pity}`·같은 `mastery` 벡터·같은 옵션에서 `succ`·`base`·`parts`·`raw`·`bonus`·`cap`·`capped`·`mastery`·`event*` 필드가 같다. 환생 전후 같은 검·같은 숙련 벡터면 `succ`가 같고 달라지는 것은 상속된 `mastery` 입력뿐이다. (옛 문구 "S.rebirth를 읽지 않는다"는 파괴·하락 저항 때문에 더는 참이 아니다.)
40. 두 번째 환생: Given 환생 후 +20 검을 다시 만들고(테스트 도우미) 골드 충분 / When `rebirth` / Then 성공, `count=2`, 유지·초기화 규칙이 같다(구조 멱등).
41. (화면) 확인 창의 수수료·사라지는 골드·명성 +5·시작 골드·칸·수입 %·파괴 저항·하락 저항 %가 `rebirthPreview` 값과 같다. Esc·바깥 클릭은 상태 불변. 확인 시 `canRebirth` 재검사. 표시 조건은 `S.best ≥ 20 || rebirth.count ≥ 1`. 360px 폭에서 가로 넘침 없음(`tests/browser-strip.js` 방식). 명성 상점은 6행(AC 56) (2026-11-27 변경: §15).

- 플레이 테스트(게이트 아님, 10-1): §6·§15.6 페이스 항목. 2런이 12분 미만이면 파괴·하락 저항 2레벨 값을 낮추고, 그래도 빠르면 `MASTERY_KEEP_REC=0`(AC 57) (2026-11-27 변경: §15).

**15장 추가 AC(42~57)는 §15.8.**

## 11. 구현 단계별 인수 훅 (TODO.md 5~8단계)
| 단계 | 반드시 통과 | 이 문서에서 받는 요구 |
| --- | --- | --- |
| 5(특성) | 이 문서 AC 12·38·54(옛 39. `succ` 비간섭·분류 가드) + 각 문서 AC | `defaultState`에 `swords[].trait`·`monuments`·`stats.sinkGold/traitRolls`를 넣고 `defaultSword`/`createSword` 한 곳에서 `trait:null`을 만든다(환생이 재사용) |
| 6(업적·일일) | AC 11·18(유지·래치) 중 데이터 부분 + `m2-achievements.md` §16 | `defaultAchievements`/`defaultDaily`를 `defaultState`와 같은 곳에서 만든다. `daily.tasks[].base = min(base, stats)` 구현(환생 안전) |
| 7(이벤트) | AC 16·17 + `m2-events.md` §14 | `defaultEvents()`를 노출해 환생이 같은 기본값을 쓴다(`{active:null, sinceMs:0, nextAtMs:900000}`) |
| 8-A(환생 규칙) | **AC 1~40 전부** | §2 상수·§3 함수·§4 `FAME_SHOP`·`rebirth` 정규화·`R.isUnlocked` 면허 분기·수입 공식(`idle.js`) |
| 8-B(화면) | AC 41(6행·명성 +5, (2026-11-27 변경: §15)) + 환생 후 기록 탭 표시 | §7·§7.1. 환생 횟수·명성은 기록 탭 환생 섹션(탭 추가 없음, 9-1에서 5탭 유지로 확정). REQ-037 남은 틈 보완(§8.2 기준값·낮추지 않음) |
| 8 완료 조건 | 표 구동 테스트(AC 10·11·12), 왕복(AC 36), 2회차 속도(플레이 테스트, §6) | TODO 8단계 완료 조건과 일치 |
| 8-C(환생 보강, 2026-11-27) | AC 42~57 + 바뀐 값의 AC(9·21·25·28~30·33·35·38·39·41) | §15.9. `constants.js` 표·`chances()`·`enhanceOpts`·`attemptEnhance` 굴림·`save.js` `normRebirth`·`rebirth.js` 미리보기·`view.js` 확률 표시/상점 6행 |
- 앞 단계가 새 저장 필드를 추가하려면 §8 표를 먼저 고친다(환생 분류 필수).

### 11.1 구현 팀 요청 통합(배치 A·B·C, 요약)
- **Tech**
  - 배치 A(`m2-traits.md` §17): `rules.js`에 특성 헬퍼·`payoutPreview`·`buyMonument`·가격식, `idle.js`·`forge.js` 수입 곱, `attemptEnhance` 모루 내구도 되돌림, `quests.deliver`·`sellSword` 상인, 파괴 `shardGain` 수집가, `save.js` `normSwords`·`monuments`·`STAT_KEYS`, `main.js` 각인 호출·토스트, `SG.rules.setTrait`(`test-mode.js`는 로드 순서상 불가, 호출은 `js/test-panel.js`) (2026-11-23 변경).
  - 배치 B(`m2-achievements.md` §21, `m2-events.md` §18): `js/achievements.js`·`js/events.js` 신설과 `index.html` 로드 순서, `chances`·`enhanceOpts`(이벤트 `event` 입력), `idle.js`·`forge.js`·`quests.js` 이벤트 곱·새로고침 −50%, `save.js` 정규화·`STAT_KEYS` 확장, `main.js` 틱·토스트·즉시 저장·시계 주입, `view.js` 기록 탭 섹션·`TAB_DOT.records`, `test-panel.js`(테스트 전용 `setEvent` 조작판), `tools/sim-late`는 이벤트 비활성 시 결과 동일해야 함.
  - 배치 C(이 문서): `js/rebirth.js` 신설과 로드 순서(§3.2), `constants.js` §2, `save.js` `rebirth` 정규화·`defaultState`·미러 키(§8.2), `rules.js` `fameValue`·`earlyIncomePct`·`R.isUnlocked('idle')` 면허 분기, `idle.js`(수동·자동·오프라인) `pFame` 곱, `main.js` 환생 흐름(draft → 교체 → `persist` 1회 → `epoch` 증가·UI 리셋·토스트·스크롤), `view.js` 환생 섹션·확인 창·명성 상점(§7.1). 테스트 페이지 전용 환생 도우미(+20 검 지급)는 만들지 않았다(2026-11-24 확인): `js/test-mode.js`는 설정만 바꾸고(로드 순서상 규칙 호출 불가), `test.html`에서는 `js/test-panel.js`의 "강화 100%"와 "골드 +1,000,000"으로 +20 검과 수수료를 만든다. 자동 테스트의 +20 상태 도우미는 `tests/run-tests.js` `rebirthReady`.
- **Content(선택, 충족됨)**: 특성 아이콘 6종·문구, 이벤트 아이콘·토스트 문구 6종, 업적·칭호 문구, **명성 아이콘·환생 확인 창 문구·명성 상점 이름 4종**(2026-11-27: 6종으로 늘어 파괴 저항·하락 저항 이름·효과 문구·확률 표시 문구 "유지 실패"가 새로 필요, §15.9). 9-2에서 `assets/m2-icons.js`·`docs/content/m2-wording.md`로 충족(REQ-019·036·048).
- **QA**: 각 문서 AC 전수 + 이 문서 AC 1~57(42~57은 §15.8). 중점: 표 구동 초기화/유지(10·11·12), 정수 순서(28~30), 숙련 상속(14·15), 단일 `persist`(37), 두 탭(`tab-guard`)에서 환생, 저장 왕복(36), 360px(41·46·56), 옛 저장 부팅(35·52), 파괴·하락 저항 굴림 구간(42~49).

## 12. 열린 질문
1.0.0 시점은 없었다(모든 갈림길은 §13에 기록). (2026-11-27 변경: §15) 환생 보강의 열린 항목(소급 명성 지급, 총 플레이 시간 방향 변경 확인, 모델 한계 등)은 **§15.10**.

## 13. 결정 기록 (사용자 위임)
| 질문 | 선택 | 대안 | 이유 | 중요도 |
| --- | --- | --- | --- | --- |
| 환생 조건 | 보관함에 +20 검 + 수수료. **+20 검은 제물로 소모** | `S.best≥20`만, 검 유지 | 검이 초기화되니 의미·"공짜 환생 방지"가 맞다. 팔았다면 다시 만들어야 함 | high |
| 수수료 | `100 × H(20)` = 19,846,200 G 고정, 골드는 유지 안 됨 | 가변(보유 골드 비례), 낮은 수수료 | 연속 사냥 4.2분. 관문이라 `sinkGold`에 넣지 않음. 총 사용처(≈219M)에 더해도 약 8% | high |
| 골드·소모품·검 | 전부 초기화 | 골드 일부 유지 | "처음부터". 유지하면 2런이 지나치게 빨라짐(페이스 바닥) | high |
| 화폐와 획득량 | 명성, 고정 **5**(2026-11-27: 3 → 5) | 성과 비례, 3 유지 | 천천히 하는 이득 없음, 결정적. 3으로는 상점 39명성에 13회가 걸려 "이득이 적다"는 요청에 맞지 않음. 5면 8회 | low |
| 상점 내용 | (2026-11-27 변경) **파괴 저항·하락 저항**·시작 골드·초반 수입(topLv≤12)·시작 칸·자동 사냥 면허, 6트랙 39명성. **성공 확률 보너스는 없음** | 성공률 +%p(기각 유지), 1.0.0의 4트랙(확률 항 없음) | 사용자 요청: 새 확률 퍽은 파괴·하락 확률만 줄이고 성공 확률은 올리지 않는다. 성공 확률 상한 문제(`BONUS_CAP`·`SUCC_CEIL`·숙련·이벤트 합산)는 계속 없다. 시도 횟수가 줄어(+20까지 1,263 → 최대 199회, 모델) 페이스 보호는 §15.6 목표로 대체 | high |
| 초반 수입 적용 | `topLv ≤ 12`, 단일 floor, 가격에는 미적용 | 전 구간 | +13 이후 골드는 남는다. 가격 되먹임 방지 | low |
| 숙련 상속 | 단계별 최대 1기록, 게이지 전부 초기화(`m1.1` §8 덮어씀). 2026-11-27: **변경 없음**(`MASTERY_KEEP_REC=1`), 단 2런 12분 미만일 때의 가드레일 순서가 파괴·하락 저항 값 → `MASTERY_KEEP_REC` 순으로 바뀜 | 전부 유지(10.5×) / 0 | 전부 유지는 파괴 10배 감소로 2런이 너무 쉬움. 1기록은 1런에서도 곧 얻는 값. 새 퍽과 숙련이 겹쳐 2런이 지나치게 빨라지지 않게 가드레일에 둠 | high |
| 페이스 | (2026-11-27 변경) 1런 약 25분 · **2런 약 15분 · 상점 완성 약 10분**, 바닥은 "어떤 상점 상태에서도 8분(완성의 80%)·2런 12분"으로 대체. 총 플레이 시간 약 4.7~6.0시간 → 2.9~4.0시간(약 35% 감소) | 2026-11-24 원안: 바닥 80%(1런의 20분), 2런 22~40분 | 사용자 요청("환생 이득이 너무 적다"). 원안의 "총 플레이 시간은 환생으로 늘린다"를 **사용자가 되돌린 것**이라 기록한다 | high |
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
| 파괴 저항 | `destroyCut` `[15,25,35,45]`%, 비용 `[1,1,2,3]`, 상대 감소(내림) | 절대 −%p | 높은 단계(+19 35%)에서 크게, 낮은 단계(+5 2%)에서는 0이라 파괴가 사라지지 않음(`dest>0 ⇔ DESTROY>0`, 보호 토글 판정 유지) | high |
| 하락 저항 | `dropCut` `[15,25,35,45]`%, 비용 `[1,1,2,3]`, `+10` 이상 `fail0`의 일부를 "하락 없는 실패"로 | 하락 시 하락 방지 주문서 자동 사용 | 하락은 재오르기 비용이라 시도 횟수를 줄이는 효과가 큼 | high |
| 파괴 저항이 덜어 낸 몫의 행선지 | **하락 없는 실패(`stay`)** | 하락 실패(`drop`)로 보냄 | 모델: 파괴를 40% 줄이고 그 몫이 하락이 되면 시도 횟수가 오히려 1.163배(16% 느려짐). 보호된 파괴는 보호권 한 장, 하락은 재오르기 비용이라서. `stay`로 보내면 0.873(10%)·0.626(30%)·0.512(40%) | high |
| 확률 퍽의 적용 지점 | `succ` 계산이 **끝난 뒤** `dest`·`drop` 분할에만 | `BONUS_CAP` 안에 넣기 | 성공 확률 상한 규칙(§9)과 이벤트 합산 문제를 만들지 않음 | high |
| 환생 명성 소급 | **하지 않음**(옵션으로 §15.10에 올림) | 환생 횟수×2 명성 지급 | 1.0.0 출시 직후이고, 지출을 검증할 수 없어 마이그레이션이 필요함 | medium |
| 시작 골드·초반 수입 값 | 시작 골드 3,000/8,000/20,000/50,000, 초반 수입 6/12/18/25%. 이미 산 레벨은 새 값을 받고 환불·재구매 없음(비용 불변) | 값 유지 | 골드 제한 구간(+0~+12)이 완성 시간의 약 80%라 파괴·하락 저항만으로는 10분 목표를 못 맞춤 | medium |
| 총 플레이 시간 방향 | 상점 완성 약 2.9~4.0시간(전 4.7~6.0) | 환생 횟수 유지 | 사용자 요청의 결과를 숨기지 않고 기록 | high |

> 위 7행은 2026-11-27 환생 보강(§15)에서 추가했다.

## 14. 덧붙이는 확인 사항 (코드 대조 결과)
- `found`는 `rules.js:353`(첫 도달 `firstFound`), `main.js:132·182`(배너·연출 건너뛰기 판단), `view.js:644·649`(도감)에서만 쓰인다. 유지해도 규칙·확률에 영향 없음.
- `SLOT_EXPAND_COST[slots − SLOT_START]`: 시작 칸이 늘면 확장 첫 가격이 30,000(칸 5)부터라 앞의 싼 칸 2개(13,000 G)를 면제받는 효과가 있다(시작 칸 상점의 일부, 허용).
- `R.isUnlocked(S,key) = S.best ≥ UNLOCK[key]`이므로 환생 직후 의뢰·대장간·방치가 잠기고 `UNLOCK_NOTICES` 토스트가 다시 나온다(`announceUnlocks(prevBest)`는 `prevBest < best`일 때만 발동). 면허가 있으면 방치 토스트 생략.
- 현재 `chances()`는 이벤트 입력을 아직 받지 않는다(배치 B 구현 전). §9 최대 도달 표는 이벤트 없이 계산했고, 이벤트(+5)가 raw에 들어가도 +10 이상은 `BONUS_CAP`(14)이 그대로 한계다.
- (2026-11-27, §15) `chances()`는 이제 `opts.destroyCut`·`opts.dropCut`(정수 %)을 받는다. 규칙 모듈은 `S`를 모르므로 값을 넣는 쪽은 `enhanceOpts(S)`이고, 여기서 `S.rebirth`를 읽는다(`fameValue`, 파괴·하락 저항 둘만). 이 때문에 "`chances()`·`enhanceOpts()`·`attemptEnhance`는 `S.rebirth`를 읽지 않는다"(옛 AC 39)는 더는 참이 아니며 AC 54가 "성공 확률 입력은 읽지 않는다"로 대체한다. 화면의 확률 표시(`currentChances`)와 굴림(`attemptEnhance`)은 지금처럼 같은 `chances` 결과를 쓴다.

## 15. 환생 보강 (2026-11-27)
> 사용자 요청 "환생 이득이 너무 적은 것 같아, 명성 상점 보강해줘". 조건: 새 확률 퍽은 **파괴 확률과 하락 확률을 줄이는 것**이어야 하고 **성공 확률은 올리지 않는다**. 목표: **2런(첫 환생 뒤 +0→+20) 약 15분**(1런 약 25분), **상점 완성 상태 약 10분**. 아래는 총괄 기획 결정을 문서로 옮긴 것이며, 수치는 모두 `(초안)`(손 계산, 플레이 테스트로 조정)이다. `js/constants.js`·`js/rules.js`는 이 절을 구현할 때까지 1.0.0 값이다(문서가 먼저, 구현 요청 §15.9).

### 15.1 요약과 이유
| 항목 | 1.0.0 | 보강 후 |
| --- | --- | --- |
| 트랙 | 4(시작 골드·초반 수입·시작 칸·면허) | **6**(파괴 저항·하락 저항 추가) |
| 명성/환생 | 3 | **5** |
| 상점 합계 | 25명성 = 환생 9회 | **39명성 = 환생 8회** |
| 시작 골드 | 2,000/5,000/10,000/20,000 | **3,000/8,000/20,000/50,000** |
| 초반 수입 | 5/10/15/20% | **6/12/18/25%** |
| 성공 확률 입력 | 없음 | **없음(그대로)** |
| 2런 목표 | 22~40분(바닥 20분) | **약 15분(바닥 12분)** |
| 완성 상태 | - | **약 10분(바닥 8분)** |
- 왜 파괴·하락인가: 1.0.0의 이득은 골드 제한 구간(+5~+12, 약 8분)의 단축뿐이어서 2런이 최대 4.7분(약 19%) 빨라지는 데 그쳤다. +20까지의 시간 대부분은 +15 이후 **시도 횟수**(모델에서 +18~+20이 시도의 약 79%)라, 이 구간을 줄여야 "이득이 크다"가 된다. 성공 확률을 건드리면 `BONUS_CAP`·`SUCC_CEIL`·숙련·이벤트 합산 문제(§9)가 다시 생기므로, 파괴(재제작)와 하락(재오르기)만 줄인다.
- 왜 시작 골드·초반 수입도 올리나: 골드 제한 구간(+0~+12, `T_g` ≈ 8분)이 상점 완성 상태 시간(약 10분)의 약 80%다. 파괴·하락 저항은 이 구간에 거의 영향이 없다(+10 이전은 하락이 없고 파괴도 작다). 그래서 초반 수입을 25%, 시작 골드를 50,000(+13 더미 약 50만의 10%)으로 올려 이 구간을 약 8분 → 5.6분으로 줄이고, 나머지를 두 저항 트랙이 맡는다.
- **방향 변경(숨기지 않음)**: 머리말의 "총 플레이 시간은 환생으로 늘린다"는 해제됐다. 상점 완성까지 약 2.9~4.0시간으로, 1.0.0의 4.7~6.0시간보다 약 35% 짧다(§15.6). §13·§15.10에 기록.

### 15.2 트랙 표 (`FAME_SHOP`, 키 순서 = UI 순서)
| id | 이름(초안) | 값(누적) | 비용 | 합계 |
| --- | --- | --- | --- | --- |
| `destroyCut` | 파괴 저항 | `[15, 25, 35, 45]` % — 그 단계 파괴 확률의 **상대** 감소 | `[1, 1, 2, 3]` | 7 |
| `dropCut` | 하락 저항 | `[15, 25, 35, 45]` % — 파괴가 아닌 실패 중 하락이 **하락 없는 실패**로 바뀌는 비율(상대) | `[1, 1, 2, 3]` | 7 |
| `startGold` | 여유 자금 | `[3000, 8000, 20000, 50000]` G | `[1, 1, 2, 3]`(불변) | 7 |
| `income` | 초반 수완 | `[6, 12, 18, 25]` %, `topLv ≤ 12` | `[1, 2, 3, 4]`(불변) | 10 |
| `slots` | 넉넉한 보관함 | `[1, 2]` 칸 | `[2, 3]`(불변) | 5 |
| `autoStart` | 자동 사냥 면허 | `[1]` | `[3]`(불변) | 3 |
- **합계 = 7 + 7 + 7 + 10 + 5 + 3 = 39 명성.** `FAME_PER_REBIRTH` = 5 → 완성까지 `ceil(39/5)` = **8회 환생**(1.0.0: `ceil(25/3)` = 9회). `rebirth.up` 최대 레벨 = 4/4/4/4/2/1(키 순서대로).
- 값을 상대(%)로 한 이유: 같은 15%가 +19(35%)에서는 5%p, +10(12%)에서는 1.8%p로 높은 단계일수록 크게 작동해 "후반을 덜 아프게" 한다는 의도와 맞는다. 절대 %p면 낮은 단계의 파괴가 0이 되어 보호 토글·업적(`dest_1`) 판정이 달라진다.
- 두 저항 트랙의 비용표 `[1,1,2,3]`은 여유 자금과 같다(1·2레벨은 각각 환생 1회분 명성의 20%).

### 15.3 `chances()` 규칙 (`js/rules.js`가 단일 출처)
옵션: `opts.destroyCut`, `opts.dropCut` = 정수 %(0이면 없음, `enhanceOpts`가 `fameValue`로 채움). **`succ`는 지금과 똑같이 계산**한다(두 저항은 `succ`·`BONUS_CAP`·`SUCC_CEIL`·게이지·숙련·이벤트에 닿지 않는다). 그 다음:
| 값 | 식 |
| --- | --- |
| `D0` (= `destBase`) | `max(0, min(DESTROY[l], 100 − succ))` (오늘의 `dest`) |
| `destSaved` | `floor(D0 × destroyCut / 100)` |
| `dest` | `D0 − destSaved` |
| `fail` | `100 − succ − dest` (의미 불변: 성공도 파괴도 아닌 모든 결과) |
| `fail0` | `100 − succ − D0` |
| `dropRelief` (`l ≥ DROP_FROM(10)`일 때) | `floor(fail0 × dropCut / 100)` (`l < 10`이면 0) |
| `stay` (하락 없는 실패) | `l ≥ 10`이면 `destSaved + dropRelief`, `l < 10`이면 `fail` |
| `drop` (하락하는 실패) | `fail − stay` (`l ≥ 10`일 때 = `fail0 − dropRelief`; `l < 10`이면 0) |
- 새 반환 필드: `destBase`(D0), `destSaved`, `dropRelief`, `stay`, `drop`. `certain()` 결과(강제·확정권·게이지 가득)와 `l ≥ MAX` 결과는 다섯 필드 모두 0(`certain`은 `dest = fail = 0`).
- **불변식**(최대 단계 `l ≥ MAX`는 예외: 전부 0): `succ + dest + fail = 100`, `stay + drop = fail`. `destroyCut = dropCut = 0`이면 기존 필드는 오늘과 같고 `destBase = dest`, `destSaved = dropRelief = 0`, `l ≥ 10`이면 `stay = 0`·`drop = fail`, `l < 10`이면 `stay = fail`·`drop = 0`. 값이 100 미만이므로 `D0 ≥ 1`이면 `floor(D0 × v/100) < D0`라서 **`dest > 0 ⇔ DESTROY[lv] > 0`**이다(보호 토글 `noDestroy` 판정은 `DESTROY[lv]` 기준 그대로 유효하고, `+5`의 `D=2`는 모든 레벨에서 2로 남는다).
- **덜어 낸 파괴의 행선지(결정)**: 하락이 아니라 **`stay`(하락 없는 실패)**다. 이유(손 계산, 시도 횟수 비): 덜어 낸 몫이 하락 실패가 되면 파괴 저항 40%가 오히려 **1.163배(약 16% 느려짐)**다. 보호된 파괴는 보호권 한 장이지만 하락은 한 단계 재오르기이기 때문이다. `stay`로 보내면 파괴 저항 10%에서 0.873, 30%에서 0.626, 40%에서 0.512다(§15.6 모델, 하락 저항 0).
- **굴림**(난수 호출은 지금과 같이 1번): `roll = rng() × 100`. `roll < succ` → 성공, `< succ + dest` → 파괴, 그 밖은 실패. 실패 안에서 `roll < succ + dest + stay` → `'fail'`(하락 없음: 단계 불변, `pity++`, `stats.fail++`, 게이지 +1(성공이 아닌 모든 결과와 같음), **하락 방지 주문서는 소모하지 않음**), 아니면 하락(단계 −1; 하락 방지 주문서가 켜져 있으면 지금처럼 소모하고 결과는 `'kept'`). 저항이 없고 `l ≥ 10`이면 `stay = 0`이라 모든 실패가 지금처럼 하락하고, `l < 10`은 `stay = fail`이라 지금처럼 하락하지 않는다.
- **UI**(굴림과 같은 객체): 확률 분해에 `성공 / 파괴 / 하락 / 유지 실패`를 보인다(+10 미만은 `실패` 하나). `destSaved > 0` 또는 `dropRelief > 0`이면 보조 줄 "파괴 −N%p (명성)"·"하락 −N%p (명성)"을 더한다(N = `destSaved`·`dropRelief`). 표시 숫자는 **실제 굴림 경계값**이다(`currentChances`와 `attemptEnhance`가 같은 `chances`를 쓴다). 문구는 (초안), 최종은 콘텐츠.

### 15.4 상호작용
| 대상 | 규칙 |
| --- | --- |
| 파괴 보호권(`protect`) | 파괴 **결과**에서만 발동. 필요량·사용 횟수·순서 불변. 파괴가 줄어 쓰는 보호권도 줄어든다. 토글 막힘 `noDestroy`는 `DESTROY[lv] = 0` 기준 그대로(불변식). 보호된 파괴도 지금처럼 `pity++`·게이지 +1·`protectSaved++` |
| 축복·모루·pity·행운의 시간·숙련 | 성공 쪽만 만진다. `dest`는 이벤트가 포함된 최종 `succ`로 `D0 = min(DESTROY, 100 − succ)`을 지금처럼 구한 뒤 깎는다 |
| 게이지 가득·확정권·강제 성공 | `certain`: `dest = fail = drop = stay = 0`. 저항과 무관. 하락 방지 주문서 소모 없음 |
| 하락 방지 주문서(`keepdown`) | 굴림이 **하락 구간**에 떨어질 때만 소모. `stay` 실패는 소모하지 않는다(하락 저항의 덤) |
| pity·게이지 | 하락 없는 실패·하락·보호된 파괴·파괴 모두 지금처럼 비성공 1회로 센다 |
| 파편 수입 | 파괴가 줄면 파괴 때 얻는 파편이 대략 `destroyCut`%만큼 줄어든다. 파편은 축복·보호권 값으로 쓰이고 저항이 이 소모품의 필요를 줄이므로 수용 |
| 평생 파괴 카운터(업적 `dest_1/2/3` = 1/25/100) | 더 천천히 쌓이지만 환생을 거치며 도달 가능. `dest_1`은 `+5`(D=2)가 줄지 않아 영향 없음. 수용 |
| 영속성 | 두 저항 모두 명성으로 산 영구 효과이며 환생 뒤에도 남는다. `MASTERY_KEEP_REC`는 1 그대로 |
- 파괴 저항 후 파괴 확률(%, `D0 = DESTROY[l]`: `+5` 이상에서는 `100 − succ`가 항상 더 커서 성공 확률로 잘리지 않는다. `dest = D − floor(D × v/100)`, `node`로 검증):

| 단계 | D(0%) | 15% | 25% | 35% | 45% |
| --- | --- | --- | --- | --- | --- |
| +5 | 2 | 2 | 2 | 2 | 2 |
| +6 | 3 | 3 | 3 | 2 | 2 |
| +7 | 5 | 5 | 4 | 4 | 3 |
| +8 | 7 | 6 | 6 | 5 | 4 |
| +9 | 10 | 9 | 8 | 7 | 6 |
| +10 | 12 | 11 | 9 | 8 | 7 |
| +11 | 15 | 13 | 12 | 10 | 9 |
| +12 | 18 | 16 | 14 | 12 | 10 |
| +13 | 20 | 17 | 15 | 13 | 11 |
| +14 | 23 | 20 | 18 | 15 | 13 |
| +15 | 25 | 22 | 19 | 17 | 14 |
| +16 | 28 | 24 | 21 | 19 | 16 |
| +17 | 30 | 26 | 23 | 20 | 17 |
| +18 | 33 | 29 | 25 | 22 | 19 |
| +19 | 35 | 30 | 27 | 23 | 20 |

### 15.5 확률 밖 변경, 상수, 로드 검사
- `FAME_PER_REBIRTH` 3 → **5**. `FAME_SHOP`은 §15.2 표(키 순서 `destroyCut, dropCut, startGold, income, slots, autoStart`), `FAME_TRACKS = Object.keys(FAME_SHOP)`.
- `startGold`·`income` **값**만 바뀌었고 비용은 그대로다. 이미 산 레벨은 레벨 번호를 유지한 채 새 값을 받는다(§15.7).
- 새 상수 없음(저항 값은 `FAME_SHOP`의 `values`가 단일 출처). 로드 검사 추가(§2): `destroyCut`·`dropCut`의 `values`는 정수이고 `1..99`에서 순증가.
- 효과 적용: `destroyCut`·`dropCut`은 **즉시**(구매 직후 다음 강화부터). 상점 화면은 `R.fameValueAt`로 6트랙을 읽는다(새 경로 없음).

### 15.6 페이스 손 계산 (기댓값 점화식, 난수 시뮬레이션 아님; 상대 비교, 초안)
**모델**(레벨당 한 단계 올라가는 데 필요한 기대 시도 수): `p = succ/100`, `succ`는 모든 단계에서 보너스 14(`BONUS_CAP` 밴드)와 +15~+19에서 평균 숙련 3을 더하고 `SUCC_CEIL`을 적용한다. `d` = 저항 적용 뒤 파괴, 보호권이 막는 비율 `pf`를 빼 `d_eff = d × (1 − pf)`. `q` = 하락 확률(`drop/100`, +10 미만 0). `A_l = Σ_{j<l} C_j`.
- `l < 15`: `C_l = (1 + q·C_{l−1} + d_eff·A_l) / p`
- `l ≥ 15`(게이지, `N = GAUGE_N[l−15]` = 4,5,6,8,10): `M = Σ_{i<N}(1−p)^i`, `g = (1−p)^N`, `C_l = (M + g) + q·M·C_{l−1} + d_eff·M·A_l`
- `pf = 0.725`는 **보정용 계수**다: 저항이 없는 모델의 +0→+20 합계가 1,263회로 M1.1 플레이 테스트의 약 1,261회(`m2-overview.md` C.5)와 같아지게 맞췄다(민감도 `pf` 0.6·0.85는 아래).

**단계별 시도 횟수(모델, `pf 0.725`)** — 구간 +0~+15 / +15~+18 / +18~+20:

| 상태 | 시도 횟수 | 합계 | 구간별 비(저항 없음 대비) r1 / r2 / r3 |
| --- | --- | --- | --- |
| 저항 없음 | 63.2 / 202.0 / 998.1 | 1,263 | 1 / 1 / 1 |
| 파괴 25 + 하락 25 | 47.4 / 91.0 / 310.1 | 448 | 0.75 / 0.45 / 0.31 |
| 파괴 45 + 하락 45 | 37.8 / 47.0 / 114.3 | 199 | 0.60 / 0.23 / 0.11 |

**왜 비율만 쓰나**: 모델은 시도의 79%를 +18~+20에 두지만 M1.1 실측 시간은 +15까지 약 10분·+18까지 약 20분·+20까지 약 25분(구간 시간 10 / 10 / 5분)으로 +18~+20이 약 21%다. 게이지 지속·소모품 사용이 모델에 없어 **절대 시도 수는 쓰지 않고** 구간별 **비**만 실측 시간에 곱한다.

**시간 식**: `시간(분) = 골드 + 2·r1 + 10·r2 + 5·r3`. 구간 시간 P1 = 10분(그중 골드 제한 `T_g` = 8, 시도 한정 2), P2 = 10, P3 = 5. `골드 = 8 / (1 + income%) − 8 × 시작골드 / 500,000`(500,000 = +13 더미). 시작 골드·칸은 **다음 환생 때** 적용되므로(§4), 환생 직후 받은 명성으로 산 여유 자금은 **다음 런**부터 효과가 있다.
- 예, 2런(파괴 25·하락 25, 시작 골드 0(방금 산 3,000은 3런부터), 수입 0): 골드 8.0 + 1.50 + 4.51 + 1.56 = **15.6분**.
- 예, 완성 상태(45/45, 수입 25%, 시작 골드 50,000): 골드 = 6.4 − 0.8 = 5.6, 5.6 + 1.20 + 2.32 + 0.57 = **9.7분**.

**구매 계획**(명성은 누적되고 이월; 런 n은 환생 n−1 뒤에 산 것으로 시작. 괄호 = `pf` 0.6 – 0.85):

| 런 | 쓸 수 있는 누적 명성 | 이 런 시작에 산 것(비용) | 누적 지출 | 효과 상태(파괴/하락 %, 적용 중인 시작 골드·수입) | 예상(분) |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | - | 0 | 없음 | 25 |
| 2 | 5 | 파괴 1·2레벨(1+1), 하락 1·2레벨(1+1), 시작 골드 1(1) = 5 | 5 | 25/25, 시작 골드 0, 수입 0 | **15.6** (15.0–16.3) |
| 3 | 10 | 파괴 3(2), 하락 3(2), 수입 1(1) = 5 | 10 | 35/35, 3,000 G, 6% | 13.0 (12.4–13.8) |
| 4 | 15 | 수입 2(2), 시작 골드 2(1), 시작 칸 1(2) = 5 | 15 | 35/35, 3,000 G, 12% | 12.6 (12.0–13.4) |
| 5 | 20 | 파괴 4(3), 시작 골드 3(2) = 5 | 20 | 45/35, 8,000 G, 12% | 11.8 (11.1–12.8) |
| 6 | 25 | 하락 4(3) = 3 | 23 | 45/45, 20,000 G, 12% | 10.9 (10.3–11.8) |
| 7 | 30 | 수입 3(3), 시작 칸 2(3) = 6 | 29 | 45/45, 20,000 G, 18% | 10.6 (10.0–11.4) |
| 8 | 35 | 수입 4(4) = 4 | 33 | 45/45, 20,000 G, 25% | 10.2 (9.6–11.0) |
| 9 | 40 | 시작 골드 4(3), 자동 사냥 면허(3) = 6 | 39 | 45/45, 20,000 G, 25% | 10.2 (9.6–11.0) |
| 10+ | 40 | - | 39 | 45/45, 50,000 G, 25% | **9.7** (9.1–10.5) |
- 검증: 트랙별 합 = 7+7+7+10+5+3 = **39**(파괴 1+1+2+3, 하락 1+1+2+3, 시작 골드 1+1+2+3, 수입 1+2+3+4, 칸 2+3, 면허 3). 각 런에서 쓸 수 있는 누적 명성(5×(n−1))이 누적 지출 이상이고 한 런의 지출은 그때 가진 명성 안이다(런 7: 30 ≥ 29, 이월 7 ≥ 6; 런 8: 35 ≥ 33, 이월 6 ≥ 4; 런 9: 40 ≥ 39, 이월 7 ≥ 6). 상점 완성은 8번째 환생 뒤(런 9의 시작)에 산다.
- 모델은 자동 사냥 면허(≤ 1분, 상향 여유)와 소모품 사용 효과를 무시한다. 시작 골드가 다음 런에 적용되는 지연을 반영했다(지연이 없다고 보면 런 2 15.5분·런 5 11.6분·런 9 9.7분으로 최대 0.5분 차이).
- **상점 완성까지 총 시간**: 런 1~8(8번 환생) ≈ 25 + 15.6 + 13.0 + 12.6 + 11.8 + 10.9 + 10.6 + 10.2 = **약 110분**(`pf` 0.6–0.85: 105–116분) + 수수료 8번(연속 사냥 4.2분 = 듀티 100%, 50%면 8.3분, 25%면 16.7분 → 67~133분) = **약 2.9~4.0시간**. 1.0.0(25명성, 환생 9번): 25 + 8×약 23 = 약 209분 + 수수료 9번(75~150분) = 약 4.7~6.0시간. **총 시간은 약 35% 줄어든다**: 머리말의 "총 플레이 시간은 환생으로 늘린다"에서 사용자가 방향을 바꾼 것이다(§13·§15.10).

**페이스 바닥과 가드레일**(`RUN_PACE_FLOOR`(1런의 80%)를 대체; 게임 규칙 상수가 아니라 밸런스 기준, 코드 변경 없음):
- 어떤 상점 상태에서도 **8분(완성 10분의 80%)보다 빠른 런이 없다**. 2런은 **12분보다 빠르지 않다**.
- 2런 < 12분 → 파괴·하락 저항 **2레벨 값**을 낮춘다(25 → 20). 그래도 빠르면 `MASTERY_KEEP_REC` → 0.
- 완성 상태 < 8분 → **4레벨 값**을 낮춘다(45 → 40).
- 2런 > 18분 → 2레벨 값을 올린다(25 → 30).
- 손잡이 순서(`release-1.0.md` D): 저항 2레벨 값 → `MASTERY_KEEP_REC` → 수입 값.

**모델의 약점**: (1) `pf`는 맞춘 계수다(보호권의 실제 사용 패턴이 아님). 민감도 `pf` 0.6·0.85에서 런 시간이 약 −0.6/+0.8분(2런 15.0–16.3). (2) 게이지가 방문을 가로질러 남는 효과·플레이어의 소모품 사용·`pity` 누적은 모델에 없다. (3) 시도의 구간 분포가 실측과 다르다(위): 비만 사용. (4) `T_g` 8분은 미측정(1.0.0과 같은 가정). 그래서 최종 판단은 플레이 테스트(AC 57)로 한다.

### 15.7 저장 호환
- 저장은 **v2 유지**. `rebirth.up`이 `destroyCut`·`dropCut`(기본 0, `int(v,0,0,4)`) 키를 얻는다. `normRebirth`는 6키만 남기고 알 수 없는 키는 버린다. 1.0.0 저장은 새 키 0으로 로드되고 다른 필드는 불변이다(AC 52).
- 이미 산 `startGold`·`income` 레벨은 **레벨 번호를 유지**하고 새 표 값을 받는다(환불·재구매 없음). 비용이 같아 명성 회계가 일관된다. `slots`·`autoStart` 불변.
- `FAME_PER_REBIRTH` 5는 **앞으로의 환생**에만 적용된다. 소급 지급은 하지 않는다(이미 환생 n회를 한 플레이어는 3n을 받았다. 1.0.0이 방금 출시돼 영향이 작고, 지출을 검증할 수 없어 마이그레이션이 필요하다). 선택 사항 §15.10.
- 미러 키(§8.2)는 6키 `up`을 담는다. 새 코드가 쓴 미러는 새 키를 가진다. 1.0.0이 쓴 4키 미러가 채택되면 새 두 키는 0이다. 1.0.0 캐시 탭이 저장·미러를 다시 쓰면 새 키가 사라질 수 있다(§8.2와 같은 수용 틈).
- 테스트 페이지와 상점 화면은 `R.fameValueAt`(6트랙)로 읽는다(새 경로 없음).

### 15.8 인수 조건 (42~57, Given/When/Then)
42. **저항 0 회귀**: Given `destroyCut = dropCut = 0`, 모든 `lv 0..19`·모든 옵션 조합(축복·모루 0..3·확정·게이지 가득·숙련·이벤트) / When `chances()` / Then 기존 필드(`succ, dest, fail, base, parts, raw, bonus, cap, capped, mastery, event*`)가 변경 전과 깊은 비교로 같고, 새 필드는 `destBase = dest`, `destSaved = dropRelief = 0`, `l ≥ 10`이면 `stay = 0`·`drop = fail`, `l < 10`이면 `stay = fail`·`drop = 0`(`certain`·`MAX`는 다섯 필드 0)이다. 같은 시드 난수열로 `attemptEnhance` 10,000회를 돌리면 결과·상태·난수 호출 횟수가 변경 전과 같다.
43. **파괴 저항 표**: Given `+19`(`succ` 5, `pity` 0, 보너스 없음, `D0` 35) / When 저항 15/25/35/45 / Then `dest` 30/27/23/20(`destSaved` 5/8/12/15). `+15`(`succ` 20, `D0` 25) → 22/19/17/14. `+9`(`D0` 10) → 9/8/7/6. `+8`(`D0` 7) → 6/6/5/4. `+5`(`D0` 2)는 모든 저항에서 2. 어느 경우도 `succ`는 저항 0일 때와 같다.
44. **`stay` 분배**: Given `+19`, `destroyCut` 45, `dropCut` 0 / Then `succ` 5, `dest` 20, `fail` 75, `stay` 15, `drop` 60. `+19`, 45/45 → `fail0` 60, `dropRelief` 27, `stay` 42, `drop` 33. `+15`, 25/25 → `succ` 20, `dest` 19, `fail` 61, `fail0` 55, `dropRelief` 13, `stay` 19, `drop` 42. `+12`(`succ` 35, `D` 18), `dropCut` 15 → `fail0` 47, `dropRelief` 7, `drop` 40. `+9`에서 `dropCut`이 무엇이든 `drop` 0, `stay = fail`, `dropRelief` 0. 하락 저항이 처음 적용되는 단계는 `+10`(`DROP_FROM`)이다.
45. **굴림 구간**: Given `+15`, 25/25, `pity` 0(구간 `[0,20)` 성공 · `[20,39)` 파괴 · `[39,58)` 하락 없는 실패 · `[58,100)` 하락) / When `roll`(= `rng() × 100`) / Then `roll` 57.9 → 단계 불변·`pity`+1·`stats.fail`+1·하락 방지 주문서 소모 없음. `roll` 58.01(`rng()` 0.5801) → 단계 −1. 하락 방지 주문서는 `+10~+14`에서만 켤 수 있으므로(`KEEPDOWN_MAX_LV` 15) 주문서 검사는 `+14`, 25/25(구간 `[0,25)` 성공 · `[25,43)` 파괴 · `[43,61)` 하락 없는 실패 · `[61,100)` 하락)에서 한다: `roll` 62 → 주문서 소모, 결과 `'kept'`, 단계 불변. `roll` 50(주문서 켠 상태) → 주문서 수량 불변. 경계: `roll` 39는 하락 없는 실패(파괴가 아님). (주의: 부동소수 때문에 `0.58 × 100`은 57.99…가 되므로 테스트는 경계 바로 위·아래 값을 `rng()`로 쓰고 경계값 자체를 곱셈 결과에 기대지 않는다.)
46. **표시 = 굴림**: Given 모든 `lv`·옵션·저항(0·15·25·35·45) 조합 / Then 구간 합 = 100, `currentChances`가 `attemptEnhance`가 쓰는 `chances`와 같고, 화면의 숫자(성공·파괴·하락·유지 실패, 보조 줄 "파괴 −N%p"·"하락 −N%p")가 `chances` 필드와 같다. 360px에서 가로 넘침 없음.
47. **보호권**: Given 모든 저항 / Then `noDestroy` 토글 막힘은 `DESTROY[lv] = 0`일 때만. 보호된 파괴의 동작(보호권 −1, 단계 유지, `pity`+1, 게이지 +1, `protectSaved`+1)은 불변. 저항이 있으면 시드 `+19` 10,000회에서 파괴 빈도가 비례해 줄어 `destroyCut` 45 → 20%±1%p이고 쓴 보호권 수도 같은 비율로 준다(통계, 시드 고정이라 결정적).
48. **확정 시도**: Given 게이지 가득·확정권·강제 성공 + 최대 저항(45/45) / Then `dest = fail = drop = stay = 0`이고 하락 방지 주문서는 소모되지 않는다.
49. **행운의 시간**: Given 행운의 시간 +5, 저항 있음 / Then `succ`는 같은 호출에서 저항이 없을 때와 같고, `dest`는 `min(DESTROY, 100 − succ)`(이벤트 포함 `succ`)에서 깎인다. 예 `+10`, 이벤트 5, `pity` 0: `succ` 50, `D0` 12, 저항 45 → `dest` 7, `destSaved` 5.
50. **상점 데이터**: Given `FAME_SHOP` / Then 키 순서 `destroyCut, dropCut, startGold, income, slots, autoStart`, 값·비용이 §15.2와 같고 비용 합 39, `FAME_PER_REBIRTH` 5, `ceil(39/5)` = 8. 로드 검사: `destroyCut`·`dropCut` 값이 `1..99` 정수 순증가가 아니면 `throw`. `buyFame`: 새 두 트랙의 비용이 1, 1, 2, 3 뒤 `maxed`, 사유 순서(invalid → maxed → noFame)는 기존과 같다.
51. **환생 명성**: Given `count 0`, `fame 0` / When 환생 / Then `count 1`, `fame 5`. 한 번 더 → `count 2`, `fame 10`(구매 안 했다면). `rebirthPreview.fameGain = FAME_PER_REBIRTH`이고 `destroyCut`·`dropCut`이 현재 값을 돌려준다.
52. **옛 저장**: Given `up = {startGold:2, income:1, slots:1, autoStart:0}`(새 키 없음), `v 2` / When 로드 / Then `destroyCut 0`, `dropCut 0`, `fame` 불변, `v 2`; 다음 환생의 시작 골드 = 300 + 8,000 = 8,300; `income` 1레벨 = 6%; 저장 → 로드 왕복이 같다. `up` 값 `'9'` → 4, `-1` → 0(새 두 키).
53. **미러**: Given 새 키를 가진 `rebirth` / Then 미러 왕복에서 새 키가 유지된다. 새 키가 없는 4키 미러를 채택하면 새 키가 0이다.
54. **`enhanceOpts`의 `S.rebirth` 읽기**: `enhanceOpts`는 `S.rebirth`에서 `destroyCut`·`dropCut`만 읽는다. Given `S.rebirth`를 최대로 올려도 같은 `{lv, pity, mastery}` / Then `succ`·`base`·`parts`·`raw`·`bonus`·`cap`·`mastery`·`event` 필드가 `S.rebirth` 기본값일 때와 같다(옛 AC 39의 대체).
55. **수입·시작 골드 재계산**: `up.startGold` 1~4 → 시작 골드 3,300 / 8,300 / 20,300 / 50,300(AC 25). 수동 사냥 `topLv` 10, `pFame` 25: 528, 부스터 793, `vHunt` 20 → 634(AC 28). `topLv` 12, `up.income` 1(6%): 1,532, `topLv` 13, `up.income` 4: 2,676. 자동 1회 `topLv` 10, 수확 lv5, `pFame` 25: 300(없으면 240, AC 29). 오프라인 8시간: 432,000(없으면 345,600, AC 30).
56. **UI(상점)**: Given 기록 탭 환생 섹션 / Then 상점이 6행(`FAME_TRACKS` 순서)이고 각 행이 이름·`Lv n/최대`·"지금 → 다음" 효과 문구·다음 비용·최대 상태를 보인다. 파괴 저항 예시 줄(`+19 파괴 35% → 30%`)이 있다. 터치 높이 44px(720px 이하)·360px 가로 넘침 없음은 기존과 같다.
57. **페이스(문서 항목)**: §15.6의 가드레일은 문서일 뿐 코드가 없다. 플레이 테스트(게이트 아님, 10-1) 기록: 2런 소요, 완성 상태 소요, 런별 파괴·하락 횟수, 파편 수입.

### 15.9 구현 요청 (2026-11-27)
- **Tech**: `js/constants.js`(`FAME_PER_REBIRTH` 5, `FAME_SHOP` 6트랙·새 값·로드 검사), `js/rules.js`(`chances()` 새 분할·새 반환 필드, `enhanceOpts`가 `destroyCut`·`dropCut`을 `fameValue`로 채움, `attemptEnhance`의 굴림에 `stay` 구간 추가·하락 방지 주문서는 하락 구간에서만 소모), `js/save.js`(`normRebirth`·`defaultState`의 `up` 6키, 미러), `js/rebirth.js`(`rebirthPreview`에 `destroyCut`·`dropCut`), `js/view.js`(확률 분해 "유지 실패"·보조 줄, 상점 6행·새 효과 문구, 확인 창 결과값), `tests/`(AC 42~57과 바뀐 AC 9·21·25·28~30·33·35·38·39·41), `tools/sim-late`(저항이 없으면 결과가 같아야 함).
- **Content**: 파괴 저항·하락 저항 이름·효과 문구·확률 보조 줄 문구·"유지 실패" 용어. `docs/content/m2-wording.md`의 "명성 +3"(1008·1048행 표) 표기는 코드가 `FAME_PER_REBIRTH`로 만들므로 값만 +5로 바뀐다.
- **QA**: AC 42~57과 §15.6 가드레일 점검(플레이 테스트).

### 15.10 열린 문제 (디렉터)
1. **총 플레이 시간 방향 변경 확인**: 사용자 요청의 결과로 상점 완성 시간이 4.7~6.0시간 → 2.9~4.0시간(약 35% 감소). 머리말의 "총 플레이 시간은 환생으로 늘린다"를 해제한 것으로 기록했다. 되돌리려면 저항 값이나 `FAME_PER_REBIRTH`를 낮춘다.
2. **소급 명성(선택)**: 1.0.0에서 환생 n회를 한 플레이어는 3n을 받았다. 보정은 `count × 2` 명성 지급이다. 하지 않은 이유: 마이그레이션이 필요하고 지출을 검증할 수 없으며 출시 직후라 영향이 작다. 결정 필요.
3. **시작 골드 지연**: 환생 뒤에 산 시작 골드는 그다음 환생부터 효과가 있어 2런에는 1레벨 시작 골드(3,000)가 소용없다(영향 약 0.05분, 계획표에 반영). 구매 순서를 바꿀 수도 있다(런 2에 수입 1을 먼저). 결정 필요(낮은 중요도).
4. **모델의 한계**: `pf`가 맞춘 계수이고 절대 시도 수를 쓰지 않는다(§15.6). 15분·10분 목표는 ±1분 오차로 읽는다.
5. **파편 수입 감소·파괴 업적 속도**: 파괴가 줄어 파편과 `dest_*` 업적이 느려진다(수용으로 기록, §15.4). 플레이 테스트에서 파편이 부족하면 파편 수입 상수를 본다.
6. **하락 방지 주문서의 가치 하락**: `stay`가 늘면 주문서 필요가 줄어든다(의도된 덤). 값 조정은 필요 없다고 봄.
