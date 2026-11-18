# M1 실패 보정(F7) + 성공 확률 보너스 상한

> 저장: `swords[].pity`(마지막 성공 이후 실패 누적 횟수). 보너스 %p는 항상 계산식으로 도출(저장하지 않음).

## 1. 결정 요약
| 항목 | 결정 |
| --- | --- |
| 카운터 | 검별 `pity` = 그 검의 "성공 없이 누적한 시도 횟수"(실패, 하락, **보호로 막은 파괴** 모두 +1) |
| 증가 | 단계 구간(band)별 +`PITY_STEP[band]`%p/회, 최대 `PITY_MAX[band]`%p |
| 초기화 | **성공 시 0**. 실패/하락에서는 유지. 파괴되면 검과 함께 소멸. 활성 검 전환·판매 시 다른 검에는 영향 없음 |
| 확정 강화권(`sure`) 성공 | 성공이므로 0으로 초기화 |
| 상한 | **(a) 보너스 합계 상한** `BONUS_CAP[band]`(band별 배열 `[20, 20, 14, 14]`%p, 밴드는 실패 보정과 같은 구간. m1-balance 확정) **그리고 (b) 절대 성공률 천장** `SUCC_CEIL`(90%) 둘 다 적용. 기본 확률이 천장 이상인 단계(+0 95%, +1 90%)는 기본 확률 유지(천장이 기본보다 낮아지지 않음) |
| 상한 포함 항목 | 축복 주문서, 모루, 실패 보정. (F15에서 확률 보너스형 소모품은 만들지 않았으므로 추가 항목 없음) |
| 상한 우회 | 확정 강화권(`sure`)은 보너스가 아니라 **확률 100%로 대체**하는 아이템이므로 상한을 우회 |

## 2. 구간 / 수치 (잠정값)
| band | 현재 단계 `l` | `PITY_STEP` (%p/회) | `PITY_MAX` (%p) |
| --- | --- | --- | --- |
| 0 | 0~4 | 1 | 5 |
| 1 | 5~9 | 1 | 6 |
| 2 | 10~14 | 2 | 8 |
| 3 | 15~19 | 2 | 10 |
- `BONUS_CAP[band]` (확정, m1-balance): band 0·1 = 20, band 2·3 = 14 (= 축복 10 + 미스릴 모루 4).
- 밴드는 **현재 단계 기준**으로 계산(하락으로 밴드가 바뀌면 같은 `pity`에서 새 밴드 값으로 재계산).
- 정수 %p만 사용(표시·테스트 단순화).

## 3. 계산식 (의사코드)
```
function chances(sword, opts):            // opts: {bless, anvil, sure}
  l = sword.lv
  if l >= MAX: return {succ:0, dest:0, fail:0}
  if opts.sure AND l < SURE_MAX_TARGET:    // 확정 강화권: 100%, 파괴 0
      return {succ:100, dest:0, fail:0, parts:{}}

  base   = RATE[l]
  bBless = opts.bless ? BLESS_BONUS : 0                         // 10
  bAnvil = opts.anvil ? ANVIL_BONUS[eqAnvil.g] : 0              // 2/3/4 (m1-balance 확정)
  band   = pityBand(l)
  bPity  = min(PITY_MAX[band], sword.pity * PITY_STEP[band])
  raw    = bBless + bAnvil + bPity
  bonus  = min(raw, BONUS_CAP[band])                            // (a) 합계 상한 (band별)
  succ   = min(base + bonus, max(base, SUCC_CEIL))              // (b) 절대 천장. base가 천장보다 높으면 base 유지
  dest   = max(0, min(DESTROY[l], 100 - succ))                  // 기존식 유지: 파괴율은 보너스로 줄지 않고, 성공률이 올라 남는 여유가 없을 때만 줄어듦
  fail   = 100 - succ - dest
  return {succ, dest, fail, parts:{bBless,bAnvil,bPity}, raw, bonus, capped: raw > BONUS_CAP or succ == SUCC_CEIL}
```
- **적용 순서**: ① 각 항목 개별 계산(pity는 자체 최대치 먼저) → ② 합산 → ③ 합계 상한 → ④ 절대 천장 → ⑤ 파괴율 재계산.
- 파괴율은 보너스로 **감소시키지 않는다**(방어는 보호권의 몫). 따라서 보너스가 클수록 실패 칸(하락/유지)이 줄어듦.
- 절대 천장은 `+0~+1`처럼 base가 이미 높은 단계에 의미가 없도록 `max(base, SUCC_CEIL)`로 둠(기본보다 낮아지지 않음).

### 합계 예 (확정값, +15 base 20%, 상한 14)
| 상황 | raw | bonus | succ |
| --- | --- | --- | --- |
| 축복만 | 10 | 10 | 30 |
| 축복 + 미스릴(4), pity 0 | 14 | 14(상한) | 34 |
| 축복 + 철 모루(2) + pity 5회(10) | 22 | 14(상한) | 34 |
→ 상한을 넘는 중복은 낭비가 되므로, UI에서 "상한 도달" 표시로 알려 소모품 낭비를 막는다.

