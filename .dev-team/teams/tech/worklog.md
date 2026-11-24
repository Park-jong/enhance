# 개발 팀 업무 기록

> 관리: 개발 팀장. 작업이 끝날 때마다 맨 아래에 추가한다.

## 2026-11-17 — M1 콘텐츠 확장 구현 (F1~F10, F15)
- 지시: 디렉터 / 관련 마일스톤: M1 콘텐츠 확장 / 처리한 요청: REQ-009
- 참여 팀원: client-programmer
- 산출물: `index.html`, `css/style.css`, `js/constants.js`, `js/rules.js`, `js/forge.js`, `js/idle.js`, `js/quests.js`, `js/save.js`, `js/audio.js`, `js/fx.js`, `js/view.js`, `js/main.js`, `tests/run-tests.js`, `tests/smoke-dom.js`
- 결정 사항: file:// 호환을 위해 클래식 script 여러 개로 분리(window.SG 네임스페이스 + node export), 규칙 모듈은 시계/난수/저장소 주입. 사냥·자동·오프라인은 topLv(보관함 최고 단계) 기준. 콘텐츠 에셋(M1_ICONS/M1_SFX)은 조회 테이블로 연결, 없으면 이모지/합성음 대체.
- 남은 문제: 브라우저 실기(레이아웃, 애니메이션, 소리, 터치) 미확인. 보호로 막힌 파괴가 통계상 실패로 집계되지 않음(보정 +1은 적용). 기획 문서에 없는 상수 추가분 반영 요청 필요.

