# M1 검 보관함 (F5) + 저장 데이터 `sword-enhance-v2`

> 담당: 기획(시스템). 다른 모든 M1 문서가 이 문서의 저장 구조를 참조한다. 수치는 "잠정값"이며 밸런스 문서에서 확정.

## 1. 결정 요약
| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 칸 수 | 시작 `SLOT_START`=3, 최대 `SLOT_MAX`=8, 유료 확장 | 납품용 1~2자루 + 주력 1자루가 바로 가능해야 함 |
| 새 검(+0) 획득 | 빈 칸이 있으면 골드 `NEW_SWORD_PRICE`로 구매. **보유 검이 0자루가 되면 무료 +0 1자루 자동 지급** | 무한 무료 +0 공급 방지, 소프트락 방지 |
| 강화 대상 | "활성 검" 1자루만. 보관함에서 선택(무료, 강화 중 `busy`일 땐 불가) | |
| 판매/납품 | 보관함의 어느 검이든 바로 판매·납품 가능(활성 전환 불필요) | 보관 목적 달성 |
| 파괴 시 | **칸이 비워진다**(M0의 "+0으로 리셋" 폐지). 보유 0자루면 무료 +0 지급 | 칸의 의미 유지, 파괴 비용에 새 검 구매가 포함, 첫 검 파괴 후 진행 불가 방지 |
| 판매 시 | 칸이 비워진다(마찬가지로 0자루면 무료 +0) | 파괴와 같은 규칙 |
| 보호 횟수 카운터 | **검별(per-sword)** `prot` | 검을 갈아타며 횟수를 세탁하는 것 방지, 문서 m1-protect-shards 참조 |
| 실패 보정 카운터 | **검별(per-sword)** `pity` | 위와 동일. 검 전환으로 보정만 빼 쓰는 것 방지. 파괴되면 검과 함께 소멸 |
| 활성 검이 비워질 때 | 남은 검 중 단계 최고 검을 자동 활성화, 없으면 무료 +0 | |
| 사냥/방치 수입 기준 | 활성 검 단계 (M0 "들고 있는 검"과 동일) | 주력 검을 키울수록 수입 증가라는 M0 성질 유지 |
| +0 검 판매 | 불가(판매가 0) | M0와 동일 |

## 2. 규칙 상세
- 칸 확장: `SLOT_EXPAND_COST[n]`(n=이미 확장한 횟수 0..4). 최대 도달 시 버튼 숨김. 확장은 영구.
- 검 객체: `{ id, lv, prot, pity }` — `id`는 `nextSwordId`로 부여하는 증가 정수(삭제되어도 재사용 안 함).
- 검 구매(`buySword`): 골드 부족 또는 빈 칸 없음이면 거부(토스트). 구매한 검은 활성 전환하지 않음(보관함에 +0으로 들어감).
- 판매 확인: M0의 "+8 이상은 2회 클릭 확인"을 모든 칸에 동일 적용(검 id별로 armed 상태 관리).
- 도감(`found`)과 `best`는 보유 검 전체가 아니라 **도달 기록**이므로 검이 사라져도 유지.
- 보관함 UI(자세한 배치는 overview): 칸 카드 = 검 아이콘 + `+단계` + 상태 뱃지(활성 / 보호 남은 횟수 `🛡N` / 납품 가능 `📦`). 카드 탭 시 하단 액션: [활성으로] [판매] [납품].
- 빈 칸 카드: [+ 새 검 NEW_SWORD_PRICE G]. 잠긴 칸 카드: [🔒 확장 비용].

## 3. 저장 데이터 `sword-enhance-v2` (단일 진실 공급원)
키 `sword-enhance-v2`. 다른 문서가 새 상태를 만들 땐 이 표에 추가해야 한다.

```json
{
  "v": 2,
  "gold": 300,
  "shards": 0,
  "best": 0,
  "found": [true, false, "... 길이 21 (0..20)"],

  "swords": [ { "id": 1, "lv": 0, "prot": 2, "pity": 0 } ],
  "nextSwordId": 2,
  "active": 1,
  "slots": 3,

  "inv": { "bless": 0, "protect": 0, "keepdown": 0, "sure": 0, "booster": 0, "seal": 0 },
  "use": { "bless": false, "protect": false, "keepdown": false, "sure": false, "anvil": false, "seal": false },

  "anvils": [ { "id": 1, "g": 1, "dura": 30 } ],
  "nextAnvilId": 2,
  "anvilEq": null,
  "ore": { "iron": 0, "silver": 0, "mithril": 0 },

  "quests": {
    "list": [ null, null, null ],
    "readyAt": [0, 0, 0]
  },

  "idle": {
    "autoOn": false,
    "up": { "speed": 0, "gold": 0, "offline": 0 },
    "lastSeen": 0,
    "boostUntil": 0
  },

  "settings": { "muted": false, "skipFx": false },

  "stats": {
    "tries": 0, "success": 0, "fail": 0, "destroy": 0, "earned": 0,
    "shardsGained": 0, "protectSaved": 0, "delivered": 0, "crafted": 0,
    "huntGold": 0, "offlineGold": 0
  }
}
```

