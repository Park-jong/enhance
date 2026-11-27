# M2 문구·아이콘 연결 제안 (9-2: REQ-019, REQ-036, REQ-048)

> 작성: 콘텐츠 팀 시나리오 작가. 기준: 2026-11-25 `main`(aa8f4fa)의 `js/constants.js`·`js/view.js` 실제 문구.
> 갱신(2026-11-27, 환생 보강 `m2-rebirth.md` §15): (c)·(d)에 파괴 저항·하락 저항 행과 명성 +5 표기, (g) 강화 확률 결과 분해(유지 실패·보조 줄)를 더했다. 판정 **신규** = 이번에 새로 생긴 문구(초안, 클라이언트 프로그래머 작성 → 콘텐츠 검토 대상). 행 번호 대신 함수·상수 이름으로 위치를 적는다.
> 이 문서는 **Tech가 그대로 붙여 넣는 제안**이다. `js/`·`css/`·HTML·`docs/design/`은 건드리지 않았다.
> 규칙: 뜻과 **모든 숫자는 그대로**(밸런스 변경 없음). 문체는 기존 UI처럼 합니다체/명사형. 이미 좋은 문구는 "유지".
> 용어: 일일 과제는 "일일 과제"(F12), "의뢰"는 F4 전용(m2-achievements §2). 업적 이름·칭호는 **바꾸지 않는다**.
> 아이콘 키는 Art Director의 `assets/m2-icons.js`(`window.M2_ICONS`) 19개: `trait_hunt` `trait_work` `trait_trade` `trait_ore` `trait_shard` `trait_anvil` `event_luck` `event_hunt` `event_auto` `event_ore` `event_anvil` `event_quest` `fame` `rebirth` `monument` `achievement` `title` `sure_badge` `mastery`.

---

## 1. 현재 문구 → 제안 문구 → 위치

표기: **변경** = 문구를 바꾼다, **유지** = 그대로. `{v}`·`${...}`는 코드의 값 자리 그대로다.

### (a) 이벤트 효과 문장 `C.EVENTS[id].desc` (`js/constants.js` 353~358행, `eventEntry`의 `desc` 인자)

| id | 현재 | 제안 | 판정 | 이유 |
|---|---|---|---|---|
| luck | `강화 성공 확률 +${v}%p` | 동일 | 유지 | %p는 확률 이벤트만의 단위로 정확함 |
| hunt | `수동 사냥 골드 +${v}%` | 동일 | 유지 | 약탈자 트레이트 문장과 같음 |
| auto | `자동 사냥 골드 +${v}%` | 동일 | 유지 | 일꾼 트레이트(`자동 사냥·오프라인 골드`)와 구분됨: 이벤트는 오프라인에 적용되지 않음 |
| ore | `사냥 광석 +${v}%` | `사냥당 광석 +${v}%` | **변경** | 광부 트레이트(`사냥당 광석 +N%`)와 문장 통일 |
| anvil | `모루 사용 시 ${v}% 확률로 내구도 보존` | `모루로 강화할 때 ${v}% 확률로 내구도 보존` | **변경** | 대장장이 트레이트(`이 검을 모루로 강화할 때 N% 확률로 내구도 보존`)와 어순·표현 통일. "사용"은 모루 제작·수리와 헷갈림. 이벤트는 검을 가리지 않으므로 "이 검을"은 붙이지 않음 |
| quest | `의뢰 새로고침 비용 −${v}%` | 동일 | 유지 | F4 "의뢰" 맞음. 부호 −(U+2212)는 `+`와 짝이라 유지 |

### (b) 이벤트 알림·표시 (`js/view.js`)

| 현재 | 제안 | 판정 | 위치 |
|---|---|---|---|
| 시작 토스트 `${d.icon} 이벤트 시작: ${d.name} — ${eventDurationText(d.durationSec)}간 ${d.desc}` (2026-11-27 REQ-047: 지속 시간은 `5분`·`4분 30초`, 소수 분 없음) | 형식 동일. 토스트·로그는 `textContent`라 SVG를 못 쓰므로 **이모지 폴백을 그대로 쓴다**(2장 참고). 위 (a)가 바뀐 만큼 문장 끝만 달라짐 | 유지 | `eventStartText` (view.js 237행) |
| 종료 토스트 `이벤트 종료: ${C.EVENTS[id].name}` | 동일 | 유지 | `eventEndText` (241행) |
| `EVENT_TEXT.offlineNote` `접속 중에만 흐르고 오프라인에서는 적용되지 않습니다` | 동일 | 유지 | `EVENT_TEXT` (147행) |
| `EVENT_TEXT.remain` `남은 시간` | 동일 | 유지 | 〃 |
| `EVENT_TEXT.deal` `특가` / `EVENT_TEXT.guard` `가호` | 동일 | 유지 | 〃 (의뢰 새로고침 뱃지·모루 행 태그) |
| `eventChipLabel` `${name} ${m:ss} 남음 · ${desc}` | 동일 | 유지 | view.js 201행 |
| `eventAssistText` `${icon} 이벤트 덕에 성공 — 숙련 기록에는 세지 않습니다` | 동일(아이콘은 로그라 이모지) | 유지 | view.js 243행 |
| `incomeEventText` ` · 이벤트 사냥 +40%` / ` · 이벤트 자동 +50%` | 동일 | 유지 | `EVENTS[id].incomeLabel` (constants.js, 2026-11-27 REQ-047: view.js `INCOME_EVENTS`에서 이동) |
| `LUCK_IDLE_TEXT` 5개 사유 | 동일 | 유지 | view.js 155행 |
| `CAP_CAUSE_TEXT` `상한`/`천장`, `eventBreakdownNote` ` · 이벤트 실효 +N%p`/` · 이벤트 효과 없음(원인)` | 동일 | 유지 | 153·205행 |
| 칩 `eventChipHTML`, 팝오버 `eventPopHTML`의 아이콘 자리 | 문구 변경 없음. 아이콘만 SVG로(2장) | 유지(문구) | 198·225행 |

