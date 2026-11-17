# M1 아트 / 사운드 가이드

산출물: `assets/m1-icons.js`(SVG 아이콘 26종), `assets/m1-sfx.js`(사운드 큐 24종), `assets/m1-preview.html`(미리보기, file://에서 열기).

## 1. 아트 디렉션

- **스타일**: 플랫 2톤. 면 하나 + 어두운(또는 밝은) 보조 톤 하나, `stroke-linejoin/linecap: round`. 그라디언트/ID/필터 없음.
- **규격**: `viewBox 0 0 32 32`, width/height 속성 없음. 크기는 CSS(`font-size` + `svg{width:1em;height:1em}`)로 결정. 20~48px 범위 목표.
- **색 규칙**: UI 의미색은 테마 CSS 변수를 fallback과 함께 사용(`var(--gold,#ffd166)`). 단색 UI 아이콘은 `currentColor`라서 부모 `color`를 따른다.

### 티어 팔레트 (광석/모루 공통)

| 티어 | 밝은 톤 | 어두운 톤 | 비고 |
|---|---|---|---|
| 철(iron) | `#8d7b6a` | `#5b4d41` | 광택 없음 |
| 은(silver) | `#e3edf8` | `#9db3cc` | 광택 없음 |
| 미스릴(mithril) | `#3ee6d0` | `#118a7c` | 뒤에 22~25% 후광 원 |

### 모루 1~3
- anvil_1: 윗면 철 `#8d7b6a`, 밑받침 `#5b4d41`, 장식선 없음.
- anvil_2: 윗면 `#9db3cc`, 밑받침 `#5b4d41`, 은색(`#e3edf8`) 장식선.
- anvil_3: 윗면 `#118a7c`, 밑받침 `#0c4f55`, 미스릴(`#3ee6d0`) 장식선 + 후광.

### 테마 변수 사용
| 변수 | 사용처 |
|---|---|
| `--gold` | 골드, 축복서, 번개 테두리, 게이지 채움, 자물쇠 구멍 |
| `--good` | 하락 방지, 확정 강화권, 완료 체크 |
| `--bad` | 천장(pity) 하트 |
| `--warn` | 부스터, 보관함, 스킵 막대, 금화 테두리 |
| `--info` | 파편, 보호, 남은 보호, 방치 번개 |
| `--accent` | 인장, 오프라인 달 |

## 2. 아이콘 키

| 키 | 의미 / 용도 |
|---|---|
| shard | 보호 파편(파란 결정) |
| ore_iron | 철 광석 |
| ore_silver | 은 광석 |
| ore_mithril | 미스릴 광석(후광) |
| anvil_1 | 모루 1단(철) |
| anvil_2 | 모루 2단(은 장식) |
| anvil_3 | 모루 3단(미스릴, 후광) |
| keepdown | 하락 방지 주문서(아래 화살표 + 바닥선, 녹색) |
| sure | 확정 강화권(체크 원) |
| booster | 골드 부스터(번개) |
| seal | 감정 인장(별 도장, 보라) |
| bless | 축복서(문서 + 십자 + 광채, 금색) |
| protect | 보호 소모품(방패 + 십자) |
| storage | 보관함(상자) |
| tab_shop | 탭: 상점 |
| tab_forge | 탭: 강화(모루 + 불꽃) |
| tab_quest | 탭: 의뢰(문서 + 체크) |
| tab_idle | 탭: 방치(시계 + 번개) |
| tab_log | 탭: 기록(막대 그래프) |
| auto_hunt | 자동 사냥(순환 화살표 + 별) |
| fx_skip | 효과 스킵(빨리감기) |
| pity | 천장 게이지(하트 + 막대) |
| protect_left | 남은 보호 횟수(방패 + 회전 십자) |
| offline | 오프라인 보상(달 + 번개) |
| lock | 잠김(자물쇠) |
| gold | 골드 코인 |

## 3. 사운드 큐

WebAudio 합성(tone/noise)만 사용. 음량 상한은 기존 sfx와 동일(tone <= 0.12, noise <= 0.25). 길이는 각 단계의 (시작 + 길이) 최댓값을 스크립트로 계산한 값.

| 이름 | 설명 | 길이(초) |
|---|---|---|
| skipSuccess | 효과 스킵 중 강화 성공: 짧은 상승 2음 | 0.19 |
| skipFail | 효과 스킵 중 실패/하락: 짧은 하강음 | 0.18 |
| skipDestroy | 효과 스킵 중 파괴: 짧은 충격음 | 0.20 |
| skipBigWin | 스킵 중 +15 이상 성공/도감 첫 등록/best 갱신: 짧은 팡파르 | 0.56 |
| itemUse | 소모품 사용(일반): 가벼운 맑은 2음 | 0.13 |
| useKeepdown | 하락 방지 주문서 사용: 위로 올라가는 음 | 0.26 |
| useSure | 확정 강화권 사용: 또렷한 3음 상승 | 0.36 |
| useBooster | 골드 부스터 사용: 상승 스윕 + 반짝임 | 0.35 |
| useSeal | 감정 인장 사용: 도장 찍는 타격음 | 0.25 |
| craft | 제작(일반) 완료: 상승 2음 | 0.23 |
| anvilCraft | 모루 제작: 망치 2회 + 완성음 | 0.48 |
| anvilBreak | 모루 파손: 금속이 갈라지는 하강음 | 0.40 |
| anvilRepair | 모루 수리: 두드림 후 상승 음 | 0.38 |
| oreGain | 광석 획득: 톡 소리 + 짧은 음 | 0.12 |
| questDeliver | 의뢰 납품: 동전 같은 2음 | 0.28 |
| questComplete | 의뢰 완료: 3음 아르페지오 | 0.55 |
| offlineCollect | 오프라인 보상 수령: 따뜻한 3음 | 0.54 |
| shardGain | 파편 획득: 높은 유리 반짝임 | 0.15 |
| shardExchange | 파편 교환: 하강 반짝임 | 0.15 |
| autoHuntTick | 자동 사냥 1회 지급: 거의 안 들리는 틱 | 0.03 |
| tabSwitch | 탭 전환: 클릭 틱 | 0.03 |
| unlock | 신규 요소 해금: 3음 상승 팡파르 | 0.46 |
| toggleOn | 토글 켜짐: 위로 슬라이드 | 0.06 |
| toggleOff | 토글 꺼짐: 아래로 슬라이드 | 0.06 |

스킵 큐 길이 제한(m1-idle.md): 일반 스킵 큐 <= 0.3초(실측 0.18~0.20), skipBigWin <= 0.6초(실측 0.56). 모두 충족.

## 4. Tech 연동 메모

1. `index.html` 메인 `<script>` 앞에 추가:
   ```html
   <script src="assets/m1-icons.js"></script>
   <script src="assets/m1-sfx.js"></script>
   ```
2. 아이콘: `el.innerHTML = M1_ICONS.anvil_2;` + CSS `svg{width:1em;height:1em}`(필요하면 `.ic svg`로 범위 제한). 크기는 `font-size`, 색은 `color`.
3. 사운드: `M1_SFX_PLAY('skipSuccess', tone, noise);` 기존 `tone`/`noise`(muted 처리 포함)를 그대로 넘긴다. 알 수 없는 이름은 무시된다. noise에 delay 인자가 없어 `at>0`인 noise 단계는 setTimeout으로 지연된다.
4. 이벤트 -> 큐 매핑 제안:

| 게임 이벤트 | 큐 |
|---|---|
| 스킵 ON 중 강화 성공 / 실패·하락 / 파괴 | skipSuccess / skipFail / skipDestroy |
| 스킵 중 중요 결과(+15 이상 성공, best 갱신 + 도감 첫 등록; m1-idle.md 예외 규칙) | skipBigWin (+10 이상 파괴 예외는 전용 큐가 없어 skipDestroy 재사용, Design 확인 필요) |
| 소모품 사용 | useKeepdown / useSure / useBooster / useSeal, 그 외 itemUse |
| 모루 제작 / 파손 / 수리 | anvilCraft / anvilBreak / anvilRepair |
| 광석 드롭 | oreGain |
| 의뢰 납품 / 완료 | questDeliver / questComplete |
| 오프라인 보상 수령 | offlineCollect |
| 파편 획득 / 교환 | shardGain / shardExchange |
| 자동 사냥 지급 | autoHuntTick (너무 잦으면 생략 가능) |
| 탭 전환 | tabSwitch |
| 신규 해금 | unlock |
| 스킵/자동 사냥 등 토글 | toggleOn / toggleOff |
| 일반 제작 완료 | craft |

## 5. 제약 및 미검증 사항

- **file:// 제약 충족**: 두 파일 모두 클래식 `<script>`이며 ES module/fetch/외부 라이브러리 없음. 미리보기 HTML도 동일.
- **아이콘 미검증**: 20px 이하 소형 가독성은 아직 육안 확인 전이다. `assets/m1-preview.html`에서 확인 필요(특히 protect/protect_left, bless, auto_hunt 등 디테일이 많은 것).
- **사운드 레벨 미검증**: 음량/음색은 귀로 확인 전이다. 기존 sfx 대비 밸런스(특히 autoHuntTick, shardGain)를 청취 후 조정 필요.
- 최종 아트는 사람이 제작하는 것을 전제로 한 플레이스홀더 수준.
