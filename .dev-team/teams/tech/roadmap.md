# 개발 팀 로드맵

> 관리: 개발 팀장. 전체 로드맵(`../../roadmap.md`)의 현재 마일스톤을 따른다.

## 현재 마일스톤 목표
M1 콘텐츠 확장: F1~F10, F15 구현 (보관함, 보호권/파편, 모루/광석, 의뢰, 실패 보정, 방치, 소모품).

## 할 일 (우선순위 순)
| 우선순위 | 항목 | 출처 (디렉터 / REQ-번호) | 담당 | 상태 |
| --- | --- | --- | --- | --- |
| P1 | 브라우저 실기 확인(file://, 데스크톱/모바일 폭) | 디렉터 (QA 요청 예정) | QA | 대기 |
| P1 | REQ-012 M1 QA 권장 수정 (구현 완료, QA 검증 대기) | REQ-012 | client-programmer | 검증 대기 |

## 완료
- TODO 3-6 보관함·화면 사용성 수정: 테마 스크롤바, .play 래퍼로 sticky 겹침 해결, 한 번 클릭 활성화, 파괴 후 활성 검 없음(active=0), Pointer Events 드래그 정렬 (3차 H1 수정: pointerdown 캡처 제거로 클릭 활성화 복구 / 2차 QA 수정 반영: run-tests 189, smoke-dom 152, QA 3종 통과) — client-programmer
- REQ-020 F16 QA 후 수정: gaugeFull 토스트, 튜닝 안전(TO 유도), 모바일 버튼 넘침 수정 (테스트 5종 통과 164/116/29/36/189) — client-programmer
- REQ-017 F16 천장 게이지 + 성공 숙련 구현 (M1.1, 테스트 164+116+29+36 통과) — client-programmer
- M1 F1~F10, F15 구현 (index.html + css/ + js/, 노드 테스트 101건 + DOM 스모크 31건 통과) — 디렉터 / client-programmer
- REQ-009 v1 → v2 저장 이전 (js/save.js migrate) — client-programmer