### (c) 명성 상점 (`C.FAME_SHOP` 이름, `FAME_TEXT`, `FAME_WHEN_TEXT`)

| 현재 | 제안 | 판정 | 위치 |
|---|---|---|---|
| `startGold.name` `여유 자금` | 동일 | 유지 | `C.FAME_SHOP` (constants.js 390행) |
| `income.name` `초반 수완` | 동일 | 유지 | 391행 |
| `slots.name` `넉넉한 보관함` | 동일 | 유지 | 392행 |
| `autoStart.name` `자동 사냥 면허` | 동일 | 유지 | 393행 |
| `FAME_TEXT.startGold.label` `환생 시작 골드` | 동일 | 유지 | `FAME_TEXT` (view.js 1019행) |
| `FAME_TEXT.startGold.value` `+${fmt(v)}G` | `+${fmt(v)} G` | **변경** | 같은 줄. 확인 창·수수료는 `goldText`(`2,000 G`, 숫자 뒤 띄어쓰기). 환생 화면 안에서 통일. 보상 요약(`+2,680G`)은 m2-achievements 표기라 건드리지 않음 |
| `FAME_TEXT.income.label` `보관함 최고 +12 이하일 때 사냥·자동·오프라인 골드` / value `+${v}%` | 동일 | 유지 | 1020행 |
| `FAME_TEXT.slots.label` `환생 시작 보관함` / value `+${v}칸` | 동일 | 유지 | 1021행 |
| `FAME_TEXT.autoStart.label` `매 런 처음부터 자동 사냥 해금` | `환생 후 처음부터 자동 사냥 해금` | **변경** | 1022행. "런"은 게임 안 다른 곳에 없는 외래어. 같은 화면에서 쓰는 "환생"으로 |
| `FAME_WHEN_TEXT` `다음 환생부터` / `즉시 적용` | 동일 | 유지 | 1024행 |
| `REBIRTH_TEXT.max` `최대`, `REASON.maxed` `이미 최대 단계입니다`, `REASON.noFame` `명성이 부족합니다` | 동일 | 유지 | 1007행, 52~53행 |
| (없음) | `destroyCut.name` `파괴 저항` | 신규 | `C.FAME_SHOP`. 이름은 설계 초안(§15.2) 그대로. 상점 첫 행 |
| (없음) | `dropCut.name` `하락 저항` | 신규 | `C.FAME_SHOP`. 상점 둘째 행 |
| (없음) | `FAME_TEXT.destroyCut` `파괴 확률 ${v}% 감소`(0레벨 `파괴 확률 없음 → 15% 감소`, 중간 `파괴 확률 15% 감소 → 25% 감소`, 최대 `파괴 확률 45% 감소`) + ` · 즉시 적용` | 신규 | `FAME_TEXT`(view.js). 값은 상대 감소라 `%p`가 아닌 `%`. 0레벨만 `zero: '없음'`으로 "없음 → 1레벨 값"(§7.1), 다른 트랙의 0레벨 표기(1레벨 값만)는 그대로 |
| (없음) | `FAME_TEXT.dropCut` `+${DROP_FROM} 이상 하락 확률 ${v}% 감소`(0레벨 `+10 이상 하락 확률 없음 → 15% 감소`) + ` · 즉시 적용` | 신규 | 같은 곳. 하락이 +10(`DROP_FROM`)부터라 적용 범위를 앞에 둔다(`초반 수완`의 "보관함 최고 +12 이하일 때"와 같은 방식) |
| (없음) | 예시 줄 `+19 파괴 35% → 30%`(`+${MAX-1} 파괴 지금% → 다음%`) | 신규 | `destroyCutExample`(view.js). 숫자는 지금·다음 레벨 값을 넣은 `R.chances()`의 파괴 확률. 최대 레벨과 테스트 페이지 강제 성공(파괴 늘 0)에서는 숨김 |

