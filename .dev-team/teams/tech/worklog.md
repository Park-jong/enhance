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