### 필드 정의/기본값
| 필드 | 타입/범위 | 기본값 | 설명 | 참조 문서 |
| --- | --- | --- | --- | --- |
| `v` | 정수 | 2 | 저장 버전 | 본 문서 |
| `gold` | 정수 ≥0 | 300 | | |
| `shards` | 정수 ≥0 | 0 | 파괴 파편 | protect-shards |
| `best` | 0..20 | 0 | 역대 최고 단계. 해금 판정에 사용 | overview |
| `found` | bool[21] | [0]만 true | 도감 | |
| `swords` | 객체 배열, 길이 1..`slots` | `[{id:1,lv:0,prot:2,pity:0}]` | 보유 검. 길이는 항상 ≥1(0이 되면 즉시 무료 +0 지급) | 본 문서 |
| `swords[].prot` | 0..`PROTECT_USES` | 2 | 현재 단계에서 남은 보호 횟수 | protect-shards |
| `swords[].pity` | 정수 ≥0 | 0 | 마지막 성공 이후 실패 누적 횟수(확률 보너스는 계산식으로 도출) | pity-cap |
| `nextSwordId` | 정수 | 2 | | |
| `active` | 검 id | 1 | 반드시 `swords`에 존재 | |
| `slots` | `SLOT_START`..`SLOT_MAX` | 3 | 열린 칸 수 | |
| `inv.*` | 정수 0..`STACK_MAX`(99) | 0 | 소모품 보유 수. 추가 품목은 consumables 문서 | consumables |
| `use.*` | bool | false | 다음 강화 토글(`seal`은 다음 판매/납품 토글) | consumables |
| `anvils[]` | `{id,g,dura}` g=1..3, dura 0..`ANVIL_DURA[g]` | `[]` | 보유 모루 인스턴스. 최대 `ANVIL_OWN_MAX`개 | anvil-ore |
| `anvilEq` | 모루 id 또는 null | null | 장착 중 모루 | anvil-ore |
| `ore.*` | 정수 ≥0 | 0 | 광석 | anvil-ore |
| `quests.list[i]` | 의뢰 객체 또는 null | null ×`QUEST_SLOTS` | 의뢰 구조는 m1-quest §6 | quest |
| `quests.readyAt[i]` | epoch ms | 0 | 해당 칸 신규 의뢰 생성 가능 시각(0이면 즉시) | quest |
| `idle.autoOn` | bool | false | 자동 사냥 ON/OFF | idle |
| `idle.up.*` | 정수 0..`UP_MAX` | 0 | 방치 성장 레벨 | idle |
| `idle.lastSeen` | epoch ms | 로드 시 `Date.now()` | 오프라인 보상 기준. 저장할 때마다 갱신 | idle |
| `idle.boostUntil` | epoch ms | 0 | 골드 부스터 종료 시각 | consumables |
| `settings.muted` | bool | false | v1 `muted` 이동 | |
| `settings.skipFx` | bool | false | 연출 스킵 | idle(F9) |
| `stats.*` | 정수 | 0 | v1 5개 + 신규 | |

### 로드 규칙(`load()`)
1. `sword-enhance-v2`가 있으면 파싱 후 기본값 병합(M0 `load()`와 같은 얕은 병합 + 중첩 객체별 병합). 
2. 없고 `sword-enhance-v1`이 있으면 `migrate(v1)` 실행 후 v2로 저장. **v1 키는 지우지 않는다**(롤백용).
3. 둘 다 없거나 파싱 실패 시 기본 상태.
4. 로드 후 **정합성 보정**: `swords`가 비면 무료 +0 추가; `active`가 없으면 최고 단계 검 선택; 각 `lv`는 0..20, `prot`는 0..`PROTECT_USES`로 clamp; `inv`/`ore`/`gold`/`shards`는 음수면 0; `anvilEq`가 존재하지 않는 id면 null; `swords.length > slots`면 `slots`를 올려 맞춤.