### (d) 환생 확인 창 (`REBIRTH_TEXT` 전 키 + `rebirthConfirmHTML`·`rebirthActionHTML` 인라인 문구)

| 현재 | 제안 | 판정 | 위치 |
|---|---|---|---|
| `locked` `최고 강화 +20 달성 시 환생이 열립니다` | 동일 | 유지 | `REBIRTH_TEXT` (1005행) |
| `shop` `명성 상점` | 동일 | 유지 | 1006행 |
| `ready` `+20 검 1자루를 바치고 명성 +${C.FAME_PER_REBIRTH}` (2026-11-27부터 화면 표기 `명성 +5`) | 동일 | 유지 | `REBIRTH_TEXT`. 숫자는 코드가 `FAME_PER_REBIRTH`로 만들므로 문구 변경 없이 +3 → +5 |
| `confirmTitle` `환생할까요?` | 동일 | 유지 | 1009행 |
| `confirmLead` `되돌릴 수 없습니다. 처음부터 다시 시작하고 명성을 얻습니다.` | 동일 | 유지 | 1010행 |
| `keep` `업적·칭호·기념비·도감·통계·설정·명성과 상점` | `업적·칭호·일일 과제·기념비·도감·통계·설정·명성·명성 상점` | **변경** | 1011행. (1) 실제로 유지되는데(`KEPT_FIELDS`에 `daily`) 빠져 있던 **일일 과제**를 추가. (2) "명성과 상점"은 읽는 방법이 둘이라 `명성·명성 상점`으로 분리. 숫자 변경 없음 |
| `lost` `골드, 파편, 모든 검(특성 포함), 소모품, 모루·광석, 의뢰, 방치 업그레이드·부스터, 이벤트 진행 · 숙련은 단계별 1개만 유지` | `골드, 파편, 모든 검(특성 포함), 소모품, 모루·광석, 의뢰, 방치 업그레이드·부스터, 이벤트 진행, 숙련 기록(단계별 1개만 남김)` | **변경** | 1012행. "사라짐" 목록 안에 "유지"라는 말이 섞여 헷갈림. 목록은 쉼표로 통일하고 숙련은 "1개만 남김"으로. 숫자 `${C.MASTERY_KEEP_REC}` 그대로 |
| `unclaimed` `받지 않은 업적·일일 과제 보상이 있습니다. 보상은 지금 최고 단계로 계산되니 환생 전에 받는 편이 좋습니다.` | 동일 | 유지 | 1013행 |
| `cancel` `취소` / `confirm` `환생하기` | 동일 | 유지 | 1014~1015행 |
| 라벨 `수수료` | 동일 | 유지 | `rebirthConfirmHTML` (1070행) |
| 라벨 `현재 골드` | 동일 | 유지 | 〃 |
| 라벨 `수수료 후 사라지는 골드` | 동일 | 유지 | 1071행 |
| 라벨 `얻는 명성` | 동일 | 유지 | 〃 |
| 라벨 `바치는 검` | 동일 | 유지 | 1072행 |
| 소제목 `유지` / `사라짐` / `환생 후` | 동일 | 유지 | 1073~1075행 |
| 라벨 `시작 골드` | 동일 | 유지 | 1076행 |
| 라벨 `시작 칸` (값 `N칸`) | `시작 보관함` (값 `N칸` 그대로) | **변경** | 1076행. 상점의 `환생 시작 보관함`·`넉넉한 보관함`과 같은 단어로 |
| 라벨 `초반 수입` (값 `+N% (보관함 최고 +12 이하)`) | 동일 | 유지 | 1077행. 상점 이름은 `초반 수완`, 여기는 결과값이라 효과 이름(수입)이 읽기 쉬움. 의도된 차이 |
| 라벨 `자동 사냥 면허` (값 `있음`/`없음`) | 동일 | 유지 | 1077행 |
| (없음) | 라벨 `파괴 저항` (값 `파괴 확률 N% 감소`, 0이면 `없음`) | 신규 | `rebirthConfirmHTML` '환생 후' 목록. 라벨은 `C.FAME_SHOP` 이름, 값은 상점 효과 문구와 같은 표기(`fameResultText`), N = `rebirthPreview.destroyCut` |
| (없음) | 라벨 `하락 저항` (값 `+10 이상 하락 확률 N% 감소`, 0이면 `없음`) | 신규 | 같은 곳. N = `rebirthPreview.dropCut` |
| `rebirthActionHTML` 버튼 `환생` | 동일 | 유지 | 1050행 |
| `rebirthActionHTML` 안내 `수수료 ${G} · +20 검 1자루를 바치고 명성 +5` (`REBIRTH_TEXT.ready`) | 동일 | 유지 | `rebirthActionHTML`. +5는 `FAME_PER_REBIRTH` |
| 환생 토스트 `환생! 명성 +${r.fameGain}` (표기 `환생! 명성 +5`) | 동일 | 유지 | `main.js` 환생 확인. `fameGain` = `FAME_PER_REBIRTH` |
| `REBIRTH_REASON.notReached` `+20 검이 보관함에 있어야 합니다` / `busy` `강화 연출이 끝난 뒤 다시 시도하세요` / `noGold` `필요 N G` | 동일 | 유지 | view.js 59~61행 |
| 섹션 머리 `환생 N회` / `명성 N` | 동일 | 유지 | 1055~1056행 |

