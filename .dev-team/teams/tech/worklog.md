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
