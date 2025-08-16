/* PerciBot Builder stub - enables SAC Builder property panel */
(function () {
  class PerciBotBuilder extends HTMLElement {
    constructor() { super(); }
    onCustomWidgetBeforeUpdate() {}
    onCustomWidgetAfterUpdate() {}
  }
  try {
    if (!customElements.get('perci-bot-builder')) {
      customElements.define('perci-bot-builder', PerciBotBuilder);
    }
  } catch (e) {
    console.warn('PerciBot builder define warning:', e);
  }
})();