### (e) REQ-019 확정 배지·숙련

| 현재 | 제안 | 판정 | 위치 |
|---|---|---|---|
| 게이지 `천장 ${value}/${n}` + 가득 차면 `<span class="badge good">확정!</span>` | 글자 `확정!` 유지, 앞에 아이콘: `<span class="badge good">${ic('sure_badge')} 확정!</span>` | **변경**(아이콘만) | `gaugeHTML` (view.js 397행) |
| 숙련 행 `+${lv} 숙련 <b>+${bonus}%p</b> (count/max)` | 글자 동일, 줄 맨 앞에 `${ic('mastery')} ` | **변경**(아이콘만) | `masteryRowsHTML` (view.js 846행) |
| 숙련 토스트 `+${m.lv} 숙련! 이후 +${m.lv} 강화 성공률 +${m.gained}%p` | 동일(토스트는 `textContent`라 SVG 불가). 앞에 이모지 폴백 `${C.ICONS.mastery} `을 붙여 이벤트·납품 토스트와 맞춤 | **변경**(앞 이모지만) | `masteryToastText` (view.js 1106행) |
| 기록 탭 제목 `숙련 (+15~+19 단계별 성공 기록)` | 글자 동일, `<h2>` 앞에 아이콘(정적 요소라 `decorateStatic`에서 채움) | **변경**(아이콘만) | `index.html` 106행(Tech) + `decorateStatic` |
| `숙련 +${c.mastery}` (확률 내역 `mastery-term`) | 동일 | 유지 | `breakdownHTML` (390행) |

아이콘 배치 원칙: `sure_badge`는 **게이지 배지 전용**이다. 확정 강화권 아이템 아이콘 `ic('sure')`(🎯, `breakdownHTML` 374행의 `확정 강화권: ...` 줄)와 **섞어 쓰지 않는다**. `mastery`는 숙련 목록·토스트·섹션 머리에만 쓰고 확률 내역(`숙련 +N`)에는 쓰지 않는다(줄이 길어져 360px에서 넘침).

### (f) 임시 이모지 언급(주석)·트레이트 문구

| 현재 | 제안 | 판정 | 위치 |
|---|---|---|---|
| 주석 `// icon: 칩·토스트 아이콘(이모지 자리, 콘텐츠 팀 에셋이 오면 여기서 교체). desc: ...` | `// icon: 토스트·로그(textContent)용 이모지 폴백. 칩·팝오버는 ic('event_<id>')의 SVG를 쓴다. desc: 효과 문장(값 v로 만든다).` | **변경** | constants.js 348행 |
| 주석 `// 아이콘·효과음 자리 (콘텐츠 팀 에셋이 오면 여기서 교체)` | `// 아이콘 이모지 폴백(SVG가 없거나 textContent에 쓸 때). SVG는 ICON_ASSET_KEYS가 가리킨다.` | **변경** | constants.js 429행 |
| 주석 `// 게임 아이콘 id → 콘텐츠 팀 SVG 키(assets/m1-icons.js, window.M1_ICONS). 없으면 ICONS 이모지 사용` | `// 게임 아이콘 id → SVG 키(assets/m1-icons.js·m2-icons.js, window.M1_ICONS·M2_ICONS). 없으면 ICONS 이모지 사용` | **변경** | constants.js 437행 |
| 주석 `/** 토스트 문구: 시작 "🍀 이벤트 시작: 행운의 시간 — ..." ...` | 🍀 예시는 폴백이 맞으므로 `(앞 이모지는 C.ICONS 폴백)` 한마디만 보탬 | **변경** | view.js 236행 |
| 주석 `/** 아이콘 HTML: 콘텐츠 팀 SVG가 로드돼 있으면 그것을, 아니면 이모지 */` | 동일 | 유지 | view.js 10행 |
| `TRAIT_TEXT.hunt` `수동 사냥 골드 +${v}%` | 동일 | 유지 | view.js 64행 |
| `TRAIT_TEXT.work` `자동 사냥·오프라인 골드 +${v}%` | 동일 | 유지 | 65행 |
| `TRAIT_TEXT.trade` `이 검을 판매·납품할 때 골드 +${v}%` | 동일 | 유지 | 66행 |
| `TRAIT_TEXT.ore` `사냥당 광석 +${v}%` | 동일(이벤트 ore가 이쪽에 맞춤) | 유지 | 67행 |
| `TRAIT_TEXT.shard` `이 검이 파괴될 때 파편 +${v}%` | 동일 | 유지 | 68행 |
| `TRAIT_TEXT.anvil` `이 검을 모루로 강화할 때 ${v}% 확률로 내구도 보존` | 동일(이벤트 anvil이 이쪽에 맞춤) | 유지 | 69행 |
| `TRAIT_NO_ODDS_TEXT` `특성은 강화 확률에 영향을 주지 않는다` | `특성은 강화 확률에 영향을 주지 않습니다` | **변경** | view.js 72행. 해라체가 하나 섞여 있음(UI는 합니다체) |
| `SINK_TEXT.*` | 동일 | 유지 | view.js 74~80행 |
| `TRAITS[k].name`(약탈자·일꾼·상인·광부·수집가·대장장이), `TRAIT_TIER_NAME`(평범한·정교한·완벽한) | 동일 | 유지 | constants.js 217~224행 |

