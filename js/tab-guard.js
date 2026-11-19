/* 탭 잠금: 같은 저장 키를 다른 탭이 쓰면(storage 이벤트) 이 탭을 멈추고 잠금 화면을 띄운다.
 * 사용자가 '이 탭에서 계속하기'를 누를 때만 풀린다(자동 해제 없음, m1-storage 탭 잠금).
 * 창·저장소·DOM 요소와 멈춤/이어받기 동작은 주입한다(node 테스트 가능).
 * 브라우저: window.SG.createTabGuard / node: module.exports
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  SG.createTabGuard = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.createTabGuard;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * opts: {
   *   win: storage 이벤트를 받을 창, key: 지켜볼 저장 키, storageArea: 이 탭이 쓰는 저장소(clear 판정용),
   *   overlay: 잠금 화면, takeoverButton: '이 탭에서 계속하기', inertEls: 잠금 동안 포커스를 막을 영역들,
   *   onSuspend(): 멈출 때 정리, onTakeOver(): 잠금이 풀린 뒤 이어받기
   * }
   */
  function createTabGuard(opts) {
    let suspended = false;

    // 잠금 화면 뒤의 조작부에 키보드 포커스가 닿지 않게 하고, 포커스를 계속하기 버튼으로 옮긴다
    function setLocked(locked) {
      opts.overlay.hidden = !locked;
      opts.inertEls.forEach(el => { el.inert = locked; });
      if (locked) opts.takeoverButton.focus();
    }

    // key === null은 clear(). storageArea가 없는 이벤트(오래된 브라우저·테스트 스텁)는 예전처럼 clear로 본다
    const isClear = e => e.key === null && (!e.storageArea || e.storageArea === opts.storageArea);
    const concernsSave = e => e.key === opts.key || isClear(e);

    function suspend() {
      if (suspended) return;
      suspended = true;
      opts.onSuspend();
      setLocked(true);
    }
    /** 사용자가 이 탭을 고름: 잠금을 풀고 이어받는다 */
    function takeOver() {
      suspended = false;
      setLocked(false);
      opts.onTakeOver();
    }

    opts.win.addEventListener('storage', e => { if (concernsSave(e)) suspend(); });
    opts.takeoverButton.addEventListener('click', takeOver);
    setLocked(false);

    return {
      isSuspended: () => suspended,
      /** 멈춘 동안에는 입력을 무시 */
      whenActive: fn => (...args) => (suspended ? undefined : fn(...args)),
    };
  }

  return createTabGuard;
});
