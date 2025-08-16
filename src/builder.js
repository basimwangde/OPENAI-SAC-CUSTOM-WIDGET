/* PerciBot Builder – renders controls + persists properties */
(function () {
  const tpl = document.createElement('template');
  tpl.innerHTML = `
    <style>
      :host{display:block;font:14px/1.4 var(--sapFontFamily,Arial)}
      .f{margin:10px 0}
      label{display:block;font-weight:600;margin-bottom:4px}
      input,select,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #d0d3da;border-radius:6px}
      .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .hint{font-size:12px;opacity:.7;margin-top:4px}
    </style>

    <div class="f">
      <label>OpenAI API Key</label>
      <input id="apiKey" type="password" placeholder="sk-..." />
      <div class="hint">Stored with the story/app (not in code).</div>
    </div>

    <div class="row">
      <div class="f">
        <label>Model</label>
        <select id="model">
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
        </select>
      </div>
      <div class="f">
        <label>Welcome Text</label>
        <input id="welcomeText" type="text" placeholder="Hello, I’m PerciBot!…" />
      </div>
    </div>

    <div class="f">
      <label>System Prompt</label>
      <textarea id="systemPrompt" rows="3" placeholder="You are PerciBot…"></textarea>
    </div>

    <div class="row">
      <div class="f"><label>Primary</label>      <input id="primaryColor"  type="text" /></div>
      <div class="f"><label>Primary Dark</label> <input id="primaryDark"   type="text" /></div>
    </div>
    <div class="row">
      <div class="f"><label>Accent</label>       <input id="accentColor"   type="text" /></div>
      <div class="f"><label>Surface</label>      <input id="surfaceColor"  type="text" /></div>
    </div>
    <div class="row">
      <div class="f"><label>Surface Alt</label>  <input id="surfaceAlt"    type="text" /></div>
      <div class="f"><label>Text</label>         <input id="textColor"     type="text" /></div>
    </div>
  `;

  class PerciBotBuilder extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:'open'});
      this.shadowRoot.appendChild(tpl.content.cloneNode(true));
      this.$ = id => this.shadowRoot.getElementById(id);
      this.inputs = [
        'apiKey','model','systemPrompt','welcomeText',
        'primaryColor','primaryDark','accentColor','surfaceColor','surfaceAlt','textColor'
      ].map(this.$.bind(this));

      const onChange = () => this._emit();
      this.inputs.forEach(el => el.addEventListener('change', onChange));
      this.inputs.forEach(el => el.addEventListener('input',  onChange)); // live updates
    }

    // Called by SAC when the builder opens (initial load)
    onCustomWidgetBuilderInit(host) {
      this._apply(host && host.properties);
    }

    // Called if properties change from outside while builder is open
    onCustomWidgetAfterUpdate(changedProps) {
      this._apply(changedProps);
    }

    _apply(p = {}) {
      (this.$('apiKey').value       = p.apiKey ?? '');
      (this.$('model').value        = p.model ?? 'gpt-3.5-turbo');
      (this.$('systemPrompt').value = p.systemPrompt ?? '');
      (this.$('welcomeText').value  = p.welcomeText ?? '');
      (this.$('primaryColor').value = p.primaryColor ?? '#1f4fbf');
      (this.$('primaryDark').value  = p.primaryDark ?? '#163a8a');
      (this.$('accentColor').value  = p.accentColor ?? '#3cc0ff');
      (this.$('surfaceColor').value = p.surfaceColor ?? '#ffffff');
      (this.$('surfaceAlt').value   = p.surfaceAlt ?? '#f6f8ff');
      (this.$('textColor').value    = p.textColor ?? '#0b1221');
    }

    _emit() {
      const detail = {
        properties: {
          apiKey:       this.$('apiKey').value.trim(),
          model:        this.$('model').value,
          systemPrompt: this.$('systemPrompt').value,
          welcomeText:  this.$('welcomeText').value,
          primaryColor: this.$('primaryColor').value,
          primaryDark:  this.$('primaryDark').value,
          accentColor:  this.$('accentColor').value,
          surfaceColor: this.$('surfaceColor').value,
          surfaceAlt:   this.$('surfaceAlt').value,
          textColor:    this.$('textColor').value
        }
      };
      this.dispatchEvent(new CustomEvent('propertiesChanged', { detail }));
    }
  }

  if (!customElements.get('perci-bot-builder')) {
    customElements.define('perci-bot-builder', PerciBotBuilder);
  }
})();