### v1 → v2 마이그레이션 매핑 (`migrate`)
| v1 필드 | v2 위치 | 변환 |
| --- | --- | --- |
| `gold` | `gold` | 그대로 |
| `level` | `swords[0].lv`, `active=1` | `swords=[{id:1, lv:level, prot:PROTECT_USES, pity:0}]`, `nextSwordId=2` |
| `best` | `best` | 그대로. 단 `best < level`이면 `level`로 보정 |
| `muted` | `settings.muted` | 그대로 |
| `inv.bless` | `inv.bless` | 그대로 |
| `inv.protect` | `inv.protect` | 그대로(기존 파괴 방지권은 새 "파괴 보호권"으로 1:1 승계. protect-shards 참조) |
| `use.bless`, `use.protect` | `use.bless`, `use.protect` | 그대로 |
| `found` | `found` | 길이 21로 맞추고 `[0]=true`. `best`까지는 true로 보정하지 않음(원본 유지) |
| `stats.tries/success/fail/destroy/earned` | `stats.*` 동명 | 그대로. 신규 stats는 0 |
| (없음) 나머지 | 기본값 | `shards=0`, `slots=SLOT_START`, 새 `inv.*`=0, `idle.lastSeen=Date.now()`(**마이그레이션 직후 오프라인 보상 없음**), `quests` 빈 상태 등 |

## 열린 질문 (사용자 확인 필요)
1. 파괴 시 칸이 비워지는 방식(권장) vs M0처럼 +0으로 남는 방식. 권장: 비움(위 근거). 
2. 보관함에서 +0 검을 "버리기"(칸 비우기, 0G) 허용? 권장: 허용하지 않음(칸 확장·구매 비용이 낮아 불필요). 칸이 가득 차 고민될 때만 문제이므로 추후 요청 시 추가.

## 수용 기준 (Acceptance criteria)
1. Given v2 저장이 없고 v1 저장 `{gold:5000, level:7, best:12, muted:true, inv:{bless:3,protect:2}, use:{bless:true,protect:false}, found:[...], stats:{...}}`이 있을 때 / When 게임을 로드하면 / Then `swords=[{id:1,lv:7,prot:2,pity:0}]`, `active=1`, `gold=5000`, `best=12`, `settings.muted=true`, `inv.bless=3`, `inv.protect=2`, `use.bless=true`이고 v2 키가 저장되며 v1 키는 남아 있다.
2. Given v1 저장이 `best=3, level=5`(불일치)일 때 / When 마이그레이션하면 / Then `best=5`.
3. Given 새 게임일 때 / When 로드하면 / Then 보유 검 1자루(+0), `slots=3`, 골드 300이고 모든 신규 필드가 §3 기본값이다.
4. Given 저장 JSON이 손상됐을 때 / When 로드하면 / Then 예외 없이 기본 상태로 시작한다.
5. Given 빈 칸 1개와 골드 ≥ `NEW_SWORD_PRICE`일 때 / When [+ 새 검]을 누르면 / Then 골드가 `NEW_SWORD_PRICE` 줄고 +0 검이 추가되며 `active`는 바뀌지 않는다. 빈 칸이 없거나 골드가 부족하면 아무것도 변하지 않고 토스트가 나온다.
6. Given 검 2자루 이상일 때 / When 비활성 검을 [활성으로] 누르면 / Then `active`가 그 검 id로 바뀌고 강화 패널·성공/파괴 확률·사냥 보상이 그 검 기준으로 갱신된다. 강화 연출 중(`busy`)에는 전환이 거부된다.
7. Given 검이 2자루이고 활성 검이 파괴될 때 / When 파괴가 확정되면 / Then 그 칸이 비고, 남은 검 중 최고 단계 검이 활성이 되며, 무료 +0은 지급되지 않는다.
8. Given 검이 1자루뿐이고 파괴되거나 판매될 때 / Then 무료 +0 검 1자루가 지급되어 `swords.length ≥ 1`이 항상 유지된다.
9. Given 비활성 검 +9가 있을 때 / When 보관함에서 [판매]를 누르면(+8 이상은 2회 클릭 확인) / Then 그 검만 사라지고 골드가 `sell(9)` 증가하며 활성 검과 그 `prot`/`pity`는 변하지 않는다.
10. Given 검 A(`pity=3`)와 B(`pity=0`)일 때 / When A→B로 활성 전환 후 강화하면 / Then B의 `pity`만 갱신되고 A는 `pity=3` 유지.
11. Given `slots=3`, 골드 충분일 때 / When 칸을 확장하면 / Then `slots=4`, 골드가 `SLOT_EXPAND_COST[0]` 감소; `slots=SLOT_MAX`면 확장 버튼이 없다.
12. Given 저장 후 새로고침할 때 / Then 보유 검 목록, 활성 검, 각 검의 `prot`/`pity`, 칸 수가 그대로 복원된다.
