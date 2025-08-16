/* global window, document, customElements */
(function () {
  // Load CSS once
  const cssUrl = new URL('./styles.css', import.meta.url);

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

    // --- SAC lifecycle hooks ---
    onCustomWidgetBeforeUpdate(changedProps) {
      this.props = { ...this.props, ...changedProps };
    }

    onCustomWidgetAfterUpdate(changedProps) {
      this.props = { ...this.props, ...changedProps };
      this._applyTheme();
      if (this._initialized) return;
      this._initialized = true;
      if (this.props.welcomeText) {
        this._pushAssistant(this.props.welcomeText);
      }
    }

    // --- Apply theming into CSS variables ---
    _applyTheme() {
      const r = this.shadowRoot.host.style;
      const p = this.props;
      r.setProperty('--pc-primary', p.primaryColor || '#1f4fbf');
      r.setProperty('--pc-primaryDark', p.primaryDark || '#163a8a');
      r.setProperty('--pc-accent', p.accentColor || '#3cc0ff');
      r.setProperty('--pc-surface', p.surfaceColor || '#ffffff');
      r.setProperty('--pc-surfaceAlt', p.surfaceAlt || '#f6f8ff');
      r.setProperty('--pc-text', p.textColor || '#0b1221');
    }

    // --- Rendering ---
    _render() {
      this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="${cssUrl}">
        <div class="pcg-wrapper">
          <div class="pcg-header">
            <div class="pcg-title">
              <span class="pcg-avatar">🤖</span>
              <span>PerciBot</span>
            </div>
            <span class="pcg-chip">AI Assistant</span>
          </div>
          <div id="msgs" class="pcg-messages" role="log" aria-live="polite"></div>
          <div class="pcg-note" id="note"></div>
          <div class="pcg-footer">
            <textarea id="input" class="pcg-input" rows="1" placeholder="Type your message here..."></textarea>
            <button id="send" class="pcg-btn">Send</button>
          </div>
        </div>
      `;

      this.$msgs  = this.shadowRoot.getElementById('msgs');
      this.$note  = this.shadowRoot.getElementById('note');
      this.$input = this.shadowRoot.getElementById('input');
      this.$send  = this.shadowRoot.getElementById('send');

      this.$send.addEventListener('click', () => this._send());
      this.$input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._send();
        }
      });

      this._updateNote();
    }

    _updateNote() {
      const keyOk   = !!(this.props.apiKey && this.props.apiKey.startsWith('sk-'));
      const modelOk = !!this.props.model;
      this.$note.textContent = keyOk && modelOk
        ? `Model: ${this.props.model}`
        : `⚠️ Add API Key and pick a model in the Builder panel to enable PerciBot replies.`;
    }

    // --- Chat helpers ---
    _scrollToBottom() {
      this.$msgs.scrollTop = this.$msgs.scrollHeight;
    }

    _pushUser(text) {
      this._messages.push({ role: 'user', content: text });
      const el = document.createElement('div');
      el.className = 'pcg-msg user';
      el.textContent = text;
      this.$msgs.appendChild(el);
      this._scrollToBottom();
    }

    _pushAssistant(text) {
      this._messages.push({ role: 'assistant', content: text });
      const el = document.createElement('div');
      el.className = 'pcg-msg assist';
      el.textContent = text;
      this.$msgs.appendChild(el);
      this._scrollToBottom();
    }

    async _send() {
      const text = (this.$input.value || '').trim();
      if (!text) return;

      // show user message
      this._pushUser(text);
      this.$input.value = '';

      // validate
      if (!this.props.apiKey) {
        this._pushAssistant('⚠️ API key missing. Set it in the Builder panel.');
        return;
      }

      // show typing indicator
      const typing = document.createElement('div');
      typing.className = 'pcg-msg assist';
      typing.textContent = '…';
      this.$msgs.appendChild(typing);
      this._scrollToBottom();

      try {
        const reply = await this._callOpenAI(text);
        typing.remove();
        this._pushAssistant(reply || '(no response)');
      } catch (err) {
        typing.remove();
        console.error(err);
        this._pushAssistant(`Error: ${err?.message || err}`);
      }
    }

    async _callOpenAI(latestUserText) {
      // Build full conversation (last 20 turns)
      const history = this._messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-20);

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
        headers: {
          'Authorization': `Bearer ${this.props.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        throw new Error(`OpenAI returned ${res.status}: ${errTxt}`);
      }

      const data = await res.json();
      return data?.choices?.[0]?.message?.content?.trim();
    }
  }

  // Register once
  if (!customElements.get('perci-bot')) {
    customElements.define('perci-bot', PerciBot);
  }
})();
