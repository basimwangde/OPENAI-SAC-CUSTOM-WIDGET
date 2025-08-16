/* PerciBot Builder – polished UI + explicit Update button */
(function () {
  const tpl = document.createElement('template');
  tpl.innerHTML = `
    <style>
      :host{display:block; font:14px/1.5 var(--sapFontFamily, "72", Arial); color:var(--sapTextColor,#0b1221)}
      .panel{padding:14px 16px}
      .section{margin:14px 0 18px}
      .title{font-weight:700; font-size:13px; letter-spacing:.2px; text-transform:uppercase; opacity:.7; margin:6px 0 10px}
      .grid{display:grid; grid-template-columns:1fr 1fr; gap:12px}
      .f{display:flex; flex-direction:column; gap:6px}
      label{font-weight:600}
      input, select, textarea{
        width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--sapList_BorderColor,#d0d3da);
        border-radius:8px; background:#fff; outline:none;
      }
      input:focus, select:focus, textarea:focus{border-color:#4d9aff; box-shadow:0 0 0 2px rgba(77,154,255,.15)}
      textarea{min-height:90px; resize:vertical}
      .row{display:grid; grid-template-columns:1fr 1fr; gap:12px}
      .hint{font-size:12px; opacity:.65}
      .danger{color:#b00020; font-size:12px}
      .toolbar{display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:16px; padding-top:12px; border-top:1px solid #e7eaf0}
      button{
        padding:10px 14px; border:1px solid #d0d3da; border-radius:10px; background:#fff; cursor:pointer
      }
      .primary{background:#1f4fbf; color:#fff; border-color:#1f4fbf}
      button[disabled]{opacity:.5; cursor:not-allowed}
      .keywrap{position:relative}
      .reveal{
        position:absolute; right:8px; top:50%; transform:translateY(-50%);
        background:transparent; border:none; cursor:pointer; opacity:.7; font-size:12px
      }
      .toast{
        position:fixed; right:18px; bottom:18px; padding:10px 14px; background:#0b8a3e; color:#fff;
        border-radius:10px; box-shadow:0 6px 18px rgba(0,0,0,.12); opacity:0; transform:translateY(8px);
        transition:all .25s ease
      }
      .toast.show{opacity:1; transform:translateY(0)}
      .chip{display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:#f5f7fb; border:1px solid #e7eaf0; font-size:12px}
    </style>

    <div class="panel">
      <div class="section">
        <div class="title">Connection</div>
        <div class="f keywrap">
          <label>OpenAI API Key</label>
          <input id="apiKey" type="password" placeholder="sk-..." />
          <button class="reveal" id="toggleKey" tabindex="-1">Show</button>
          <div class="hint">Stored with the story/app (not in code).</div>
        </div>
        <div class="grid" style="margin-top:10px">
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
            <input id="welcomeText" type="text" placeholder="Hello, I’m PerciBot! How can I assist you?" />
          </div>
        </div>
      </div>

      <div class="section">
        <div class="title">Behavior</div>
        <div class="f">
          <label>System Prompt</label>
          <textarea id="systemPrompt" placeholder="You are PerciBot, a helpful and concise assistant for SAP Analytics Cloud."></textarea>
        </div>
      </div>

      <div class="section">
        <div class="title">Theme</div>
        <div class="grid">
          <div class="f"><label>Primary</label>      <input id="primaryColor"  type="text" /></div>
          <div class="f"><label>Primary Dark</label> <input id="primaryDark"   type="text" /></div>
          <div class="f"><label>Accent</label>       <input id="accentColor"   type="text" /></div>
          <div class="f"><label>Surface</label>      <input id="surfaceColor"  type="text" /></div>
          <div class="f"><label>Surface Alt</label>  <input id="surfaceAlt"    type="text" /></div>
          <div class="f"><label>Text</label>         <input id="textColor"     type="text" /></div>
        </div>
        <div id="themeError" class="danger" style="margin-top:6px; display:none"></div>
      </div>

      <div class="toolbar">
        <span class="chip" id="statusChip">No changes</span>
        <button id="resetBtn">Reset</button>
        <button id="updateBtn" class="primary" disabled>Update</button>
      </div>
    </div>
    <div class="toast" id="toast">Saved</div>
  `;

  const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  class PerciBotBuilder extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:'open'});
      this.shadowRoot.appendChild(tpl.content.cloneNode(true));
      this.$ = id => this.shadowRoot.getElementById(id);

      this.keys = [
        'apiKey','model','systemPrompt','welcomeText',
        'primaryColor','primaryDark','accentColor','surfaceColor','surfaceAlt','textColor'
      ];
      this.inputs = this.keys.map(k => this.$(k));

      // UI bits
      this.$('toggleKey').addEventListener('click', () => {
        const inp = this.$('apiKey');
        inp.type = (inp.type === 'password' ? 'text' : 'password');
        this.$('toggleKey').textContent = inp.type === 'password' ? 'Show' : 'Hide';
      });

      const markDirty = () => this._setDirty(true);
      this.inputs.forEach(el => {
        el.addEventListener('input', markDirty);
        el.addEventListener('change', markDirty);
      });

      this.$('resetBtn').addEventListener('click', () => this._apply(this._initial));
      this.$('updateBtn').addEventListener('click', () => this._update());
    }

    onCustomWidgetBuilderInit(host) {
      this._apply((host && host.properties) || {});
      this._initial = {...this._props}; // keep a snapshot for reset
    }

    onCustomWidgetAfterUpdate(changedProps) {
      // external change → reflect without marking dirty
      this._apply(changedProps, /*external*/true);
    }

    _apply(p = {}, external = false) {
      this._props = {
        apiKey:       p.apiKey ?? '',
        model:        p.model ?? 'gpt-3.5-turbo',
        systemPrompt: p.systemPrompt ?? 'You are PerciBot, a helpful and concise assistant for SAP Analytics Cloud.',
        welcomeText:  p.welcomeText ?? 'Hello, I’m PerciBot! How can I assist you?',
        primaryColor: p.primaryColor ?? '#1f4fbf',
        primaryDark:  p.primaryDark ?? '#163a8a',
        accentColor:  p.accentColor ?? '#3cc0ff',
        surfaceColor: p.surfaceColor ?? '#ffffff',
        surfaceAlt:   p.surfaceAlt ?? '#f6f8ff',
        textColor:    p.textColor ?? '#0b1221'
      };

      // Push values to UI
      this.keys.forEach(k => { this.$(k).value = this._props[k]; });

      if (!external) this._setDirty(false);
      this._validateTheme();
    }

    _validateTheme() {
      const ids = ['primaryColor','primaryDark','accentColor','surfaceColor','surfaceAlt','textColor'];
      const bad = ids.filter(id => !HEX.test(this.$(id).value.trim()));
      const err = this.$('themeError');
      if (bad.length) {
        err.textContent = `Invalid HEX color(s): ${bad.map(id => id.replace(/([A-Z])/g,' $1').toLowerCase()).join(', ')}`;
        err.style.display = 'block';
      } else {
        err.style.display = 'none';
      }
      return bad.length === 0;
    }

    _setDirty(dirty) {
      this._dirty = !!dirty;
      this.$('updateBtn').disabled = !this._dirty || !this._validateTheme();
      this.$('statusChip').textContent = this._dirty ? 'Unsaved changes' : 'No changes';
    }

    _collect() {
      const get = id => this.$(id).value;
      return {
        apiKey:       get('apiKey').trim(),
        model:        get('model'),
        systemPrompt: get('systemPrompt'),
        welcomeText:  get('welcomeText'),
        primaryColor: get('primaryColor').trim(),
        primaryDark:  get('primaryDark').trim(),
        accentColor:  get('accentColor').trim(),
        surfaceColor: get('surfaceColor').trim(),
        surfaceAlt:   get('surfaceAlt').trim(),
        textColor:    get('textColor').trim()
      };
    }

    _update() {
      if (!this._validateTheme()) return;

      const props = this._collect();
      this.dispatchEvent(new CustomEvent('propertiesChanged', { detail: { properties: props }}));

      // reflect saved → not dirty
      this._props = {...props};
      this._setDirty(false);

      // toast
      const t = this.$('toast');
      t.classList.add('show');
      setTimeout(()=> t.classList.remove('show'), 1200);
    }
  }

  if (!customElements.get('perci-bot-builder')) {
    customElements.define('perci-bot-builder', PerciBotBuilder);
  }
})();
