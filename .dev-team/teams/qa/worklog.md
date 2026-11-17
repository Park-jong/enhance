# QA 팀 업무 기록

> 관리: QA 팀장. 작업이 끝날 때마다 맨 아래에 추가한다.

## 2026-11-17 — M1 구현 검증 (F1~F10, F15 + v1→v2 마이그레이션)
- 지시: 디렉터 / 관련 마일스톤: M1 콘텐츠 확장 / 처리한 요청: 없음
- 참여 팀원: tester, code-reviewer
- 산출물: tests/run-m1-qa-tests.js (신규 29개 테스트), 헤드리스 Chrome 스크린샷(scratchpad desktop2.png, mobile390.png)
- 결정 사항: 기존 101 + smoke 31 + 신규 29 모두 통과, 경제 시뮬레이션은 balance 문서 대비 5% 이내. 그러나 코드 리뷰에서 필수 수정 4건 발견(view.js:248 트레이 오표시, main.js:257 로그에 SVG 문자열, 멀티탭 덮어쓰기/이중 정산, 퀘스트 아이템 id 검증) → CHANGES REQUESTED.
- 남은 문제: 멀티탭 안전이 M1 범위인지 디렉터 판단 필요. 제약 문서 누락 상수, 스킵 FX 타이밍 테스트 없음.
