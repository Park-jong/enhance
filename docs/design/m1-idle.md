# M1 방치형(F1) + 자동 사냥(F10) + 연출 스킵(F9)

> 저장: `idle.*`, `ore.*`, `settings.skipFx` (`m1-storage.md` §3). 별도의 "패시브 수입" 시스템은 만들지 않는다 — **자동 사냥이 곧 방치 수입**이다(요소를 늘리지 않기 위함).

## 1. 결정 요약 (F1/F10)
| 항목 | 결정 |
| --- | --- |
| 자동 사냥 | 토글 버튼 `idle.autoOn`. 켜 두면 `autoInterval`마다 사냥 1회분을 자동 지급 |
| 해금 | `best ≥ AUTO_UNLOCK_BEST`(5) 달성 시 토글 노출(무료). 명성 상점 "자동 사냥 면허"(`autoStart`)를 보유하면 환생 후 처음부터 열린다(m2-rebirth §4, `R.isUnlocked`). M0 초반은 수동 사냥으로 배우게 함 |
| 수동 사냥과의 관계 | 독립. 수동 버튼(2.5초 쿨다운)은 자동과 별개로 그대로 동작·병행 가능 |
| 효율 | 자동 간격 기본 `AUTO_CD_MS`=5000 → 처리량이 수동 최대치의 50%. 1회 보상은 **수동과 별도 식** `autoReward(l) = max(10, round(AUTO_COST_RATIO × cost(l)))`, `AUTO_COST_RATIO`=0.1 (m1-balance §3: 고단계 방치 수입 폭주 방지. +5 이상에서 1회 보상은 항상 수동 `huntReward`보다 적음) |
| 보상 기준 | **보관함 최고 단계 `topLv = max(swords[].lv)`**(현재 보유 검 기준, `best` 기록 아님, 활성 여부 무관)의 `autoReward(topLv)` (골드), 광석은 `ORE_PER_HUNT`. 수동 사냥 `huntReward(topLv)`, 오프라인도 동일. 최고 검을 판매/납품/파괴하면 수입이 내려간다. 구현은 헬퍼 `topLv()` 1개로 통일 |
| 오프라인 | 자동 사냥이 **해금되어 있고 `autoOn`이 켜져 있을 때만**. 경과시간 상한 `OFFLINE_CAP_H`=8시간(성장으로 +), 효율 `OFFLINE_EFF`=25% |
| 복귀 팝업 | 경과 ≥ `OFFLINE_MIN_SEC`(60초)이고 지급액>0이면 "자리 비운 동안" 모달: 경과시간(상한 표시), 골드, 광석, [받기]. 이미 지급 후 표시 |
| 성장 요소 | 3종 업그레이드(각 `UP_MAX`=5레벨), 골드로 구매 |

### 성장 업그레이드 (잠정값)
| id | 표시명 | 효과 (레벨 n) | 비용 `UP_COST[id][n]` (n=현재 레벨 → n+1) |
| --- | --- | --- | --- |
| `speed` | 자동 사냥 속도 | `autoInterval = AUTO_CD_MS - n × UP_SPEED_STEP`(400ms) → 5000..3000ms | 기본 `UP_COST_BASE.speed`=3,000 × `UP_COST_GROWTH`(2.2)^n |
| `gold` | 수확 보너스 | 자동/오프라인 골드 +`UP_GOLD_STEP`(10%) × n (수동 포함? **아니오**: 자동·오프라인만) | `UP_COST_BASE.gold`=5,000 × 2.2^n |
| `offline` | 오프라인 저장고 | 상한 `OFFLINE_CAP_H + n × UP_OFFLINE_STEP_H`(1h) → 8..13시간 | `UP_COST_BASE.offline`=4,000 × 2.2^n |
- 비용은 소수점 반올림 후 10단위 반올림. 최대 레벨 도달 시 버튼 "MAX".
- `speed`는 광석 생산도 같이 올림(사냥 횟수 증가). `gold`는 광석에 영향 없음.
- 골드 부스터(`booster`): 지속 중 **수동·자동·오프라인 겹친 구간**의 골드 ×`BOOSTER_MULT`(1.5). 광석 불변.

