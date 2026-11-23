# 기획 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 3건)

### REQ-039 [P2] 5-A 구현 후 기획서 정리: m1-storage 검 객체 trait, m2-traits 불일치 3건
- 보낸 팀: 개발 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-20 · 단계: 5단계
- 우선순위 근거: 문서와 코드가 어긋나지만 동작은 확정돼 있다. 5단계 진행을 막지 않는 정리라서 6단계 기획 정리 때 함께 처리한다

기획서 정리 2건.
1) docs/design/m1-storage.md 23·41·87행이 검을 {id,lv,prot,pity}로 적고 있다. trait를 추가하거나, m2-overview §D 전체 표를 가리키는 문구를 넣는다.
2) m2-traits.md에서 아래 3곳을 고친다. 코드는 이미 §3.1 정수 규칙을 따른다.
- §4가 float incomeTrait 곱을 적고 있어 §3.1 정수 규칙과 맞지 않는다.
- AC 15가 +6에서 +5로 떨어지는 경우를 적었지만, DROP_FROM이 10이라 그런 하락은 생기지 않는다.
- §17이 setTrait를 test-mode.js에 노출하라고 적었지만, test-mode.js가 rules.js보다 먼저 로드돼서 불가능하다. 지금은 SG.rules.setTrait로 쓴다.

- 2026-11-20 메인 세션: 접수 — 우선순위 P2

### REQ-041 [P2] 5-B 최종 화면 문구와 배치를 m2-traits §11·m2-overview §C.3에 기록
- 보낸 팀: 개발 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-23 · 단계: 5단계
- 우선순위 근거: 문서와 출시된 화면이 어긋나지만 동작은 확정돼 있다. REQ-039와 함께 처리한다

아래 내용을 m2-traits §11(잠정 표시)과 m2-overview §C.3에 반영한다.
- 상인 효과 문구: '이 검을 판매·납품할 때 골드 +N%'
- 수입 특성 표시: '수입 검 적용 중 / 최고 단계 검(+N)일 때만 적용'
- 기념비 칭호 '+L <검 이름> 기념비', 헤더 배지 '🏛️ +L', 기록 탭 '대표 기념비: …'. 섹션은 항상 보이고 초반에는 잠긴 칸으로 나온다.
- 등급 올리기도 두 번 눌러 확인한다.
- 각인 칸은 대장간 탭 맨 위에 있고 활성 검이 대상이다.
- 보관함 카드의 특성 표시는 세로형(글자+등급 점)이다. 디렉터가 기획서의 '카드 안 한 줄' 대신 받아들였다.
- 3등급은 잠금 상태와 상관없이 '최고 등급'으로 표시한다.
- 골드가 부족한 기념비는 이유를 한 줄로 보여 준다.
근거 코드: js/view.js의 TRAIT_TEXT, monumentTitle.

- 2026-11-23 메인 세션: 접수 — 우선순위 P2

### REQ-038 [P3] 단계 기념비 래치 관련 문구 정리
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-20 · 단계: 4단계 정리
- 우선순위 근거: 구현자가 헷갈릴 수 있는 문구 정리이고, 동작 규칙은 m2-rebirth.md가 이미 확정했다

m2-achievements.md §18과 m2-overview.md H표(265행 부근)에 '기념비는 초기화될 수 있고 래치로 보호된다'는 예전 문구가 남아 있다. m2-rebirth.md §8은 환생해도 기념비를 유지한다. 그래서 문구를 '환생 시 기념비 유지(m2-rebirth.md §8), 래치는 best_*와 특성 종류 지표만 보호'로 바꾼다.

- 2026-11-20 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (19건)

