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

## 2026-11-19 — 3단계 3-3 REQ-012 M1 잔여 개선 검증 (1차)
- 지시: 디렉터 / 관련 단계: 3단계 3-3 / 처리한 요청: REQ-012 검증
- 참여 팀원: 없음 (스위트 실행·diff 검토·CDP 확인을 직접 수행)
- 산출물: tests/run-m1-round2-tests.js (정적 검사 2건을 js/tab-guard.js 기준으로 갱신), docs/verification-issues.md (V2 병합, 2회)
- 결정 사항: APPROVED. 스위트 5종 통과(208/182/29/36/189). headless Chrome CDP로 index.html·test.html에서 저장 이벤트 잠금, 포커스 이동, 이어받기, sessionStorage clear 무시, localStorage clear 잠금 확인, 콘솔 오류 없음.
- 남은 문제: 두 탭 실제 동시 실행은 StorageEvent 합성으로 대체. 아이콘·배지 시각 확인 미실시.

## 2026-11-19 — 3단계 3-4 저장 안전 정책 검증 (1차)
- 지시: 디렉터 / 관련 단계: 3단계 3-4 / 처리한 요청: REQ-013, REQ-012 항목 2, REQ-028 검증
- 참여 팀원: tester(스위트·Edge CDP 브라우저 검증), code-reviewer(저장 쓰기 경로·peek 계약 리뷰)
- 산출물: tests/run-m1.1-qa-tests.js (648-649행 .state 로 수정), docs/verification-issues.md (V2 병합, 3회, 🚨)
- 결정 사항: APPROVED. 스위트 5종 통과(221/257/29/36/189). 보호 모드 중 저장 키 쓰기 0회, 복사 폴백·재시도·포기·백업 중복·배지·잠금 문구·390px 확인, 콘솔 오류 없음. 리뷰어 must fix 1건은 QA 테스트 갱신으로 해소.
- 남은 문제: 헤더가 모바일에서 길어짐(배너+textarea), 항상 적용된 flex-wrap, getItem 실패 시 보호 해제, 텍스트영역 포커스 중 단축키 동작(Space/S/H), 실제 클립보드 성공·교차 탭 checkStored 브라우저 미검증.

## 2026-11-19 — 3단계 REQ-025 검증 (실제 브라우저 회귀 테스트 + 3-6 낮음 문제)
- 지시: 디렉터 / 관련 단계: 3단계 잔여 / 처리한 요청: REQ-025 (검증)
- 참여 팀원: 없음 (light, 직접 검증)
- 산출물: 없음 (보고만)
- 결정 사항: 6개 테스트 전부 통과(226/299/29/36/189/14), 승인. 정리: qa-prof* 임시 폴더 28개와 msedge(9333/qa-prof) 프로세스 종료·삭제.
- 남은 문제: V3 재현 스팟체크(pointerdown capture 재추가)는 제품 코드 수정이 필요해 생략.

## 2026-11-19 — 4단계 전 버그 수정: 오른쪽 패널 카드 내용 넘침
- 지시: 디렉터 / 관련 단계: 4단계 전 / 처리한 요청: 없음
- 참여 팀원: 없음 (light 검증, 직접 수행)
- 산출물: docs/verification-issues.md V4 추가
- 결정 사항: css .side > * { flex-shrink: 0; } 확인, 테스트 6개 파일 전부 통과(226/299/29/36/189/44). V4 신규 기록.
- 남은 문제: 없음

## 2026-11-20 — 4단계 묶음 A 검토 (4-0 골드 사용처, 4-1 F14 특성) 1차
- 지시: 디렉터 / 관련 단계: 4단계 배치 A / 처리한 요청: 없음
- 참여 팀원: 없음(light, 직접 검증)
- 산출물: 없음(문서 검토 보고만). 코드 변경 없음, tests/run-tests.js 226 통과
- 결정 사항: 코드 대조와 산수는 일치. 문서 간 모순 2건(중간)으로 CHANGES REQUESTED
- 남은 문제: overview C.5의 "특성 수입이 +5~+12 구간과 겹치지 않음"은 거짓(각인은 +5 무료), overview D와 traits §10의 t 정규화 불일치

## 2026-11-20 — 4단계 묶음 B 검토 (4-2 F12 업적·일일, 4-3 F13 시간 이벤트) 1차
- 지시: 디렉터 / 관련 단계: 4단계 배치 B / 처리한 요청: 없음
- 참여 팀원: 없음(light, 직접 검증)
- 산출물: docs/verification-issues.md V5 추가. 코드 변경 없음, tests/run-tests.js 226 통과
- 결정 사항: CHANGES REQUESTED. 산수(H·보상표·dayKey·파괴율 불변·Σ1/p)는 node로 일치 확인. 불일치: 업적 파편 합계 27 → 실제 30, certain()의 parts가 null인데 AC가 parts.event 요구, craft_m 달성 불가 상태, eventGain 공식 오류, 조합 수 10,400 오류.
- 남은 문제: storedClaimed가 daily.maxDay를 비교하지 않음(낮음), 숨김 후 자동 catch-up이 멈춘 이벤트 배율을 받음(낮음), tools/sim-late가 구현 소비자 목록에 없음.

## 2026-11-20 — 4단계 묶음 C 기획 검토 (4-4 F11 환생, 4-5 저장 필드 표, 확률 상한 관계 표)
- 지시: 디렉터 / 관련 단계: 4단계(묶음 C, 마지막) / 처리한 요청: 없음
- 참여 팀원: 없음(light 검증, 직접 수행)
- 산출물: 없음(검토 보고만). 코드 변경 없음, 검증 이슈 로그 변경 없음
- 결정 사항: 승인. 코드 대조로 최대 확률 46/41/36/33/29, H(20)=198,462, REBIRTH_FEE=19,846,200, 숙련 상속 표(P 0.0013~0.0137), 슬롯 확장 비용(칸 5 → 30,000), 수입 계산 예(507/761/609/288/414,720/1,518/2,676) 재계산 일치. 저장 최상위 키 누락 없음.
- 남은 문제(낮음): 옛 클라이언트가 새 저장을 덮어쓰면 rebirth 소실, 페이스 단축 가정(숙련 ≤2분·면허 ≤1분)은 도출 아닌 가정, m2-achievements §18·m2-overview H표의 "monuments 래치 보호" 문구가 §8 "유지"와 어긋남

## 2026-11-20 — 5단계 5-A 검증 (검 특성·골드 사용처 규칙과 저장) 1차
- 지시: 디렉터 / 관련 단계: 5단계 5-A / 처리한 요청: 없음
- 참여 팀원: tester(7종 검사·브라우저 로드·부팅 각인·시드 회귀·AC 커버리지, 이후 run-m1.1 기대값 수정), code-reviewer(diff 검토)
- 산출물: tests/run-m1.1-qa-tests.js:586 기대값에 trait: null 추가(189/0). docs/verification-issues.md V2 4회로 병합
- 결정 사항: 승인. 검사: run-tests 287, smoke-dom 310, m1-qa 29, round2 36, m1.1 189(수정 후), browser-strip 44, sim-late selfcheck 13 모두 통과. HEAD 대비 시드 회귀 동일(rng 452회, 결과 3319건). chances() 무변경·특성 무관, 옛 저장 부팅 각인 1회만. 코드 문제 없음.
- 남은 문제: m1-storage.md 23·41·87행에 trait 미반영(디자인 요청), setTrait의 test.html 노출 여부는 5-A/5-B 미정, 테스트 패널 commit은 engravePending을 호출하지 않음(정보), view.js 476·521 ORE_PER_HUNT 표시는 5-B에서 정리
