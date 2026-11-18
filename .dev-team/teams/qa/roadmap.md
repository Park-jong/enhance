# QA 팀 로드맵

> 관리: QA 팀장. 전체 로드맵(`../../roadmap.md`)의 현재 마일스톤을 따른다.

## 현재 마일스톤 목표
3단계 3-6 보관함·화면 사용성 수정 검증 (3차 APPROVED)

## 할 일 (우선순위 순)
| 우선순위 | 항목 | 출처 (디렉터 / REQ-번호) | 담당 | 상태 |
| --- | --- | --- | --- | --- |
| 디렉터 | 3-6 검증 1차: strip-drag 제스처 정리 누락(must fix), 드래그 중 단축키·재렌더(should) 수정 후 2차 좁은 재검증 | 디렉터 | tester, code-reviewer | 완료 (3차 승인) |
| P1 | F16 천장 게이지 + 성공 숙련 검증 (AC 15 플레이테스트는 사용자 대기) | REQ-018 | tester, code-reviewer | 완료 |

## 완료
- M1 구현 검증 1차 (테스트 101+31+29 통과, 코드 리뷰 완료, CHANGES REQUESTED)
- F16 검증 (REQ-018): 신규 tests/run-m1.1-qa-tests.js 189개(188 통과, 1 의도적 실패=V.REASON.gaugeFull 누락), 기존 164/116/29/36 통과, 승인. AC 15는 docs/qa/m1.1-playtest-checklist.md로 사용자 플레이테스트 대기
