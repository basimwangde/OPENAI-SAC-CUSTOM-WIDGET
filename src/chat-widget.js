/* PerciBot — SAC Chat Widget (Analytic App push mode: receives datasets via setProperties) */
;(function () {
  const tpl = document.createElement('template')
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
      .body {
        flex:1;
        display:flex;
        flex-direction:column;
        gap:10px;
        padding:10px;
        min-height:0;  /* important for flex scrolling */
      }
      .panel{
        flex:1;
        overflow-y:auto;   /* only vertical scrolling */
        overflow-x:hidden;
        border:1px solid #e7eaf0;
        border-radius:12px;
        padding:10px;
        background:#f7f9fc;
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

      .msg.bot p { margin: 6px 0; }
      .msg.bot ul, .msg.bot ol { padding-left: 20px; margin: 6px 0; }
      .msg.bot li { margin: 4px 0; }
      .msg.bot table { border-collapse: collapse; width: 100%; margin: 6px 0; }
      .msg.bot th, .msg.bot td { border: 1px solid #e7eaf0; padding: 6px 8px; text-align: left; }
      .msg.bot thead th { background: #f3f6ff; }
      .msg.bot code { background:#f1f3f7; padding:2px 4px; border-radius:4px; }
            .msg.bot.typing{ display:inline-flex; align-items:center; gap:8px; }
      .typing .dots{ display:inline-flex; gap:4px; }
      .typing .dots span{
        width:6px; height:6px; border-radius:50%;
        background:#c7ccd8; display:inline-block;
        animation: percibot-blink 1s infinite ease-in-out;
      }
      .typing .dots span:nth-child(2){ animation-delay:.15s }
      .typing .dots span:nth-child(3){ animation-delay:.30s }

      @keyframes percibot-blink{
        0%{ opacity:.2; transform:translateY(0) }
        20%{ opacity:1; transform:translateY(-2px) }
        100%{ opacity:.2; transform:translateY(0) }
      }

            header{ position:relative; } /* anchor for drawer */
      .chip{ cursor:pointer; }

      #dsDrawer{
        position:absolute; right:14px; top:58px; z-index:10;
        max-width:420px; max-height:240px; overflow:auto;
        background:#fff; border:1px solid #e7eaf0; border-radius:10px;
        box-shadow:0 12px 28px rgba(0,0,0,.12); padding:10px; font-size:12px; display:none;
      }
      #dsDrawer .ds{padding:6px 4px; border-bottom:1px dashed #eee;}
      #dsDrawer .ds:last-child{border-bottom:none;}
      #dsDrawer .name{font-weight:700;}

      .panel { position:relative; }
      .msg.bot.typing{ position:sticky; bottom:0; }

    </style>
    <div class="wrap">
      <header>
        <div class="brand">PerciBOT</div>
        <div class="chip" id="modelChip"></div>
        <div id="dsDrawer"></div>

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
        <div class="muted"><a href="https://www.linkedin.com/in/basim-wangde/" target="_blank" >Basim Wangde</a></div>
      </div>
    </div>
  `

  class PerciBot extends HTMLElement {
    constructor () {
      super()
      this._shadowRoot = this.attachShadow({ mode: 'open' })
      this._shadowRoot.appendChild(tpl.content.cloneNode(true))
      this.$ = id => this._shadowRoot.getElementById(id)

      this.$chat = this.$('chat')
      this.$input = this.$('input')
      this.$send = this.$('send')
      this.$clear = this.$('clear')
      this.$modelChip = this.$('modelChip')
      this.$hint = this.$('hint')

      this.$send.addEventListener('click', () => this._send())
      this.$clear.addEventListener('click', () => (this.$chat.innerHTML = ''))

      this._props = {
        apiKey: '',
        model: 'gpt-3.5-turbo',
        systemPrompt:
          'You are PerciBot, a helpful and concise assistant for SAP Analytics Cloud.',
        welcomeText: 'Hello, I’m PerciBot! How can I assist you?',
        datasets: '', // JSON string pushed from Analytic App: { Sales:{schema:[],rows:[]}, ... }
        // theme
        primaryColor: '#1f4fbf',
        primaryDark: '#163a8a',
        surfaceColor: '#ffffff',
        surfaceAlt: '#f6f8ff',
        textColor: '#0b1221'
      }
      this._datasets = {} // parsed datasets
    }

    connectedCallback () {
      if (!this.$chat.innerHTML && this._props.welcomeText) {
        this._append('bot', this._props.welcomeText)
      }

      this.$modelChip.addEventListener('click', () => {
        const d = this._shadowRoot.getElementById('dsDrawer')
        d.style.display =
          d.style.display === 'none' || !d.style.display ? 'block' : 'none'
      })
    }

    _applyDatasets (jsonStr) {
      try {
        const raw = JSON.parse(jsonStr || '{}') || {}
        const rebuilt = {}
        Object.keys(raw).forEach(name => {
          const { schema = [], rows2D = [] } = raw[name] || {}
          const rows = rows2D.map(arr => {
            const o = {}
            for (let i = 0; i < schema.length; i++) o[schema[i]] = arr[i]
            return o
          })
          rebuilt[name] = { schema, rows, rows2D }
        })
        this._datasets = rebuilt
        console.log('datasets', this._datasets)
        const tag = Object.entries(this._datasets)
          .map(([k, v]) => `${k}: ${v.rows?.length || 0} rows`)
          .join(' · ')
        // this.$modelChip.textContent = tag || 'AI Assistant'

        this._updateDatasetsUI()

        // nice first-time nudge
        if (!this.$chat.innerHTML && Object.keys(this._datasets).length) {
          this._append(
            'bot',
            'Datasets received. Ready to answer any analytical questions! '
          )
        }
      } catch (e) {
        this._datasets = {}
        // this.$modelChip.textContent = 'AI Assistant'
        this._updateDatasetsUI()
      }
    }

    onCustomWidgetAfterUpdate (changedProps = {}) {
      Object.assign(this._props, changedProps)
      this._applyTheme()

      console.log('datasets', changedProps)
      // Show API key hint
      this.$hint.textContent = this._props.apiKey
        ? 'AI can make mistakes. Please verify results.'
        : 'API key not set – open Builder to configure'

      // Parse pushed datasets (if any)
      if (typeof changedProps.datasets === 'string') {
        try {
          if (changedProps.datasets != '') {
            changedProps.datasets =
              '{"TEAM_UTILIZATION": {"schema": ["Team", "Net Availability (Days)", "Project Billable Days", "Project NB Days", "Internal Time", "Billable Util %", "White Space %", "White Space Days"], "types": ["string", "number", "number", "number", "number", "number", "number", "number"], "rows2D": [["Team", 0, 0, 0, 0, 0, 0, 0], ["Event management", 1176.0, 606.54, 0, 15.0, 0.5157653061224489, 0.4714795918367346, 554.46], ["Project Management", 371.5, 249.5, 25.0, 0, 0.6716016150740242, 0.2611036339165545, 97.0], ["Sales", 655.0, 203.0, 0, 0, 0.3099236641221374, 0.6900763358778625, 452.0], ["Technology", 928.0, 280.5, 2.0, 0, 0.3022629310344827, 0.6955818965517241, 645.5]]}, "RESOURCE_UTILIZATION": {"schema": ["Team", "Resource", "FTE Type", "Net Availability (Days)", "Project Billable Days", "Project NB Days", "Internal Time", "Billable Util %", "White Space %", "White Space Days"], "types": ["string", "string", "string", "number", "number", "number", "number", "number", "string", "number"], "rows2D": [["Event management", "Robert Davis", "Part Time", 11.0, 123.5, 0, 0, 11.227, "-1022.73%", -112.5], ["Event management", "Natalie Thompson", "Full Time", 262.0, 80.0, 0, 0, 0.305, "69.47%", 182.0], ["Event management", "Savitha Krishnamurthi", "Part Time", 131.0, 33.0, 0, 0, 0.252, "74.81%", 98.0], ["Event management", "Mykhailo Ivanenko", "Part Time", 131.0, 84.0, 0, 0, 0.641, "35.88%", 47.0], ["Event management", "Laura Lewis", "Full Time", 262.0, 90.0, 0, 0, 0.344, "65.65%", 172.0], ["Event management", "Andrew Allen", "Full Time", 248.0, 69.04, 0, 15.0, 0.278, "66.11%", 163.96], ["Event management", "Samantha Young", "Full Time", 131.0, 127.0, 0, 0, 0.969, "3.05%", 4.0], ["Project Management", "Anna Schmidt", "Part Time", 43.5, 36.0, 2.0, 0, 0.828, "12.64%", 5.5], ["Project Management", "Satish Joshi", "Full Time", 66.0, 48.5, 0, 0, 0.735, "26.52%", 17.5], ["Project Management", "Thomas Wilson", "Full Time", 262.0, 87.0, 0, 0, 0.332, "66.79%", 175.0], ["Project Management", "Christopher Garcia", "Full Time", 0, 78.0, 23.0, 0, 0, null, -101.0], ["Sales", "Olivia Martinez", "Full Time", 0, 2.5, 0, 0, 0, null, -2.5], ["Sales", "Linda Anderson", "Part Time", 131.0, 118.5, 0, 0, 0.905, "9.54%", 12.5], ["Sales", "Kateryna Kravchenko", "Full Time", 262.0, 76.0, 0, 0, 0.29, "70.99%", 186.0], ["Sales", "Andriy Petrov ", "Full Time", 262.0, 6.0, 0, 0, 0.023, "97.71%", 256.0], ["Technology", "Emily Johnson", "Full Time", 262.0, 59.0, 1.0, 0, 0.225, "77.10%", 202.0], ["Technology", "Michael Smith", "Part Time", 76.0, 21.0, 0, 0, 0.276, "72.37%", 55.0], ["Technology", "Sarah Lee", "Full Time", 197.0, 101.0, 0, 0, 0.513, "48.73%", 96.0], ["Technology", "Natalie Hall", "Full Time", 262.0, 65.0, 0, 0, 0.248, "75.19%", 197.0], ["Technology", "Joshua King", "Part Time", 131.0, 34.5, 1.0, 0, 0.263, "72.90%", 95.5]]}, "TEAM_REVENUE": {"schema": ["Team", "Actual Revenue", "Annual Rev Outlook", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "number", "number", "number", "number", "number"], "rows2D": [["Event management", 2896704.595, 2896704.595, -650398.7085, 2246305.886, 77.54694387], ["Project Management", 1080550.998, 1080550.998, -276681.5446, 803869.4533, 74.39440201], ["Sales", 958931.7865, 958931.7865, -229323.5624, 729608.2241, 76.08551874], ["Technology", 1029529.205, 1029529.205, -298202.6789, 731326.5263, 71.03504423]]}, "RESOURCE_REVENUE": {"schema": ["Resource", "Team", "Actual Revenue", "Annual Rev Outlook", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "string", "number", "number", "number", "number", "number"], "rows2D": [["Emily Johnson", "Technology", 158017.184, 158017.184, -62618.87042, 95398.31359, 60.37], ["Michael Smith", "Technology", 110765.8703, 110765.8703, -28257.25756, 82508.61273, 74.49], ["Sarah Lee", "Technology", 421965.2202, 421965.2202, -106071.378, 315893.8422, 74.86], ["Anna Schmidt", "Project Management", 55382.93515, 55382.93515, -35543.10098, 19839.83417, 35.82], ["Satish Joshi", "Project Management", 211422.1572, 211422.1572, -14325.54347, 197096.6137, 93.22], ["Thomas Wilson", "Project Management", 433392.1702, 433392.1702, -94223.67765, 339168.4925, 78.26], ["Olivia Martinez", "Sales", 15384.14865, 15384.14865, -3692.150378, 11691.99827, 76.0], ["Christopher Garcia", "Project Management", 380353.7353, 380353.7353, -132589.2225, 247764.5129, 65.14], ["Linda Anderson", "Sales", 539793.6015, 539793.6015, -155562.6026, 384230.9989, 71.18], ["Robert Davis", "Event management", 569578.6319, 569578.6319, -129701.1404, 439877.4915, 77.23], ["Natalie Thompson", "Event management", 401745.0424, 401745.0424, -91893.52053, 309851.5219, 77.13], ["Savitha Krishnamurthi", "Event management", 151643.751, 151643.751, -10830.30778, 140813.4432, 92.86], ["Kateryna Kravchenko", "Sales", 366832.0796, 366832.0796, -64850.5702, 301981.5094, 82.32], ["Mykhailo Ivanenko", "Event management", 423136.1737, 423136.1737, -68920.14039, 354216.0333, 83.71], ["Laura Lewis", "Event management", 435024.5602, 435024.5602, -93042.18953, 341982.3707, 78.61], ["Andriy Petrov ", "Sales", 36921.95676, 36921.95676, -5218.239202, 31703.71756, 85.87], ["Natalie Hall", "Technology", 285705.6178, 285705.6178, -68050.43386, 217655.184, 76.18], ["Andrew Allen", "Event management", 329473.1621, 329473.1621, -135138.6113, 194334.5508, 58.98], ["Samantha Young", "Event management", 586103.2734, 586103.2734, -120872.7986, 465230.4748, 79.38], ["Joshua King", "Technology", 53075.31285, 53075.31285, -33204.73907, 19870.57378, 37.44]]}, "PROJECT_REVENUE": {"schema": ["Projects", "Actual Revenue", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "number", "number", "number", "number"], "rows2D": [["Utility Week", 518665.5831, -118493.4128, 400172.1703, 77.15], ["Utility Week Flex Awards", 664595.2218, -216999.9849, 447595.2369, 67.35], ["Utility Week Forum", 292298.8244, -21529.3391, 270769.4853, 92.63], ["Women in Utilities Awards", 166148.8054, -18378.70411, 147770.1013, 88.94], ["Drinking Water Europe", 1823173.911, -423766.3135, 1399407.598, 76.76], ["Drinking Water Quality Conference", 116040.4355, -24007.18224, 92033.25331, 79.31], ["Reforming Grid Connections Conference", 1917884.891, -413980.31, 1503904.581, 78.41], ["Water in Mining", 295375.6541, -64896.51696, 230479.1372, 78.03], ["Water and Effluent Treatment News (WET News)", 171533.2575, -112581.0493, 58952.20813, 34.37], ["Sustainable Supply Chains Summit", 0.0, -20676.04212, -20676.04212, 0.0], ["Annual Leave", 0.0, -19297.63931, -19297.63931, 0.0]]}}';
            }

          const parsed = JSON.parse(changedProps.datasets || '{}') || {}
          // reconstruct rows as array of objects for convenience
          const rebuilt = {}
          Object.keys(parsed).forEach(name => {
            const { schema = [], rows2D = [] } = parsed[name] || {}
            const rows = rows2D.map(arr => {
              const obj = {}
              for (let i = 0; i < schema.length; i++) obj[schema[i]] = arr[i]
              return obj
            })
            rebuilt[name] = { schema, rows, rows2D }
          })
          this._datasets = rebuilt

          const tag = Object.entries(this._datasets)
            .map(([k, v]) => `${k}: ${v?.rows?.length || 0} rows`)
            .join(' · ')
          // this.$modelChip.textContent = tag || 'AI Assistant'
          this._updateDatasetsUI()
        } catch {
          this._datasets = {}
          // this.$modelChip.textContent = 'AI Assistant'
          this._updateDatasetsUI()
        }
      } else if (!this.$modelChip.textContent) {
        // this.$modelChip.textContent = 'AI Assistant'
        this._updateDatasetsUI()
      }

      // If first render and datasets exist, nudge the user
      if (!this.$chat.innerHTML) {
        if (this._props.welcomeText)
          this._append('bot', this._props.welcomeText)
      }
      if (this.$chat.innerHTML && Object.keys(this._datasets).length > 0) {
        this._append(
          'bot',
          'Datasets received. Ready to answer any analytical questions!'
        )
      }
    }

    // SAC will call this for custom methods defined in JSON
    onCustomWidgetRequest (methodName, params) {
      console.log('onCustomWidgetRequest', params)
      if (methodName !== 'setDatasets') return
      console.log(params)
      let payload = ''
      if (typeof params === 'string') {
        payload = params
      } else if (Array.isArray(params)) {
        // parameters listed in the JSON → SAC passes an array in that order
        payload = params[0] || ''
      } else if (params && typeof params === 'object') {
        // some runtimes send a map
        payload = params.payload || ''
      }

      if (payload) this._applyDatasets(payload)
    }

    setProperties (props) {
      this.onCustomWidgetAfterUpdate(props)
    } // SAC older runtimes

    _applyTheme () {
      const wrap = this._shadowRoot.querySelector('.wrap')
      const header = this._shadowRoot.querySelector('header')
      const panel = this._shadowRoot.querySelector('.panel')
      const buttons = this._shadowRoot.querySelectorAll('button.primary')

      wrap.style.background = this._props.surfaceColor || '#ffffff'
      wrap.style.color = this._props.textColor || '#0b1221'
      panel.style.background = this._props.surfaceAlt || '#f6f8ff'
      header.style.background = `linear-gradient(90deg, ${
        this._props.primaryColor || '#1f4fbf'
      }, ${this._props.primaryDark || '#163a8a'})`

      buttons.forEach(btn => {
        btn.style.background = `linear-gradient(90deg, ${
          this._props.primaryColor || '#1f4fbf'
        }, ${this._props.primaryDark || '#163a8a'})`
      })
    }

    _escapeHtml (s = '') {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }

    _mdLists (md) {
      // Convert contiguous lines of "-" or "*" to <ul>
      const lines = md.split('\n')
      const out = []
      let inUl = false,
        inOl = false

      const flush = () => {
        if (inUl) {
          out.push('</ul>')
          inUl = false
        }
        if (inOl) {
          out.push('</ol>')
          inOl = false
        }
      }

      for (const line of lines) {
        if (/^\s*[-*]\s+/.test(line)) {
          if (!inUl) {
            flush()
            out.push('<ul>')
            inUl = true
          }
          out.push(
            `<li>${this._mdInline(line.replace(/^\s*[-*]\s+/, ''))}</li>`
          )
        } else if (/^\s*\d+\.\s+/.test(line)) {
          if (!inOl) {
            flush()
            out.push('<ol>')
            inOl = true
          }
          out.push(
            `<li>${this._mdInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`
          )
        } else if (line.trim() === '') {
          flush()
          out.push('<br/>')
        } else {
          flush()
          out.push(`<p>${this._mdInline(line)}</p>`)
        }
      }
      flush()
      return out.join('')
    }

    _mdTable (block) {
      // Normalize: trim, then remove leading/trailing pipes on each line
      const raw = block.trim().split('\n').filter(Boolean)
      if (raw.length < 2) return null

      const norm = raw.map(line =>
        line.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '')
      )

      // Separator row must be --- (optionally with :) in each cell
      const sepCells = norm[1].split('|').map(s => s.trim())
      const sepOk =
        sepCells.length > 0 && sepCells.every(c => /^:?-{3,}:?$/.test(c))
      if (!sepOk) return null

      const toCells = line =>
        line
          .split('|')
          .map(c => c.trim())
          .filter(c => c.length > 0) // drop empties from edge pipes
          .map(c => this._mdInline(c))

      const head = toCells(norm[0])
      const bodyRows = norm.slice(2).map(toCells)

      const ths = head.map(h => `<th>${h}</th>`).join('')
      const trs = bodyRows
        .map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`)
        .join('')

      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    _mdInline (s) {
      // Escape, then apply inline markdown
      let t = this._escapeHtml(s)
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
      return t
    }

    _renderMarkdown (md = '') {
      // Detect simple tables first (blocks separated by blank lines)
      const blocks = md.split(/\n{2,}/)
      const html = blocks
        .map(b => {
          const maybe = this._mdTable(b)
          return maybe ? maybe : this._mdLists(b)
        })
        .join('\n')
      return html
    }

    _updateDatasetsUI () {
      const chip = this.$modelChip
      const drawer = this._shadowRoot.getElementById('dsDrawer')
      const entries = Object.entries(this._datasets || {})
      if (!entries.length) {
        chip.textContent = 'AI Assistant'
        drawer.style.display = 'none'
        return
      }

      // Chip text
      const parts = entries.map(([k, v]) => `${k}: ${v.rows?.length || 0} rows`)
      chip.textContent =
        parts.length > 2
          ? `${parts.slice(0, 2).join(' · ')} · +${parts.length - 2} more`
          : parts.join(' · ')

      // Drawer content
      const html =
        entries
          .map(([name, ds]) => {
            const cols = (ds.schema || []).slice(0, 12).join(', ')
            return `<div class="ds"><div class="name">${name}</div><div>${
              ds.rows?.length || 0
            } rows</div><div>${cols}</div></div>`
          })
          .join('') || '<div class="ds">No datasets</div>'
      drawer.innerHTML = html
    }

    _append (role, text) {
      const b = document.createElement('div')
      b.className = `msg ${role === 'user' ? 'user' : 'bot'}`

      // Render
      if (role === 'user') {
        b.textContent = text // keep user text literal
      } else {
        b.innerHTML = this._renderMarkdown(String(text || ''))
      }

      if (role === 'user') {
        b.style.background = '#97cdf2ff'
        b.style.border = '1px solid #e7eaf0'
        b.style.color = this._props.textColor || '#0b1221'
      } else {
        b.style.background = '#ffffff'
        b.style.border = '1px solid #e7eaf0'
        b.style.color = this._props.textColor || '#0b1221'
      }

      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
    }

    _buildDatasetContext (opts = {}) {
      const maxRowsPerSet = Number(opts.maxRowsPerSet ?? 5)
      const maxCharsTotal = Number(opts.maxCharsTotal ?? 8000)

      const lines = []
      lines.push(
        'You have access to the following datasets. Use ONLY these when answering analytics questions:'
      )

      const entries = Object.entries(this._datasets || {})
      if (!entries.length) {
        lines.push('(No datasets provided.)')
        return lines.join('\n')
      }

      for (const [name, ds] of entries) {
        const schema = (ds?.schema || []).join(', ')
        const total = ds?.rows?.length || 0
        const preview = (ds?.rows || []).slice(0, maxRowsPerSet)

        lines.push(`\n[DATASET] ${name}`)
        lines.push(`- Columns: ${schema || '(none)'}`)
        lines.push(`- Total Rows: ${total}`)
        if (preview.length) {
          lines.push(`- Preview (first ${preview.length} rows):`)
          for (let i = 0; i < preview.length; i++) {
            // safe, compact row print
            const row = preview[i]
            const compact = Object.keys(row).reduce((acc, k) => {
              const v = row[k]
              // stringify lightly; trim long strings
              let s = v === null || v === undefined ? '' : String(v)
              if (s.length > 120) s = s.slice(0, 117) + '...'
              acc[k] = s
              return acc
            }, {})
            lines.push(`  - ${JSON.stringify(compact)}`)
          }
        } else {
          lines.push(`- Preview: (no rows)`)
        }

        // stop if we’re near the char budget
        if (lines.join('\n').length > maxCharsTotal) {
          lines.push('\n(Context truncated to stay within token limits.)')
          break
        }
      }

      

      // a tiny instruction so the model behaves
      lines.push(
        `
        Guidelines:
       - Do the calculations only if the required answer is not directly available in the dataset.
       - Prefer conclusions implied by the dataset preview and schema.
       - If the exact answer requires full data (beyond preview), say what aggregation/filter is needed and ask me to run it.
       - Be precise with column names; do not invent fields that aren’t in the schema.
       - Always list the filters, thresholds, and assumptions you applied.
      `.trim()
      )

      return lines.join('\n')
    }

    _startTyping () {
      if (this._typingEl) return // avoid duplicates
      const b = document.createElement('div')
      b.className = 'msg bot typing'
      b.innerHTML = `<span class="muted">PerciBOT</span><span class="dots"><span></span><span></span><span></span></span>`
      // style like bot bubble
      b.style.background = '#ffffff'
      b.style.border = '1px solid #e7eaf0'
      b.style.color = this._props.textColor || '#0b1221'

      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
      this._typingEl = b
    }

    _stopTyping () {
      if (this._typingEl && this._typingEl.parentNode) {
        this._typingEl.parentNode.removeChild(this._typingEl)
      }
      this._typingEl = null
    }

    async _send () {
      const q = (this.$input.value || '').trim()
      if (!q) return
      this._append('user', q)
      this.$input.value = ''

      if (!this._props.apiKey) {
        this._append(
          'bot',
          '⚠️ API key not set. Open the Builder panel to configure.'
        )
        return
      }

      // show typing indicator + lock UI
      this._startTyping()
      this.$send.disabled = true

      try {
        // Build dataset context (schema + small preview)
        const dsContext = this._buildDatasetContext({
          maxRowsPerSet: 500,
          maxCharsTotal: 8000
        })

        const system = [
          this._props.systemPrompt ||
            'You are PerciBot, a helpful and concise assistant for SAP Analytics Cloud.',
          '',
          dsContext,
          '',
          'When responding, prefer Markdown with **bold** labels, bullet points, and small tables for comparisons. Keep it concise and executive-friendly.'
          
        ].join('\n')

        
        console.log(system)

        // return;

        const body = {
          model: this._props.model || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: q }
          ],
          temperature: 0.2
        }
        console.log('openAI prompt', JSON.stringify(body))
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this._props.apiKey}`
          },
          body: JSON.stringify(body)
        })

        if (!res.ok) {
          const txt = await res.text()
          throw new Error(`${res.status} ${res.statusText}: ${txt}`)
        }

        const data = await res.json()
        const ans = data.choices?.[0]?.message?.content || '(No content)'
        this._stopTyping()
        this._append('bot', ans)
      } catch (e) {
        this._stopTyping()
        this._append('bot', `❌ ${e.message}`)
      } finally {
        this.$send.disabled = false
      }
    }
  }

  if (!customElements.get('perci-bot')) {
    customElements.define('perci-bot', PerciBot)
  }
})()
