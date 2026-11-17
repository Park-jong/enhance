/* 테스트 페이지(test.html) 전용 조작판. js/main.js보다 먼저 로드해 SG.extensions에 등록한다.
 * 버튼은 data-act로 컨트롤러의 클릭 처리(탭 잠금 포함)를 그대로 탄다. 저장은 테스트 저장 키에만 쓰인다.
 */
(function (root) {
  'use strict';
  const SG = root.SG = root.SG || {};
  const TEST_GOLD = 1000000;
  const FORCE_LABEL = { true: '강화 100%: 켜짐', false: '강화 100%: 꺼짐' };
  const BANNER_TEXT = { true: 'TEST MODE · 강화 100%', false: 'TEST MODE · 강화 100% 꺼짐 (실제 확률)' };

  function showForceState(doc, on) {
    doc.querySelector('#testBannerText').textContent = BANNER_TEXT[on];
    doc.querySelector('#btnTestForce').textContent = FORCE_LABEL[on];
  }

  SG.extensions = (SG.extensions || []).concat(function testPanel(game) {
    const doc = root.document;
    const config = SG.config;
    game.addActions({
      testGold: () => {
        game.state().gold += TEST_GOLD;
        SG.fx.log(`[TEST] 골드 +${SG.fx.fmt(TEST_GOLD)}`, 'gold');
        game.commit();
      },
      testReset: () => {
        if (!root.confirm(`테스트 저장(${SG.C.SAVE_KEY})만 지우고 처음부터 시작할까요? 실제 게임 저장은 그대로입니다.`)) return;
        game.newGame();
      },
      testToggleForce: () => {
        config.forceSuccess = !config.forceSuccess;
        showForceState(doc, config.forceSuccess);
        game.commit();
      },
    });
    showForceState(doc, config.forceSuccess);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