### 강화 루프와의 균형 원칙 (밸런스 담당용 가이드)
- 방치는 "강화를 대체"하지 않고 **다음 시도 비용을 대는 보조**. (해결, m1-balance §3) 자동 사냥 10분 = 보관함 최고 검(`topLv`) 단계 강화 12회분, 오프라인 8시간 = 강화 144회분이 되도록 `autoReward`를 `cost(l)`에 연동했다.
- 업그레이드는 총 15레벨 정도로 짧은 골드 싱크 역할, 값은 +10~15 구간 수입 기준으로 책정.
- 오프라인 효율이 수동 플레이를 대체하지 않도록 `OFFLINE_EFF` ≤ 자동 효율.

## 2. 틱 설계 (바닐라 JS)
- 카운팅 금지: 자동 사냥은 `setInterval` 호출 횟수로 세지 않는다. **절대시각 기반**.
- 상태(런타임, 비저장): `nextAutoAt`(다음 자동 사냥 시각 ms).
```
loop (500ms 간격 setTimeout 또는 rAF; 탭이 숨겨져 지연돼도 무방):
  now = Date.now()
  if idle.autoOn and unlocked:
      n = 0
      while now >= nextAutoAt and n < AUTO_CATCHUP_MAX(=20):
          payoutAuto()            // 골드, 광석, 효과음 없이 숫자 팝업은 1회로 합산
          nextAutoAt += autoInterval; n++
      if now >= nextAutoAt: nextAutoAt = now + autoInterval   // 남은 것은 오프라인 정산으로 넘기지 않고 버림
  idle.lastSeen = now  (저장은 5초마다 + 이벤트 시)
```
- **복귀 정산**(`document.visibilitychange` visible, 그리고 `load`): `gap = now - idle.lastSeen`. `gap < 0`이면 0(시계 역행). `gap ≥ OFFLINE_MIN_SEC×1000`이면 오프라인 정산, 미만이면 위 catch-up 루프에 맡김.
```
effGap = min(gap, offlineCapMs)
n      = floor(effGap / autoInterval)
gold   = floor(n × autoReward(topLv) × (1 + UP_GOLD_STEP×up.gold) × OFFLINE_EFF × boostFactor)
ore[k] = floor(n × ORE_PER_HUNT[k] × OFFLINE_EFF)       // 해금된 광석만
boostFactor = 1 + (BOOSTER_MULT-1) × overlapMs/effGap   // overlap = 부스터 지속과 구간 [lastSeen, lastSeen+effGap]의 겹침
```
- `visibilitychange: hidden` 시 즉시 `lastSeen=now`로 저장. `pagehide`에서도 저장.
- 오프라인 정산 후 `lastSeen=now`, `nextAutoAt=now+autoInterval`.
- 정산은 1회만 수행(중복 지급 방지: 정산 직후 `lastSeen` 갱신 + 저장).
- 이 계산은 보상으로 `stats.offlineGold` 누적.

## 3. F9 연출 스킵
| 항목 | 결정 |
| --- | --- |
| 위치 | 헤더의 설정 톱니(⚙) 팝오버 안 "강화 연출 건너뛰기" 토글 + 소리 토글(기존 🔊 이동 가능). 키보드 단축 `K`는 추가하지 않음 |
| 기본값 | OFF, `settings.skipFx`에 저장(새로고침 유지) |
| 스킵 시 생략 | 충전 대기 650ms, 파티클(burst), 칼 흔들림/진동, `shatter`·`appear` 대기 |
| 최소 피드백 | 결과 텍스트 `showResult` 0.5초 표시(성공!/실패/하락/파괴!/보호됨!), 결과별 효과음 1회, 짧은 화면 플래시 120ms(성공=금색, 파괴=적색), 로그 한 줄, 검 단계 텍스트 즉시 갱신 |
| 중요 결과 예외 | 다음 경우는 스킵 중에도 **짧은(≤0.6초) 연출**을 재생: ① +15 이상 성공 ② `best` 갱신 + 도감 첫 등록(배너/토스트는 기존 규칙 유지) ③ +10 이상 파괴. 기준 상수 `SKIP_KEEP_LV`=15(성공), `SKIP_KEEP_DESTROY_LV`=10(파괴) |
| 최소 시도 간격 | 스킵 중에도 `SKIP_MIN_INTERVAL_MS`=250ms 동안은 다음 강화 불가(오입력으로 연속 파괴 방지). `keydown` 반복(`event.repeat`)은 무시하고 **자동 강화는 추가하지 않는다** |
| 비적용 | 사냥/판매 연출은 영향 없음(원래 짧음). 스킵 ON/OFF 전환 중 진행 중인 연출은 끝까지 진행 |
- 구현 요점: `enhance()`의 `await wait(650)`/`wait(650)`를 `skipFx && !important ? 0 : 650`으로 분기, 결과 계산·저장은 동일 경로(스킵이 결과 로직을 건드리지 않음). `busy` 해제는 최소 간격 타이머로.

