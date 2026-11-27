# 기획 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 1건)

### REQ-053 [P3] 시뮬레이션 AC10 수치를 인용한 문서 확인
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-27 · 단계: 1.0.0 이후
- 우선순위 근거: 후보 메커닉(채택 안 된 A/B) 참고 수치라 게임에 영향 없음. 문서 정확도용 백로그

REQ-033 이중 계산 수정으로 sim-late 후보 A/B(AC10) 결과가 바뀜(예: Heavy +20 시도 138→151). 예전 AC10 수치를 인용한 기획서·.dev-team 기록이 있으면 갱신하거나 "수정 전 값" 표시. M1 결과는 그대로. 근거: 1.0.0 QA 검증

- 2026-11-27 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (26건)

- REQ-046 [P3] 배지가 모두 뜰 때 721~1000px 헤더 배치 정하기 — 완료 (9-1에서 헤더를 모든 폭에서 줄바꿈, 로고 한 줄, 자원바·설정 묶음 오른쪽 정렬로 해결. 배지가 모두 뜰 때 300~1400px 넘침·겹침 0(QA 2차 승인))
- REQ-045 [P2] m2-events.md 칩 aria 문구와 m2-rebirth.md test-mode.js 언급 확인 — 완료 (8-B에서 m2-events.md 칩 aria-haspopup="dialog"+aria-expanded, m2-rebirth.md test-mode.js 환생 도우미 문구 정정 완료(QA 확인))
- REQ-044 [P1] m2-events.md를 7-1 구현에 맞추기 — 완료 (m2-events.md §18, §6.2, §8, §5.3.1, AC13, §11 수정(§9 미수정), m2-traits.md:149 수정. 7-1 코드 기준으로 맞춤.)
- REQ-043 [P1] m2-achievements.md §10.3·§12를 6-B 구현에 맞추고 연출 전 결과 노출 범위 판정 — 완료 (docs/design/m2-achievements.md 갱신: 범례, §6, §10.3(확정), §12(확정)·12.1~12.3, 신설 §12.4(연출 전 노출 범위 판정), AC 56·59·60, §17(섹션 순서, 연출 전 결과 노출). 코드와 지시 목록 불일치 없음.)
- REQ-041 [P2] 5-B 최종 화면 문구와 배치를 m2-traits §11·m2-overview §C.3에 기록 — 완료 (m2-traits.md §11(잠정 제거)·m2-overview.md §C.3에 5-B 최종 화면 기록, view.js와 대조 완료 (2026-11-23))
- REQ-039 [P2] 5-A 구현 후 기획서 정리: m1-storage 검 객체 trait, m2-traits 불일치 3건 — 완료 (m1-storage.md 검 요소에 trait 안내, m2-traits.md §4·§6·AC15·§9·§17 정리 (2026-11-23))
- REQ-038 [P3] 단계 기념비 래치 관련 문구 정리 — 완료 (m2-achievements.md §18, m2-overview.md H표 문구 정리 (2026-11-23))
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
