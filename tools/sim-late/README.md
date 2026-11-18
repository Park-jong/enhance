# sim-late — M1.1 후반 강화 보정 시뮬레이션

`docs/design/m1.1-late-correction-proposal.md`의 수치 근거. 실제 규칙 모듈(`js/constants.js`, `js/rules.js`의 `chances`/`attemptEnhance`/상점·파편, `js/save.js`의 `defaultState`, `js/idle.js`의 수동·자동·오프라인 수입, `js/forge.js`의 모루)을 `require`해서 새 저장부터 플레이어를 굴린다. `js/`는 수정하지 않는다.

## 실행 (프로젝트 루트에서, Node 18+)
```
node tools/sim-late/selfcheck.js                                                  # 래퍼 검증(확정 성공, 상한 밖 보너스, 상수 복원)
node tools/sim-late/baseline.js   [runs=2000] [lightRuns=300] [seed=20261118]   # STEP 1: 현행 M1 프로필 3종
node tools/sim-late/candidates.js [set=final] [runs=2000] [lightRuns=300] [seed]  # STEP 2: 후보 A~F·조합
node tools/sim-late/candidates.js extra 1000 200                                   # 비교용 변형(검 단위 게이지, 리버스 등)
node tools/sim-late/candidates.js AC,AC10 2000 300                                 # 원하는 케이스만
node tools/sim-late/breakdown.js  M1,AC10 500 100                                  # 단계 구간별 시도·파괴 분포
node tools/sim-late/probe-smith-farm.js 200                                        # 악용 점검: 대장장이 숙련 의도적 파밍 시간
```
전체 `final` 세트는 수 분~20분 걸린다(P-Light가 상한 150h까지 도는 케이스가 느림). 같은 seed면 결과가 같다.

## 구성
- `lib/engine.js` — 플레이어 1명 루프(세션·오프라인·사냥·구매·강화), 시간 모델 `TIME.standard` / `TIME.legacy`
- `lib/profiles.js` — 정책 P-Heavy / P-Realistic / P-Light
- `lib/mechanics.js` — 후보 A~F 래퍼. 확정 성공은 `SG.config.forceSuccess`를 한 번의 `attemptEnhance` 동안만 켜고, 상한 밖 보너스는 그 시도 동안만 `C.RATE[l]`을 올렸다가 되돌린다(상수 배열은 실행 후 복원, `constants restored: OK`로 확인)
- `lib/report.js` — 중앙값/p90 표 (`>cap` = 상한 150 접속시간 안에 미도달)

## 표 열
`attMed/attP90` 시도 수, `gold` 소비 골드 중앙값, `hMed/hP90` 접속 시간(h), `dMed/dP90` 달력 일수(하루 30분), `p9/md` = p90/중앙값, `hunt` = 접속 시간 중 골드 벌기(사냥) 비중, `dstr` 파괴 수.