## 결정 사항 (사용자 확정, 2026-11-17)
1. 자동 사냥 해금: `best ≥ 5`, 무료 해금. 명성 상점 자동 사냥 면허(`autoStart`) 보유 시 `best`와 무관하게 처음부터 해금(m2-rebirth §4).
2. 오프라인: 효율 25% / 상한 8시간(업그레이드로 최대 13시간까지).
3. `gold` 업그레이드는 자동·오프라인에만 적용(수동 사냥 제외).
4. 수입 기준 = `topLv`(보관함 최고 단계). **활성 검 기준에서 변경됨.** 수동 사냥·자동 사냥·오프라인 모두 `topLv()` 헬퍼 1개를 사용.

## 수용 기준 (Acceptance criteria)
0. Given 활성 검 +3, 보관함에 +10이 있을 때 / Then 자동 사냥·오프라인 정산·수동 사냥 모두 +10 기준(`autoReward(10)`, `huntReward(10)`)으로 지급된다. 그 +10을 판매하면 다음 최고 검 단계 기준으로 내려간다.
1. Given `best=4`, 면허 없음 / Then 자동 사냥 토글은 잠금 표시. `best=5` 달성 시 토글이 활성화된다. 면허가 있으면 `best=0`에서도 활성이다.
2. Given 자동 사냥 ON, 업그레이드 없음 / When 5초(타임스탬프 기준)가 지나면 / Then 골드가 `autoReward(topLv)` 1회분(예: 최고 검 +10 → 160G) 늘고 광석이 `ORE_PER_HUNT`만큼 늘며 수동 쿨다운에는 영향이 없다.
3. Given 자동 사냥 ON 상태에서 탭이 30초 숨겨졌다 복귀 / Then 60초 미만이므로 오프라인 정산·팝업 없이 catch-up 루프가 처리하여 `floor(30000/autoInterval)`회분(=6회, 효율 100%, 최대 `AUTO_CATCHUP_MAX`회)이 지급된다.
4. Given 자동 ON, `lastSeen`이 10시간 전, `OFFLINE_CAP_H=8`, 업그레이드 0 / When 로드하면 / Then 지급은 8시간 분량만이고 효율 `OFFLINE_EFF`가 적용되며 팝업에 "최대 8시간까지 적립"이 표시된다.
5. Given 자동 OFF 또는 미해금 / When 장시간 후 로드 / Then 오프라인 보상 없음, 팝업 없음.
6. Given `lastSeen`이 미래(시계 역행) / Then 지급 0이고 오류가 없다.
7. Given 오프라인 정산 직후 즉시 새로고침 / Then 보상이 중복 지급되지 않는다.
8. Given `speed` 업그레이드 3레벨 / Then `autoInterval=3800ms`. `offline` 2레벨 / Then 상한 10시간. 비용은 `UP_COST` 식대로 증가하고 MAX 이후 구매 불가.
9. Given 부스터가 오프라인 구간의 절반과 겹칠 때 / Then 골드는 `1 + 0.5×0.5 = 1.25`배(`BOOSTER_MULT=1.5` 기준)로 정산.
10. Given 스킵 OFF / Then 기존 M0 연출(충전 650ms 등)이 그대로 재생된다.
11. Given 스킵 ON, +6→+7 성공 / Then 결과 텍스트·효과음·120ms 플래시만 있고 파티클·650ms 대기가 없으며 결과 확정까지 100ms 이내, 저장 정상.
12. Given 스킵 ON, +15 이상 성공 / +10 이상 파괴 / 첫 도감 등록 / Then 0.6초 이내의 짧은 연출이 재생된다.
13. Given 스킵 ON에서 Space 키를 누르고 있을 때 / Then 연속 강화되지 않고(`event.repeat` 무시) 시도 간 최소 250ms가 보장된다.
14. Given 스킵 설정 변경 후 새로고침 / Then 설정이 유지된다.
