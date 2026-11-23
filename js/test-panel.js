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

  /** 특성 지정 선택지: 종류(TRAIT_KINDS 순서)와 등급(1..TRAIT_TIER_MAX)을 상수에서 채운다 */
  function fillTraitOptions(doc, C) {
    doc.querySelector('#testTraitKind').innerHTML =
      C.TRAIT_KINDS.map(k => `<option value="${k}">${C.TRAITS[k].name}</option>`).join('');
    doc.querySelector('#testTraitTier').innerHTML =
      C.TRAIT_TIER_NAME.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
  }

  /** 활성 검에 고른 특성을 지정한다(SG.rules.setTrait, 테스트 전용 규칙 함수) */
  function setActiveTrait(game, doc) {
    const { rules: R, fx: FX } = SG;
    const S = game.state();
    const sw = R.activeSword(S);
    if (!sw) return FX.toast('[TEST] 활성 검이 없습니다.', 'bad');
    const k = doc.querySelector('#testTraitKind').value;
    const t = Number(doc.querySelector('#testTraitTier').value);
    const r = R.setTrait(S, sw.id, k, t);
    if (!r.ok) return FX.toast(`[TEST] 특성을 지정하지 못했습니다 (${r.reason})`, 'bad');
    FX.log(`[TEST] +${sw.lv} 검 특성: ${SG.view.traitName(sw.trait)}`, 'info');
    game.commit();
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
      testSetTrait: () => setActiveTrait(game, doc),
    });
    showForceState(doc, config.forceSuccess);
    fillTraitOptions(doc, SG.C);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
