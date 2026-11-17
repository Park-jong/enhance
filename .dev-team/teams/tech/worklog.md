# 개발 팀 업무 기록

> 관리: 개발 팀장. 작업이 끝날 때마다 맨 아래에 추가한다.

## 2026-11-17 — M1 콘텐츠 확장 구현 (F1~F10, F15)
- 지시: 디렉터 / 관련 마일스톤: M1 콘텐츠 확장 / 처리한 요청: REQ-009
- 참여 팀원: client-programmer
- 산출물: `index.html`, `css/style.css`, `js/constants.js`, `js/rules.js`, `js/forge.js`, `js/idle.js`, `js/quests.js`, `js/save.js`, `js/audio.js`, `js/fx.js`, `js/view.js`, `js/main.js`, `tests/run-tests.js`, `tests/smoke-dom.js`
- 결정 사항: file:// 호환을 위해 클래식 script 여러 개로 분리(window.SG 네임스페이스 + node export), 규칙 모듈은 시계/난수/저장소 주입. 사냥·자동·오프라인은 topLv(보관함 최고 단계) 기준. 콘텐츠 에셋(M1_ICONS/M1_SFX)은 조회 테이블로 연결, 없으면 이모지/합성음 대체.
- 남은 문제: 브라우저 실기(레이아웃, 애니메이션, 소리, 터치) 미확인. 보호로 막힌 파괴가 통계상 실패로 집계되지 않음(보정 +1은 적용). 기획 문서에 없는 상수 추가분 반영 요청 필요.
