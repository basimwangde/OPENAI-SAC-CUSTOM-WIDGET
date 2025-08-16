/* PerciBot — SAC Chat Widget (no Configure modal; reads Builder properties only) */
(function () {
  const tpl = document.createElement('template');
  tpl.innerHTML = `
    <style>
      :host { display:block; height:100%; font:14px/1.45 var(--sapFontFamily, "72", Arial); color:#0b1221 }
      .wrap{height:100%; display:flex; flex-direction:column; box-sizing:border-box; background:#fff}
      header{
        display:flex; align-items:center; justify-content:space-between; padding:10px 14px;
        color:#fff; border-radius:10px; margin:10px; min-height:42px;
      }
      .brand{font-weight:700}
      .chip{font-size:12px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,.2)}
      .body{flex:1; display:flex; flex-direction:column; gap:10px; padding:10px}
      .panel{
        flex:1; overflow:auto; border:1px solid #e7eaf0; border-radius:12px; padding:10px;
        background:#f7f9fc
      }
      .msg{max-width:85%; margin:6px 0; padding:10px 12px; border-radius:14px; box-shadow:0 1px 2px rgba(0,0,0,.04)}
      .user{ margin-left:auto; }
      .inputRow{ display:flex; gap:8px; align-items:flex-start }
      textarea{
        flex:1; resize:vertical; min-height:64px; max-height:220px;
        padding:10px 12px; border:1px solid #d0d3da; border-radius:12px; background:#fff; outline:none;
      }
      textarea:focus{ border-color:#4d9aff; box-shadow:0 0 0 2px rgba(77,154,255,.15) }
      button{
        padding:10px 14px; border:1px solid #d0d3da; border-radius:12px; background:#fff; cursor:pointer
      }
      button.primary{ color:#fff; border-color:transparent }
      button:disabled{ opacity:.5; cursor:not-allowed }
      .muted{opacity:.7; font-size:12px}
      .footer{display:flex; justify-content:space-between; align-items:center; padding:0 10px 10px}
    </style>
    <div class="wrap">
      <header>
        <div class="brand">PerciBOT</div>
        <div class="chip" id="modelChip"></div>
      </header>

      <div class="body">
        <div class="panel" id="chat"></div>

        <div class="inputRow">
          <textarea id="input" placeholder="Ask anything about your analytics…"></textarea>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button id="send" class="primary">Send</button>
            <button id="clear">Clear</button>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="muted" id="hint"></div>
        <div class="muted"><a href="www.percipere.co">Percipere Consulting</a></div>
      </div>
    </div>
  `;

  class PerciBot extends HTMLElement {
    constructor () {
      super();
      this._shadowRoot = this.attachShadow({ mode: 'open' });
      this._shadowRoot.appendChild(tpl.content.cloneNode(true));
      this.$ = (id) => this._shadowRoot.getElementById(id);

      this.$chat  = this.$('chat');
      this.$input = this.$('input');
      this.$send  = this.$('send');
      this.$clear = this.$('clear');
      this.$modelChip = this.$('modelChip');
      this.$hint = this.$('hint');

      this.$send.addEventListener('click', () => this._send());
      this.$clear.addEventListener('click', () => (this.$chat.innerHTML = ''));

      this._props = {
        apiKey: '',
        model: 'gpt-3.5-turbo',
        systemPrompt: 'You are PerciBot, a helpful and concise assistant for SAP Analytics Cloud.',
        welcomeText: 'Hello, I’m PerciBot! How can I assist you?',
        // theme
        primaryColor: '#1f4fbf',
        primaryDark:  '#163a8a',
        surfaceColor: '#ffffff',
        surfaceAlt:   '#f6f8ff',
        textColor:    '#0b1221',
        linkId: ''
      };
      this._boundRows = []; // <-- holds data from myData binding (DB variant)
      this._schema    = [];   // column keys after flattening

      window.addEventListener('percibot-config-broadcast', (e) => {
      const detail = e && e.detail;
      if (!detail) return;

      const inboundLink = (detail.linkId || '').trim();
      const myLink      = (this._props.linkId || '').trim();
      if (!inboundLink || !myLink || inboundLink !== myLink) return;

      // Apply config from the Config widget to this instance
      const incomingProps = detail.props || {};
      // Optional: restrict which keys can be overridden
      const safe = {
        apiKey: incomingProps.apiKey,
        model: incomingProps.model,
        systemPrompt: incomingProps.systemPrompt,
        welcomeText: incomingProps.welcomeText,
        primaryColor: incomingProps.primaryColor,
        primaryDark: incomingProps.primaryDark,
        surfaceColor: incomingProps.surfaceColor,
        surfaceAlt: incomingProps.surfaceAlt,
        textColor: incomingProps.textColor,
        linkId: incomingProps.linkId
      };
      this.setProperties(safe);

      // Subtle UX hint so you know the hand-shake happened
      try { this.$modelChip.textContent += ' · Linked✔'; } catch(_) {}
    });

    }

    connectedCallback() {
      // initial welcome once mounted (content empty)
      if (!this.$chat.innerHTML && this._props.welcomeText) {
        this._append('bot', this._props.welcomeText);
      }
    }

    onCustomWidgetBeforeUpdate(changedProps) {
      if (changedProps.dataBinding && changedProps.dataBinding.data) {
        this._boundRows = changedProps.dataBinding.data;
      }
    }

   // helper: flatten SAC binding rows (dimension.label, measure.raw)
    _flattenBindingRows(binding) {
      if (!binding || !Array.isArray(binding.data)) return [];
      return binding.data.map(row => {
        const o = {};
        Object.keys(row).forEach(k => {
          const v = row[k];
          if (v && typeof v === 'object') {
            if ('raw' in v)   o[k] = v.raw;   // measures
            else if ('label' in v) o[k] = v.label; // dimensions
            else o[k] = String(v);
          } else {
            o[k] = v;
          }
        });
        return o;
      });
    }


    onCustomWidgetAfterUpdate(changedProps = {}) {
      Object.assign(this._props, changedProps);

      if (changedProps.linkId) {
      this._props.linkId = changedProps.linkId;
      if (this.dataBinding && this.dataBinding.data && this.dataBinding.data.length) {
        this.boundRows = this.dataBinding.data; // available rows from linked widget
      }
}
      this._applyTheme();
      // this.$modelChip.textContent = this._props.model || '';
          // If the DB variant is used, SAC passes our binding by its id ("myData")
          this._isDB = !!changedProps.myData;

          
    if (this._isDB) {
      const flat = this._flattenBindingRows(changedProps.myData) || [];
      if (flat.length) {
        this._boundRows = flat;
        this._schema = Object.keys(flat[0]);
        this.$modelChip.textContent = `Bound: ${flat.length} row(s)`;
      } else {
        this._boundRows = [];
        this.$modelChip.textContent = 'AI Assistant';
      }
    } else {
      this.$modelChip.textContent = 'AI Assistant';
    }
      this.$hint.textContent = this._props.apiKey ? '' : 'API key not set – open Builder to configure';
      // if Builder changed welcome text and chat is empty, show it
      if (!this.$chat.innerHTML && this._props.welcomeText) {
        this._append('bot', this._props.welcomeText);
        if (this._boundRows.length) {
        this._append('bot', `I can analyze the data you bound to me.`);
      }
      }
    }
  // (optional) expose a getter if you’ll read it from app scripting later
    getBoundData() { return { schema: this._schema, rows: this._boundRows }; }


    setProperties(props) { this.onCustomWidgetAfterUpdate(props); } // older runtimes

    _applyTheme() {
      const wrap = this._shadowRoot.querySelector('.wrap');
      const header = this._shadowRoot.querySelector('header');
      const panel = this._shadowRoot.querySelector('.panel');
      const buttons = this._shadowRoot.querySelectorAll('button.primary');

      wrap.style.background = this._props.surfaceColor || '#ffffff';
      wrap.style.color = this._props.textColor || '#0b1221';
      panel.style.background = this._props.surfaceAlt || '#f6f8ff';
      header.style.background = `linear-gradient(90deg, ${this._props.primaryColor || '#1f4fbf'}, ${this._props.primaryDark || '#163a8a'})`;

      buttons.forEach(btn => {
        btn.style.background = `linear-gradient(90deg, ${this._props.primaryColor || '#1f4fbf'}, ${this._props.primaryDark || '#163a8a'})`;
      });
    }

    _append(role, text) {
      const b = document.createElement('div');
      b.className = `msg ${role === 'user' ? 'user' : 'bot'}`;
      b.textContent = text;
      // style bubbles against theme
      if (role === 'user') {
        b.style.background = '#97cdf2ff';
        b.style.border = '1px solid #e7eaf0';
        b.style.color = this._props.textColor || '#0b1221';
      } else {
        b.style.background = '#ffffff';
        b.style.border = '1px solid #e7eaf0';
        b.style.color = this._props.textColor || '#0b1221';
      }
      this.$chat.appendChild(b);
      this.$chat.scrollTop = this.$chat.scrollHeight;
    }

    async _send() {
      const q = (this.$input.value || '').trim();
      if (!q) return;
      this._append('user', q);
      this.$input.value = '';

      if (!this._props.apiKey) {
        this._append('bot', '⚠️ API key not set. Open the Builder panel to configure.');
        return;
      }

      try {
        const body = {
          model: this._props.model || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: this._props.systemPrompt || '' },
            { role: 'user', content: q }
          ]
        };

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._props.apiKey}`
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`${res.status} ${res.statusText}: ${txt}`);
        }

        const data = await res.json();
        const ans = data.choices?.[0]?.message?.content || '(No content)';
        this._append('bot', ans);
      } catch (e) {
        this._append('bot', `❌ ${e.message}`);
      }
    }
  }

  if (!customElements.get('perci-bot')) {
    customElements.define('perci-bot', PerciBot);
  }
})();