세 가지 통일 규칙(트레이트·이벤트 공통): 골드·광석·파편은 `X +N%`, 확률 자체는 `확률 +N%p`, 보존·면제는 `N% 확률로 …`. 이 규칙으로 현재 어긋난 곳은 위 두 줄(이벤트 ore·anvil)뿐이다.

### (g) 강화 확률 결과 분해 (2026-11-27, `m2-rebirth.md` §15.3 UI)

강화 패널 확률 내역(`#breakdown`) 아래 새 줄 `#oddsSplit`. 숫자는 모두 굴림과 같은 `chances()` 필드(`succ`·`dest`·`drop`·`stay`·`fail`·`destSaved`·`dropRelief`)에서 읽는다. 확정 시도(확정권·천장·테스트 강제)와 +20에서는 줄이 없다(확률 내역 줄이 이미 "성공 100% · 파괴 0%"라고 말함).

| 현재 | 제안 | 판정 | 위치 |
|---|---|---|---|
| (없음) | 분해 줄 `성공 N% · 파괴 N% · 하락 N% · 유지 실패 N%`, +10 미만은 `성공 N% · 파괴 N% · 실패 N%` | 신규 | `ODDS_TEXT`·`oddsSplitHTML`(view.js). 용어: 설계의 "하락 없는 실패"를 화면에서는 **유지 실패**로 줄인다(로그 `단계가 유지됩니다`와 같은 말). +10 미만은 하락이 없어 모든 실패가 유지이므로 `실패` 하나 |
| (없음) | 보조 줄 `파괴 −N%p (명성)` · `하락 −N%p (명성)` (0이면 그 조각 없음, 둘 다 0이면 줄 없음) | 신규 | 같은 함수. N = `destSaved`·`dropRelief`. 절대 감소량이라 `%p`, 부호는 −(U+2212) |
| (없음) | 안내(유지 실패가 있을 때) `하락 (N%) 시 +L로 내려갑니다. 유지 실패 (M%)는 단계가 그대로입니다.` | 신규 | `noteText`(view.js), +10 이상이고 `stay > 0`일 때만 |
| (없음) | 안내(위 + 하락 방지 주문서 켬) `하락 (N%) 시 하락 방지 주문서가 단계를 지켜 줍니다. 유지 실패 (M%)에는 쓰지 않습니다.` | 신규 | 같은 곳. 주문서는 하락 구간에서만 소모(§15.4) |
| 안내 `실패 시 (N%) +L로 하락합니다.` / `실패 시 (N%) 하락 방지 주문서가 단계를 지켜 줍니다.` | 동일 | 유지 | `noteText`. 저항이 없어 `stay = 0`이면(실패 = 하락) 그대로 |
| 결과 로그 `+L 강화 실패. 단계가 유지됩니다.` | 동일 | 유지 | `main.js` `OUTCOME_FX.fail`. +10 이상의 유지 실패도 이 결과(`'fail'`)라 같은 문장이 나온다 |
| 아이템 설명 `+10~+14에서 실패해도 하락하지 않음 (발동 시 소모)`, 트레이 `실패해도 하락하지 않음 · 발동 시 소모` | 동일 | 유지 | `C.ITEMS.keepdown.desc`·`TRAY_ROW`. "발동 시 소모"가 유지 실패에서 소모되지 않는다는 뜻을 이미 담는다 |

### 표 집계