- REQ-032 [P1] 저장 안전 구현 세부 7건을 m1-storage.md에 반영 — 완료 (m1-storage.md 보호 모드 구현 세부 7건과 REQ-031 동작(판정 37~39), m1-overview.md 단축키 항목 반영. QA 승인 2026-11-19)
- REQ-029 [P1] 대장간 파편 교환 섹션 항상 표시로 바뀐 규칙을 기획서에 반영 — 완료 (m1-overview.md 대장간 해금 행과 m1-protect-shards.md 교환 절에 파편 교환 항상 표시 반영. QA 승인 2026-11-19)
- REQ-028 [P3] 빈 문자열 v1 저장도 저장 없음으로 볼지 결정 — 완료 (빈 문자열 v1도 저장 없음으로 처리(판정 35). QA 승인 2026-11-19)
- REQ-026 [P1] REQ-012 이후 기획서 갱신 (의뢰 탭 배지, 빈 v2, 저장소 clear 잠금, MAX_PARTICLES) — 완료 (m1-overview.md, m1-quest.md, m1-constants-index.md, m1-storage.md(판정 25~29 추가) 반영. QA 승인 2026-11-19)
- REQ-023 [P1] 3-6 보관함 규칙 변경을 기획서에 반영 — 완료 (기획 팀이 m1-storage.md, m1-constants-index.md, m1-overview.md, m1-protect-shards.md를 3-6 동작에 맞게 수정했다. QA 가벼운 검증에서 승인(2026-11-19, 사이클 1))
- REQ-022 [P1] F16 AC1 문구에서 '하락 방지로 유지된 실패' 삭제 — 완료 (AC1·게이지 규칙에 keepdown 유지 실패 문구 없음 확인. +15 이상 keepdown 불가 참고 한 줄 추가: docs/design/m1.1-late-correction.md)
- REQ-016 [P1] F16 확정 기획: A 천장 게이지 + C' 단계 성공 숙련(+15부터) — 완료 (확정 기획서 docs/design/m1.1-late-correction.md. 갱신: m1-pity-cap, m1-storage §3, m1-constants-index, m1-balance(0.62h 정정), 제안서 상태줄. 사용자 지시로 시뮬레이션 없이 설계 판단이라 수치 미검증, 플레이 테스트로 조정. 사용자 확인 질문 2건 기획서 §10.)
- REQ-015 [P1] F16 후반 강화 확률 보정 요소 기획 (플레이 시간 단축) — 완료 (제안서 완료(사용자 선택 대기): docs/design/m1.1-late-correction-proposal.md, 시뮬레이션 tools/sim-late/. 추천 A+C. 구현 요청은 선택 후 별도 등록)
- REQ-013 [P2] 손상 저장 백업 실패 시 정책 + 탭 잠금 자동 해제 검토 — 완료 (기획 결정(m1-storage.md 저장 안전, 판정 30~36)과 구현 완료. 백업 실패 시 보호 모드, 자동 잠금 해제 없음, 잠금 문구 보강, 실패 보정 구간 문서 수정, 이어받기 손상 저장 백업. QA 전체 검증 승인 2026-11-19)
- REQ-011 [P1] F15 소모품 종류 추가 기획 — 완료 (docs/design/m1-consumables.md)
- REQ-010 [P2] M2 장기 플레이 기능 기획 (F11 환생, F12 업적·일일 의뢰, F13 시간 이벤트, F14 검 랜덤 특성) — 완료 (4단계 기획 완료(배치 A·B·C). F11 환생·저장 필드 전체 표·확률 상한 표: docs/design/m2-rebirth.md, 상태 갱신: docs/design/m2-overview.md. 구현은 5단계 이후.)
- REQ-008 [P1] F9 강화 연출 스킵 · F10 골드 자동 수급 버튼 기획 — 완료 (docs/design/m1-idle.md)
- REQ-007 [P1] F7 실패 보정(천장) 기획 + 확률 보너스 합계 상한 — 완료 (docs/design/m1-pity-cap.md (구간별 보너스 상한 [20,20,14,14]))
- REQ-006 [P1] F6 파괴 파편 · F8 광석과 모루 제작/수리 기획 — 완료 (docs/design/m1-protect-shards.md, m1-anvil-ore.md)
- REQ-005 [P1] F5 검 보관함(여러 자루 보유) 기획 — M1 최우선 확정 — 완료 (docs/design/m1-storage.md (저장 v2 구조·v1 매핑 포함))
- REQ-004 [P1] F4 납품 퀘스트 기획 — 완료 (docs/design/m1-quest.md)
- REQ-003 [P1] F3 모루 소모품 기획 (등급별 확률 상승, 내구도) — 완료 (docs/design/m1-anvil-ore.md, m1-balance.md)
- REQ-002 [P1] F2 파괴 보호권(강화 당 2회) 방어 요소 기획 — 완료 (docs/design/m1-protect-shards.md)
- REQ-001 [P1] F1 방치형 요소 기획 — 완료 (docs/design/m1-idle.md, m1-balance.md)
