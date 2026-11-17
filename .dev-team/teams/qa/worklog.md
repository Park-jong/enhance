# QA 팀 업무 기록

> 관리: QA 팀장. 작업이 끝날 때마다 맨 아래에 추가한다.

## 2026-11-17 — M1 구현 검증 (F1~F10, F15 + v1→v2 마이그레이션)
- 지시: 디렉터 / 관련 마일스톤: M1 콘텐츠 확장 / 처리한 요청: 없음
- 참여 팀원: tester, code-reviewer
- 산출물: tests/run-m1-qa-tests.js (신규 29개 테스트), 헤드리스 Chrome 스크린샷(scratchpad desktop2.png, mobile390.png)
- 결정 사항: 기존 101 + smoke 31 + 신규 29 모두 통과, 경제 시뮬레이션은 balance 문서 대비 5% 이내. 그러나 코드 리뷰에서 필수 수정 4건 발견(view.js:248 트레이 오표시, main.js:257 로그에 SVG 문자열, 멀티탭 덮어쓰기/이중 정산, 퀘스트 아이템 id 검증) → CHANGES REQUESTED.
- 남은 문제: 멀티탭 안전이 M1 범위인지 디렉터 판단 필요. 제약 문서 누락 상수, 스킵 FX 타이밍 테스트 없음.

## 2026-11-17 — M1 구현 재검증 (2차)
- 지시: 디렉터 / 관련 마일스톤: M1 콘텐츠 확장 / 처리한 요청: 없음
- 참여 팀원: tester, code-reviewer
- 산출물: tests/run-m1-round2-tests.js (35개), 헤드리스 Chrome 스크린샷(scratchpad overlay.png, overlay390.png, settings_d.png, settings_m.png)
- 결정 사항: 1차 필수 수정 4건 모두 해결 확인. 신규 필수 수정 1건: 탭 인수/resume 시 adoptNewerSave가 ui.nextAutoAt을 갱신하지 않아 자동 사냥 최대 20회(3,200G) 이중 지급 → CHANGES REQUESTED. 탭 잠금 해제는 버튼 클릭 방식 M1 허용.
- 남은 문제: main.js:350-356 nextAutoAt 재설정 + 행동 테스트, peek 분리, 타 탭 입력 inert 처리.

## 2026-11-17 — M1 최종 검증 (3차)
- 지시: 디렉터 / 관련 마일스톤: M1 콘텐츠 확장 / 처리한 요청: 없음
- 참여 팀원: tester, code-reviewer
- 산출물: tests/run-m1-round2-tests.js 수정(write-once 케이스, takeOver 정규식, AC17 테스트), 스크린샷 scratchpad final_overlay.png, final_settings.png
- 결정 사항: 필수 수정 없음 → APPROVED. 전 스위트 통과(127/66/29/36). 이중 지급 수정 확인(뮤턴트로 실패 재현), 헤드리스 두 탭에서 잠금/inert/인수 정상.
- 남은 문제(Tech P2): 인수 중 강화 애니메이션 epoch 처리, 인수 시 손상 v2 백업, UI 리셋 중복, backedUp 중복, 백업 실패 시 원본 덮어쓰기 정책(디자인 결정), 잠금 시 인수 버튼 포커스.