| 구분 | 행 수 | 변경 | 유지 | 신규 |
|---|---|---|---|---|
| (a) 이벤트 효과 6 | 6 | 2 | 4 | 0 |
| (b) 이벤트 알림·표시 | 11 | 0 | 11 | 0 |
| (c) 명성 상점 | 16 | 2 | 9 | 5 |
| (d) 환생 확인 창 | 26 | 3 | 21 | 2 |
| (e) 확정 배지·숙련 | 5 | 4(전부 아이콘 추가 위주) | 1 | 0 |
| (f) 주석·트레이트 | 14 | 5 | 9 | 0 |
| (g) 강화 확률 결과 분해 | 7 | 0 | 3 | 4 |
| 합계 | 85 | 16 | 58 | 11 |

---

## 2. 아이콘 연결 매핑 (Tech 작업용)

### 2.1 game id → SVG 키

`C.ICON_ASSET_KEYS`(constants.js 438행)에 **추가**:

| game id | SVG 키 | 쓰는 곳 |
|---|---|---|
| `fame` | `fame` | 명성 잔액·구매 버튼 비용·확인 창 `얻는 명성` |
| `rebirth` | `rebirth` | [환생] 버튼, 확인 창 제목(현재는 둘 다 `ic('fame')`이므로 교체) |
| `monument` | `monument` | 기념비 칸·대표 기념비 배지 |
| `achievement` | `achievement` | 업적 섹션 머리(`업적` 앞) |
| `title` | `title` | 칭호 배지(`#titleBadge`)·기록 탭 칭호·칭호 선택줄 `칭호` 라벨 |
| `sure_badge` | `sure_badge` | 천장 게이지 `확정!` 배지 |
| `mastery` | `mastery` | 숙련 목록·섹션 머리·토스트 |
| `trait_hunt` `trait_work` `trait_trade` `trait_ore` `trait_shard` `trait_anvil` | 같은 이름 | 특성 칩·특성 행·특성 관리 |
| `event_luck` `event_hunt` `event_auto` `event_ore` `event_anvil` `event_quest` | 같은 이름 | 이벤트 칩·팝오버 |

`C.ICONS`(이모지 폴백, 429행)에 **추가**(SVG가 없을 때와 `textContent` 경로용). 제안 이모지:

| id | 폴백 |
|---|---|
| `rebirth` | `♻️` |
| `achievement` | `🏆` |
| `title` | `📛` |
| `sure_badge` | `✅` |
| `mastery` | `🎖️` |
| `event_luck` ... `event_quest` | `C.EVENTS[id].icon`과 같은 값(🍀 🏹 🌾 ⛏️ 💫 🏷️). 중복 정의를 피하려고 ICONS 정의 안에서 `...Object.fromEntries(EVENT_IDS.map(id => ['event_' + id, EVENTS[id].icon]))`로 만든다(EVENTS가 ICONS보다 위에 선언돼 있어 가능) |
| `fame`·`monument` | 이미 있음(🌟·🏛️) |
| `trait_*` | **폴백 이모지를 만들지 않는다.** 칩은 지금도 `TRAITS[k].short`(약·일·상·광·집·장) 한 글자를 쓰므로 SVG가 없으면 그 글자로 돌아간다 |

### 2.2 `C.EVENTS[id].icon` 처리 (이모지 문자열을 그대로 `${d.icon}`으로 쓰는 현재 구조)

제안: **`EVENTS[id].icon` 필드는 이모지 폴백으로 남긴다**(`test-panel.js` 42행의 `<option>`은 SVG를 못 렌더링하고, 토스트·로그는 `textContent`). 화면 HTML(칩·팝오버)만 `ic('event_' + id)`로 바꾼다. `ic()`는 SVG가 없으면 `C.ICONS[id]`(=위 폴백=같은 이모지)를 돌려주므로 SVG 파일이 늦어도 화면이 깨지지 않는다.

### 2.3 `ic()` 헬퍼 (view.js 11행)

M2_ICONS를 합쳐서 조회한다. 파일이 없는 환경(구 `test.html`, 테스트 하네스)에서도 안전해야 한다.

```js
const ICON_SVGS = Object.assign({}, root.M1_ICONS, root.M2_ICONS);   // Object.assign은 undefined 소스를 건너뛴다
const ic = id => {
  const svg = ICON_SVGS[C.ICON_ASSET_KEYS[id]];
  return svg ? `<span class="ic">${svg}</span>` : (C.ICONS[id] || '');
};
```

주의: 객체는 `view.js` 로드 시점에 한 번 만든다. 스크립트 순서는 `m1-icons.js` → `m2-icons.js` → 게임 스크립트다. 테스트 하네스(`tests/smoke-dom.js`)가 `M1_ICONS`를 컨텍스트에 싣는 방식이면 `M2_ICONS`도 같이 싣는다(없어도 폴백으로 동작).

### 2.4 스크립트 태그

| 파일 | 위치 | 변경 |
|---|---|---|
| `index.html` | 145행 `<script src="assets/m1-icons.js"></script>` 다음 줄 | `<script src="assets/m2-icons.js"></script>` 추가 |
| `test.html` | 163행 같은 자리 | 동일 추가 |
| 서비스 워커·캐시 목록이 있으면 | (grep 결과 없음) | 없음 |