## 4. 표시
- 강화 패널 성공 확률 옆에 분해 툴팁/보조줄: `기본 20% + 축복 10 + 모루 2 + 보정 8 = +20 → +14 (상한 14)`. 상한이 걸리면 `상한` 뱃지와 초과분 취소선(`+20 → +14`).
- 실패 보정 표시: 성공 확률 아래 작은 게이지 `보정 +8%p (최대 10)` (`pity==0`이면 숨김 또는 "보정 없음").
- 보관함 칸 카드에는 `pity>0`이면 `⬆+N%p` 뱃지(활성 아닌 검도 확인 가능).
- 토글 on/off를 바꿀 때마다 즉시 재계산·갱신. 상한에 이미 도달한 상태에서 추가 보너스 항목 토글 시 "효과 없음" 경고 표시.

## M1.1 확정 강화/숙련과의 관계
> 상세는 `m1.1-late-correction.md`. 수치는 시뮬레이션 미검증(플레이테스트로 조정).
- 천장 게이지 확정 성공(+15~+19)은 `sure`처럼 **상한/천장을 우회**하는 100/0/0 대체다. 성공이므로 `pity=0`. `pity` +1 규칙(실패/하락/보호로 막은 파괴)은 변하지 않음.
- 성공 숙련은 `BONUS_CAP` **밖**(raw·pity에 더하지 않음)이고 `SUCC_CEIL`은 **적용**된다. `BONUS_CAP`/`PITY_*`/`SUCC_CEIL` 값 변경 없음.
- `chances(sword, opts)`의 opts에 `gaugeFull`, `mastery`(횟수)가 추가됨(호출자가 `S`에서 주입).
- 순서: `sure`(<`SURE_MAX_TARGET`) → `gaugeFull`(15..19) 100/0/0 → raw/bonus/cap → `succ = min(base + bonus + mBonus, max(base, SUCC_CEIL))` → dest → fail. §3 의사코드의 4번째 줄에서 `mBonus`가 더해진다.
- 게이지/숙련이 0이면 위 §3~§수용 기준의 결과는 그대로다(수용 기준 번호 유지).

## 결정 사항 (사용자 확정, 2026-11-17)
1. (해결, m1-balance) 합계 상한을 band별 배열 `BONUS_CAP = [20, 20, 14, 14]`로 확정. 절대 천장 90% 유지.
2. 보호로 막은 파괴는 `pity`+1로 센다(수용 기준 8과 일치). 단 통계는 분리: `stats.protectSaved`+1이며 `stats.fail`에는 더하지 않는다(디렉터 확정, 코드 일치).

## 수용 기준 (Acceptance criteria)
1. Given +15 검(`pity=0`), 보너스 없음 / Then 성공 20%, 파괴 `DESTROY[15]=25`, 실패 55.
2. Given `pity=3`인 +15 / Then 보정 = min(10, 3×2)=6 → 성공 26%.
3. Given `pity=10`, 축복 ON, `anvil_3` ON인 +15 / Then raw = 10+4+10 = 24, bonus=14(상한 `BONUS_CAP[3]`), 성공 34%, UI에 `상한` 뱃지.
4. Given base 95%인 +0, 축복 ON / Then 성공 = `min(95+10, max(95, 90))` → 95%(천장이 base보다 낮아지지 않음).
5. Given base 60%인 +7, 축복+철 모루+`pity` 최대(6) / Then raw 18 → 성공 78%(상한 20 미만, 천장 90 미만) → 78%.
6. (공식 검증용 — 모루가 +5 미만에서 막혀 있어 실제 플레이에서는 발생하지 않음) Given base 85%인 +2, 보너스 raw 20 / Then `min(105, max(85,90)) = 90%`.
7. Given 파괴율이 큰 +19(`DESTROY=33`, base 7) / When succ와 33의 합이 100을 넘지 않으면 / Then 파괴 33% 유지. 임의 입력에서 항상 `succ+dest+fail=100`이고 `dest ≥ 0`.
8. Given 실패(유지/하락) / Then 해당 검 `pity`+1. 성공 / Then `pity=0`. 보호로 막은 파괴 / Then `pity`+1, `stats.protectSaved`+1이며 `stats.fail`은 증가하지 않는다(통계 분리).
9. Given 하락(+12→+11) / Then `pity`는 유지되고 +11 밴드로 보너스 재계산.
10. Given 검 A(`pity=4`) 파괴 / Then A와 함께 `pity` 소멸, 다른 검 `pity` 불변.
11. Given `sure` 사용 시도 / Then 성공 100%, 상한/천장/보정과 무관, 성공 후 `pity=0`.
12. Given 저장/새로고침 / Then 각 검의 `pity` 복원.