## 2026-11-17 — M1 QA 수정 1차
- 지시: 디렉터 / 관련 마일스톤: M1 / 처리한 요청: (QA 변경 요청)
- 참여 팀원: client-programmer
- 산출물: js/view.js, js/main.js, js/save.js, js/rules.js, js/quests.js, js/idle.js, js/audio.js, js/constants.js, index.html, css/style.css, tests/*
- 결정 사항: 다중 탭은 "마지막 기록 탭이 이어받기" 방식의 잠금 오버레이로 처리. 의뢰 보상 id는 풀 기준으로 재계산. 손상 v2 저장은 `sword-enhance-v2-corrupt`로 백업.
- 남은 문제: 실제 브라우저에서 두 탭/손상 저장 확인 필요. 보류한 should-fix(파티클 상한, 중복 정리, setSeal 분리 등)는 별도 P2.

## 2026-11-17 — M1 QA 수정 2차
- 지시: 디렉터 / 관련 마일스톤: M1
- 참여 팀원: client-programmer
- 산출물: js/main.js, js/save.js, js/rules.js, js/view.js, index.html, tests/run-tests.js, tests/smoke-dom.js
- 결정 사항: 다른 탭 저장 채택 시 자동 사냥 타이머 재설정(이중 지급 방지), SV.peek(읽기 전용) 도입, 손상 v2 백업은 1회만 기록(AC 18), 잠금 중 header/main inert, 상한 문구 "일부 효과 없음" 추가.
- 남은 문제: QA의 run-m1-round2-tests.js:304-310이 구 규칙(최신 덮어쓰기)을 기대해 1건 실패 — QA 갱신 필요.

## 2026-11-17 — 강화 100% 테스트 페이지
- 지시: 디렉터(사용자 요청) / 관련 마일스톤: M1
- 참여 팀원: client-programmer
- 산출물: test.html, js/test-mode.js, js/test-panel.js, css/test-mode.css, (수정) js/constants.js, rules.js, save.js, view.js, main.js, tests/run-tests.js, tests/smoke-dom.js
- 결정 사항: SG.config(saveKey, legacySaveKey, forceSuccess)로 주입, chances()에 가드 1곳. 테스트 저장 키 sword-enhance-test, v1 미읽기. test.html은 index.html 마크업 복사(드리프트 가드 테스트 있음).
- 남은 문제: 토글 상태는 저장되지 않음. 실제 브라우저 두 탭 확인은 QA 필요.

## 2026-11-18 — F16 후반 강화 보정 (천장 게이지 + 성공 숙련)
- 지시: 디렉터 / 관련 마일스톤: M1.1 / 처리한 요청: REQ-017
- 참여 팀원: client-programmer
- 산출물: js/constants.js, rules.js, save.js, view.js, main.js, index.html, test.html, css/style.css, tests/run-tests.js(164), tests/smoke-dom.js(116). QA 테스트 파일은 무수정, 29/36 통과.
- 결정 사항: enhanceOpts(S)로 시도/화면/안내가 같은 옵션 사용. 천장 가득 시 모든 토글 gaugeFull 잠금(저장된 use 값 유지). 테스트 페이지 강제 성공은 gauge/mastery 갱신을 건너뜀. 토스트는 이번 기록의 증가량 표시. 기록 탭은 +15 도달 전에도 5행 표시. 수치는 시뮬레이션 미검증(설계 문서 명시).
- 남은 문제: 실제 브라우저/모바일 폭(320~720px) 확인 필요(QA). 토스트 표기, 기록 탭 표시 시점, 테스트 저장의 필드 추적은 설계 확인 필요.

## 2026-11-18 — F16 QA 후 수정 (REQ-020)
- 지시: 디렉터 / 관련 마일스톤: M1.1 / 처리한 요청: REQ-020
- 참여 팀원: client-programmer
- 산출물: js/view.js(REASON.gaugeFull 추가, TRAY_REASON이 재사용, #gaugeLine 중복 조회 제거), js/constants.js(GAUGE_TO/MASTERY_TO를 배열 길이에서 유도 + 길이 불일치 시 throw), css/style.css(중복 color 제거, 520px 이하 .actions 버튼 줄바꿈/축소)
- 결정 사항: 모바일 breakpoint는 420px가 아니라 520px(421px에서 극단값 넘침 확인, .info 2열 전환폭과 동일). 320/360/390/520/521/720/1280px 헤드리스 Chrome에서 넘침 0. rules.js 이름 변경은 위험 대비 이득이 적어 생략. tools/ 미변경(REQ-021 제외). 테스트 5종 통과: 164 / 116 / 29 / 36 / 189.
- 남은 문제: 320px에서 사냥 보상 8자리 이상이면 숫자 중간에서 줄바꿈(실제 값 ~10만 수준이라 안전망으로 둠). 커밋 안 함.

## 2026-11-19 — 보관함·화면 사용성 수정 (TODO 3-6)
- 지시: 디렉터(사용자 요청) / 관련 단계: 3단계 3-6 / 처리한 요청: 없음
- 참여 팀원: client-programmer
- 산출물: js/constants.js, rules.js(activeSword null, removeSword pickNext, moveSword), save.js, view.js, main.js, js/strip-drag.js(신규), index.html, test.html, css/style.css, tests/run-tests.js(183), tests/smoke-dom.js(149)
- 결정 사항: 파괴 시에만 활성 검 없음(S.active=0), 판매/납품은 기존대로 최고 검 자동 선택. 드래그는 Pointer Events(마우스 6px, 터치 롱프레스 300ms, 가장자리 자동 스크롤). .play 래퍼로 sticky 범위 제한. Q.candidate는 id 정렬이라 배열 순서와 무관(bestSword 동률만 영향).
- 남은 문제: QA 테스트 4건이 구 규칙 기대로 실패(run-m1-qa-tests.js:145,301,305, run-m1.1-qa-tests.js:546), 수정하지 않음. m1-storage/constants-index/overview 문서 갱신 필요. 커밋 안 함.

## 2026-11-19 — 보관함·화면 사용성 수정 2차 (TODO 3-6, QA 수정 지시)
- 지시: 디렉터(QA 수정 지시 M1, S1~S5) / 관련 단계: 3단계 3-6 / 처리한 요청: 없음
- 참여 팀원: 기술 팀장이 직접 수정(소규모 수정이라 팀원 호출 생략)
- 산출물: js/strip-drag.js, js/main.js, js/save.js, tests/run-tests.js(189), tests/smoke-dom.js(152)
- 결정 사항: M1 마우스/펜은 pointerdown에서 strip 포인터 캡처 + move에서 buttons 미눌림이면 취소(cancel). S1 드래그 중 Space/S 무시, onEnd는 busy면 드롭 취소. S2 begin()에서 카드가 분리되면 data-sword로 재조회, 없으면 중단. S3 pointerup 후 setTimeout(0)으로 swallowClick 해제. S4 createStripDrag가 {cancel} 반환, 이어받기/탭 정지/새 게임에서 호출. S5 Number.isInteger(d.active) 요구. 기존 테스트 'active and anvilEq are coerced'는 active '2'를 2로 기대했으나 S5와 충돌해 최고 검(1) 기대로 변경.
- 남은 문제: S6, S7, 문서, tools/sim-late는 제외(타 팀). 커밋 안 함.

## 2026-11-19 — 3-6 3차 수정 (H1: 마우스 클릭 활성화 복구)
- 지시: 디렉터(QA 수정 지시 H1, V3) / 관련 단계: 3단계 3-6 / 처리한 요청: 없음
- 참여 팀원: client-programmer
- 산출물: js/strip-drag.js (pointerdown의 마우스·펜 setPointerCapture 제거, begin()의 캡처만 유지)
- 결정 사항: 포인터 캡처 시 Chrome이 click을 #strip으로 재지정해 data-act 위임이 죽던 문제 해결. 실제 Chrome CDP(cdp2.js)로 확인: 3번째 카드 클릭 시 활성 1→3, 1번 카드를 3번 뒤로 드래그하면 순서 2,3,1,... 및 활성 유지, 스트립 밖 릴리스 후 .dragging/.drag-on 없음. 테스트 run-tests 189, smoke-dom 152, m1-qa 29, round2 36, m1.1-qa 189 통과. stub로 클릭 재지정을 볼 수 없어 smoke-dom 검사는 추가하지 않음.
- 남은 문제: 임계값 전에 스트립 밖에서 버튼을 떼면 제스처가 대기 상태로 남으나 무해(다음 pointermove/pointerdown에서 정리). 커밋 안 함.

## 2026-11-19 — REQ-012 M1 QA 권장 수정 묶음 (3-3)
- 지시: 디렉터 / 관련 단계: 3단계 3-3 / 처리한 요청: REQ-012 (항목 1,3~12, 13 중 setSeal만. 진행 중 상태 유지)
- 참여 팀원: client-programmer
- 산출물: js/tab-guard.js(신규), js/main.js, save.js, rules.js, idle.js, view.js, fx.js, constants.js, css/style.css, index.html, test.html, tests/run-tests.js(208), tests/smoke-dom.js(182)
- 결정 사항: 저장소 clear 이벤트는 storageArea가 같거나 없을 때 잠금(기존 스모크 5g 유지). 의뢰 탭 배지는 납품 가능 개수. backedUp은 keptAt에서 파생해 외부 계약 유지. setUse는 토글 전용, 인장은 setSeal. MAX_PARTICLES=400. 테스트: run-tests 208, smoke-dom 182, m1-qa 29, m1.1-qa 189 통과, round2 34/36.
- 남은 문제: QA 소유 round2 테스트 2건(main.js wiring, AC 17)이 main.js 소스 문자열을 검사해 탭 가드 분리로 실패 → QA 갱신 필요. tools/sim-late/selfcheck는 HEAD에서도 실패(REQ-024). 항목 2는 REQ-013, rules.js 분리는 M2. 설계 문서 3건 갱신 필요(m1-overview 73행 배지, constants-index MAX_PARTICLES, m1-storage 빈 v2/clear). 커밋 안 함.

## 2026-11-19 — 대장간 탭 파편 교환 섹션 상시 표시
- 지시: 디렉터 / 관련 단계: 3단계 (플레이테스트·M1 잔여) / 처리한 요청: 없음
- 참여 팀원: client-programmer
- 산출물: js/view.js(renderForge: showExchange 조건 제거, 파편 0개일 때 panel-note 안내), tests/smoke-dom.js(forgeShardExchange 5건 추가, 187)
- 결정 사항: 규칙(R.exchangeBlock) 변경 없음. 파편 0개면 버튼 비활성 + "검이 파괴되면 파편을 얻습니다." 안내. 5개 스위트 통과(208/187/29/36/189).
- 남은 문제: docs/design/m1-overview.md 41행이 옛 규칙(첫 파편 획득 시)을 서술 → 설계 갱신 필요. 실제 브라우저 확인은 안 함. tools/sim-late/selfcheck는 기존 실패(REQ-024). 커밋 안 함.

## 2026-11-19 — REQ-014 강제 성공 시 확정 강화권 미소모
- 지시: 디렉터 / 관련 단계: 3단계 3-5 / 처리한 요청: REQ-014 (in_progress, QA 검증 대기)
- 참여 팀원: client-programmer
- 산출물: js/rules.js (attemptEnhance: `use.sure && !ch.forced`일 때만 소모), js/test-mode.js·rules.js 주석(테스트 페이지 전용), tests/run-tests.js (+3건, 211)
- 결정 사항: 강제 성공 후에도 확정 강화권 토글은 켜진 채 유지(미소모이므로 자동 해제 없음). 토글 비저장·잠금 동작은 변경 없음. 5개 스위트 통과(211/187/29/36/189).
- 남은 문제: 강제 성공 시 r.used.sure가 true라 main.js:188에서 useSure 효과음이 재생됨(범위 밖, 디렉터 결정 필요). tools/sim-late/selfcheck.js가 profiles.js:12(activeSword null)에서 기존부터 크래시(V2 잔존).

## 2026-11-19 — 3-4 저장 안전 구현 (보호 모드·지속 배지·peek 변경·잠금 문구)
- 지시: 디렉터 / 관련 단계: 3단계 3-4 / 처리한 요청: REQ-013, REQ-012 항목 2, REQ-028 (기획 팀 요청이라 상태 변경 권한 없음 — 디렉터가 기록)
- 참여 팀원: client-programmer
- 산출물: js/save.js (createSaveKeeper, peek 새 형태), js/main.js, js/view.js, index.html, test.html, css/style.css, tests/run-tests.js (221), tests/smoke-dom.js (257)
- 결정 사항: 저장 키 쓰기는 keeper.save 단일 관문. 보호 모드/배너/배지 구현. 5개 스위트 중 4개 통과, run-m1.1-qa-tests는 188/1 실패(QA 소유 648-649행이 옛 peek 형태 사용).
- 남은 문제: QA 테스트 수정 필요(`SV.peek(...).state.gauge/mastery`). 구현자 가정 7건 기획 확인 필요. tools/sim-late/selfcheck.js 기존 크래시(V2 잔존).

## 2026-11-19 — 저장 안전 마무리 (REQ-031) 및 정리 (REQ-027, REQ-030)
- 지시: 디렉터 / 관련 단계: 3단계 / 처리한 요청: REQ-031, REQ-027, REQ-030 (모두 in_progress 유지, QA 판정 대기)
- 참여 팀원: client-programmer
- 산출물: js/main.js, js/save.js, css/style.css, tests/run-tests.js, tests/smoke-dom.js
- 결정 사항: 읽기 예외 시 checkStored는 아무것도 바꾸지 않고 보호 유지(peek.readFailed). 텍스트 입력 대상(textarea, select, contenteditable, 텍스트류 input)에서는 단축키·Escape 무시. 모바일(720px 이하) 보호 모드는 헤더 비고정 + 원문 칸 120px 제한. 헤더 줄바꿈은 .save-guarded 안에서만. tabGuard는 persist보다 앞서 생성.
- 테스트: run-tests 226, smoke-dom 285, qa 29, round2 36, m1.1 189 모두 통과. QA 소유 테스트 수정 필요 없음.
- 남은 문제: tools/sim-late/selfcheck.js는 기존 REQ-024 문제로 실패(이번 변경과 무관). 설계 문서(m1-storage.md)에 readFailed·모바일 헤더 반영 필요(Design).

## 2026-11-19 — 보관함 브라우저 테스트와 S6/S7 정리 (REQ-025)
- 지시: 디렉터 / 관련 단계: 3단계 잔여 / 처리한 요청: REQ-025 (in_progress 유지, QA 판정 대기)
- 참여 팀원: client-programmer
- 산출물: tests/browser-strip.js (신규, 14 통과), js/strip-drag.js (S7 rAF 자동 스크롤, lostpointercapture), js/view.js (S6 NO_ACTIVE_TEXT 단일화), index.html, test.html, tests/smoke-dom.js (299)
- 결정 사항: 브라우저 없으면 SKIP 후 exit 0, 잘못된 BROWSER_PATH는 exit 1. 자동 스크롤은 프레임당 12px(설계 문서 서술과 일치). REASON.noActive 문구에서 "먼저" 삭제(공통 상수 사용).
- 테스트: run-tests 226, smoke-dom 299, qa 29, round2 36, m1.1 189, browser-strip 14 모두 통과. Chrome과 Edge 모두 확인.
- 남은 문제: tools/sim-late/selfcheck.js는 기존 REQ-024 문제로 실패. 이전 QA가 남긴 헤드리스 Edge 프로세스(약 8개, 포트 9333)가 실행 중일 수 있음.

## 2026-11-19 — sim-late 도구 확률 옵션 동기화와 활성 검 없음 처리
- 지시: 디렉터 / 관련 단계: 3단계 잔여 / 처리한 요청: REQ-021, REQ-024 (in_progress, 디렉터 확인 후 done)
- 참여 팀원: 없음 (소규모라 팀장이 직접 수정)
- 산출물: tools/sim-late/lib/mechanics.js, lib/profiles.js, lib/engine.js, selfcheck.js
- 결정 사항: 확률 계산을 R.enhanceOpts(S) 기반(토글만 덮어씀)으로 바꿔 게임과 옵션이 어긋나지 않게 함. 파괴 후 활성 검이 없으면 profile.manage 전에 최고 검을 활성화. selfcheck에 게임 옵션 일치 검사(G) 추가. selfcheck 13건, 테스트 6개 파일 모두 통과.
- 남은 문제: 도구의 자체 게이지/숙련 상태(S._gauge, S._mastery)는 게임 S.gauge/S.mastery와 별개라, 게임 상태 동기화가 필요하면 별도 작업.

## 2026-11-19 — 우측 탭 패널 카드 넘침 수정
- 지시: 디렉터 / 관련 단계: 4단계 전 버그 수정 / 처리한 요청: 없음
- 참여 팀원: tools-engineer
- 산출물: css/style.css (`.side > * { flex-shrink: 0; }`), tests/browser-strip.js (시나리오 d 추가, 14 -> 44건)
- 결정 사항: min-height:120px로 자동 최소 높이가 빠져 카드만 눌리던 것이 원인. 자식이 줄지 않게 하고 .side가 스크롤하도록 함. 모바일/보호 모드 규칙은 그대로. 수정 전 12건 실패, 수정 후 전부 통과. 6개 테스트 파일 모두 통과.
- 남은 문제: 없음

## 2026-11-20 — 5-A 특성(F14)·골드 싱크 규칙/저장 계층 구현
- 지시: 디렉터 / 관련 단계: 5단계 5-A / 처리한 요청: REQ-034 (in_progress 유지: 6~8단계 남음)
- 참여 팀원: client-programmer
- 산출물: js/constants.js, rules.js, idle.js, forge.js, quests.js, save.js, main.js, view.js, tests/run-tests.js(226→287), tests/smoke-dom.js(299→310)
- 결정 사항: 정수 헬퍼 traitScaled(v=0이면 기존 식 그대로)로 §3.1 준수. payWithSeal이 payoutPreview를 호출해 미리보기=지급 보장. 시드 700회 골든 다이제스트(rng 2362회)가 변경 전후 동일. 각인은 resume()에서 정산 전에 수행. setTrait은 test-mode.js 로드 순서상 노출 불가(SG.rules.setTrait 콘솔 사용).
- 남은 문제: QA 소유 run-m1.1-qa-tests.js:586이 trait:null 기대값 갱신 필요(188/189). UI는 5-B. 기획서 불일치(§4 vs §3.1 부동소수, AC15 하락 조건, m1-storage §2 요소 정의) 기획팀 피드백 필요.

## 2026-11-23 — 5-B 특성·골드 사용처 UI
- 지시: 디렉터 / 관련 단계: 5단계 5-B / 처리한 요청: REQ-034 (in_progress 유지, QA 검증 대기)
- 참여 팀원: client-programmer
- 산출물: js/view.js, main.js, forge.js(orePerHunt), constants.js(ICONS.monument), test-panel.js, index.html, test.html, css/style.css, tests/run-tests.js(288), tests/smoke-dom.js(380), tests/browser-strip.js(91)
- 결정 사항: 모든 표시값은 rules 헬퍼(payoutPreview, incomeTraitValue, *Block/*Cost, orePerHunt)로만 계산. 종류 변경·등급 올리기·기념비 모두 2회 클릭 확인, 강화 연출 중 비활성, 활성 검 변경·강화 시 확인 상태 해제. 각인 섹션은 대장간 탭 상단(활성 검 대상), 기념비는 기록 탭. 테스트 패널은 레벨 설정 컨트롤이 없어 commit마다 engravePending 실행(가정). 7개 검사 모두 통과(팀장 재실행 확인).
- 남은 문제: smoke-dom이 팀장 재실행 첫 회에 1회 실패(traitsUi 787행 근처, 이후 7회 연속 통과) — 간헐 실패 가능성, QA가 확인 필요. +19/+20 기념비 가격이 모바일에서 두 줄로 줄바꿈. 기획 문서에 최종 UI 문구 기록 필요.

## 2026-11-23 — 5-B 수정 사이클 2 (QA 요청)
- 지시: 디렉터(QA 수정 지시) / 관련 단계: 5단계 5-B / 처리한 요청: REQ-034 (in_progress 유지)
- 참여 팀원: client-programmer
- 산출물: js/view.js, js/main.js, tests/smoke-dom.js (388)
- 결정 사항: 최고 등급은 잠금 사유와 무관하게 "최고 등급" 비활성 표시(V7), 바쁨 테스트는 Math.random 고정으로 결정적화(20회 연속 통과, V6), 탭 전환 시 disarmSinks, 기념비 골드 부족 사유 한 줄, 미사용 export 제거.
- 남은 문제: 기념비 사유는 칸 안이 아닌 격자 아래 한 줄. 기록 탭 새 줄의 눈 확인은 하지 않음.

## 2026-11-23 — 6-A 업적(F12)·일일 과제 규칙/저장 계층
- 지시: 디렉터 / 관련 단계: 6단계 6-A / 처리한 요청: REQ-034 (in_progress 유지, 6-B UI·7~8단계 남음)
- 참여 팀원: client-programmer
- 산출물: js/achievements.js(신규, SG.ach), constants.js, rules.js, idle.js, save.js, main.js, index.html, test.html, tests/run-tests.js(288→357), tests/smoke-dom.js(388→406), docs/design/m1-storage.md(필드 행만)
- 결정 사항: 기존 게임 rng(Math.random)를 그대로 주입하고 새 세트 생성 시에만 정확히 9회 호출(잠김·같은 날·역행·badClock은 0회). refreshDaily는 resume과 매 tick, syncAchievements는 afterChange·resume. 수령은 afterChange로 즉시 저장. stale 시 저장본이 더 새로울 때만 이어받음. eventsSeen 통계 키 추가(F13 훅). 토스트는 6-B로 미룸. 7개 검사 통과(run-tests 357, smoke 406, QA 29/36/189, browser-strip 91, selfcheck 13), QA 소유 테스트 수정 불필요.
- 남은 문제: m1-storage.md §3 JSON 예시 블록에 M2 필드 누락(기획팀 정리 필요). 기획서 §1/§13/§14는 통계 키 6개로 표기(코드는 eventsSeen 포함 7개). UI·토스트는 6-B.

## 2026-11-23 — 6-A 수정 사이클 2 (QA 요청 C1~C6)
- 지시: 디렉터(QA 수정 지시) / 관련 단계: 6단계 6-A / 처리한 요청: REQ-034 (in_progress 유지)
- 참여 팀원: client-programmer
- 산출물: js/achievements.js, main.js, constants.js, save.js(통계 키 가드), tests/run-tests.js(364), tests/smoke-dom.js(412)
- 결정 사항: 먼 미래 시계(day > DAILY_MAXDAY_CAP)는 badClock. stale 시 이어받기 후 새 세트가 생기면 즉시 저장(resume 경유 안 함: 낡은 세트 덮어쓰기 방지). claimAll은 stale:true 반환, 저장하지 않음. dailyKeyOf는 정규 정수만 변환. 로드 가드 보강(save.js 포함). 클릭당 peek 1회. 7개 검사 통과(smoke 12회 반복).
- 남은 문제: 기획서 §9.2/AC10c(badClock 범위)·§10 claimAll stale 반영 필요(기획팀).

## 2026-11-23 — 6-B 기록 탭 업적·일일 과제 화면
- 지시: 디렉터 / 관련 단계: 6단계 6-B / 처리한 요청: REQ-034 (in_progress 유지)
- 참여 팀원: client-programmer, tools-engineer
- 산출물: js/achievements.js(미리보기·msToNextDay 순수 함수), js/view.js, js/main.js(syncAchievements 헬퍼·토스트), css/style.css, index.html, test.html, tests/run-tests.js(372), tests/smoke-dom.js(463), tests/browser-strip.js(149, 시나리오 h)
- 결정 사항: 로그는 기념비와 업적 사이로 배치, 강화 중 업적 토스트는 결과 공개 후 표시, 신규 세트 토스트는 생성 시마다(새 저장은 잠금이라 첫 로드 제외), 모두 받기는 합산 토스트 1개.
- 남은 문제: 강화 애니메이션 중 기록 탭 점이 먼저 뜰 수 있음. 설계서 §10.3에 모두 받기·noDaily 문구 추가 필요(기획팀).

## 2026-11-23 — 7-1 시간 이벤트 규칙·저장·틱 연결 (UI 제외)
- 지시: 디렉터 / 관련 단계: 7단계 7-1 / 처리한 요청: REQ-034 (in_progress 유지, 7-2 남음)
- 참여 팀원: client-programmer(규칙 A, 저장·틱 B, 규칙 테스트, smoke 테스트 — 4회 호출)
- 산출물: js/events.js(신규), js/constants.js, rules.js, idle.js, forge.js, quests.js, save.js, main.js, index.html, test.html, docs/design/m1-storage.md, tests/run-tests.js(423), tests/smoke-dom.js(495)
- 결정 사항: events.js는 constants만 의존하므로 constants 바로 뒤·rules 앞에 로드(기획서 §18과 다름). catch-up은 opts {noEvent} 인자로 제외. resume은 eventLastMono만 리셋하고 eventLastWall은 유지(AC 22a 유지 위해). 이벤트 없음 경로는 구 모듈과 비교한 고정 시드 동일성 검사(23만 건)와 테스트로 확인.
- 남은 문제: run-m1.1-qa-tests.js:677 VM 로더에 events.js 추가 필요(QA 소유, 21건 실패). 기획서 §18 로드 순서·§6.2 반환형·AC13 예시(숙련 4=최대라 검증 불가) 정정 필요. sinceMs가 활성 중 최대 +2초 상한 초과(무해).

## 2026-11-23 — 7-2 시간 이벤트 화면 (칩·팝오버·확률 내역·토스트)
- 지시: 디렉터 / 관련 단계: 7단계 7-2 / 처리한 요청: REQ-034 (7단계 완료, 8단계 남음)
- 참여 팀원: client-programmer(구현, 테스트), tools-engineer(브라우저 시나리오 i)
- 산출물: js/view.js, main.js, constants.js(EVENTS.icon·집합 동일성 검사), events.js(sinceMs 상한), test-panel.js, css/style.css, index.html, test.html, docs/design/m2-events.md(§9, §6.2 sinceMs 두 줄), tests/run-tests.js(443), tests/smoke-dom.js(579), tests/browser-strip.js(287)
- 결정 사항: sinceMs는 스폰 시 리셋이 아니라 누적 중 상한 클램프(스폰 시점·rng 열 불변). 클릭으로만 팝오버 토글(호버은 title만). 720px 이하에서 팝오버는 헤더 마지막 줄. 이름은 520px 이하에서 시각적으로만 숨김. 이벤트 토스트는 로그에도 기록. "이벤트 끝내기"는 남은 1ms로 두어 실제 종료 경로를 탐.
- 남은 문제: 효과 없음(천장) 문구는 현재 상수로 도달 불가(0건/전수 검사). test-panel startEvent가 잘못된 id에서 TypeError(선택지가 유효 id만이라 실사용 영향 없음). 아이콘은 이모지 임시.

## 2026-11-24 — 7-2 2차 수정 (QA 지적 4건)
- 지시: 디렉터 / 관련 단계: 7단계 7-2 / 처리한 요청: REQ-034 (유지)
- 참여 팀원: client-programmer
- 산출물: css/style.css(.event-wrap flex-shrink:0), tests/browser-strip.js(369: 721/760 스트레스, 헤더 항목 겹침 검사, 721~1000 1px 스윕), docs/design/m2-events.md(§11 icon, §18 test-panel.js), docs/design/m2-rebirth.md(같은 오기 정정), index.html·test.html·js/view.js·js/main.js(aria-haspopup=dialog, aria-expanded), tests/smoke-dom.js(582)
- 결정 사항: 칩 래퍼가 줄지 않게 함. aria-expanded는 렌더 외에 closeEventPop에서도 즉시 갱신. 겹침 721/760/800/1000 = 0 (수정 전 13.8/5.5/0/0).
- 남은 문제: 칭호 배지까지 전부 표시 시 721~723px에서 1~4px 가로 넘침(겹침 없음, 로고 세로 줄바꿈 등 이미 깨진 상태). 헤더 레이아웃 결정 필요(기획).

## 2026-11-24 — 8-A 환생 규칙·명성 상점·저장 (UI 제외)
- 지시: 디렉터 / 관련 단계: 8단계 8-A / 처리한 요청: REQ-037 (미러 키로 처리, QA 검증 대기)
- 참여 팀원: client-programmer
- 산출물: js/rebirth.js(신규), constants.js, rules.js(fameValue·earlyIncomePct·면허), idle.js(초반 수입), save.js(normRebirth·미러 키), main.js(rebirth·buyFame 액션), index.html, test.html, docs/design/m2-rebirth.md(§8.2 등), m1-storage.md, tests/run-tests.js(493), tests/smoke-dom.js(595), tests/run-m1.1-qa-tests.js(로더 1줄, QA 소유)
- 결정 사항: 미러 채택은 count만 비교(fame 동률 비교 시 정당한 구매가 되돌려짐). 새 상태는 defaultState 기반 + 표 구동 테스트. fameValue는 로드 순서상 rules.js에 둠. count/fame 런타임 상한 추가(V8).
- 남은 문제: 신규 게임 저장 성공 후 미러 쓰기만 실패하면 다음 로드가 옛 rebirth 재채택(희귀). 환생 중 강화 연출 차단 안 함. 사유 문구는 8-B. QA 소유 파일 한 줄 수정 알림 필요.

## 2026-11-24 — 8-B 환생 화면·확인 창 + REQ-037 잔여 틈
- 지시: 디렉터 / 관련 단계: 8단계 8-B / 처리한 요청: REQ-037(done), REQ-045(done)
- 참여 팀원: client-programmer(화면·미러·문서·테스트), tools-engineer(문서 드리프트, 브라우저 시나리오 j)
- 산출물: js/view.js, main.js, rebirth.js, rules.js, save.js, constants.js, css/style.css, index.html, test.html, docs/design(m2-rebirth §3·§4·§7.1·§8.2·§11, m1-storage, m1-idle, m1-overview, m1-constants-index, m2-achievements, m2-events), tests(run-tests 505, smoke 639, browser-strip 690, QA 29/36/189, selfcheck 13)
- 결정 사항: 미러 mark는 환생 직후 nextSwordId(같은 횟수에서는 고정), mark 없는 8-A 미러는 횟수만으로 채택. 새 게임만 미러를 낮춤(save opts.newGame). 확인 창은 #modal 재사용, 초점은 취소 버튼, 확인 창 중 Space/S/H 무시. 환생 시 busy 무시.
- 남은 문제: 새 게임 저장 실패 시 미러 미초기화(8-A 미러만 영향). 명성 아이콘·확인 창 문구는 임시. TODO.md 189행 미러 서술 갱신 필요.

## 2026-11-24 — 8-B 환생 화면 2차 수정 (QA 지적 반영)
- 지시: 디렉터 / 관련 단계: 8단계 8-B / 처리한 요청: 없음(QA 수정 지시)
- 참여 팀원: client-programmer
- 산출물: js/main.js, js/view.js, js/rebirth.js, tests/run-tests.js, tests/smoke-dom.js, tests/browser-strip.js, docs/design/m2-overview.md, docs/design/m2-rebirth.md
- 결정 사항: S1 #modal 열린 동안 body 아래 #modal 외 요소를 inert 처리(모든 #modal 공통, closeModal에서 복구) + Tab 순환. S2 모달 열림 중 enhance 차단 + 확인 시 busy면 토스트 후 닫기. S3 fameBlock 음수 레벨 invalid. N3 rebirth 액션은 모달이 열려 있어야 동작(테스트는 askRebirth 선행). 문서 구현 상태 갱신. 테스트: 506/658/29/36/189/697/13 통과.
- 남은 문제: 오프라인 모달 열림 중 Space/S/H 단축키는 여전히 동작, 오프라인 모달은 열 때 포커스를 안으로 옮기지 않음(범위 밖).