### 2.5 연결 지점(grep으로 확인한 곳)

| # | 파일·함수/상수 | 지금 | 바꿀 것 |
|---|---|---|---|
| 1 | `constants.js` `ICON_ASSET_KEYS` (438행) | M1 키만 | 2.1 표의 키 추가 |
| 2 | `constants.js` `ICONS` (430행) | `monument`·`fame` 있음, 나머지 없음 | 2.1 표의 폴백 추가 |
| 3 | `view.js` `ic` (11행) | `M1_ICONS`만 | 2.3 |
| 4 | `view.js` `eventChipHTML` (199행) | `${a.def.icon}` | `${ic('event_' + a.id)}` (`a.id`는 `luckIdleText`에서 이미 쓰는 필드) |
| 5 | `view.js` `eventPopHTML` (225행) | `${a.def.icon}` | `${ic('event_' + a.id)}` |
| 6 | `view.js` `eventStartText` (239행) / `eventAssistText` (244행) | `${d.icon}` / `${C.EVENTS[LUCK_EVENT].icon}` | **그대로**(textContent) |
| 7 | `js/test-panel.js` 42행 | `${C.EVENTS[id].icon}` | **그대로**(`<option>`에는 SVG 불가) |
| 8 | `view.js` `traitChipHTML` (193행) | 글자 `<b>${short}</b>` + 점 | 3절 |
| 9 | `view.js` 특성 행 (664행) `<div class="shop-icon">${traitChipHTML(sw.trait)}</div>` | 칩 | 칩에 아이콘 포함(3절)이면 그대로. 특성 관리의 종류 목록·`rekindText` 등 이름만 쓰는 곳은 문구만 유지 |
| 10 | `view.js` `gaugeHTML` (397행) `badge good` `확정!` | 글자만 | `${ic('sure_badge')} 확정!` |
| 11 | `view.js` 같은 파일의 다른 `badge good`: 663행 `수입 검`, 730행 `특가`, 751행 `ON`, 818행 `보유` | 글자 | 아이콘 없음. **그대로** |
| 12 | `view.js` `masteryRowsHTML` (846행) | 글자만 | 줄 앞 `${ic('mastery')} ` |
| 13 | `view.js` 1038·1050·1056·1069·1071행 `ic('fame')` | 모두 fame | 1050행(버튼)·1069행(확인 창 제목)만 `ic('rebirth')`, 나머지는 `ic('fame')` 유지 |
| 14 | `view.js` 837행 `badge.textContent = top ? ``${C.ICONS.monument} +${top}`` ` | 이모지 | 다른 `setHTML` 호출처럼 `setHTML(badge, ``${ic('monument')} +${top}``)`로(`textContent` → HTML). 818·823·832행은 이미 `ic('monument')` |
| 15 | `view.js` 1114행 `monumentText` `${C.ICONS.monument}` | 토스트 | **그대로**(textContent) |
| 16 | `view.js` `achSectionHTML` (982행) 머리 `업적 <span ...>` | 글자 | `${ic('achievement')} 업적 ...` |
| 17 | `view.js` `renderTitle` (986~994행) `el.textContent = '「name」'` | 글자 | 배지는 `setHTML(el, ``${ic('title')} 「${name}」``)`로. `$('#titleBadge').title`·`#recordsTitle`도 같은 방식. 이름에 HTML 특수문자는 없으나(칭호는 상수) 그래도 `name`은 상수에서만 온다는 점 유지 |
| 18 | `view.js` `titlePickerHTML` (976행) `<span class="muted">칭호</span>` | 글자 | `${ic('title')}` 앞에 |
| 19 | `view.js` `noteText` (401행) `🏆 더 이상 강화할 수 없습니다...` | 하드코딩 이모지 | **그대로** 두거나 `C.ICONS.achievement`로(textContent) 통일. 필수 아님 |
| 20 | `view.js` `decorateStatic` (1118행~) | `#btnSettings` 등 | `#masteryHead` 같은 id를 `index.html` 숙련 `<h2>`에 달고 아이콘을 채움 |
| 21 | `css/style.css` | `.ic` 규칙 있음(M1) | M2 아이콘은 크기가 다를 수 있으므로 `.ic svg`가 `1em`으로 맞는지 확인(AD와 합의) |

---

## 3. 트레이트 등급 표시 제안

현재 `traitChipHTML`(view.js 193행): 약자 한 글자 + 세로 점 1~3개(등급만큼만 그림). 색은 등급별(`trait-t1/t2/t3`).

제안:

