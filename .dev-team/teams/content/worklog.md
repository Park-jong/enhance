# 콘텐츠 팀 업무 기록

> 관리: 콘텐츠 팀장. 작업이 끝날 때마다 맨 아래에 추가한다.

## 2026-11-17 — M1 아이콘 세트 및 효과음 큐 제작
- 지시: 디렉터 / 관련 마일스톤: M1 콘텐츠 확장 / 처리한 요청: 없음(Design 전달 요구사항 반영)
- 참여 팀원: art-director, sound-designer
- 산출물: assets/m1-icons.js, assets/m1-sfx.js, assets/m1-preview.html, docs/content/m1-art-sound.md
- 결정 사항: 아이콘은 32x32 viewBox 플랫 2톤 SVG(currentColor + 테마 변수). 효과음은 데이터(배열)로 두고 M1_SFX_PLAY 헬퍼가 기존 tone()/noise()를 호출. index.html은 수정하지 않음(Tech 담당).
- 남은 문제: 브라우저에서 실제로 열어 보지 못함(20px 가독성, 음량 청취 확인 필요). +10 이상 파괴 스킵 큐는 skipDestroy 재사용 제안, Design 확인 대기.
