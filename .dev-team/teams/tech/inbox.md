# 개발 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 2건)

### REQ-051 [P3] 연출 중 탭이 멈추면 숙련·각인·모루 파손·해금 알림이 잠금 화면 뒤에 뜸
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-27 · 단계: 1.0.0 이후
- 우선순위 근거: 두 탭을 동시에 쓰면서 연출 도중에만 생기는 드문 경우이고 알림 표시만 어긋남(상태·저장은 정상). 출시 후 백로그

강화 연출 도중 다른 탭이 열려 이 탭이 멈추면, 연출 뒤로 미룬 숙련 기록·각인·모루 파손·해금 알림이 잠금 화면 뒤에서 뜸(업적 알림은 REQ-042에서 해결). 업적과 같은 방식(활성·보이는 상태일 때만 알리고 복귀 시 내보내기)으로 통일. 근거: 1.0.0 정리 묶음 개발 보고, V9

- 2026-11-27 메인 세션: 접수 — 우선순위 P3

### REQ-052 [P3] settleStale 이어받기 때 업적 알림 내보내기와 작은 정리
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-27 · 단계: 1.0.0 이후
- 우선순위 근거: 다른 탭이 1~2초 연출 중에 날짜를 바꾸는 드문 경우이고 알림 표시만 어긋남. 출시 후 백로그

강화 연출 중 수령이 stale로 저장을 이어받으면 대기 중인 업적 알림이 다음 복귀·강화 때까지 남아 엉뚱한 알림에 합쳐질 수 있음 → main.js settleStale에서 deferAchieved(syncAchievements(false)); if (!ui.busy) flushAchieved(). 그 밖에 settleClaim 주석(main.js:494) 갱신, run-tests.js:4501의 durationSec/60을 V.eventDurationText로, 칭호 선택 라벨(view.js:1013) 이모지 aria-hidden 여부 결정, view.js:504 payoutPreview 대체 검 객체에 주석. 근거: 1.0.0 QA 검증, V9 2회

- 2026-11-27 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (19건)

