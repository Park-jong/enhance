/* 테스트 페이지(test.html) 전용 실행 설정. js/constants.js보다 먼저 로드해야 한다.
 * 실제 게임 코드는 그대로 쓰고 설정만 바꾼다: 강화 성공 100%, 별도 저장 키, v1 저장은 읽지 않음.
 * 손상 백업 키는 저장 키에서 파생되므로 'sword-enhance-test-corrupt'가 된다.
 * 주의: forceSuccess는 테스트 페이지 전용이다. 실제 페이지(index.html)에서는 절대 켜지 않는다.
 */
(function (root) {
  'use strict';
  const SG = root.SG = root.SG || {};
  SG.config = Object.assign({}, SG.config, {
    saveKey: 'sword-enhance-test',
    legacySaveKey: null,
    forceSuccess: true,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
