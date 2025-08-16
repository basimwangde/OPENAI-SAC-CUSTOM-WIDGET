/* PerciBot - SAC custom widget (no external CSS) */
(function () {
  const STYLES = `
:host{
  --pc-primary:#1f4fbf;--pc-primaryDark:#163a8a;--pc-accent:#3cc0ff;
  --pc-surface:#ffffff;--pc-surfaceAlt:#f6f8ff;--pc-text:#0b1221;
  font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;display:block;height:100%;color:var(--pc-text)
}
.pcg-wrapper{height:100%;display:grid;grid-template-rows:auto 1fr auto;background:var(--pc-surface);
  border:1px solid rgba(12,23,45,.06);border-radius:16px;overflow:hidden;
  box-shadow:0 1px 2px rgba(5,16,42,.06),0 8px 24px rgba(5,16,42,.06)}
.pcg-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;
  background:linear-gradient(90deg,var(--pc-primaryDark),var(--pc-primary));color:#fff}
.pcg-title{display:flex;align-items:center;gap:10px;font-weight:700}
.pcg-avatar{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:10px;
  background:rgba(255,255,255,.14);backdrop-filter:blur(4px)}
.pcg-chip{font-size:12px;font-weight:600;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.16);
  border:1px solid rgba(255,255,255,.28)}
.pcg-messages{padding:14px 14px 4px;overflow:auto;background:
  radial-gradient(1200px 300px at 0% -20%,rgba(60,192,255,.10),transparent 60%),
  linear-gradient(#fff,var(--pc-surfaceAlt))}
.pcg-msg{max-width:80%;margin:8px 0;padding:12px 14px;border-radius:14px;line-height:1.35;white-space:pre-wrap;
  word-wrap:break-word;box-shadow:0 1px 0 rgba(5,16,42,.03)}
.pcg-msg.user{margin-left:auto;color:#0b1221;background:
  linear-gradient(180deg,rgba(60,192,255,.25),rgba(60,192,255,.18));border:1px solid rgba(28,119,220,.25);
  backdrop-filter:blur(2px)}
.pcg-msg.assist{margin-right:auto;background:#fff;border:1px solid rgba(12,23,45,.08)}
.pcg-note{font-size:12px;color:rgba(11,18,33,.75);padding:4px 14px 0 14px}
.pcg-footer{display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px;border-top:1px solid rgba(12,23,45,.06);
  background:var(--pc-surface)}
.pcg-input{width:100%;border:1px solid rgba(12,23,45,.18);border-radius:12px;padding:11px 12px;outline:none;background:#fff;
  box-shadow:inset 0 0 0 2px transparent;transition:box-shadow .15s ease,border-color .15s ease}
.pcg-input:focus{border-color:rgba(31,79,191,.65);box-shadow:inset 0 0 0 2px rgba(60,192,255,.25)}
.pcg-btn{min-width:92px;border:none;border-radius:12px;padding:11px 16px;cursor:pointer;
  background:linear-gradient(180deg,var(--pc-primary),var(--pc-primaryDark));color:#fff;font-weight:700;letter-spacing:.2px;
  box-shadow:0 6px 14px rgba(31,79,191,.32);transition:transform .06s ease,filter .15s ease,box-shadow .15s ease}
.pcg-btn:hover{filter:brightness(1.05)}
.pcg-btn:active{transform:translateY(1px)}
@media (max-width:560px){.pcg-msg{max-width:92%}}
  `;

  class PerciBot extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.props = {
        apiKey: '',
        model: 'gpt-3.5-turbo',
        systemPrompt: 'You are PerciBot, a helpful and concise assistant for SAP Analytics Cloud.',
        welcomeText: 'Hello, I’m PerciBot! How can I assist you today?',
        primaryColor: '#1f4fbf',
        primaryDark: '#163a8a',
        accentColor: '#3cc0ff',
        surfaceColor: '#ffffff',
        surfaceAlt: '#f6f8ff',
        textColor: '#0b1221'
      };
      this._messages = [];
      this._render();
    }

    /* SAC lifecycle */
    onCustomWidgetBeforeUpdate(changedProps) {
      this.props = { ...this.props, ...changedProps };
    }

    onCustomWidgetAfterUpdate(changedProps) {
      this.props = { ...this.props, ...changedProps };
      this._applyTheme();
      if (this._initialized) return;
      this._initialized = true;
      if (this.props.welcomeText) this._pushAssistant(this.props.welcomeText);
    }

    /* theming -> CSS variables */
    _applyTheme() {
      const r = this.shadowRoot.host.style, p = this.props || {};
      r.setProperty('--pc-primary', p.primaryColor || '#1f4fbf');
      r.setProperty('--pc-primaryDark', p.primaryDark || '#163a8a');
      r.setProperty('--pc-accent', p.accentColor || '#3cc0ff');
      r.setProperty('--pc-surface', p.surfaceColor || '#ffffff');
      r.setProperty('--pc-surfaceAlt', p.surfaceAlt || '#f6f8ff');
      r.setProperty('--pc-text', p.textColor || '#0b1221');
    }

    /* UI */
    _render() {
      this.shadowRoot.innerHTML = `
        <style>${STYLES}</style>
        <div class="pcg-wrapper">
          <div class="pcg-header">
            <div class="pcg-title"><span class="pcg-avatar">🤖</span><span>PerciBot</span></div>
            <span class="pcg-chip">AI Assistant</span>
          </div>
          <div id="msgs" class="pcg-messages" role="log" aria-live="polite"></div>
          <div class="pcg-note" id="note"></div>
          <div class="pcg-footer">
            <textarea id="input" class="pcg-input" rows="1" placeholder="Type your message here..."></textarea>
            <button id="send" class="pcg-btn">Send</button>
          </div>
        </div>`;
      this.$msgs  = this.shadowRoot.getElementById('msgs');
      this.$note  = this.shadowRoot.getElementById('note');
      this.$input = this.shadowRoot.getElementById('input');
      this.$send  = this.shadowRoot.getElementById('send');

      this.$send.addEventListener('click', () => this._send());
      this.$input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
      this._updateNote();
    }

    _updateNote() {
      const keyOk = !!(this.props.apiKey && this.props.apiKey.startsWith('sk-'));
      const modelOk = !!this.props.model;
      this.$note.textContent = keyOk && modelOk
        ? `Model: ${this.props.model}`
        : `⚠️ Add API Key and pick a model in the Builder panel to enable PerciBot replies.`;
    }

    _scrollToBottom() { this.$msgs.scrollTop = this.$msgs.scrollHeight; }

    _pushUser(text) {
      this._messages.push({ role: 'user', content: text });
      const el = document.createElement('div'); el.className = 'pcg-msg user'; el.textContent = text;
      this.$msgs.appendChild(el); this._scrollToBottom();
    }

    _pushAssistant(text) {
      this._messages.push({ role: 'assistant', content: text });
      const el = document.createElement('div'); el.className = 'pcg-msg assist'; el.textContent = text;
      this.$msgs.appendChild(el); this._scrollToBottom();
    }

    async _send() {
      const text = (this.$input.value || '').trim(); if (!text) return;
      this._pushUser(text); this.$input.value = '';
      if (!this.props.apiKey) { this._pushAssistant('⚠️ API key missing. Set it in the Builder panel.'); return; }

      const typing = document.createElement('div');
      typing.className = 'pcg-msg assist'; typing.textContent = '…';
      this.$msgs.appendChild(typing); this._scrollToBottom();

      try {
        const reply = await this._callOpenAI(text);
        typing.remove(); this._pushAssistant(reply || '(no response)');
      } catch (err) {
        typing.remove(); console.error(err);
        this._pushAssistant(`Error: ${err && err.message ? err.message : err}`);
      }
    }

    async _callOpenAI(latestUserText) {
      const history = this._messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-20);
      const body = {
        model: this.props.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: this.props.systemPrompt || 'You are PerciBot, a helpful assistant.' },
          ...history,
          { role: 'user', content: latestUserText }
        ],
        temperature: 0.7
      };

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.props.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        throw new Error(`OpenAI returned ${res.status}: ${errTxt}`);
      }
      const data = await res.json();
      return data && data.choices && data.choices[0] && data.choices[0].message
        ? (data.choices[0].message.content || '').trim()
        : '';
    }
  }

  try {
    if (!customElements.get('perci-bot')) customElements.define('perci-bot', PerciBot);
  } catch (e) {
    // If define fails (duplicate, CSP, etc.), log but avoid crashing SAC loader.
    console.error('PerciBot define failed:', e);
  }
})();