1. **칩 구성**: `[trait_<kind> 아이콘] + 점 3개`. 점은 **항상 3개**를 그리고 등급 수만큼만 채운다(채움 = 등급, 빈 점 = 외곽선만). 등급이 한눈에 "2/3"처럼 읽힌다.
   ```html
   <span class="trait-chip trait-t2" role="img" aria-label="정교한 약탈자">
     <span class="ic">…trait_hunt…</span>
     <span class="pips" aria-hidden="true"><i class="on"></i><i class="on"></i><i></i></span>
   </span>
   ```
2. **글자 폴백**: SVG가 없으면 `TRAITS[k].short` 글자를 아이콘 자리에 둔다(지금과 동일).
3. **텍스트는 등급 이름을 그대로 쓴다**: `traitName` = `평범한 약탈자` / `정교한 …` / `완벽한 …`. 칩의 `aria-label`과 카드 `title`에 같은 문자열. 색·점·아이콘만으로 구분하지 않는다(m2-traits §12 접근성 유지).
4. **스트립 카드(슬롯)**: `max-width:18px` 세로 칩을 유지한다. 아이콘 12px 정도 + 점 3개를 세로로 쌓는다(점 4px × 3 + 간격 = 약 14px). 360px 폭에서 카드 높이·폭이 안 늘어야 한다(m2-traits AC 51). 공간이 모자라면 슬롯 카드에서만 아이콘을 생략하고 글자(`short`)를 유지한다. 특성 행(`shop-icon`)·활성 검 패널은 아이콘을 크게 쓴다.
5. **CSS**(Tech): `.trait-chip .pips i`에 빈 점 스타일(`background:transparent; box-shadow:inset 0 0 0 1px currentColor`), `.on`이면 채움. 등급색 규칙(`trait-t2` info, `trait-t3` gold)은 유지.
6. 문구 영향: 효과 문장·토스트(`engraveToastText`의 `검에 각인: 완벽한 대장장이`)는 변경 없음.

---

## 4. 디자인 문서 수정 필요 항목

코드와 문서가 어긋난 곳, 또는 이 제안이 반영되면 고쳐야 할 문서 문장. (Tech가 아니라 리드·디자인 담당 처리.)

1. `docs/design/m2-rebirth.md` §7 확인 창 설명(143행 부근) "유지" 목록: `업적·칭호·기념비·도감·통계·설정·명성과 상점`에 **일일 과제**가 빠져 있다. 실제 `KEPT_FIELDS`(§3, 62행)에는 `daily`가 있어 유지된다. 위 (d)의 `keep` 변경을 따라 "일일 과제"를 추가.
2. `docs/design/m2-rebirth.md` §7 같은 줄, "사라짐" 목록에 `숙련은 단계별 1개만 유지`가 섞여 있다. 코드 문구를 `숙련 기록(단계별 1개만 남김)`으로 바꾸면 문서도 맞춘다.
3. `docs/design/m1.1-late-correction.md` §2 표(15행) "숙련 위치 … 파괴/판매/환생에도 유지"는 m2-rebirth §5(숙련 환생 시 단계별 1개)에 **덮어쓰인** 옛 문장이다. m2-rebirth는 "덮어씀"을 밝혔지만 m1.1 쪽에는 정정 표시가 없다 → "환생은 단계별 1개만 상속(m2-rebirth §5)" 한 줄 정정 권장. (코드는 m2-rebirth가 맞음.)
4. `docs/design/m2-events.md` §9 (298행, 이모지 목록 "지금 아이콘은 이모지 자리")와 §10 표(270행, `desc`는 "임시 문구"): 아이콘이 M2 SVG로 바뀌고 `EVENTS[id].icon`은 이모지 폴백이라는 설명, 그리고 효과 문장 확정(ore `사냥당 광석 +N%`, anvil `모루로 강화할 때 N% 확률로 내구도 보존`)으로 갱신. 같은 문서 §4 표(59~64행)의 효과 설명 열은 서술형이라 그대로 두어도 되나 ore·anvil 행이 `사냥당`·`모루로 강화할 때`로 읽히면 일관된다.
5. `docs/design/m2-traits.md` §11 (167행) "특성 칩 — 약자 한 글자와 등급 점 1~3개": 3절 제안이 채택되면 "특성 아이콘 + 등급 점 3개(채움=등급), 아이콘 없으면 약자"로 수정. 접근성 줄(175행)의 "글자(약자) 병기"는 "`aria-label`·`title`에 등급 이름 병기"로.
6. `docs/design/m2-rebirth.md` §(326~327행, Content 선택 요청): "아이콘·문구"가 이 문서로 충족됐다는 처리 표시(필수 아님).
7. `docs/design/m2-achievements.md`: **수정 없음**(업적 이름·칭호·"일일 과제" 용어는 그대로 둔다).

그 밖에 문서가 없는 사항(코드 내부 불일치, 이 문서에서 제안 처리함): 이벤트 ore·anvil 문장이 트레이트와 다름, `TRAIT_NO_ODDS_TEXT`만 해라체, `autoStart` 라벨의 "런".
