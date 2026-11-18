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

## 2026-11-18 — F16 천장 게이지 + 성공 숙련 검증 (M1.1)
- 지시: 디렉터 / 관련 마일스톤: M1.1 / 처리한 요청: REQ-018
- 참여 팀원: tester, code-reviewer
- 산출물: tests/run-m1.1-qa-tests.js (189개), docs/qa/m1.1-playtest-checklist.md (AC 15 템플릿), 헤드리스 Chrome 스크린샷(scratchpad shot_*_320/390/720.png)
- 결정 사항: 필수 수정 없음 → APPROVED. 기존 스위트 164/116/29/36 통과, 신규 188 통과 + 1 실패. 실패는 should-fix(V.REASON.gaugeFull 누락으로 잠긴 토글 클릭 토스트가 일반 문구). 변이 8종 모두 검출. 320/390/720 모바일 레이아웃 시각 확인 완료.
- 남은 문제: AC 15 플레이테스트(사용자), Tech P2: gaugeFull 문구, *_TO와 배열 길이 연동, mastery 이름 중복, 사냥 버튼 라벨 320~390px 잘림(기존 이슈).

## 2026-11-19 — 3단계 3-6 보관함·화면 사용성 수정 검증 (1차)
- 지시: 디렉터 / 관련 단계: 3단계 / 처리한 요청: 없음
- 참여 팀원: tester, code-reviewer
- 산출물: tests/run-tests.js(+6), tests/run-m1-qa-tests.js, tests/run-m1.1-qa-tests.js 갱신(새 파괴 규칙 반영), docs/verification-issues.md V1, V2 추가
- 결정 사항: CHANGES REQUESTED. 테스트 189/149/29/36/189 통과. 실패했던 QA 테스트 4건은 의도된 규칙 변경으로 판단해 갱신. 브라우저 확인은 도구 부재로 미실행.
- 남은 문제: strip-drag 제스처 정리(M1), 드래그 중 단축키(S1), 재렌더 시 분리된 카드(S2), tools/sim-late 크래시, docs/design/m1-storage.md 옛 규칙 서술, 브라우저 수동 확인.

## 2026-11-19 — 3단계 3-6 보관함·화면 사용성 수정 검증 (2차)
- 지시: 디렉터 / 관련 단계: 3단계 / 처리한 요청: 없음
- 참여 팀원: 없음 (좁은 재검증, 직접 수행)
- 산출물: docs/verification-issues.md (V1 규칙 수정, V3 추가)
- 결정 사항: CHANGES REQUESTED. 스위트 5종 통과(189/152/29/36/189). headless Chrome CDP 확인 결과 마우스 단순 클릭이 활성 전환을 못 한다(pointerdown capture가 click target을 #strip으로 바꿈). 드래그 재정렬, 밖에서 놓기 정리, 스크롤바 테마, 모바일 탭바 여백은 정상.
- 남은 문제: strip-drag capture 시점을 begin()으로 이동, 파괴 후 활성 없음 안내 브라우저 확인, 실제 터치 롱프레스.

## 2026-11-19 — 3단계 3-6 보관함·화면 사용성 수정 검증 (3차, 최종)
- 지시: 디렉터 / 관련 단계: 3단계 / 처리한 요청: 없음
- 참여 팀원: 없음 (좁은 재검증, 직접 수행)
- 산출물: docs/verification-issues.md (V3 해소 확인 문구)
- 결정 사항: APPROVED. 스위트 5종 통과(189/152/29/36/189). CDP: 3번째 카드 클릭 활성 전환, 1번 카드를 3번 뒤로 드래그 시 순서 2,3,1이고 활성 검 유지, 밖에서 놓기 후 .dragging/.drag-on 없음. active:0 저장 로드 시 안내 표시, 강화 버튼 비활성, Space 무반응. 임계값 전 밖에서 놓은 대기 제스처는 다음 move(buttons 없음)나 pointerdown에서 정리되어 허용.
- 남은 문제: 실제 터치 롱프레스와 스크롤 양보는 실기기 미검증.
