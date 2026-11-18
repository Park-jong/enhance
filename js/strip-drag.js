/* 보관함 칸 드래그 제스처 (브라우저 전용). HTML5 drag-and-drop은 터치에서 동작하지 않아 Pointer Events로 처리한다.
 * 마우스·펜: DRAG_THRESHOLD_PX 이상 움직이면 시작(그 전에 떼면 평소 클릭).
 * 터치: DRAG_LONG_PRESS_MS 동안 누르고 있어야 시작. 그 전에 움직이면 스트립 가로 스크롤에 양보한다.
 * 순서 변경 자체는 하지 않고 onEnd(id, toIndex)로 알린다. toIndex는 끌던 검을 뺀 나머지 검 사이 자리(R.moveSword와 같은 뜻),
 * 취소되면 null. 드래그 뒤에 따라오는 click은 삼켜서 활성 전환이 일어나지 않게 한다.
 */
(function (root) {
  'use strict';
  const SG = root.SG = root.SG || {};
  const MARKERS = ['drop-before', 'drop-after'];

  /** 나머지 카드들의 중심 x(화면 순서)와 포인터 x → 놓을 자리 */
  const dropIndex = (centers, x) => centers.filter(c => c < x).length;
  const centerX = el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };

  /**
   * opts: { item: 끌 수 있는 카드 선택자(data-sword에 검 id), canStart(): 지금 시작해도 되는지,
   *         onStart(id), onEnd(id, toIndex|null) }
   */
  function createStripDrag(strip, opts) {
    const C = SG.C;
    let g = null;                 // 진행 중인 제스처
    let swallowClick = false;

    const items = () => [...strip.querySelectorAll(opts.item)];
    const others = () => items().filter(el => el !== g.el);
    const clearMarkers = () => items().forEach(el => el.classList.remove(...MARKERS));

    function showMarker() {
      clearMarkers();
      const list = others();
      if (g.index === g.from || !list.length) return;
      if (g.index < list.length) list[g.index].classList.add('drop-before');
      else list[list.length - 1].classList.add('drop-after');
    }

    function begin() {
      // 시작 전에 보관함이 다시 그려져 카드가 떨어져 나갔으면 같은 검의 새 카드를 찾고, 없으면 취소한다
      if (g.el.isConnected === false) {
        const fresh = items().find(el => el.dataset.sword === String(g.id));
        if (!fresh) { finish(); return false; }
        g.el = fresh;
      }
      g.dragging = true;
      g.from = items().indexOf(g.el);
      g.index = g.from;
      g.el.classList.add('dragging');
      strip.classList.add('drag-on');
      try { g.el.setPointerCapture(g.pointerId); } catch (e) { /* 이미 떼어진 포인터 */ }
      opts.onStart(g.id);
      return true;
    }

    function autoScroll(x) {
      const r = strip.getBoundingClientRect();
      if (x < r.left + C.DRAG_EDGE_PX) strip.scrollLeft -= C.DRAG_SCROLL_STEP_PX;
      else if (x > r.right - C.DRAG_EDGE_PX) strip.scrollLeft += C.DRAG_SCROLL_STEP_PX;
    }

    function follow(x) {
      autoScroll(x);
      g.el.style.transform = `translateX(${x - g.x0 + strip.scrollLeft - g.scroll0}px)`;
      g.index = dropIndex(others().map(centerX), x);
      showMarker();
    }

    /** 제스처를 정리하고, 드래그였다면 { id, index } 를 돌려준다 */
    function finish() {
      if (!g) return null;
      const done = g.dragging ? { id: g.id, index: g.index } : null;
      clearTimeout(g.timer);
      if (g.dragging) {
        g.el.classList.remove('dragging');
        g.el.style.transform = '';
        strip.classList.remove('drag-on');
        clearMarkers();
      }
      g = null;
      return done;
    }

    /** 진행 중인 제스처를 취소한다. 드래그였다면 onEnd(id, null) */
    function cancel() {
      const done = finish();
      if (done) opts.onEnd(done.id, null);
    }

    const own = e => !!g && e.pointerId === g.pointerId;

    strip.addEventListener('pointerdown', e => {
      swallowClick = false;
      // 스트립 밖에서 떼어 끝나지 않은 제스처가 남아 있으면 취소로 정리한다
      const stale = finish();
      if (stale) opts.onEnd(stale.id, null);
      const el = e.target.closest(opts.item);
      if (!el || !e.isPrimary || e.button !== 0 || !opts.canStart()) return;
      g = {
        id: +el.dataset.sword, el, pointerId: e.pointerId, touch: e.pointerType === 'touch',
        x0: e.clientX, y0: e.clientY, scroll0: strip.scrollLeft, dragging: false, from: -1, index: -1, timer: 0,
      };
      // 여기서 capture하면 click 대상이 #strip으로 바뀌어 카드 클릭 위임이 죽는다(V3). capture는 begin()에서만 한다
      if (g.touch) g.timer = setTimeout(() => { if (g && opts.canStart()) begin(); }, C.DRAG_LONG_PRESS_MS);
    });

    strip.addEventListener('pointermove', e => {
      if (!own(e)) return;
      // 버튼이 이미 떼어졌는데 up을 못 받은 마우스·펜 제스처는 취소로 정리한다
      if (!g.touch && !(e.buttons & 1)) { cancel(); return; }
      if (!g.dragging) {
        if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < C.DRAG_THRESHOLD_PX) return;
        if (g.touch || !opts.canStart()) { finish(); return; }
        if (!begin()) return;
      }
      follow(e.clientX);
    });

    strip.addEventListener('pointerup', e => {
      if (!own(e)) return;
      const done = finish();
      if (!done) return;
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 0);   // 뒤따르는 click이 없으면(키보드 등) 남기지 않는다
      opts.onEnd(done.id, done.index);
    });

    strip.addEventListener('pointercancel', e => {
      if (!own(e)) return;
      cancel();
    });

    // 캡처 단계에서 막아 문서의 data-act 클릭 처리(활성 전환)까지 가지 않게 한다
    strip.addEventListener('click', e => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);

    // 길게 눌러 시작한 터치 드래그 중에는 스크롤·길게 누르기 메뉴를 막는다
    strip.addEventListener('touchmove', e => { if (g && g.dragging) e.preventDefault(); }, { passive: false });
    strip.addEventListener('contextmenu', e => { if (g && g.touch) e.preventDefault(); });

    return { cancel };
  }

  SG.createStripDrag = createStripDrag;
})(typeof globalThis !== 'undefined' ? globalThis : this);