- REQ-050 [P2] 화면에 버전 표시(설정 또는 기록 탭) — 완료 (설정 팝오버 #appVersion, C.VERSION='1.0.0', VERSION 파일 일치 테스트(VERSION을 1.0.0으로 올리면 통과).)
- REQ-049 [P3] 9-2 낮음 정리: 숙련 목록 열 수·이모지 대체 읽기·남은 🏆·아이콘 개수 주석 — 완료 (숙련 목록 150px+nowrap 복원(360px은 1열 유지), aria-hidden 이모지, noteText 아이콘, 아이콘 개수 19.)
- REQ-047 [P3] 7-2 낮음 정리 모음 — 완료 (8건 모두 처리. eventDescription 제거(m2-events 문서 갱신), 천장 분기 유지+주석, incomeLabel을 C.EVENTS 데이터로.)
- REQ-042 [P2] 6-B 후속 정리: 지연된 업적 알림·연출 중 수령·남은 시간 갱신 — 완료 (js/main.js(ui.pendingAch·flushAchieved), js/view.js(.daily-left), 테스트 추가. 지연 알림은 채택 시 비우지 않고 ACH_REACHED만 필터(V9).)
- REQ-040 [P3] 5-B 정리: 연출 중 판매가 표시 시점, 수입 특성 구분을 C.TRAITS 데이터로 — 완료 (vSell 일관 표시, C.TRAITS[k].income 데이터화, TRAIT_TEXT 누락 폴백. m2-traits.md 갱신.)
- REQ-037 [P2] 예전 클라이언트가 rebirth 필드를 덮어써 명성을 잃지 않게 보호 — 완료 (8-B: 미러에 mark(환생 직후 nextSwordId) 기준값 추가, 횟수 낮춤 방지(새 게임만 초기화), 8-A 미러는 횟수만으로 채택(호환). 문서 m2-rebirth §8.2, m1-storage. 테스트 run-tests 505. 알려진 잔여: 새 게임 저장 실패 시 미러 미초기화(표식 있는 미러는 새 게임에 채택되지 않음, 8-A 미러는 가능).)
- REQ-034 [P1] M2 구현: 특성·골드 사용처(5단계), 업적·일일 과제(6), 시간 이벤트(7), 환생(8) — 완료 (M2 구현 완료: 5단계 특성·사용처, 6단계 업적·일일, 7단계 이벤트, 8단계 환생, 9단계 화면·아이콘, 1.0.0 정리 QA 승인(2026-11-27))
- REQ-033 [P3] sim-late 후보 A/B가 게임의 게이지·숙련과 이중으로 계산됨 — 완료 (tools/sim-late/lib/mechanics.js: A/B 켜면 게임 gauge/mastery 입력 0으로 중화. selfcheck 블록 H 6건 추가(19).)
- REQ-031 [P2] 저장 안전 마무리: 원문 칸 입력 중 단축키, 모바일 헤더 높이, 헤더 줄바꿈 범위, 읽기 실패 처리 — 완료 (텍스트 입력 칸 단축키 무시, 보호 모드 헤더(줄바꿈 범위·모바일 비고정·원문 칸 120px), 읽기 실패 시 보호 유지. QA 승인 2026-11-19)
- REQ-030 [P3] smoke-dom.js의 REQ-012 주석 위치 정리 — 완료 (smoke-dom.js 주석 위치 정리. QA 승인 2026-11-19)
- REQ-027 [P3] main.js의 tabGuard를 persist·resume보다 먼저 정의 — 완료 (tabGuard를 persist·isSuspended보다 먼저 생성. QA 승인 2026-11-19)
- REQ-025 [P3] 실제 브라우저 클릭·드래그 회귀 테스트 추가 + 3-6 낮음 문제 — 완료 (tests/browser-strip.js(헤드리스 Chrome/Edge 실제 클릭·드래그·밖에서 놓기 14개), 빈 강화 영역 문구 단일화(S6), 가장자리 자동 스크롤 rAF 반복(S7). QA 승인 2026-11-19)
- REQ-024 [P3] tools/sim-late가 '활성 검 없음' 상태에서 오류로 멈춤 — 완료 (engine.js가 활성 검이 없으면 최고 단계 검을 다시 활성화. selfcheck 통과. QA 승인 2026-11-19)
- REQ-021 [P3] tools/sim-late가 F16 새 옵션(gaugeFull, mastery)을 반영하지 않음 — 완료 (mechanics.js·profiles.js가 R.enhanceOpts(S)로 확률 옵션을 만듦, selfcheck 블록 G 추가(13개 통과). QA 승인 2026-11-19)
- REQ-020 [P1] F16 QA 후속 수정: gaugeFull 잠금 알림 문구 외 정리 — 완료 (gaugeFull 문구 추가, GAUGE_TO/MASTERY_TO 유도, 중복 정리, 모바일 버튼 넘침 수정(css/style.css). 테스트 5종 통과. 상세는 tech/worklog.md)
- REQ-017 [P1] F16 천장 게이지·단계 성공 숙련 구현 — 완료 (구현 완료. 변경: js/constants.js, rules.js, save.js, view.js, main.js, index.html, test.html, css/style.css, tests/run-tests.js, tests/smoke-dom.js. 테스트 164/116/29/36 전부 통과. 브라우저 모바일 확인은 QA 필요.)
- REQ-014 [P3] 테스트 페이지 소소한 개선 (확정 강화권 소모, 설정 플래그 주석) — 완료 (강제 성공 시 확정 강화권 미소모와 효과음 생략, SG.config 테스트 전용 주석. QA 승인 2026-11-19)
- REQ-012 [P2] M1 잔여 개선 사항 (QA 권장 수정 묶음) — 완료 (항목 1, 3~12와 13의 setSeal 분리를 완료했다. QA 승인(2026-11-19, 사이클 1). 항목 2는 3-4 REQ-013으로, rules.js 책임 분리는 M2로 넘겼다. 새 파일 js/tab-guard.js)
- REQ-009 [P1] 저장 데이터 버전 이전 (sword-enhance-v1 → 새 구조) — 완료 (js/save.js migrate() 구현, tests/run-tests.js에서 v1 여러 형태·손상 데이터·v1 키 보존 검증)
