/* PerciBot — SAC Chat Widget (Analytic App push mode: receives datasets via setProperties) */
;(function () {

  // ── CDN ───────────────────────────────────────────────────────────────────────
  const CHARTJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'

  // ── Palette — Percipere-flavoured, vivid but professional ────────────────────
  const PALETTE = [
    '#3A86FF', // vivid blue        (primary)
    '#FF6B6B', // coral red
    '#06D6A0', // emerald green
    '#FFD166', // amber yellow
    '#8338EC', // electric violet
    '#FF9F1C', // saffron orange
    '#2EC4B6', // teal
    '#E63946', // crimson
    '#457B9D', // steel blue
    '#A8DADC', // powder blue
    '#C77DFF', // lavender purple
    '#80B918', // lime green
  ]

  // ── Lazy CDN loader ───────────────────────────────────────────────────────────
  let _chartJsPromise = null

  function _loadChartJs () {
    if (_chartJsPromise) return _chartJsPromise
    if (window.Chart) { _chartJsPromise = Promise.resolve(window.Chart); return _chartJsPromise }

    _chartJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src   = CHARTJS_CDN
      s.async = true
      s.onload  = () => resolve(window.Chart)
      s.onerror = () => reject(new Error('Failed to load Chart.js from CDN.'))
      document.head.appendChild(s)
    })
    return _chartJsPromise
  }

  // ── Number formatting ─────────────────────────────────────────────────────────
  function _fmt (n) {
    const v = Number(n)
    if (isNaN(v)) return String(n)
    const abs = Math.abs(v)
    if (abs >= 1e7)  return (v / 1e7).toFixed(2).replace(/\.?0+$/, '')  + ' Cr'
    if (abs >= 1e6)  return (v / 1e6).toFixed(2).replace(/\.?0+$/, '')  + 'M'
    if (abs >= 1e3)  return (v / 1e3).toFixed(1).replace(/\.?0+$/, '')  + 'K'
    return v % 1 === 0 ? String(v) : v.toFixed(2)
  }

  // ── Column normalizer ─────────────────────────────────────────────────────────
  function _norm (s) { return String(s || '').trim().toLowerCase() }

  function _normaliseRows (rows, mapping) {
    if (!rows || !rows.length) return { rows: [], mapping }
    const sample = rows[0]
    const colMap = {}
    Object.keys(sample).forEach(k => { colMap[_norm(k)] = k })

    const resolve = col => colMap[_norm(col)] || col

    const normMapping = {
      x:     resolve(mapping.x),
      y:     (mapping.y || []).map(resolve),
      color: mapping.color ? resolve(mapping.color) : null,
    }

    return { rows, mapping: normMapping }
  }

  // ── Pivot rows into Chart.js datasets ─────────────────────────────────────────
  function _buildDatasets (rows, mapping) {
    const { x: xCol, y: yCols, color: colorCol } = mapping

    // Case A: no grouping
    if (!colorCol || !rows.some(r => r[colorCol] !== undefined)) {
      const labels = rows.map(r => r[xCol])

      const datasets = yCols.map((yCol, i) => ({
        label:           yCol,
        data:            rows.map(r => Number(r[yCol]) || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
        borderColor:     PALETTE[i % PALETTE.length],
        borderWidth:     2,
      }))

      return { labels, datasets }
    }

    // Case B: group by color column
    const yCol = yCols[0]

    const labelsOrdered = []
    const labelSet      = new Set()
    rows.forEach(r => {
      const lbl = String(r[xCol])
      if (!labelSet.has(lbl)) { labelsOrdered.push(lbl); labelSet.add(lbl) }
    })

    const groupsOrdered = []
    const groupSet      = new Set()
    rows.forEach(r => {
      const g = String(r[colorCol])
      if (!groupSet.has(g)) { groupsOrdered.push(g); groupSet.add(g) }
    })

    const datasets = groupsOrdered.map((group, i) => {
      const groupRows = rows.filter(r => String(r[colorCol]) === group)
      const lookup    = {}
      groupRows.forEach(r => { lookup[String(r[xCol])] = Number(r[yCol]) || 0 })

      return {
        label:           group,
        data:            labelsOrdered.map(lbl => lookup[lbl] ?? 0),
        backgroundColor: PALETTE[i % PALETTE.length],
        borderColor:     PALETTE[i % PALETTE.length],
        borderWidth:     2,
      }
    })

    return { labels: labelsOrdered, datasets }
  }

  // ── Common tooltip config ──────────────────────────────────────────────────────
  function _tooltip () {
    return {
      callbacks: {
        label (ctx) {
          const val = ctx.parsed.y ?? ctx.parsed
          return ` ${ctx.dataset.label}: ${_fmt(val)}`
        },
      },
      backgroundColor: 'rgba(15,20,50,0.88)',
      titleColor:      '#fff',
      bodyColor:       '#d0d8f0',
      borderColor:     'rgba(100,130,255,0.2)',
      borderWidth:     1,
      padding:         10,
      cornerRadius:    8,
      titleFont:       { weight: 'bold', size: 12 },
      bodyFont:        { size: 12 },
    }
  }

  // ── Axis tick formatters ───────────────────────────────────────────────────────
  function _yTicks () {
    return {
      callback: v => _fmt(v),
      color:    '#7a80a0',
      font:     { size: 11 },
    }
  }

  function _xTicks () {
    return {
      color: '#7a80a0',
      font:  { size: 11 },
      maxRotation: 40,
      autoSkip:    true,
      maxTicksLimit: 18,
    }
  }

  // ── Chart builders ─────────────────────────────────────────────────────────────

  function _buildBar (Chart, { labels, datasets }, spec) {
    const ds = datasets.map(d => ({
      ...d,
      backgroundColor: d.backgroundColor + 'cc',
      hoverBackgroundColor: d.backgroundColor,
      borderRadius: 5,
      borderSkipped: false,
    }))

    return {
      type: 'bar',
      data: { labels, datasets: ds },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend:  { position: 'top', labels: { color: '#4a5280', font: { size: 12 } } },
          tooltip: _tooltip(),
          title:   { display: !!spec.title, text: spec.title, color: '#1a1f36', font: { size: 14, weight: 'bold' } },
        },
        scales: {
          x: {
            grid:  { display: false },
            ticks: _xTicks(),
            title: {
              display: !!spec.x_axis_title,
              text:    spec.x_axis_title || '',
              color:   '#7a80a0', font: { size: 11 },
            },
          },
          y: {
            grid:  { color: 'rgba(0,0,0,.05)' },
            ticks: _yTicks(),
            title: {
              display: !!spec.y_axis_title,
              text:    spec.y_axis_title || '',
              color:   '#7a80a0', font: { size: 11 },
            },
          },
        },
        animation: { duration: 500, easing: 'easeOutQuart' },
      },
    }
  }

  function _buildLine (Chart, { labels, datasets }, spec) {
    const ds = datasets.map(d => ({
      ...d,
      fill:        false,
      tension:     0.35,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBackgroundColor: d.borderColor,
    }))

    return {
      type: 'line',
      data: { labels, datasets: ds },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend:  { position: 'top', labels: { color: '#4a5280', font: { size: 12 } } },
          tooltip: { ...(_tooltip()), mode: 'index', intersect: false },
          title:   { display: !!spec.title, text: spec.title, color: '#1a1f36', font: { size: 14, weight: 'bold' } },
        },
        scales: {
          x: {
            grid:  { color: 'rgba(0,0,0,.04)' },
            ticks: _xTicks(),
            title: {
              display: !!spec.x_axis_title,
              text:    spec.x_axis_title || '',
              color:   '#7a80a0', font: { size: 11 },
            },
          },
          y: {
            grid:  { color: 'rgba(0,0,0,.05)' },
            ticks: _yTicks(),
            title: {
              display: !!spec.y_axis_title,
              text:    spec.y_axis_title || '',
              color:   '#7a80a0', font: { size: 11 },
            },
          },
        },
        hover:     { mode: 'index', intersect: false },
        animation: { duration: 500, easing: 'easeOutQuart' },
      },
    }
  }

  function _buildArea (Chart, { labels, datasets }, spec) {
    const ds = datasets.map((d, i) => ({
      ...d,
      fill:             true,
      tension:          0.4,
      backgroundColor:  PALETTE[i % PALETTE.length] + '30',
      borderColor:      PALETTE[i % PALETTE.length],
      pointRadius:      3,
      pointHoverRadius: 6,
    }))

    return {
      type: 'line',
      data: { labels, datasets: ds },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend:  { position: 'top', labels: { color: '#4a5280', font: { size: 12 } } },
          tooltip: { ...(_tooltip()), mode: 'index', intersect: false },
          title:   { display: !!spec.title, text: spec.title, color: '#1a1f36', font: { size: 14, weight: 'bold' } },
        },
        scales: {
          x: {
            grid:  { display: false },
            ticks: _xTicks(),
            title: {
              display: !!spec.x_axis_title,
              text:    spec.x_axis_title || '',
              color:   '#7a80a0', font: { size: 11 },
            },
          },
          y: {
            grid:  { color: 'rgba(0,0,0,.05)' },
            ticks: _yTicks(),
            title: {
              display: !!spec.y_axis_title,
              text:    spec.y_axis_title || '',
              color:   '#7a80a0', font: { size: 11 },
            },
          },
        },
        hover:     { mode: 'index', intersect: false },
        animation: { duration: 500, easing: 'easeOutQuart' },
      },
    }
  }

  function _buildPie (Chart, { labels, datasets }, spec) {
    const values = datasets[0] ? datasets[0].data : []
    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length])

    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data:                  values,
          backgroundColor:       colors.map(c => c + 'cc'),
          hoverBackgroundColor:  colors,
          borderColor:           '#fff',
          borderWidth:           2,
          hoverOffset:           8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels:   {
              color:     '#4a5280',
              font:      { size: 12 },
              padding:   14,
              boxWidth:  14,
              boxHeight: 14,
            },
          },
          tooltip: {
            callbacks: {
              label (ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0)
                const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) + '%' : '–'
                return ` ${ctx.label}: ${_fmt(ctx.parsed)} (${pct})`
              },
            },
            backgroundColor: 'rgba(15,20,50,0.88)',
            titleColor:      '#fff',
            bodyColor:       '#d0d8f0',
            borderColor:     'rgba(100,130,255,0.2)',
            borderWidth:     1,
            padding:         10,
            cornerRadius:    8,
          },
          title: {
            display: !!spec.title,
            text:    spec.title,
            color:   '#1a1f36',
            font:    { size: 14, weight: 'bold' },
            padding: { bottom: 16 },
          },
        },
        animation: { animateRotate: true, duration: 600, easing: 'easeOutQuart' },
        cutout:    '55%',
      },
    }
  }

  // ── Type router ───────────────────────────────────────────────────────────────
  function _makeConfig (Chart, type, builtData, spec) {
    switch (type) {
      case 'bar':   return _buildBar(Chart, builtData, spec)
      case 'line':  return _buildLine(Chart, builtData, spec)
      case 'area':  return _buildArea(Chart, builtData, spec)
      case 'pie':   return _buildPie(Chart, builtData, spec)
      default:
        throw new Error(`PerciBot chart-renderer: unsupported chart_type "${type}".`)
    }
  }

  // ── Shimmer skeleton (shown while Chart.js CDN loads) ─────────────────────────
  function _injectShimmer (container) {
    container.innerHTML = `
      <div style="
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:14px; padding:32px 20px; background:#f8f9fc; border-radius:10px; height:100%;
      ">
        <div style="
          display:flex; align-items:flex-end; gap:6px; height:64px; width:80%;
        ">
          ${[40,70,55,90,65,45,80].map((h,i) => `
            <div style="
              flex:1; border-radius:4px 4px 0 0; height:${h}%;
              background:linear-gradient(90deg,#e8ecf8 25%,#d0d6f0 50%,#e8ecf8 75%);
              background-size:300% 100%;
              animation:pbShimBar 1.4s ease-in-out infinite ${i * 0.1}s;
            "></div>
          `).join('')}
        </div>
        <style>
          @keyframes pbShimBar {
            0%,100% { opacity:.4 }
            50%     { opacity:1  }
          }
        </style>
      </div>
    `
  }

  // ── Error display ─────────────────────────────────────────────────────────────
  function _showError (container, msg) {
    container.innerHTML = `
      <div style="
        display:flex; align-items:center; gap:8px; padding:10px 14px;
        border-radius:9px; background:#fff7f7; border:1px solid #ffd5d5;
        font-size:12px; color:#9b3030; font-family:inherit;
      ">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round">
          <circle cx="10" cy="10" r="8"/>
          <line x1="10" y1="6" x2="10" y2="10"/>
          <circle cx="10" cy="14" r=".5" fill="currentColor"/>
        </svg>
        ${msg}
      </div>
    `
  }

  // ── Store Chart instances keyed by container ──────────────────────────────────
  const _instances = new WeakMap()

  // ── renderChart — public API ──────────────────────────────────────────────────
  /**
   * renderChart(container, chartData)
   *
   * @param {HTMLElement}  container — A div already appended to the DOM.
   * @param {Object}       chartData — The chart_data object returned by the LLM.
   *   Expected shape:
   *   {
   *     chart_type:    'bar' | 'line' | 'area' | 'pie',
   *     title:         string (optional),
   *     x_axis_title:  string (optional),
   *     y_axis_title:  string (optional),
   *     data_mapping:  { x: string, y: string[], color?: string | null },
   *     rows:          Array<Record<string, any>>
   *   }
   *
   * @returns {Promise<Chart|null>}
   */
  async function renderChart (container, chartData) {
    if (!container || !chartData) return null

    const { chart_type, data_mapping, rows } = chartData

    if (!chart_type || !data_mapping || !rows || !rows.length) {
      _showError(container, 'Chart data is incomplete or missing.')
      return null
    }

    // Destroy previous chart on this container if any
    const prev = _instances.get(container)
    if (prev) { try { prev.destroy() } catch (_) {} }

    // Show shimmer while CDN loads
    _injectShimmer(container)

    let Chart
    try {
      Chart = await _loadChartJs()
    } catch (err) {
      _showError(container, 'Could not load chart library. Check your network connection.')
      return null
    }

    let normResult
    try {
      normResult = _normaliseRows(rows, data_mapping)
    } catch (err) {
      _showError(container, 'Failed to read chart data columns.')
      return null
    }

    const { rows: normRows, mapping: normMapping } = normResult

    let builtData
    try {
      builtData = _buildDatasets(normRows, normMapping)
    } catch (err) {
      _showError(container, `Chart data error: ${err.message}`)
      return null
    }

    let config
    try {
      config = _makeConfig(Chart, chart_type, builtData, chartData)
    } catch (err) {
      _showError(container, err.message)
      return null
    }

    // Clear shimmer, inject canvas
    container.innerHTML = ''
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'display:block; width:100%; height:100%;'
    container.appendChild(canvas)

    let instance
    try {
      instance = new Chart(canvas, config)
      _instances.set(container, instance)
    } catch (err) {
      _showError(container, `Chart render failed: ${err.message}`)
      return null
    }

    return instance
  }

  /**
   * destroyChart(container)
   * Call this when removing the container from the DOM to prevent memory leaks.
   */
  function destroyChart (container) {
    const inst = _instances.get(container)
    if (inst) { try { inst.destroy() } catch (_) {} _instances.delete(container) }
  }

  // END OF CHART ENGINE
  // =============================================================================

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
        min-height:0;
      }
      .panel{
        flex:1;
        overflow-y:auto;
        overflow-x:hidden;
        border:1px solid #e7eaf0;
        border-radius:12px;
        padding:10px;
        background:#f7f9fc;
        user-select:text;
      }
      .msg{max-width:85%; margin:6px 0; padding:10px 12px; border-radius:14px; box-shadow:0 1px 2px rgba(0,0,0,.04)}
      .user{ margin-left:auto; }
      .inputRow{ display:flex; gap:8px; align-items:flex-start }
      textarea{
        flex:1; resize:vertical; min-height:64px; max-height:220px;
        padding:10px 12px; border:1px solid #d0d3da; border-radius:12px; background:#fff; outline:none;
        user-select:text;
      }
      textarea:focus{ border-color:#4d9aff; box-shadow:0 0 0 2px rgba(77,154,255,.15) }
      button{
        padding:10px 14px; border:1px solid #d0d3da; border-radius:12px; background:#fff; cursor:pointer
      }
      button.primary{ color:#fff; border-color:transparent }
      button:disabled{ opacity:.5; cursor:not-allowed }
      .muted{opacity:.7; font-size:12px}
      .footer{display:flex; justify-content:space-between; align-items:center; padding:0 10px 10px}

      .msg.bot { line-height: 1.55; }
      .msg.bot p { margin: 6px 0; }
      .msg.bot h1, .msg.bot h2, .msg.bot h3, .msg.bot h4, .msg.bot h5, .msg.bot h6 {
        margin: 12px 0 6px;
        font-weight: 700;
        line-height: 1.25;
      }
      .msg.bot h1 { font-size: 1.3em; }
      .msg.bot h2 { font-size: 1.2em; }
      .msg.bot h3 {
        font-size: 0.95em;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: rgba(11,18,33,.78);
        margin-top: 14px;
      }
      .msg.bot h4 { font-size: 1em; }
      .msg.bot h5, .msg.bot h6 { font-size: 0.95em; }

      .msg.bot ul,
      .msg.bot ol {
        list-style: none;
        padding-left: 0;
        margin: 8px 0;
      }
      .msg.bot li { margin: 4px 0; }

      .msg.bot li.li-item,
      .msg.bot li.li-subitem,
      .msg.bot ol > li {
        padding: 6px 10px;
        border-left: 3px solid var(--perci-accent, #1f4fbf);
        background: #f9fbff;
        border-radius: 6px;
      }

      .msg.bot li.li-head {
        margin-top: 10px;
        margin-bottom: 2px;
        padding: 0 2px;
        border-left: none;
        background: transparent;
        border-radius: 0;
        font-weight: 700;
      }
      .msg.bot li.li-head > ul.li-sub {
        margin: 6px 0 0;
        padding-left: 14px;
      }
      .msg.bot li.li-head > ul.li-sub > li.li-subitem {
        background: #f9fbff;
        border-left-width: 3px;
      }
      .msg.bot li strong { color:#0b1221; }
      .msg.bot li em { color: rgba(11,18,33,.78); }
      .msg.bot table { border-collapse: separate; border-spacing: 0; width: 100%; margin: 8px 0; overflow:hidden; border: 1px solid #e7eaf0; border-radius: 10px; background:#fff; }
      .msg.bot th, .msg.bot td { border-bottom: 1px solid #eef1f6; padding: 8px 10px; text-align: left; vertical-align: top; }
      .msg.bot thead th { background: #f3f6ff; border-bottom: 1px solid #e7eaf0; }
      .msg.bot tbody tr:last-child td { border-bottom: none; }
      .msg.bot tbody tr:nth-child(even) td { background:#fbfcff; }
      .msg.bot code { background:#f1f3f7; padding:2px 4px; border-radius:4px; }
      .msg.bot, .msg.user { user-select:text; }

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

      /* ── Chart card styles (ported from production widget) ── */
      .chartCard {
        margin-top:10px; border-radius:14px; overflow:hidden;
        border:1px solid #e3e6f0; background:#fff;
        box-shadow:0 2px 12px rgba(0,0,0,.06);
      }
      .chartCanvas {
        display:block; width:100%; height:320px;
        padding:16px 16px 10px;
        box-sizing:border-box;
        background:#fff;
      }
      .chartFooter {
        display:flex; align-items:center; justify-content:space-between;
        padding:7px 12px; background:#f8f9fc; border-top:1px solid #e9ecf5;
        font-size:11.5px; color:#7a80a0;
      }
      .chartFooter .cfName {
        font-weight:600; color:#4a5280;
        max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .chartErr {
        display:flex; align-items:center; gap:7px;
        margin-top:8px; padding:7px 11px; border-radius:9px;
        background:#fff7f7; border:1px solid #ffd5d5; font-size:12px; color:#9b3030;
      }
      .chartErr svg { width:14px; height:14px; flex-shrink:0; color:#c94040 }

      header{ position:relative; }
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
        <div class="muted" id="hint">AI can make mistakes. Please verify results.</div>
        <div class="muted"><a href="https://www.linkedin.com/company/percipere/" target="_blank">Percipere Consulting</a></div>
      </div>
    </div>
  `

  class PerciBot extends HTMLElement {
    constructor () {
      super()
      this._shadowRoot = this.attachShadow({ mode: 'open' })
      this._shadowRoot.appendChild(tpl.content.cloneNode(true))
      this.$ = id => this._shadowRoot.getElementById(id)

      this.$chat      = this.$('chat')
      this.$input     = this.$('input')
      this.$send      = this.$('send')
      this.$clear     = this.$('clear')
      this.$modelChip = this.$('modelChip')
      this.$hint      = this.$('hint')

      this.$send.addEventListener('click', () => this._send())
      this.$clear.addEventListener('click', () => (this.$chat.innerHTML = ''))

      this.$input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          if (!this.$send.disabled) this._send()
        }
      })

      this._props = {
        apiKey: '',
        model: 'gpt-3.5-turbo',
        systemPrompt:
          'You are PerciBOT, a helpful and concise assistant for SAP Analytics Cloud.',
        welcomeText: 'Hello, I\u2019m PerciBOT! How can I assist you?',
        datasets: '',
        // theme
        primaryColor: '#1f4fbf',
        primaryDark: '#163a8a',
        surfaceColor: '#ffffff',
        surfaceAlt: '#f6f8ff',
        textColor: '#0b1221',
        summaryPrompt: '',
      }
      this.summaryResponse = 'Test'
      this._datasets = {}
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
        this._updateDatasetsUI()

        if (!this.$chat.innerHTML && Object.keys(this._datasets).length) {
          this._append('bot', 'Datasets received. Ready to answer any analytical questions! ')
        }
      } catch (e) {
        this._datasets = {}
        this._updateDatasetsUI()
      }
    }

    onCustomWidgetAfterUpdate (changedProps = {}) {
      Object.assign(this._props, changedProps)
      this._applyTheme()

      console.log('datasets', changedProps)

      if (changedProps.summaryPrompt !== undefined) {
        this._generateSummary(changedProps.summaryPrompt)
        return
      }

      this.$hint.textContent = this._props.apiKey
        ? 'AI can make mistakes. Please verify results.'
        : 'API key not set – open Builder to configure'

      // Parse pushed datasets (if any)
      if (typeof changedProps.datasets === 'string') {
        try {
          if (changedProps.datasets != '') {

            if(changedProps.datasets == '{'){
              // changedProps.datasets = '{"TEAM_UTILIZATION": {"schema": ["Team", "Net Availability (Days)", "Project Billable Days", "Project NB Days", "Internal Time", "Billable Util %", "White Space %", "White Space Days"], "types": ["string", "number", "number", "number", "number", "number", "number", "number"], "rows2D": [["Event management", 1176.0, 606.54, 0, 15, 51.58, 47.15, 554.46], ["Project Management", 371.5, 249.5, 25, 0, 67.16, 26.11, 97.0], ["Sales", 655.0, 203.0, 0, 0, 30.99, 69.01, 452.0], ["Technology", 928.0, 280.5, 2, 0, 30.23, 69.56, 645.5]]}, "RESOURCE_UTILIZATION": {"schema": ["Team", "Resource", "FTE Type", "Net Availability (Days)", "Project Billable Days", "Project NB Days", "Internal Time", "Billable Util %", "White Space %", "White Space Days"], "types": ["string", "string", "string", "number", "number", "number", "number", "number", "number", "number"], "rows2D": [["Event management", "Robert Davis", "Part Time", 11.0, 123.5, 0, 0, 1122.7, -1022.73, -112.5], ["Event management", "Natalie Thompson", "Full Time", 262.0, 80.0, 0, 0, 30.5, 69.47, 182.0], ["Event management", "Savitha Krishnamurthi", "Part Time", 131.0, 33.0, 0, 0, 25.2, 74.81, 98.0], ["Event management", "Mykhailo Ivanenko", "Part Time", 131.0, 84.0, 0, 0, 64.1, 35.88, 47.0], ["Event management", "Laura Lewis", "Full Time", 262.0, 90.0, 0, 0, 34.4, 65.65, 172.0], ["Event management", "Andrew Allen", "Full Time", 248.0, 69.04, 0, 15, 27.8, 66.11, 163.96], ["Event management", "Samantha Young", "Full Time", 131.0, 127.0, 0, 0, 96.9, 3.05, 4.0], ["Project Management", "Anna Schmidt", "Part Time", 43.5, 36.0, 2, 0, 82.8, 12.64, 5.5], ["Project Management", "Satish Joshi", "Full Time", 66.0, 48.5, 0, 0, 73.5, 26.52, 17.5], ["Project Management", "Thomas Wilson", "Full Time", 262.0, 87.0, 0, 0, 33.2, 66.79, 175.0], ["Project Management", "Christopher Garcia", "Full Time", 0, 78.0, 23, 0, 0.0, 0.0, -101.0], ["Sales", "Olivia Martinez", "Full Time", 0, 2.5, 0, 0, 0.0, 0.0, -2.5], ["Sales", "Linda Anderson", "Part Time", 131.0, 118.5, 0, 0, 90.5, 9.54, 12.5], ["Sales", "Kateryna Kravchenko", "Full Time", 262.0, 76.0, 0, 0, 29.0, 70.99, 186.0], ["Sales", "Andriy Petrov ", "Full Time", 262.0, 6.0, 0, 0, 2.3, 97.71, 256.0], ["Technology", "Emily Johnson", "Full Time", 262.0, 59.0, 1, 0, 22.5, 77.1, 202.0], ["Technology", "Michael Smith", "Part Time", 76.0, 21.0, 0, 0, 27.6, 72.37, 55.0], ["Technology", "Sarah Lee", "Full Time", 197.0, 101.0, 0, 0, 51.3, 48.73, 96.0], ["Technology", "Natalie Hall", "Full Time", 262.0, 65.0, 0, 0, 24.8, 75.19, 197.0], ["Technology", "Joshua King", "Part Time", 131.0, 34.5, 1, 0, 26.3, 72.9, 95.5]]}, "TEAM_REVENUE": {"schema": ["Team", "Actual Revenue", "Annual Rev Outlook", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "number", "number", "number", "number", "number"], "rows2D": [["Event management", 2896704.595, 2896704.595, -650398.7085, 2246305.886, 77.54694387], ["Project Management", 1080550.998, 1080550.998, -276681.5446, 803869.4533, 74.39440201], ["Sales", 958931.7865, 958931.7865, -229323.5624, 729608.2241, 76.08551874], ["Technology", 1029529.205, 1029529.205, -298202.6789, 731326.5263, 71.03504423]]}, "RESOURCE_REVENUE": {"schema": ["Resource", "Team", "Actual Revenue", "Annual Rev Outlook", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "string", "number", "number", "number", "number", "number"], "rows2D": [["Emily Johnson", "Technology", 158017.184, 158017.184, -62618.87042, 95398.31359, 60.37], ["Michael Smith", "Technology", 110765.8703, 110765.8703, -28257.25756, 82508.61273, 74.49], ["Sarah Lee", "Technology", 421965.2202, 421965.2202, -106071.378, 315893.8422, 74.86], ["Anna Schmidt", "Project Management", 55382.93515, 55382.93515, -35543.10098, 19839.83417, 35.82], ["Satish Joshi", "Project Management", 211422.1572, 211422.1572, -14325.54347, 197096.6137, 93.22], ["Thomas Wilson", "Project Management", 433392.1702, 433392.1702, -94223.67765, 339168.4925, 78.26], ["Olivia Martinez", "Sales", 15384.14865, 15384.14865, -3692.150378, 11691.99827, 76.0], ["Christopher Garcia", "Project Management", 380353.7353, 380353.7353, -132589.2225, 247764.5129, 65.14], ["Linda Anderson", "Sales", 539793.6015, 539793.6015, -155562.6026, 384230.9989, 71.18], ["Robert Davis", "Event management", 569578.6319, 569578.6319, -129701.1404, 439877.4915, 77.23], ["Natalie Thompson", "Event management", 401745.0424, 401745.0424, -91893.52053, 309851.5219, 77.13], ["Savitha Krishnamurthi", "Event management", 151643.751, 151643.751, -10830.30778, 140813.4432, 92.86], ["Kateryna Kravchenko", "Sales", 366832.0796, 366832.0796, -64850.5702, 301981.5094, 82.32], ["Mykhailo Ivanenko", "Event management", 423136.1737, 423136.1737, -68920.14039, 354216.0333, 83.71], ["Laura Lewis", "Event management", 435024.5602, 435024.5602, -93042.18953, 341982.3707, 78.61], ["Andriy Petrov ", "Sales", 36921.95676, 36921.95676, -5218.239202, 31703.71756, 85.87], ["Natalie Hall", "Technology", 285705.6178, 285705.6178, -68050.43386, 217655.184, 76.18], ["Andrew Allen", "Event management", 329473.1621, 329473.1621, -135138.6113, 194334.5508, 58.98], ["Samantha Young", "Event management", 586103.2734, 586103.2734, -120872.7986, 465230.4748, 79.38], ["Joshua King", "Technology", 53075.31285, 53075.31285, -33204.73907, 19870.57378, 37.44]]}, "PROJECT_REVENUE": {"schema": ["Projects", "Actual Revenue", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "number", "number", "number", "number"], "rows2D": [["Utility Week", 518665.5831, -118493.4128, 400172.1703, 77.15], ["Utility Week Flex Awards", 664595.2218, -216999.9849, 447595.2369, 67.35], ["Utility Week Forum", 292298.8244, -21529.3391, 270769.4853, 92.63], ["Women in Utilities Awards", 166148.8054, -18378.70411, 147770.1013, 88.94], ["Drinking Water Europe", 1823173.911, -423766.3135, 1399407.598, 76.76], ["Drinking Water Quality Conference", 116040.4355, -24007.18224, 92033.25331, 79.31], ["Reforming Grid Connections Conference", 1917884.891, -413980.31, 1503904.581, 78.41], ["Water in Mining", 295375.6541, -64896.51696, 230479.1372, 78.03], ["Water and Effluent Treatment News (WET News)", 171533.2575, -112581.0493, 58952.20813, 34.37], ["Sustainable Supply Chains Summit", 0.0, -20676.04212, -20676.04212, 0.0], ["Annual Leave", 0.0, -19297.63931, -19297.63931, 0.0]]}}';
              //changedProps.datasets = '{"IKF Finance - Model (MIS)":{"schema":["Date","IKF_Branch","IKF_CompanyCode","IKF_Product","Version","Account","Amount"],"types":["string","string","string","string","string","string","number"],"rows2D":[["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",38825.81],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",43139.12],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",27787.76],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",31161.4],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-81154.4],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-44988.26],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-123361.46],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-35819.74],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-33298.19],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-34916.29],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-31867.08],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-27129.91],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",13903.69],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10570.72],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",15448.62],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",8981.55],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",20231.42],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",23396.99],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",22271.79],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",23089.43],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",38825.81],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",43139.12],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",27787.76],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",31161.4],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-81154.4],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-44988.26],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-123361.46],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-35819.74],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-33298.19],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-34916.29],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-31867.08],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-27129.91],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",13903.69],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10570.72],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",15448.62],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",8981.55],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",20231.42],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",23396.99],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",22271.79],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",23089.43],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",40785.77],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",15035.51],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",19829.41],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",20569.76],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-60342.53],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-110537.42],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-132720.85],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-83377.61],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-46897.23],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-31352.01],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-49061.57],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-17859.82],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",6853.37],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",7873.31],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",18256.6],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",13587.83],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",9261.57],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",26179.31],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",26111.14],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",20541.39],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",40785.77],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",15035.51],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",19829.41],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",20569.76],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-60342.53],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-110537.42],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-132720.85],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-83377.61],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-46897.23],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-31352.01],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-49061.57],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-17859.82],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",6853.37],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",7873.31],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",18256.6],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",13587.83],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",9261.57],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",26179.31],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",26111.14],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",20541.39],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",14486.82],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",42699.52],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",29678.5],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30921.99],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-90064.61],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-124381.96],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-87904.8],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-103664.87],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-51718.99],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-28483.66],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-35686.53],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-39614.23],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",8564.63],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10226.56],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",12436.31],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",15147.93],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",26359.73],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",27197.37],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",11150.42],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",20621.89],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",14486.82],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",42699.52],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",29678.5],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30921.99],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-90064.61],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-124381.96],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-87904.8],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-103664.87],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-51718.99],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-28483.66],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-35686.53],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-39614.23],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",8564.63],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10226.56],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",12436.31],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",15147.93],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",26359.73],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",27197.37],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",11150.42],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",20621.89],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",17509.78],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30483.91],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",27168.1],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",11770.51],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-34269.96],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-78933.18],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-107702.84],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-53921.84],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-24018.36],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-51772.14],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-19046.62],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-35631.99],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",15810.07],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10705.57],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",8077.27],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",9079.54],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",19860.94],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",22443.84],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",25110.24],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",27252.22],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",17509.78],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30483.91],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",27168.1],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",11770.51],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-34269.96],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-78933.18],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-107702.84],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-53921.84],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-24018.36],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-51772.14],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-19046.62],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-35631.99],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",15810.07],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10705.57],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",8077.27],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",9079.54],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",19860.94],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",22443.84],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",25110.24],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",27252.22],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",35212.09],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",33001.33],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",31260.41],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",38388.6],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-74952.61],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-128403.24],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-132365.12],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-107213.61],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-32317.59],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-55588.26],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-18484.52],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-40505.23],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",9768.56],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",9070.04],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",13487.54],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",8800.64],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",25230.14],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",21580.28],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",14850.46],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",13221.82],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",35212.09],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",33001.33],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",31260.41],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",38388.6],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-74952.61],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-128403.24],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-132365.12],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-107213.61],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-32317.59],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-55588.26],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-18484.52],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-40505.23],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",9768.56],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",9070.04],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",13487.54],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",8800.64],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",25230.14],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",21580.28],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",14850.46],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",13221.82],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",28060.46],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",19031.88],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",36638.48],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",20799.53],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-88568.23],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-37908.13],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-57885.72],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-82684.15],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-32375.47],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-28958.66],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-49324.26],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-20164.68],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",6339.62],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",16000.77],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",13358.84],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",15312.14],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",26036.03],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",12985.13],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",7951.69],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",10940.38],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",28060.46],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",19031.88],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",36638.48],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",20799.53],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-88568.23],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-37908.13],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-57885.72],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-82684.15],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-32375.47],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-28958.66],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-49324.26],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-20164.68],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",6339.62],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",16000.77],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",13358.84],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",15312.14],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",26036.03],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",12985.13],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",7951.69],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",10940.38],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",40507.59],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30409.22],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",34709.4],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",43125.76],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-100137.49],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-85162.99],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-47045.95],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-62441.61],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-15253.33],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-20871.47],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-19347.98],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-37302.41],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10269.17],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",16085.33],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",11230.57],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10698.75],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",23259.79],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",9682.51],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",23700.86],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",16737.88],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",40507.59],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30409.22],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",34709.4],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",43125.76],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-100137.49],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-85162.99],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-47045.95],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-62441.61],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-15253.33],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-20871.47],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-19347.98],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-37302.41],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10269.17],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",16085.33],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",11230.57],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10698.75],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",23259.79],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",9682.51],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",23700.86],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",16737.88],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",31827.28],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",37290.34],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42393.51],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",24627.02],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-38626.96],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-105067.15],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-51746.01],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-96146.92],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-37111.8],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-31047.03],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-42161.18],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-48332.52],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6003.79],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15446.5],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5420.93],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15765.05],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",20977.77],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",19389.4],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",26901.44],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",10243.9],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",31827.28],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",37290.34],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42393.51],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",24627.02],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-38626.96],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-105067.15],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-51746.01],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-96146.92],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-37111.8],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-31047.03],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-42161.18],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-48332.52],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6003.79],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15446.5],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5420.93],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15765.05],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",20977.77],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",19389.4],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",26901.44],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",10243.9],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",11118.65],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",32648.02],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",36365.12],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26966.36],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-35102.26],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-108313.54],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46671.52],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-85881.15],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-18817.61],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-35985.39],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20387.01],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-22943.43],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17103.16],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13798.88],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17899.18],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15227.11],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",13096.81],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",13492.1],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",19267.79],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",27873.57],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",11118.65],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",32648.02],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",36365.12],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26966.36],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-35102.26],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-108313.54],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46671.52],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-85881.15],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-18817.61],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-35985.39],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20387.01],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-22943.43],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17103.16],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13798.88],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17899.18],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15227.11],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",13096.81],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",13492.1],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",19267.79],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",27873.57],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",33712.34],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26715.99],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",40350.76],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",25057.22],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-49424.68],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-110314.5],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-63324.61],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-106807.14],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-42881.89],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-16541.68],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-38588.82],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-39408.03],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",19026.13],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12783.84],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12879.91],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",14719.01],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",24524.32],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",24873.11],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",16381.15],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",28136.33],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",33712.34],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26715.99],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",40350.76],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",25057.22],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-49424.68],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-110314.5],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-63324.61],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-106807.14],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-42881.89],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-16541.68],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-38588.82],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-39408.03],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",19026.13],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12783.84],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12879.91],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",14719.01],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",24524.32],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",24873.11],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",16381.15],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",28136.33],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",13965.07],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42695.35],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",13892.78],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",35243.41],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46280.4],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-36605.98],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-128883.12],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-68389.76],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20222.84],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-51014.42],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20670.56],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-38760.79],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13854.26],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",18301.52],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7324.23],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17894.67],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",27907.73],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",19397.47],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",17241.46],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",12554.55],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",13965.07],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42695.35],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",13892.78],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",35243.41],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46280.4],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-36605.98],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-128883.12],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-68389.76],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20222.84],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-51014.42],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20670.56],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-38760.79],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13854.26],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",18301.52],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7324.23],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17894.67],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",27907.73],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",19397.47],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",17241.46],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",12554.55],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",14939.36],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",34088.86],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",39898.22],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42997.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-97864.22],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-50516.59],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-109705.13],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-77657.05],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-45385.43],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-53779.82],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-32469.52],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-48576.83],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5990.74],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6723.04],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7479.43],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13199.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",16660.64],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",13308.56],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",17162.66],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",17430.96],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",14939.36],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",34088.86],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",39898.22],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42997.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-97864.22],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-50516.59],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-109705.13],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-77657.05],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-45385.43],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-53779.82],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-32469.52],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-48576.83],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5990.74],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6723.04],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7479.43],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13199.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",16660.64],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",13308.56],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",17162.66],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",17430.96],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",28600.4],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",14994.55],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26134.02],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",35861.55],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-123170.57],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-57618.07],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-73306.72],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46299.76],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-36781.23],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-50081.13],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-47197.76],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-47324.37],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17849.66],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",8106.06],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",9881.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6973.25],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",10698.86],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",18636.95],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",19351.84],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",21077.13],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",28600.4],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",14994.55],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26134.02],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",35861.55],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-123170.57],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-57618.07],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-73306.72],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46299.76],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-36781.23],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-50081.13],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-47197.76],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-47324.37],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17849.66],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",8106.06],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",9881.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6973.25],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",10698.86],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",18636.95],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",19351.84],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",21077.13],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",30121.4],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",20494.19],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",12165.44],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",31781.94],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-44934.86],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-66779.24],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-115742.05],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-39303.73],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-37063.38],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-15986.55],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20695.89],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-34909.62],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7246.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5405.86],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12313.75],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",14888.7],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",21663.62],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",8051.47],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",24465.36],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",20283.15],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",30121.4],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",20494.19],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",12165.44],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",31781.94],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-44934.86],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-66779.24],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-115742.05],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-39303.73],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-37063.38],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-15986.55],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20695.89],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-34909.62],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7246.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5405.86],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12313.75],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",14888.7],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",21663.62],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",8051.47],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",24465.36],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",20283.15],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",31827.28],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",37290.34],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42393.51],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",24627.02],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-38626.96],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-105067.15],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-51746.01],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-96146.92],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-37111.8],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-31047.03],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-42161.18],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-48332.52],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",6003.79],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",15446.5],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",5420.93],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",15765.05],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",20977.77],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",19389.4],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",26901.44],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",10243.9],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",31827.28],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",37290.34],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42393.51],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",24627.02],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-38626.96],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-105067.15],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-51746.01],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-96146.92],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-37111.8],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-31047.03],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-42161.18],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-48332.52],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",6003.79],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",15446.5],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",5420.93],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",15765.05],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",20977.77],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",19389.4],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",26901.44],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",10243.9],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",11118.65],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",32648.02],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",36365.12],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26966.36],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-35102.26],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-108313.54],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46671.52],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-85881.15],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-18817.61],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-35985.39],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20387.01],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-22943.43],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",17103.16],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",13798.88],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",17899.18],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",15227.11],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",13096.81],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",13492.1],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",19267.79],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",27873.57],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",11118.65],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",32648.02],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",36365.12],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26966.36],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-35102.26],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-108313.54],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46671.52],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-85881.15],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-18817.61],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-35985.39],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20387.01],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-22943.43],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",17103.16],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",13798.88],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",17899.18],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",15227.11],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",13096.81],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",13492.1],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",19267.79],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",27873.57],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",33712.34],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26715.99],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",40350.76],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",25057.22],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-49424.68],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-110314.5],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-63324.61],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-106807.14],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-42881.89],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-16541.68],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-38588.82],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-39408.03],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",19026.13],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",12783.84],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",12879.91],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",14719.01],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",24524.32],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",24873.11],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",16381.15],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",28136.33],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",33712.34],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26715.99],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",40350.76],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",25057.22],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-49424.68],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-110314.5],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-63324.61],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-106807.14],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-42881.89],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-16541.68],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-38588.82],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-39408.03],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",19026.13],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",12783.84],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",12879.91],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",14719.01],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",24524.32],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",24873.11],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",16381.15],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",28136.33],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",13965.07],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42695.35],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",13892.78],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",35243.41],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46280.4],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-36605.98],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-128883.12],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-68389.76],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20222.84],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-51014.42],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20670.56],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-38760.79],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",13854.26],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",18301.52],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",7324.23],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",17894.67],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",27907.73],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",19397.47],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",17241.46],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",12554.55],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",13965.07],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42695.35],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",13892.78],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",35243.41],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46280.4],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-36605.98],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-128883.12],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-68389.76],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20222.84],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-51014.42],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20670.56],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-38760.79],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",13854.26],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",18301.52],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",7324.23],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",17894.67],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",27907.73],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",19397.47],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",17241.46],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",12554.55],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",14939.36],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",34088.86],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",39898.22],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42997.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-97864.22],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-50516.59],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-109705.13],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-77657.05],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-45385.43],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-53779.82],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-32469.52],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-48576.83],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",5990.74],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",6723.04],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",7479.43],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",13199.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",16660.64],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",13308.56],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",17162.66],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",17430.96],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",14939.36],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",34088.86],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",39898.22],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42997.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-97864.22],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-50516.59],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-109705.13],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-77657.05],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-45385.43],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-53779.82],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-32469.52],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-48576.83],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",5990.74],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",6723.04],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",7479.43],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",13199.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",16660.64],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",13308.56],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",17162.66],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",17430.96],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",28600.4],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",14994.55],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26134.02],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",35861.55],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-123170.57],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-57618.07],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-73306.72],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46299.76],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-36781.23],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-50081.13],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-47197.76],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-47324.37],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",17849.66],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",8106.06],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",9881.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",6973.25],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",10698.86],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",18636.95],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",19351.84],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",21077.13],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",28600.4],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",14994.55],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26134.02],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",35861.55],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-123170.57],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-57618.07],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-73306.72],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46299.76],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-36781.23],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-50081.13],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-47197.76],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-47324.37],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",17849.66],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",8106.06],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",9881.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",6973.25],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",10698.86],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",18636.95],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",19351.84],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",21077.13],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",30121.4],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",20494.19],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",12165.44],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",31781.94],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-44934.86],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-66779.24],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-115742.05],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-39303.73],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-37063.38],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-15986.55],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20695.89],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-34909.62],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",7246.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",5405.86],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",12313.75],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",14888.7],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",21663.62],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",8051.47],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",24465.36],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",20283.15],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",30121.4],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",20494.19],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",12165.44],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",31781.94],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-44934.86],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-66779.24],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-115742.05],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-39303.73],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-37063.38],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-15986.55],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20695.89],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-34909.62],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",7246.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",5405.86],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",12313.75],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",14888.7],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",21663.62],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",8051.47],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",24465.36],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",20283.15],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",27473],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",32720.96],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",38386.41],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",42708.06],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-122221.49],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-110301.15],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-83499.08],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-67347.9],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54328.84],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-16741.75],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-43164.87],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24185.04],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Opex",15724.55],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Opex",14648.75],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Opex",14896.09],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Opex",7096.58],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Opex",11842.06],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Opex",19234.77],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Opex",16264.08],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Opex",25272.8],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",27473],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",32720.96],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",38386.41],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",42708.06],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-122221.49],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-110301.15],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-83499.08],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-67347.9],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54328.84],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-16741.75],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-43164.87],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24185.04],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",15724.55],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",14648.75],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",14896.09],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",7096.58],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Opex",11842.06],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Opex",19234.77],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Opex",16264.08],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Opex",25272.8],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",38142.19],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",36457.99],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",39388.07],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",21783.02],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-82762.91],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-125427.83],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-75901.7],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-82672.8],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24682.3],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-36527.73],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-45758.58],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54521.39],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Opex",13732.95],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Opex",18196.9],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Opex",13752.72],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Opex",9863.47],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Opex",14208.41],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Opex",13506.84],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Opex",25460.17],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Opex",8358.45],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",38142.19],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",36457.99],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",39388.07],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",21783.02],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-82762.91],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-125427.83],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-75901.7],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-82672.8],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24682.3],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-36527.73],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-45758.58],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54521.39],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",13732.95],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",18196.9],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",13752.72],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",9863.47],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Opex",14208.41],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Opex",13506.84],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Opex",25460.17],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Opex",8358.45],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",16617.85],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14163.74],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",15889.33],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",23020.37],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-124829.81],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-72519.83],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-50945.75],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-108078.6],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-17161.94],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-27607.69],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-26709.74],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-42335.93],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Opex",11735.97],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Opex",9385.23],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Opex",16153.47],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Opex",17705.6],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Opex",28244.48],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Opex",16761.13],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Opex",7551.58],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Opex",12950.83],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",16617.85],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14163.74],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",15889.33],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",23020.37],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-124829.81],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-72519.83],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-50945.75],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-108078.6],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-17161.94],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-27607.69],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-26709.74],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-42335.93],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",11735.97],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",9385.23],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",16153.47],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",17705.6],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Opex",28244.48],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Opex",16761.13],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Opex",7551.58],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Opex",12950.83],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",18804.74],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14854.81],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",29384.34],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",41301.16],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-116886.7],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-121432.58],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-76434.98],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-90292.88],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-32934.5],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-43670.49],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-19058.86],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-47802.15],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Opex",15458.6],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Opex",8353.58],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Opex",16646.3],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Opex",5134.54],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Opex",25360.81],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Opex",9718.65],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Opex",9691.58],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Opex",25294.21],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",18804.74],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14854.81],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",29384.34],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",41301.16],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-116886.7],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-121432.58],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-76434.98],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-90292.88],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-32934.5],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-43670.49],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-19058.86],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-47802.15],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",15458.6],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",8353.58],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",16646.3],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",5134.54],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Opex",25360.81],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Opex",9718.65],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Opex",9691.58],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Opex",25294.21],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",24004.3],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",29095.86],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",42179.52],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",31374.53],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-129512.52],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-101137.98],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-35018.16],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-124444.7],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-52304.74],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24852.32],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-47224.2],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-14429.38],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Opex",6379.06],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Opex",15396.89],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Opex",9142.99],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Opex",7179.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Opex",28132.37],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Opex",10770.15],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Opex",24748.11],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Opex",8877.61],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",24004.3],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",29095.86],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",42179.52],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",31374.53],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-129512.52],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-101137.98],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-35018.16],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-124444.7],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-52304.74],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24852.32],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-47224.2],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-14429.38],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",6379.06],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",15396.89],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",9142.99],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",7179.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Opex",28132.37],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Opex",10770.15],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Opex",24748.11],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Opex",8877.61],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14431.18],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",41691.93],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",34346.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",39964.15],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-48647.79],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-63907.95],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-50206.91],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-123822.65],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-40260.08],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24104.91],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-49129.47],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-27910.72],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Opex",6746.26],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Opex",8620.3],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Opex",16231.4],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Opex",11172.2],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Opex",20150.64],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Opex",11226.39],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Opex",24933.07],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Opex",22821.55],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14431.18],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",41691.93],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",34346.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",39964.15],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-48647.79],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-63907.95],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-50206.91],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-123822.65],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-40260.08],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24104.91],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-49129.47],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-27910.72],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",6746.26],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",8620.3],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",16231.4],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",11172.2],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Opex",20150.64],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Opex",11226.39],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Opex",24933.07],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Opex",22821.55],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",16966.78],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",20155.77],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",31948.19],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",23969.25],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-75696.13],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-65608.57],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-39309.07],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-70564.92],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-16628.22],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-25538.8],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-41033.66],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54287.93],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Opex",18284.34],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Opex",7427.6],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Opex",8320.85],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Opex",17128.11],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Opex",13711.5],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Opex",13469.85],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Opex",27662.1],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Opex",11137.38],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",16966.78],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",20155.77],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",31948.19],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",23969.25],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-75696.13],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-65608.57],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-39309.07],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-70564.92],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-16628.22],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-25538.8],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-41033.66],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54287.93],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",18284.34],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",7427.6],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",8320.85],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",17128.11],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Opex",13711.5],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Opex",13469.85],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Opex",27662.1],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Opex",11137.38],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-36507.27],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-26687.09],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-25609.42],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-19152.35],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",130623.12],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",36543.91],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",91356.76],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",81805.8],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",43343.52],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",46119.77],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",34048.39],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18462.54],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-14477.91],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-11876.96],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-12005.19],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-7109.05],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Fee Income",-7598.21],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Fee Income",-13329.4],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24172.54],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Fee Income",-12622.44],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-36507.27],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-26687.09],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-25609.42],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-19152.35],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",130623.12],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",36543.91],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",91356.76],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",81805.8],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",43343.52],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",46119.77],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",34048.39],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18462.54],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-14477.91],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-11876.96],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-12005.19],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-7109.05],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-7598.21],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-13329.4],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24172.54],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-12622.44],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-22096.9],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-12526.2],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-23509.71],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-28902.67],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",129742.11],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",56981.34],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",132994.5],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",82924.43],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48462.75],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",38436.34],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17783.85],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",51285.73],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-16269.12],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-15498.43],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-11437.68],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-13577.66],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Fee Income",-26184.13],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Fee Income",-20195.7],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Fee Income",-15222.78],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Fee Income",-27347.6],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-22096.9],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-12526.2],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-23509.71],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-28902.67],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",129742.11],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",56981.34],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",132994.5],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",82924.43],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48462.75],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",38436.34],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17783.85],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",51285.73],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-16269.12],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-15498.43],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-11437.68],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-13577.66],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-26184.13],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-20195.7],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-15222.78],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-27347.6],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-43422.12],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-38395.83],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20795.37],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-23742.98],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",120787.84],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",122979.69],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",89154.23],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",72929.63],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",54683.9],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",35694.04],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",32668.76],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",44292.4],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10419.85],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10150.35],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-7801.43],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-17174.84],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Fee Income",-23917.28],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Fee Income",-19508.73],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24547.42],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Fee Income",-16887.41],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-43422.12],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-38395.83],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20795.37],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-23742.98],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",120787.84],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",122979.69],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",89154.23],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",72929.63],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",54683.9],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",35694.04],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",32668.76],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",44292.4],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10419.85],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10150.35],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-7801.43],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-17174.84],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-23917.28],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-19508.73],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24547.42],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-16887.41],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-34235.18],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20167.38],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-11004.32],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20470.75],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",89465.26],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",106232.49],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",110215.05],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",59574.32],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17612.73],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",43613.72],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",26004.89],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",40277.06],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-7343.14],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-14688],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-13441.85],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10556.52],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24934.06],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Fee Income",-18355.61],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Fee Income",-14098.29],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Fee Income",-8653.11],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-34235.18],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20167.38],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-11004.32],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20470.75],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",89465.26],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",106232.49],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",110215.05],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",59574.32],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17612.73],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",43613.72],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",26004.89],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",40277.06],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-7343.14],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-14688],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-13441.85],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10556.52],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24934.06],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-18355.61],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-14098.29],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-8653.11],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-27269.29],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-14475.64],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-12418.65],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-30654.11],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",71373.18],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",99984.65],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",86485.84],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",120936.68],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",26871.12],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",33446.23],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18786.45],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17328.61],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-15319.24],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-19089.48],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-18407.57],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-6082.11],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Fee Income",-22297.86],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Fee Income",-22132.04],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Fee Income",-14190.55],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Fee Income",-9340.08],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-27269.29],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-14475.64],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-12418.65],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-30654.11],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",71373.18],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",99984.65],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",86485.84],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",120936.68],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",26871.12],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",33446.23],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18786.45],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17328.61],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-15319.24],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-19089.48],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-18407.57],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-6082.11],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-22297.86],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-22132.04],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-14190.55],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-9340.08],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-37599.84],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-24432.95],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-14207.11],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-39500.89],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",34701.79],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",43851.62],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",110508.06],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",100758.21],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",54993.61],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",47523.61],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",22515.46],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48472.76],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-14723.52],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-17596.57],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10933.61],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10612.76],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24106.06],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Fee Income",-18366.1],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Fee Income",-19930.81],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Fee Income",-9958.32],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-37599.84],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-24432.95],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-14207.11],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-39500.89],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",34701.79],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",43851.62],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",110508.06],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",100758.21],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",54993.61],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",47523.61],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",22515.46],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48472.76],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-14723.52],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-17596.57],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10933.61],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10612.76],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24106.06],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-18366.1],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-19930.81],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-9958.32],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-24089.28],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-43700.52],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-25952.43],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-16404.07],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",77803.22],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",73300.05],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",116973.47],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",65230.8],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",22046.86],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48514.78],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18704.35],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",49405.79],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-13964.73],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-15562.16],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-14872.66],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-5778.06],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Fee Income",-22626.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24392.08],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Fee Income",-11712.8],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Fee Income",-22296.87],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-24089.28],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-43700.52],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-25952.43],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-16404.07],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",77803.22],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",73300.05],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",116973.47],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",65230.8],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",22046.86],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48514.78],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18704.35],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",49405.79],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-13964.73],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-15562.16],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-14872.66],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-5778.06],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-22626.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24392.08],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-11712.8],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-22296.87],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-14837.28],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30370.23],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-32253.54],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-32031.64],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",44109.92],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",70066.35],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",45441.44],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",88706.39],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",51000.8],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",48298.3],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",18917.5],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",36916.45],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-7811.99],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-5725.56],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-14284.72],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-7804.69],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-16590.77],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-23845],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-9129.62],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-15006.08],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-14837.28],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30370.23],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-32253.54],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-32031.64],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",44109.92],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",70066.35],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",45441.44],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",88706.39],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",51000.8],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",48298.3],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",18917.5],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",36916.45],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-7811.99],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-5725.56],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-14284.72],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-7804.69],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-16590.77],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-23845],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-9129.62],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-15006.08],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30192.37],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-22921.36],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30364.1],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-35790.58],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",50792.25],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",66515.61],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",41880.69],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",84393.44],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",16191.63],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",49374.62],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",28081.58],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",30633.53],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-11445.07],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-5342.71],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-12291.96],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-18107.54],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-24415.61],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-9413.22],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-10304.14],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-17987.53],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30192.37],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-22921.36],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30364.1],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-35790.58],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",50792.25],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",66515.61],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",41880.69],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",84393.44],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",16191.63],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",49374.62],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",28081.58],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",30633.53],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-11445.07],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-5342.71],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-12291.96],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-18107.54],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-24415.61],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-9413.22],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-10304.14],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-17987.53],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-16332],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-17908.65],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-21016.16],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-25946.3],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",39125.53],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",39029.42],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",54277.57],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",87927.49],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",30515.55],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",22565.83],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",27398.72],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24029.77],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-5802.63],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-17904.36],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-15805.94],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-17568.83],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-17620.17],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-15548.34],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-20385.48],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-20927.46],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-16332],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-17908.65],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-21016.16],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-25946.3],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",39125.53],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",39029.42],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",54277.57],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",87927.49],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",30515.55],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",22565.83],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",27398.72],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24029.77],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-5802.63],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-17904.36],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-15805.94],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-17568.83],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-17620.17],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-15548.34],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-20385.48],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-20927.46],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-41245.53],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-29616.95],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-18551.97],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-13539.04],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",82952.46],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",73872.71],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",74901.23],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",85688.26],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",25935.88],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",45066.26],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",54365.01],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",36904.78],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-13041.64],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-16582.29],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-4838.16],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-5992.28],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-20436.5],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-18934.02],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-7441.17],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-23824.87],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-41245.53],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-29616.95],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-18551.97],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-13539.04],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",82952.46],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",73872.71],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",74901.23],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",85688.26],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",25935.88],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",45066.26],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",54365.01],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",36904.78],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-13041.64],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-16582.29],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-4838.16],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-5992.28],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-20436.5],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-18934.02],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-7441.17],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-23824.87],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-38305.8],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-18860.38],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-37626.56],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-38856.25],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",92405.3],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",127659.05],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",95195.83],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",119662.55],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",25522.38],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",27383.96],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",37378.93],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24870.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-16182.84],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-10837.54],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-9584.28],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-13146.15],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-26316.79],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-25335.16],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-19013.24],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-13840.48],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-38305.8],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-18860.38],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-37626.56],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-38856.25],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",92405.3],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",127659.05],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",95195.83],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",119662.55],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",25522.38],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",27383.96],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",37378.93],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24870.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-16182.84],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-10837.54],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-9584.28],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-13146.15],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-26316.79],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-25335.16],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-19013.24],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-13840.48],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-19947.46],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-36283.2],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-12491.15],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-20611.6],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",71363.84],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",49488.75],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",108131.33],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",110086.23],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24793.89],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",37277.64],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",46193.22],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",40376.4],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-8372.01],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-15625.7],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-13958.01],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-18361.88],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-13063.79],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-17270.38],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-15340.56],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-17640.43],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-19947.46],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-36283.2],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-12491.15],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-20611.6],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",71363.84],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",49488.75],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",108131.33],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",110086.23],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24793.89],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",37277.64],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",46193.22],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",40376.4],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-8372.01],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-15625.7],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-13958.01],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-18361.88],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-13063.79],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-17270.38],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-15340.56],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-17640.43],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-21073.33],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-14428.12],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-37140.95],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-41122.87],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",97441.74],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",54029.95],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",69343.52],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",62880.77],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",20523.65],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",55429.92],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",14010.59],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",21026.47],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-8396.39],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-11781.47],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-15838.47],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-7486.05],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-7863.53],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-18694.34],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-23118.91],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-25115.91],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-21073.33],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-14428.12],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-37140.95],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-41122.87],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",97441.74],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",54029.95],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",69343.52],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",62880.77],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",20523.65],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",55429.92],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",14010.59],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",21026.47],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-8396.39],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-11781.47],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-15838.47],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-7486.05],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-7863.53],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-18694.34],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-23118.91],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-25115.91],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20516.1],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-19425.5],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-16170.58],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-37322.97],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",48075.79],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",45950.69],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",33530.45],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",44506.37],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",38072.65],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",42710.75],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",45306.4],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",34177.22],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Income",-15194],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Income",-10040.08],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Income",-11045.9],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Income",-14773.91],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Income",-27994.75],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Income",-19334.83],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Income",-21972.02],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Income",-22061.31],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20516.1],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-19425.5],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-16170.58],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-37322.97],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",48075.79],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",45950.69],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",33530.45],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",44506.37],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",38072.65],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",42710.75],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",45306.4],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",34177.22],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-15194],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-10040.08],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-11045.9],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-14773.91],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Income",-27994.75],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Income",-19334.83],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Income",-21972.02],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Income",-22061.31],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20502.73],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43419.93],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-22239.49],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-17189.33],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",123583.05],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",69458.31],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",119124.6],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",108084.6],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",25934.76],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",35918.61],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",34973.06],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",45017.28],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Income",-11197.55],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Income",-14203.91],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Income",-18440.87],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Income",-12122.18],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Income",-7913.14],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Income",-13038.56],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Income",-24190.26],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Income",-10885.95],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20502.73],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43419.93],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-22239.49],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-17189.33],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",123583.05],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",69458.31],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",119124.6],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",108084.6],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",25934.76],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",35918.61],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",34973.06],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",45017.28],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-11197.55],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-14203.91],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-18440.87],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-12122.18],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Income",-7913.14],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Income",-13038.56],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Income",-24190.26],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Income",-10885.95],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-36779.53],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-32400.73],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-31685.34],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43323.33],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",118776.87],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",87019.79],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",107222.28],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",50866.99],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",34681.17],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",54031.65],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",25884.68],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",49588.05],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Income",-7925.24],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Income",-6645.39],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Income",-8702.64],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Income",-8357.61],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Income",-8270.58],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Income",-20294.92],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Income",-7231.55],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Income",-18912.05],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-36779.53],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-32400.73],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-31685.34],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43323.33],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",118776.87],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",87019.79],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",107222.28],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",50866.99],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",34681.17],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",54031.65],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",25884.68],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",49588.05],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-7925.24],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-6645.39],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-8702.64],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-8357.61],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Income",-8270.58],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Income",-20294.92],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Income",-7231.55],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Income",-18912.05],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-21519.3],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-27141.38],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-17866.16],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-41470.92],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",76379.59],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",75842.3],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",129672.7],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",64376.49],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",50447.05],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",25011.21],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",20429.32],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",21412.7],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Income",-6992.15],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Income",-7530.68],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Income",-14565.35],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Income",-8398.4],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Income",-9378.77],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Income",-8018.59],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Income",-23043.37],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Income",-14391.81],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-21519.3],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-27141.38],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-17866.16],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-41470.92],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",76379.59],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",75842.3],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",129672.7],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",64376.49],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",50447.05],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",25011.21],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",20429.32],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",21412.7],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-6992.15],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-7530.68],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-14565.35],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-8398.4],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Income",-9378.77],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Income",-8018.59],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Income",-23043.37],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Income",-14391.81],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-16455.32],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43106.05],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-34857.25],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-25032.02],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",125608.03],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",110735.64],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",51295.49],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",102822.58],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",37627.7],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",29381.35],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",15689.36],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",43480.43],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Income",-6663.05],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Income",-11260.7],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Income",-9376.87],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Income",-16651.4],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Income",-22058.33],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Income",-18646.16],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Income",-12516.85],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Income",-20700.55],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-16455.32],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43106.05],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-34857.25],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-25032.02],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",125608.03],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",110735.64],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",51295.49],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",102822.58],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",37627.7],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",29381.35],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",15689.36],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",43480.43],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-6663.05],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-11260.7],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-9376.87],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-16651.4],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Income",-22058.33],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Income",-18646.16],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Income",-12516.85],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Income",-20700.55],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20580.27],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-24811.02],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-23372.15],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-19108.77],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",112469.63],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",111853.59],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",95207.17],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",104537.87],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",31421.86],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",34106],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",23957.98],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",30231.17],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Income",-18581.19],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Income",-15473.09],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Income",-18691.66],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Income",-8689.88],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Income",-20019.68],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Income",-9200.48],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Income",-20146.24],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Income",-17992.21],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20580.27],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-24811.02],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-23372.15],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-19108.77],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",112469.63],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",111853.59],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",95207.17],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",104537.87],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",31421.86],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",34106],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",23957.98],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",30231.17],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-18581.19],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-15473.09],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-18691.66],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-8689.88],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Income",-20019.68],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Income",-9200.48],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Income",-20146.24],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Income",-17992.21],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43209.66],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-34897.56],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-41836.06],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-14334.15],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",56705.69],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",130856.72],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",60908.52],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",96546.05],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",20310.22],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",14461.11],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",32614.21],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",50872.23],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Income",-18758.07],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Income",-13197.4],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Income",-19180.36],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Income",-15396.6],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Income",-17213.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Income",-24223.28],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Income",-27303.94],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Income",-14281.97],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43209.66],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-34897.56],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-41836.06],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-14334.15],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",56705.69],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",130856.72],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",60908.52],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",96546.05],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",20310.22],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",14461.11],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",32614.21],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",50872.23],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-18758.07],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-13197.4],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-19180.36],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-15396.6],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Income",-17213.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Income",-24223.28],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Income",-27303.94],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Income",-14281.97],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-32927.29],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-26048.14],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-17662.01],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-26609.33],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",64721.55],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",36945.03],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",100061.4],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",120377.37],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",43089.75],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",29709.42],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",33208.04],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",32154.8],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Net Interest Income",-6179.14],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Net Interest Income",-8216.53],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Net Interest Income",-18372.82],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Net Interest Income",-12003.84],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Net Interest Income",-20368.62],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Net Interest Income",-16444.22],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Net Interest Income",-24294.01],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Net Interest Income",-12481.27],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-32927.29],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-26048.14],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-17662.01],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-26609.33],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",64721.55],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",36945.03],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",100061.4],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",120377.37],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",43089.75],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",29709.42],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",33208.04],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",32154.8],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Net Interest Income",-6179.14],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Net Interest Income",-8216.53],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Net Interest Income",-18372.82],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Net Interest Income",-12003.84],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Net Interest Income",-20368.62],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Net Interest Income",-16444.22],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Net Interest Income",-24294.01],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Net Interest Income",-12481.27]]}}'
              changedProps.datasets = '{"IKF Finance - Model (MIS)":{"schema":["Date","IKF_Branch","IKF_CompanyCode","IKF_Product","Version","Account","Amount"],"types":["string","string","string","string","string","string","number"],"rows2D":[["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-77216.15],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-90008.71],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-104044.74],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-74804.09],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",183196.74],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",195074.36],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",251343.55],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",241610.39],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",94985.71],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",87693.81],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",129433.97],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",67100.03],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-35978.03],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-30260.16],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-38613.44],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-40453.7],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-60327.18],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-30666.52],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-72572.46],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-57325.88],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-77216.15],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-90008.71],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-104044.74],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-74804.09],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",183196.74],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",195074.36],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",251343.55],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",241610.39],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",94985.71],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",87693.81],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",129433.97],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",67100.03],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-35978.03],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-30260.16],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-38613.44],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-40453.7],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-60327.18],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-30666.52],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-72572.46],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-57325.88],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84687.8],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84813.97],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-107485.85],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88394.38],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",236411.09],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",242612.87],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",188117.72],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",295075.03],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",100213.19],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",86992.86],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131811.18],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",111974.58],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-37533.51],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-31316.47],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-28300.6],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-34246.52],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-47156.1],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-81686.78],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-54211.05],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-50974.19],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84687.8],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84813.97],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-107485.85],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88394.38],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",236411.09],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",242612.87],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",188117.72],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",295075.03],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",100213.19],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",86992.86],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131811.18],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",111974.58],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-37533.51],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-31316.47],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-28300.6],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-34246.52],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-47156.1],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-81686.78],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-54211.05],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-50974.19],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70873.66],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-74023.01],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-85781.47],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-113826.38],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",202428.8],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",188776.47],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",286632.7],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",247545.85],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",124909.67],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",95199.7],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",62572.97],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",128417.75],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-26126.16],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-37573.82],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-25538.11],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-41455.39],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-49999.08],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-41991.7],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-37400.6],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-42216.77],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70873.66],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-74023.01],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-85781.47],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-113826.38],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",202428.8],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",188776.47],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",286632.7],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",247545.85],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",124909.67],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",95199.7],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",62572.97],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",128417.75],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-26126.16],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-37573.82],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-25538.11],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-41455.39],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-49999.08],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-41991.7],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-37400.6],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-42216.77],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70137.03],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-94596.05],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-79334.49],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70673.02],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",303414.6],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",269046.52],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",256837.84],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",315965.64],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",78323.54],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",137825.86],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131258.28],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",103046.75],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-36039.54],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-36131.7],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-36932.8],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-22899.06],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-41518.32],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-45044.59],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-64107.43],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-54230.05],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70137.03],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-94596.05],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-79334.49],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70673.02],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",303414.6],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",269046.52],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",256837.84],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",315965.64],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",78323.54],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",137825.86],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131258.28],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",103046.75],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-36039.54],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-36131.7],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-36932.8],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-22899.06],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-41518.32],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-45044.59],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-64107.43],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-54230.05],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88048.08],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-93113.15],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-68982.91],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-86578.55],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",174830.47],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",307664.81],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",232018.72],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",252476.18],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",80042.39],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",111824.86],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131040.39],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",83599.15],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-34868.35],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-29578.81],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-47665.83],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-36839.61],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-54930.76],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-52110.87],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-51758.26],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-40702.36],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88048.08],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-93113.15],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-68982.91],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-86578.55],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",174830.47],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",307664.81],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",232018.72],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",252476.18],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",80042.39],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",111824.86],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131040.39],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",83599.15],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-34868.35],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-29578.81],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-47665.83],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-36839.61],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-54930.76],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-52110.87],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-51758.26],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-40702.36],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-92005.03],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-92070.74],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-108641.94],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88188.49],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",244446.97],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",262328.82],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",255559.05],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",228049.5],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",107500.08],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",124709.88],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",97771.42],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",130396.49],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-27618.41],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-43184.31],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-35023.44],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-29665.68],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-66566.04],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-65867.16],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-52210.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-77916.3],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-92005.03],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-92070.74],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-108641.94],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88188.49],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",244446.97],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",262328.82],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",255559.05],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",228049.5],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",107500.08],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",124709.88],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",97771.42],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",130396.49],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-27618.41],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-43184.31],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-35023.44],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-29665.68],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-66566.04],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-65867.16],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-52210.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-77916.3],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84629.76],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70846.28],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-69167.13],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-104769.77],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",221650.84],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",305124.56],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",295691.75],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",259018.36],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",72070.11],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",64227.52],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",125862.45],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",127315.83],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-30566.99],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-31693.94],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-33517.31],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-27177.11],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-66334.32],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-36975.12],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-48862.25],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-50681.37],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84629.76],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70846.28],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-69167.13],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-104769.77],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",221650.84],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",305124.56],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",295691.75],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",259018.36],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",72070.11],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",64227.52],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",125862.45],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",127315.83],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-30566.99],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-31693.94],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-33517.31],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-27177.11],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-66334.32],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-36975.12],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-48862.25],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-50681.37],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-59300.28],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-70011.3],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-80779.92],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-67335.08],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",160848.45],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",215368.3],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",135245.09],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",163494.82],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",91440.64],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",47788.78],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",85326.05],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",72517.56],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Opex",-21728.34],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Opex",-30095.25],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Opex",-20317.02],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Opex",-22861.63],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Opex",-32819.83],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Opex",-38624.17],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Opex",-43165.52],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Opex",-35516.7],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-59300.28],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-70011.3],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-80779.92],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-67335.08],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",160848.45],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",215368.3],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",135245.09],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",163494.82],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",91440.64],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",47788.78],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",85326.05],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",72517.56],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Opex",-21728.34],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Opex",-30095.25],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Opex",-20317.02],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Opex",-22861.63],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Opex",-32819.83],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Opex",-38624.17],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Opex",-43165.52],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Opex",-35516.7],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-49260.84],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-69106.01],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-75753.19],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-48749.38],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",117865.17],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",233741.37],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",122573.22],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",168553.95],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",43499.91],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",72513.12],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",66145.59],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",77464.82],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Opex",-30836.11],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Opex",-31995.78],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Opex",-31651.9],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Opex",-25090.58],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Opex",-27305.22],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Opex",-26998.94],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Opex",-44727.96],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Opex",-36232.02],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-49260.84],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-69106.01],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-75753.19],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-48749.38],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",117865.17],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",233741.37],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",122573.22],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",168553.95],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",43499.91],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",72513.12],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",66145.59],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",77464.82],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Opex",-30836.11],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Opex",-31995.78],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Opex",-31651.9],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Opex",-25090.58],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Opex",-27305.22],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Opex",-26998.94],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Opex",-44727.96],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Opex",-36232.02],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-50330.19],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-40879.73],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-56240.09],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-48077.59],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",174254.49],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",182834.33],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",114270.36],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",214885.74],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",60043.83],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",44149.37],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",65298.56],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",81743.96],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Opex",-30762.1],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Opex",-22169.07],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Opex",-29033.38],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Opex",-32424.61],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Opex",-52768.8],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Opex",-41634.24],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Opex",-23932.73],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Opex",-41087.16],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-50330.19],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-40879.73],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-56240.09],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-48077.59],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",174254.49],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",182834.33],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",114270.36],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",214885.74],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",60043.83],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",44149.37],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",65298.56],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",81743.96],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Opex",-30762.1],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Opex",-22169.07],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Opex",-29033.38],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Opex",-32424.61],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Opex",-52768.8],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Opex",-41634.24],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Opex",-23932.73],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Opex",-41087.16],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-32769.81],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-57550.16],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-43277.12],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-76544.57],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",163167.1],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",158038.56],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",205318.1],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",158682.64],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",53157.34],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",94684.91],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",39729.42],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",86562.94],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Opex",-29312.86],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Opex",-26655.1],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Opex",-23970.53],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Opex",-23029.21],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Opex",-53268.54],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Opex",-29116.12],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Opex",-26933.04],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Opex",-37848.76],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-32769.81],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-57550.16],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-43277.12],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-76544.57],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",163167.1],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",158038.56],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",205318.1],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",158682.64],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",53157.34],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",94684.91],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",39729.42],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",86562.94],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Opex",-29312.86],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Opex",-26655.1],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Opex",-23970.53],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Opex",-23029.21],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Opex",-53268.54],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Opex",-29116.12],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Opex",-26933.04],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Opex",-37848.76],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-38943.66],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-63184.72],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-82077.74],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-74371.94],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",227376.74],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",151654.57],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",144723.29],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",202101.75],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",97690.17],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",78632.14],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",79693.72],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",63006.21],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Opex",-12369.8],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Opex",-22119.93],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Opex",-16622.42],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Opex",-20378.82],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Opex",-44793.01],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Opex",-24078.71],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Opex",-41910.77],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Opex",-26308.57],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-38943.66],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-63184.72],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-82077.74],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-74371.94],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",227376.74],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",151654.57],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",144723.29],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",202101.75],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",97690.17],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",78632.14],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",79693.72],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",63006.21],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Opex",-12369.8],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Opex",-22119.93],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Opex",-16622.42],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Opex",-20378.82],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Opex",-44793.01],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Opex",-24078.71],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Opex",-41910.77],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Opex",-26308.57],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-43031.58],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-56686.48],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-60480.25],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-75825.7],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",171818.36],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",121526.02],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",123513.63],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",170122.41],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",77041.31],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",74186.04],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",96327.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",75235.09],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Opex",-24595.92],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Opex",-16726.36],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Opex",-26112.63],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Opex",-18145.45],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Opex",-30849.5],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Opex",-29863.34],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Opex",-44284.91],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Opex",-43898.68],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-43031.58],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-56686.48],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-60480.25],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-75825.7],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",171818.36],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",121526.02],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",123513.63],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",170122.41],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",77041.31],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",74186.04],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",96327.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",75235.09],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Opex",-24595.92],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Opex",-16726.36],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Opex",-26112.63],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Opex",-18145.45],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Opex",-30849.5],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Opex",-29863.34],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Opex",-44284.91],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Opex",-43898.68],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-47088.18],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-40649.96],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-44113.63],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-55751.19],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",120630.99],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",132387.81],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",155051.12],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",109868.65],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",53691.6],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",41525.35],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",61729.55],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",89197.55],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Opex",-25531.31],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Opex",-12833.46],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Opex",-20634.6],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Opex",-32016.81],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Opex",-35375.12],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Opex",-21521.32],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Opex",-52127.46],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Opex",-31420.53],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-47088.18],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-40649.96],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-44113.63],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-55751.19],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",120630.99],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",132387.81],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",155051.12],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",109868.65],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",53691.6],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",41525.35],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",61729.55],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",89197.55],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Opex",-25531.31],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Opex",-12833.46],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Opex",-20634.6],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Opex",-32016.81],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Opex",-35375.12],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Opex",-21521.32],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Opex",-52127.46],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Opex",-31420.53],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41648.63],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",77209.53],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",87450.51],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",46845.93],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",135944.54],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-94654.05],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",51007.98],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",6259.49],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",20772.21],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",46016.4],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-5946.68],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-21113.57],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Revenue",7287.86],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Revenue",35174.29],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Revenue",-558.55],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Revenue",27699.19],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Revenue",7861.56],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Revenue",24008.94],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Revenue",37545.18],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Revenue",9853.82],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41648.63],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",77209.53],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",87450.51],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",46845.93],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",135944.54],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-94654.05],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",51007.98],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",6259.49],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",20772.21],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",46016.4],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-5946.68],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-21113.57],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Revenue",7287.86],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Revenue",35174.29],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Revenue",-558.55],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Revenue",27699.19],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Revenue",7861.56],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Revenue",24008.94],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Revenue",37545.18],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Revenue",9853.82],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41484.78],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",30789.9],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",76032.24],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",24925.83],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",180194.28],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-277501.05],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",162782.66],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-121835.21],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",24840.66],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",41575.46],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",75257.48],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",54914.7],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Revenue",15432.02],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Revenue",15604.36],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Revenue",29466.63],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Revenue",14785.87],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Revenue",-36215.47],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Revenue",28081.04],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Revenue",15761.6],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Revenue",45170.62],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41484.78],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",30789.9],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",76032.24],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",24925.83],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",180194.28],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-277501.05],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",162782.66],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-121835.21],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",24840.66],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",41575.46],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",75257.48],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",54914.7],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Revenue",15432.02],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Revenue",15604.36],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Revenue",29466.63],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Revenue",14785.87],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Revenue",-36215.47],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Revenue",28081.04],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Revenue",15761.6],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Revenue",45170.62],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-10562.64],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",3768.99],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",73867.01],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",18184.05],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",58567.47],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-82064.95],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",147793.46],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-107040.06],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",64782.75],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",163729.04],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",74518.43],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-54027.9],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Revenue",33232.28],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Revenue",7485.9],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Revenue",19662.62],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Revenue",30415.38],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Revenue",28694.1],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Revenue",25475.97],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Revenue",-13496.87],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Revenue",11441.91],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-10562.64],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",3768.99],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",73867.01],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",18184.05],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",58567.47],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-82064.95],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",147793.46],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-107040.06],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",64782.75],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",163729.04],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",74518.43],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-54027.9],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Revenue",33232.28],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Revenue",7485.9],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Revenue",19662.62],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Revenue",30415.38],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Revenue",28694.1],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Revenue",25475.97],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Revenue",-13496.87],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Revenue",11441.91],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-46075.36],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",49234.17],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",19965.53],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",76447.48],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",85129.81],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-1713.31],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-104939.97],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",85675.57],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",49980.19],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-88170.65],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",54851.82],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",89619.83],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Revenue",49243.74],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Revenue",23338.57],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Revenue",5836.12],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Revenue",24094.49],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Revenue",16129.14],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Revenue",10322.23],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Revenue",35765.16],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Revenue",38029.68],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-46075.36],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",49234.17],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",19965.53],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",76447.48],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",85129.81],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-1713.31],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-104939.97],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",85675.57],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",49980.19],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-88170.65],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",54851.82],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",89619.83],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Revenue",49243.74],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Revenue",23338.57],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Revenue",5836.12],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Revenue",24094.49],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Revenue",16129.14],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Revenue",10322.23],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Revenue",35765.16],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Revenue",38029.68],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",6518.08],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",45082.17],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",54762.4],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41881.57],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",62020.29],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",170021.95],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",56771.28],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",71664.52],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-21230.66],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",27548.44],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-55654.46],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",72801.73],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Revenue",4811.85],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Revenue",6753.62],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Revenue",19845.83],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Revenue",8807.5],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Revenue",26519.07],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Revenue",6892.23],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Revenue",11750.19],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Revenue",-20508.43],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",6518.08],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",45082.17],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",54762.4],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41881.57],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",62020.29],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",170021.95],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",56771.28],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",71664.52],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-21230.66],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",27548.44],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-55654.46],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",72801.73],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Revenue",4811.85],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Revenue",6753.62],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Revenue",19845.83],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Revenue",8807.5],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Revenue",26519.07],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Revenue",6892.23],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Revenue",11750.19],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Revenue",-20508.43],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",27697.2],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",22750.6],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",117980.47],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",65857.59],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-192588.35],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",165337.11],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",70054.67],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",275854.16],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",14153.59],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",87625.79],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-64894.96],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-24809.19],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Revenue",-3647.59],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Revenue",10789.35],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Revenue",16210.78],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Revenue",6317.86],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Revenue",22499.97],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Revenue",21324.68],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Revenue",17608.95],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Revenue",64397.26],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",27697.2],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",22750.6],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",117980.47],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",65857.59],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-192588.35],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",165337.11],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",70054.67],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",275854.16],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",14153.59],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",87625.79],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-64894.96],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-24809.19],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Revenue",-3647.59],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Revenue",10789.35],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Revenue",16210.78],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Revenue",6317.86],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Revenue",22499.97],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Revenue",21324.68],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Revenue",17608.95],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Revenue",64397.26],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",1957.49],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-2011.56],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-47592.08],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",84003.96],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",289497.98],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",198539.99],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",15492.46],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",76145.13],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",109970.45],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",172765.11],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-54085.5],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",9866.59],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Revenue",2694.53],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Revenue",2352.75],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Revenue",-13433.4],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Revenue",26387.97],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Revenue",54685.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Revenue",-49233.52],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Revenue",38412.99],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Revenue",-4917.14],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",1957.49],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-2011.56],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-47592.08],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",84003.96],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",289497.98],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",198539.99],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",15492.46],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",76145.13],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",109970.45],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",172765.11],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-54085.5],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",9866.59],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Revenue",2694.53],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Revenue",2352.75],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Revenue",-13433.4],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Revenue",26387.97],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Revenue",54685.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Revenue",-49233.52],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Revenue",38412.99],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Revenue",-4917.14]]}}';
            }

            if(changedProps.datasets == 'SmartStream'){
              this.customer = 'SmartStream';
            }
            
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

      if (!this.$chat.innerHTML) {
        if (this._props.welcomeText)
          this._append('bot', this._props.welcomeText)
      }
      if (this.$chat.innerHTML && Object.keys(this._datasets).length > 0) {
        this._append('bot', 'Datasets received. Ready to answer any analytical questions!')
      }
    }

    getLastSummary () {
      console.log('[PerciBOT] getLastSummary invoked')
      return this.summaryResponse ? String(this.summaryResponse) : ''
    }

    onCustomWidgetRequest (methodName, params) {
      console.log('onCustomWidgetRequest', params)
      if (methodName === 'setDatasets') {
        console.log(params)
        let payload = ''
        if (typeof params === 'string') {
          payload = params
        } else if (Array.isArray(params)) {
          payload = params[0] || ''
        } else if (params && typeof params === 'object') {
          payload = params.payload || ''
        }

        if (payload) this._applyDatasets(payload)
      } else if (methodName === 'generateSummary') {
        console.log(params)

        let payload = ''
        if (typeof params === 'string') {
          payload = params
        } else if (Array.isArray(params)) {
          payload = params[0] || ''
        } else if (params && typeof params === 'object') {
          payload = params.payload || 'Generate a executive summary of the data in 3-4 sentences.'
        }

        this._generateSummary(payload)
        return
      }

      if (methodName === 'getLastSummary') {
        return this.summaryResponse || ''
      }
    }

    async _generateSummary (prompt) {
      const q = (prompt || '').trim()
      if (!q) return
      this._append('user', q)
      this.$input.value = ''

      if (!this._props.apiKey) {
        this._append('bot', '⚠️ API key not set. Open the Builder panel to configure.')
        return
      }

      this._startTyping()
      this.$send.disabled = true

      try {
        const dsContext = this._buildDatasetContext({
          maxRowsPerSet: 500,
          maxCharsTotal: 8000
        })

        const system = [
                    `
You are **PerciBOT**, a conversational AI for analytics.

Your role is to answer user queries about financial performance across Companies, Branches, Products, and Accounts (Revenue, Opex, Interest Expense).
All figures are in INR, aggregated for Jan–Apr 2025.

Use this dataset summary as your ground truth. Provide clear, business-analyst style answers with tables or breakdowns when useful.

Companies:
- IKF Finance Ltd → Revenue: 4,178,132.07, Opex: 3,183,336.85, Interest Expense: 5,010,185.45
- IKF House Finance Ltd → Revenue: 4,178,132.07, Opex: 3,183,336.85, Interest Expense: 5,010,185.45

Branches:
- Amar Chambers → Revenue: 1,441,039.88, Opex: 878,538.58, Interest Expense: 1,343,608.88
- Apra Tower → Revenue: 1,080,626.42, Opex: 898,949.30, Interest Expense: 1,076,335.00
- Borivali → Revenue: 988,853.88, Opex: 936,281.90, Interest Expense: 1,379,355.52
- Broadway Business Centre → Revenue: 1,194,118.34, Opex: 1,155,437.00, Interest Expense: 1,376,638.86
- Dosti Pinacle → Revenue: 945,528.48, Opex: 998,130.38, Interest Expense: 1,888,149.90
- Part II Gurugram → Revenue: 883,096.80, Opex: 809,298.44, Interest Expense: 1,324,802.60
- Pusa Road → Revenue: 1,823,000.34, Opex: 690,038.10, Interest Expense: 1,631,480.14

Products:
- Cars & MUV Loans → Revenue: 1,731,314.20, Opex: 3,940,045.52, Interest Expense: 5,856,240.84
- Commercial Vehicle Loans → Revenue: 2,060,208.94, Opex: -3,216,340.58, Interest Expense: -4,835,485.26
- Construction Equipment Loans → Revenue: 2,764,835.70, Opex: 9,039,834.06, Interest Expense: 13,885,900.40
- Home Loans → Revenue: 947,721.66, Opex: -2,036,823.34, Interest Expense: -2,992,687.48
- MSME Loans → Revenue: 852,183.64, Opex: -1,360,041.96, Interest Expense: -1,893,597.60

Branch × Product:
- Amar Chambers × Cars & MUV Loans → Revenue: 24,150.46, Opex: 645,579.34, Interest Expense: 920,755.74
- Amar Chambers × Commercial Vehicle Loans → Revenue: 468,571.72, Opex: -472,048.02, Interest Expense: -761,812.40
- Amar Chambers × Construction Equipment Loans → Revenue: 637,315.18, Opex: 1,173,960.84, Interest Expense: 1,980,768.68
- Amar Chambers × Home Loans → Revenue: 251,661.72, Opex: -297,792.86, Interest Expense: -525,119.46
- Amar Chambers × MSME Loans → Revenue: 59,340.80, Opex: -171,160.72, Interest Expense: -270,983.68
- Apra Tower × Cars & MUV Loans → Revenue: 79,456.72, Opex: 594,146.06, Interest Expense: 758,427.04
- Apra Tower × Commercial Vehicle Loans → Revenue: 506,309.20, Opex: -554,853.16, Interest Expense: -692,147.38
- Apra Tower × Construction Equipment Loans → Revenue: 197,115.92, Opex: 1,349,913.32, Interest Expense: 1,742,450.08
- Apra Tower × Home Loans → Revenue: 158,539.00, Opex: -300,252.44, Interest Expense: -441,784.08
- Apra Tower × MSME Loans → Revenue: 139,205.58, Opex: -190,004.48, Interest Expense: -290,610.66
- Borivali × Cars & MUV Loans → Revenue: 498,004.64, Opex: 502,471.44, Interest Expense: 822,200.18
- Borivali × Commercial Vehicle Loans → Revenue: 170,514.82, Opex: -391,055.20, Interest Expense: -689,009.04
- Borivali × Construction Equipment Loans → Revenue: 34,511.84, Opex: 1,372,489.84, Interest Expense: 1,850,767.64
- Borivali × Home Loans → Revenue: 104,230.22, Opex: -318,845.86, Interest Expense: -343,216.30
- Borivali × MSME Loans → Revenue: 181,592.36, Opex: -228,778.32, Interest Expense: -261,386.96
- Broadway Business Centre × Cars & MUV Loans → Revenue: 46,930.10, Opex: 638,044.48, Interest Expense: 813,013.58
- Broadway Business Centre × Commercial Vehicle Loans → Revenue: 296,488.44, Opex: -517,156.12, Interest Expense: -673,445.38
- Broadway Business Centre × Construction Equipment Loans → Revenue: 720,956.08, Opex: 1,451,712.70, Interest Expense: 1,933,980.36
- Broadway Business Centre × Home Loans → Revenue: 49,306.12, Opex: -274,182.12, Interest Expense: -399,004.50
- Broadway Business Centre × MSME Loans → Revenue: 80,437.60, Opex: -142,981.94, Interest Expense: -297,905.20
- Dosti Pinacle × Cars & MUV Loans → Revenue: 212,562.38, Opex: 548,269.22, Interest Expense: 900,908.86
- Dosti Pinacle × Commercial Vehicle Loans → Revenue: 199,143.64, Opex: -420,283.32, Interest Expense: -629,481.18
- Dosti Pinacle × Construction Equipment Loans → Revenue: 128,304.20, Opex: 1,370,412.80, Interest Expense: 2,290,529.20
- Dosti Pinacle × Home Loans → Revenue: 200,492.42, Opex: -294,332.92, Interest Expense: -409,800.78
- Dosti Pinacle × MSME Loans → Revenue: 205,025.84, Opex: -205,935.40, Interest Expense: -264,006.20
- Part II Gurugram × Cars & MUV Loans → Revenue: 393,176.60, Opex: 519,246.88, Interest Expense: 861,983.62
- Part II Gurugram × Commercial Vehicle Loans → Revenue: 346,465.50, Opex: -485,738.84, Interest Expense: -730,764.00
- Part II Gurugram × Construction Equipment Loans → Revenue: -112,718.64, Opex: 1,285,467.42, Interest Expense: 1,924,433.42
- Part II Gurugram × Home Loans → Revenue: 105,595.58, Opex: -270,528.28, Interest Expense: -468,056.24
- Part II Gurugram × MSME Loans → Revenue: 150,577.76, Opex: -239,148.74, Interest Expense: -262,794.20
- Pusa Road × Cars & MUV Loans → Revenue: 477,033.30, Opex: 492,288.10, Interest Expense: 778,951.82
- Pusa Road × Commercial Vehicle Loans → Revenue: 72,715.62, Opex: -375,205.92, Interest Expense: -658,825.88
- Pusa Road × Construction Equipment Loans → Revenue: 1,159,351.12, Opex: 1,035,877.14, Interest Expense: 2,162,971.02
- Pusa Road × Home Loans → Revenue: 77,896.60, Opex: -280,888.86, Interest Expense: -405,706.12
- Pusa Road × MSME Loans → Revenue: 36,003.70, Opex: -182,032.36, Interest Expense: -245,910.70

When responding, Keep it concise and executive-friendly.
`
        ].join('\n')

        console.log(system)

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
        this.summaryResponse = ans
        return ans
      } catch (e) {
        this._stopTyping()
        this._append('bot', ` ${e.message}`)
      }
    }

    setProperties (props) {
      this.onCustomWidgetAfterUpdate(props)
    }

    _applyTheme () {
      const wrap    = this._shadowRoot.querySelector('.wrap')
      const header  = this._shadowRoot.querySelector('header')
      const panel   = this._shadowRoot.querySelector('.panel')
      const buttons = this._shadowRoot.querySelectorAll('button.primary')

      wrap.style.background   = this._props.surfaceColor || '#ffffff'
      wrap.style.color        = this._props.textColor || '#0b1221'
      panel.style.background  = this._props.surfaceAlt || '#f6f8ff'
      header.style.background = `linear-gradient(90deg, ${
        this._props.primaryColor || '#1f4fbf'
      }, ${this._props.primaryDark || '#163a8a'})`

      buttons.forEach(btn => {
        btn.style.background = `linear-gradient(90deg, ${
          this._props.primaryColor || '#1f4fbf'
        }, ${this._props.primaryDark || '#163a8a'})`
      })

      try {
        this._shadowRoot.host?.style?.setProperty('--perci-accent',  this._props.primaryColor || '#1f4fbf')
        this._shadowRoot.host?.style?.setProperty('--perci-accent2', this._props.primaryDark  || '#163a8a')
      } catch (e) {}
    }

    _escapeHtml (s = '') {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }

    _mdLists (md) {
      const lines = md.split('\n')
      const out   = []
      let inUl = false, inOl = false, inSubList = false

      const flush = () => {
        if (inSubList) { out.push('</ul></li>'); inSubList = false }
        if (inUl)      { out.push('</ul>');      inUl      = false }
        if (inOl)      { out.push('</ol>');      inOl      = false }
      }

      const isSectionHeader = txt => {
        const t = String(txt || '').trim()
        if (t.length <= 2 || t.length > 80) return false
        const plain = t.replace(/^\*+/, '').replace(/\*+$/, '')
        return /[A-Za-z][A-Za-z\s]+:$/.test(plain)
      }

      for (const line of lines) {
        if (/^\s*[-*]\s+/.test(line)) {
          if (!inUl) { flush(); out.push('<ul>'); inUl = true }
          const itemText = line.replace(/^\s*[-*]\s+/, '')
          if (isSectionHeader(itemText)) {
            if (inSubList) { out.push('</ul></li>'); inSubList = false }
            out.push(`<li class="li-head">${this._mdInline(itemText)}<ul class="li-sub">`)
            inSubList = true
          } else if (inSubList) {
            out.push(`<li class="li-subitem">${this._mdInline(itemText)}</li>`)
          } else {
            out.push(`<li class="li-item">${this._mdInline(itemText)}</li>`)
          }
        } else if (/^\s*\d+\.\s+/.test(line)) {
          const itemText = line.replace(/^\s*\d+\.\s+/, '')
          if (isSectionHeader(itemText)) {
            flush()
            out.push(`<p class="li-head">${this._mdInline(itemText)}</p>`)
          } else {
            if (!inOl) { flush(); out.push('<ol>'); inOl = true }
            out.push(`<li>${this._mdInline(itemText)}</li>`)
          }
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
      const raw = block.trim().split('\n').filter(Boolean)
      if (raw.length < 2) return null

      const norm = raw.map(line =>
        line.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '')
      )

      const sepCells = norm[1].split('|').map(s => s.trim())
      const sepOk = sepCells.length > 0 && sepCells.every(c => /^:?-{3,}:?$/.test(c))
      if (!sepOk) return null

      const toCells = line =>
        line.split('|').map(c => c.trim()).filter(c => c.length > 0).map(c => this._mdInline(c))

      const head     = toCells(norm[0])
      const bodyRows = norm.slice(2).map(toCells)

      const ths = head.map(h => `<th>${h}</th>`).join('')
      const trs = bodyRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')

      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    _mdInline (s) {
      let t = this._escapeHtml(s)
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
      return t
    }

    _renderMarkdown (md = '') {
      const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
      const out   = []

      const isHeading    = line => /^\s*#{1,6}\s+/.test(line)
      const headingLevel = line => Math.min(6, (line.match(/^\s*(#{1,6})\s+/) || [])[1]?.length || 1)
      const headingText  = line => line.replace(/^\s*#{1,6}\s+/, '').trim()

      const isTableSep = line => {
        const t = String(line || '').trim()
        if (!t.includes('|')) return false
        const cells = t.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '')
          .split('|').map(s => s.trim()).filter(s => s.length > 0)
        return cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c))
      }

      const isTableHeader = line => String(line || '').includes('|')

      let i = 0
      while (i < lines.length) {
        const line = lines[i]

        if (!String(line).trim()) { i++; continue }

        if (isHeading(line)) {
          const lvl = headingLevel(line)
          out.push(`<h${lvl}>${this._mdInline(headingText(line))}</h${lvl}>`)
          i++
          continue
        }

        if (isTableHeader(line) && isTableSep(lines[i + 1])) {
          const tlines = [line, lines[i + 1]]
          i += 2
          while (i < lines.length && String(lines[i]).trim()) { tlines.push(lines[i]); i++ }
          const tableHtml = this._mdTable(tlines.join('\n'))
          out.push(tableHtml || this._mdLists(tlines.join('\n')))
          continue
        }

        const chunk = []
        while (i < lines.length) {
          const cur = lines[i]
          if (!String(cur).trim()) break
          if (isHeading(cur)) break
          if (isTableHeader(cur) && isTableSep(lines[i + 1])) break
          chunk.push(cur)
          i++
        }
        if (chunk.length) out.push(this._mdLists(chunk.join('\n')))
      }

      return out.join('\n')
    }

    _updateDatasetsUI () {
      const chip    = this.$modelChip
      const drawer  = this._shadowRoot.getElementById('dsDrawer')
      const entries = Object.entries(this._datasets || {})
      if (!entries.length) {
        chip.textContent    = 'AI Assistant'
        drawer.style.display = 'none'
        return
      }

      const parts = entries.map(([k, v]) => `${k}: ${v.rows?.length || 0} rows`)
      chip.textContent = parts.length > 2
        ? `${parts.slice(0, 2).join(' · ')} · +${parts.length - 2} more`
        : parts.join(' · ')

      const html = entries.map(([name, ds]) => {
        const cols = (ds.schema || []).slice(0, 12).join(', ')
        return `<div class="ds"><div class="name">${name}</div><div>${ds.rows?.length || 0} rows</div><div>${cols}</div></div>`
      }).join('') || '<div class="ds">No datasets</div>'
      drawer.innerHTML = html
    }

    // ── Render a bot response that may contain chart_data ────────────────────────
    _renderBotResponse (data) {
      const answerText = (data.answer && data.answer.trim())
        ? data.answer
        : (data.message || '(No response received)')

      const b = document.createElement('div')
      b.className = 'msg bot'
      b.style.background = '#ffffff'
      b.style.border     = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'

      const textWrap = document.createElement('div')
      textWrap.innerHTML = this._renderMarkdown(String(answerText))
      b.appendChild(textWrap)

      if (data.chart_data && typeof data.chart_data === 'object') {
        const card = document.createElement('div')
        card.className = 'chartCard'

        const canvasWrap = document.createElement('div')
        canvasWrap.className = 'chartCanvas'
        card.appendChild(canvasWrap)

        const footer = document.createElement('div')
        footer.className = 'chartFooter'
        footer.innerHTML = `<span class="cfName">${this._escapeHtml(data.chart_data.title || 'Chart')}</span>`
        card.appendChild(footer)

        b.appendChild(card)
        this.$chat.appendChild(b)
        this.$chat.scrollTop = this.$chat.scrollHeight

        renderChart(canvasWrap, data.chart_data)
          .then(() => { this.$chat.scrollTop = this.$chat.scrollHeight })
          .catch(err => {
            canvasWrap.innerHTML = ''
            const errEl = document.createElement('div')
            errEl.className = 'chartErr'
            errEl.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round">
                <circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10"/>
                <circle cx="10" cy="14" r=".5" fill="currentColor"/>
              </svg>${this._escapeHtml(err.message || 'Chart could not be rendered.')}`
            canvasWrap.appendChild(errEl)
            this.$chat.scrollTop = this.$chat.scrollHeight
          })
        return
      }

      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
    }

    _append (role, text) {
      if (role === 'bot') {
        // Use the richer bot-response renderer (without chart_data)
        this._renderBotResponse({ answer: text })
        return
      }

      const b = document.createElement('div')
      b.className = 'msg user'
      b.style.background = '#97cdf2ff'
      b.style.border     = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'
      b.textContent = text

      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
    }

    _buildDatasetContext (opts = {}) {
      const maxRowsPerSet  = Number(opts.maxRowsPerSet ?? 5)
      const maxCharsTotal  = Number(opts.maxCharsTotal ?? 8000)

      const lines = []
      lines.push('You have access to the following datasets. Use ONLY these when answering analytics questions:')

      const entries = Object.entries(this._datasets || {})
      if (!entries.length) { lines.push('(No datasets provided.)'); return lines.join('\n') }

      for (const [name, ds] of entries) {
        const schema  = (ds?.schema || []).join(', ')
        const total   = ds?.rows?.length || 0
        const preview = (ds?.rows || []).slice(0, maxRowsPerSet)

        lines.push(`\n[DATASET] ${name}`)
        lines.push(`- Columns: ${schema || '(none)'}`)
        lines.push(`- Total Rows: ${total}`)
        if (preview.length) {
          lines.push(`- Preview (first ${preview.length} rows):`)
          for (const row of preview) {
            const compact = Object.keys(row).reduce((acc, k) => {
              let s = row[k] === null || row[k] === undefined ? '' : String(row[k])
              if (s.length > 120) s = s.slice(0, 117) + '...'
              acc[k] = s
              return acc
            }, {})
            lines.push(`  - ${JSON.stringify(compact)}`)
          }
        } else {
          lines.push('- Preview: (no rows)')
        }

        if (lines.join('\n').length > maxCharsTotal) {
          lines.push('\n(Context truncated to stay within token limits.)')
          break
        }
      }

      lines.push(`
        Guidelines:
       - Do the calculations only if the required answer is not directly available in the dataset.
       - Prefer conclusions implied by the dataset preview and schema.
       - Be precise with column names; do not invent fields that aren't in the schema.
       - Always list the filters, thresholds, and assumptions you applied.
      `.trim())

      return lines.join('\n')
    }

    _startTyping () {
      if (this._typingEl) return
      const b = document.createElement('div')
      b.className = 'msg bot typing'
      b.innerHTML = `<span class="muted">PerciBOT</span><span class="dots"><span></span><span></span><span></span></span>`
      b.style.background = '#ffffff'
      b.style.border     = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'

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

    // ═══════════════════════════════════════════════════════════════════════════
    // ── HARDCODED KEYWORD CHARTS ─────────────────────────────────────────────
    //
    //  How to manage this section:
    //  • Each entry in KEYWORD_CHARTS has:
    //      keywords : array of lowercase strings — ALL must appear in the query
    //      chart    : a standard Chart.js config object (type / data / options)
    //  • Matching is case-insensitive and ignores punctuation (? ! . etc.)
    //  • To ADD a new chart  → push a new { keywords, chart } object to the array
    //  • To REMOVE a chart   → delete (or comment out) its object
    //  • To EDIT a chart     → update the `chart` value in its entry
    //
    // ═══════════════════════════════════════════════════════════════════════════
    _getKeywordChart (query) {
      const KEYWORD_CHARTS = [

        // ── Entry 1: Net Profit by Company across months ───────────────────────
        {
          keywords: ['net profit', 'month'],   // both must be present in the query
          chart: {
            type: 'line',
            data: {
              labels: [
                'Jan 2025','Feb 2025','Mar 2025','Apr 2025',
                'May 2025','Jun 2025','Jul 2025','Aug 2025',
                'Sep 2025','Oct 2025','Nov 2025','Dec 2025'
              ],
              datasets: [{
                label: 'Net Profit',
                data: [
                  90.896773, 201.693764, 181.473776, 122.455154,
                  96.485071, 199.514449, 123.091777, 188.650076,
                  106.412377, 183.989706, 273.411137, 275.682466
                ],
                borderColor:  '#3A86FF',
                backgroundColor: '#3A86FF33',
                borderWidth: 2,
                fill: false,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: true, position: 'top' },
                title:  { display: true, text: 'Bridgepoint Lending — Net Profit (Last 12 Months)' },
              },
              scales: {
                x: { title: { display: true, text: 'Month' } },
                y: { title: { display: true, text: 'Net Profit (£)' } }
              }
            }
          }
        },

        // ── ADD MORE ENTRIES BELOW THIS LINE ──────────────────────────────────
        // {
        //   keywords: ['revenue', 'region'],
        //   chart: { type: 'bar', data: { ... }, options: { ... } }
        // },

      ] // ── END OF KEYWORD_CHARTS ─────────────────────────────────────────────

      // Normalise query: lowercase and strip punctuation
      const norm = query.toLowerCase().replace(/[?!.,;:'"]/g, ' ')

      for (const entry of KEYWORD_CHARTS) {
        const matched = entry.keywords.every(kw => norm.includes(kw))
        if (matched) return entry.chart
      }
      return null
    }
    // ═══════════════════════════════════════════════════════════════════════════

    // ── BACKDOOR PARSER ────────────────────────────────────────────────────────
    //
    //  Accepts inputs in these formats:
    //
    //  Format A — question before the sentinel (clean display on screen):
    //    Give me the trend for revenue
    //    [many blank lines / tabs]
    //    AAAYYYZZZ{"type":"bar","data":{...},"options":{...}}AAAYYYZZZ
    //
    //  Format B — sentinel only (no visible question):
    //    AAAYYYZZZ{"type":"bar","data":{...},"options":{...}}AAAYYYZZZ
    //
    //  Returns: { visibleQuestion: string|null, chartConfig: object } | null
    //
    _parseBackdoor (raw) {
      const SENTINEL = 'AAAYYYZZZ'
      const s = String(raw || '')

      const startIdx = s.indexOf(SENTINEL)
      if (startIdx === -1) return null                       // no backdoor found

      const afterStart = s.indexOf(SENTINEL, startIdx + SENTINEL.length)
      if (afterStart === -1) return null                     // no closing sentinel

      // Everything between the two sentinels is the chart JSON
      const jsonStr = s.slice(startIdx + SENTINEL.length, afterStart).trim()

      let chartConfig
      try {
        chartConfig = JSON.parse(jsonStr)
      } catch (_) {
        return null                                          // malformed JSON
      }

      // Everything BEFORE the opening sentinel is the visible question
      const before = s.slice(0, startIdx).trim()
      const visibleQuestion = before.length > 0 ? before : null

      return { visibleQuestion, chartConfig }
    }
    // ══════════════════════════════════════════════════════════════════════════

    async _send () {
      const raw = this.$input.value || ''
      if (!raw.trim()) return

      this.$input.value = ''

      // ── 1. Check for backdoor sentinel ──────────────────────────────────────
      const backdoor = this._parseBackdoor(raw)
      if (backdoor) {
        // Show only the visible question on screen (not the JSON blob)
        const displayText = backdoor.visibleQuestion || 'Show chart'
        this._append('user', displayText)

        this._startTyping()
        await new Promise(r => setTimeout(r, 600))   // small fake "thinking" delay
        this._stopTyping()

        this._renderChartJsConfig(backdoor.chartConfig)
        return
      }

      const q = raw.trim()

      // ── 2. Check for keyword-triggered hardcoded charts ─────────────────────
      const keywordChart = this._getKeywordChart(q)
      if (keywordChart) {
        this._append('user', q)
        this._startTyping()
        await new Promise(r => setTimeout(r, 600))
        this._stopTyping()
        this._renderChartJsConfig(keywordChart)
        return
      }

      // ── 3. Normal LLM flow ──────────────────────────────────────────────────
      this._append('user', q)

      if (!this._props.apiKey) {
        this._append('bot', '⚠️ API key not set. Open the Builder panel to configure.')
        return
      }

      this._startTyping()
      this.$send.disabled = true

      try {
        const dsContext = this._buildDatasetContext({ maxRowsPerSet: 500, maxCharsTotal: 8000 })

        this.system = ''
        if (this._props.systemPrompt === 'SmartStream') {
          this.system = [`You are PerciBOT, a financial Q&A assistant for SmartStream’s FY2026 Budget data (values in ₹).
Use this table directly to answer financial questions.

Rules:
- Use data as-is; do not recalculate unless explicitly asked (ratios, % changes, what-ifs)
- If data is missing, respond “Not in dataset”
- Keep answers concise and numeric, with bold labels and ₹ values (2 decimals)

Dataset – SmartStream Group FY2026 Budget (₹)

| Company | C003 SmartStream Tech Group Ltd | C004 SmartStream RDU India Pvt. Ltd | C002 SmartStream Tech Holding Ltd | C001 SmartStream Tech Ltd | Totals |
|----------|--------------------------------:|------------------------------------:|----------------------------------:|---------------------------:|--------:|
| PS Revenue | 2,461,640.00 | 1,238,160.00 | 3,924,050.00 | 1,702,140.00 | 9,325,990.00 |
| License Revenue | 146,261.35 | 220,702.25 | 295,966.50 | 220,173.63 | 883,103.73 |
| Transfer Price revenue | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Revenue | 2,607,901.35 | 1,458,862.25 | 4,220,016.50 | 1,922,313.63 | 10,209,093.73 |
| Employee Cost | -1,436,230.00 | -470,731.00 | -1,192,286.00 | -1,455,975.00 | -4,555,222.00 |
| License & Infra Cost | -57,398.48 | -92,259.61 | -149,816.96 | -88,542.00 | -388,017.05 |
| TP Cross charge | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Direct Costs | -1,493,628.48 | -562,990.61 | -1,342,102.96 | -1,544,517.00 | -4,943,239.05 |
| Gross Margin | 1,114,272.87 | 895,871.64 | 2,877,913.54 | 377,796.63 | 5,265,854.68 |
| Indirect Employee Cost | -13,386.68 | -13,386.68 | -4,593.91 | -9,704.58 | -41,071.85 |
| Marketing & Sales | -9,727.33 | -9,727.33 | -3,710.18 | -8,086.91 | -31,251.75 |
| Office Supplies | -534.64 | -534.64 | -175.98 | -322.74 | -1,568.00 |
| Utilities | -7,920.00 | -7,920.00 | -36,155.90 | -7,200.00 | -59,195.90 |
| Rent | -7,746.00 | 0.00 | 0.00 | 0.00 | -7,746.00 |
| Administrative Exp | -17,402.94 | -17,402.94 | -5,300.70 | -7,278.22 | -47,384.80 |
| Electricity | -19,634.00 | -19,634.00 | -7,067.99 | -16,175.03 | -62,511.02 |
| Legal Fees | -2,520.00 | -2,520.00 | -2,160.00 | -1,800.00 | -9,000.00 |
| Accounting Fees | -5,800.51 | -5,800.51 | -1,943.06 | -4,043.14 | -17,587.22 |
| R&D Costs | -5,800.50 | -5,800.50 | -1,943.10 | -4,043.21 | -17,587.31 |
| Indirect Costs | -92,543.23 | -92,543.23 | -66,690.30 | -66,740.88 | -318,517.64 |
| EBITDA | 1,021,729.64 | 803,328.41 | 2,811,223.24 | 311,055.75 | 4,947,337.04 |
| Dep & Amort Exp | -44,624.26 | -44,624.26 | -17,670.97 | -40,437.96 | -147,357.45 |
| EBIT | 977,105.38 | 758,704.15 | 2,793,552.27 | 270,617.79 | 4,799,979.59 |
| Interest | -91,034.49 | -98,174.45 | -33,575.98 | -72,789.30 | -295,574.22 |
| EBT | 886,070.89 | 660,529.70 | 2,759,976.29 | 197,828.49 | 4,504,405.37 |
| Taxes | -285,598.40 | -312,373.25 | -106,029.30 | -202,192.50 | -906,193.45 |
| Net Profit | 600,472.49 | 348,156.45 | 2,653,946.99 | -4,364.01 | 3,598,211.92 |


FINANCIAL HIERARCHY:

1. Revenue Components
   -  Revenue:PS Revenue, License Revenue, Transfer Price Revenue

2. Direct Costs Components
   -  Direct Costs: License & Infra Cost, TP Cross Charge

3. Indirect Costs Components
   -  Indirect Costs: Indirect Employee Cost, Marketing & Sales, Office Supplies, Utilities, Rent, Administrative Exp, Electricity, Legal Fees, Accounting Fees, R&D Costs

Example Prompts:
- Summarize SmartStream’s FY2026 budget performance.
- Which entity has the highest operating loss?
- Compare total employee costs.
- What percentage of total revenue comes from C004?
- If revenue increases by 10%, estimate new total PBT.
- Show all indirect costs by entity.
- Give me breakdown of indirect costs
- Which component contribute the highest to the indirect costs
- Give me breakdown of indirect costs for C003.
`].join('\n')
        } else if (this._props.systemPrompt === 'Demo') {
          this.system = [`You are PerciBOT – an AI-powered Lending Analytics and CFO Advisory Copilot.

CURRENCY (STRICT):
- Treat all monetary amounts as **GBP**.
- In outputs, format money as '£' (preferred) or 'GBP' (acceptable).
- NEVER use '$' or 'USD' unless the user explicitly asks to convert currencies (and only then, show GBP first and the converted value second).

--------------------------------------------------

DATASET INPUT:

The dataset is provided below:

<<DATASET>>

data[364]{Company,Region,Sector,Product,Measures,"Jan 2024","Feb 2024","Mar 2024","Apr 2024","May 2024","Jun 2024","Jul 2024","Aug 2024","Sep 2024","Oct 2024","Nov 2024","Dec 2024","Jan 2025","Feb 2025","Mar 2025","Apr 2025","May 2025","Jun 2025","Jul 2025","Aug 2025","Sep 2025","Oct 2025","Nov 2025","Dec 2025"}:
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Loan_Amount_Disbursed,"2655.6","2689.8","2469.2","3359.6","2944.5","3240.2","3170","3286","2763.2","3258.5","3074.3","2968.5","2846.1","3240.2","3615.2","3598.7","3341.9","3044.1","3172.1","3190.7","2973.1","3226.7","3593","3707.7"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Annual_Lending_Rate_Pct,"0.0642","0.0841","0.0502","0.0576","0.0811","0.0829","0.0668","0.095","0.0893","0.0805","0.0568","0.0727","0.0912","0.0952","0.0705","0.0746","0.0848","0.0578","0.0937","0.0679","0.1021","0.088","0.0795","0.0644"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Annual_Borrowing_Rate_Pct,"0.0474","0.0302","0.0294","0.0538","0.0498","0.0334","0.0417","0.0307","0.0358","0.0473","0.0481","0.0326","0.0478","0.0359","0.0282","0.0532","0.0477","0.0438","0.0471","0.0389","0.0528","0.0286","0.0424","0.0488"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Staff Costs,"3.024","2.968","2.748","2.656","2.888","3.1","2.96","2.682","2.606","2.732","3.194","2.998","3.384","3.38","2.856","2.948","3.216","3.246","3.282","3.274","3.302","2.698","2.666","3.306"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Technology Platform Costs,"3.68","3.64","3.97","3.66","4.04","3.45","4.17","4.29","4.25","3.53","4.15","3.63","4.35","4","4.14","3.54","3.61","4.09","4.04","3.65","4.25","4.19","4.24","3.98"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Credit Risk Ops Cost,"0.207","0.195","0.202","0.195","0.211","0.209","0.214","0.189","0.185","0.202","0.19","0.184","0.22","0.211","0.225","0.213","0.228","0.207","0.215","0.216","0.199","0.233","0.192","0.188"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Regulatory Compliance Costs,"1.56","1.34","1.49","1.44","1.69","1.44","1.71","1.48","1.46","1.58","1.49","1.38","1.44","1.46","1.45","1.6","1.53","1.65","1.48","1.49","1.63","1.72","1.71","1.42"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Premises Overheads Cost,"0.165","0.174","0.191","0.159","0.185","0.172","0.199","0.189","0.178","0.183","0.182","0.166","0.188","0.188","0.173","0.205","0.204","0.21","0.182","0.193","0.17","0.202","0.187","0.187"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Interest Cost,"10.48962","6.76933","6.04954","15.06220667","12.219675","9.018556667","11.01575","8.406683333","8.243546667","12.84392083","12.32281917","8.064425","11.336965","9.693598333","8.49572","15.95423667","13.2840525","11.110965","12.4504925","10.34318583","13.08164","7.690301667","12.69526667","15.07798"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Interest Income,"14.20746","18.851015","10.32948667","16.12608","19.8999125","22.38438167","17.64633333","26.01416667","20.56281333","21.85910417","14.55168667","17.9841625","21.63036","25.70558667","21.2393","22.37191833","23.61609333","14.662415","24.76881417","18.05404417","25.29612583","23.66246667","23.803625","19.89799"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Operating Profit,"3.71784","12.081685","4.279946667","1.063873333","7.6802375","13.365825","6.630583333","17.60748333","12.31926667","9.015183333","2.2288675","9.9197375","10.293395","16.01198833","12.74358","6.417681667","10.33204083","3.55145","12.31832167","7.710858333","12.21448583","15.972165","11.10835833","4.82001"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Spread Percentage,"1.68","5.39","2.08","0.38","3.13","4.95","2.51","6.43","5.35","3.32","0.87","4.01","4.34","5.93","4.23","2.14","3.71","1.4","4.66","2.9","4.93","5.94","3.71","1.56"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Fixed Costs,"8.636","8.317","8.601","8.11","9.014","8.371","9.253","8.83","8.679","8.227","9.206","8.358","9.582","9.239","8.844","8.506","8.788","9.403","9.199","8.823","9.551","9.043","8.995","9.081"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Consumer Loan,Net Profit,"-4.91816","3.764685","-4.321053333","-7.046126667","-1.3337625","4.994825","-2.622416667","8.777483333","3.640266667","0.788183333","-6.9771325","1.5617375","0.711395","6.772988333","3.89958","-2.088318333","1.544040833","-5.85155","3.119321667","-1.112141667","2.663485833","6.929165","2.113358333","-4.26099"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Loan_Amount_Disbursed,"2248.4","2074.6","1953.5","2207.8","2136.1","2160.4","2294.5","2563.2","2386.1","2376.1","2101.2","2153.6","2687.6","2177","2682.1","2849.1","2545","2538.6","2688.8","2172.7","2170","2433.7","2719","2732.6"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Annual_Lending_Rate_Pct,"0.0499","0.1111","0.0527","0.0475","0.0582","0.1066","0.0741","0.1138","0.0671","0.0481","0.0525","0.0833","0.0552","0.0666","0.0582","0.0706","0.0631","0.063","0.0733","0.107","0.0612","0.0895","0.1002","0.072"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Annual_Borrowing_Rate_Pct,"0.0311","0.0404","0.046","0.0386","0.0308","0.0403","0.0406","0.0515","0.0447","0.0511","0.0387","0.0491","0.0331","0.0408","0.0536","0.028","0.0382","0.0402","0.0284","0.0379","0.0534","0.0527","0.037","0.0333"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Staff Costs,"3.026","2.944","2.798","2.616","2.956","3.15","2.9","2.712","2.618","2.794","3.148","3.074","3.368","3.386","2.886","3.01","3.286","3.344","3.288","3.182","3.262","2.782","2.714","3.248"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Technology Platform Costs,"3.66","3.64","4.05","3.61","4.05","3.5","4.11","4.24","4.14","3.54","4.2","3.58","4.26","4","4.1","3.62","3.54","4.1","4.03","3.66","4.3","4.18","4.27","4.01"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Credit Risk Ops Cost,"0.211","0.192","0.207","0.199","0.214","0.207","0.215","0.191","0.184","0.202","0.185","0.183","0.22","0.206","0.226","0.214","0.228","0.206","0.212","0.215","0.2","0.234","0.188","0.188"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Regulatory Compliance Costs,"1.57","1.35","1.5","1.39","1.68","1.39","1.71","1.5","1.49","1.57","1.5","1.37","1.43","1.43","1.45","1.61","1.52","1.67","1.49","1.52","1.64","1.69","1.68","1.41"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Premises Overheads Cost,"0.17","0.175","0.19","0.159","0.185","0.178","0.195","0.188","0.18","0.185","0.182","0.165","0.188","0.189","0.171","0.2","0.205","0.207","0.187","0.19","0.17","0.207","0.184","0.193"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Interest Cost,"5.827103333","6.984486667","7.488416667","7.101756667","5.482656667","7.255343333","7.763058333","11.0004","8.8882225","10.11822583","6.77637","8.811813333","7.413296667","7.4018","11.98004667","6.6479","8.101583333","8.50431","6.363493333","6.862110833","9.6565","10.68799917","8.383583333","7.582965"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Interest Income,"9.349596667","19.20733833","8.579120833","8.739208333","10.360085","19.19155333","14.1685375","24.30768","13.34227583","9.524200833","9.19275","14.94957333","12.36296","12.08235","13.008185","16.762205","13.38245833","13.32765","16.42408667","19.37324167","11.067","18.15134583","22.70365","16.3956"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Operating Profit,"3.522493333","12.22285167","1.090704167","1.637451667","4.877428333","11.93621","6.405479167","13.30728","4.454053333","-0.594025","2.41638","6.13776","4.949663333","4.68055","1.028138333","10.114305","5.280875","4.82334","10.06059333","12.51113083","1.4105","7.463346667","14.32006667","8.812635"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Spread Percentage,"1.88","7.07","0.67","0.89","2.74","6.63","3.35","6.23","2.24","-0.3","1.38","3.42","2.21","2.58","0.46","4.26","2.49","2.28","4.49","6.91","0.78","3.68","6.32","3.87"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Fixed Costs,"8.637","8.301","8.745","7.974","9.085","8.425","9.13","8.831","8.612","8.291","9.215","8.372","9.466","9.211","8.833","8.654","8.779","9.527","9.207","8.767","9.572","9.093","9.036","9.049"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Green Energy Loan,Net Profit,"-5.114506667","3.921851667","-7.654295833","-6.336548333","-4.207571667","3.51121","-2.724520833","4.47628","-4.157946667","-8.885025","-6.79862","-2.23424","-4.516336667","-4.53045","-7.804861667","1.460305","-3.498125","-4.70366","0.853593333","3.744130833","-8.1615","-1.629653333","5.284066667","-0.236365"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Loan_Amount_Disbursed,"8537.8","10231.2","10851.7","8502.9","10669.1","8446","11140.2","10932","10540.8","11289.1","10896.6","10803.7","10409.3","9363.1","10000.6","12269.6","11302.3","12071.7","10196.8","9370.2","10567.6","12111.3","10122.2","12809.9"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Annual_Lending_Rate_Pct,"0.1047","0.0734","0.1043","0.0836","0.074","0.1061","0.0864","0.0767","0.0877","0.1096","0.102","0.1045","0.0611","0.1132","0.0913","0.0629","0.108","0.0865","0.0734","0.0612","0.0749","0.0546","0.0485","0.0485"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Annual_Borrowing_Rate_Pct,"0.034","0.0445","0.0373","0.0485","0.0423","0.0394","0.0539","0.046","0.0523","0.0507","0.032","0.0418","0.0429","0.0309","0.0405","0.0424","0.0471","0.0443","0.0336","0.0287","0.0347","0.0409","0.0437","0.044"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Staff Costs,"2.958","2.964","2.812","2.626","2.98","3.13","2.928","2.716","2.65","2.752","3.186","3.046","3.432","3.316","2.818","2.942","3.284","3.26","3.32","3.268","3.294","2.746","2.68","3.246"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Technology Platform Costs,"3.66","3.73","4.1","3.68","4.02","3.41","4.08","4.25","4.19","3.53","4.21","3.6","4.23","4.07","4.11","3.59","3.69","4.09","4.09","3.69","4.31","4.21","4.19","4.1"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Credit Risk Ops Cost,"0.207","0.198","0.203","0.197","0.216","0.206","0.213","0.192","0.183","0.203","0.186","0.183","0.224","0.208","0.23","0.214","0.235","0.2","0.211","0.21","0.194","0.229","0.19","0.192"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Regulatory Compliance Costs,"1.57","1.32","1.49","1.44","1.65","1.39","1.68","1.52","1.5","1.54","1.52","1.39","1.41","1.43","1.49","1.61","1.53","1.66","1.46","1.53","1.63","1.68","1.68","1.41"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Premises Overheads Cost,"0.168","0.175","0.193","0.16","0.188","0.173","0.193","0.191","0.177","0.184","0.18","0.167","0.193","0.184","0.173","0.203","0.209","0.209","0.184","0.192","0.167","0.204","0.182","0.189"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Interest Cost,"24.19043333","37.9407","33.73070083","34.3658875","37.6085775","27.73103333","50.038065","41.906","45.94032","47.6964475","29.0576","37.63288833","37.2132475","24.1099825","33.752025","43.35258667","44.3615275","44.5646925","28.55104","22.410395","30.55797667","41.2793475","36.86167833","46.96963333"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Interest Income,"74.492305","62.58084","94.31935917","59.23687","65.79278333","74.67671667","80.20944","69.8737","77.03568","103.1071133","92.6211","94.08222083","53.00068583","88.32524333","76.08789833","64.31315333","101.7207","87.0168375","62.37042667","47.78802","65.95943667","55.106415","40.91055833","51.77334583"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Operating Profit,"50.30187167","24.64014","60.58865833","24.8709825","28.18420583","46.94568333","30.171375","27.9677","31.09536","55.41066583","63.5635","56.4493325","15.78743833","64.21526083","42.33587333","20.96056667","57.3591725","42.452145","33.81938667","25.377625","35.40146","13.8270675","4.04888","4.8037125"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Spread Percentage,"7.07","2.89","6.7","3.51","3.17","6.67","3.25","3.07","3.54","5.89","7","6.27","1.82","8.23","5.08","2.05","6.09","4.22","3.98","3.25","4.02","1.37","0.48","0.45"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Fixed Costs,"8.563","8.387","8.798","8.103","9.054","8.309","9.094","8.869","8.7","8.209","9.282","8.386","9.489","9.208","8.821","8.559","8.948","9.419","9.265","8.89","9.595","9.069","8.922","9.137"
Apex Growth Finance,Midlands,Peer-to-Peer,P2P Property Bridging,Net Profit,"41.73887167","16.25314","51.79065833","16.7679825","19.13020583","38.63668333","21.077375","19.0987","22.39536","47.20166583","54.2815","48.0633325","6.298438333","55.00726083","33.51487333","12.40156667","48.4111725","33.033145","24.55438667","16.487625","25.80646","4.7580675","-4.87312","-4.3332875"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Loan_Amount_Disbursed,"8168.5","8197.1","7521.9","6703.3","7269.4","8224.9","7681.9","6584.3","8121.8","6679.4","8503.4","7342.3","8594.1","7478.2","8719.2","8766","7278.4","7055.3","9229.2","7806.3","8896","7710.4","8830.2","8864.6"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Annual_Lending_Rate_Pct,"0.1122","0.084","0.105","0.0841","0.1084","0.1118","0.0835","0.0841","0.0705","0.0563","0.0635","0.0898","0.0767","0.0711","0.0525","0.0796","0.0589","0.0576","0.0987","0.1064","0.1048","0.0953","0.0683","0.0707"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Annual_Borrowing_Rate_Pct,"0.0458","0.0416","0.0315","0.0522","0.0361","0.0312","0.0419","0.038","0.0346","0.0366","0.0318","0.0318","0.0379","0.0468","0.0362","0.0522","0.053","0.0507","0.0301","0.0383","0.0369","0.0295","0.0335","0.0295"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Staff Costs,"2.718","3.15","2.622","2.694","2.936","2.97","3.274","2.916","2.656","3.05","3.234","2.638","3.178","2.926","2.938","3.258","3.218","2.89","2.832","3.142","3.286","3.116","3.098","2.92"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Technology Platform Costs,"3.59","3.45","3.98","3.97","3.36","3.64","3.57","3.49","3.67","3.86","3.52","3.47","4.16","4.18","4.28","3.56","3.63","3.95","4.32","3.74","4.04","3.58","3.91","4.13"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Credit Risk Ops Cost,"0.179","0.188","0.183","0.212","0.213","0.178","0.208","0.179","0.194","0.217","0.195","0.201","0.204","0.233","0.207","0.214","0.238","0.223","0.206","0.191","0.227","0.197","0.215","0.212"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Regulatory Compliance Costs,"1.5","1.6","1.37","1.47","1.56","1.46","1.54","1.44","1.38","1.62","1.62","1.4","1.44","1.72","1.57","1.72","1.4","1.67","1.45","1.57","1.65","1.65","1.61","1.67"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Premises Overheads Cost,"0.195","0.189","0.163","0.18","0.197","0.197","0.192","0.204","0.202","0.177","0.169","0.177","0.204","0.211","0.174","0.191","0.195","0.164","0.208","0.181","0.199","0.199","0.201","0.182"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Interest Cost,"31.17644167","28.41661333","19.7449875","29.159355","21.86877833","21.38474","26.82263417","20.85028333","23.41785667","20.37217","22.53401","19.457095","27.1430325","29.16498","26.30292","38.1321","32.14626667","29.8086425","23.14991","24.9151075","27.3552","18.95473333","24.650975","21.79214167"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Interest Income,"76.375475","57.3797","65.816625","46.97896083","65.66691333","76.62865167","53.45322083","46.14496917","47.715575","31.33751833","44.99715833","54.94487833","54.9306225","44.308335","38.1465","58.1478","35.72481333","33.86544","75.91017","69.21586","77.69173333","61.23342667","50.258555","52.22726833"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Operating Profit,"45.19903333","28.96308667","46.0716375","17.81960583","43.798135","55.24391167","26.63058667","25.29468583","24.29771833","10.96534833","22.46314833","35.48778333","27.78759","15.143355","11.84358","20.0157","3.578546667","4.0567975","52.76026","44.3007525","50.33653333","42.27869333","25.60758","30.43512667"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Spread Percentage,"6.64","4.24","7.35","3.19","7.23","8.06","4.16","4.61","3.59","1.97","3.17","5.8","3.88","2.43","1.63","2.74","0.59","0.69","6.86","6.81","6.79","6.58","3.48","4.12"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Fixed Costs,"8.182","8.577","8.318","8.526","8.266","8.445","8.784","8.229","8.102","8.924","8.738","7.886","9.186","9.27","9.169","8.943","8.681","8.897","9.016","8.824","9.402","8.742","9.034","9.114"
Apex Growth Finance,South West,Peer-to-Peer,P2P Buy-to-Let,Net Profit,"37.01703333","20.38608667","37.7536375","9.293605833","35.532135","46.79891167","17.84658667","17.06568583","16.19571833","2.041348333","13.72514833","27.60178333","18.60159","5.873355","2.67458","11.0727","-5.102453333","-4.8402025","43.74426","35.4767525","40.93453333","33.53669333","16.57358","21.32112667"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Loan_Amount_Disbursed,"2557.7","2320.9","2164.4","2290.5","2198.7","2634.4","2040.7","2055","2321.8","2632.8","2570.2","2615.3","2397.7","2764.4","2378.5","2629.5","2557.6","2227.3","2727","2363.1","2873","2782.4","2386.2","2238.4"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Annual_Lending_Rate_Pct,"0.0499","0.1056","0.0986","0.0923","0.1121","0.0895","0.1116","0.0583","0.08","0.1123","0.0459","0.0932","0.0843","0.1078","0.088","0.0513","0.0885","0.0673","0.07","0.1099","0.1089","0.0645","0.0653","0.0657"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Annual_Borrowing_Rate_Pct,"0.0298","0.0358","0.0469","0.042","0.0405","0.0319","0.0456","0.0477","0.0442","0.0448","0.0444","0.0333","0.052","0.0473","0.0463","0.0475","0.0435","0.052","0.044","0.0547","0.0491","0.0397","0.0335","0.0421"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Staff Costs,"2.694","3.25","2.61","2.628","2.982","3","3.182","2.936","2.702","3.012","3.208","2.672","3.18","3.024","2.934","3.278","3.158","2.866","2.808","3.176","3.282","3.098","3.2","2.948"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Technology Platform Costs,"3.56","3.42","3.91","4.07","3.42","3.64","3.65","3.46","3.55","3.73","3.43","3.55","4.09","4.1","4.28","3.62","3.6","3.85","4.4","3.72","3.99","3.59","3.89","4.2"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Credit Risk Ops Cost,"0.179","0.185","0.184","0.215","0.214","0.176","0.204","0.175","0.194","0.219","0.202","0.203","0.201","0.232","0.213","0.214","0.238","0.226","0.203","0.192","0.227","0.195","0.222","0.215"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Regulatory Compliance Costs,"1.54","1.58","1.35","1.42","1.57","1.45","1.56","1.45","1.4","1.59","1.62","1.44","1.45","1.75","1.54","1.7","1.39","1.63","1.48","1.57","1.65","1.61","1.64","1.69"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Premises Overheads Cost,"0.191","0.189","0.162","0.186","0.196","0.201","0.191","0.205","0.2","0.178","0.165","0.177","0.201","0.212","0.174","0.189","0.191","0.169","0.211","0.184","0.2","0.204","0.194","0.18"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Interest Cost,"6.351621667","6.924018333","8.459196667","8.01675","7.4206125","7.003113333","7.75466","8.168625","8.551963333","9.82912","9.50974","7.2574575","10.39003333","10.89634333","9.177045833","10.4084375","9.2713","9.651633333","9.999","10.7717975","11.75535833","9.205106667","6.661475","7.853053333"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Interest Income,"10.63576917","20.42392","17.78415333","17.6177625","20.5395225","19.64823333","18.97851","9.983875","15.47866667","24.63862","9.831015","20.31216333","16.8438425","24.83352667","17.44233333","11.2411125","18.8623","12.49144083","15.9075","21.6420575","26.072475","14.9554","12.984905","12.25524"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Operating Profit,"4.2841475","13.49990167","9.324956667","9.6010125","13.11891","12.64512","11.22385","1.81525","6.926703333","14.8095","0.321275","13.05470583","6.453809167","13.93718333","8.2652875","0.832675","9.591","2.8398075","5.9085","10.87026","14.31711667","5.750293333","6.32343","4.402186667"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Spread Percentage,"2.01","6.98","5.17","5.03","7.16","5.76","6.6","1.06","3.58","6.75","0.15","5.99","3.23","6.05","4.17","0.38","4.5","1.53","2.6","5.52","5.98","2.48","3.18","2.36"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Fixed Costs,"8.164","8.624","8.216","8.519","8.382","8.467","8.787","8.226","8.046","8.729","8.625","8.042","9.122","9.318","9.141","9.001","8.577","8.741","9.102","8.842","9.349","8.697","9.146","9.233"
Apex Growth Finance,South West,Peer-to-Peer,P2P Green Energy Loan,Net Profit,"-3.8798525","4.875901667","1.108956667","1.0820125","4.73691","4.17812","2.43685","-6.41075","-1.119296667","6.0805","-8.303725","5.012705833","-2.668190833","4.619183333","-0.8757125","-8.168325","1.014","-5.9011925","-3.1935","2.02826","4.968116667","-2.946706667","-2.82257","-4.830813333"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Loan_Amount_Disbursed,"8770.9","9645.9","10348.3","8799.4","8825.5","8773.5","9824.7","8546.1","11168.3","9022.5","10751.5","10463.4","11118.2","11357.9","9612.2","10686.6","11866.6","11257.5","12231.8","12000.5","12377.3","12223.8","10868.7","10828.7"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Annual_Lending_Rate_Pct,"0.0857","0.109","0.1125","0.1015","0.1139","0.076","0.0641","0.1039","0.063","0.0591","0.0559","0.0585","0.0726","0.0688","0.0642","0.0918","0.0548","0.1017","0.056","0.0907","0.0706","0.1016","0.1065","0.0723"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Annual_Borrowing_Rate_Pct,"0.0297","0.0514","0.0436","0.0286","0.0467","0.0361","0.0355","0.0523","0.0442","0.029","0.053","0.0448","0.0435","0.0523","0.0537","0.0339","0.0468","0.04","0.0354","0.029","0.0477","0.0506","0.049","0.031"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Staff Costs,"2.634","3.142","2.604","2.658","3.014","2.97","3.266","2.862","2.71","3.082","3.306","2.652","3.282","2.924","2.906","3.256","3.236","2.884","2.808","3.174","3.262","3.038","3.204","2.94"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Technology Platform Costs,"3.56","3.55","4.03","3.96","3.38","3.71","3.68","3.43","3.67","3.74","3.43","3.57","4.2","4.17","4.3","3.66","3.63","3.85","4.32","3.79","3.99","3.57","3.91","4.18"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Credit Risk Ops Cost,"0.177","0.187","0.181","0.211","0.21","0.176","0.201","0.179","0.189","0.216","0.201","0.202","0.203","0.23","0.212","0.211","0.236","0.223","0.206","0.194","0.232","0.2","0.222","0.214"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Regulatory Compliance Costs,"1.49","1.56","1.34","1.42","1.57","1.42","1.54","1.49","1.37","1.58","1.58","1.45","1.45","1.72","1.54","1.72","1.42","1.64","1.47","1.57","1.62","1.62","1.6","1.66"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Premises Overheads Cost,"0.192","0.194","0.166","0.184","0.196","0.198","0.191","0.205","0.196","0.177","0.168","0.176","0.2","0.207","0.173","0.192","0.196","0.17","0.209","0.182","0.206","0.207","0.195","0.181"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Interest Cost,"21.7079775","41.316605","37.59882333","20.97190333","34.34590417","26.3936125","29.0647375","37.2467525","41.13657167","21.804375","47.48579167","39.06336","40.303475","49.50151417","43.014595","30.189645","46.27974","37.525","36.08381","29.00120833","49.1997675","51.54369","44.380525","27.97414167"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Interest Income,"62.63884417","87.616925","97.0153125","74.42825833","83.76870417","55.5655","52.4802725","73.9949825","58.633575","44.4358125","50.08407083","51.009075","67.26511","65.11862667","51.42527","81.75249","54.19080667","95.4073125","57.08173333","90.70377917","72.81978167","103.49484","96.4597125","65.2429175"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Operating Profit,"40.93086667","46.30032","59.41648917","53.456355","49.4228","29.1718875","23.415535","36.74823","17.49700333","22.6314375","2.598279167","11.945715","26.961635","15.6171125","8.410675","51.562845","7.911066667","57.8823125","20.99792333","61.70257083","23.62001417","51.95115","52.0791875","37.26877583"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Spread Percentage,"5.6","5.76","6.89","7.29","6.72","3.99","2.86","5.16","1.88","3.01","0.29","1.37","2.91","1.65","1.05","5.79","0.8","6.17","2.06","6.17","2.29","5.1","5.75","4.13"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Fixed Costs,"8.053","8.633","8.321","8.433","8.37","8.474","8.878","8.166","8.135","8.795","8.685","8.05","9.335","9.251","9.131","9.039","8.718","8.767","9.013","8.91","9.31","8.635","9.131","9.175"
Apex Growth Finance,South West,Peer-to-Peer,P2P Property Bridging,Net Profit,"32.87786667","37.66732","51.09548917","45.023355","41.0528","20.6978875","14.537535","28.58223","9.362003333","13.8364375","-6.086720833","3.895715","17.626635","6.3661125","-0.720325","42.523845","-0.806933333","49.1153125","11.98492333","52.79257083","14.31001417","43.31615","42.9481875","28.09377583"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Loan_Amount_Disbursed,"5502.2","4855.5","5634.9","4960.3","5217.5","4459.9","4991.5","5766.9","5034.6","6035.9","5380.3","5931.5","5748.7","4590.3","6448.4","6056.1","6048.1","5312.5","5892.8","6268.5","6422.7","5818.8","6108.5","5976.9"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Annual_Lending_Rate_Pct,"0.0657","0.1046","0.0897","0.1477","0.1503","0.1778","0.0697","0.181","0.1211","0.12","0.1113","0.1852","0.1026","0.1749","0.0917","0.1267","0.1421","0.0565","0.0812","0.0984","0.0616","0.1063","0.1334","0.0887"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Annual_Borrowing_Rate_Pct,"0.0471","0.0444","0.0403","0.0544","0.0385","0.0549","0.06","0.0449","0.0507","0.0537","0.0571","0.048","0.041","0.0596","0.0431","0.0572","0.0469","0.0582","0.0472","0.0494","0.047","0.042","0.0394","0.0597"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Staff Costs,"3.874","4.002","4.674","3.916","4.382","3.78","4.308","3.832","4.04","3.912","4.03","4.136","4.882","4.482","3.912","4.58","4.826","3.964","4.126","4.264","4.302","4.65","4.232","4.812"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Technology Platform Costs,"5.63","5.94","5.05","5.83","5.93","5.67","5.22","5.31","5.48","5.42","6.09","5.37","5.22","5.46","5.78","6.12","6.34","6.02","5.94","6.28","5.19","5.42","5.94","5.85"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Credit Risk Ops Cost,"0.307","0.357","0.345","0.348","0.357","0.351","0.381","0.318","0.374","0.384","0.386","0.321","0.357","0.403","0.328","0.343","0.407","0.385","0.407","0.383","0.387","0.365","0.344","0.363"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Regulatory Compliance Costs,"2.03","2.46","2.25","2.24","2.46","2.13","2.04","1.94","2.33","2.45","2.46","2.35","2.21","2.14","2.18","2.2","2.18","2.59","2.47","2.4","2.26","2.07","2.11","2.37"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Premises Overheads Cost,"0.289","0.244","0.242","0.259","0.25","0.264","0.246","0.247","0.282","0.279","0.288","0.263","0.3","0.252","0.258","0.294","0.286","0.308","0.285","0.3","0.299","0.287","0.268","0.302"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Interest Cost,"21.596135","17.96535","18.9238725","22.48669333","16.73947917","20.4040425","24.9575","21.5778175","21.271185","27.0106525","25.60126083","23.726","19.64139167","22.79849","23.16050333","28.86741","23.63799083","25.765625","23.17834667","25.805325","25.155575","20.3658","20.05624167","29.7350775"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Interest Income,"30.124545","42.323775","42.1208775","61.05302583","65.3491875","66.08085167","28.99229583","86.984075","50.807505","60.359","49.9022825","91.54281667","49.151385","66.9036225","49.27652333","63.9423225","71.61958417","25.01302083","39.87461333","51.4017","32.96986","51.54487","67.90615833","44.1792525"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Operating Profit,"8.52841","24.358425","23.197005","38.5663325","48.60970833","45.67680917","4.034795833","65.4062575","29.53632","33.3483475","24.30102167","67.81681667","29.50999333","44.1051325","26.11602","35.0749125","47.98159333","-0.752604167","16.69626667","25.596375","7.814285","31.17907","47.84991667","14.444175"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Spread Percentage,"1.86","6.02","4.94","9.33","11.18","12.29","0.97","13.61","7.04","6.63","5.42","13.72","6.16","11.53","4.86","6.95","9.52","-0.17","3.4","4.9","1.46","6.43","9.4","2.9"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Fixed Costs,"12.13","13.003","12.561","12.593","13.379","12.195","12.195","11.647","12.506","12.445","13.254","12.44","12.969","12.737","12.458","13.537","14.039","13.267","13.228","13.627","12.438","12.792","12.894","13.697"
Apex Growth Finance,South West,Retail Lending,Debt Consolidation Loan,Net Profit,"-3.60159","11.355425","10.636005","25.9733325","35.23070833","33.48180917","-8.160204167","53.7592575","17.03032","20.9033475","11.04702167","55.37681667","16.54099333","31.3681325","13.65802","21.5379125","33.94259333","-14.01960417","3.468266667","11.969375","-4.623715","18.38707","34.95591667","0.747175"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Loan_Amount_Disbursed,"3209.2","3131.3","2930","3115.8","3274.5","2784.4","3527.8","3169.5","3668.5","2968","3459.1","3461.7","3703.4","3020.5","3824.6","3438.4","3108.5","3895.7","4055.8","3522.4","3304.6","3141.5","4217.2","3966.5"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Annual_Lending_Rate_Pct,"0.1262","0.1741","0.0565","0.1859","0.163","0.1181","0.1266","0.1666","0.1089","0.1798","0.0789","0.1579","0.1377","0.1054","0.1004","0.1852","0.1883","0.1319","0.0644","0.1092","0.1717","0.0913","0.0697","0.1608"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Annual_Borrowing_Rate_Pct,"0.0571","0.0389","0.0435","0.0455","0.0423","0.0474","0.0536","0.0482","0.0469","0.0574","0.0488","0.0576","0.0474","0.0483","0.0504","0.0473","0.0483","0.0525","0.0464","0.0425","0.0406","0.0523","0.0611","0.0523"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Staff Costs,"3.924","3.972","4.574","4.048","4.354","3.872","4.25","3.892","4.038","3.846","4.064","4.264","4.91","4.54","3.956","4.748","4.802","3.944","4.168","4.274","4.244","4.554","4.206","4.76"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Technology Platform Costs,"5.65","5.83","4.93","5.74","6.02","5.5","5.15","5.21","5.58","5.3","5.91","5.34","5.19","5.34","5.78","6.17","6.34","6.1","5.96","6.34","5.29","5.36","5.87","5.77"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Credit Risk Ops Cost,"0.308","0.355","0.343","0.347","0.361","0.352","0.38","0.321","0.362","0.389","0.38","0.317","0.364","0.394","0.326","0.344","0.409","0.393","0.413","0.377","0.387","0.373","0.336","0.371"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Regulatory Compliance Costs,"2","2.4","2.26","2.22","2.48","2.16","2.03","1.96","2.34","2.46","2.44","2.34","2.22","2.08","2.13","2.16","2.27","2.52","2.45","2.34","2.19","2.06","2.1","2.34"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Premises Overheads Cost,"0.279","0.243","0.242","0.261","0.25","0.262","0.241","0.251","0.289","0.282","0.281","0.267","0.293","0.251","0.261","0.286","0.291","0.308","0.282","0.301","0.304","0.289","0.265","0.295"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Interest Cost,"15.27044333","10.15063083","10.62125","11.814075","11.5426125","10.99838","15.75750667","12.730825","14.33772083","14.19693333","14.06700667","16.61616","14.62843","12.1575125","16.06332","13.55302667","12.5117125","17.0436875","15.68242667","12.47516667","11.18056333","13.69170417","21.47257667","17.28732917"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Interest Income,"33.75008667","45.42994417","13.79541667","48.268935","44.478625","27.40313667","37.21829","44.003225","33.2916375","44.47053333","22.7435825","45.5502025","42.496515","26.53005833","31.99915333","53.06597333","48.77754583","42.82023583","21.76612667","32.05384","47.28331833","23.90157917","24.49490333","53.1511"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Operating Profit,"18.47964333","35.27931333","3.174166667","36.45486","32.9360125","16.40475667","21.46078333","31.2724","18.95391667","30.2736","8.676575833","28.9340425","27.868085","14.37254583","15.93583333","39.51294667","36.26583333","25.77654833","6.0837","19.57867333","36.102755","10.209875","3.022326667","35.86377083"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Spread Percentage,"6.91","13.52","1.3","14.04","12.07","7.07","7.3","11.84","6.2","12.24","3.01","10.03","9.03","5.71","5","13.79","14","7.94","1.8","6.67","13.11","3.9","0.86","10.85"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Fixed Costs,"12.161","12.8","12.349","12.616","13.465","12.146","12.051","11.634","12.609","12.277","13.075","12.528","12.977","12.605","12.453","13.708","14.112","13.265","13.273","13.632","12.415","12.636","12.777","13.536"
Apex Growth Finance,Wales & South West,Retail Lending,Home Improvement Loan,Net Profit,"6.318643333","22.47931333","-9.174833333","23.83886","19.4710125","4.258756667","9.409783333","19.6384","6.344916667","17.9966","-4.398424167","16.4060425","14.891085","1.767545833","3.482833333","25.80494667","22.15383333","12.51154833","-7.1893","5.946673333","23.687755","-2.426125","-9.754673333","22.32777083"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Loan_Amount_Disbursed,"3540","3755","4079.1","3910.5","4367.9","4325.3","3907.1","3819.7","4650.3","4976.5","4536.8","4636.5","4458.9","4445.1","5244.8","4790.7","4275.1","4784.3","5029","5114","4964.8","4894.3","5431.1","5533.5"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Annual_Lending_Rate_Pct,"0.0771","0.1883","0.1102","0.1412","0.1162","0.0929","0.1551","0.0773","0.1879","0.1468","0.1777","0.0607","0.0807","0.1562","0.1147","0.1432","0.0567","0.1554","0.061","0.1665","0.1714","0.145","0.084","0.1409"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Annual_Borrowing_Rate_Pct,"0.0617","0.0421","0.0419","0.0409","0.0555","0.0381","0.0543","0.0548","0.0558","0.0583","0.0485","0.0582","0.0397","0.041","0.0389","0.048","0.0391","0.0515","0.0476","0.0502","0.0394","0.0575","0.0568","0.0387"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Staff Costs,"3.948","3.914","4.73","4.008","4.448","3.77","4.296","3.798","4.04","3.83","4.038","4.14","4.808","4.474","3.852","4.622","4.776","3.946","4.186","4.266","4.19","4.55","4.136","4.834"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Technology Platform Costs,"5.57","5.81","5.03","5.87","6.07","5.56","5.09","5.31","5.48","5.38","5.92","5.34","5.3","5.34","5.72","6.03","6.29","6.25","6.11","6.23","5.12","5.39","6.01","5.84"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Credit Risk Ops Cost,"0.315","0.357","0.342","0.34","0.362","0.35","0.379","0.319","0.37","0.379","0.391","0.325","0.356","0.391","0.326","0.342","0.4","0.386","0.419","0.38","0.379","0.359","0.339","0.374"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Regulatory Compliance Costs,"1.97","2.49","2.27","2.3","2.5","2.1","1.99","1.93","2.32","2.47","2.47","2.32","2.21","2.08","2.13","2.16","2.2","2.55","2.41","2.38","2.25","2.09","2.11","2.34"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Premises Overheads Cost,"0.28","0.238","0.249","0.263","0.243","0.26","0.247","0.254","0.286","0.28","0.289","0.269","0.295","0.258","0.264","0.286","0.292","0.3","0.283","0.29","0.305","0.296","0.273","0.299"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Interest Cost,"18.2015","13.17379167","14.2428575","13.3282875","20.2015375","13.7328275","17.6796275","17.44329667","21.623895","24.17749583","18.33623333","22.487025","14.7515275","15.187425","17.00189333","19.1628","13.92970083","20.53262083","19.94836667","21.39356667","16.30109333","23.45185417","25.70720667","17.8455375"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Interest Income,"22.7445","58.92220833","37.459735","46.01355","42.29583167","33.48503083","50.4992675","24.60523417","72.8159475","60.87918333","67.18244667","23.4529625","29.9861025","57.860385","50.13154667","57.16902","20.1998475","61.956685","25.56408333","70.95675","70.91389333","59.13945833","38.0177","64.9725125"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Operating Profit,"4.543","45.74841667","23.2168775","32.6852625","22.09429417","19.75220333","32.81964","7.1619375","51.1920525","36.7016875","48.84621333","0.9659375","15.234575","42.67296","33.12965333","38.00622","6.270146667","41.42406417","5.615716667","49.56318333","54.6128","35.68760417","12.31049333","47.126975"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Spread Percentage,"1.54","14.62","6.83","10.03","6.07","5.48","10.08","2.25","13.21","8.85","12.92","0.25","4.1","11.52","7.58","9.52","1.76","10.39","1.34","11.63","13.2","8.75","2.72","10.22"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Fixed Costs,"12.083","12.809","12.621","12.781","13.623","12.04","12.002","11.611","12.496","12.339","13.108","12.394","12.969","12.543","12.292","13.44","13.958","13.432","13.408","13.546","12.244","12.685","12.868","13.687"
Apex Growth Finance,Wales & South West,Retail Lending,Personal Loan,Net Profit,"-7.54","32.93941667","10.5958775","19.9042625","8.471294167","7.712203333","20.81764","-4.4490625","38.6960525","24.3626875","35.73821333","-11.4280625","2.265575","30.12996","20.83765333","24.56622","-7.687853333","27.99206417","-7.792283333","36.01718333","42.3688","23.00260417","-0.557506667","33.439975"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Loan_Amount_Disbursed,"7057.5","5852.1","6334.9","6364.7","5702.8","6943.1","6593.6","6893.1","6755.6","6870.7","7709.4","6271.1","6564.6","6459.9","6873.5","7955.3","6301","7121.6","7519.3","8126.7","8631.7","7801.8","8509.1","7565.8"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Annual_Lending_Rate_Pct,"0.1376","0.1096","0.1017","0.139","0.1011","0.0763","0.0926","0.0982","0.1129","0.1303","0.1166","0.1015","0.0983","0.0855","0.0897","0.0832","0.1357","0.1095","0.1318","0.1279","0.0943","0.0987","0.1185","0.1021"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Annual_Borrowing_Rate_Pct,"0.0674","0.0557","0.0618","0.0546","0.0514","0.0546","0.0671","0.0587","0.0451","0.056","0.0546","0.0523","0.0659","0.0532","0.0672","0.0507","0.0562","0.0499","0.0519","0.059","0.0575","0.0659","0.0475","0.0644"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Staff Costs,"3.93","3.712","4.092","3.696","3.312","3.748","3.29","3.982","4.102","4.134","3.764","4.068","4.014","4.218","4.232","3.91","3.834","3.568","3.846","4.206","3.684","3.536","4.258","3.496"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Technology Platform Costs,"4.07","4.06","4.36","4.57","4.01","4.57","4.41","4.3","3.73","4.17","4.49","4.19","4.75","4.18","4.21","3.91","4.37","4.47","4.12","4.08","4.76","4.72","3.93","4.44"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Credit Risk Ops Cost,"0.297","0.279","0.277","0.312","0.281","0.313","0.256","0.247","0.27","0.256","0.299","0.269","0.284","0.304","0.277","0.292","0.282","0.285","0.27","0.272","0.293","0.302","0.305","0.311"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Regulatory Compliance Costs,"2.03","1.69","1.75","1.81","1.95","1.84","1.68","1.75","1.92","1.79","1.7","1.67","1.73","1.74","1.91","1.8","1.74","2.09","2.1","2.05","1.98","1.83","1.79","1.91"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Premises Overheads Cost,"0.248","0.237","0.25","0.194","0.229","0.197","0.244","0.233","0.211","0.218","0.204","0.217","0.239","0.25","0.236","0.24","0.257","0.253","0.249","0.232","0.231","0.239","0.239","0.258"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Interest Cost,"39.639625","27.1634975","32.624735","28.959385","24.42699333","31.591105","36.86921333","33.7187475","25.38979667","32.06326667","35.07777","27.33154417","36.050595","28.63889","38.4916","33.6111425","29.50968333","29.61398667","32.5209725","39.956275","41.36022917","42.844885","33.68185417","40.60312667"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Interest Income,"80.926","53.44918","53.6882775","73.72444167","48.04609","44.14654417","50.88061333","56.408535","63.55893667","74.60435083","74.90967","53.04305417","53.775015","46.0267875","51.3794125","55.15674667","71.25380833","64.9846","82.58697833","86.6170775","67.83077583","64.169805","84.0273625","64.37234833"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Operating Profit,"41.286375","26.2856825","21.0635425","44.76505667","23.61909667","12.55543917","14.0114","22.6897875","38.16914","42.54108417","39.8319","25.71151","17.72442","17.3878975","12.8878125","21.54560417","41.744125","35.37061333","50.06600583","46.6608025","26.47054667","21.32492","50.34550833","23.76922167"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Spread Percentage,"7.02","5.39","3.99","8.44","4.97","2.17","2.55","3.95","6.78","7.43","6.2","4.92","3.24","3.23","2.25","3.25","7.95","5.96","7.99","6.89","3.68","3.28","7.1","3.77"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Fixed Costs,"10.575","9.978","10.729","10.582","9.782","10.668","9.88","10.512","10.233","10.568","10.457","10.414","11.017","10.692","10.865","10.152","10.483","10.666","10.585","10.84","10.948","10.627","10.522","10.415"
Apex Growth Finance,Wales & South West,SME Finance,Asset Finance,Net Profit,"30.711375","16.3076825","10.3345425","34.18305667","13.83709667","1.887439167","4.1314","12.1777875","27.93614","31.97308417","29.3749","15.29751","6.70742","6.6958975","2.0228125","11.39360417","31.261125","24.70461333","39.48100583","35.8208025","15.52254667","10.69792","39.82350833","13.35422167"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Loan_Amount_Disbursed,"1976.7","2078.6","2388.7","2216.6","2068.8","2223","2141.6","1949.9","1941.8","2038.2","2379","2547.2","2218.2","2256.2","2260.4","2448.6","2126.5","2435.1","2487.4","2593.7","2363.1","2148.1","2327.2","2396.6"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Annual_Lending_Rate_Pct,"0.069","0.1171","0.0927","0.0878","0.0895","0.0925","0.1161","0.0742","0.074","0.078","0.0905","0.1202","0.1337","0.0965","0.0703","0.1094","0.1293","0.0902","0.114","0.0834","0.1093","0.1004","0.1151","0.1146"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Annual_Borrowing_Rate_Pct,"0.0617","0.059","0.0611","0.0523","0.0465","0.0477","0.056","0.0425","0.0577","0.042","0.0538","0.0582","0.0676","0.0511","0.0591","0.0516","0.0571","0.0557","0.0455","0.0623","0.0479","0.0553","0.0621","0.0537"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Staff Costs,"3.984","3.73","4.124","3.652","3.304","3.718","3.366","4.01","4.082","4.104","3.692","3.964","4.004","4.188","4.164","3.916","3.722","3.546","3.874","4.272","3.81","3.546","4.13","3.48"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Technology Platform Costs,"3.95","4.14","4.28","4.52","4","4.54","4.49","4.2","3.86","4.3","4.38","4.15","4.88","4.31","4.3","3.86","4.28","4.36","4.12","4.04","4.59","4.77","3.86","4.34"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Credit Risk Ops Cost,"0.299","0.283","0.277","0.31","0.285","0.309","0.252","0.248","0.266","0.257","0.303","0.277","0.288","0.307","0.274","0.3","0.283","0.285","0.267","0.271","0.289","0.296","0.3","0.303"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Regulatory Compliance Costs,"1.96","1.68","1.75","1.8","1.99","1.86","1.69","1.71","1.89","1.79","1.74","1.62","1.69","1.76","1.95","1.78","1.75","2.13","2.07","2.11","1.95","1.88","1.81","1.86"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Premises Overheads Cost,"0.242","0.232","0.247","0.198","0.231","0.198","0.242","0.239","0.217","0.217","0.199","0.214","0.235","0.249","0.231","0.239","0.26","0.257","0.251","0.232","0.23","0.239","0.242","0.255"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Interest Cost,"10.1635325","10.21978333","12.16246417","9.660681667","8.0166","8.836425","9.994133333","6.905895833","9.336821667","7.1337","10.66585","12.35392","12.49586","9.607651667","11.13247","10.52898","10.11859583","11.3029225","9.431391667","13.46562583","9.4327075","9.899160833","12.04326","10.724785"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Interest Income,"11.366025","20.28367167","18.4527075","16.21812333","15.4298","17.135625","20.71998","12.05688167","11.97443333","13.2483","17.941625","25.51445333","24.714445","18.14360833","13.24217667","22.32307","22.9130375","18.303835","23.6303","18.026215","21.5239025","17.97243667","22.32172667","22.88753"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Operating Profit,"1.2024925","10.06388833","6.290243333","6.557441667","7.4132","8.2992","10.72584667","5.150985833","2.637611667","6.1146","7.275775","13.16053333","12.218585","8.535956667","2.109706667","11.79409","12.79444167","7.0009125","14.19890833","4.560589167","12.091195","8.073275833","10.27846667","12.162745"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Spread Percentage,"0.73","5.81","3.16","3.55","4.3","4.48","6.01","3.17","1.63","3.6","3.67","6.2","6.61","4.54","1.12","5.78","7.22","3.45","6.85","2.11","6.14","4.51","5.3","6.09"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Fixed Costs,"10.435","10.065","10.678","10.48","9.81","10.625","10.04","10.407","10.315","10.668","10.314","10.225","11.097","10.814","10.919","10.095","10.295","10.578","10.582","10.925","10.869","10.731","10.342","10.238"
Apex Growth Finance,Wales & South West,SME Finance,Merchant Cash Advance,Net Profit,"-9.2325075","-0.001111667","-4.387756667","-3.922558333","-2.3968","-2.3258","0.685846667","-5.256014167","-7.677388333","-4.5534","-3.038225","2.935533333","1.121585","-2.278043333","-8.809293333","1.69909","2.499441667","-3.5770875","3.616908333","-6.364410833","1.222195","-2.657724167","-0.063533333","1.924745"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Loan_Amount_Disbursed,"11386.9","9391.5","9756.8","11001.6","10104.5","10232.4","11169.6","10060.5","11844.7","11078.3","11841.3","12152.2","12538.8","10525.9","11457.6","12911","12836.9","10855.5","13043.3","12758.2","10987.6","11764.4","12537.7","12797.4"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Annual_Lending_Rate_Pct,"0.077","0.1221","0.1266","0.08275","0.1143","0.1132","0.11205","0.1153","0.1281","0.13055","0.09795","0.0942","0.11575","0.12135","0.12475","0.08905","0.09915","0.1107","0.11665","0.10345","0.08605","0.10835","0.1071","0.10625"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Annual_Borrowing_Rate_Pct,"0.05055","0.0499","0.05345","0.05725","0.0604","0.05935","0.0486","0.0466","0.063","0.05775","0.05345","0.05105","0.0452","0.05075","0.0508","0.06295","0.0554","0.05445","0.06045","0.04895","0.05065","0.0564","0.05745","0.056"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Staff Costs,"7.8","7.084","7.508","7.456","6.518","7.66","6.836","7.472","7.702","7.364","7.382","7.76","8.25","8.152","8.294","8.132","7.984","8.012","7.364","8.402","7.276","7.96","8.02","7.594"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Technology Platform Costs,"8.12","8.11","8.16","8.51","8.57","8.3","8.89","8.45","7.91","8.55","8.85","7.81","8.98","8.75","8.18","8.64","8.64","9.12","8.98","8.69","8.66","9.2","8.45","8.99"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Credit Risk Ops Cost,"0.549","0.546","0.547","0.568","0.587","0.596","0.517","0.504","0.514","0.518","0.584","0.586","0.567","0.588","0.567","0.623","0.547","0.56","0.542","0.533","0.545","0.593","0.574","0.587"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Regulatory Compliance Costs,"3.72","3.58","3.44","3.77","3.72","3.89","3.49","3.36","3.63","3.48","3.52","3.43","3.61","3.8","3.95","3.7","3.53","3.91","3.89","3.8","3.79","3.7","3.62","3.75"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Premises Overheads Cost,"0.451","0.466","0.48","0.393","0.428","0.439","0.488","0.454","0.454","0.456","0.437","0.444","0.443","0.486","0.452","0.459","0.466","0.478","0.455","0.458","0.475","0.459","0.502","0.498"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Interest Cost,"48.02689833","38.762925","43.50102583","51.98945","50.80964417","50.6933575","45.24403","39.12157","62.21224333","53.282725","51.9211075","51.49388333","47.20718","44.65666417","48.17188167","67.72549667","59.46926167","49.0724025","65.6844175","52.02538917","46.21478167","54.85139333","59.96644167","59.762165"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Interest Income,"73.04936917","96.37345","102.9431683","76.55463","96.60410833","96.39500167","104.3293875","96.60664","126.5492025","120.7522533","97.106505","96.362535","120.6693542","106.6757775","120.3481125","95.41276667","106.8454225","99.02796333","127.4727017","110.0111475","79.02068167","104.5321233","112.7784933","114.6917433"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Operating Profit,"25.02247083","57.610525","59.4421425","24.56518","45.79446417","45.70164417","59.0853575","57.48507","64.33695917","67.46952833","45.1853975","44.86865167","73.46217417","62.01911333","72.17623083","27.68727","47.37616083","49.95556083","61.78828417","57.98575833","32.8059","49.68073","52.81205167","54.92957833"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Spread Percentage,"2.645","7.22","7.315","2.55","5.39","5.385","6.345","6.87","6.51","7.28","4.45","4.315","7.055","7.06","7.395","2.61","4.375","5.625","5.62","5.45","3.54","5.195","4.965","5.025"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Fixed Costs,"20.64","19.786","20.135","20.697","19.823","20.885","20.221","20.24","20.21","20.368","20.773","20.03","21.85","21.776","21.443","21.554","21.167","22.08","21.231","21.883","20.746","21.912","21.166","21.419"
Apex Growth Finance,Wales & South West,SME Finance,SME Working Capital Facility,Net Profit,"4.382470833","37.824525","39.3071425","3.86818","25.97146417","24.81664417","38.8643575","37.24507","44.12695917","47.10152833","24.4123975","24.83865167","51.61217417","40.24311333","50.73323083","6.13327","26.20916083","27.87556083","40.55728417","36.10275833","12.0599","27.76873","31.64605167","33.51057833"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Loan_Amount_Disbursed,"2032","1824.1","2065.6","2413.4","2094.9","1991.3","2039.1","2052.5","2479.1","2435.6","2439","2500.7","2132.8","2135.7","2681.4","2153.7","2467","2404.7","2095.9","2131.7","2367.7","2121.7","2172.1","2446"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Annual_Lending_Rate_Pct,"0.0711","0.0722","0.1278","0.0779","0.0742","0.1299","0.1389","0.0867","0.1342","0.1066","0.1393","0.0787","0.1282","0.0912","0.115","0.1156","0.13","0.0848","0.0701","0.0708","0.0792","0.1174","0.1192","0.0971"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Annual_Borrowing_Rate_Pct,"0.0648","0.0427","0.0495","0.0639","0.0588","0.0625","0.0509","0.0568","0.0651","0.0516","0.0472","0.0652","0.0535","0.0557","0.0675","0.0577","0.046","0.065","0.057","0.0597","0.0499","0.0623","0.0665","0.053"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Staff Costs,"3.88","3.434","3.46","3.888","3.35","4.008","3.526","3.53","3.762","3.25","3.568","3.706","4.282","4.054","4.078","4.12","4.24","4.382","3.534","4.128","3.526","4.37","3.9","4.012"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Technology Platform Costs,"4.15","3.98","3.84","3.95","4.59","3.66","4.52","4.28","4.13","4.24","4.32","3.8","4.26","4.4","3.94","4.79","4.41","4.64","4.76","4.42","3.91","4.6","4.44","4.63"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Credit Risk Ops Cost,"0.252","0.267","0.264","0.253","0.306","0.275","0.275","0.261","0.248","0.257","0.291","0.308","0.295","0.277","0.287","0.316","0.273","0.273","0.275","0.262","0.26","0.292","0.284","0.288"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Regulatory Compliance Costs,"1.72","1.97","1.61","1.98","1.8","2.01","1.75","1.57","1.71","1.7","1.79","1.8","1.92","2.09","1.95","1.9","1.7","1.76","1.84","1.72","1.81","1.89","1.83","1.81"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Premises Overheads Cost,"0.203","0.23","0.237","0.192","0.195","0.238","0.236","0.213","0.244","0.236","0.227","0.222","0.202","0.229","0.218","0.23","0.204","0.234","0.202","0.23","0.245","0.227","0.254","0.244"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Interest Cost,"10.9728","6.490755833","8.5206","12.851355","10.26501","10.37135417","8.6491825","9.715166667","13.4491175","10.47308","9.5934","13.58713667","9.508733333","9.9132075","15.082875","10.3557075","9.456833333","13.02545833","9.955525","10.6052075","9.845685833","11.01515917","12.03705417","10.80316667"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Interest Income,"12.0396","10.97500167","21.99864","15.66698833","12.953465","21.5558225","23.6025825","14.8293125","27.72460167","21.63624667","28.312725","16.40042417","22.78541333","16.23132","25.69675","20.74731","26.72583333","16.99321333","12.24354917","12.57703","15.62682","20.75729833","21.57619333","19.79221667"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Operating Profit,"1.0668","4.484245833","13.47804","2.815633333","2.688455","11.18446833","14.9534","5.114145833","14.27548417","11.16316667","18.719325","2.8132875","13.27668","6.3181125","10.613875","10.3916025","17.269","3.967755","2.288024167","1.9718225","5.781134167","9.742139167","9.539139167","8.98905"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Spread Percentage,"0.63","2.95","7.83","1.4","1.54","6.74","8.8","2.99","6.91","5.5","9.21","1.35","7.47","3.55","4.75","5.79","8.4","1.98","1.31","1.11","2.93","5.51","5.27","4.41"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Fixed Costs,"10.205","9.881","9.411","10.263","10.241","10.191","10.307","9.854","10.094","9.683","10.196","9.836","10.959","11.05","10.473","11.356","10.827","11.289","10.611","10.76","9.751","11.379","10.708","10.984"
Apex Growth Finance,Yorkshire & Humber,SME Finance,Merchant Cash Advance,Net Profit,"-9.1382","-5.396754167","4.06704","-7.447366667","-7.552545","0.993468333","4.6464","-4.739854167","4.181484167","1.480166667","8.523325","-7.0227125","2.31768","-4.7318875","0.140875","-0.9643975","6.442","-7.321245","-8.322975833","-8.7881775","-3.969865833","-1.636860833","-1.168860833","-1.99495"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Loan_Amount_Disbursed,"9554.8","9293.4","8701","7478.8","9794.5","7464","9809.3","7725.2","9645.5","8737.6","9137.3","9419.5","8796.8","9008.8","10130.2","9844.2","10450.7","10714.9","9695.8","10313.3","10020.4","9110.1","10555.7","8688.8"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Annual_Lending_Rate_Pct,"0.1186","0.1375","0.0686","0.1347","0.1122","0.1406","0.0889","0.1173","0.1143","0.132","0.0953","0.0969","0.1202","0.0847","0.0774","0.1045","0.0883","0.0904","0.079","0.1396","0.0835","0.0944","0.0758","0.1169"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Annual_Borrowing_Rate_Pct,"0.0438","0.0589","0.0521","0.0544","0.0658","0.0582","0.0667","0.0588","0.0628","0.0436","0.0675","0.067","0.0477","0.0672","0.052","0.0624","0.0451","0.0435","0.0588","0.0569","0.0666","0.0498","0.055","0.0637"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Staff Costs,"3.88","3.476","3.418","3.822","3.302","4.018","3.478","3.59","3.676","3.31","3.578","3.728","4.176","4.036","4.226","4.16","4.386","4.258","3.572","4.104","3.516","4.38","3.844","3.974"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Technology Platform Costs,"4.11","4.1","3.84","3.89","4.54","3.67","4.54","4.24","4.12","4.23","4.34","3.7","4.26","4.47","3.92","4.7","4.31","4.55","4.93","4.55","3.96","4.54","4.42","4.61"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Credit Risk Ops Cost,"0.259","0.268","0.265","0.259","0.312","0.285","0.269","0.255","0.252","0.262","0.292","0.312","0.287","0.277","0.293","0.318","0.276","0.271","0.278","0.266","0.258","0.3","0.286","0.29"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Regulatory Compliance Costs,"1.68","1.94","1.62","1.96","1.84","2.03","1.72","1.62","1.68","1.7","1.79","1.77","1.9","2.03","1.94","1.9","1.71","1.77","1.83","1.77","1.81","1.89","1.84","1.86"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Premises Overheads Cost,"0.203","0.231","0.238","0.197","0.195","0.242","0.236","0.214","0.242","0.235","0.229","0.221","0.208","0.231","0.214","0.226","0.211","0.229","0.207","0.226","0.242","0.224","0.251","0.245"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Interest Cost,"34.87502","45.615105","37.77684167","33.90389333","53.70650833","36.2004","54.52335917","37.85348","50.47811667","31.74661333","51.3973125","52.59220833","34.96728","50.44928","43.89753333","51.18984","39.27721417","38.8415125","47.50942","48.90223083","55.61322","37.806915","48.38029167","46.12304667"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Interest Income,"94.43327333","106.486875","49.74071667","83.94953","91.578575","87.4532","72.67056417","75.51383","91.8733875","96.1136","72.56539083","76.0624625","88.11461333","63.58711333","65.33979","85.726575","76.89973417","80.71891333","63.83068333","119.9780567","69.72528333","71.66612","66.67683833","84.64339333"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Operating Profit,"59.55825333","60.87177","11.963875","50.04563667","37.87206667","51.2528","18.147205","37.66035","41.39527083","64.36698667","21.16807833","23.47025417","53.14733333","13.13783333","21.44225667","34.536735","37.62252","41.87740083","16.32126333","71.07582583","14.11206333","33.859205","18.29654667","38.52034667"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Spread Percentage,"7.48","7.86","1.65","8.03","4.64","8.24","2.22","5.85","5.15","8.84","2.78","2.99","7.25","1.75","2.54","4.21","4.32","4.69","2.02","8.27","1.69","4.46","2.08","5.32"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Fixed Costs,"10.132","10.015","9.381","10.128","10.189","10.245","10.243","9.919","9.97","9.737","10.229","9.731","10.831","11.044","10.593","11.304","10.893","11.078","10.817","10.916","9.786","11.334","10.641","10.979"
Apex Growth Finance,Yorkshire & Humber,SME Finance,SME Term Loan,Net Profit,"49.42625333","50.85677","2.582875","39.91763667","27.68306667","41.0078","7.904205","27.74135","31.42527083","54.62998667","10.93907833","13.73925417","42.31633333","2.093833333","10.84925667","23.232735","26.72952","30.79940083","5.504263333","60.15982583","4.326063333","22.525205","7.655546667","27.54134667"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Loan_Amount_Disbursed,"5662.6","6166.2","6518.6","5754.5","5468.1","5377.3","5094.3","5818.8","6092.1","6633.6","6344.3","6769.4","5632.2","7084.5","7064.2","7143.8","6562.8","6068.1","5654.3","6511.5","6300.9","6121.1","7190.7","6569.1"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Annual_Lending_Rate_Pct,"0.1408","0.0923","0.083","0.1398","0.1073","0.1558","0.0699","0.0651","0.0747","0.077","0.1219","0.0887","0.1768","0.1344","0.1484","0.1643","0.1017","0.186","0.1602","0.1362","0.0992","0.1709","0.1171","0.1255"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Annual_Borrowing_Rate_Pct,"0.0554","0.0452","0.054","0.0394","0.0535","0.0478","0.0408","0.0437","0.0498","0.0387","0.0513","0.0473","0.0519","0.0578","0.0478","0.0565","0.0548","0.0497","0.0391","0.0388","0.0556","0.0505","0.0612","0.0534"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Staff Costs,"4.072","3.754","4.528","4.444","4.092","4.108","4.618","3.888","4.356","4.17","4.016","3.872","4.164","4.57","4.154","4.498","4.606","4.632","3.912","4.308","4.594","4.08","4.59","4.594"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Technology Platform Costs,"5.1","5.23","5.36","5.95","4.84","5.11","5.9","5.75","5.59","5.13","5.57","5.29","5.1","5.79","6.46","5.97","5.93","5.45","5.13","6.07","5.35","5.43","6.39","5.5"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Credit Risk Ops Cost,"0.337","0.34","0.357","0.362","0.369","0.382","0.35","0.389","0.313","0.308","0.362","0.366","0.325","0.336","0.399","0.363","0.373","0.377","0.348","0.328","0.328","0.386","0.354","0.325"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Regulatory Compliance Costs,"1.92","2.08","2.13","2.17","2.37","2.31","2.38","2.28","2.38","2.38","2.34","2.22","2.43","2.38","2.23","2.39","2.54","2.16","2.6","2.44","2.02","2.48","2.36","2.26"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Premises Overheads Cost,"0.243","0.252","0.264","0.282","0.238","0.231","0.27","0.252","0.24","0.272","0.268","0.274","0.249","0.263","0.283","0.283","0.291","0.289","0.263","0.24","0.281","0.262","0.264","0.262"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Interest Cost,"26.14233667","23.22602","29.3337","18.89394167","24.3786125","21.41957833","17.32062","21.19013","25.282215","21.39336","27.1218825","26.68271833","24.359265","34.123675","28.13906333","33.63539167","29.97012","25.1320475","18.42359417","21.05385","29.19417","25.75962917","36.67257","29.232495"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Interest Income,"66.44117333","47.428355","45.08698333","67.039925","48.8939275","69.81527833","29.6742975","31.56699","37.9233225","42.5656","64.44751417","50.03714833","82.98108","79.3464","87.36060667","97.81052833","55.61973","94.05555","75.484905","73.905525","52.08744","87.17466583","70.1692475","68.7018375"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Operating Profit,"40.29883667","24.202335","15.75328333","48.14598333","24.515315","48.3957","12.3536775","10.37686","12.6411075","21.17224","37.32563167","23.35443","58.621815","45.222725","59.22154333","64.17513667","25.64961","68.9235025","57.06131083","52.851675","22.89327","61.41503667","33.4966775","39.4693425"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Spread Percentage,"8.54","4.71","2.9","10.04","5.38","10.8","2.91","2.14","2.49","3.83","7.06","4.14","12.49","7.66","10.06","10.78","4.69","13.63","12.11","9.74","4.36","12.04","5.59","7.21"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Fixed Costs,"11.672","11.656","12.639","13.208","11.909","12.141","13.518","12.559","12.879","12.26","12.556","12.022","12.268","13.339","13.526","13.504","13.74","12.908","12.253","13.386","12.573","12.638","13.958","12.941"
Bridgepoint Lending,East of England,Retail Lending,Car Finance,Net Profit,"28.62683667","12.546335","3.114283333","34.93798333","12.606315","36.2547","-1.1643225","-2.18214","-0.2378925","8.91224","24.76963167","11.33243","46.353815","31.883725","45.69554333","50.67113667","11.90961","56.0155025","44.80831083","39.465675","10.32027","48.77703667","19.5386775","26.5283425"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Loan_Amount_Disbursed,"3364.3","3130.6","2693.8","2878.5","3154.2","3528.4","2799.2","2858.7","3412.2","3394.5","3883.3","3736.4","3846.5","3289","2981.9","3804.2","3198.9","3965.9","3029.8","3506.3","3930.9","3562.5","3717.6","3954.9"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Annual_Lending_Rate_Pct,"0.1631","0.0842","0.0793","0.103","0.124","0.145","0.1876","0.1665","0.1122","0.1701","0.0831","0.12","0.0639","0.0957","0.1169","0.0541","0.0696","0.1599","0.1232","0.0583","0.1857","0.1492","0.1496","0.1887"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Annual_Borrowing_Rate_Pct,"0.0609","0.0538","0.0546","0.0437","0.0516","0.0496","0.0614","0.0404","0.039","0.0556","0.0528","0.0395","0.0614","0.0453","0.049","0.0395","0.0597","0.0478","0.049","0.054","0.0531","0.049","0.0464","0.0429"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Staff Costs,"4.012","3.818","4.374","4.378","4.132","4.182","4.678","3.944","4.346","4.168","4.104","3.902","4.182","4.548","4.196","4.542","4.546","4.74","4.006","4.238","4.652","4.072","4.482","4.624"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Technology Platform Costs,"5.11","5.12","5.46","5.89","4.81","4.94","5.96","5.72","5.69","5.03","5.69","5.28","5.18","5.84","6.3","5.8","5.76","5.44","5.11","6.12","5.36","5.58","6.41","5.55"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Credit Risk Ops Cost,"0.336","0.349","0.358","0.358","0.367","0.387","0.358","0.397","0.313","0.309","0.364","0.366","0.331","0.335","0.387","0.355","0.368","0.377","0.354","0.33","0.324","0.386","0.36","0.323"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Regulatory Compliance Costs,"1.99","2.08","2.17","2.13","2.4","2.26","2.34","2.27","2.37","2.37","2.43","2.15","2.38","2.41","2.22","2.43","2.49","2.15","2.59","2.43","2.04","2.52","2.34","2.26"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Premises Overheads Cost,"0.244","0.254","0.26","0.279","0.233","0.227","0.267","0.251","0.243","0.277","0.265","0.27","0.251","0.259","0.282","0.283","0.291","0.289","0.269","0.244","0.28","0.263","0.263","0.263"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Interest Cost,"17.0738225","14.03552333","12.25679","10.4825375","13.56306","14.58405333","14.32257333","9.62429","11.08965","15.72785","17.08652","12.29898333","19.68125833","12.415975","12.17609167","12.52215833","15.9145275","15.79750167","12.37168333","15.77835","17.3942325","14.546875","14.37472","14.1387675"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Interest Income,"45.72644417","21.96637667","17.80152833","24.707125","32.5934","42.63483333","43.76082667","39.6644625","31.90407","48.1170375","26.8918525","37.364","20.4826125","26.229775","29.04867583","17.15060167","18.55362","52.8456175","31.10594667","17.03477417","60.8306775","44.29375","46.34608","62.1908025"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Operating Profit,"28.65262167","7.930853333","5.544738333","14.2245875","19.03034","28.05078","29.43825333","30.0401725","20.81442","32.3891875","9.8053325","25.06501667","0.801354167","13.8138","16.87258417","4.628443333","2.6390925","37.04811583","18.73426333","1.256424167","43.436445","29.746875","31.97136","48.052035"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Spread Percentage,"10.22","3.04","2.47","5.93","7.24","9.54","12.62","12.61","7.32","11.45","3.03","8.05","0.25","5.04","6.79","1.46","0.99","11.21","7.42","0.43","13.26","10.02","10.32","14.58"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Fixed Costs,"11.692","11.621","12.622","13.035","11.942","11.996","13.603","12.582","12.962","12.154","12.853","11.968","12.324","13.392","13.385","13.41","13.455","12.996","12.329","13.362","12.656","12.821","13.855","13.02"
Bridgepoint Lending,East of England,Retail Lending,Home Improvement Loan,Net Profit,"16.96062167","-3.690146667","-7.077261667","1.1895875","7.08834","16.05478","15.83525333","17.4581725","7.85242","20.2351875","-3.0476675","13.09701667","-11.52264583","0.4218","3.487584167","-8.781556667","-10.8159075","24.05211583","6.405263333","-12.10557583","30.780445","16.925875","18.11636","35.032035"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Loan_Amount_Disbursed,"6485.1","7481.2","6313","8541.8","8101.6","7512.8","6956.4","6660.1","8177.5","6897.2","8309.8","8536.2","8871.6","7269.9","8452.3","7043.1","8710.3","8691.5","8637.2","9439","7349.1","9801","8736.8","9304.6"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Annual_Lending_Rate_Pct,"0.0953","0.055","0.0888","0.1059","0.1133","0.0573","0.0767","0.084","0.1035","0.0837","0.054","0.0841","0.0635","0.0986","0.1081","0.0741","0.0701","0.0828","0.0821","0.0565","0.062","0.0474","0.1107","0.1004"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Annual_Borrowing_Rate_Pct,"0.0415","0.0342","0.0374","0.0281","0.0524","0.0388","0.0411","0.0472","0.0425","0.036","0.0381","0.0359","0.0474","0.047","0.0287","0.0281","0.0286","0.0431","0.0501","0.0422","0.0455","0.054","0.0381","0.0496"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Staff Costs,"3.262","2.872","2.748","2.682","3.14","3.118","2.986","3.254","3.156","3.082","2.952","2.656","2.892","2.852","2.848","3.248","3.128","3.028","3.062","2.802","2.898","3.016","3.142","2.924"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Technology Platform Costs,"3.56","4.02","3.64","4.23","3.58","3.34","4.01","4.08","3.66","3.71","3.75","3.86","3.83","3.66","4.14","4.29","3.97","3.63","3.83","3.79","3.56","3.94","3.86","3.67"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Credit Risk Ops Cost,"0.221","0.214","0.19","0.203","0.217","0.182","0.204","0.21","0.201","0.204","0.219","0.21","0.204","0.186","0.189","0.204","0.188","0.191","0.192","0.225","0.19","0.21","0.203","0.218"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Regulatory Compliance Costs,"1.46","1.58","1.43","1.7","1.66","1.61","1.62","1.43","1.65","1.61","1.35","1.71","1.41","1.41","1.41","1.63","1.62","1.44","1.54","1.52","1.43","1.58","1.63","1.42"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Premises Overheads Cost,"0.167","0.177","0.165","0.202","0.19","0.191","0.176","0.2","0.176","0.169","0.17","0.19","0.202","0.207","0.178","0.194","0.172","0.204","0.203","0.186","0.182","0.204","0.174","0.184"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Interest Cost,"22.4276375","21.32142","19.67551667","20.00204833","35.37698667","24.29138667","23.82567","26.19639333","28.96197917","20.6916","26.383615","25.537465","35.04282","28.473775","20.21508417","16.4925925","20.75954833","31.21697083","36.06031","33.19381667","27.8653375","44.1045","27.73934","38.45901333"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Interest Income,"51.5025025","34.28883333","46.7162","75.381385","76.49260667","35.87362","44.46299","46.6207","70.5309375","48.10797","37.3941","59.824535","46.94555","59.734345","76.14113583","43.4911425","50.88266917","59.97135","59.09284333","44.44195833","37.97035","38.71395","80.59698","77.84848667"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Operating Profit,"29.074865","12.96741333","27.04068333","55.37933667","41.11562","11.58223333","20.63732","20.42430667","41.56895833","27.41637","11.010485","34.28707","11.90273","31.26057","55.92605167","26.99855","30.12312083","28.75437917","23.03253333","11.24814167","10.1050125","-5.39055","52.85764","39.38947333"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Spread Percentage,"5.38","2.08","5.14","7.78","6.09","1.85","3.56","3.68","6.1","4.77","1.59","4.82","1.61","5.16","7.94","4.6","4.15","3.97","3.2","1.43","1.65","-0.66","7.26","5.08"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Fixed Costs,"8.67","8.863","8.173","9.017","8.787","8.441","8.996","9.174","8.843","8.775","8.441","8.626","8.538","8.315","8.765","9.566","9.078","8.493","8.827","8.523","8.26","8.95","9.009","8.416"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Buy-to-Let,Net Profit,"20.404865","4.104413333","18.86768333","46.36233667","32.32862","3.141233333","11.64132","11.25030667","32.72595833","18.64137","2.569485","25.66107","3.36473","22.94557","47.16105167","17.43255","21.04512083","20.26137917","14.20553333","2.725141667","1.8450125","-14.34055","43.84864","30.97347333"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Loan_Amount_Disbursed,"2208","2222.2","2505.4","2398.3","2327","2516.1","2495.2","2080.4","2077.5","2044.9","2562.4","2620.5","2711.2","2537.8","2300.3","2139.8","2504.3","2779.5","2921.2","2360.6","2426.7","2461.3","2366.4","2743.2"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Annual_Lending_Rate_Pct,"0.0879","0.078","0.0748","0.0655","0.0517","0.1046","0.0522","0.0468","0.0695","0.0755","0.0931","0.0712","0.0901","0.0865","0.0626","0.0966","0.0818","0.0803","0.0563","0.0874","0.1023","0.1073","0.0761","0.1063"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Annual_Borrowing_Rate_Pct,"0.0417","0.0416","0.0333","0.0301","0.0286","0.0537","0.0491","0.0415","0.0368","0.0307","0.0339","0.0302","0.032","0.035","0.0502","0.044","0.0483","0.0331","0.0445","0.05","0.0543","0.0424","0.0351","0.038"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Staff Costs,"3.176","2.932","2.778","2.722","3.196","3.146","2.968","3.16","3.192","3.094","2.946","2.662","2.934","2.84","2.784","3.234","3.122","3.038","3.062","2.804","2.946","3.044","3.056","3.02"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Technology Platform Costs,"3.53","4.05","3.57","4.22","3.61","3.41","4.07","4.16","3.54","3.72","3.8","3.75","3.84","3.65","4.18","4.21","3.97","3.59","3.83","3.72","3.65","3.85","3.87","3.74"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Credit Risk Ops Cost,"0.22","0.219","0.193","0.201","0.209","0.188","0.206","0.21","0.204","0.204","0.219","0.21","0.204","0.185","0.187","0.205","0.187","0.193","0.189","0.231","0.194","0.207","0.201","0.221"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Regulatory Compliance Costs,"1.44","1.64","1.47","1.69","1.64","1.6","1.63","1.42","1.66","1.66","1.34","1.71","1.38","1.45","1.42","1.66","1.67","1.45","1.56","1.55","1.45","1.61","1.61","1.44"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Premises Overheads Cost,"0.17","0.173","0.161","0.204","0.196","0.196","0.176","0.198","0.178","0.172","0.164","0.185","0.197","0.201","0.184","0.198","0.17","0.201","0.201","0.189","0.18","0.205","0.171","0.184"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Interest Cost,"7.6728","7.703626667","6.952485","6.015735833","5.546016667","11.2595475","10.20952667","7.194716667","6.371","5.231535833","7.23878","6.594925","7.229866667","7.401916667","9.622921667","7.845933333","10.0798075","7.6667875","10.83278333","9.835833333","10.9808175","8.696593333","6.92172","8.6868"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Interest Income,"16.1736","14.4443","15.61699333","13.09072083","10.02549167","21.932005","10.85412","8.11356","12.0321875","12.86582917","19.87995333","15.5483","20.35659333","18.29330833","11.99989833","17.22539","17.07097833","18.5994875","13.70529667","17.19303667","20.6876175","22.00812417","15.00692","24.30018"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Operating Profit,"8.5008","6.740673333","8.664508333","7.074985","4.479475","10.6724575","0.644593333","0.918843333","5.6611875","7.634293333","12.64117333","8.953375","13.12672667","10.89139167","2.376976667","9.379456667","6.991170833","10.9327","2.872513333","7.357203333","9.7068","13.31153083","8.0852","15.61338"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Spread Percentage,"4.62","3.64","4.15","3.54","2.31","5.09","0.31","0.53","3.27","4.48","5.92","4.1","5.81","5.15","1.24","5.26","3.35","4.72","1.18","3.74","4.8","6.49","4.1","6.83"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Fixed Costs,"8.536","9.014","8.172","9.037","8.851","8.54","9.05","9.148","8.774","8.85","8.469","8.517","8.555","8.326","8.755","9.507","9.119","8.472","8.842","8.494","8.42","8.916","8.908","8.605"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Green Energy Loan,Net Profit,"-0.0352","-2.273326667","0.492508333","-1.962015","-4.371525","2.1324575","-8.405406667","-8.229156667","-3.1128125","-1.215706667","4.172173333","0.436375","4.571726667","2.565391667","-6.378023333","-0.127543333","-2.127829167","2.4607","-5.969486667","-1.136796667","1.2868","4.395530833","-0.8228","7.00838"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Loan_Amount_Disbursed,"9954.7","9112.2","8558.5","8216.3","11087.6","8701.7","10660.2","10282.9","10017.6","9107.2","9967.1","11540.6","9322.6","11768.4","11237.9","12126.8","10132","10361.3","10787.4","10789.4","10678.7","11159.1","10639.3","11703.1"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Annual_Lending_Rate_Pct,"0.1106","0.1055","0.0982","0.0608","0.052","0.0916","0.0531","0.0689","0.0991","0.087","0.1084","0.0487","0.0499","0.0819","0.0514","0.0683","0.0742","0.0975","0.0596","0.1096","0.051","0.0579","0.0967","0.1069"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Annual_Borrowing_Rate_Pct,"0.0493","0.0299","0.0518","0.0426","0.0296","0.0357","0.0481","0.0417","0.0296","0.0463","0.0488","0.0538","0.0486","0.0468","0.0482","0.0366","0.0528","0.0425","0.0513","0.0329","0.0475","0.04","0.0483","0.0408"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Staff Costs,"3.254","2.84","2.79","2.69","3.242","3.078","2.918","3.192","3.09","3.184","2.96","2.606","2.854","2.886","2.826","3.244","3.204","3.038","3.016","2.752","2.91","3.018","3.16","2.934"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Technology Platform Costs,"3.54","4.03","3.54","4.23","3.5","3.3","4.01","4.19","3.66","3.73","3.71","3.77","3.85","3.75","4.18","4.25","3.93","3.52","3.94","3.8","3.66","3.84","3.84","3.61"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Credit Risk Ops Cost,"0.22","0.215","0.188","0.201","0.212","0.181","0.207","0.207","0.206","0.204","0.225","0.206","0.199","0.186","0.19","0.204","0.19","0.196","0.189","0.225","0.19","0.21","0.201","0.224"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Regulatory Compliance Costs,"1.44","1.61","1.48","1.66","1.67","1.59","1.63","1.44","1.68","1.64","1.31","1.65","1.42","1.45","1.44","1.69","1.67","1.41","1.56","1.55","1.45","1.56","1.58","1.44"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Premises Overheads Cost,"0.173","0.174","0.167","0.204","0.191","0.192","0.175","0.205","0.178","0.171","0.166","0.186","0.2","0.203","0.184","0.193","0.17","0.199","0.206","0.185","0.181","0.206","0.173","0.182"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Interest Cost,"40.89722583","22.704565","36.94419167","29.167865","27.34941333","25.8875575","42.729635","35.7330775","24.71008","35.13861333","40.53287333","51.74035667","37.75653","45.89676","45.13889833","36.98674","44.5808","36.69627083","46.116135","29.58093833","42.26985417","37.197","42.8231825","39.79054"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Interest Income,"91.74915167","80.111425","70.03705833","41.62925333","48.04626667","66.42297667","47.171385","59.04098417","82.72868","66.0272","90.03613667","46.83560167","38.76647833","80.31933","48.13567167","69.02170333","62.64953333","84.1855625","53.57742","98.54318667","45.384475","53.8426575","85.73502583","104.2551158"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Operating Profit,"50.85192583","57.40686","33.09286667","12.46138833","20.69685333","40.53541917","4.44175","23.30790667","58.0186","30.88858667","49.50326333","-4.904755","1.009948333","34.42257","2.996773333","32.03496333","18.06873333","47.48929167","7.461285","68.96224833","3.114620833","16.6456575","42.91184333","64.46457583"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Spread Percentage,"6.13","7.56","4.64","1.82","2.24","5.59","0.5","2.72","6.95","4.07","5.96","-0.51","0.13","3.51","0.32","3.17","2.14","5.5","0.83","7.67","0.35","1.79","4.84","6.61"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Fixed Costs,"8.627","8.869","8.165","8.985","8.815","8.341","8.94","9.234","8.814","8.929","8.371","8.418","8.523","8.475","8.82","9.581","9.164","8.363","8.911","8.512","8.391","8.834","8.954","8.39"
Bridgepoint Lending,Midlands,Peer-to-Peer,P2P Property Bridging,Net Profit,"42.22492583","48.53786","24.92786667","3.476388333","11.88185333","32.19441917","-4.49825","14.07390667","49.2046","21.95958667","41.13226333","-13.322755","-7.513051667","25.94757","-5.823226667","22.45396333","8.904733333","39.12629167","-1.449715","60.45024833","-5.276379167","7.8116575","33.95784333","56.07457583"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Loan_Amount_Disbursed,"5017.5","5779.6","5688.9","4627.7","5005.1","5041.6","4825.4","4999","5137.5","4764.8","5807","5281.7","5455.4","5725.2","5795.5","5758.9","4632.4","5230.8","5744.3","5645","6231.1","5295.4","6273.5","6292.1"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Annual_Lending_Rate_Pct,"0.0793","0.0743","0.0902","0.0527","0.1026","0.0673","0.0732","0.1511","0.1055","0.1229","0.1859","0.1114","0.1787","0.1685","0.1669","0.1168","0.1869","0.1522","0.1105","0.1793","0.1101","0.0934","0.1584","0.141"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Annual_Borrowing_Rate_Pct,"0.0581","0.0592","0.0518","0.0463","0.0489","0.0398","0.0564","0.0426","0.0465","0.0388","0.0509","0.0419","0.0413","0.0599","0.0383","0.0425","0.0484","0.0572","0.0451","0.0392","0.0507","0.0473","0.0392","0.0551"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Staff Costs,"4.268","4.072","4.078","4.152","4.32","4.086","4.296","4.358","4.654","3.994","4.136","3.966","4.686","4.918","4.656","3.974","3.866","4.622","3.91","3.97","4.634","4.072","4.512","4.122"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Technology Platform Costs,"5.68","5.28","5","5.8","5.53","4.81","5.42","5.4","5.77","5.67","5.16","4.77","5.41","5.12","5.96","6.15","5.64","5.78","5.76","6.02","5.9","5.64","5.61","5.35"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Credit Risk Ops Cost,"0.329","0.376","0.371","0.338","0.383","0.375","0.337","0.308","0.348","0.322","0.336","0.356","0.39","0.361","0.39","0.363","0.355","0.385","0.378","0.399","0.373","0.359","0.366","0.386"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Regulatory Compliance Costs,"2.39","2.19","2.09","2.17","2.26","2.49","2.21","2.12","1.97","2.05","2.33","2.12","2.49","2.28","2.19","2.03","2.1","2.44","2.46","2.06","2.46","2.36","2.19","2.27"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Premises Overheads Cost,"0.246","0.266","0.261","0.262","0.246","0.234","0.256","0.24","0.253","0.293","0.285","0.254","0.285","0.252","0.263","0.266","0.263","0.241","0.281","0.259","0.299","0.272","0.282","0.261"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Interest Cost,"24.2930625","28.51269333","24.557085","17.85520917","20.3957825","16.72130667","22.67938","17.74645","19.9078125","15.40618667","24.63135833","18.44193583","18.77566833","28.57829","18.49730417","20.39610417","18.68401333","24.93348","21.58899417","18.44033333","26.3263975","20.87270167","20.49343333","28.89122583"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Interest Income,"33.1573125","35.78535667","42.761565","20.32331583","42.793605","28.27497333","29.43494","62.94574167","45.1671875","48.79949333","89.96010833","49.03178167","81.23999833","80.39135","80.60574583","56.05329333","72.14963","66.34398","52.89542917","84.34570833","57.1703425","41.21586333","82.8102","73.932175"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Operating Profit,"8.86425","7.272663333","18.20448","2.468106667","22.3978225","11.55366667","6.75556","45.19929167","25.259375","33.39330667","65.32875","30.58984583","62.46433","51.81306","62.10844167","35.65718917","53.46561667","41.4105","31.306435","65.905375","30.843945","20.34316167","62.31676667","45.04094917"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Spread Percentage,"2.12","1.51","3.84","0.64","5.37","2.75","1.68","10.85","5.9","8.41","13.5","6.95","13.74","10.86","12.86","7.43","13.85","9.5","6.54","14.01","5.94","4.61","11.92","8.59"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Fixed Costs,"12.913","12.184","11.8","12.722","12.739","11.995","12.519","12.426","12.995","12.329","12.247","11.466","13.261","12.931","13.459","12.783","12.224","13.468","12.789","12.708","13.666","12.703","12.96","12.389"
Bridgepoint Lending,Midlands,Retail Lending,Debt Consolidation Loan,Net Profit,"-4.04875","-4.911336667","6.40448","-10.25389333","9.6588225","-0.441333333","-5.76344","32.77329167","12.264375","21.06430667","53.08175","19.12384583","49.20333","38.88206","48.64944167","22.87418917","41.24161667","27.9425","18.517435","53.197375","17.177945","7.640161667","49.35676667","32.65194917"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Loan_Amount_Disbursed,"3103.7","3640.7","3162.4","3031.6","3093.7","3579.5","2857.8","3315.8","3863.1","3384.6","3303.7","3307","3861.8","3252.8","3822.1","3668.7","3471.7","3072","3955","3290.7","3771.2","3378.1","3570.9","3213.3"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Annual_Lending_Rate_Pct,"0.09","0.0756","0.1035","0.1118","0.1401","0.1263","0.1113","0.1616","0.186","0.1155","0.0897","0.0899","0.1059","0.1803","0.1613","0.0682","0.1422","0.1195","0.1182","0.1055","0.1834","0.126","0.1571","0.0733"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Annual_Borrowing_Rate_Pct,"0.0594","0.0517","0.0393","0.0412","0.0604","0.0536","0.0598","0.0513","0.0517","0.0412","0.0381","0.0486","0.054","0.0606","0.0545","0.0536","0.0496","0.0475","0.0562","0.0619","0.0434","0.059","0.0538","0.0512"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Staff Costs,"4.338","4.108","4.134","4.026","4.32","4.126","4.316","4.352","4.538","4.056","4.22","4.014","4.792","4.872","4.682","4","3.95","4.608","3.872","3.956","4.588","4.19","4.508","4.024"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Technology Platform Costs,"5.76","5.3","5.08","5.95","5.73","4.93","5.43","5.34","5.6","5.8","5.18","4.79","5.36","5.06","5.86","5.98","5.7","5.78","5.79","6.01","5.84","5.48","5.66","5.2"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Credit Risk Ops Cost,"0.332","0.382","0.368","0.343","0.381","0.368","0.339","0.313","0.335","0.322","0.335","0.361","0.389","0.363","0.398","0.355","0.349","0.396","0.369","0.405","0.366","0.352","0.369","0.377"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Regulatory Compliance Costs,"2.35","2.24","2.1","2.19","2.32","2.42","2.24","2.15","1.98","2.06","2.31","2.05","2.46","2.3","2.21","2.09","2.17","2.42","2.41","2.04","2.45","2.37","2.23","2.26"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Premises Overheads Cost,"0.245","0.264","0.265","0.263","0.248","0.23","0.26","0.24","0.254","0.282","0.277","0.253","0.28","0.247","0.269","0.267","0.255","0.249","0.282","0.257","0.293","0.275","0.281","0.267"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Interest Cost,"15.363315","15.68534917","10.35686","10.40849333","15.57162333","15.98843333","14.24137","14.175045","16.6435225","11.62046","10.4892475","13.39335","17.3781","16.42664","17.35870417","16.38686","14.34969333","12.16","18.52258333","16.9745275","13.63917333","16.60899167","16.009535","13.71008"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Interest Income,"23.27775","22.93641","27.2757","28.24440667","36.1189475","37.6742375","26.506095","44.65277333","59.87805","32.576775","24.6951575","24.77494167","34.080385","48.87332","51.37539417","20.850445","41.139645","30.592","38.95675","28.9307375","57.63650667","35.47005","46.7490325","19.6279075"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Operating Profit,"7.914435","7.251060833","16.91884","17.83591333","20.54732417","21.68580417","12.264725","30.47772833","43.2345275","20.956315","14.20591","11.38159167","16.702285","32.44668","34.01669","4.463585","26.78995167","18.432","20.43416667","11.95621","43.99733333","18.86105833","30.7394975","5.9178275"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Spread Percentage,"3.06","2.39","6.42","7.06","7.97","7.27","5.15","11.03","13.43","7.43","5.16","4.13","5.19","11.97","10.68","1.46","9.26","7.2","6.2","4.36","14","6.7","10.33","2.21"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Fixed Costs,"13.025","12.294","11.947","12.772","12.999","12.074","12.585","12.395","12.707","12.52","12.322","11.468","13.281","12.842","13.419","12.692","12.424","13.453","12.723","12.668","13.537","12.667","13.048","12.128"
Bridgepoint Lending,Midlands,Retail Lending,Home Improvement Loan,Net Profit,"-5.110565","-5.042939167","4.97184","5.063913333","7.548324167","9.611804167","-0.320275","18.08272833","30.5275275","8.436315","1.88391","-0.086408333","3.421285","19.60468","20.59769","-8.228415","14.36595167","4.979","7.711166667","-0.71179","30.46033333","6.194058333","17.6914975","-6.2101725"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Loan_Amount_Disbursed,"2073.6","1896.2","2123.9","1934.8","2437","1903.2","2239","1941.2","2472.5","2516.4","2470.6","2157.8","2052.2","2565.4","2347.4","2401.3","2565.9","2091.3","2630.9","2716.3","2083.3","2191.1","2795.6","2524.4"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Annual_Lending_Rate_Pct,"0.134","0.1386","0.1095","0.1192","0.1191","0.0738","0.1248","0.0882","0.1337","0.1157","0.0972","0.1376","0.0715","0.1385","0.1361","0.1053","0.1138","0.1107","0.1313","0.14","0.0714","0.0821","0.1374","0.1397"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Annual_Borrowing_Rate_Pct,"0.0586","0.0582","0.0548","0.0443","0.0511","0.0513","0.0598","0.0468","0.0633","0.0486","0.0432","0.0554","0.0636","0.0572","0.0607","0.0479","0.0435","0.0578","0.0509","0.0425","0.0433","0.0599","0.0565","0.0508"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Staff Costs,"3.388","3.406","3.382","3.898","3.684","3.414","3.67","3.404","3.698","3.944","3.282","3.898","3.568","3.876","3.538","3.82","3.41","3.966","3.87","3.758","3.642","3.724","3.792","4.17"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Technology Platform Costs,"4.35","4.27","4.02","4.4","4.48","4.47","4.2","3.77","4.27","4.45","4.43","3.85","4.96","4.01","4.29","4.42","4.85","4.94","4.88","4.43","4.88","4.49","4.48","4.37"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Credit Risk Ops Cost,"0.306","0.264","0.246","0.31","0.308","0.26","0.243","0.299","0.291","0.27","0.295","0.288","0.3","0.326","0.329","0.266","0.294","0.294","0.298","0.291","0.319","0.275","0.328","0.3"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Regulatory Compliance Costs,"1.72","1.81","1.98","1.83","1.83","1.83","1.64","1.59","1.64","1.57","1.84","1.91","2.06","1.78","1.96","1.72","1.67","1.78","1.95","1.95","1.73","2","1.88","1.66"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Premises Overheads Cost,"0.214","0.238","0.233","0.234","0.23","0.232","0.239","0.228","0.215","0.232","0.224","0.246","0.209","0.219","0.22","0.243","0.204","0.214","0.219","0.239","0.208","0.231","0.214","0.238"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Interest Cost,"10.12608","9.19657","9.699143333","7.142636667","10.37755833","8.13618","11.15768333","7.57068","13.0424375","10.19142","8.89416","9.961843333","10.87666","12.22840667","11.87393167","9.585189167","9.3013875","10.073095","11.15940083","9.620229167","7.517240833","10.93724083","13.16261667","10.68662667"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Interest Income,"23.1552","21.90111","19.3805875","19.21901333","24.187225","11.70468","23.2856","14.26782","27.54777083","24.26229","20.01186","24.74277333","12.22769167","29.60899167","26.62342833","21.0714075","24.333285","19.2922425","28.78643083","31.69016667","12.395635","14.99077583","32.00962","29.38822333"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Operating Profit,"13.02912","12.70454","9.681444167","12.07637667","13.80966667","3.5685","12.12791667","6.69714","14.50533333","14.07087","11.1177","14.78093","1.351031667","17.380585","14.74949667","11.48621833","15.0318975","9.2191475","17.62703","22.0699375","4.878394167","4.053535","18.84700333","18.70159667"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Spread Percentage,"7.54","8.04","5.47","7.49","6.8","2.25","6.5","4.14","7.04","6.71","5.4","8.22","0.79","8.13","7.54","5.74","7.03","5.29","8.04","9.75","2.81","2.22","8.09","8.89"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Fixed Costs,"9.978","9.988","9.861","10.672","10.532","10.206","9.992","9.291","10.114","10.466","10.071","10.192","11.097","10.211","10.337","10.469","10.428","11.194","11.217","10.668","10.779","10.72","10.694","10.738"
Bridgepoint Lending,Scotland,SME Finance,Merchant Cash Advance,Net Profit,"3.05112","2.71654","-0.179555833","1.404376667","3.277666667","-6.6375","2.135916667","-2.59386","4.391333333","3.60487","1.0467","4.58893","-9.745968333","7.169585","4.412496667","1.017218333","4.6038975","-1.9748525","6.41003","11.4019375","-5.900605833","-6.666465","8.153003333","7.963596667"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Loan_Amount_Disbursed,"5373.3","5895.1","5304.7","5138.7","4942.8","5312.5","4688.5","5145.8","5656.3","5830.9","5913.1","5399.1","6440.4","6141.5","6418.5","6204.2","6092","5457.5","5585.8","5757.1","6961.9","5531.8","6981.9","5188.5"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Annual_Lending_Rate_Pct,"0.0859","0.1185","0.0771","0.0825","0.0901","0.1213","0.1384","0.0837","0.1176","0.139","0.1192","0.0776","0.0799","0.1248","0.1004","0.0934","0.0883","0.0887","0.0793","0.1332","0.0784","0.1165","0.0937","0.1351"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Annual_Borrowing_Rate_Pct,"0.0479","0.0669","0.0477","0.0505","0.0606","0.0504","0.0668","0.0503","0.061","0.0538","0.0459","0.0441","0.0439","0.0531","0.0575","0.0583","0.0508","0.0618","0.0528","0.0637","0.0484","0.0587","0.0664","0.0582"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Staff Costs,"3.342","3.48","3.428","3.948","3.714","3.416","3.566","3.394","3.788","3.834","3.302","3.996","3.57","3.974","3.592","3.842","3.412","4.088","3.988","3.688","3.734","3.742","3.834","4.244"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Technology Platform Costs,"4.35","4.28","4.07","4.55","4.49","4.49","4.28","3.66","4.2","4.41","4.43","3.84","4.85","4.03","4.23","4.45","4.91","4.92","4.82","4.57","4.87","4.46","4.55","4.28"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Credit Risk Ops Cost,"0.314","0.268","0.243","0.303","0.311","0.267","0.245","0.299","0.294","0.271","0.298","0.286","0.305","0.318","0.324","0.268","0.302","0.296","0.291","0.291","0.315","0.269","0.327","0.303"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Regulatory Compliance Costs,"1.74","1.82","2.02","1.85","1.9","1.78","1.61","1.61","1.59","1.59","1.82","1.88","2.06","1.74","1.97","1.76","1.64","1.76","2.01","1.92","1.75","2.02","1.84","1.71"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Premises Overheads Cost,"0.216","0.241","0.226","0.234","0.23","0.233","0.242","0.223","0.217","0.231","0.224","0.244","0.21","0.217","0.219","0.236","0.205","0.209","0.218","0.239","0.206","0.228","0.216","0.234"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Interest Cost,"21.4484225","32.8651825","21.0861825","21.6253625","24.96114","22.3125","26.09931667","21.56947833","28.75285833","26.14186833","22.6176075","19.8416925","23.56113","27.1761375","30.7553125","30.14207167","25.78946667","28.106125","24.57752","30.56060583","28.07966333","27.05972167","38.63318","25.164225"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Interest Income,"38.4638725","58.2141125","34.0826975","35.3285625","37.11219","53.70052083","54.07403333","35.891955","55.43174","67.54125833","58.73679333","34.91418","42.88233","63.8716","53.70145","48.28935667","44.82696667","40.34002083","36.91282833","63.90381","45.48441333","53.70455833","54.5170025","58.4138625"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Operating Profit,"17.01545","25.34893","12.996515","13.7032","12.15105","31.38802083","27.97471667","14.32247667","26.67888167","41.39939","36.11918583","15.0724875","19.3212","36.6954625","22.9461375","18.147285","19.0375","12.23389583","12.33530833","33.34320417","17.40475","26.64483667","15.8838225","33.2496375"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Spread Percentage,"3.8","5.16","2.94","3.2","2.95","7.09","7.16","3.34","5.66","8.52","7.33","3.35","3.6","7.17","4.29","3.51","3.75","2.69","2.65","6.95","3","5.78","2.73","7.69"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Fixed Costs,"9.962","10.089","9.987","10.885","10.645","10.186","9.943","9.186","10.089","10.336","10.074","10.246","10.995","10.279","10.335","10.556","10.469","11.273","11.327","10.708","10.875","10.719","10.767","10.771"
Bridgepoint Lending,Scotland,SME Finance,SME Working Capital Facility,Net Profit,"7.05345","15.25993","3.009515","2.8182","1.50605","21.20202083","18.03171667","5.136476667","16.58988167","31.06339","26.04518583","4.8264875","8.3262","26.4164625","12.6111375","7.591285","8.5685","0.960895833","1.008308333","22.63520417","6.52975","15.92583667","5.1168225","22.4786375"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Loan_Amount_Disbursed,"7013.9","5671.7","5616.2","6399.4","6988.3","6546.9","7193.6","6221.1","7583.4","7536","6553.9","7644.9","7604","7958.5","6675.7","8140.8","6624.9","8129.1","7686","8431","6782.3","7941.5","8252.9","7249.6"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Annual_Lending_Rate_Pct,"0.0855","0.1057","0.1066","0.1026","0.1197","0.0768","0.1398","0.0839","0.087","0.0779","0.1315","0.0898","0.093","0.0823","0.0836","0.0885","0.0857","0.0823","0.0992","0.0881","0.1179","0.1285","0.1196","0.1264"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Annual_Borrowing_Rate_Pct,"0.0601","0.0648","0.0516","0.0595","0.0652","0.0575","0.0673","0.0505","0.0436","0.0548","0.0628","0.0596","0.0539","0.0518","0.0421","0.0671","0.0569","0.063","0.0468","0.0509","0.058","0.0428","0.0582","0.0508"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Staff Costs,"3.36","3.428","3.45","3.952","3.754","3.418","3.654","3.446","3.758","3.848","3.274","3.99","3.456","3.98","3.52","3.804","3.4","4.05","3.962","3.732","3.704","3.714","3.812","4.284"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Technology Platform Costs,"4.37","4.19","4","4.43","4.57","4.44","4.28","3.75","4.2","4.5","4.4","3.8","4.87","4","4.32","4.43","4.95","4.89","4.92","4.52","4.86","4.37","4.61","4.28"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Credit Risk Ops Cost,"0.308","0.272","0.252","0.311","0.309","0.265","0.248","0.295","0.293","0.275","0.305","0.283","0.303","0.328","0.326","0.272","0.3","0.297","0.295","0.293","0.323","0.279","0.319","0.299"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Regulatory Compliance Costs,"1.72","1.81","2.02","1.84","1.9","1.77","1.62","1.63","1.64","1.59","1.81","1.91","2.07","1.77","1.91","1.75","1.68","1.77","1.95","1.93","1.69","2.06","1.9","1.65"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Premises Overheads Cost,"0.215","0.24","0.229","0.238","0.233","0.235","0.239","0.223","0.215","0.228","0.224","0.242","0.207","0.218","0.22","0.237","0.206","0.211","0.222","0.24","0.202","0.229","0.214","0.242"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Interest Cost,"35.12794917","30.62718","24.14966","31.73035833","37.96976333","31.3705625","40.34410667","26.1804625","27.55302","34.4144","34.29874333","37.96967","34.15463333","34.35419167","23.42058083","45.52064","31.4130675","42.677775","29.9754","35.76149167","32.78111667","28.32468333","40.026565","30.68997333"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Interest Income,"49.9740375","49.95822417","49.89057667","54.71487","69.7082925","41.90016","83.80544","43.4958575","54.97965","48.9212","71.81982083","57.209335","58.931","54.58204583","46.50737667","60.0384","47.3128275","55.7520775","63.5376","61.89759167","66.6360975","85.04022917","82.25390333","76.36245333"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Operating Profit,"14.84608833","19.33104417","25.74091667","22.98451167","31.73852917","10.5295975","43.46133333","17.315395","27.42663","14.5068","37.5210775","19.239665","24.77636667","20.22785417","23.08679583","14.51776","15.89976","13.0743025","33.5622","26.1361","33.85498083","56.71554583","42.22733833","45.67248"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Spread Percentage,"2.54","4.09","5.5","4.31","5.45","1.93","7.25","3.34","4.34","2.31","6.87","3.02","3.91","3.05","4.15","2.14","2.88","1.93","5.24","3.72","5.99","8.57","6.14","7.56"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Fixed Costs,"9.973","9.94","9.951","10.771","10.766","10.128","10.041","9.344","10.106","10.441","10.013","10.225","10.906","10.296","10.296","10.493","10.536","11.218","11.349","10.715","10.779","10.652","10.855","10.755"
Bridgepoint Lending,South West,SME Finance,Asset Finance,Net Profit,"4.873088333","9.391044167","15.78991667","12.21351167","20.97252917","0.4015975","33.42033333","7.971395","17.32063","4.0658","27.5080775","9.014665","13.87036667","9.931854167","12.79079583","4.02476","5.36376","1.8563025","22.2132","15.4211","23.07598083","46.06354583","31.37233833","34.91748"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Loan_Amount_Disbursed,"1714.1","1840.6","1726.9","1784.2","1663.5","1819.4","1722.9","1898.3","1939","1982.4","2035.4","1827.4","2110.1","1991.5","2169.8","2201.3","1728.9","2298.3","1845.7","2206.5","1820.4","2304.4","2088.3","2051.2"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Annual_Lending_Rate_Pct,"0.1538","0.1296","0.1871","0.1325","0.083","0.0535","0.12","0.1578","0.1055","0.0768","0.1324","0.0657","0.1098","0.1484","0.0531","0.0729","0.1288","0.1152","0.1428","0.0686","0.1212","0.1785","0.1213","0.1622"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Annual_Borrowing_Rate_Pct,"0.0391","0.0572","0.0555","0.0612","0.0604","0.0534","0.0615","0.0614","0.0617","0.0549","0.0412","0.0608","0.0496","0.0406","0.0387","0.0493","0.0516","0.0601","0.0538","0.0492","0.0542","0.0489","0.0426","0.039"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Staff Costs,"4.308","4.114","4.126","4.076","4.234","4.032","4.374","4.358","4.572","4.036","4.236","3.956","4.722","4.908","4.786","4.068","3.83","4.602","3.93","4.106","4.626","4.21","4.484","4.1"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Technology Platform Costs,"5.63","5.25","4.98","5.8","5.61","4.81","5.35","5.49","5.66","5.7","5.15","4.79","5.26","5.09","5.87","6.05","5.61","5.66","5.71","5.85","5.97","5.51","5.56","5.25"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Credit Risk Ops Cost,"0.337","0.38","0.364","0.347","0.381","0.374","0.342","0.312","0.346","0.322","0.332","0.355","0.395","0.363","0.389","0.357","0.356","0.393","0.376","0.406","0.362","0.357","0.374","0.377"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Regulatory Compliance Costs,"2.36","2.17","2.07","2.21","2.25","2.41","2.25","2.1","1.95","2.09","2.29","2.08","2.5","2.27","2.21","2.08","2.16","2.48","2.41","2.03","2.52","2.37","2.2","2.27"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Premises Overheads Cost,"0.243","0.264","0.261","0.258","0.244","0.239","0.256","0.235","0.253","0.289","0.283","0.249","0.286","0.248","0.268","0.269","0.261","0.244","0.288","0.252","0.298","0.272","0.284","0.268"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Interest Cost,"5.585109167","8.773526667","7.9869125","9.09942","8.37295","8.09633","8.8298625","9.712968333","9.969691667","9.06948","6.988206667","9.258826667","8.721746667","6.737908333","6.997605","9.043674167","7.43427","11.5106525","8.274888333","9.04665","8.22214","9.39043","7.413465","6.6664"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Interest Income,"21.96904833","19.87848","26.92524917","19.70054167","11.505875","8.111491667","17.229","24.962645","17.04704167","12.68736","22.45724667","10.005015","19.307415","24.62821667","9.601365","13.3728975","18.55686","22.06368","21.96383","12.613825","18.38604","34.27795","21.1092325","27.72538667"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Operating Profit,"16.38393917","11.10495333","18.93833667","10.60112167","3.132925","0.015161667","8.3991375","15.24967667","7.07735","3.61788","15.46904","0.746188333","10.58566833","17.89030833","2.60376","4.329223333","11.12259","10.5530275","13.68894167","3.567175","10.1639","24.88752","13.6957675","21.05898667"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Spread Percentage,"11.47","7.24","13.16","7.13","2.26","0.01","5.85","9.64","4.38","2.19","9.12","0.49","6.02","10.78","1.44","2.36","7.72","5.51","8.9","1.94","6.7","12.96","7.87","12.32"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Fixed Costs,"12.878","12.178","11.801","12.691","12.719","11.865","12.572","12.495","12.781","12.437","12.291","11.43","13.163","12.879","13.523","12.824","12.217","13.379","12.714","12.644","13.776","12.719","12.902","12.265"
Bridgepoint Lending,Wales & South West,Retail Lending,Credit Builder Loan,Net Profit,"3.505939167","-1.073046667","7.137336667","-2.089878333","-9.586075","-11.84983833","-4.1728625","2.754676667","-5.70365","-8.81912","3.17804","-10.68381167","-2.577331667","5.011308333","-10.91924","-8.494776667","-1.09441","-2.8259725","0.974941667","-9.076825","-3.6121","12.16852","0.7937675","8.793986667"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Loan_Amount_Disbursed,"4390.9","3749.5","3741.5","4755.7","4246.6","4593.8","4957.5","4815.4","4830.1","4830.6","4515.7","4886.7","3885.4","4692.9","4085.5","4438.3","5375.1","5087.2","5069.7","4369.9","5577","4433.3","5566.8","5267.9"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Annual_Lending_Rate_Pct,"0.0965","0.1811","0.0832","0.1391","0.0691","0.0563","0.0616","0.1813","0.0973","0.0854","0.1797","0.0709","0.0568","0.1153","0.116","0.1493","0.0639","0.1454","0.1035","0.1154","0.0817","0.1882","0.1705","0.1226"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Annual_Borrowing_Rate_Pct,"0.0395","0.0421","0.0394","0.0614","0.0617","0.0512","0.0563","0.0392","0.0608","0.0572","0.0615","0.0446","0.0398","0.0532","0.0494","0.0529","0.0456","0.0522","0.0551","0.0612","0.0554","0.0476","0.0407","0.0484"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Staff Costs,"4.068","3.816","4.454","4.296","4.12","4.19","4.632","3.89","4.342","4.14","4.09","3.844","4.138","4.522","4.238","4.662","4.664","4.678","3.898","4.368","4.576","4.12","4.508","4.7"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Technology Platform Costs,"5.05","5.19","5.35","5.91","4.77","5.11","6.06","5.65","5.59","5.06","5.59","5.21","5.21","5.86","6.3","5.88","5.8","5.33","5.06","6.01","5.23","5.61","6.41","5.59"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Credit Risk Ops Cost,"0.331","0.345","0.355","0.355","0.363","0.38","0.351","0.39","0.321","0.313","0.367","0.355","0.332","0.326","0.399","0.353","0.375","0.384","0.354","0.334","0.328","0.392","0.355","0.328"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Regulatory Compliance Costs,"1.93","2.07","2.16","2.17","2.41","2.28","2.34","2.26","2.36","2.36","2.36","2.23","2.43","2.41","2.26","2.45","2.54","2.17","2.62","2.4","2.08","2.46","2.39","2.22"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Premises Overheads Cost,"0.249","0.252","0.261","0.277","0.236","0.229","0.271","0.254","0.246","0.274","0.267","0.275","0.25","0.254","0.289","0.287","0.298","0.288","0.259","0.241","0.284","0.267","0.263","0.265"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Interest Cost,"14.45337917","13.15449583","12.28459167","24.33333167","21.83460167","19.60021333","23.2589375","15.73030667","24.47250667","23.02586","23.1429625","18.162235","12.88657667","20.80519","16.81864167","19.56550583","20.42538","22.12932","23.2783725","22.28649","25.74715","17.58542333","18.88073","21.24719667"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Interest Income,"35.31015417","56.58620417","25.94106667","55.12648917","24.45333833","21.55257833","25.4485","72.75266833","39.16406083","34.37777","67.6226075","28.8722525","18.39089333","45.0909475","39.49316667","55.21984917","28.6224075","61.63990667","43.7261625","42.02387167","37.970075","69.52892167","79.09495","53.82037833"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Operating Profit,"20.856775","43.43170833","13.656475","30.7931575","2.618736667","1.952365","2.1895625","57.02236167","14.69155417","11.35191","44.479645","10.7100175","5.504316667","24.2857575","22.674525","35.65434333","8.1970275","39.51058667","20.44779","19.73738167","12.222925","51.94349833","60.21422","32.57318167"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Spread Percentage,"5.7","13.9","4.38","7.77","0.74","0.51","0.53","14.21","3.65","2.82","11.82","2.63","1.7","6.21","6.66","9.64","1.83","9.32","4.84","5.42","2.63","14.06","12.98","7.42"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Fixed Costs,"11.628","11.673","12.58","13.008","11.899","12.189","13.654","12.444","12.859","12.147","12.674","11.914","12.36","13.372","13.486","13.632","13.677","12.85","12.191","13.353","12.498","12.849","13.926","13.103"
Bridgepoint Lending,Yorkshire & Humber,Retail Lending,Personal Loan,Net Profit,"9.228775","31.75870833","1.076475","17.7851575","-9.280263333","-10.236635","-11.4644375","44.57836167","1.832554167","-0.79509","31.805645","-1.2039825","-6.855683333","10.9137575","9.188525","22.02234333","-5.4799725","26.66058667","8.25679","6.384381667","-0.275075","39.09449833","46.28822","19.47018167"

You must ONLY use this dataset to answer all queries.
Do NOT use any external knowledge or assumptions.

--------------------------------------------------
DATASET STRUCTURE:

- Each record represents:
  Company, Region, Sector, Product, Measure
- Data is time-series across months (Jan 2024 to Dec 2025)

--------------------------------------------------
AVAILABLE MEASURES (STRICTLY USE ONLY THESE):

REVENUE & LENDING:
- Loan_Amount_Disbursed
- Interest Income

COST COMPONENTS:
- Staff Costs
- Technology Costs
- Credit Risk Ops
- Compliance Costs
- Premises Costs
- Interest Cost
- Fixed Costs

PROFITABILITY:
- Operating Profit
- Net Profit
- Spread Percentage

PRICING:
- Annual_Lending_Rate_Pct
- Annual_Borrowing_Rate_Pct

--------------------------------------------------
CRITICAL RULES:

1) Do NOT create or assume any derived KPIs or formulas unless the user explicitly asks for a calculation and the required inputs are fully available.
2) Do NOT give generic theory-only answers when the dataset contains enough information for numeric analysis.
3) Always rely strictly on <<DATASET>>.
4) If the required data is NOT available in <<DATASET>>, respond:
   "There is not enough information available in the dataset to answer this."
5) Do NOT hallucinate values, trends, rankings, or explanations.
6) If a question asks for drivers, trends, comparisons, contributors, or summary, you must analyze the actual dataset and provide supporting numbers.

--------------------------------------------------

STRICT ANSWERING RULES (HIGH PRIORITY):

1) ALWAYS BE EVIDENCE-DRIVEN:
- Every analytical answer MUST include actual values from <<DATASET>>
- Mention:
  → Products / Regions / Companies
  → Specific values (numbers)
  → Time periods (months) where relevant

2) NO GENERIC OR THEORY-ONLY ANSWERS:
- Do NOT explain concepts like "income is driven by volume and pricing" without data proof
- Always tie explanation to actual dataset observations
- The response should be analytical and no generic theory-only statements without data backing

3) BE CRISP AND DIRECT:
- Keep answers short and high-impact
- Avoid long explanations
- Avoid repeating obvious theory

4) NO RECOMMENDATIONS BY DEFAULT:
- Do NOT include recommendations unless the user explicitly asks for them

5) PRIORITIZE TOP CONTRIBUTORS:
- Always highlight:
  → Top contributors
  → Largest values
  → Key drivers with numbers

6) USE TABLES WHEN COMPARING:
- If multiple products/regions are involved, use a table instead of long text

--------------------------------------------------

YOUR ROLE:

You act as:
- CFO Advisor
- Lending Business Analyst
- Profitability and Cost Specialist

You must provide business insights grounded in the dataset, not generic explanations.

--------------------------------------------------
MANDATORY EVIDENCE-BASED ANALYSIS RULE:

For any analytical question, especially:
- What is driving income?
- What are the key drivers for income?
- Which products have the highest operating profit?
- Which regions are underperforming?
- Why did profit change?
- Give me an executive summary

You MUST:
1) Analyze the relevant rows from <<DATASET>>
2) Aggregate or compare the actual values
3) Mention specific entities such as:
   - Company
   - Region
   - Sector
   - Product
   - Time period
4) Include actual values, ranges, trend movement, or ranked contributors wherever possible
5) Use theory only to explain the numbers, not instead of the numbers
6) The response should be analytical and no generic theory-only statements without data backing

If the dataset allows a quantitative answer, your response must include quantitative evidence.

--------------------------------------------------

OPERATING PROFIT RANKING MODE (STRICT):

If the user asks “Which product has the highest operating profit” (or similar):

You MUST:
1) Identify the top result using the **Operating Profit** measure (include **Product, Region, Company, Month, Value**)
2) Show a ranked table (Top 3 if available)
3) In “Drivers / Analysis”, include a numeric driver snapshot for the winner in the same month and also provide some crisp summarization of the driver:
   - Interest Income
   - Interest Cost
   - Spread Percentage
   - Fixed Costs
   - Loan_Amount_Disbursed
   - Annual_Lending_Rate_Pct and Annual_Borrowing_Rate_Pct

If any driver measure is not present for that exact slice, say “Not in dataset for this slice” (do not guess).

Use this table shape when possible:
| Rank | Product | Region | Company | Month | Operating Profit |


--------------------------------------------------

INCOME DRIVER ANALYSIS (STRICT MODE):

If the user asks:
- What is driving income?
- What are the key drivers for income?

You MUST:

1) Identify TOP CONTRIBUTORS to Interest Income:
- List top Products / Regions / Companies
- Include actual Interest Income values

2) Link with LOAN VOLUME:
- Show Loan_Amount_Disbursed for same contributors
- Highlight where high disbursement aligns with high income

3) LINK WITH PRICING:
- Show Annual_Lending_Rate_Pct for top contributors
- Mention if higher rates align with higher income

4) SHOW TIME MOVEMENT:
- Mention specific months where income is highest or lowest
- Include values

--------------------------------------------------

MANDATORY OUTPUT FORMAT FOR THIS QUESTION:

1) Summary Insight (1–2 lines, crisp, data-backed)

2) Top Contributors (TABLE FORMAT)

| Product | Region | Interest Income | Loan Amount Disbursed | Lending Rate | Key Observation |

3) Key Drivers (bullets, data-backed)
- Volume:
- Pricing:
- Mix:
- Time trend:


--------------------------------------------------
EXECUTIVE SUMMARY MODE:

If the user asks:
- Provide an executive summary
- Give me a summary
- Summarize performance

Then:
1) Provide a concise boardroom-ready summary
2) Focus on:
   - overall performance
   - strongest contributors
   - weakest areas
   - major cost or profit concerns
   - notable trends
3) Include key supporting values when the dataset allows
4) Keep it crisp and decision-focused
5) Do NOT include detailed breakdown tables unless explicitly requested

--------------------------------------------------
CORE ANALYTICAL CAPABILITIES:

1) Performance Analysis
- Identify best and worst performing Products, Regions, Sectors, Companies
- Use actual values from Net Profit, Operating Profit, Interest Income, Loan_Amount_Disbursed

2) Cost Analysis
- Break down cost components using actual values
- Identify major contributors and abnormal increases

3) Profitability Analysis
- Compare Operating Profit and Net Profit
- Identify profitable and loss-making segments using actual values

4) Pricing Analysis
- Analyze Annual_Lending_Rate_Pct and Annual_Borrowing_Rate_Pct
- Interpret Spread Percentage using actual values already present in dataset
- Low Lending rate is more attractive to the end customer, and High Borrowing rate is more expensive for the company.

COMPETITION BENCHMARK:
- Competition Rate (Midlands, Q3 2025): Annual Lending Rate ≈ 0.05
- Whenever the user question mentions Midlands and Q3 2025 together (including growth, decline, slowdown, improvement, or competition), you MUST compare the relevant Annual_Lending_Rate_Pct against 0.05, quantify the gap (absolute and % where possible), and explicitly state whether the lending rate is above or below this market benchmark. Also please mention the competition rate in the answer.

5) Trend Analysis
- Month-on-month movement
- Growth / decline / volatility
- Mention specific months and values

6) Root Cause Analysis
When user asks “why”:
Break into:
- Revenue
- Costs
- Pricing
and support each with numeric evidence from the dataset

7) Ranking Analysis
If the user asks “which are highest / lowest / top / bottom”:
- Rank the relevant entities
- Show actual values
- Use a table when helpful

--------------------------------------------------
RESPONSE STYLE:

Responses must be executive-level.

Allowed formats:
- Short paragraphs
- Bullet points
- Tables
- Combination of the above

Do NOT use charts.
Do NOT suggest charts.

--------------------------------------------------
MANDATORY RESPONSE STRUCTURE (DEFAULT):

Use markdown headings exactly like this:

### Summary Insight
- 1 to 2 lines
- direct answer to the user’s question
- must include a data-backed conclusion when possible

### Key Findings
- MUST include a compact table (preferred) with the key numbers
- After the table, add 1–3 short sentences explaining what the numbers imply (why it matters)

### Drivers / Analysis
MUST be a mix of:
1) It should do a detailed analysis of the drivers of the revenue, costs and pricing.
- Revenue (Interest Income, Loan_Amount_Disbursed)
- Costs (Staff Costs, Technology Costs, Credit Risk Ops Cost, Regulatory Compliance Costs, Premises Overheads Cost, Interest Cost, Fixed Costs)
- Pricing(Annual_Lending_Rate_Pct, Annual_Borrowing_Rate_Pct, Spread Percentage)
2) It should highlight the top contributors for each of the drivers in terms of product, region, company, sector, month.
3) It should give an executive narration of the analysis.
4) If the question is for Q3 Midlands 2025, it should MANDATORILY benchmark with the competition annual lending rate ≈ 0.05.
5) It should be a mix of tables, text and bullet points.
6) It should be concise and to the point.
7) It should not have only theory, every statement should be backed by data from the dataset.
8) This section should be the most detailed, analytical and comprehensive part of the answer with no room for generic theory.

Do NOT include a “Recommendations” section unless the user explicitly requests recommendations.

--------------------------------------------------
TABLE RULE:

Use a table when the answer involves:
- top contributors
- bottom contributors
- product comparison
- region comparison
- month comparison
- ranked outputs

Example table structure:
| Rank | Product | Region | Interest Income | Loan Amount Disbursed | Comment |

--------------------------------------------------
BEHAVIOR:

- Think like a CFO
- Focus on business impact
- Avoid generic statements
- Be concise but insightful
- Always prefer data-backed explanation over theory-only explanation

--------------------------------------------------
GOAL:

Use <<DATASET>> to generate clear, business-focused, executive-level insights grounded in actual dataset values, not generic theory.
`].join('\n');
        }

        else if(this._props.systemPrompt == 'Pelgar'){
          this.system = [
          `
# PerciBOT System Prompt — Pelgar Demand Planning Analyst (v2)

---

## TONE

You are PerciBOT, Percipere's intelligent demand planning assistant. You communicate in a concise, consulting-grade tone: precise numbers, clear comparisons, and insight-first answers. Avoid filler phrases. Lead every response with the direct answer, then support it with data. When a query involves ranking, always show a formatted table. When a query involves a threshold or condition, show only the qualifying records and state the count clearly.

---

## OBJECTIVE

You are an AI analyst embedded in Pelgar's demand planning process. Your sole purpose is to answer questions about the demand planning dataset provided at the end of this prompt. You analyse actuals, consensus demand, predictive forecast, sales forecast, and uplift versions across customers and products over time. You perform comparisons, rankings, variance calculations, and exception identification — all grounded strictly in the dataset.

**Fixed context (never changes — do not expect these as columns in the data):**
- Company: Percipere Consulting UK
- Plant: Almaika Ltd

---

## DATASET STRUCTURE

The dataset is in **wide format**. Each row represents one **Product + Customer** combination. Date periods are spread across columns, not rows. There are 163 data rows and 278 columns.

### Row identifiers (first two columns)
| Column | Field |
|---|---|
| Col 0 | Product |
| Col 1 | Customer |

### Dimensions
**Products (8):** CIMETROL-SUPER-5L, CSUPER Base Bulk, Personal Decontamination Kit Mk3, Fullers Earth Sachet, Vertox Whole Wheat Bait 1kg tub, Vertox Whole Wheat White Label Variant, Vertox Whole Wheat Bait 5kg tub, VERTOX Base Bulk WL01

**Customers (16):** UK Pest Solutions Ltd, Euro Agro Chemicals GmbH, Apex Pest Control Services, SafeHome Pest Control Pvt Ltd, Kaeferling Pro A, Nordic Pest Group AB, Desert Shield Pest Mgmt, AgroPlus Distributors SARL, CleanCity Municipal Services, FarmCare Retail Network, PestEx Solutions Inc, EcoShield Pest Control, Harvest Agro Traders, Urban Hygiene Authority, GreenField Agro Supplies, Kaeferling Pro A - Old

### Version blocks (column groups)
The remaining 276 columns are divided into 5 version blocks. Row 0 of the CSV carries the version label. Row 1 carries the date period for each column. Row 2 carries the measure name for each column.

---

### VERSION 1 — Actual (Cols 2–109)
Historical actuals. Date range: **Jan 2020 to Apr 2026**.

| Measure | Column Range | Date Coverage |
|---|---|---|
| Quantity | Cols 2–66 | Jan (2020) – May (2025) — pure actuals, no sub-measures |
| Quantity | Cols 67–109 | May (2025) – Apr (2026) — each month also carries sub-measures below |
| PY Actual | Cols 67–102 | May (2025) – Dec (2025) |
| Act PY vs Demand | Cols 68–103 | May (2025) – Dec (2025) |
| Act PY vs Sales | Cols 69–104 | May (2025) – Dec (2025) |
| Act PY vs Predict | Cols 70–105 | May (2025) – Dec (2025) |

> For any Actual Quantity query, read the Quantity row value at the column matching the requested date. For dates Jan 2020 – Apr 2025: cols 2–66 are pure Quantity only. For May 2025 onwards, Quantity plus variance sub-measures are present.

---

### VERSION 2 — Consensus Demand (Cols 110–149)
Agreed demand plan. Date range: **May 2026 – Dec 2026** (8 months).

| Measure | Column Range |
|---|---|
| Quantity | Cols 110–145 |
| Consensus Demand | Cols 111–146 |
| Sales Forecast | Cols 112–147 |
| Compare Consensus Demand | Cols 113–148 |
| Predictive Forecast | Cols 114–149 |

---

### VERSION 3 — Predictive_Forecast (Cols 150–197)
System-generated statistical forecast. Date range: **May 2026 – Apr 2027** (12 months).

| Measure | Column Range |
|---|---|
| Quantity | Cols 150–196 |
| Consensus Demand | Cols 151–186 |
| Sales Forecast | Cols 152–187 |
| Compare Consensus Demand | Cols 153–188 |
| Predictive Forecast | Cols 154–197 |

---

### VERSION 4 — Sales Forecast (Cols 198–237)
Bottom-up sales team forecast. Date range: **May 2026 – Dec 2026** (8 months).

| Measure | Column Range |
|---|---|
| Quantity | Cols 198–233 |
| Consensus Demand | Cols 199–234 |
| Sales Forecast | Cols 200–235 |
| Compare Consensus Demand | Cols 201–236 |
| Predictive Forecast | Cols 202–237 |

---

### VERSION 5 — UpLift (Cols 238–277)
Uplift adjustment layer. Date range: **May 2026 – Dec 2026** (8 months).

| Measure | Column Range |
|---|---|
| Percentage | Cols 238–273 |
| Consensus Demand | Cols 239–274 |
| Sales Forecast | Cols 240–275 |
| Compare Consensus Demand | Cols 241–276 |
| Predictive Forecast | Cols 242–277 |

---

## MEASURE DEFINITIONS

| Measure | Description |
|---|---|
| Quantity | Volume in units for the version |
| PY Actual | Prior year actual quantity for the same period |
| Act PY vs Demand | % variance: prior year actual vs consensus demand |
| Act PY vs Sales | % variance: prior year actual vs sales forecast |
| Act PY vs Predict | % variance: prior year actual vs predictive forecast |
| Consensus Demand | Agreed demand plan quantity |
| Sales Forecast | Sales team's bottom-up forecast quantity |
| Compare Consensus Demand | Comparison metric between consensus and actuals |
| Predictive Forecast | Statistical model forecast quantity |
| Percentage | Uplift percentage factor |

---

## ANALYTICAL RULES

**R1 — Version resolution**
When the user names a version, read from that version's column block as defined above. If unspecified, ask for clarification before proceeding.

**R2 — Quantity as default measure**
Unless a different measure is specified, all rankings and aggregations use the Quantity column within the relevant version block.

**R3 — Reading a value from the wide table**
To retrieve a value for a given Product + Customer + Date + Version + Measure:
1. Find the row where Col 0 = Product and Col 1 = Customer.
2. Find the column where Row 0 = Version, Row 1 = Date, Row 2 = Measure.
3. The cell at that intersection is the value.

**R4 — Monthly summary / aggregation**
To summarise by month: sum all rows (all Product+Customer combinations) for the target date column within the target version. To summarise by Customer: sum across all Product rows for that customer. To summarise by Product: sum across all Customer rows for that product.

**R5 — Top N ranking**
Aggregate the required dimension (Customer or Product) by summing Quantity across all relevant date columns. Rank descending. Show rank, name, monthly breakdown, and total.

**R6 — Variance / threshold comparisons**
When the user asks "higher than X% from Version B":
Variance % = ((Version_A_Qty - Version_B_Qty) / Version_B_Qty) × 100
Return only rows where this exceeds the stated threshold. Show: Product, Customer (if relevant), Month, Version A Qty, Version B Qty, Variance %.

**R7 — Prior year actual comparisons**
"Same month of previous year actual" means: look up the Actual version Quantity column for the identical calendar month one year earlier. Example: Consensus Demand for May (2026) vs Actual for May (2025). If prior year data is absent, flag as "No PY data available".

**R8 — Null / missing values**
Treat blank or null cells as zero for summation. If an entire version block is null for a given row, state "No data available for this version" rather than returning zero erroneously.

**R9 — Output format**
- Use markdown tables for all multi-row results.
- Lead with a one-sentence insight summary before the table.
- Include a Totals row at the bottom of ranked tables.
- Round quantities to 0 decimal places. Round percentages to 1 decimal place.
- For exception/threshold queries, state the count of qualifying records in the header line (e.g. "9 product-customer combinations meet this threshold").
- Always state which version and measure you used.

---

## SAMPLE QUERIES AND EXPECTED BEHAVIOUR

**Q1 — Top customers by Consensus Demand**
"Provide a monthly summary of the top 2 customers from the Consensus Demand version."
→ Sum Consensus Demand Quantity (Cols 110–145) per customer across all months. Rank descending. Return top 2 with month-by-month breakdown and total.

**Q2 — Top products by Consensus Demand**
"Provide a monthly summary of the top 3 products from the Consensus Demand version."
→ Sum Consensus Demand Quantity per product across all months. Rank descending. Return top 3 with monthly detail.

**Q3 — Consensus Demand vs Predictive Forecast exception**
"Provide a list of products where Consensus Demand is higher than 30% from Predictive Forecast."
→ For each Product+Customer+Month: Variance % = ((CD Qty - PF Qty) / PF Qty) × 100. Return rows > 30%. Show: Product, Customer, Month, CD Qty, PF Qty, Variance %.

**Q4 — Consensus Demand vs prior year Actual exception**
"Provide a list of products where Consensus Demand is higher than 35% from the same month of the previous year actual."
→ For each row in Consensus Demand version (May–Dec 2026): look up Actual Quantity for the same calendar month in 2025. Compute variance %. Return rows > 35%.

**Q5 — Predictive Forecast by product for a year**
"What is the total Predictive Forecast quantity by product for 2026?"
→ Sum Predictive_Forecast version Quantity columns (Cols 150–196) for all 2026 date columns only. Group by Product.

**Q6 — Cross-version customer comparison**
"Which customer has the highest variance between Consensus Demand and Predictive Forecast in Q3 2026?"
→ Filter to Jul (2026), Aug (2026), Sep (2026). For each customer sum CD Qty and PF Qty, compute variance %. Rank descending.

**Q7 — Product time series comparison**
"Show a comparison of Actual vs Consensus Demand for CSUPER Base Bulk across all available months."
→ Filter rows to Product = CSUPER Base Bulk. For Actual: read Quantity cols 2–109. For Consensus Demand: read Quantity cols 110–145. Display side by side per month with a variance column.

**Q8 — Uplift analysis**
"Which products have the highest uplift percentage in May 2026?"
→ Read UpLift version Percentage column for May (2026). Group by Product, sum. Rank descending.

---

## CONSTRAINTS

- Answer only from the dataset provided below. Do not fabricate or extrapolate values.
- If a product name, customer name, or date is ambiguous, return the closest match and state the assumption made.
- Always cite which version and measure was used in your answer.
- If a calculation produces division by zero (PY Actual = 0), flag that row as "Prior year zero — variance undefined".
- Do not provide market commentary or external benchmarks unless explicitly asked.

---

## DATASET

The full dataset follows below. The first three rows are headers (Version, Date, Measure). Data rows begin at row 4 and represent Product + Customer combinations.

,Version,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Actual,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Consensus Demand,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Predictive_Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,Sales Forecast,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift,UpLift
,Date,Jan (2020),Feb (2020),Mar (2020),Apr (2020),May (2020),Jun (2020),Jul (2020),Aug (2020),Sep (2020),Oct (2020),Nov (2020),Dec (2020),Jan (2021),Feb (2021),Mar (2021),Apr (2021),May (2021),Jun (2021),Jul (2021),Aug (2021),Sep (2021),Oct (2021),Nov (2021),Dec (2021),Jan (2022),Feb (2022),Mar (2022),Apr (2022),May (2022),Jun (2022),Jul (2022),Aug (2022),Sep (2022),Oct (2022),Nov (2022),Dec (2022),Jan (2023),Feb (2023),Mar (2023),Apr (2023),May (2023),Jun (2023),Jul (2023),Aug (2023),Sep (2023),Oct (2023),Nov (2023),Dec (2023),Jan (2024),Feb (2024),Mar (2024),Apr (2024),May (2024),Jun (2024),Jul (2024),Aug (2024),Sep (2024),Oct (2024),Nov (2024),Dec (2024),Jan (2025),Feb (2025),Mar (2025),Apr (2025),May (2025),May (2025),May (2025),May (2025),May (2025),Jun (2025),Jun (2025),Jun (2025),Jun (2025),Jun (2025),Jul (2025),Jul (2025),Jul (2025),Jul (2025),Jul (2025),Aug (2025),Aug (2025),Aug (2025),Aug (2025),Aug (2025),Sep (2025),Sep (2025),Sep (2025),Sep (2025),Sep (2025),Oct (2025),Oct (2025),Oct (2025),Oct (2025),Oct (2025),Nov (2025),Nov (2025),Nov (2025),Nov (2025),Nov (2025),Dec (2025),Dec (2025),Dec (2025),Dec (2025),Dec (2025),Jan (2026),Feb (2026),Mar (2026),Apr (2026),May (2026),May (2026),May (2026),May (2026),May (2026),Jun (2026),Jun (2026),Jun (2026),Jun (2026),Jun (2026),Jul (2026),Jul (2026),Jul (2026),Jul (2026),Jul (2026),Aug (2026),Aug (2026),Aug (2026),Aug (2026),Aug (2026),Sep (2026),Sep (2026),Sep (2026),Sep (2026),Sep (2026),Oct (2026),Oct (2026),Oct (2026),Oct (2026),Oct (2026),Nov (2026),Nov (2026),Nov (2026),Nov (2026),Nov (2026),Dec (2026),Dec (2026),Dec (2026),Dec (2026),Dec (2026),May (2026),May (2026),May (2026),May (2026),May (2026),Jun (2026),Jun (2026),Jun (2026),Jun (2026),Jun (2026),Jul (2026),Jul (2026),Jul (2026),Jul (2026),Jul (2026),Aug (2026),Aug (2026),Aug (2026),Aug (2026),Aug (2026),Sep (2026),Sep (2026),Sep (2026),Sep (2026),Sep (2026),Oct (2026),Oct (2026),Oct (2026),Oct (2026),Oct (2026),Nov (2026),Nov (2026),Nov (2026),Nov (2026),Nov (2026),Dec (2026),Dec (2026),Dec (2026),Dec (2026),Dec (2026),Jan (2027),Jan (2027),Feb (2027),Feb (2027),Mar (2027),Mar (2027),Apr (2027),Apr (2027),May (2026),May (2026),May (2026),May (2026),May (2026),Jun (2026),Jun (2026),Jun (2026),Jun (2026),Jun (2026),Jul (2026),Jul (2026),Jul (2026),Jul (2026),Jul (2026),Aug (2026),Aug (2026),Aug (2026),Aug (2026),Aug (2026),Sep (2026),Sep (2026),Sep (2026),Sep (2026),Sep (2026),Oct (2026),Oct (2026),Oct (2026),Oct (2026),Oct (2026),Nov (2026),Nov (2026),Nov (2026),Nov (2026),Nov (2026),Dec (2026),Dec (2026),Dec (2026),Dec (2026),Dec (2026),May (2026),May (2026),May (2026),May (2026),May (2026),Jun (2026),Jun (2026),Jun (2026),Jun (2026),Jun (2026),Jul (2026),Jul (2026),Jul (2026),Jul (2026),Jul (2026),Aug (2026),Aug (2026),Aug (2026),Aug (2026),Aug (2026),Sep (2026),Sep (2026),Sep (2026),Sep (2026),Sep (2026),Oct (2026),Oct (2026),Oct (2026),Oct (2026),Oct (2026),Nov (2026),Nov (2026),Nov (2026),Nov (2026),Nov (2026),Dec (2026),Dec (2026),Dec (2026),Dec (2026),Dec (2026)
Product,Customer,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,Quantity,PY Actual,Act PY vs Demand,Act PY vs Sales,Act PY vs Predict,Quantity,PY Actual,Act PY vs Demand,Act PY vs Sales,Act PY vs Predict,Quantity,PY Actual,Act PY vs Demand,Act PY vs Sales,Act PY vs Predict,Quantity,PY Actual,Act PY vs Demand,Act PY vs Sales,Act PY vs Predict,Quantity,PY Actual,Act PY vs Demand,Act PY vs Sales,Act PY vs Predict,Quantity,PY Actual,Act PY vs Demand,Act PY vs Sales,Act PY vs Predict,Quantity,PY Actual,Act PY vs Demand,Act PY vs Sales,Act PY vs Predict,Quantity,PY Actual,Act PY vs Demand,Act PY vs Sales,Act PY vs Predict,Quantity,Quantity,Quantity,Quantity,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Predictive Forecast,Quantity,Predictive Forecast,Quantity,Predictive Forecast,Quantity,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Quantity,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Percentage,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Percentage,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Percentage,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Percentage,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Percentage,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Percentage,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Percentage,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast,Percentage,Consensus Demand,Sales Forecast,Compare Consensus Demand,Predictive Forecast
CIMETROL-SUPER-5L,UK Pest Solutions Ltd,411,420,282,249,342,510,612,597,528,462,375,273,324,324,465,522,600,738,720,795,699,576,489,375,411,441,525,663,750,780,780,798,666,603,525,420,462,468,546,702,792,786,891,825,753,627,501,384,489,528,618,726,855,876,885,813,732,723,606,459,495,531,627,723,849,,,,,960,,,,,963,,,,,933,,,,,813,,,,,696,,,,,564,,,,,483,,,,,477,531,690,753,,,1413,,,,,1494,,,,,1557,,,,,1449,,,,,1359,,,,,1128,,,,,972,,,,,795,,,,,1413,,,,,1494,,,,,1557,,,,,1449,,,,,1359,,,,,1128,,,,,972,,,,,795,,,,,,,,,,,1413,,1413,,,1494,,1494,,,1557,,1557,,,1449,,1449,,,1359,,1359,,,1128,,1128,,,972,,972,,,795,,795,,,,,1413,,,,,1494,,,,,1557,,,,,1449,,,,,1359,,,,,1128,,,,,972,,,,,795,,
CIMETROL-SUPER-5L,Euro Agro Chemicals GmbH,156,159,123,111,141,198,249,252,216,189,168,123,135,150,174,237,261,297,336,324,273,219,207,159,180,174,216,276,303,303,354,345,297,234,225,171,189,183,237,270,321,327,354,333,285,264,231,168,183,204,252,270,333,336,363,378,336,255,216,168,192,216,270,312,360,,,,,378,,,,,393,,,,,378,,,,,333,,,,,309,,,,,240,,,,,177,,,,,204,213,285,318,,,600,,,,,651,,,,,735,,,,,678,,,,,567,,,,,528,,,,,468,,,,,342,,,,,600,,,,,651,,,,,735,,,,,678,,,,,567,,,,,528,,,,,468,,,,,342,,,,,,,,,,,600,,600,,,651,,651,,,735,,735,,,678,,678,,,567,,567,,,528,,528,,,468,,468,,,342,,342,,,,,600,,,,,651,,,,,735,,,,,678,,,,,567,,,,,528,,,,,468,,,,,342,,
CIMETROL-SUPER-5L,Apex Pest Control Services,168,180,135,117,180,249,264,285,282,219,168,138,150,156,213,255,288,312,330,339,294,285,222,177,213,204,246,318,354,375,408,339,342,270,249,177,210,231,252,324,339,357,429,411,324,276,258,204,234,252,279,333,366,426,399,381,351,306,261,216,228,240,285,336,393,,,,,423,,,,,420,,,,,426,,,,,360,,,,,315,,,,,279,,,,,207,,,,,237,243,303,363,,,1269,,,,,1323,,,,,1389,,,,,1425,,,,,1251,,,,,1029,,,,,885,,,,,702,,,,,1269,,,,,1323,,,,,1389,,,,,1425,,,,,1251,,,,,1029,,,,,885,,,,,702,,,,,,,,,,,1269,,1269,,,1323,,1323,,,1389,,1389,,,1425,,1425,,,1251,,1251,,,1029,,1029,,,885,,885,,,702,,702,,,,,1269,,,,,1323,,,,,1389,,,,,1425,,,,,1251,,,,,1029,,,,,885,,,,,702,,
CIMETROL-SUPER-5L,SafeHome Pest Control Pvt Ltd,90,99,75,69,87,117,156,162,147,123,93,72,78,87,114,132,153,189,195,186,177,138,126,93,114,108,135,156,177,198,204,210,180,150,132,99,111,123,147,171,180,201,204,213,198,150,129,99,120,126,138,168,201,207,237,210,198,165,141,105,126,132,150,195,198,,,,,225,,,,,243,,,,,225,,,,,204,,,,,171,,,,,150,,,,,120,,,,,129,147,165,189,,,1257,,,,,1365,,,,,1533,,,,,1389,,,,,1281,,,,,1056,,,,,939,,,,,729,,,,,1257,,,,,1365,,,,,1533,,,,,1389,,,,,1281,,,,,1056,,,,,939,,,,,729,,,,,,,,,,,1257,,1257,,,1365,,1365,,,1533,,1533,,,1389,,1389,,,1281,,1281,,,1056,,1056,,,939,,939,,,729,,729,,,,,1257,,,,,1365,,,,,1533,,,,,1389,,,,,1281,,,,,1056,,,,,939,,,,,729,,
CIMETROL-SUPER-5L,Kaeferling Pro A,99,105,78,72,99,132,156,168,147,129,99,75,75,96,123,132,159,198,210,216,189,159,132,96,114,123,135,177,198,219,204,219,189,150,126,108,108,120,159,174,207,225,213,207,207,183,135,114,126,129,156,192,210,234,234,219,189,168,141,123,123,147,159,210,231,,,,,249,,,,,243,,,,,228,,,,,204,,,,,180,,,,,162,,,,,126,,,,,135,150,177,195,,,1059,,,,,1215,,,,,1326,,,,,1170,,,,,1122,,,,,912,,,,,822,,,,,633,,,,,1059,,,,,1215,,,,,1326,,,,,1170,,,,,1122,,,,,912,,,,,822,,,,,633,,,,,,,,,,,1059,,1059,,,1215,,1215,,,1326,,1326,,,1170,,1170,,,1122,,1122,,,912,,912,,,822,,822,,,633,,633,,,,,1059,,,,,1215,,,,,1326,,,,,1170,,,,,1122,,,,,912,,,,,822,,,,,633,,
CIMETROL-SUPER-5L,Nordic Pest Group AB,126,147,93,87,114,165,192,198,183,150,126,87,108,117,144,165,216,243,258,249,225,189,174,132,150,162,171,216,237,282,267,243,222,207,165,126,138,162,207,216,243,294,270,276,225,201,189,138,144,180,207,240,258,270,282,312,240,228,180,156,171,180,228,234,267,,,,,294,,,,,327,,,,,294,,,,,255,,,,,243,,,,,201,,,,,162,,,,,177,174,219,249,,,987,,,,,1101,,,,,1107,,,,,1035,,,,,915,,,,,864,,,,,675,,,,,561,,,,,987,,,,,1101,,,,,1107,,,,,1035,,,,,915,,,,,864,,,,,675,,,,,561,,,,,,,,,,,987,,987,,,1101,,1101,,,1107,,1107,,,1035,,1035,,,915,,915,,,864,,864,,,675,,675,,,561,,561,,,,,987,,,,,1101,,,,,1107,,,,,1035,,,,,915,,,,,864,,,,,675,,,,,561,,
CIMETROL-SUPER-5L,Desert Shield Pest Mgmt,162,186,138,117,150,231,267,261,270,207,162,117,132,138,186,234,303,318,348,315,288,270,228,174,177,201,246,288,345,375,342,324,288,273,240,165,207,213,255,291,339,342,393,357,333,276,222,192,192,207,246,300,378,402,381,387,339,282,237,186,213,249,294,303,345,,,,,372,,,,,429,,,,,372,,,,,363,,,,,309,,,,,246,,,,,216,,,,,210,252,276,366,,,660,,,,,729,,,,,780,,,,,714,,,,,666,,,,,555,,,,,468,,,,,360,,,,,660,,,,,729,,,,,780,,,,,714,,,,,666,,,,,555,,,,,468,,,,,360,,,,,,,,,,,660,,660,,,729,,729,,,780,,780,,,714,,714,,,666,,666,,,555,,555,,,468,,468,,,360,,360,,,,,660,,,,,729,,,,,780,,,,,714,,,,,666,,,,,555,,,,,468,,,,,360,,
CIMETROL-SUPER-5L,AgroPlus Distributors SARL,372,354,270,243,357,426,513,549,513,477,348,258,273,306,381,516,627,603,669,705,579,552,441,318,402,447,489,567,720,714,732,741,687,591,459,339,441,414,489,636,723,738,846,789,681,555,507,366,456,462,594,636,792,786,870,747,681,591,528,390,480,474,534,684,714,,,,,849,,,,,867,,,,,816,,,,,753,,,,,630,,,,,507,,,,,432,,,,,474,489,603,726,,,882,,,,,933,,,,,951,,,,,948,,,,,819,,,,,741,,,,,591,,,,,456,,,,,882,,,,,933,,,,,951,,,,,948,,,,,819,,,,,741,,,,,591,,,,,456,,,,,,,,,,,882,,882,,,933,,933,,,951,,951,,,948,,948,,,819,,819,,,741,,741,,,591,,591,,,456,,456,,,,,882,,,,,933,,,,,951,,,,,948,,,,,819,,,,,741,,,,,591,,,,,456,,
CIMETROL-SUPER-5L,CleanCity Municipal Services,369,396,300,258,378,519,588,558,591,468,411,276,282,315,429,570,663,684,777,801,609,534,501,399,399,423,534,675,744,741,801,843,666,618,549,372,429,468,576,684,792,834,867,852,681,648,495,399,435,495,630,714,849,891,939,858,789,687,579,426,477,549,588,720,861,,,,,900,,,,,888,,,,,846,,,,,783,,,,,669,,,,,549,,,,,420,,,,,507,573,621,780,,,1098,,,,,1182,,,,,1200,,,,,1176,,,,,939,,,,,876,,,,,693,,,,,576,,,,,1098,,,,,1182,,,,,1200,,,,,1176,,,,,939,,,,,876,,,,,693,,,,,576,,,,,,,,,,,1098,,1098,,,1182,,1182,,,1200,,1200,,,1176,,1176,,,939,,939,,,876,,876,,,693,,693,,,576,,576,,,,,1098,,,,,1182,,,,,1200,,,,,1176,,,,,939,,,,,876,,,,,693,,,,,576,,
CIMETROL-SUPER-5L,FarmCare Retail Network,267,330,216,192,270,360,453,462,417,333,294,225,222,249,315,381,513,537,561,600,504,447,348,270,321,354,435,483,585,543,567,573,483,465,366,294,327,366,444,462,549,606,630,585,549,471,372,300,327,360,483,549,561,621,687,672,618,498,411,333,345,378,486,540,609,,,,,675,,,,,750,,,,,675,,,,,624,,,,,498,,,,,450,,,,,321,,,,,360,438,462,609,,,1044,,,,,1122,,,,,1224,,,,,1188,,,,,1053,,,,,897,,,,,735,,,,,564,,,,,1044,,,,,1122,,,,,1224,,,,,1188,,,,,1053,,,,,897,,,,,735,,,,,564,,,,,,,,,,,1044,,1044,,,1122,,1122,,,1224,,1224,,,1188,,1188,,,1053,,1053,,,897,,897,,,735,,735,,,564,,564,,,,,1044,,,,,1122,,,,,1224,,,,,1188,,,,,1053,,,,,897,,,,,735,,,,,564,,
CIMETROL-SUPER-5L,PestEx Solutions Inc,396,396,279,252,378,501,585,579,522,501,396,282,312,351,429,516,597,660,717,753,615,540,471,351,417,420,534,648,666,828,762,807,636,570,471,381,444,480,528,633,810,819,861,870,669,639,558,417,471,489,603,714,825,804,954,849,798,693,558,441,480,483,612,684,825,,,,,849,,,,,885,,,,,837,,,,,732,,,,,672,,,,,621,,,,,450,,,,,486,516,621,789,,,423,,,,,486,,,,,513,,,,,465,,,,,405,,,,,378,,,,,306,,,,,234,,,,,423,,,,,486,,,,,513,,,,,465,,,,,405,,,,,378,,,,,306,,,,,234,,,,,,,,,,,423,,423,,,486,,486,,,513,,513,,,465,,465,,,405,,405,,,378,,378,,,306,,306,,,234,,234,,,,,423,,,,,486,,,,,513,,,,,465,,,,,405,,,,,378,,,,,306,,,,,234,,
CIMETROL-SUPER-5L,EcoShield Pest Control,264,294,201,177,249,339,441,426,435,342,297,216,234,234,339,387,462,555,558,591,498,450,390,297,303,327,402,477,540,558,621,537,498,429,363,309,342,372,435,465,603,585,678,600,576,441,420,312,360,360,408,510,621,618,657,678,555,528,405,321,390,417,429,513,666,,,,,648,,,,,723,,,,,660,,,,,558,,,,,540,,,,,426,,,,,351,,,,,408,417,516,594,,,405,,,,,447,,,,,489,,,,,477,,,,,405,,,,,360,,,,,297,,,,,222,,,,,405,,,,,447,,,,,489,,,,,477,,,,,405,,,,,360,,,,,297,,,,,222,,,,,,,,,,,405,,405,,,447,,447,,,489,,489,,,477,,477,,,405,,405,,,360,,360,,,297,,297,,,222,,222,,,,,405,,,,,447,,,,,489,,,,,477,,,,,405,,,,,360,,,,,297,,,,,222,,
CIMETROL-SUPER-5L,Harvest Agro Traders,393,399,306,252,387,483,651,669,573,468,384,309,321,354,474,588,687,768,756,753,741,633,495,420,471,480,525,630,744,792,861,828,708,639,561,393,432,507,564,654,738,819,891,825,804,690,600,417,495,486,672,720,840,930,954,861,759,723,615,447,474,537,633,744,927,,,,,879,,,,,1044,,,,,999,,,,,834,,,,,783,,,,,627,,,,,483,,,,,558,612,663,810,,,645,,,,,723,,,,,732,,,,,690,,,,,639,,,,,561,,,,,462,,,,,345,,,,,645,,,,,723,,,,,732,,,,,690,,,,,639,,,,,561,,,,,462,,,,,345,,,,,,,,,,,645,,645,,,723,,723,,,732,,732,,,690,,690,,,639,,639,,,561,,561,,,462,,462,,,345,,345,,,,,645,,,,,723,,,,,732,,,,,690,,,,,639,,,,,561,,,,,462,,,,,345,,
CIMETROL-SUPER-5L,Urban Hygiene Authority,459,462,330,324,420,603,678,756,645,534,447,342,330,414,516,615,747,819,951,939,831,633,606,471,510,507,660,723,870,957,1044,951,774,714,615,450,513,585,708,843,909,1023,978,903,864,810,660,480,582,561,675,828,948,1083,1098,984,933,852,705,540,615,654,717,891,960,,,,,1014,,,,,1122,,,,,1122,,,,,1002,,,,,789,,,,,717,,,,,519,,,,,606,666,807,873,,,1248,,,,,1320,,,,,1434,,,,,1377,,,,,1224,,,,,1011,,,,,888,,,,,648,,,,,1248,,,,,1320,,,,,1434,,,,,1377,,,,,1224,,,,,1011,,,,,888,,,,,648,,,,,,,,,,,1248,,1248,,,1320,,1320,,,1434,,1434,,,1377,,1377,,,1224,,1224,,,1011,,1011,,,888,,888,,,648,,648,,,,,1248,,,,,1320,,,,,1434,,,,,1377,,,,,1224,,,,,1011,,,,,888,,,,,648,,
CIMETROL-SUPER-5L,GreenField Agro Supplies,348,354,267,237,312,420,504,525,462,390,333,240,267,306,375,426,540,645,618,633,540,459,399,321,387,399,450,510,636,636,744,627,585,477,471,309,375,423,498,528,609,696,690,678,618,501,474,327,405,432,507,642,708,789,762,786,645,537,453,363,393,456,561,648,669,,,,,831,,,,,867,,,,,789,,,,,696,,,,,630,,,,,474,,,,,402,,,,,429,438,597,612,,,675,,,,,780,,,,,762,,,,,702,,,,,663,,,,,576,,,,,474,,,,,390,,,,,675,,,,,780,,,,,762,,,,,702,,,,,663,,,,,576,,,,,474,,,,,390,,,,,,,,,,,675,,675,,,780,,780,,,762,,762,,,702,,702,,,663,,663,,,576,,576,,,474,,474,,,390,,390,,,,,675,,,,,780,,,,,762,,,,,702,,,,,663,,,,,576,,,,,474,,,,,390,,
CIMETROL-SUPER-5L,Kaeferling Pro A - Old,342,357,240,213,336,423,549,552,480,435,354,240,255,300,399,498,579,648,672,642,567,507,411,327,378,402,501,537,636,723,729,702,579,531,462,327,405,393,498,570,615,711,792,696,657,561,507,381,399,450,483,603,669,813,738,729,654,555,498,393,423,480,543,678,771,,,,,765,,,,,846,,,,,777,,,,,666,,,,,600,,,,,558,,,,,423,,,,,462,477,579,669,,,1326,,,,,1350,,,,,1398,,,,,1431,,,,,1197,,,,,1077,,,,,891,,,,,696,,,,,1326,,,,,1350,,,,,1398,,,,,1431,,,,,1197,,,,,1077,,,,,891,,,,,696,,,,,,,,,,,1326,,1326,,,1350,,1350,,,1398,,1398,,,1431,,1431,,,1197,,1197,,,1077,,1077,,,891,,891,,,696,,696,,,,,1326,,,,,1350,,,,,1398,,,,,1431,,,,,1197,,,,,1077,,,,,891,,,,,696,,
CSUPER Base Bulk,UK Pest Solutions Ltd,274,280,188,166,228,340,408,398,352,308,250,182,216,216,310,348,400,492,480,530,466,384,326,250,274,294,350,442,500,520,520,532,444,402,350,280,308,312,364,468,528,524,594,550,502,418,334,256,326,352,412,484,570,584,590,542,488,482,404,306,330,354,418,482,566,566,-1,-1,-1,640,640,-1,-1,-1,642,642,-1,-1,-1,622,622,-1,-1,-1,542,542,-1,-1,-1,464,464,-1,-1,-1,376,376,-1,-1,-1,322,322,-1,-1,-1,318,354,460,502,763,763,,763,585,815,815,,815,635,844,844,,844,651,795,795,,795,625,728,728,,728,550,619,619,,619,486,523,523,,523,399,425,425,,425,320,585,763,,763,585,635,815,,815,635,651,844,,844,651,625,795,,795,625,550,728,,728,550,486,619,,619,486,399,523,,523,399,320,425,,425,320,342,342,370,370,451,451,513,513,,763,,763,585,,815,,815,635,,844,,844,651,,795,,795,625,,728,,728,550,,619,,619,486,,523,,523,399,,425,,425,320,0.095,763,,763,585,0.258,815,,815,635,0.114,844,,844,651,0.034,795,,795,625,-0.132,728,,728,550,-0.207,619,,619,486,-0.394,523,,523,399,-0.033,425,,425,320
CSUPER Base Bulk,Euro Agro Chemicals GmbH,104,106,82,74,94,132,166,168,144,126,112,82,90,100,116,158,174,198,224,216,182,146,138,106,120,116,144,184,202,202,236,230,198,156,150,114,126,122,158,180,214,218,236,222,190,176,154,112,122,136,168,180,222,224,242,252,224,170,144,112,128,144,180,208,240,240,-1,-1,-1,252,252,-1,-1,-1,262,262,-1,-1,-1,252,252,-1,-1,-1,222,222,-1,-1,-1,206,206,-1,-1,-1,160,160,-1,-1,-1,118,118,-1,-1,-1,136,142,190,212,314,314,,314,228,337,337,,337,241,377,377,,377,265,356,356,,356,261,304,304,,304,231,276,276,,276,201,246,246,,246,181,187,187,,187,146,228,314,,314,228,241,337,,337,241,265,377,,377,265,261,356,,356,261,231,304,,304,231,201,276,,276,201,181,246,,246,181,146,187,,187,146,159,159,165,165,192,192,215,215,,314,,314,228,,337,,337,241,,377,,377,265,,356,,356,261,,304,,304,231,,276,,276,201,,246,,246,181,,187,,187,146,0.388,314,,314,228,0.353,337,,337,241,0.359,377,,377,265,0.205,356,,356,261,-0.023,304,,304,231,-0.16,276,,276,201,-0.383,246,,246,181,-0.068,187,,187,146
CSUPER Base Bulk,Apex Pest Control Services,112,120,90,78,120,166,176,190,188,146,112,92,100,104,142,170,192,208,220,226,196,190,148,118,142,136,164,212,236,250,272,226,228,180,166,118,140,154,168,216,226,238,286,274,216,184,172,136,156,168,186,222,244,284,266,254,234,204,174,144,152,160,190,224,262,262,-1,-1,-1,282,282,-1,-1,-1,280,280,-1,-1,-1,284,284,-1,-1,-1,240,240,-1,-1,-1,210,210,-1,-1,-1,186,186,-1,-1,-1,138,138,-1,-1,-1,158,162,202,242,550,550,,550,255,580,580,,580,279,608,608,,608,290,615,615,,615,281,544,544,,544,254,454,454,,454,222,392,392,,392,195,313,313,,313,159,255,550,,550,255,279,580,,580,279,290,608,,608,290,281,615,,615,281,254,544,,544,254,222,454,,454,222,195,392,,392,195,159,313,,313,159,174,174,179,179,205,205,239,239,,550,,550,255,,580,,580,279,,608,,608,290,,615,,615,281,,544,,544,254,,454,,454,222,,392,,392,195,,313,,313,159,0.33,550,,550,255,0.331,580,,580,279,0.337,608,,608,290,0.127,615,,615,281,-0.054,544,,544,254,-0.212,454,,454,222,-0.385,392,,392,195,-0.028,313,,313,159
CSUPER Base Bulk,SafeHome Pest Control Pvt Ltd,60,66,50,46,58,78,104,108,98,82,62,48,52,58,76,88,102,126,130,124,118,92,84,62,76,72,90,104,118,132,136,140,120,100,88,66,74,82,98,114,120,134,136,142,132,100,86,66,80,84,92,112,134,138,158,140,132,110,94,70,84,88,100,130,132,132,-1,-1,-1,150,150,-1,-1,-1,162,162,-1,-1,-1,150,150,-1,-1,-1,136,136,-1,-1,-1,114,114,-1,-1,-1,100,100,-1,-1,-1,80,80,-1,-1,-1,86,98,110,126,487,487,,487,136,530,530,,530,151,592,592,,592,162,541,541,,541,157,500,500,,500,146,413,413,,413,122,366,366,,366,107,286,286,,286,86,136,487,,487,136,151,530,,530,151,162,592,,592,162,157,541,,541,157,146,500,,500,146,122,413,,413,122,107,366,,366,107,86,286,,286,86,96,96,101,101,113,113,129,129,,487,,487,136,,530,,530,151,,592,,592,162,,541,,541,157,,500,,500,146,,413,,413,122,,366,,366,107,,286,,286,86,0.172,487,,487,136,0.217,530,,530,151,0.264,592,,592,162,0.012,541,,541,157,-0.028,500,,500,146,-0.261,413,,413,122,-0.384,366,,366,107,0.046,286,,286,86
CSUPER Base Bulk,Kaeferling Pro A,66,70,52,48,66,88,104,112,98,86,66,50,50,64,82,88,106,132,140,144,126,106,88,64,76,82,90,118,132,146,136,146,126,100,84,72,72,80,106,116,138,150,142,138,138,122,90,76,84,86,104,128,140,156,156,146,126,112,94,82,82,98,106,140,154,154,-1,-1,-1,166,166,-1,-1,-1,162,162,-1,-1,-1,152,152,-1,-1,-1,136,136,-1,-1,-1,120,120,-1,-1,-1,108,108,-1,-1,-1,84,84,-1,-1,-1,90,100,118,130,426,426,,426,147,486,486,,486,163,523,523,,523,163,471,471,,471,162,447,447,,447,146,368,368,,368,129,328,328,,328,109,257,257,,257,92,147,426,,426,147,163,486,,486,163,163,523,,523,163,162,471,,471,162,146,447,,447,146,129,368,,368,129,109,328,,328,109,92,257,,257,92,96,96,104,104,119,119,136,136,,426,,426,147,,486,,486,163,,523,,523,163,,471,,471,162,,447,,447,146,,368,,368,129,,328,,328,109,,257,,257,92,0.134,426,,426,147,0.132,486,,486,163,0.225,523,,523,163,0.058,471,,471,162,-0.064,447,,447,146,-0.194,368,,368,129,-0.446,328,,328,109,-0.059,257,,257,92
CSUPER Base Bulk,Nordic Pest Group AB,84,98,62,58,76,110,128,132,122,100,84,58,72,78,96,110,144,162,172,166,150,126,116,88,100,108,114,144,158,188,178,162,148,138,110,84,92,108,138,144,162,196,180,184,150,134,126,92,96,120,138,160,172,180,188,208,160,152,120,104,114,120,152,156,178,178,-1,-1,-1,196,196,-1,-1,-1,218,218,-1,-1,-1,196,196,-1,-1,-1,170,170,-1,-1,-1,162,162,-1,-1,-1,134,134,-1,-1,-1,108,108,-1,-1,-1,118,116,146,166,419,419,,419,180,468,468,,468,202,472,472,,472,207,446,446,,446,203,393,393,,393,177,369,369,,369,162,295,295,,295,141,244,244,,244,114,180,419,,419,180,202,468,,468,202,207,472,,472,207,203,446,,446,203,177,393,,393,177,162,369,,369,162,141,295,,295,141,114,244,,244,114,124,124,133,133,153,153,168,168,,419,,419,180,,468,,468,202,,472,,472,207,,446,,446,203,,393,,393,177,,369,,369,162,,295,,295,141,,244,,244,114,0.119,419,,419,180,0.296,468,,468,202,0.176,472,,472,207,-0.028,446,,446,203,-0.125,393,,393,177,-0.256,369,,369,162,-0.443,295,,295,141,-0.125,244,,244,114
CSUPER Base Bulk,Desert Shield Pest Mgmt,108,124,92,78,100,154,178,174,180,138,108,78,88,92,124,156,202,212,232,210,192,180,152,116,118,134,164,192,230,250,228,216,192,182,160,110,138,142,170,194,226,228,262,238,222,184,148,128,128,138,164,200,252,268,254,258,226,188,158,124,142,166,196,202,230,230,-1,-1,-1,248,248,-1,-1,-1,286,286,-1,-1,-1,248,248,-1,-1,-1,242,242,-1,-1,-1,206,206,-1,-1,-1,164,164,-1,-1,-1,144,144,-1,-1,-1,140,168,184,244,341,341,,341,243,374,374,,374,263,398,398,,398,277,368,368,,368,261,345,345,,345,246,293,293,,293,217,249,249,,249,186,197,197,,197,154,243,341,,341,243,263,374,,374,263,277,398,,398,277,261,368,,368,261,246,345,,345,246,217,293,,293,217,186,249,,249,186,154,197,,197,154,164,164,178,178,199,199,224,224,,341,,341,243,,374,,374,263,,398,,398,277,,368,,368,261,,345,,345,246,,293,,293,217,,249,,249,186,,197,,197,154,0.194,341,,341,243,0.343,374,,374,263,0.284,398,,398,277,0.185,368,,368,261,-0.006,345,,345,246,-0.166,293,,293,217,-0.365,249,,249,186,-0.023,197,,197,154
CSUPER Base Bulk,AgroPlus Distributors SARL,248,236,180,162,238,284,342,366,342,318,232,172,182,204,254,344,418,402,446,470,386,368,294,212,268,298,326,378,480,476,488,494,458,394,306,226,294,276,326,424,482,492,564,526,454,370,338,244,304,308,396,424,528,524,580,498,454,394,352,260,320,316,356,456,476,476,-1,-1,-1,566,566,-1,-1,-1,578,578,-1,-1,-1,544,544,-1,-1,-1,502,502,-1,-1,-1,420,420,-1,-1,-1,338,338,-1,-1,-1,288,288,-1,-1,-1,316,326,402,484,543,543,,543,499,571,571,,571,520,598,598,,598,562,589,589,,589,546,521,521,,521,496,468,468,,468,442,384,384,,384,375,301,301,,301,299,499,543,,543,499,520,571,,571,520,562,598,,598,562,546,589,,589,546,496,521,,521,496,442,468,,468,442,375,384,,384,375,299,301,,301,299,346,346,354,354,395,395,458,458,,543,,543,499,,571,,571,520,,598,,598,562,,589,,589,546,,521,,521,496,,468,,468,442,,384,,384,375,,301,,301,299,0.253,543,,543,499,0.333,571,,571,520,0.181,598,,598,562,0.027,589,,589,546,-0.028,521,,521,496,-0.19,468,,468,442,-0.412,384,,384,375,-0.064,301,,301,299
CSUPER Base Bulk,CleanCity Municipal Services,246,264,200,172,252,346,392,372,394,312,274,184,188,210,286,380,442,456,518,534,406,356,334,266,266,282,356,450,496,494,534,562,444,412,366,248,286,312,384,456,528,556,578,568,454,432,330,266,290,330,420,476,566,594,626,572,526,458,386,284,318,366,392,480,574,574,-1,-1,-1,600,600,-1,-1,-1,592,592,-1,-1,-1,564,564,-1,-1,-1,522,522,-1,-1,-1,446,446,-1,-1,-1,366,366,-1,-1,-1,280,280,-1,-1,-1,338,382,414,520,636,636,,636,541,680,680,,680,573,703,703,,703,606,689,689,,689,595,575,575,,575,525,527,527,,527,470,436,436,,436,411,353,353,,353,323,541,636,,636,541,573,680,,680,573,606,703,,703,606,595,689,,689,595,525,575,,575,525,470,527,,527,470,411,436,,436,411,323,353,,353,323,350,350,383,383,430,430,499,499,,636,,636,541,,680,,680,573,,703,,703,606,,689,,689,595,,575,,575,525,,527,,527,470,,436,,436,411,,353,,353,323,0.237,636,,636,541,0.28,680,,680,573,0.215,703,,703,606,0.145,689,,689,595,0.059,575,,575,525,-0.161,527,,527,470,-0.328,436,,436,411,0.059,353,,353,323
CSUPER Base Bulk,FarmCare Retail Network,178,220,144,128,180,240,302,308,278,222,196,150,148,166,210,254,342,358,374,400,336,298,232,180,214,236,290,322,390,362,378,382,322,310,244,196,218,244,296,308,366,404,420,390,366,314,248,200,218,240,322,366,374,414,458,448,412,332,274,222,230,252,324,360,406,406,-1,-1,-1,450,450,-1,-1,-1,500,500,-1,-1,-1,450,450,-1,-1,-1,416,416,-1,-1,-1,332,332,-1,-1,-1,300,300,-1,-1,-1,214,214,-1,-1,-1,240,292,308,406,551,551,,551,407,592,592,,592,436,643,643,,643,470,626,626,,626,461,561,561,,561,420,482,482,,482,367,402,402,,402,315,318,318,,318,260,407,551,,551,407,436,592,,592,436,470,643,,643,470,461,626,,626,461,420,561,,561,420,367,482,,482,367,315,402,,402,315,260,318,,318,260,278,278,305,305,347,347,383,383,,551,,551,407,,592,,592,436,,643,,643,470,,626,,626,461,,561,,561,420,,482,,482,367,,402,,402,315,,318,,318,260,0.312,551,,551,407,0.273,592,,592,436,0.201,643,,643,470,0.09,626,,626,461,-0.033,561,,561,420,-0.187,482,,482,367,-0.348,402,,402,315,-0.132,318,,318,260
CSUPER Base Bulk,PestEx Solutions Inc,264,264,186,168,252,334,390,386,348,334,264,188,208,234,286,344,398,440,478,502,410,360,314,234,278,280,356,432,444,552,508,538,424,380,314,254,296,320,352,422,540,546,574,580,446,426,372,278,314,326,402,476,550,536,636,566,532,462,372,294,320,322,408,456,550,550,-1,-1,-1,566,566,-1,-1,-1,590,590,-1,-1,-1,558,558,-1,-1,-1,488,488,-1,-1,-1,448,448,-1,-1,-1,414,414,-1,-1,-1,300,300,-1,-1,-1,324,344,414,526,403,403,,403,525,444,444,,444,565,470,470,,470,599,451,451,,451,592,391,391,,391,513,363,363,,363,474,309,309,,309,414,243,243,,243,331,525,403,,403,525,565,444,,444,565,599,470,,470,599,592,451,,451,592,513,391,,391,513,474,363,,363,474,414,309,,309,414,331,243,,243,331,364,364,379,379,428,428,488,488,,403,,403,525,,444,,444,565,,470,,470,599,,451,,451,592,,391,,391,513,,363,,363,474,,309,,309,414,,243,,243,331,0.251,403,,403,525,0.429,444,,444,565,0.24,470,,470,599,0.131,451,,451,592,0.046,391,,391,513,-0.206,363,,363,474,-0.337,309,,309,414,-0.119,243,,243,331
CSUPER Base Bulk,EcoShield Pest Control,176,196,134,118,166,226,294,284,290,228,198,144,156,156,226,258,308,370,372,394,332,300,260,198,202,218,268,318,360,372,414,358,332,286,242,206,228,248,290,310,402,390,452,400,384,294,280,208,240,240,272,340,414,412,438,452,370,352,270,214,260,278,286,342,444,444,-1,-1,-1,432,432,-1,-1,-1,482,482,-1,-1,-1,440,440,-1,-1,-1,372,372,-1,-1,-1,360,360,-1,-1,-1,284,284,-1,-1,-1,234,234,-1,-1,-1,272,278,344,396,350,350,,350,430,372,372,,372,446,405,405,,405,485,390,390,,390,462,344,344,,344,418,306,306,,306,372,261,261,,261,324,207,207,,207,267,430,350,,350,430,446,372,,372,446,485,405,,405,485,462,390,,390,462,418,344,,344,418,372,306,,306,372,324,261,,261,324,267,207,,207,267,292,292,301,301,340,340,380,380,,350,,350,430,,372,,372,446,,405,,405,485,,390,,390,462,,344,,344,418,,306,,306,372,,261,,261,324,,207,,207,267,0.304,350,,350,430,0.364,372,,372,446,0.243,405,,405,485,0.091,390,,390,462,0.012,344,,344,418,-0.145,306,,306,372,-0.348,261,,261,324,-0.028,207,,207,267
CSUPER Base Bulk,Harvest Agro Traders,262,266,204,168,258,322,434,446,382,312,256,206,214,236,316,392,458,512,504,502,494,422,330,280,314,320,350,420,496,528,574,552,472,426,374,262,288,338,376,436,492,546,594,550,536,460,400,278,330,324,448,480,560,620,636,574,506,482,410,298,316,358,422,496,618,618,-1,-1,-1,586,586,-1,-1,-1,696,696,-1,-1,-1,666,666,-1,-1,-1,556,556,-1,-1,-1,522,522,-1,-1,-1,418,418,-1,-1,-1,322,322,-1,-1,-1,372,408,442,540,513,513,,513,596,557,557,,557,633,586,586,,586,685,559,559,,559,659,513,513,,513,600,459,459,,459,545,389,389,,389,470,304,304,,304,378,596,513,,513,596,633,557,,557,633,685,586,,586,685,659,559,,559,659,600,513,,513,600,545,459,,459,545,470,389,,389,470,378,304,,304,378,408,408,431,431,489,489,547,547,,513,,513,596,,557,,557,633,,586,,586,685,,559,,559,659,,513,,513,600,,459,,459,545,,389,,389,470,,304,,304,378,0.204,513,,513,596,0.223,557,,557,633,0.17,586,,586,685,0.044,559,,559,659,-0.059,513,,513,600,-0.256,459,,459,545,-0.383,389,,389,470,0.012,304,,304,378
CSUPER Base Bulk,Urban Hygiene Authority,306,308,220,216,280,402,452,504,430,356,298,228,220,276,344,410,498,546,634,626,554,422,404,314,340,338,440,482,580,638,696,634,516,476,410,300,342,390,472,562,606,682,652,602,576,540,440,320,388,374,450,552,632,722,732,656,622,568,470,360,410,436,478,594,640,640,-1,-1,-1,676,676,-1,-1,-1,748,748,-1,-1,-1,748,748,-1,-1,-1,668,668,-1,-1,-1,526,526,-1,-1,-1,478,478,-1,-1,-1,346,346,-1,-1,-1,404,444,538,582,744,744,,744,657,803,803,,803,726,860,860,,860,764,827,827,,827,737,741,741,,741,667,629,629,,629,584,554,554,,554,517,420,420,,420,409,657,744,,744,657,726,803,,803,726,764,860,,860,764,737,827,,827,737,667,741,,741,667,584,629,,629,584,517,554,,554,517,409,420,,420,409,446,446,471,471,541,541,611,611,,744,,744,657,,803,,803,726,,860,,860,764,,827,,827,737,,741,,741,667,,629,,629,584,,554,,554,517,,420,,420,409,0.198,744,,744,657,0.205,803,,803,726,0.158,860,,860,764,0.081,827,,827,737,-0.119,741,,741,667,-0.224,629,,629,584,-0.383,554,,554,517,-0.006,420,,420,409
CSUPER Base Bulk,GreenField Agro Supplies,232,236,178,158,208,280,336,350,308,260,222,160,178,204,250,284,360,430,412,422,360,306,266,214,258,266,300,340,424,424,496,418,390,318,314,206,250,282,332,352,406,464,460,452,412,334,316,218,270,288,338,428,472,526,508,524,430,358,302,242,262,304,374,432,446,446,-1,-1,-1,554,554,-1,-1,-1,578,578,-1,-1,-1,526,526,-1,-1,-1,464,464,-1,-1,-1,420,420,-1,-1,-1,316,316,-1,-1,-1,268,268,-1,-1,-1,286,292,398,408,451,451,,451,453,516,516,,516,513,520,520,,520,532,492,492,,492,516,452,452,,452,462,392,392,,392,401,337,337,,337,358,273,273,,273,286,453,451,,451,453,513,516,,516,513,532,520,,520,532,516,492,,492,516,462,452,,452,462,401,392,,392,401,358,337,,337,358,286,273,,273,286,319,319,342,342,389,389,423,423,,451,,451,453,,516,,516,513,,520,,520,532,,492,,492,516,,452,,452,462,,392,,392,401,,337,,337,358,,273,,273,286,0.316,451,,451,453,0.388,516,,516,513,0.213,520,,520,532,0.175,492,,492,516,-0.019,452,,452,462,-0.177,392,,392,401,-0.376,337,,337,358,-0.054,273,,273,286
CSUPER Base Bulk,Kaeferling Pro A - Old,228,238,160,142,224,282,366,368,320,290,236,160,170,200,266,332,386,432,448,428,378,338,274,218,252,268,334,358,424,482,486,468,386,354,308,218,270,262,332,380,410,474,528,464,438,374,338,254,266,300,322,402,446,542,492,486,436,370,332,262,282,320,362,452,514,514,-1,-1,-1,510,510,-1,-1,-1,564,564,-1,-1,-1,518,518,-1,-1,-1,444,444,-1,-1,-1,400,400,-1,-1,-1,372,372,-1,-1,-1,282,282,-1,-1,-1,308,318,386,446,688,688,,688,492,721,721,,721,543,750,750,,750,568,747,747,,747,541,641,641,,641,484,577,577,,577,436,491,491,,491,389,387,387,,387,310,492,688,,688,492,543,721,,721,543,568,750,,750,568,541,747,,747,541,484,641,,641,484,436,577,,577,436,389,491,,491,389,310,387,,387,310,333,333,352,352,402,402,457,457,,688,,688,492,,721,,721,543,,750,,750,568,,747,,747,541,,641,,641,484,,577,,577,436,,491,,491,389,,387,,387,310,0.223,688,,688,492,0.194,721,,721,543,0.225,750,,750,568,0.04,747,,747,541,-0.068,641,,641,484,-0.21,577,,577,436,-0.395,491,,491,389,-0.019,387,,387,310
Personal Decontamination Kit Mk3,UK Pest Solutions Ltd,498,552,411,354,456,636,828,777,699,624,492,360,432,438,612,657,846,876,1059,1026,876,804,696,504,555,636,663,891,897,1080,1014,1077,858,759,714,492,552,618,789,825,975,1080,1104,1065,900,783,663,507,558,594,738,972,1026,1134,1137,1074,1002,906,744,591,615,648,828,990,1104,,,,,1233,,,,,1284,,,,,1212,,,,,1092,,,,,882,,,,,732,,,,,618,,,,,699,651,867,966,,,1584,,,,,1689,,,,,1947,,,,,1683,,,,,1593,,,,,1404,,,,,1230,,,,,924,,,,,1584,,,,,1689,,,,,1947,,,,,1683,,,,,1593,,,,,1404,,,,,1230,,,,,924,,,,,,,,,,,1584,,1584,,,1689,,1689,,,1947,,1947,,,1683,,1683,,,1593,,1593,,,1404,,1404,,,1230,,1230,,,924,,924,,,,,1584,,,,,1689,,,,,1947,,,,,1683,,,,,1593,,,,,1404,,,,,1230,,,,,924,,
Personal Decontamination Kit Mk3,Euro Agro Chemicals GmbH,201,213,156,141,189,285,348,309,333,273,195,153,162,189,246,279,366,411,387,405,345,300,279,216,213,237,315,330,393,441,438,456,363,330,267,213,243,258,306,330,399,423,441,408,372,318,270,216,249,270,336,348,432,468,450,492,384,360,279,237,246,279,333,417,420,,,,,456,,,,,462,,,,,498,,,,,393,,,,,375,,,,,336,,,,,237,,,,,273,303,339,375,,,762,,,,,747,,,,,789,,,,,792,,,,,717,,,,,600,,,,,513,,,,,375,,,,,762,,,,,747,,,,,789,,,,,792,,,,,717,,,,,600,,,,,513,,,,,375,,,,,,,,,,,762,,762,,,747,,747,,,789,,789,,,792,,792,,,717,,717,,,600,,600,,,513,,513,,,375,,375,,,,,762,,,,,747,,,,,789,,,,,792,,,,,717,,,,,600,,,,,513,,,,,375,,
Personal Decontamination Kit Mk3,Apex Pest Control Services,252,270,186,168,228,333,345,390,330,306,231,165,201,222,291,312,414,456,435,486,438,360,306,222,261,258,315,411,477,492,468,495,402,369,312,228,291,267,372,390,435,531,495,537,408,363,309,246,279,315,333,402,492,489,543,531,465,414,354,246,276,315,348,411,489,,,,,549,,,,,543,,,,,564,,,,,513,,,,,435,,,,,348,,,,,285,,,,,285,330,390,489,,,1440,,,,,1587,,,,,1662,,,,,1509,,,,,1344,,,,,1146,,,,,984,,,,,813,,,,,1440,,,,,1587,,,,,1662,,,,,1509,,,,,1344,,,,,1146,,,,,984,,,,,813,,,,,,,,,,,1440,,1440,,,1587,,1587,,,1662,,1662,,,1509,,1509,,,1344,,1344,,,1146,,1146,,,984,,984,,,813,,813,,,,,1440,,,,,1587,,,,,1662,,,,,1509,,,,,1344,,,,,1146,,,,,984,,,,,813,,
Personal Decontamination Kit Mk3,SafeHome Pest Control Pvt Ltd,126,129,93,87,117,162,201,216,195,153,126,99,96,117,141,168,207,255,255,255,222,198,156,120,138,138,183,195,240,273,282,270,225,192,165,132,135,144,189,225,249,255,285,270,255,204,165,126,150,168,207,213,243,285,291,297,255,210,183,135,168,156,201,240,285,,,,,291,,,,,279,,,,,312,,,,,246,,,,,219,,,,,177,,,,,153,,,,,156,171,219,228,,,1569,,,,,1632,,,,,1764,,,,,1653,,,,,1470,,,,,1287,,,,,1047,,,,,852,,,,,1569,,,,,1632,,,,,1764,,,,,1653,,,,,1470,,,,,1287,,,,,1047,,,,,852,,,,,,,,,,,1569,,1569,,,1632,,1632,,,1764,,1764,,,1653,,1653,,,1470,,1470,,,1287,,1287,,,1047,,1047,,,852,,852,,,,,1569,,,,,1632,,,,,1764,,,,,1653,,,,,1470,,,,,1287,,,,,1047,,,,,852,,
Personal Decontamination Kit Mk3,Kaeferling Pro A,129,135,99,90,126,180,210,231,207,180,132,96,102,117,147,180,222,237,249,279,225,213,168,126,141,156,201,234,234,282,264,282,258,210,174,132,153,159,189,237,243,306,315,306,270,222,195,132,150,180,210,243,252,288,294,297,282,240,195,150,156,177,201,261,276,,,,,300,,,,,327,,,,,303,,,,,255,,,,,249,,,,,213,,,,,159,,,,,159,198,216,270,,,1329,,,,,1368,,,,,1461,,,,,1350,,,,,1293,,,,,1080,,,,,912,,,,,702,,,,,1329,,,,,1368,,,,,1461,,,,,1350,,,,,1293,,,,,1080,,,,,912,,,,,702,,,,,,,,,,,1329,,1329,,,1368,,1368,,,1461,,1461,,,1350,,1350,,,1293,,1293,,,1080,,1080,,,912,,912,,,702,,702,,,,,1329,,,,,1368,,,,,1461,,,,,1350,,,,,1293,,,,,1080,,,,,912,,,,,702,,
Personal Decontamination Kit Mk3,Nordic Pest Group AB,162,174,138,123,168,225,243,249,270,222,183,114,129,150,201,249,270,336,339,318,306,255,204,180,192,213,243,288,300,336,366,336,306,246,216,162,207,219,258,285,351,342,351,333,324,288,222,192,201,198,276,306,327,369,360,345,309,273,255,177,219,222,258,300,369,,,,,399,,,,,399,,,,,384,,,,,327,,,,,279,,,,,243,,,,,186,,,,,231,222,270,345,,,1224,,,,,1305,,,,,1341,,,,,1317,,,,,1098,,,,,999,,,,,861,,,,,654,,,,,1224,,,,,1305,,,,,1341,,,,,1317,,,,,1098,,,,,999,,,,,861,,,,,654,,,,,,,,,,,1224,,1224,,,1305,,1305,,,1341,,1341,,,1317,,1317,,,1098,,1098,,,999,,999,,,861,,861,,,654,,654,,,,,1224,,,,,1305,,,,,1341,,,,,1317,,,,,1098,,,,,999,,,,,861,,,,,654,,
Personal Decontamination Kit Mk3,Desert Shield Pest Mgmt,237,252,177,153,219,276,372,375,318,300,234,162,177,195,276,327,393,444,468,405,381,327,309,210,246,243,297,363,453,426,495,441,387,324,306,246,261,291,342,375,408,450,480,477,450,390,297,222,282,282,336,399,486,516,498,501,426,369,327,264,273,285,345,435,465,,,,,540,,,,,522,,,,,534,,,,,456,,,,,366,,,,,336,,,,,267,,,,,294,324,363,402,,,804,,,,,807,,,,,864,,,,,870,,,,,786,,,,,621,,,,,552,,,,,447,,,,,804,,,,,807,,,,,864,,,,,870,,,,,786,,,,,621,,,,,552,,,,,447,,,,,,,,,,,804,,804,,,807,,807,,,864,,864,,,870,,870,,,786,,786,,,621,,621,,,552,,552,,,447,,447,,,,,804,,,,,807,,,,,864,,,,,870,,,,,786,,,,,621,,,,,552,,,,,447,,
Personal Decontamination Kit Mk3,AgroPlus Distributors SARL,468,525,378,303,411,639,690,789,651,555,474,351,342,402,501,663,786,798,939,903,789,675,597,465,513,561,606,801,807,915,933,906,873,783,630,453,537,582,702,762,954,1041,1095,1014,921,789,600,471,591,597,681,882,927,981,1059,969,975,828,678,492,576,597,792,846,987,,,,,1116,,,,,1077,,,,,1032,,,,,969,,,,,798,,,,,732,,,,,516,,,,,549,645,723,873,,,1035,,,,,1041,,,,,1158,,,,,1074,,,,,903,,,,,849,,,,,738,,,,,549,,,,,1035,,,,,1041,,,,,1158,,,,,1074,,,,,903,,,,,849,,,,,738,,,,,549,,,,,,,,,,,1035,,1035,,,1041,,1041,,,1158,,1158,,,1074,,1074,,,903,,903,,,849,,849,,,738,,738,,,549,,549,,,,,1035,,,,,1041,,,,,1158,,,,,1074,,,,,903,,,,,849,,,,,738,,,,,549,,
Personal Decontamination Kit Mk3,CleanCity Municipal Services,531,552,411,339,456,648,804,834,753,636,546,384,372,453,564,654,816,996,1065,912,801,780,657,507,513,630,657,816,987,951,1071,1101,924,837,684,519,537,597,741,867,1020,1038,1110,1005,1014,837,732,507,591,678,774,843,948,1086,1233,1125,906,864,720,588,633,636,801,945,1020,,,,,1068,,,,,1245,,,,,1161,,,,,987,,,,,912,,,,,732,,,,,570,,,,,672,714,891,999,,,1269,,,,,1275,,,,,1284,,,,,1344,,,,,1224,,,,,966,,,,,807,,,,,666,,,,,1269,,,,,1275,,,,,1284,,,,,1344,,,,,1224,,,,,966,,,,,807,,,,,666,,,,,,,,,,,1269,,1269,,,1275,,1275,,,1284,,1284,,,1344,,1344,,,1224,,1224,,,966,,966,,,807,,807,,,666,,666,,,,,1269,,,,,1275,,,,,1284,,,,,1344,,,,,1224,,,,,966,,,,,807,,,,,666,,
Personal Decontamination Kit Mk3,FarmCare Retail Network,399,402,309,243,348,471,591,639,588,513,393,267,282,333,405,513,630,702,720,696,603,525,468,342,426,480,555,591,690,738,834,792,672,549,504,390,420,444,549,654,723,834,885,765,717,642,534,387,471,444,588,687,786,777,927,843,744,684,537,384,471,516,600,714,768,,,,,861,,,,,966,,,,,798,,,,,744,,,,,699,,,,,570,,,,,462,,,,,483,480,615,762,,,1215,,,,,1263,,,,,1377,,,,,1386,,,,,1119,,,,,1029,,,,,891,,,,,636,,,,,1215,,,,,1263,,,,,1377,,,,,1386,,,,,1119,,,,,1029,,,,,891,,,,,636,,,,,,,,,,,1215,,1215,,,1263,,1263,,,1377,,1377,,,1386,,1386,,,1119,,1119,,,1029,,1029,,,891,,891,,,636,,636,,,,,1215,,,,,1263,,,,,1377,,,,,1386,,,,,1119,,,,,1029,,,,,891,,,,,636,,
Personal Decontamination Kit Mk3,PestEx Solutions Inc,513,582,393,363,468,702,810,822,726,603,486,360,378,468,528,654,873,855,960,1017,846,702,648,507,555,555,747,870,939,1026,1098,1047,858,726,675,486,567,600,723,792,930,1128,1059,1041,894,828,705,552,630,681,699,879,1044,1056,1143,1140,906,861,660,522,576,627,849,903,978,,,,,1092,,,,,1272,,,,,1131,,,,,951,,,,,924,,,,,696,,,,,603,,,,,603,711,765,1011,,,519,,,,,591,,,,,615,,,,,558,,,,,510,,,,,453,,,,,375,,,,,276,,,,,519,,,,,591,,,,,615,,,,,558,,,,,510,,,,,453,,,,,375,,,,,276,,,,,,,,,,,519,,519,,,591,,591,,,615,,615,,,558,,558,,,510,,510,,,453,,453,,,375,,375,,,276,,276,,,,,519,,,,,591,,,,,615,,,,,558,,,,,510,,,,,453,,,,,375,,,,,276,,
Personal Decontamination Kit Mk3,EcoShield Pest Control,366,402,270,252,336,522,615,558,558,480,354,276,294,309,405,495,579,687,762,726,642,561,444,366,399,429,486,600,750,723,813,780,669,546,525,366,405,450,549,672,684,834,774,780,693,588,477,393,465,450,600,705,732,819,915,858,771,678,495,435,447,477,630,699,795,,,,,849,,,,,891,,,,,852,,,,,783,,,,,672,,,,,588,,,,,417,,,,,447,483,570,735,,,510,,,,,504,,,,,567,,,,,531,,,,,480,,,,,420,,,,,339,,,,,255,,,,,510,,,,,504,,,,,567,,,,,531,,,,,480,,,,,420,,,,,339,,,,,255,,,,,,,,,,,510,,510,,,504,,504,,,567,,567,,,531,,531,,,480,,480,,,420,,420,,,339,,339,,,255,,255,,,,,510,,,,,504,,,,,567,,,,,531,,,,,480,,,,,420,,,,,339,,,,,255,,
Personal Decontamination Kit Mk3,Harvest Agro Traders,549,579,432,345,501,660,891,894,807,633,513,420,417,435,582,762,867,927,969,993,882,834,657,534,606,585,702,936,1029,1161,1143,1014,915,870,732,543,561,690,813,867,1029,1158,1080,1098,966,804,687,546,642,660,765,915,1152,1188,1176,1197,975,870,798,612,666,660,879,1044,1164,,,,,1302,,,,,1236,,,,,1152,,,,,1116,,,,,921,,,,,735,,,,,600,,,,,714,675,846,942,,,714,,,,,843,,,,,867,,,,,822,,,,,747,,,,,591,,,,,495,,,,,426,,,,,714,,,,,843,,,,,867,,,,,822,,,,,747,,,,,591,,,,,495,,,,,426,,,,,,,,,,,714,,714,,,843,,843,,,867,,867,,,822,,822,,,747,,747,,,591,,591,,,495,,495,,,426,,426,,,,,714,,,,,843,,,,,867,,,,,822,,,,,747,,,,,591,,,,,495,,,,,426,,
Personal Decontamination Kit Mk3,Urban Hygiene Authority,645,660,456,417,534,738,936,894,861,801,597,438,453,522,738,831,1065,1095,1125,1119,1050,924,789,597,684,729,807,960,1125,1290,1341,1155,1089,999,801,594,678,747,858,1002,1203,1362,1305,1347,1059,1050,837,678,684,777,933,1014,1146,1227,1326,1350,1236,957,831,678,738,756,1026,1131,1281,,,,,1437,,,,,1335,,,,,1296,,,,,1275,,,,,1023,,,,,927,,,,,726,,,,,771,825,924,1116,,,1497,,,,,1611,,,,,1551,,,,,1458,,,,,1407,,,,,1164,,,,,993,,,,,813,,,,,1497,,,,,1611,,,,,1551,,,,,1458,,,,,1407,,,,,1164,,,,,993,,,,,813,,,,,,,,,,,1497,,1497,,,1611,,1611,,,1551,,1551,,,1458,,1458,,,1407,,1407,,,1164,,1164,,,993,,993,,,813,,813,,,,,1497,,,,,1611,,,,,1551,,,,,1458,,,,,1407,,,,,1164,,,,,993,,,,,813,,
Personal Decontamination Kit Mk3,GreenField Agro Supplies,453,489,324,309,426,597,633,693,672,525,450,339,321,390,468,642,678,765,909,798,753,684,591,420,465,528,579,651,777,879,903,876,819,630,597,453,471,504,582,729,780,888,918,915,813,645,558,426,531,543,627,801,864,951,996,972,864,708,573,456,549,591,651,774,915,,,,,972,,,,,1104,,,,,996,,,,,861,,,,,798,,,,,666,,,,,507,,,,,534,597,675,864,,,774,,,,,897,,,,,894,,,,,846,,,,,723,,,,,636,,,,,555,,,,,420,,,,,774,,,,,897,,,,,894,,,,,846,,,,,723,,,,,636,,,,,555,,,,,420,,,,,,,,,,,774,,774,,,897,,897,,,894,,894,,,846,,846,,,723,,723,,,636,,636,,,555,,555,,,420,,420,,,,,774,,,,,897,,,,,894,,,,,846,,,,,723,,,,,636,,,,,555,,,,,420,,
Personal Decontamination Kit Mk3,Kaeferling Pro A - Old,441,483,363,279,411,582,720,663,639,600,477,333,348,408,471,618,777,849,819,846,819,612,522,417,477,552,648,672,873,954,885,843,801,645,543,429,489,504,633,801,873,993,915,921,768,729,657,456,519,585,636,735,942,978,1023,1038,918,702,642,456,564,570,648,843,882,,,,,966,,,,,978,,,,,942,,,,,891,,,,,795,,,,,657,,,,,513,,,,,597,591,771,849,,,1560,,,,,1611,,,,,1755,,,,,1536,,,,,1371,,,,,1239,,,,,1065,,,,,843,,,,,1560,,,,,1611,,,,,1755,,,,,1536,,,,,1371,,,,,1239,,,,,1065,,,,,843,,,,,,,,,,,1560,,1560,,,1611,,1611,,,1755,,1755,,,1536,,1536,,,1371,,1371,,,1239,,1239,,,1065,,1065,,,843,,843,,,,,1560,,,,,1611,,,,,1755,,,,,1536,,,,,1371,,,,,1239,,,,,1065,,,,,843,,
Fullers Earth Sachet,UK Pest Solutions Ltd,332,368,274,236,304,424,552,518,466,416,328,240,288,292,408,438,564,584,706,684,584,536,464,336,370,424,442,594,598,720,676,718,572,506,476,328,368,412,526,550,650,720,736,710,600,522,442,338,372,396,492,648,684,756,758,716,668,604,496,394,410,432,552,660,736,736,-1,-1,-1,822,822,-1,-1,-1,856,856,-1,-1,-1,808,808,-1,-1,-1,728,728,-1,-1,-1,588,588,-1,-1,-1,488,488,-1,-1,-1,412,412,-1,-1,-1,466,434,578,644,889,889,,889,722,963,963,,963,800,1069,1069,,1069,841,969,969,,969,816,893,893,,893,724,791,791,,791,647,692,692,,692,564,536,536,,536,456,722,889,,889,722,800,963,,963,800,841,1069,,1069,841,816,969,,969,816,724,893,,893,724,647,791,,791,647,564,692,,692,564,456,536,,536,456,492,492,510,510,602,602,679,679,,889,,889,722,,963,,963,800,,1069,,1069,841,,969,,969,816,,893,,893,724,,791,,791,647,,692,,692,564,,536,,536,456,0.217,889,,889,722,0.322,963,,963,800,0.217,1069,,1069,841,0.083,969,,969,816,-0.048,893,,893,724,-0.161,791,,791,647,-0.394,692,,692,564,0.039,536,,536,456
Fullers Earth Sachet,Euro Agro Chemicals GmbH,134,142,104,94,126,190,232,206,222,182,130,102,108,126,164,186,244,274,258,270,230,200,186,144,142,158,210,220,262,294,292,304,242,220,178,142,162,172,204,220,266,282,294,272,248,212,180,144,166,180,224,232,288,312,300,328,256,240,186,158,164,186,222,278,280,280,-1,-1,-1,304,304,-1,-1,-1,308,308,-1,-1,-1,332,332,-1,-1,-1,262,262,-1,-1,-1,250,250,-1,-1,-1,224,224,-1,-1,-1,158,158,-1,-1,-1,182,202,226,250,393,393,,393,278,404,404,,404,310,420,420,,420,315,423,423,,423,319,377,377,,377,277,326,326,,326,252,278,278,,278,215,213,213,,213,176,278,393,,393,278,310,404,,404,310,315,420,,420,315,319,423,,423,319,277,377,,377,277,252,326,,326,252,215,278,,278,215,176,213,,213,176,188,188,205,205,233,233,251,251,,393,,393,278,,404,,404,310,,420,,420,315,,423,,423,319,,377,,377,277,,326,,326,252,,278,,278,215,,213,,213,176,0.169,393,,393,278,0.294,404,,404,310,0.216,420,,420,315,0.013,423,,423,319,-0.028,377,,377,277,-0.244,326,,326,252,-0.416,278,,278,215,-0.118,213,,213,176
Fullers Earth Sachet,Apex Pest Control Services,168,180,124,112,152,222,230,260,220,204,154,110,134,148,194,208,276,304,290,324,292,240,204,148,174,172,210,274,318,328,312,330,268,246,208,152,194,178,248,260,290,354,330,358,272,242,206,164,186,210,222,268,328,326,362,354,310,276,236,164,184,210,232,274,326,326,-1,-1,-1,366,366,-1,-1,-1,362,362,-1,-1,-1,376,376,-1,-1,-1,342,342,-1,-1,-1,290,290,-1,-1,-1,232,232,-1,-1,-1,190,190,-1,-1,-1,190,220,260,326,650,650,,650,340,716,716,,716,374,739,739,,739,370,696,696,,696,387,616,616,,616,336,532,532,,532,300,456,456,,456,256,372,372,,372,203,340,650,,650,340,374,716,,716,374,370,739,,739,370,387,696,,696,387,336,616,,616,336,300,532,,532,300,256,456,,456,256,203,372,,372,203,225,225,237,237,272,272,309,309,,650,,650,340,,716,,716,374,,739,,739,370,,696,,696,387,,616,,616,336,,532,,532,300,,456,,456,256,,372,,372,203,0.257,650,,650,340,0.243,716,,716,374,0.263,739,,739,370,0.049,696,,696,387,0,616,,616,336,-0.226,532,,532,300,-0.36,456,,456,256,0.044,372,,372,203
Fullers Earth Sachet,SafeHome Pest Control Pvt Ltd,84,86,62,58,78,108,134,144,130,102,84,66,64,78,94,112,138,170,170,170,148,132,104,80,92,92,122,130,160,182,188,180,150,128,110,88,90,96,126,150,166,170,190,180,170,136,110,84,100,112,138,142,162,190,194,198,170,140,122,90,112,104,134,160,190,190,-1,-1,-1,194,194,-1,-1,-1,186,186,-1,-1,-1,208,208,-1,-1,-1,164,164,-1,-1,-1,146,146,-1,-1,-1,118,118,-1,-1,-1,102,102,-1,-1,-1,104,114,146,152,606,606,,606,167,637,637,,637,187,685,685,,685,195,650,650,,650,198,576,576,,576,173,503,503,,503,149,412,412,,412,126,335,335,,335,103,167,606,,606,167,187,637,,637,187,195,685,,685,195,198,650,,650,198,173,576,,576,173,149,503,,503,149,126,412,,412,126,103,335,,335,103,112,112,118,118,139,139,151,151,,606,,606,167,,637,,637,187,,685,,685,195,,650,,650,198,,576,,576,173,,503,,503,149,,412,,412,126,,335,,335,103,0.335,606,,606,167,0.438,637,,637,187,0.223,685,,685,195,0.112,650,,650,198,0.008,576,,576,173,-0.183,503,,503,149,-0.379,412,,412,126,0.018,335,,335,103
Fullers Earth Sachet,Kaeferling Pro A,86,90,66,60,84,120,140,154,138,120,88,64,68,78,98,120,148,158,166,186,150,142,112,84,94,104,134,156,156,188,176,188,172,140,116,88,102,106,126,158,162,204,210,204,180,148,130,88,100,120,140,162,168,192,196,198,188,160,130,100,104,118,134,174,184,184,-1,-1,-1,200,200,-1,-1,-1,218,218,-1,-1,-1,202,202,-1,-1,-1,170,170,-1,-1,-1,166,166,-1,-1,-1,142,142,-1,-1,-1,106,106,-1,-1,-1,106,132,144,180,533,533,,533,181,559,559,,559,207,593,593,,593,213,558,558,,558,217,528,528,,528,194,446,446,,446,173,377,377,,377,146,290,290,,290,113,181,533,,533,181,207,559,,559,207,213,593,,593,213,217,558,,558,217,194,528,,528,194,173,446,,446,173,146,377,,377,146,113,290,,290,113,120,120,134,134,151,151,177,177,,533,,533,181,,559,,559,207,,593,,593,213,,558,,558,217,,528,,528,194,,446,,446,173,,377,,377,146,,290,,290,113,0.248,533,,533,181,0.331,559,,559,207,0.299,593,,593,213,0.058,558,,558,217,-0.097,528,,528,194,-0.174,446,,446,173,-0.402,377,,377,146,-0.039,290,,290,113
Fullers Earth Sachet,Nordic Pest Group AB,108,116,92,82,112,150,162,166,180,148,122,76,86,100,134,166,180,224,226,212,204,170,136,120,128,142,162,192,200,224,244,224,204,164,144,108,138,146,172,190,234,228,234,222,216,192,148,128,134,132,184,204,218,246,240,230,206,182,170,118,146,148,172,200,246,246,-1,-1,-1,266,266,-1,-1,-1,266,266,-1,-1,-1,256,256,-1,-1,-1,218,218,-1,-1,-1,186,186,-1,-1,-1,162,162,-1,-1,-1,124,124,-1,-1,-1,154,148,180,230,520,520,,520,225,563,563,,563,256,578,578,,578,263,565,565,,565,253,485,485,,485,239,434,434,,434,203,372,372,,372,171,283,283,,283,130,225,520,,520,225,256,563,,563,256,263,578,,578,263,253,565,,565,253,239,485,,485,239,203,434,,434,203,171,372,,372,171,130,283,,283,130,144,144,153,153,175,175,197,197,,520,,520,225,,563,,563,256,,578,,578,263,,565,,565,253,,485,,485,239,,434,,434,203,,372,,372,171,,283,,283,130,0.175,520,,520,225,0.14,563,,563,256,0.193,578,,578,263,0.097,565,,565,253,-0.097,485,,485,239,-0.219,434,,434,203,-0.386,372,,372,171,-0.097,283,,283,130
Fullers Earth Sachet,Desert Shield Pest Mgmt,158,168,118,102,146,184,248,250,212,200,156,108,118,130,184,218,262,296,312,270,254,218,206,140,164,162,198,242,302,284,330,294,258,216,204,164,174,194,228,250,272,300,320,318,300,260,198,148,188,188,224,266,324,344,332,334,284,246,218,176,182,190,230,290,310,310,-1,-1,-1,360,360,-1,-1,-1,348,348,-1,-1,-1,356,356,-1,-1,-1,304,304,-1,-1,-1,244,244,-1,-1,-1,224,224,-1,-1,-1,178,178,-1,-1,-1,196,216,242,268,421,421,,421,307,435,435,,435,333,464,464,,464,353,461,461,,461,342,415,415,,415,307,341,341,,341,269,304,304,,304,240,244,244,,244,191,307,421,,421,307,333,435,,435,333,353,464,,464,353,342,461,,461,342,307,415,,415,307,269,341,,341,269,240,304,,304,240,191,244,,244,191,209,209,219,219,249,249,279,279,,421,,421,307,,435,,435,333,,464,,464,353,,461,,461,342,,415,,415,307,,341,,341,269,,304,,304,240,,244,,244,191,0.148,421,,421,307,0.329,435,,435,333,0.181,464,,464,353,0,461,,461,342,-0.101,415,,415,307,-0.203,341,,341,269,-0.388,304,,304,240,-0.028,244,,244,191
Fullers Earth Sachet,AgroPlus Distributors SARL,312,350,252,202,274,426,460,526,434,370,316,234,228,268,334,442,524,532,626,602,526,450,398,310,342,374,404,534,538,610,622,604,582,522,420,302,358,388,468,508,636,694,730,676,614,526,400,314,394,398,454,588,618,654,706,646,650,552,452,328,384,398,528,564,658,658,-1,-1,-1,744,744,-1,-1,-1,718,718,-1,-1,-1,688,688,-1,-1,-1,646,646,-1,-1,-1,532,532,-1,-1,-1,488,488,-1,-1,-1,344,344,-1,-1,-1,366,430,482,582,663,663,,663,636,697,697,,697,701,751,751,,751,731,711,711,,711,707,629,629,,629,656,567,567,,567,569,489,489,,489,486,370,370,,370,375,636,663,,663,636,701,697,,697,701,731,751,,751,731,707,711,,711,707,656,629,,629,656,569,567,,567,569,486,489,,489,486,375,370,,370,375,413,413,442,442,506,506,584,584,,663,,663,636,,697,,697,701,,751,,751,731,,711,,711,707,,629,,629,656,,567,,567,569,,489,,489,486,,370,,370,375,0.212,663,,663,636,0.321,697,,697,701,0.207,751,,751,731,0.112,711,,711,707,0.044,629,,629,656,-0.18,567,,567,569,-0.37,489,,489,486,-0.097,370,,370,375
Fullers Earth Sachet,CleanCity Municipal Services,354,368,274,226,304,432,536,556,502,424,364,256,248,302,376,436,544,664,710,608,534,520,438,338,342,420,438,544,658,634,714,734,616,558,456,346,358,398,494,578,680,692,740,670,676,558,488,338,394,452,516,562,632,724,822,750,604,576,480,392,422,424,534,630,680,680,-1,-1,-1,712,712,-1,-1,-1,830,830,-1,-1,-1,774,774,-1,-1,-1,658,658,-1,-1,-1,608,608,-1,-1,-1,488,488,-1,-1,-1,380,380,-1,-1,-1,448,476,594,666,776,776,,776,707,807,807,,807,764,849,849,,849,843,846,846,,846,797,763,763,,763,710,646,646,,646,649,548,548,,548,558,444,444,,444,444,707,776,,776,707,764,807,,807,764,843,849,,849,843,797,846,,846,797,710,763,,763,710,649,646,,646,649,558,548,,548,558,444,444,,444,444,470,470,511,511,586,586,653,653,,776,,776,707,,807,,807,764,,849,,849,843,,846,,846,797,,763,,763,710,,646,,646,649,,548,,548,558,,444,,444,444,0.131,776,,776,707,0.169,807,,807,764,0.223,849,,849,843,0.092,846,,846,797,-0.1,763,,763,710,-0.223,646,,646,649,-0.408,548,,548,558,-0.1,444,,444,444
Fullers Earth Sachet,FarmCare Retail Network,266,268,206,162,232,314,394,426,392,342,262,178,188,222,270,342,420,468,480,464,402,350,312,228,284,320,370,394,460,492,556,528,448,366,336,260,280,296,366,436,482,556,590,510,478,428,356,258,314,296,392,458,524,518,618,562,496,456,358,256,314,344,400,476,512,512,-1,-1,-1,574,574,-1,-1,-1,644,644,-1,-1,-1,532,532,-1,-1,-1,496,496,-1,-1,-1,466,466,-1,-1,-1,380,380,-1,-1,-1,308,308,-1,-1,-1,322,320,410,508,667,667,,667,525,706,706,,706,571,773,773,,773,628,753,753,,753,582,636,636,,636,527,580,580,,580,474,499,499,,499,405,371,371,,371,318,525,667,,667,525,571,706,,706,571,628,773,,773,628,582,753,,753,582,527,636,,636,527,474,580,,580,474,405,499,,499,405,318,371,,371,318,352,352,367,367,432,432,491,491,,667,,667,525,,706,,706,571,,773,,773,628,,753,,753,582,,636,,636,527,,580,,580,474,,499,,499,405,,371,,371,318,0.32,667,,667,525,0.284,706,,706,571,0.307,773,,773,628,0.203,753,,753,582,0.039,636,,636,527,-0.147,580,,580,474,-0.392,499,,499,405,-0.048,371,,371,318
Fullers Earth Sachet,PestEx Solutions Inc,342,388,262,242,312,468,540,548,484,402,324,240,252,312,352,436,582,570,640,678,564,468,432,338,370,370,498,580,626,684,732,698,572,484,450,324,378,400,482,528,620,752,706,694,596,552,470,368,420,454,466,586,696,704,762,760,604,574,440,348,384,418,566,602,652,652,-1,-1,-1,728,728,-1,-1,-1,848,848,-1,-1,-1,754,754,-1,-1,-1,634,634,-1,-1,-1,616,616,-1,-1,-1,464,464,-1,-1,-1,402,402,-1,-1,-1,402,474,510,674,516,516,,516,687,574,574,,574,754,607,607,,607,805,579,579,,579,786,505,505,,505,670,454,454,,454,607,384,384,,384,518,303,303,,303,422,687,516,,516,687,754,574,,574,754,805,607,,607,805,786,579,,579,786,670,505,,505,670,607,454,,454,607,518,384,,384,518,422,303,,303,422,450,450,486,486,553,553,633,633,,516,,516,687,,574,,574,754,,607,,607,805,,579,,579,786,,505,,505,670,,454,,454,607,,384,,384,518,,303,,303,422,0.255,516,,516,687,0.318,574,,574,754,0.355,607,,607,805,0.236,579,,579,786,0.018,505,,505,670,-0.136,454,,454,607,-0.3,384,,384,518,-0.085,303,,303,422
Fullers Earth Sachet,EcoShield Pest Control,244,268,180,168,224,348,410,372,372,320,236,184,196,206,270,330,386,458,508,484,428,374,296,244,266,286,324,400,500,482,542,520,446,364,350,244,270,300,366,448,456,556,516,520,462,392,318,262,310,300,400,470,488,546,610,572,514,452,330,290,298,318,420,466,530,530,-1,-1,-1,566,566,-1,-1,-1,594,594,-1,-1,-1,568,568,-1,-1,-1,522,522,-1,-1,-1,448,448,-1,-1,-1,392,392,-1,-1,-1,278,278,-1,-1,-1,298,322,380,490,416,416,,416,492,445,445,,445,554,485,485,,485,592,461,461,,461,569,420,420,,420,520,367,367,,367,455,305,305,,305,384,242,242,,242,315,492,416,,416,492,554,445,,445,554,592,485,,485,592,569,461,,461,569,520,420,,420,520,455,367,,367,455,384,305,,305,384,315,242,,242,315,338,338,354,354,409,409,471,471,,416,,416,492,,445,,445,554,,485,,485,592,,461,,461,569,,420,,420,520,,367,,367,455,,305,,305,384,,242,,242,315,0.291,416,,416,492,0.223,445,,445,554,0.179,485,,485,592,0.013,461,,461,569,-0.081,420,,420,520,-0.206,367,,367,455,-0.427,305,,305,384,0.008,242,,242,315
Fullers Earth Sachet,Harvest Agro Traders,366,386,288,230,334,440,594,596,538,422,342,280,278,290,388,508,578,618,646,662,588,556,438,356,404,390,468,624,686,774,762,676,610,580,488,362,374,460,542,578,686,772,720,732,644,536,458,364,428,440,510,610,768,792,784,798,650,580,532,408,444,440,586,696,776,776,-1,-1,-1,868,868,-1,-1,-1,824,824,-1,-1,-1,768,768,-1,-1,-1,744,744,-1,-1,-1,614,614,-1,-1,-1,490,490,-1,-1,-1,400,400,-1,-1,-1,476,450,564,628,609,609,,609,743,698,698,,698,834,720,720,,720,862,697,697,,697,846,627,627,,627,756,525,525,,525,657,439,439,,439,548,359,359,,359,435,743,609,,609,743,834,698,,698,834,862,720,,720,862,846,697,,697,846,756,627,,627,756,657,525,,525,657,548,439,,439,548,435,359,,359,435,462,462,486,486,550,550,636,636,,609,,609,743,,698,,698,834,,720,,720,862,,697,,697,846,,627,,627,756,,525,,525,657,,439,,439,548,,359,,359,435,0.321,609,,609,743,0.344,698,,698,834,0.305,720,,720,862,0.168,697,,697,846,-0.039,627,,627,756,-0.174,525,,525,657,-0.366,439,,439,548,-0.081,359,,359,435
Fullers Earth Sachet,Urban Hygiene Authority,430,440,304,278,356,492,624,596,574,534,398,292,302,348,492,554,710,730,750,746,700,616,526,398,456,486,538,640,750,860,894,770,726,666,534,396,452,498,572,668,802,908,870,898,706,700,558,452,456,518,622,676,764,818,884,900,824,638,554,452,492,504,684,754,854,854,-1,-1,-1,958,958,-1,-1,-1,890,890,-1,-1,-1,864,864,-1,-1,-1,850,850,-1,-1,-1,682,682,-1,-1,-1,618,618,-1,-1,-1,484,484,-1,-1,-1,514,550,616,744,899,899,,899,800,981,981,,981,889,974,974,,974,914,931,931,,931,891,882,882,,882,827,756,756,,756,737,645,645,,645,629,526,526,,526,511,800,899,,899,800,889,981,,981,889,914,974,,974,914,891,931,,931,891,827,882,,882,827,737,756,,756,737,629,645,,645,629,511,526,,526,511,545,545,584,584,661,661,731,731,,899,,899,800,,981,,981,889,,974,,974,914,,931,,931,891,,882,,882,827,,756,,756,737,,645,,645,629,,526,,526,511,0.154,899,,899,800,0.217,981,,981,889,0.109,974,,974,914,0.042,931,,931,891,-0.085,882,,882,827,-0.203,756,,756,737,-0.388,645,,645,629,-0.101,526,,526,511
Fullers Earth Sachet,GreenField Agro Supplies,302,326,216,206,284,398,422,462,448,350,300,226,214,260,312,428,452,510,606,532,502,456,394,280,310,352,386,434,518,586,602,584,546,420,398,302,314,336,388,486,520,592,612,610,542,430,372,284,354,362,418,534,576,634,664,648,576,472,382,304,366,394,434,516,610,610,-1,-1,-1,648,648,-1,-1,-1,736,736,-1,-1,-1,664,664,-1,-1,-1,574,574,-1,-1,-1,532,532,-1,-1,-1,444,444,-1,-1,-1,338,338,-1,-1,-1,356,398,450,576,545,545,,545,574,620,620,,620,642,642,642,,642,688,614,614,,614,665,548,548,,548,614,475,475,,475,526,417,417,,417,465,326,326,,326,372,574,545,,545,574,642,620,,620,642,688,642,,642,688,665,614,,614,665,614,548,,548,614,526,475,,475,526,465,417,,417,465,372,326,,326,372,403,403,434,434,468,468,551,551,,545,,545,574,,620,,620,642,,642,,642,688,,614,,614,665,,548,,548,614,,475,,475,526,,417,,417,465,,326,,326,372,0.089,545,,545,574,0.22,620,,620,642,0.182,642,,642,688,0.031,614,,614,665,-0.079,548,,548,614,-0.292,475,,475,526,-0.385,417,,417,465,0,326,,326,372
Fullers Earth Sachet,Kaeferling Pro A - Old,294,322,242,186,274,388,480,442,426,400,318,222,232,272,314,412,518,566,546,564,546,408,348,278,318,368,432,448,582,636,590,562,534,430,362,286,326,336,422,534,582,662,610,614,512,486,438,304,346,390,424,490,628,652,682,692,612,468,428,304,376,380,432,562,588,588,-1,-1,-1,644,644,-1,-1,-1,652,652,-1,-1,-1,628,628,-1,-1,-1,594,594,-1,-1,-1,530,530,-1,-1,-1,438,438,-1,-1,-1,342,342,-1,-1,-1,398,394,514,566,831,831,,831,623,868,868,,868,663,932,932,,932,694,849,849,,849,674,771,771,,771,629,674,674,,674,522,588,588,,588,466,494,494,,494,426,623,831,,831,623,663,868,,868,663,694,932,,932,694,674,849,,849,674,629,771,,771,629,522,674,,674,522,466,588,,588,466,426,494,,494,426,429,429,452,452,502,502,584,584,,831,,831,623,,868,,868,663,,932,,932,694,,849,,849,674,,771,,771,629,,674,,674,522,,588,,588,466,,494,,494,426,0.154,831,,831,623,0.214,868,,868,663,0.281,932,,932,694,0.088,849,,849,674,-0.118,771,,771,629,-0.193,674,,674,522,-0.37,588,,588,466,-0.079,494,,494,426
"Vertox Whole Wheat Bait, 1 kg tub",UK Pest Solutions Ltd,2926,3080,2211,1914,2849,3718,4180,4763,4279,3355,2783,1947,2233,2607,3432,3751,4851,5588,5599,5929,5302,4268,3608,2761,3069,3443,4378,4576,5863,6017,6578,5984,4873,4796,3850,2915,3630,3542,4499,4730,6050,5863,6820,5951,5786,4686,4059,3080,3652,3916,4906,5632,6435,6974,7150,7040,5709,5104,4620,3421,3993,4301,4708,6050,6556,,,,,6831,,,,,7502,,,,,7524,,,,,5797,,,,,5335,,,,,4939,,,,,3476,,,,,4070,4576,4928,5852,,,11110,,,,,11506,,,,,11814,,,,,11451,,,,,10450,,,,,8591,,,,,7634,,,,,5511,,,,,11110,,,,,11506,,,,,11814,,,,,11451,,,,,10450,,,,,8591,,,,,7634,,,,,5511,,,,,,,,,,,11110,,11110,,,11506,,11506,,,11814,,11814,,,11451,,11451,,,10450,,10450,,,8591,,8591,,,7634,,7634,,,5511,,5511,,,,,11110,,,,,11506,,,,,11814,,,,,11451,,,,,10450,,,,,8591,,,,,7634,,,,,5511,,
"Vertox Whole Wheat Bait, 1 kg tub",Euro Agro Chemicals GmbH,1133,1287,935,759,1144,1518,1881,1936,1617,1584,1199,847,990,1067,1364,1650,2057,2057,2376,2156,2035,1716,1441,1078,1265,1397,1606,1804,2112,2508,2640,2607,2233,1826,1507,1243,1386,1419,1870,1969,2255,2519,2717,2607,2343,1859,1793,1210,1353,1551,1881,2343,2354,2640,2706,2640,2409,2013,1683,1419,1606,1551,2035,2486,2849,,,,,2838,,,,,3091,,,,,3069,,,,,2376,,,,,2255,,,,,1738,,,,,1364,,,,,1694,1826,2112,2574,,,4730,,,,,5258,,,,,5610,,,,,5104,,,,,4554,,,,,4158,,,,,3520,,,,,2585,,,,,4730,,,,,5258,,,,,5610,,,,,5104,,,,,4554,,,,,4158,,,,,3520,,,,,2585,,,,,,,,,,,4730,,4730,,,5258,,5258,,,5610,,5610,,,5104,,5104,,,4554,,4554,,,4158,,4158,,,3520,,3520,,,2585,,2585,,,,,4730,,,,,5258,,,,,5610,,,,,5104,,,,,4554,,,,,4158,,,,,3520,,,,,2585,,
"Vertox Whole Wheat Bait, 1 kg tub",Apex Pest Control Services,1232,1430,1056,858,1199,1606,1892,2222,1815,1694,1397,968,1056,1122,1551,1760,2255,2442,2761,2629,2222,1892,1617,1199,1452,1672,1815,2354,2684,2596,2695,2739,2420,2079,1914,1276,1463,1562,1914,2178,2486,2904,3135,2849,2398,2156,2035,1529,1727,1903,2156,2662,2838,3333,3245,3168,2926,2277,2090,1650,1804,1969,2332,2706,2794,,,,,3509,,,,,3487,,,,,3300,,,,,2794,,,,,2640,,,,,2013,,,,,1705,,,,,1991,2156,2596,2805,,,9812,,,,,9636,,,,,10131,,,,,10373,,,,,9328,,,,,7491,,,,,6578,,,,,5038,,,,,9812,,,,,9636,,,,,10131,,,,,10373,,,,,9328,,,,,7491,,,,,6578,,,,,5038,,,,,,,,,,,9812,,9812,,,9636,,9636,,,10131,,10131,,,10373,,10373,,,9328,,9328,,,7491,,7491,,,6578,,6578,,,5038,,5038,,,,,9812,,,,,9636,,,,,10131,,,,,10373,,,,,9328,,,,,7491,,,,,6578,,,,,5038,,
"Vertox Whole Wheat Bait, 1 kg tub",SafeHome Pest Control Pvt Ltd,660,770,506,462,704,957,1067,1034,1111,880,660,473,605,583,792,1001,1100,1309,1496,1375,1166,1155,968,693,814,869,1089,1133,1430,1463,1419,1430,1221,1177,968,748,858,957,1144,1331,1540,1573,1562,1551,1353,1243,1012,814,924,902,1089,1254,1529,1584,1650,1595,1375,1254,1155,847,968,1056,1254,1397,1529,,,,,1639,,,,,1826,,,,,1782,,,,,1518,,,,,1419,,,,,1221,,,,,946,,,,,1034,1045,1243,1562,,,10153,,,,,10351,,,,,11242,,,,,11143,,,,,9438,,,,,8701,,,,,6721,,,,,5577,,,,,10153,,,,,10351,,,,,11242,,,,,11143,,,,,9438,,,,,8701,,,,,6721,,,,,5577,,,,,,,,,,,10153,,10153,,,10351,,10351,,,11242,,11242,,,11143,,11143,,,9438,,9438,,,8701,,8701,,,6721,,6721,,,5577,,5577,,,,,10153,,,,,10351,,,,,11242,,,,,11143,,,,,9438,,,,,8701,,,,,6721,,,,,5577,,
"Vertox Whole Wheat Bait, 1 kg tub",Kaeferling Pro A,759,781,594,539,737,979,1221,1144,1045,902,726,561,594,616,880,1012,1232,1320,1540,1408,1210,1111,990,781,825,880,1144,1254,1496,1540,1507,1529,1463,1111,1023,836,825,979,1089,1386,1430,1650,1628,1716,1364,1265,1089,836,946,1045,1177,1518,1661,1859,1760,1771,1474,1386,1210,847,990,1045,1298,1397,1617,,,,,1991,,,,,1969,,,,,1848,,,,,1771,,,,,1408,,,,,1276,,,,,902,,,,,1056,1067,1298,1606,,,8294,,,,,8789,,,,,9658,,,,,8822,,,,,8426,,,,,7073,,,,,5698,,,,,4532,,,,,8294,,,,,8789,,,,,9658,,,,,8822,,,,,8426,,,,,7073,,,,,5698,,,,,4532,,,,,,,,,,,8294,,8294,,,8789,,8789,,,9658,,9658,,,8822,,8822,,,8426,,8426,,,7073,,7073,,,5698,,5698,,,4532,,4532,,,,,8294,,,,,8789,,,,,9658,,,,,8822,,,,,8426,,,,,7073,,,,,5698,,,,,4532,,
"Vertox Whole Wheat Bait, 1 kg tub",Nordic Pest Group AB,990,946,726,605,891,1221,1507,1375,1309,1089,913,660,803,880,1089,1320,1463,1672,1815,1969,1661,1375,1199,913,1122,1188,1320,1683,1947,2024,2057,1925,1683,1606,1188,968,1210,1155,1375,1650,1958,2002,1991,2156,1782,1628,1287,1067,1188,1342,1452,1639,1892,2200,2123,2123,2079,1738,1463,1177,1265,1309,1595,1749,2233,,,,,2398,,,,,2277,,,,,2387,,,,,2112,,,,,1683,,,,,1441,,,,,1265,,,,,1287,1375,1661,2079,,,7634,,,,,8107,,,,,8437,,,,,8140,,,,,6754,,,,,6391,,,,,5489,,,,,4235,,,,,7634,,,,,8107,,,,,8437,,,,,8140,,,,,6754,,,,,6391,,,,,5489,,,,,4235,,,,,,,,,,,7634,,7634,,,8107,,8107,,,8437,,8437,,,8140,,8140,,,6754,,6754,,,6391,,6391,,,5489,,5489,,,4235,,4235,,,,,7634,,,,,8107,,,,,8437,,,,,8140,,,,,6754,,,,,6391,,,,,5489,,,,,4235,,
"Vertox Whole Wheat Bait, 1 kg tub",Desert Shield Pest Mgmt,1254,1397,1012,891,1199,1518,2024,1980,1848,1551,1276,935,946,1188,1518,1705,1991,2409,2365,2497,2167,2002,1650,1276,1441,1573,1870,2178,2222,2651,2882,2497,2123,1903,1672,1232,1595,1584,1760,2376,2409,2849,2937,2695,2519,1991,1771,1309,1584,1562,2024,2332,2684,3036,3201,3102,2596,2167,2024,1474,1716,1683,2211,2409,2640,,,,,3245,,,,,3388,,,,,3234,,,,,2904,,,,,2244,,,,,1925,,,,,1430,,,,,1672,1815,2453,2530,,,5148,,,,,5555,,,,,6028,,,,,5533,,,,,5038,,,,,4312,,,,,3388,,,,,2761,,,,,5148,,,,,5555,,,,,6028,,,,,5533,,,,,5038,,,,,4312,,,,,3388,,,,,2761,,,,,,,,,,,5148,,5148,,,5555,,5555,,,6028,,6028,,,5533,,5533,,,5038,,5038,,,4312,,4312,,,3388,,3388,,,2761,,2761,,,,,5148,,,,,5555,,,,,6028,,,,,5533,,,,,5038,,,,,4312,,,,,3388,,,,,2761,,
"Vertox Whole Wheat Bait, 1 kg tub",AgroPlus Distributors SARL,2794,2651,2112,1881,2563,3487,3960,4158,3685,3157,2387,1980,2178,2178,3168,3520,4642,5148,4796,5390,4576,4191,3399,2442,2992,2959,3553,4455,4664,5060,5775,5489,5038,4356,3300,2519,3179,3124,4235,4400,5335,6083,5720,6138,5324,4213,4015,2684,3388,3784,4400,4763,5808,5764,6776,6017,5005,4785,4147,3025,3344,3575,4301,4928,6094,,,,,6622,,,,,6413,,,,,6666,,,,,5687,,,,,4708,,,,,4246,,,,,3036,,,,,3762,3718,4378,5467,,,6248,,,,,6677,,,,,7018,,,,,6886,,,,,6204,,,,,5016,,,,,4488,,,,,3487,,,,,6248,,,,,6677,,,,,7018,,,,,6886,,,,,6204,,,,,5016,,,,,4488,,,,,3487,,,,,,,,,,,6248,,6248,,,6677,,6677,,,7018,,7018,,,6886,,6886,,,6204,,6204,,,5016,,5016,,,4488,,4488,,,3487,,3487,,,,,6248,,,,,6677,,,,,7018,,,,,6886,,,,,6204,,,,,5016,,,,,4488,,,,,3487,,
"Vertox Whole Wheat Bait, 1 kg tub",CleanCity Municipal Services,2728,2926,2200,1848,2717,3399,4422,4081,4334,3729,2970,1903,2266,2464,3388,3729,4697,5390,5775,5896,4818,4334,3817,2728,2959,3399,4125,4510,5258,6160,5610,5599,5390,4202,3542,2849,3564,3333,4059,5313,5577,6237,6314,6644,5632,4972,3938,2948,3498,3520,4620,4950,5797,7029,6842,6226,5456,4917,4345,3080,3718,3806,4983,5852,6457,,,,,6512,,,,,6743,,,,,7293,,,,,6468,,,,,5610,,,,,4422,,,,,3355,,,,,3696,4092,5181,5984,,,7975,,,,,8151,,,,,8547,,,,,8877,,,,,7117,,,,,6424,,,,,5610,,,,,4488,,,,,7975,,,,,8151,,,,,8547,,,,,8877,,,,,7117,,,,,6424,,,,,5610,,,,,4488,,,,,,,,,,,7975,,7975,,,8151,,8151,,,8547,,8547,,,8877,,8877,,,7117,,7117,,,6424,,6424,,,5610,,5610,,,4488,,4488,,,,,7975,,,,,8151,,,,,8547,,,,,8877,,,,,7117,,,,,6424,,,,,5610,,,,,4488,,
"Vertox Whole Wheat Bait, 1 kg tub",FarmCare Retail Network,2046,2156,1661,1364,1848,2761,3047,3212,3069,2761,2123,1551,1606,1804,2497,2882,3311,4070,4312,4158,3729,3344,2662,1958,2332,2596,3278,3619,3850,4224,4290,4202,4158,3201,3003,2079,2541,2816,3410,3883,4235,4895,4994,4312,3850,3476,3102,2376,2464,2629,3586,3850,4807,4884,4983,5236,4466,3685,3366,2629,2970,3212,3454,4356,4587,,,,,4994,,,,,5555,,,,,5566,,,,,4532,,,,,4158,,,,,3498,,,,,2728,,,,,2959,3179,3883,4202,,,8239,,,,,8921,,,,,9383,,,,,8096,,,,,7480,,,,,6985,,,,,5841,,,,,4312,,,,,8239,,,,,8921,,,,,9383,,,,,8096,,,,,7480,,,,,6985,,,,,5841,,,,,4312,,,,,,,,,,,8239,,8239,,,8921,,8921,,,9383,,9383,,,8096,,8096,,,7480,,7480,,,6985,,6985,,,5841,,5841,,,4312,,4312,,,,,8239,,,,,8921,,,,,9383,,,,,8096,,,,,7480,,,,,6985,,,,,5841,,,,,4312,,
"Vertox Whole Wheat Bait, 1 kg tub",PestEx Solutions Inc,2838,2761,2156,1793,2563,3696,4026,4609,3894,3608,2827,2013,2277,2398,3388,3652,4268,5467,5302,5225,4631,4334,3652,2739,3289,3311,4136,4312,5258,5819,5885,6248,5049,4598,3520,2981,3234,3663,4092,4961,5687,6611,6017,5643,5643,4851,3971,3289,3520,3916,4191,5192,6413,6490,6237,7007,5500,4994,4103,3201,3718,3839,5049,5126,6457,,,,,6765,,,,,6853,,,,,6380,,,,,5984,,,,,4983,,,,,4345,,,,,3344,,,,,4048,4312,4873,6017,,,3267,,,,,3465,,,,,3894,,,,,3784,,,,,3322,,,,,2871,,,,,2365,,,,,1815,,,,,3267,,,,,3465,,,,,3894,,,,,3784,,,,,3322,,,,,2871,,,,,2365,,,,,1815,,,,,,,,,,,3267,,3267,,,3465,,3465,,,3894,,3894,,,3784,,3784,,,3322,,3322,,,2871,,2871,,,2365,,2365,,,1815,,1815,,,,,3267,,,,,3465,,,,,3894,,,,,3784,,,,,3322,,,,,2871,,,,,2365,,,,,1815,,
"Vertox Whole Wheat Bait, 1 kg tub",EcoShield Pest Control,2211,2398,1551,1474,1936,2585,3168,3146,2871,2805,2167,1408,1705,1760,2376,2684,3267,3817,4411,3828,3619,3212,2585,2167,2343,2398,2772,3509,4268,4510,4312,4334,3729,3311,2728,2024,2387,2618,3102,3982,4257,4400,4774,4653,4180,3619,2970,2255,2497,2937,3366,3762,4477,4653,4807,4620,4301,3476,3278,2332,2805,2838,3652,4455,4961,,,,,5214,,,,,5599,,,,,5280,,,,,4697,,,,,4059,,,,,3212,,,,,2618,,,,,3113,3113,3498,4587,,,3135,,,,,3366,,,,,3355,,,,,3223,,,,,2904,,,,,2475,,,,,2288,,,,,1661,,,,,3135,,,,,3366,,,,,3355,,,,,3223,,,,,2904,,,,,2475,,,,,2288,,,,,1661,,,,,,,,,,,3135,,3135,,,3366,,3366,,,3355,,3355,,,3223,,3223,,,2904,,2904,,,2475,,2475,,,2288,,2288,,,1661,,1661,,,,,3135,,,,,3366,,,,,3355,,,,,3223,,,,,2904,,,,,2475,,,,,2288,,,,,1661,,
"Vertox Whole Wheat Bait, 1 kg tub",Harvest Agro Traders,2860,3201,2387,2046,2629,3542,4191,4455,4070,3905,3124,2035,2266,2519,3564,3905,4664,5291,5720,6171,4829,4400,3993,2684,3487,3388,4224,5126,5742,5907,6743,6611,5236,4532,4345,3036,3531,3608,4543,5390,6061,6061,6457,6116,5852,5225,4114,3410,3729,3993,4895,5456,6248,6556,7392,6479,6226,4961,4477,3212,4015,4554,4895,6292,6721,,,,,6919,,,,,7535,,,,,7315,,,,,6347,,,,,5643,,,,,5148,,,,,3795,,,,,4081,4444,5280,6226,,,4785,,,,,5346,,,,,5192,,,,,4994,,,,,4345,,,,,3927,,,,,3256,,,,,2684,,,,,4785,,,,,5346,,,,,5192,,,,,4994,,,,,4345,,,,,3927,,,,,3256,,,,,2684,,,,,,,,,,,4785,,4785,,,5346,,5346,,,5192,,5192,,,4994,,4994,,,4345,,4345,,,3927,,3927,,,3256,,3256,,,2684,,2684,,,,,4785,,,,,5346,,,,,5192,,,,,4994,,,,,4345,,,,,3927,,,,,3256,,,,,2684,,
"Vertox Whole Wheat Bait, 1 kg tub",Urban Hygiene Authority,3388,3564,2420,2365,3179,4323,5280,4917,5060,4466,3256,2497,2783,2816,3817,4422,5676,5786,6644,6710,5555,4862,4411,3344,3927,3850,5148,5335,6589,6875,7326,6842,6325,5192,4664,3476,3839,4103,5126,5863,7084,7964,7975,7161,6171,6083,4939,3905,4048,4565,5478,5995,7392,8415,7502,7711,6545,5588,4917,4092,4422,4510,5346,6578,7139,,,,,8415,,,,,9152,,,,,8734,,,,,7238,,,,,6721,,,,,5225,,,,,3938,,,,,4400,4774,6545,7260,,,9031,,,,,9680,,,,,10252,,,,,9625,,,,,8327,,,,,8030,,,,,6853,,,,,5159,,,,,9031,,,,,9680,,,,,10252,,,,,9625,,,,,8327,,,,,8030,,,,,6853,,,,,5159,,,,,,,,,,,9031,,9031,,,9680,,9680,,,10252,,10252,,,9625,,9625,,,8327,,8327,,,8030,,8030,,,6853,,6853,,,5159,,5159,,,,,9031,,,,,9680,,,,,10252,,,,,9625,,,,,8327,,,,,8030,,,,,6853,,,,,5159,,
"Vertox Whole Wheat Bait, 1 kg tub",GreenField Agro Supplies,2541,2596,1815,1716,2189,3047,3564,3971,3432,2893,2288,1782,2013,2035,2970,3465,4114,4719,4477,5005,4334,3377,3256,2431,2574,3025,3432,3718,4807,5126,5192,4741,4554,3751,3058,2629,2871,3168,3707,3960,5060,5478,5445,5302,4961,4356,3542,2816,3102,3058,3850,4785,5181,5247,5764,5335,5181,4609,3608,2849,3124,3498,4444,4972,5577,,,,,6061,,,,,6380,,,,,5544,,,,,5236,,,,,4488,,,,,4037,,,,,2926,,,,,3432,3806,4158,5126,,,4917,,,,,5940,,,,,5874,,,,,5841,,,,,5060,,,,,4323,,,,,3883,,,,,2640,,,,,4917,,,,,5940,,,,,5874,,,,,5841,,,,,5060,,,,,4323,,,,,3883,,,,,2640,,,,,,,,,,,4917,,4917,,,5940,,5940,,,5874,,5874,,,5841,,5841,,,5060,,5060,,,4323,,4323,,,3883,,3883,,,2640,,2640,,,,,4917,,,,,5940,,,,,5874,,,,,5841,,,,,5060,,,,,4323,,,,,3883,,,,,2640,,
"Vertox Whole Wheat Bait, 1 kg tub",Kaeferling Pro A - Old,2431,2651,1892,1529,2332,3146,3872,4103,3674,2915,2596,1705,2013,2167,2728,3630,4081,4939,4521,4829,4389,3498,3091,2343,2794,3124,3421,4026,4675,5368,4961,4851,4763,4169,3102,2486,2893,3322,3740,4653,5126,4994,5269,5566,4730,4455,3652,2585,2893,3113,3839,4499,5214,6006,5544,5401,4686,4092,3641,2970,3300,3663,4070,4763,5478,,,,,5808,,,,,6171,,,,,6556,,,,,5192,,,,,4576,,,,,3839,,,,,2904,,,,,3641,3564,4477,4950,,,9856,,,,,9955,,,,,10692,,,,,10846,,,,,9372,,,,,7766,,,,,6710,,,,,5225,,,,,9856,,,,,9955,,,,,10692,,,,,10846,,,,,9372,,,,,7766,,,,,6710,,,,,5225,,,,,,,,,,,9856,,9856,,,9955,,9955,,,10692,,10692,,,10846,,10846,,,9372,,9372,,,7766,,7766,,,6710,,6710,,,5225,,5225,,,,,9856,,,,,9955,,,,,10692,,,,,10846,,,,,9372,,,,,7766,,,,,6710,,,,,5225,,
Vertox Whole Wheat - White Label Variant,UK Pest Solutions Ltd,1330,1400,1005,870,1295,1690,1900,2165,1945,1525,1265,885,1015,1185,1560,1705,2205,2540,2545,2695,2410,1940,1640,1255,1395,1565,1990,2080,2665,2735,2990,2720,2215,2180,1750,1325,1650,1610,2045,2150,2750,2665,3100,2705,2630,2130,1845,1400,1660,1780,2230,2560,2925,3170,3250,3200,2595,2320,2100,1555,1815,1955,2140,2750,2980,2980,-1,-1,-1,3105,3105,-1,-1,-1,3410,3410,-1,-1,-1,3420,3420,-1,-1,-1,2635,2635,-1,-1,-1,2425,2425,-1,-1,-1,2245,2245,-1,-1,-1,1580,1580,-1,-1,-1,1850,2080,2240,2660,4040,4040,,4040,3030,4226,4226,,4226,3223,4423,4423,,4423,3477,4303,4303,,4303,3402,3806,3806,,3806,2863,3201,3201,,3201,2497,2825,2825,,2825,2180,2051,2051,,2051,1597,3030,4040,,4040,3030,3223,4226,,4226,3223,3477,4423,,4423,3477,3402,4303,,4303,3402,2863,3806,,3806,2863,2497,3201,,3201,2497,2180,2825,,2825,2180,1597,2051,,2051,1597,1854,1854,2028,2028,2297,2297,2608,2608,,4040,,4040,3030,,4226,,4226,3223,,4423,,4423,3477,,4303,,4303,3402,,3806,,3806,2863,,3201,,3201,2497,,2825,,2825,2180,,2051,,2051,1597,0.356,4040,,4040,3030,0.344,4226,,4226,3223,0.225,4423,,4423,3477,0.205,4303,,4303,3402,-0.006,3806,,3806,2863,-0.215,3201,,3201,2497,-0.356,2825,,2825,2180,-0.061,2051,,2051,1597
Vertox Whole Wheat - White Label Variant,Euro Agro Chemicals GmbH,515,585,425,345,520,690,855,880,735,720,545,385,450,485,620,750,935,935,1080,980,925,780,655,490,575,635,730,820,960,1140,1200,1185,1015,830,685,565,630,645,850,895,1025,1145,1235,1185,1065,845,815,550,615,705,855,1065,1070,1200,1230,1200,1095,915,765,645,730,705,925,1130,1295,1295,-1,-1,-1,1290,1290,-1,-1,-1,1405,1405,-1,-1,-1,1395,1395,-1,-1,-1,1080,1080,-1,-1,-1,1025,1025,-1,-1,-1,790,790,-1,-1,-1,620,620,-1,-1,-1,770,830,960,1170,1684,1684,,1684,1218,1851,1851,,1851,1312,1978,1978,,1978,1407,1846,1846,,1846,1372,1643,1643,,1643,1216,1484,1484,,1484,1078,1264,1264,,1264,929,966,966,,966,758,1218,1684,,1684,1218,1312,1851,,1851,1312,1407,1978,,1978,1407,1372,1846,,1846,1372,1216,1643,,1643,1216,1078,1484,,1484,1078,929,1264,,1264,929,758,966,,966,758,842,842,880,880,1029,1029,1158,1158,,1684,,1684,1218,,1851,,1851,1312,,1978,,1978,1407,,1846,,1846,1372,,1643,,1643,1216,,1484,,1484,1078,,1264,,1264,929,,966,,966,758,0.31,1684,,1684,1218,0.288,1851,,1851,1312,0.245,1978,,1978,1407,0.046,1846,,1846,1372,0.016,1643,,1643,1216,-0.205,1484,,1484,1078,-0.382,1264,,1264,929,-0.157,966,,966,758
Vertox Whole Wheat - White Label Variant,Apex Pest Control Services,560,650,480,390,545,730,860,1010,825,770,635,440,480,510,705,800,1025,1110,1255,1195,1010,860,735,545,660,760,825,1070,1220,1180,1225,1245,1100,945,870,580,665,710,870,990,1130,1320,1425,1295,1090,980,925,695,785,865,980,1210,1290,1515,1475,1440,1330,1035,950,750,820,895,1060,1230,1270,1270,-1,-1,-1,1595,1595,-1,-1,-1,1585,1585,-1,-1,-1,1500,1500,-1,-1,-1,1270,1270,-1,-1,-1,1200,1200,-1,-1,-1,915,915,-1,-1,-1,775,775,-1,-1,-1,905,980,1180,1275,2918,2918,,2918,1376,2959,2959,,2959,1539,3103,3103,,3103,1602,3147,3147,,3147,1580,2822,2822,,2822,1405,2336,2336,,2336,1267,2065,2065,,2065,1141,1612,1612,,1612,935,1376,2918,,2918,1376,1539,2959,,2959,1539,1602,3103,,3103,1602,1580,3147,,3147,1580,1405,2822,,2822,1405,1267,2336,,2336,1267,1141,2065,,2065,1141,935,1612,,1612,935,1024,1024,1093,1093,1218,1218,1342,1342,,2918,,2918,1376,,2959,,2959,1539,,3103,,3103,1602,,3147,,3147,1580,,2822,,2822,1405,,2336,,2336,1267,,2065,,2065,1141,,1612,,1612,935,0.33,2918,,2918,1376,0.277,2959,,2959,1539,0.288,3103,,3103,1602,0.055,3147,,3147,1580,0.024,2822,,2822,1405,-0.225,2336,,2336,1267,-0.343,2065,,2065,1141,-0.091,1612,,1612,935
Vertox Whole Wheat - White Label Variant,SafeHome Pest Control Pvt Ltd,300,350,230,210,320,435,485,470,505,400,300,215,275,265,360,455,500,595,680,625,530,525,440,315,370,395,495,515,650,665,645,650,555,535,440,340,390,435,520,605,700,715,710,705,615,565,460,370,420,410,495,570,695,720,750,725,625,570,525,385,440,480,570,635,695,695,-1,-1,-1,745,745,-1,-1,-1,830,830,-1,-1,-1,810,810,-1,-1,-1,690,690,-1,-1,-1,645,645,-1,-1,-1,555,555,-1,-1,-1,430,430,-1,-1,-1,470,475,565,710,2677,2677,,2677,740,2747,2747,,2747,790,2967,2967,,2967,824,2933,2933,,2933,802,2505,2505,,2505,721,2313,2313,,2313,671,1819,1819,,1819,583,1503,1503,,1503,471,740,2677,,2677,740,790,2747,,2747,790,824,2967,,2967,824,802,2933,,2933,802,721,2505,,2505,721,671,2313,,2313,671,583,1819,,1819,583,471,1503,,1503,471,521,521,535,535,618,618,689,689,,2677,,2677,740,,2747,,2747,790,,2967,,2967,824,,2933,,2933,802,,2505,,2505,721,,2313,,2313,671,,1819,,1819,583,,1503,,1503,471,0.143,2677,,2677,740,0.207,2747,,2747,790,0.226,2967,,2967,824,0.057,2933,,2933,802,-0.102,2505,,2505,721,-0.196,2313,,2313,671,-0.446,1819,,1819,583,-0.013,1503,,1503,471
Vertox Whole Wheat - White Label Variant,Kaeferling Pro A,345,355,270,245,335,445,555,520,475,410,330,255,270,280,400,460,560,600,700,640,550,505,450,355,375,400,520,570,680,700,685,695,665,505,465,380,375,445,495,630,650,750,740,780,620,575,495,380,430,475,535,690,755,845,800,805,670,630,550,385,450,475,590,635,735,735,-1,-1,-1,905,905,-1,-1,-1,895,895,-1,-1,-1,840,840,-1,-1,-1,805,805,-1,-1,-1,640,640,-1,-1,-1,580,580,-1,-1,-1,410,410,-1,-1,-1,480,485,590,730,2263,2263,,2263,756,2432,2432,,2432,869,2651,2651,,2651,913,2451,2451,,2451,892,2310,2310,,2310,791,1950,1950,,1950,686,1595,1595,,1595,601,1258,1258,,1258,457,756,2263,,2263,756,869,2432,,2432,869,913,2651,,2651,913,892,2451,,2451,892,791,2310,,2310,791,686,1950,,1950,686,601,1595,,1595,601,457,1258,,1258,457,479,479,517,517,587,587,669,669,,2263,,2263,756,,2432,,2432,869,,2651,,2651,913,,2451,,2451,892,,2310,,2310,791,,1950,,1950,686,,1595,,1595,601,,1258,,1258,457,0.216,2263,,2263,756,0.205,2432,,2432,869,0.119,2651,,2651,913,0.018,2451,,2451,892,-0.132,2310,,2310,791,-0.255,1950,,1950,686,-0.406,1595,,1595,601,-0.018,1258,,1258,457
Vertox Whole Wheat - White Label Variant,Nordic Pest Group AB,450,430,330,275,405,555,685,625,595,495,415,300,365,400,495,600,665,760,825,895,755,625,545,415,510,540,600,765,885,920,935,875,765,730,540,440,550,525,625,750,890,910,905,980,810,740,585,485,540,610,660,745,860,1000,965,965,945,790,665,535,575,595,725,795,1015,1015,-1,-1,-1,1090,1090,-1,-1,-1,1035,1035,-1,-1,-1,1085,1085,-1,-1,-1,960,960,-1,-1,-1,765,765,-1,-1,-1,655,655,-1,-1,-1,575,575,-1,-1,-1,585,625,755,945,2225,2225,,2225,980,2373,2373,,2373,1061,2455,2455,,2455,1076,2392,2392,,2392,1085,2025,2025,,2025,981,1884,1884,,1884,863,1615,1615,,1615,736,1273,1273,,1273,622,980,2225,,2225,980,1061,2373,,2373,1061,1076,2455,,2455,1076,1085,2392,,2392,1085,981,2025,,2025,981,863,1884,,1884,863,736,1615,,1615,736,622,1273,,1273,622,681,681,705,705,795,795,903,903,,2225,,2225,980,,2373,,2373,1061,,2455,,2455,1076,,2392,,2392,1085,,2025,,2025,981,,1884,,1884,863,,1615,,1615,736,,1273,,1273,622,0.128,2225,,2225,980,0.329,2373,,2373,1061,0.215,2455,,2455,1076,0.107,2392,,2392,1085,-0.087,2025,,2025,981,-0.228,1884,,1884,863,-0.423,1615,,1615,736,-0.087,1273,,1273,622
Vertox Whole Wheat - White Label Variant,Desert Shield Pest Mgmt,570,635,460,405,545,690,920,900,840,705,580,425,430,540,690,775,905,1095,1075,1135,985,910,750,580,655,715,850,990,1010,1205,1310,1135,965,865,760,560,725,720,800,1080,1095,1295,1335,1225,1145,905,805,595,720,710,920,1060,1220,1380,1455,1410,1180,985,920,670,780,765,1005,1095,1200,1200,-1,-1,-1,1475,1475,-1,-1,-1,1540,1540,-1,-1,-1,1470,1470,-1,-1,-1,1320,1320,-1,-1,-1,1020,1020,-1,-1,-1,875,875,-1,-1,-1,650,650,-1,-1,-1,760,825,1115,1150,1790,1790,,1790,1240,2000,2000,,2000,1476,2153,2153,,2153,1567,2001,2001,,2001,1488,1801,1801,,1801,1312,1522,1522,,1522,1085,1242,1242,,1242,945,977,977,,977,699,1240,1790,,1790,1240,1476,2000,,2000,1476,1567,2153,,2153,1567,1488,2001,,2001,1488,1312,1801,,1801,1312,1085,1522,,1522,1085,945,1242,,1242,945,699,977,,977,699,811,811,859,859,1044,1044,1160,1160,,1790,,1790,1240,,2000,,2000,1476,,2153,,2153,1567,,2001,,2001,1488,,1801,,1801,1312,,1522,,1522,1085,,1242,,1242,945,,977,,977,699,0.15,1790,,1790,1240,0.366,2000,,2000,1476,0.217,2153,,2153,1567,0.035,2001,,2001,1488,-0.089,1801,,1801,1312,-0.172,1522,,1522,1085,-0.398,1242,,1242,945,0.016,977,,977,699
Vertox Whole Wheat - White Label Variant,AgroPlus Distributors SARL,1270,1205,960,855,1165,1585,1800,1890,1675,1435,1085,900,990,990,1440,1600,2110,2340,2180,2450,2080,1905,1545,1110,1360,1345,1615,2025,2120,2300,2625,2495,2290,1980,1500,1145,1445,1420,1925,2000,2425,2765,2600,2790,2420,1915,1825,1220,1540,1720,2000,2165,2640,2620,3080,2735,2275,2175,1885,1375,1520,1625,1955,2240,2770,2770,-1,-1,-1,3010,3010,-1,-1,-1,2915,2915,-1,-1,-1,3030,3030,-1,-1,-1,2585,2585,-1,-1,-1,2140,2140,-1,-1,-1,1930,1930,-1,-1,-1,1380,1380,-1,-1,-1,1710,1690,1990,2485,2742,2742,,2742,2644,2998,2998,,2998,2962,3143,3143,,3143,3096,3143,3143,,3143,3156,2782,2782,,2782,2744,2332,2332,,2332,2384,2019,2019,,2019,1998,1529,1529,,1529,1473,2644,2742,,2742,2644,2962,2998,,2998,2962,3096,3143,,3143,3096,3156,3143,,3143,3156,2744,2782,,2782,2744,2384,2332,,2332,2384,1998,2019,,2019,1998,1473,1529,,1529,1473,1700,1700,1726,1726,2018,2018,2206,2206,,2742,,2742,2644,,2998,,2998,2962,,3143,,3143,3096,,3143,,3143,3156,,2782,,2782,2744,,2332,,2332,2384,,2019,,2019,1998,,1529,,1529,1473,0.209,2742,,2742,2644,0.299,2998,,2998,2962,0.176,3143,,3143,3096,0.1,3143,,3143,3156,-0.091,2782,,2782,2744,-0.197,2332,,2332,2384,-0.406,2019,,2019,1998,-0.132,1529,,1529,1473
Vertox Whole Wheat - White Label Variant,CleanCity Municipal Services,1240,1330,1000,840,1235,1545,2010,1855,1970,1695,1350,865,1030,1120,1540,1695,2135,2450,2625,2680,2190,1970,1735,1240,1345,1545,1875,2050,2390,2800,2550,2545,2450,1910,1610,1295,1620,1515,1845,2415,2535,2835,2870,3020,2560,2260,1790,1340,1590,1600,2100,2250,2635,3195,3110,2830,2480,2235,1975,1400,1690,1730,2265,2660,2935,2935,-1,-1,-1,2960,2960,-1,-1,-1,3065,3065,-1,-1,-1,3315,3315,-1,-1,-1,2940,2940,-1,-1,-1,2550,2550,-1,-1,-1,2010,2010,-1,-1,-1,1525,1525,-1,-1,-1,1680,1860,2355,2720,3269,3269,,3269,2913,3461,3461,,3461,3218,3581,3581,,3581,3278,3650,3650,,3650,3266,3105,3105,,3105,2976,2776,2776,,2776,2633,2405,2405,,2405,2260,1913,1913,,1913,1786,2913,3269,,3269,2913,3218,3461,,3461,3218,3278,3581,,3581,3278,3266,3650,,3650,3266,2976,3105,,3105,2976,2633,2776,,2776,2633,2260,2405,,2405,2260,1786,1913,,1913,1786,1994,1994,2056,2056,2452,2452,2708,2708,,3269,,3269,2913,,3461,,3461,3218,,3581,,3581,3278,,3650,,3650,3266,,3105,,3105,2976,,2776,,2776,2633,,2405,,2405,2260,,1913,,1913,1786,0.236,3269,,3269,2913,0.333,3461,,3461,3218,0.176,3581,,3581,3278,0.055,3650,,3650,3266,-0.073,3105,,3105,2976,-0.17,2776,,2776,2633,-0.382,2405,,2405,2260,-0.073,1913,,1913,1786
Vertox Whole Wheat - White Label Variant,FarmCare Retail Network,930,980,755,620,840,1255,1385,1460,1395,1255,965,705,730,820,1135,1310,1505,1850,1960,1890,1695,1520,1210,890,1060,1180,1490,1645,1750,1920,1950,1910,1890,1455,1365,945,1155,1280,1550,1765,1925,2225,2270,1960,1750,1580,1410,1080,1120,1195,1630,1750,2185,2220,2265,2380,2030,1675,1530,1195,1350,1460,1570,1980,2085,2085,-1,-1,-1,2270,2270,-1,-1,-1,2525,2525,-1,-1,-1,2530,2530,-1,-1,-1,2060,2060,-1,-1,-1,1890,1890,-1,-1,-1,1590,1590,-1,-1,-1,1240,1240,-1,-1,-1,1345,1445,1765,1910,2979,2979,,2979,2214,3238,3238,,3238,2421,3416,3416,,3416,2567,3107,3107,,3107,2535,2785,2785,,2785,2171,2536,2536,,2536,1898,2149,2149,,2149,1644,1608,1608,,1608,1257,2214,2979,,2979,2214,2421,3238,,3238,2421,2567,3416,,3416,2567,2535,3107,,3107,2535,2171,2785,,2785,2171,1898,2536,,2536,1898,1644,2149,,2149,1644,1257,1608,,1608,1257,1382,1382,1497,1497,1787,1787,2008,2008,,2979,,2979,2214,,3238,,3238,2421,,3416,,3416,2567,,3107,,3107,2535,,2785,,2785,2171,,2536,,2536,1898,,2149,,2149,1644,,1608,,1608,1257,0.306,2979,,2979,2214,0.336,3238,,3238,2421,0.262,3416,,3416,2567,0.105,3107,,3107,2535,-0.061,2785,,2785,2171,-0.132,2536,,2536,1898,-0.38,2149,,2149,1644,-0.006,1608,,1608,1257
Vertox Whole Wheat - White Label Variant,PestEx Solutions Inc,1290,1255,980,815,1165,1680,1830,2095,1770,1640,1285,915,1035,1090,1540,1660,1940,2485,2410,2375,2105,1970,1660,1245,1495,1505,1880,1960,2390,2645,2675,2840,2295,2090,1600,1355,1470,1665,1860,2255,2585,3005,2735,2565,2565,2205,1805,1495,1600,1780,1905,2360,2915,2950,2835,3185,2500,2270,1865,1455,1690,1745,2295,2330,2935,2935,-1,-1,-1,3075,3075,-1,-1,-1,3115,3115,-1,-1,-1,2900,2900,-1,-1,-1,2720,2720,-1,-1,-1,2265,2265,-1,-1,-1,1975,1975,-1,-1,-1,1520,1520,-1,-1,-1,1840,1960,2215,2735,2207,2207,,2207,2930,2411,2411,,2411,3248,2482,2482,,2482,3195,2474,2474,,2474,3229,2186,2186,,2186,2862,1939,1939,,1939,2574,1624,1624,,1624,2174,1309,1309,,1309,1794,2930,2207,,2207,2930,3248,2411,,2411,3248,3195,2482,,2482,3195,3229,2474,,2474,3229,2862,2186,,2186,2862,2574,1939,,1939,2574,2174,1624,,1624,2174,1794,1309,,1309,1794,1984,1984,2106,2106,2398,2398,2654,2654,,2207,,2207,2930,,2411,,2411,3248,,2482,,2482,3195,,2474,,2474,3229,,2186,,2186,2862,,1939,,1939,2574,,1624,,1624,2174,,1309,,1309,1794,0.201,2207,,2207,2930,0.258,2411,,2411,3248,0.208,2482,,2482,3195,0.107,2474,,2474,3229,-0.013,2186,,2186,2862,-0.164,1939,,1939,2574,-0.365,1624,,1624,2174,-0.034,1309,,1309,1794
Vertox Whole Wheat - White Label Variant,EcoShield Pest Control,1005,1090,705,670,880,1175,1440,1430,1305,1275,985,640,775,800,1080,1220,1485,1735,2005,1740,1645,1460,1175,985,1065,1090,1260,1595,1940,2050,1960,1970,1695,1505,1240,920,1085,1190,1410,1810,1935,2000,2170,2115,1900,1645,1350,1025,1135,1335,1530,1710,2035,2115,2185,2100,1955,1580,1490,1060,1275,1290,1660,2025,2255,2255,-1,-1,-1,2370,2370,-1,-1,-1,2545,2545,-1,-1,-1,2400,2400,-1,-1,-1,2135,2135,-1,-1,-1,1845,1845,-1,-1,-1,1460,1460,-1,-1,-1,1190,1190,-1,-1,-1,1415,1415,1590,2085,1827,1827,,1827,2229,1950,1950,,1950,2371,2015,2015,,2015,2505,1934,1934,,1934,2404,1763,1763,,1763,2207,1551,1551,,1551,1977,1369,1369,,1369,1699,1065,1065,,1065,1376,2229,1827,,1827,2229,2371,1950,,1950,2371,2505,2015,,2015,2505,2404,1934,,1934,2404,2207,1763,,1763,2207,1977,1551,,1551,1977,1699,1369,,1369,1699,1376,1065,,1065,1376,1526,1526,1583,1583,1787,1787,2075,2075,,1827,,1827,2229,,1950,,1950,2371,,2015,,2015,2505,,1934,,1934,2404,,1763,,1763,2207,,1551,,1551,1977,,1369,,1369,1699,,1065,,1065,1376,0.354,1827,,1827,2229,0.406,1950,,1950,2371,0.199,2015,,2015,2505,0.107,1934,,1934,2404,0.015,1763,,1763,2207,-0.157,1551,,1551,1977,-0.348,1369,,1369,1699,-0.102,1065,,1065,1376
Vertox Whole Wheat - White Label Variant,Harvest Agro Traders,1300,1455,1085,930,1195,1610,1905,2025,1850,1775,1420,925,1030,1145,1620,1775,2120,2405,2600,2805,2195,2000,1815,1220,1585,1540,1920,2330,2610,2685,3065,3005,2380,2060,1975,1380,1605,1640,2065,2450,2755,2755,2935,2780,2660,2375,1870,1550,1695,1815,2225,2480,2840,2980,3360,2945,2830,2255,2035,1460,1825,2070,2225,2860,3055,3055,-1,-1,-1,3145,3145,-1,-1,-1,3425,3425,-1,-1,-1,3325,3325,-1,-1,-1,2885,2885,-1,-1,-1,2565,2565,-1,-1,-1,2340,2340,-1,-1,-1,1725,1725,-1,-1,-1,1855,2020,2400,2830,2632,2632,,2632,3090,2833,2833,,2833,3237,2963,2963,,2963,3566,2841,2841,,2841,3413,2497,2497,,2497,3019,2204,2204,,2204,2623,1899,1899,,1899,2318,1455,1455,,1455,1690,3090,2632,,2632,3090,3237,2833,,2833,3237,3566,2963,,2963,3566,3413,2841,,2841,3413,3019,2497,,2497,3019,2623,2204,,2204,2623,2318,1899,,1899,2318,1690,1455,,1455,1690,1924,1924,2093,2093,2430,2430,2861,2861,,2632,,2632,3090,,2833,,2833,3237,,2963,,2963,3566,,2841,,2841,3413,,2497,,2497,3019,,2204,,2204,2623,,1899,,1899,2318,,1455,,1455,1690,0.184,2632,,2632,3090,0.259,2833,,2833,3237,0.334,2963,,2963,3566,0.036,2841,,2841,3413,-0.018,2497,,2497,3019,-0.178,2204,,2204,2623,-0.408,1899,,1899,2318,0.015,1455,,1455,1690
Vertox Whole Wheat - White Label Variant,Urban Hygiene Authority,1540,1620,1100,1075,1445,1965,2400,2235,2300,2030,1480,1135,1265,1280,1735,2010,2580,2630,3020,3050,2525,2210,2005,1520,1785,1750,2340,2425,2995,3125,3330,3110,2875,2360,2120,1580,1745,1865,2330,2665,3220,3620,3625,3255,2805,2765,2245,1775,1840,2075,2490,2725,3360,3825,3410,3505,2975,2540,2235,1860,2010,2050,2430,2990,3245,3245,-1,-1,-1,3825,3825,-1,-1,-1,4160,4160,-1,-1,-1,3970,3970,-1,-1,-1,3290,3290,-1,-1,-1,3055,3055,-1,-1,-1,2375,2375,-1,-1,-1,1790,1790,-1,-1,-1,2000,2170,2975,3300,3801,3801,,3801,3497,4202,4202,,4202,4004,4382,4382,,4382,4105,4161,4161,,4161,3947,3561,3561,,3561,3338,3335,3335,,3335,3021,2789,2789,,2789,2463,2129,2129,,2129,1913,3497,3801,,3801,3497,4004,4202,,4202,4004,4105,4382,,4382,4105,3947,4161,,4161,3947,3338,3561,,3561,3338,3021,3335,,3335,3021,2463,2789,,2789,2463,1913,2129,,2129,1913,2096,2096,2238,2238,2867,2867,3244,3244,,3801,,3801,3497,,4202,,4202,4004,,4382,,4382,4105,,4161,,4161,3947,,3561,,3561,3338,,3335,,3335,3021,,2789,,2789,2463,,2129,,2129,1913,0.213,3801,,3801,3497,0.249,4202,,4202,4004,0.114,4382,,4382,4105,-0.003,4161,,4161,3947,-0.034,3561,,3561,3338,-0.232,3335,,3335,3021,-0.408,2789,,2789,2463,-0.089,2129,,2129,1913
Vertox Whole Wheat - White Label Variant,GreenField Agro Supplies,1155,1180,825,780,995,1385,1620,1805,1560,1315,1040,810,915,925,1350,1575,1870,2145,2035,2275,1970,1535,1480,1105,1170,1375,1560,1690,2185,2330,2360,2155,2070,1705,1390,1195,1305,1440,1685,1800,2300,2490,2475,2410,2255,1980,1610,1280,1410,1390,1750,2175,2355,2385,2620,2425,2355,2095,1640,1295,1420,1590,2020,2260,2535,2535,-1,-1,-1,2755,2755,-1,-1,-1,2900,2900,-1,-1,-1,2520,2520,-1,-1,-1,2380,2380,-1,-1,-1,2040,2040,-1,-1,-1,1835,1835,-1,-1,-1,1330,1330,-1,-1,-1,1560,1730,1890,2330,2420,2420,,2420,2606,2748,2748,,2748,2797,2796,2796,,2796,2923,2673,2673,,2673,2691,2416,2416,,2416,2532,2069,2069,,2069,2174,1802,1802,,1802,1840,1302,1302,,1302,1404,2606,2420,,2420,2606,2797,2748,,2748,2797,2923,2796,,2796,2923,2691,2673,,2673,2691,2532,2416,,2416,2532,2174,2069,,2069,2174,1840,1802,,1802,1840,1404,1302,,1302,1404,1578,1578,1728,1728,2009,2009,2355,2355,,2420,,2420,2606,,2748,,2748,2797,,2796,,2796,2923,,2673,,2673,2691,,2416,,2416,2532,,2069,,2069,2174,,1802,,1802,1840,,1302,,1302,1404,0.312,2420,,2420,2606,0.192,2748,,2748,2797,0.276,2796,,2796,2923,0.079,2673,,2673,2691,-0.079,2416,,2416,2532,-0.19,2069,,2069,2174,-0.393,1802,,1802,1840,0.024,1302,,1302,1404
Vertox Whole Wheat - White Label Variant,Kaeferling Pro A - Old,1105,1205,860,695,1060,1430,1760,1865,1670,1325,1180,775,915,985,1240,1650,1855,2245,2055,2195,1995,1590,1405,1065,1270,1420,1555,1830,2125,2440,2255,2205,2165,1895,1410,1130,1315,1510,1700,2115,2330,2270,2395,2530,2150,2025,1660,1175,1315,1415,1745,2045,2370,2730,2520,2455,2130,1860,1655,1350,1500,1665,1850,2165,2490,2490,-1,-1,-1,2640,2640,-1,-1,-1,2805,2805,-1,-1,-1,2980,2980,-1,-1,-1,2360,2360,-1,-1,-1,2080,2080,-1,-1,-1,1745,1745,-1,-1,-1,1320,1320,-1,-1,-1,1655,1620,2035,2250,3505,3505,,3505,2530,3649,3649,,3649,2773,3814,3814,,3814,2768,3880,3880,,3880,2831,3393,3393,,3393,2526,2881,2881,,2881,2233,2493,2493,,2493,1936,1963,1963,,1963,1552,2530,3505,,3505,2530,2773,3649,,3649,2773,2768,3814,,3814,2768,2831,3880,,3880,2831,2526,3393,,3393,2526,2233,2881,,2881,2233,1936,2493,,2493,1936,1552,1963,,1963,1552,1739,1739,1841,1841,2076,2076,2352,2352,,3505,,3505,2530,,3649,,3649,2773,,3814,,3814,2768,,3880,,3880,2831,,3393,,3393,2526,,2881,,2881,2233,,2493,,2493,1936,,1963,,1963,1552,0.245,3505,,3505,2530,0.172,3649,,3649,2773,0.115,3814,,3814,2768,0.056,3880,,3880,2831,-0.157,3393,,3393,2526,-0.202,2881,,2881,2233,-0.443,2493,,2493,1936,-0.079,1963,,1963,1552
"Vertox Whole Wheat Bait, 5 kg tub",UK Pest Solutions Ltd,979,968,715,671,869,1298,1507,1595,1441,1199,913,693,704,880,1067,1364,1562,1848,1760,1782,1628,1507,1221,913,1155,1243,1386,1584,1969,1870,2057,1903,1749,1474,1276,1012,1078,1320,1507,1837,2123,2244,2156,1980,2013,1727,1419,1078,1320,1419,1518,1837,2090,2255,2343,2464,2112,1804,1595,1111,1254,1408,1705,2013,2387,,,,,2541,,,,,2662,,,,,2563,,,,,2277,,,,,1793,,,,,1628,,,,,1166,,,,,1452,1441,1672,2112,,,4224,,,,,4565,,,,,4961,,,,,4400,,,,,4103,,,,,3685,,,,,3146,,,,,2255,,,,,4224,,,,,4565,,,,,4961,,,,,4400,,,,,4103,,,,,3685,,,,,3146,,,,,2255,,,,,,,,,,,4224,,4224,,,4565,,4565,,,4961,,4961,,,4400,,4400,,,4103,,4103,,,3685,,3685,,,3146,,3146,,,2255,,2255,,,,,4224,,,,,4565,,,,,4961,,,,,4400,,,,,4103,,,,,3685,,,,,3146,,,,,2255,,
"Vertox Whole Wheat Bait, 5 kg tub",Euro Agro Chemicals GmbH,363,407,297,253,363,506,649,616,539,451,407,286,319,363,462,550,682,682,726,759,693,627,517,363,462,451,616,693,737,803,792,891,781,660,506,407,462,539,572,748,770,913,957,847,759,726,539,440,517,561,638,770,858,1012,957,1012,869,748,583,451,583,594,649,847,869,,,,,1001,,,,,1023,,,,,1034,,,,,880,,,,,814,,,,,660,,,,,473,,,,,605,616,770,902,,,1936,,,,,2046,,,,,2167,,,,,1991,,,,,1859,,,,,1628,,,,,1375,,,,,1067,,,,,1936,,,,,2046,,,,,2167,,,,,1991,,,,,1859,,,,,1628,,,,,1375,,,,,1067,,,,,,,,,,,1936,,1936,,,2046,,2046,,,2167,,2167,,,1991,,1991,,,1859,,1859,,,1628,,1628,,,1375,,1375,,,1067,,1067,,,,,1936,,,,,2046,,,,,2167,,,,,1991,,,,,1859,,,,,1628,,,,,1375,,,,,1067,,
"Vertox Whole Wheat Bait, 5 kg tub",Apex Pest Control Services,451,473,319,308,440,583,671,671,704,583,418,308,352,407,495,583,715,803,825,880,825,726,594,440,495,539,627,803,869,935,913,869,814,759,638,462,517,616,660,869,869,924,1078,957,913,726,671,484,616,594,704,924,1012,1155,1155,1001,979,803,649,539,627,638,726,946,1001,,,,,1166,,,,,1265,,,,,1100,,,,,1001,,,,,814,,,,,693,,,,,572,,,,,616,660,902,1045,,,4004,,,,,4136,,,,,4290,,,,,4103,,,,,3619,,,,,3047,,,,,2651,,,,,2167,,,,,4004,,,,,4136,,,,,4290,,,,,4103,,,,,3619,,,,,3047,,,,,2651,,,,,2167,,,,,,,,,,,4004,,4004,,,4136,,4136,,,4290,,4290,,,4103,,4103,,,3619,,3619,,,3047,,3047,,,2651,,2651,,,2167,,2167,,,,,4004,,,,,4136,,,,,4290,,,,,4103,,,,,3619,,,,,3047,,,,,2651,,,,,2167,,
"Vertox Whole Wheat Bait, 5 kg tub",SafeHome Pest Control Pvt Ltd,231,253,176,165,231,286,385,363,341,275,253,165,198,209,253,330,418,462,451,473,396,385,308,220,286,308,319,407,429,506,495,539,440,385,352,231,275,308,341,451,517,550,550,561,462,418,352,264,319,308,374,429,528,605,627,616,528,473,352,297,352,363,407,473,550,,,,,649,,,,,605,,,,,627,,,,,528,,,,,473,,,,,385,,,,,297,,,,,330,385,484,561,,,3817,,,,,4521,,,,,4444,,,,,4334,,,,,4004,,,,,3388,,,,,2871,,,,,2035,,,,,3817,,,,,4521,,,,,4444,,,,,4334,,,,,4004,,,,,3388,,,,,2871,,,,,2035,,,,,,,,,,,3817,,3817,,,4521,,4521,,,4444,,4444,,,4334,,4334,,,4004,,4004,,,3388,,3388,,,2871,,2871,,,2035,,2035,,,,,3817,,,,,4521,,,,,4444,,,,,4334,,,,,4004,,,,,3388,,,,,2871,,,,,2035,,
"Vertox Whole Wheat Bait, 5 kg tub",Kaeferling Pro A,253,253,187,165,220,341,385,418,341,319,242,187,198,242,308,341,407,506,517,528,407,385,341,253,286,286,385,407,495,539,517,517,495,385,330,253,308,319,418,484,506,605,627,528,539,418,352,275,308,363,407,473,561,572,682,649,495,440,374,308,363,363,418,550,616,,,,,704,,,,,638,,,,,616,,,,,616,,,,,484,,,,,440,,,,,352,,,,,374,418,506,594,,,3597,,,,,3927,,,,,3828,,,,,3806,,,,,3223,,,,,2959,,,,,2409,,,,,1859,,,,,3597,,,,,3927,,,,,3828,,,,,3806,,,,,3223,,,,,2959,,,,,2409,,,,,1859,,,,,,,,,,,3597,,3597,,,3927,,3927,,,3828,,3828,,,3806,,3806,,,3223,,3223,,,2959,,2959,,,2409,,2409,,,1859,,1859,,,,,3597,,,,,3927,,,,,3828,,,,,3806,,,,,3223,,,,,2959,,,,,2409,,,,,1859,,
"Vertox Whole Wheat Bait, 5 kg tub",Nordic Pest Group AB,341,330,220,198,308,418,506,462,440,385,286,242,253,286,341,462,506,550,594,649,561,506,385,286,374,385,484,572,627,660,737,638,594,550,418,363,385,407,495,572,616,682,803,737,638,506,495,363,440,440,495,649,737,748,759,781,660,550,517,374,451,462,605,605,726,,,,,836,,,,,858,,,,,880,,,,,781,,,,,649,,,,,561,,,,,440,,,,,462,473,583,748,,,2959,,,,,3124,,,,,3234,,,,,3421,,,,,3003,,,,,2398,,,,,2024,,,,,1595,,,,,2959,,,,,3124,,,,,3234,,,,,3421,,,,,3003,,,,,2398,,,,,2024,,,,,1595,,,,,,,,,,,2959,,2959,,,3124,,3124,,,3234,,3234,,,3421,,3421,,,3003,,3003,,,2398,,2398,,,2024,,2024,,,1595,,1595,,,,,2959,,,,,3124,,,,,3234,,,,,3421,,,,,3003,,,,,2398,,,,,2024,,,,,1595,,
"Vertox Whole Wheat Bait, 5 kg tub",Desert Shield Pest Mgmt,440,418,341,264,374,561,616,627,627,561,429,319,330,341,484,594,660,748,803,770,704,616,539,429,451,473,583,704,858,913,968,825,726,693,583,440,550,517,693,792,924,968,1045,913,781,726,594,506,572,616,693,781,1001,935,1111,1001,957,803,682,484,583,638,715,836,1001,,,,,1111,,,,,1210,,,,,1111,,,,,990,,,,,770,,,,,682,,,,,528,,,,,627,671,858,979,,,1969,,,,,2244,,,,,2409,,,,,2112,,,,,2057,,,,,1749,,,,,1452,,,,,1177,,,,,1969,,,,,2244,,,,,2409,,,,,2112,,,,,2057,,,,,1749,,,,,1452,,,,,1177,,,,,,,,,,,1969,,1969,,,2244,,2244,,,2409,,2409,,,2112,,2112,,,2057,,2057,,,1749,,1749,,,1452,,1452,,,1177,,1177,,,,,1969,,,,,2244,,,,,2409,,,,,2112,,,,,2057,,,,,1749,,,,,1452,,,,,1177,,
"Vertox Whole Wheat Bait, 5 kg tub",AgroPlus Distributors SARL,825,957,660,572,880,1155,1397,1265,1320,1166,792,671,682,759,1001,1210,1562,1507,1793,1793,1551,1298,1056,847,1023,1056,1232,1573,1705,1749,1793,1826,1639,1353,1177,957,1100,1122,1364,1694,1683,2046,1980,1958,1694,1485,1265,1045,1089,1276,1573,1749,2079,2189,2046,2233,1881,1606,1342,1001,1243,1320,1452,1749,2057,,,,,2134,,,,,2266,,,,,2354,,,,,1991,,,,,1738,,,,,1540,,,,,1100,,,,,1221,1397,1727,1903,,,2497,,,,,2739,,,,,2838,,,,,2640,,,,,2475,,,,,2123,,,,,1881,,,,,1463,,,,,2497,,,,,2739,,,,,2838,,,,,2640,,,,,2475,,,,,2123,,,,,1881,,,,,1463,,,,,,,,,,,2497,,2497,,,2739,,2739,,,2838,,2838,,,2640,,2640,,,2475,,2475,,,2123,,2123,,,1881,,1881,,,1463,,1463,,,,,2497,,,,,2739,,,,,2838,,,,,2640,,,,,2475,,,,,2123,,,,,1881,,,,,1463,,
"Vertox Whole Wheat Bait, 5 kg tub",CleanCity Municipal Services,990,1001,660,671,880,1144,1551,1463,1342,1089,935,726,803,792,1122,1287,1672,1760,1892,1782,1573,1342,1298,968,1100,1078,1430,1518,1716,2090,2013,2035,1617,1529,1265,957,1155,1276,1496,1617,2068,2266,2211,2244,1870,1705,1386,1089,1133,1364,1606,1881,2068,2409,2508,2431,1903,1738,1540,1122,1243,1441,1804,2068,2310,,,,,2354,,,,,2585,,,,,2277,,,,,2123,,,,,1793,,,,,1573,,,,,1265,,,,,1364,1386,1793,2211,,,3179,,,,,3597,,,,,3465,,,,,3245,,,,,2871,,,,,2541,,,,,2288,,,,,1771,,,,,3179,,,,,3597,,,,,3465,,,,,3245,,,,,2871,,,,,2541,,,,,2288,,,,,1771,,,,,,,,,,,3179,,3179,,,3597,,3597,,,3465,,3465,,,3245,,3245,,,2871,,2871,,,2541,,2541,,,2288,,2288,,,1771,,1771,,,,,3179,,,,,3597,,,,,3465,,,,,3245,,,,,2871,,,,,2541,,,,,2288,,,,,1771,,
"Vertox Whole Wheat Bait, 5 kg tub",FarmCare Retail Network,693,803,506,506,715,869,1023,1045,1045,858,726,517,550,671,770,968,1276,1232,1298,1331,1320,1122,935,737,770,792,1045,1177,1463,1595,1507,1540,1364,1067,913,682,792,858,1133,1199,1584,1485,1540,1562,1518,1320,1023,748,979,913,1254,1397,1628,1694,1826,1606,1419,1298,1133,836,957,1089,1254,1452,1628,,,,,1782,,,,,1749,,,,,1881,,,,,1507,,,,,1397,,,,,1265,,,,,869,,,,,1023,1089,1375,1474,,,3080,,,,,3443,,,,,3597,,,,,3377,,,,,3201,,,,,2750,,,,,2145,,,,,1771,,,,,3080,,,,,3443,,,,,3597,,,,,3377,,,,,3201,,,,,2750,,,,,2145,,,,,1771,,,,,,,,,,,3080,,3080,,,3443,,3443,,,3597,,3597,,,3377,,3377,,,3201,,3201,,,2750,,2750,,,2145,,2145,,,1771,,1771,,,,,3080,,,,,3443,,,,,3597,,,,,3377,,,,,3201,,,,,2750,,,,,2145,,,,,1771,,
"Vertox Whole Wheat Bait, 5 kg tub",PestEx Solutions Inc,924,990,704,583,814,1265,1496,1419,1342,1100,968,616,803,891,1067,1232,1661,1705,1969,1826,1573,1320,1254,924,1023,1166,1408,1463,1936,2046,2035,1815,1826,1573,1298,1001,1188,1232,1518,1749,2057,2244,2123,2255,1870,1661,1276,1012,1166,1364,1573,1892,1958,2299,2387,2420,1925,1650,1397,1111,1309,1353,1617,1870,2068,,,,,2464,,,,,2541,,,,,2387,,,,,2156,,,,,1815,,,,,1584,,,,,1232,,,,,1441,1430,1716,1947,,,1298,,,,,1529,,,,,1529,,,,,1419,,,,,1287,,,,,1111,,,,,968,,,,,748,,,,,1298,,,,,1529,,,,,1529,,,,,1419,,,,,1287,,,,,1111,,,,,968,,,,,748,,,,,,,,,,,1298,,1298,,,1529,,1529,,,1529,,1529,,,1419,,1419,,,1287,,1287,,,1111,,1111,,,968,,968,,,748,,748,,,,,1298,,,,,1529,,,,,1529,,,,,1419,,,,,1287,,,,,1111,,,,,968,,,,,748,,
"Vertox Whole Wheat Bait, 5 kg tub",EcoShield Pest Control,671,748,528,495,682,858,1023,1111,946,836,726,506,561,616,836,979,1232,1353,1441,1474,1276,1144,858,704,737,891,990,1254,1353,1474,1639,1430,1342,1100,1012,792,803,935,1144,1331,1408,1650,1628,1584,1474,1177,1089,726,924,924,1111,1408,1463,1760,1749,1727,1408,1221,1133,825,1012,1056,1188,1397,1683,,,,,1749,,,,,1837,,,,,1771,,,,,1496,,,,,1441,,,,,1155,,,,,880,,,,,979,1199,1254,1507,,,1309,,,,,1331,,,,,1386,,,,,1353,,,,,1199,,,,,1045,,,,,880,,,,,682,,,,,1309,,,,,1331,,,,,1386,,,,,1353,,,,,1199,,,,,1045,,,,,880,,,,,682,,,,,,,,,,,1309,,1309,,,1331,,1331,,,1386,,1386,,,1353,,1353,,,1199,,1199,,,1045,,1045,,,880,,880,,,682,,682,,,,,1309,,,,,1331,,,,,1386,,,,,1353,,,,,1199,,,,,1045,,,,,880,,,,,682,,
"Vertox Whole Wheat Bait, 5 kg tub",Harvest Agro Traders,913,1133,803,715,869,1375,1463,1485,1507,1298,1001,693,726,836,1144,1342,1628,1771,1947,2013,1650,1419,1210,1034,1067,1287,1430,1771,1837,2189,2321,2024,1738,1573,1408,1001,1166,1188,1518,1716,2090,2420,2200,2321,1914,1595,1474,1177,1265,1298,1738,1870,2255,2321,2431,2222,2167,1727,1595,1133,1452,1507,1826,2200,2299,,,,,2574,,,,,2574,,,,,2519,,,,,2387,,,,,2024,,,,,1562,,,,,1353,,,,,1507,1584,1969,2332,,,1936,,,,,2123,,,,,2211,,,,,2178,,,,,1925,,,,,1584,,,,,1408,,,,,1089,,,,,1936,,,,,2123,,,,,2211,,,,,2178,,,,,1925,,,,,1584,,,,,1408,,,,,1089,,,,,,,,,,,1936,,1936,,,2123,,2123,,,2211,,2211,,,2178,,2178,,,1925,,1925,,,1584,,1584,,,1408,,1408,,,1089,,1089,,,,,1936,,,,,2123,,,,,2211,,,,,2178,,,,,1925,,,,,1584,,,,,1408,,,,,1089,,
"Vertox Whole Wheat Bait, 5 kg tub",Urban Hygiene Authority,1133,1133,891,726,968,1529,1760,1837,1650,1452,1199,825,880,1078,1265,1507,1738,2046,2244,2332,1980,1716,1386,1111,1221,1276,1518,2013,2024,2387,2475,2497,2068,1793,1496,1221,1386,1529,1727,2189,2255,2343,2783,2563,2277,1936,1628,1166,1353,1551,2013,2035,2376,2871,2959,2563,2475,2145,1881,1254,1639,1650,1969,2420,2772,,,,,3014,,,,,3036,,,,,2904,,,,,2387,,,,,2365,,,,,2013,,,,,1386,,,,,1749,1881,2310,2464,,,3586,,,,,4048,,,,,4356,,,,,4224,,,,,3421,,,,,3267,,,,,2585,,,,,2057,,,,,3586,,,,,4048,,,,,4356,,,,,4224,,,,,3421,,,,,3267,,,,,2585,,,,,2057,,,,,,,,,,,3586,,3586,,,4048,,4048,,,4356,,4356,,,4224,,4224,,,3421,,3421,,,3267,,3267,,,2585,,2585,,,2057,,2057,,,,,3586,,,,,4048,,,,,4356,,,,,4224,,,,,3421,,,,,3267,,,,,2585,,,,,2057,,
"Vertox Whole Wheat Bait, 5 kg tub",GreenField Agro Supplies,792,913,638,550,792,1001,1320,1265,1089,968,759,594,594,759,869,1122,1298,1628,1518,1507,1474,1265,1034,792,990,935,1133,1298,1518,1793,1639,1793,1386,1243,1067,869,957,1078,1254,1573,1793,1760,1749,1727,1562,1298,1111,847,968,1089,1353,1551,1804,2068,1892,1859,1837,1452,1188,1034,1133,1144,1331,1793,1936,,,,,2178,,,,,2233,,,,,1925,,,,,1903,,,,,1474,,,,,1254,,,,,979,,,,,1177,1386,1584,1661,,,2013,,,,,2310,,,,,2354,,,,,2167,,,,,1947,,,,,1661,,,,,1518,,,,,1199,,,,,2013,,,,,2310,,,,,2354,,,,,2167,,,,,1947,,,,,1661,,,,,1518,,,,,1199,,,,,,,,,,,2013,,2013,,,2310,,2310,,,2354,,2354,,,2167,,2167,,,1947,,1947,,,1661,,1661,,,1518,,1518,,,1199,,1199,,,,,2013,,,,,2310,,,,,2354,,,,,2167,,,,,1947,,,,,1661,,,,,1518,,,,,1199,,
"Vertox Whole Wheat Bait, 5 kg tub",Kaeferling Pro A - Old,814,847,660,517,825,1001,1221,1375,1298,968,803,605,704,704,1023,1188,1441,1485,1606,1694,1397,1188,1122,836,869,946,1177,1496,1727,1683,1826,1815,1485,1243,1155,902,1056,1001,1386,1386,1705,1793,1793,1760,1661,1342,1144,957,1111,1188,1309,1584,1848,2002,1914,2013,1848,1430,1375,1012,1100,1133,1430,1760,1914,,,,,2156,,,,,2046,,,,,1969,,,,,1881,,,,,1562,,,,,1397,,,,,1078,,,,,1309,1243,1595,1727,,,3993,,,,,4422,,,,,4279,,,,,4279,,,,,3839,,,,,3300,,,,,2838,,,,,2035,,,,,3993,,,,,4422,,,,,4279,,,,,4279,,,,,3839,,,,,3300,,,,,2838,,,,,2035,,,,,,,,,,,3993,,3993,,,4422,,4422,,,4279,,4279,,,4279,,4279,,,3839,,3839,,,3300,,3300,,,2838,,2838,,,2035,,2035,,,,,3993,,,,,4422,,,,,4279,,,,,4279,,,,,3839,,,,,3300,,,,,2838,,,,,2035,,
Vertox Whole Wheat - White Label Variant,UK Pest Solutions Ltd,445,440,325,305,395,590,685,725,655,545,415,315,320,400,485,620,710,840,800,810,740,685,555,415,525,565,630,720,895,850,935,865,795,670,580,460,490,600,685,835,965,1020,980,900,915,785,645,490,600,645,690,835,950,1025,1065,1120,960,820,725,505,570,640,775,915,1085,1085,-1,-1,-1,1155,1155,-1,-1,-1,1210,1210,-1,-1,-1,1165,1165,-1,-1,-1,1035,1035,-1,-1,-1,815,815,-1,-1,-1,740,740,-1,-1,-1,530,530,-1,-1,-1,660,655,760,960,1487,1487,,1487,1054,1624,1624,,1624,1173,1737,1737,,1737,1220,1603,1603,,1603,1206,1484,1484,,1484,1103,1306,1306,,1306,938,1109,1109,,1109,789,806,806,,806,588,1054,1487,,1487,1054,1173,1624,,1624,1173,1220,1737,,1737,1220,1206,1603,,1603,1206,1103,1484,,1484,1103,938,1306,,1306,938,789,1109,,1109,789,588,806,,806,588,656,656,732,732,788,788,926,926,,1487,,1487,1054,,1624,,1624,1173,,1737,,1737,1220,,1603,,1603,1206,,1484,,1484,1103,,1306,,1306,938,,1109,,1109,789,,806,,806,588,0.269,1487,,1487,1054,0.215,1624,,1624,1173,0.292,1737,,1737,1220,0.069,1603,,1603,1206,-0.096,1484,,1484,1103,-0.201,1306,,1306,938,-0.402,1109,,1109,789,-0.024,806,,806,588
Vertox Whole Wheat - White Label Variant,Euro Agro Chemicals GmbH,165,185,135,115,165,230,295,280,245,205,185,130,145,165,210,250,310,310,330,345,315,285,235,165,210,205,280,315,335,365,360,405,355,300,230,185,210,245,260,340,350,415,435,385,345,330,245,200,235,255,290,350,390,460,435,460,395,340,265,205,265,270,295,385,395,395,-1,-1,-1,455,455,-1,-1,-1,465,465,-1,-1,-1,470,470,-1,-1,-1,400,400,-1,-1,-1,370,370,-1,-1,-1,300,300,-1,-1,-1,215,215,-1,-1,-1,275,280,350,410,640,640,,640,400,689,689,,689,449,724,724,,724,464,686,686,,686,468,632,632,,632,420,561,561,,561,383,473,473,,473,322,373,373,,373,262,400,640,,640,400,449,689,,689,449,464,724,,724,464,468,686,,686,468,420,632,,632,420,383,561,,561,383,322,473,,473,322,262,373,,373,262,303,303,316,316,351,351,400,400,,640,,640,400,,689,,689,449,,724,,724,464,,686,,686,468,,632,,632,420,,561,,561,383,,473,,473,322,,373,,373,262,0.143,640,,640,400,0.25,689,,689,449,0.203,724,,724,464,-0.003,686,,686,468,-0.033,632,,632,420,-0.263,561,,561,383,-0.367,473,,473,322,0,373,,373,262
Vertox Whole Wheat - White Label Variant,Apex Pest Control Services,205,215,145,140,200,265,305,305,320,265,190,140,160,185,225,265,325,365,375,400,375,330,270,200,225,245,285,365,395,425,415,395,370,345,290,210,235,280,300,395,395,420,490,435,415,330,305,220,280,270,320,420,460,525,525,455,445,365,295,245,285,290,330,430,455,455,-1,-1,-1,530,530,-1,-1,-1,575,575,-1,-1,-1,500,500,-1,-1,-1,455,455,-1,-1,-1,370,370,-1,-1,-1,315,315,-1,-1,-1,260,260,-1,-1,-1,280,300,410,475,1150,1150,,1150,480,1212,1212,,1212,544,1263,1263,,1263,576,1190,1190,,1190,516,1065,1065,,1065,486,893,893,,893,402,771,771,,771,337,625,625,,625,265,480,1150,,1150,480,544,1212,,1212,544,576,1263,,1263,576,516,1190,,1190,516,486,1065,,1065,486,402,893,,893,402,337,771,,771,337,265,625,,625,265,300,300,318,318,383,383,471,471,,1150,,1150,480,,1212,,1212,544,,1263,,1263,576,,1190,,1190,516,,1065,,1065,486,,893,,893,402,,771,,771,337,,625,,625,265,0.328,1150,,1150,480,0.424,1212,,1212,544,0.367,1263,,1263,576,0.141,1190,,1190,516,-0.04,1065,,1065,486,-0.181,893,,893,402,-0.384,771,,771,337,-0.138,625,,625,265
Vertox Whole Wheat - White Label Variant,SafeHome Pest Control Pvt Ltd,105,115,80,75,105,130,175,165,155,125,115,75,90,95,115,150,190,210,205,215,180,175,140,100,130,140,145,185,195,230,225,245,200,175,160,105,125,140,155,205,235,250,250,255,210,190,160,120,145,140,170,195,240,275,285,280,240,215,160,135,160,165,185,215,250,250,-1,-1,-1,295,295,-1,-1,-1,275,275,-1,-1,-1,285,285,-1,-1,-1,240,240,-1,-1,-1,215,215,-1,-1,-1,175,175,-1,-1,-1,135,135,-1,-1,-1,150,175,220,255,997,997,,997,260,1172,1172,,1172,290,1157,1157,,1157,294,1134,1134,,1134,299,1041,1041,,1041,263,891,891,,891,242,758,758,,758,211,548,548,,548,171,260,997,,997,260,290,1172,,1172,290,294,1157,,1157,294,299,1134,,1134,299,263,1041,,1041,263,242,891,,891,242,211,758,,758,211,171,548,,548,171,193,193,203,203,221,221,251,251,,997,,997,260,,1172,,1172,290,,1157,,1157,294,,1134,,1134,299,,1041,,1041,263,,891,,891,242,,758,,758,211,,548,,548,171,0.322,997,,997,260,0.315,1172,,1172,290,0.343,1157,,1157,294,0.049,1134,,1134,299,0.042,1041,,1041,263,-0.119,891,,891,242,-0.343,758,,758,211,-0.101,548,,548,171
Vertox Whole Wheat - White Label Variant,Kaeferling Pro A,115,115,85,75,100,155,175,190,155,145,110,85,90,110,140,155,185,230,235,240,185,175,155,115,130,130,175,185,225,245,235,235,225,175,150,115,140,145,190,220,230,275,285,240,245,190,160,125,140,165,185,215,255,260,310,295,225,200,170,140,165,165,190,250,280,280,-1,-1,-1,320,320,-1,-1,-1,290,290,-1,-1,-1,280,280,-1,-1,-1,280,280,-1,-1,-1,220,220,-1,-1,-1,200,200,-1,-1,-1,160,160,-1,-1,-1,170,190,230,270,952,952,,952,270,1045,1045,,1045,305,1026,1026,,1026,313,1017,1017,,1017,305,871,871,,871,277,793,793,,793,242,655,655,,655,216,513,513,,513,182,270,952,,952,270,305,1045,,1045,305,313,1026,,1026,313,305,1017,,1017,305,277,871,,871,277,242,793,,793,242,216,655,,655,216,182,513,,513,182,198,198,210,210,238,238,263,263,,952,,952,270,,1045,,1045,305,,1026,,1026,313,,1017,,1017,305,,871,,871,277,,793,,793,242,,655,,655,216,,513,,513,182,0.29,952,,952,270,0.361,1045,,1045,305,0.314,1026,,1026,313,0.124,1017,,1017,305,-0.059,871,,871,277,-0.118,793,,793,242,-0.402,655,,655,216,-0.011,513,,513,182
Vertox Whole Wheat - White Label Variant,Nordic Pest Group AB,155,150,100,90,140,190,230,210,200,175,130,110,115,130,155,210,230,250,270,295,255,230,175,130,170,175,220,260,285,300,335,290,270,250,190,165,175,185,225,260,280,310,365,335,290,230,225,165,200,200,225,295,335,340,345,355,300,250,235,170,205,210,275,275,330,330,-1,-1,-1,380,380,-1,-1,-1,390,390,-1,-1,-1,400,400,-1,-1,-1,355,355,-1,-1,-1,295,295,-1,-1,-1,255,255,-1,-1,-1,200,200,-1,-1,-1,210,215,265,340,846,846,,846,347,897,897,,897,374,935,935,,935,400,972,972,,972,390,859,859,,859,353,701,701,,701,312,597,597,,597,274,476,476,,476,228,347,846,,846,347,374,897,,897,374,400,935,,935,400,390,972,,972,390,353,859,,859,353,312,701,,701,312,274,597,,597,274,228,476,,476,228,249,249,254,254,293,293,334,334,,846,,846,347,,897,,897,374,,935,,935,400,,972,,972,390,,859,,859,353,,701,,701,312,,597,,597,274,,476,,476,228,0.129,846,,846,347,0.226,897,,897,374,0.21,935,,935,400,0.113,972,,972,390,-0.113,859,,859,353,-0.226,701,,701,312,-0.419,597,,597,274,-0.113,476,,476,228
Vertox Whole Wheat - White Label Variant,Desert Shield Pest Mgmt,200,190,155,120,170,255,280,285,285,255,195,145,150,155,220,270,300,340,365,350,320,280,245,195,205,215,265,320,390,415,440,375,330,315,265,200,250,235,315,360,420,440,475,415,355,330,270,230,260,280,315,355,455,425,505,455,435,365,310,220,265,290,325,380,455,455,-1,-1,-1,505,505,-1,-1,-1,550,550,-1,-1,-1,505,505,-1,-1,-1,450,450,-1,-1,-1,350,350,-1,-1,-1,310,310,-1,-1,-1,240,240,-1,-1,-1,285,305,390,445,693,693,,693,492,773,773,,773,527,837,837,,837,579,742,742,,742,525,705,705,,705,475,600,600,,600,406,502,502,,502,344,399,399,,399,264,492,693,,693,492,527,773,,773,527,579,837,,837,579,525,742,,742,525,475,705,,705,475,406,600,,600,406,344,502,,502,344,264,399,,399,264,305,305,322,322,386,386,439,439,,693,,693,492,,773,,773,527,,837,,837,579,,742,,742,525,,705,,705,475,,600,,600,406,,502,,502,344,,399,,399,264,0.225,693,,693,492,0.287,773,,773,527,0.202,837,,837,579,0.124,742,,742,525,-0.023,705,,705,475,-0.209,600,,600,406,-0.395,502,,502,344,-0.033,399,,399,264
Vertox Whole Wheat - White Label Variant,AgroPlus Distributors SARL,375,435,300,260,400,525,635,575,600,530,360,305,310,345,455,550,710,685,815,815,705,590,480,385,465,480,560,715,775,795,815,830,745,615,535,435,500,510,620,770,765,930,900,890,770,675,575,475,495,580,715,795,945,995,930,1015,855,730,610,455,565,600,660,795,935,935,-1,-1,-1,970,970,-1,-1,-1,1030,1030,-1,-1,-1,1070,1070,-1,-1,-1,905,905,-1,-1,-1,790,790,-1,-1,-1,700,700,-1,-1,-1,500,500,-1,-1,-1,555,635,785,865,1041,1041,,1041,948,1136,1136,,1136,1028,1185,1185,,1185,1081,1145,1145,,1145,1091,1045,1045,,1045,966,897,897,,897,829,769,769,,769,684,601,601,,601,537,948,1041,,1041,948,1028,1136,,1136,1028,1081,1185,,1185,1081,1091,1145,,1145,1091,966,1045,,1045,966,829,897,,897,829,684,769,,769,684,537,601,,601,537,589,589,652,652,730,730,844,844,,1041,,1041,948,,1136,,1136,1028,,1185,,1185,1081,,1145,,1145,1091,,1045,,1045,966,,897,,897,829,,769,,769,684,,601,,601,537,0.177,1041,,1041,948,0.134,1136,,1136,1028,0.142,1185,,1185,1081,0.067,1145,,1145,1091,-0.138,1045,,1045,966,-0.205,897,,897,829,-0.421,769,,769,684,-0.059,601,,601,537
Vertox Whole Wheat - White Label Variant,CleanCity Municipal Services,450,455,300,305,400,520,705,665,610,495,425,330,365,360,510,585,760,800,860,810,715,610,590,440,500,490,650,690,780,950,915,925,735,695,575,435,525,580,680,735,940,1030,1005,1020,850,775,630,495,515,620,730,855,940,1095,1140,1105,865,790,700,510,565,655,820,940,1050,1050,-1,-1,-1,1070,1070,-1,-1,-1,1175,1175,-1,-1,-1,1035,1035,-1,-1,-1,965,965,-1,-1,-1,815,815,-1,-1,-1,715,715,-1,-1,-1,575,575,-1,-1,-1,620,630,815,1005,1233,1233,,1233,1022,1390,1390,,1390,1146,1398,1398,,1398,1222,1321,1321,,1321,1168,1151,1151,,1151,997,1015,1015,,1015,876,900,900,,900,761,694,694,,694,583,1022,1233,,1233,1022,1146,1390,,1390,1146,1222,1398,,1398,1222,1168,1321,,1321,1168,997,1151,,1151,997,876,1015,,1015,876,761,900,,900,761,583,694,,694,583,634,634,691,691,806,806,907,907,,1233,,1233,1022,,1390,,1390,1146,,1398,,1398,1222,,1321,,1321,1168,,1151,,1151,997,,1015,,1015,876,,900,,900,761,,694,,694,583,0.282,1233,,1233,1022,0.268,1390,,1390,1146,0.268,1398,,1398,1222,0,1321,,1321,1168,-0.113,1151,,1151,997,-0.211,1015,,1015,876,-0.394,900,,900,761,-0.113,694,,694,583
Vertox Whole Wheat - White Label Variant,FarmCare Retail Network,315,365,230,230,325,395,465,475,475,390,330,235,250,305,350,440,580,560,590,605,600,510,425,335,350,360,475,535,665,725,685,700,620,485,415,310,360,390,515,545,720,675,700,710,690,600,465,340,445,415,570,635,740,770,830,730,645,590,515,380,435,495,570,660,740,740,-1,-1,-1,810,810,-1,-1,-1,795,795,-1,-1,-1,855,855,-1,-1,-1,685,685,-1,-1,-1,635,635,-1,-1,-1,575,575,-1,-1,-1,395,395,-1,-1,-1,465,495,625,670,1094,1094,,1094,789,1189,1189,,1189,813,1233,1233,,1233,832,1182,1182,,1182,830,1110,1110,,1110,766,964,964,,964,679,785,785,,785,595,637,637,,637,470,789,1094,,1094,789,813,1189,,1189,813,832,1233,,1233,832,830,1182,,1182,830,766,1110,,1110,766,679,964,,964,679,595,785,,785,595,470,637,,637,470,520,520,544,544,637,637,697,697,,1094,,1094,789,,1189,,1189,813,,1233,,1233,832,,1182,,1182,830,,1110,,1110,766,,964,,964,679,,785,,785,595,,637,,637,470,0.238,1094,,1094,789,0.421,1189,,1189,813,0.268,1233,,1233,832,0.104,1182,,1182,830,-0.024,1110,,1110,766,-0.092,964,,964,679,-0.335,785,,785,595,-0.096,637,,637,470
Vertox Whole Wheat - White Label Variant,PestEx Solutions Inc,420,450,320,265,370,575,680,645,610,500,440,280,365,405,485,560,755,775,895,830,715,600,570,420,465,530,640,665,880,930,925,825,830,715,590,455,540,560,690,795,935,1020,965,1025,850,755,580,460,530,620,715,860,890,1045,1085,1100,875,750,635,505,595,615,735,850,940,940,-1,-1,-1,1120,1120,-1,-1,-1,1155,1155,-1,-1,-1,1085,1085,-1,-1,-1,980,980,-1,-1,-1,825,825,-1,-1,-1,720,720,-1,-1,-1,560,560,-1,-1,-1,655,650,780,885,778,778,,778,966,889,889,,889,1083,909,909,,909,1124,868,868,,868,1092,785,785,,785,985,685,685,,685,866,603,603,,603,766,482,482,,482,624,966,778,,778,966,1083,889,,889,1083,1124,909,,909,1124,1092,868,,868,1092,985,785,,785,985,866,685,,685,866,766,603,,603,766,624,482,,482,624,703,703,742,742,827,827,902,902,,778,,778,966,,889,,889,1083,,909,,909,1124,,868,,868,1092,,785,,785,985,,685,,685,866,,603,,603,766,,482,,482,624,0.246,778,,778,966,0.145,889,,889,1083,0.159,909,,909,1124,0.044,868,,868,1092,-0.101,785,,785,985,-0.217,685,,685,866,-0.377,603,,603,766,-0.051,482,,482,624
Vertox Whole Wheat - White Label Variant,EcoShield Pest Control,305,340,240,225,310,390,465,505,430,380,330,230,255,280,380,445,560,615,655,670,580,520,390,320,335,405,450,570,615,670,745,650,610,500,460,360,365,425,520,605,640,750,740,720,670,535,495,330,420,420,505,640,665,800,795,785,640,555,515,375,460,480,540,635,765,765,-1,-1,-1,795,795,-1,-1,-1,835,835,-1,-1,-1,805,805,-1,-1,-1,680,680,-1,-1,-1,655,655,-1,-1,-1,525,525,-1,-1,-1,400,400,-1,-1,-1,445,545,570,685,670,670,,670,745,712,712,,712,819,740,740,,740,850,722,722,,722,829,641,641,,641,738,566,566,,566,658,492,492,,492,584,387,387,,387,465,745,670,,670,745,819,712,,712,819,850,740,,740,850,829,722,,722,829,738,641,,641,738,658,566,,566,658,584,492,,492,584,465,387,,387,465,508,508,551,551,612,612,702,702,,670,,670,745,,712,,712,819,,740,,740,850,,722,,722,829,,641,,641,738,,566,,566,658,,492,,492,584,,387,,387,465,0.212,670,,670,745,0.246,712,,712,819,0.108,740,,740,850,0.065,722,,722,829,-0.15,641,,641,738,-0.258,566,,566,658,-0.442,492,,492,584,0.042,387,,387,465
Vertox Whole Wheat - White Label Variant,Harvest Agro Traders,415,515,365,325,395,625,665,675,685,590,455,315,330,380,520,610,740,805,885,915,750,645,550,470,485,585,650,805,835,995,1055,920,790,715,640,455,530,540,690,780,950,1100,1000,1055,870,725,670,535,575,590,790,850,1025,1055,1105,1010,985,785,725,515,660,685,830,1000,1045,1045,-1,-1,-1,1170,1170,-1,-1,-1,1170,1170,-1,-1,-1,1145,1145,-1,-1,-1,1085,1085,-1,-1,-1,920,920,-1,-1,-1,710,710,-1,-1,-1,615,615,-1,-1,-1,685,720,895,1060,986,986,,986,1093,1097,1097,,1097,1229,1123,1123,,1123,1241,1095,1095,,1095,1200,985,985,,985,1096,820,820,,820,920,709,709,,709,778,554,554,,554,613,1093,986,,986,1093,1229,1097,,1097,1229,1241,1123,,1123,1241,1200,1095,,1095,1200,1096,985,,985,1096,920,820,,820,920,778,709,,709,778,613,554,,554,613,693,693,739,739,899,899,1043,1043,,986,,986,1093,,1097,,1097,1229,,1123,,1123,1241,,1095,,1095,1200,,985,,985,1096,,820,,820,920,,709,,709,778,,554,,554,613,0.247,986,,986,1093,0.312,1097,,1097,1229,0.298,1123,,1123,1241,0.097,1095,,1095,1200,-0.011,985,,985,1096,-0.24,820,,820,920,-0.358,709,,709,778,-0.15,554,,554,613
Vertox Whole Wheat - White Label Variant,Urban Hygiene Authority,515,515,405,330,440,695,800,835,750,660,545,375,400,490,575,685,790,930,1020,1060,900,780,630,505,555,580,690,915,920,1085,1125,1135,940,815,680,555,630,695,785,995,1025,1065,1265,1165,1035,880,740,530,615,705,915,925,1080,1305,1345,1165,1125,975,855,570,745,750,895,1100,1260,1260,-1,-1,-1,1370,1370,-1,-1,-1,1380,1380,-1,-1,-1,1320,1320,-1,-1,-1,1085,1085,-1,-1,-1,1075,1075,-1,-1,-1,915,915,-1,-1,-1,630,630,-1,-1,-1,795,855,1050,1120,1433,1433,,1433,1236,1607,1607,,1607,1375,1705,1705,,1705,1430,1634,1634,,1634,1349,1372,1372,,1372,1190,1293,1293,,1293,1102,1066,1066,,1066,958,823,823,,823,712,1236,1433,,1433,1236,1375,1607,,1607,1375,1430,1705,,1705,1430,1349,1634,,1634,1349,1190,1372,,1372,1190,1102,1293,,1293,1102,958,1066,,1066,958,712,823,,823,712,843,843,894,894,1052,1052,1164,1164,,1433,,1433,1236,,1607,,1607,1375,,1705,,1705,1430,,1634,,1634,1349,,1372,,1372,1190,,1293,,1293,1102,,1066,,1066,958,,823,,823,712,0.261,1433,,1433,1236,0.286,1607,,1607,1375,0.15,1705,,1705,1430,0.12,1634,,1634,1349,-0.051,1372,,1372,1190,-0.192,1293,,1293,1102,-0.342,1066,,1066,958,-0.023,823,,823,712
Vertox Whole Wheat - White Label Variant,GreenField Agro Supplies,360,415,290,250,360,455,600,575,495,440,345,270,270,345,395,510,590,740,690,685,670,575,470,360,450,425,515,590,690,815,745,815,630,565,485,395,435,490,570,715,815,800,795,785,710,590,505,385,440,495,615,705,820,940,860,845,835,660,540,470,515,520,605,815,880,880,-1,-1,-1,990,990,-1,-1,-1,1015,1015,-1,-1,-1,875,875,-1,-1,-1,865,865,-1,-1,-1,670,670,-1,-1,-1,570,570,-1,-1,-1,445,445,-1,-1,-1,535,630,720,755,900,900,,900,885,1022,1022,,1022,995,1025,1025,,1025,980,958,958,,958,931,877,877,,877,870,731,731,,731,708,640,640,,640,591,508,508,,508,472,885,900,,900,885,995,1022,,1022,995,980,1025,,1025,980,931,958,,958,931,870,877,,877,870,708,731,,731,708,591,640,,640,591,472,508,,508,472,538,538,599,599,683,683,792,792,,900,,900,885,,1022,,1022,995,,1025,,1025,980,,958,,958,931,,877,,877,870,,731,,731,708,,640,,640,591,,508,,508,472,0.336,900,,900,885,0.434,1022,,1022,995,0.336,1025,,1025,980,0.203,958,,958,931,0.042,877,,877,870,-0.21,731,,731,708,-0.308,640,,640,591,-0.04,508,,508,472
Vertox Whole Wheat - White Label Variant,Kaeferling Pro A - Old,370,385,300,235,375,455,555,625,590,440,365,275,320,320,465,540,655,675,730,770,635,540,510,380,395,430,535,680,785,765,830,825,675,565,525,410,480,455,630,630,775,815,815,800,755,610,520,435,505,540,595,720,840,910,870,915,840,650,625,460,500,515,650,800,870,870,-1,-1,-1,980,980,-1,-1,-1,930,930,-1,-1,-1,895,895,-1,-1,-1,855,855,-1,-1,-1,710,710,-1,-1,-1,635,635,-1,-1,-1,490,490,-1,-1,-1,595,565,725,785,1358,1358,,1358,902,1481,1481,,1481,953,1460,1460,,1460,975,1469,1469,,1469,993,1329,1329,,1329,914,1137,1137,,1137,775,1005,1005,,1005,720,762,762,,762,599,902,1358,,1358,902,953,1481,,1481,953,975,1460,,1460,975,993,1469,,1469,993,914,1329,,1329,914,775,1137,,1137,775,720,1005,,1005,720,599,762,,762,599,658,658,664,664,774,774,845,845,,1358,,1358,902,,1481,,1481,953,,1460,,1460,975,,1469,,1469,993,,1329,,1329,914,,1137,,1137,775,,1005,,1005,720,,762,,762,599,0.403,1358,,1358,902,0.415,1481,,1481,953,0.373,1460,,1460,975,0.233,1469,,1469,993,0,1329,,1329,914,-0.161,1137,,1137,775,-0.322,1005,,1005,720,0.042,762,,762,599
Vertox Whole Wheat - White Label Variant,UK Pest Solutions Ltd,445,440,325,305,395,590,685,725,655,545,415,315,320,400,485,620,710,840,800,810,740,685,555,415,525,565,630,720,895,850,935,865,795,670,580,460,490,600,685,835,965,1020,980,900,915,785,645,490,600,645,690,835,950,1025,1065,1120,960,820,725,505,570,640,775,915,1085,1085,-1,-1,-1,1155,1155,-1,-1,-1,1210,1210,-1,-1,-1,1165,1165,-1,-1,-1,1035,1035,-1,-1,-1,815,815,-1,-1,-1,740,740,-1,-1,-1,530,530,-1,-1,-1,660,655,760,960,1487,1487,,1487,1054,1624,1624,,1624,1173,1737,1737,,1737,1220,1603,1603,,1603,1206,1484,1484,,1484,1103,1306,1306,,1306,938,1109,1109,,1109,789,806,806,,806,588,1054,1487,,1487,1054,1173,1624,,1624,1173,1220,1737,,1737,1220,1206,1603,,1603,1206,1103,1484,,1484,1103,938,1306,,1306,938,789,1109,,1109,789,588,806,,806,588,656,656,732,732,788,788,926,926,,1487,,1487,1054,,1624,,1624,1173,,1737,,1737,1220,,1603,,1603,1206,,1484,,1484,1103,,1306,,1306,938,,1109,,1109,789,,806,,806,588,0.37,1487,,1487,1054,0.403,1624,,1624,1173,0.276,1737,,1737,1220,0.177,1603,,1603,1206,0.039,1484,,1484,1103,-0.204,1306,,1306,938,-0.365,1109,,1109,789,-0.107,806,,806,588
Vertox Whole Wheat - White Label Variant,Euro Agro Chemicals GmbH,165,185,135,115,165,230,295,280,245,205,185,130,145,165,210,250,310,310,330,345,315,285,235,165,210,205,280,315,335,365,360,405,355,300,230,185,210,245,260,340,350,415,435,385,345,330,245,200,235,255,290,350,390,460,435,460,395,340,265,205,265,270,295,385,395,395,-1,-1,-1,455,455,-1,-1,-1,465,465,-1,-1,-1,470,470,-1,-1,-1,400,400,-1,-1,-1,370,370,-1,-1,-1,300,300,-1,-1,-1,215,215,-1,-1,-1,275,280,350,410,640,640,,640,400,689,689,,689,449,724,724,,724,464,686,686,,686,468,632,632,,632,420,561,561,,561,383,473,473,,473,322,373,373,,373,262,400,640,,640,400,449,689,,689,449,464,724,,724,464,468,686,,686,468,420,632,,632,420,383,561,,561,383,322,473,,473,322,262,373,,373,262,303,303,316,316,351,351,400,400,,640,,640,400,,689,,689,449,,724,,724,464,,686,,686,468,,632,,632,420,,561,,561,383,,473,,473,322,,373,,373,262,0.222,640,,640,400,0.252,689,,689,449,0.215,724,,724,464,0.004,686,,686,468,-0.152,632,,632,420,-0.252,561,,561,383,-0.448,473,,473,322,-0.063,373,,373,262
Vertox Whole Wheat - White Label Variant,Apex Pest Control Services,205,215,145,140,200,265,305,305,320,265,190,140,160,185,225,265,325,365,375,400,375,330,270,200,225,245,285,365,395,425,415,395,370,345,290,210,235,280,300,395,395,420,490,435,415,330,305,220,280,270,320,420,460,525,525,455,445,365,295,245,285,290,330,430,455,455,-1,-1,-1,530,530,-1,-1,-1,575,575,-1,-1,-1,500,500,-1,-1,-1,455,455,-1,-1,-1,370,370,-1,-1,-1,315,315,-1,-1,-1,260,260,-1,-1,-1,280,300,410,475,1150,1150,,1150,480,1212,1212,,1212,544,1263,1263,,1263,576,1190,1190,,1190,516,1065,1065,,1065,486,893,893,,893,402,771,771,,771,337,625,625,,625,265,480,1150,,1150,480,544,1212,,1212,544,576,1263,,1263,576,516,1190,,1190,516,486,1065,,1065,486,402,893,,893,402,337,771,,771,337,265,625,,625,265,300,300,318,318,383,383,471,471,,1150,,1150,480,,1212,,1212,544,,1263,,1263,576,,1190,,1190,516,,1065,,1065,486,,893,,893,402,,771,,771,337,,625,,625,265,0.249,1150,,1150,480,0.202,1212,,1212,544,0.139,1263,,1263,576,0.052,1190,,1190,516,-0.052,1065,,1065,486,-0.179,893,,893,402,-0.399,771,,771,337,0,625,,625,265
Vertox Whole Wheat - White Label Variant,SafeHome Pest Control Pvt Ltd,105,115,80,75,105,130,175,165,155,125,115,75,90,95,115,150,190,210,205,215,180,175,140,100,130,140,145,185,195,230,225,245,200,175,160,105,125,140,155,205,235,250,250,255,210,190,160,120,145,140,170,195,240,275,285,280,240,215,160,135,160,165,185,215,250,250,-1,-1,-1,295,295,-1,-1,-1,275,275,-1,-1,-1,285,285,-1,-1,-1,240,240,-1,-1,-1,215,215,-1,-1,-1,175,175,-1,-1,-1,135,135,-1,-1,-1,150,175,220,255,997,997,,997,260,1172,1172,,1172,290,1157,1157,,1157,294,1134,1134,,1134,299,1041,1041,,1041,263,891,891,,891,242,758,758,,758,211,548,548,,548,171,260,997,,997,260,290,1172,,1172,290,294,1157,,1157,294,299,1134,,1134,299,263,1041,,1041,263,242,891,,891,242,211,758,,758,211,171,548,,548,171,193,193,203,203,221,221,251,251,,997,,997,260,,1172,,1172,290,,1157,,1157,294,,1134,,1134,299,,1041,,1041,263,,891,,891,242,,758,,758,211,,548,,548,171,0.119,997,,997,260,0.296,1172,,1172,290,0.2,1157,,1157,294,0.052,1134,,1134,299,-0.037,1041,,1041,263,-0.259,891,,891,242,-0.37,758,,758,211,-0.073,548,,548,171
Vertox Whole Wheat - White Label Variant,Kaeferling Pro A,115,115,85,75,100,155,175,190,155,145,110,85,90,110,140,155,185,230,235,240,185,175,155,115,130,130,175,185,225,245,235,235,225,175,150,115,140,145,190,220,230,275,285,240,245,190,160,125,140,165,185,215,255,260,310,295,225,200,170,140,165,165,190,250,280,280,-1,-1,-1,320,320,-1,-1,-1,290,290,-1,-1,-1,280,280,-1,-1,-1,280,280,-1,-1,-1,220,220,-1,-1,-1,200,200,-1,-1,-1,160,160,-1,-1,-1,170,190,230,270,952,952,,952,270,1045,1045,,1045,305,1026,1026,,1026,313,1017,1017,,1017,305,871,871,,871,277,793,793,,793,242,655,655,,655,216,513,513,,513,182,270,952,,952,270,305,1045,,1045,305,313,1026,,1026,313,305,1017,,1017,305,277,871,,871,277,242,793,,793,242,216,655,,655,216,182,513,,513,182,198,198,210,210,238,238,263,263,,952,,952,270,,1045,,1045,305,,1026,,1026,313,,1017,,1017,305,,871,,871,277,,793,,793,242,,655,,655,216,,513,,513,182,0.253,952,,952,270,0.353,1045,,1045,305,0.247,1026,,1026,313,0.093,1017,,1017,305,-0.06,871,,871,277,-0.233,793,,793,242,-0.353,655,,655,216,-0.03,513,,513,182
Vertox Whole Wheat - White Label Variant,Nordic Pest Group AB,155,150,100,90,140,190,230,210,200,175,130,110,115,130,155,210,230,250,270,295,255,230,175,130,170,175,220,260,285,300,335,290,270,250,190,165,175,185,225,260,280,310,365,335,290,230,225,165,200,200,225,295,335,340,345,355,300,250,235,170,205,210,275,275,330,330,-1,-1,-1,380,380,-1,-1,-1,390,390,-1,-1,-1,400,400,-1,-1,-1,355,355,-1,-1,-1,295,295,-1,-1,-1,255,255,-1,-1,-1,200,200,-1,-1,-1,210,215,265,340,846,846,,846,347,897,897,,897,374,935,935,,935,400,972,972,,972,390,859,859,,859,353,701,701,,701,312,597,597,,597,274,476,476,,476,228,347,846,,846,347,374,897,,897,374,400,935,,935,400,390,972,,972,390,353,859,,859,353,312,701,,701,312,274,597,,597,274,228,476,,476,228,249,249,254,254,293,293,334,334,,846,,846,347,,897,,897,374,,935,,935,400,,972,,972,390,,859,,859,353,,701,,701,312,,597,,597,274,,476,,476,228,0.22,846,,846,347,0.42,897,,897,374,0.36,935,,935,400,0.12,972,,972,390,-0.02,859,,859,353,-0.16,701,,701,312,-0.32,597,,597,274,-0.02,476,,476,228
Vertox Whole Wheat - White Label Variant,Desert Shield Pest Mgmt,200,190,155,120,170,255,280,285,285,255,195,145,150,155,220,270,300,340,365,350,320,280,245,195,205,215,265,320,390,415,440,375,330,315,265,200,250,235,315,360,420,440,475,415,355,330,270,230,260,280,315,355,455,425,505,455,435,365,310,220,265,290,325,380,455,455,-1,-1,-1,505,505,-1,-1,-1,550,550,-1,-1,-1,505,505,-1,-1,-1,450,450,-1,-1,-1,350,350,-1,-1,-1,310,310,-1,-1,-1,240,240,-1,-1,-1,285,305,390,445,693,693,,693,492,773,773,,773,527,837,837,,837,579,742,742,,742,525,705,705,,705,475,600,600,,600,406,502,502,,502,344,399,399,,399,264,492,693,,693,492,527,773,,773,527,579,837,,837,579,525,742,,742,525,475,705,,705,475,406,600,,600,406,344,502,,502,344,264,399,,399,264,305,305,322,322,386,386,439,439,,693,,693,492,,773,,773,527,,837,,837,579,,742,,742,525,,705,,705,475,,600,,600,406,,502,,502,344,,399,,399,264,0.27,693,,693,492,0.339,773,,773,527,0.183,837,,837,579,0.052,742,,742,525,-0.087,705,,705,475,-0.2,600,,600,406,-0.409,502,,502,344,-0.152,399,,399,264
Vertox Whole Wheat - White Label Variant,AgroPlus Distributors SARL,375,435,300,260,400,525,635,575,600,530,360,305,310,345,455,550,710,685,815,815,705,590,480,385,465,480,560,715,775,795,815,830,745,615,535,435,500,510,620,770,765,930,900,890,770,675,575,475,495,580,715,795,945,995,930,1015,855,730,610,455,565,600,660,795,935,935,-1,-1,-1,970,970,-1,-1,-1,1030,1030,-1,-1,-1,1070,1070,-1,-1,-1,905,905,-1,-1,-1,790,790,-1,-1,-1,700,700,-1,-1,-1,500,500,-1,-1,-1,555,635,785,865,1041,1041,,1041,948,1136,1136,,1136,1028,1185,1185,,1185,1081,1145,1145,,1145,1091,1045,1045,,1045,966,897,897,,897,829,769,769,,769,684,601,601,,601,537,948,1041,,1041,948,1028,1136,,1136,1028,1081,1185,,1185,1081,1091,1145,,1145,1091,966,1045,,1045,966,829,897,,897,829,684,769,,769,684,537,601,,601,537,589,589,652,652,730,730,844,844,,1041,,1041,948,,1136,,1136,1028,,1185,,1185,1081,,1145,,1145,1091,,1045,,1045,966,,897,,897,829,,769,,769,684,,601,,601,537,0.292,1041,,1041,948,0.422,1136,,1136,1028,0.231,1185,,1185,1081,0.101,1145,,1145,1091,0,1045,,1045,966,-0.116,897,,897,829,-0.322,769,,769,684,-0.06,601,,601,537
Vertox Whole Wheat - White Label Variant,CleanCity Municipal Services,450,455,300,305,400,520,705,665,610,495,425,330,365,360,510,585,760,800,860,810,715,610,590,440,500,490,650,690,780,950,915,925,735,695,575,435,525,580,680,735,940,1030,1005,1020,850,775,630,495,515,620,730,855,940,1095,1140,1105,865,790,700,510,565,655,820,940,1050,1050,-1,-1,-1,1070,1070,-1,-1,-1,1175,1175,-1,-1,-1,1035,1035,-1,-1,-1,965,965,-1,-1,-1,815,815,-1,-1,-1,715,715,-1,-1,-1,575,575,-1,-1,-1,620,630,815,1005,1233,1233,,1233,1022,1390,1390,,1390,1146,1398,1398,,1398,1222,1321,1321,,1321,1168,1151,1151,,1151,997,1015,1015,,1015,876,900,900,,900,761,694,694,,694,583,1022,1233,,1233,1022,1146,1390,,1390,1146,1222,1398,,1398,1222,1168,1321,,1321,1168,997,1151,,1151,997,876,1015,,1015,876,761,900,,900,761,583,694,,694,583,634,634,691,691,806,806,907,907,,1233,,1233,1022,,1390,,1390,1146,,1398,,1398,1222,,1321,,1321,1168,,1151,,1151,997,,1015,,1015,876,,900,,900,761,,694,,694,583,0.258,1233,,1233,1022,0.29,1390,,1390,1146,0.29,1398,,1398,1222,0.032,1321,,1321,1168,-0.048,1151,,1151,997,-0.194,1015,,1015,876,-0.403,900,,900,761,-0.048,694,,694,583
Vertox Whole Wheat - White Label Variant,FarmCare Retail Network,315,365,230,230,325,395,465,475,475,390,330,235,250,305,350,440,580,560,590,605,600,510,425,335,350,360,475,535,665,725,685,700,620,485,415,310,360,390,515,545,720,675,700,710,690,600,465,340,445,415,570,635,740,770,830,730,645,590,515,380,435,495,570,660,740,740,-1,-1,-1,810,810,-1,-1,-1,795,795,-1,-1,-1,855,855,-1,-1,-1,685,685,-1,-1,-1,635,635,-1,-1,-1,575,575,-1,-1,-1,395,395,-1,-1,-1,465,495,625,670,1094,1094,,1094,789,1189,1189,,1189,813,1233,1233,,1233,832,1182,1182,,1182,830,1110,1110,,1110,766,964,964,,964,679,785,785,,785,595,637,637,,637,470,789,1094,,1094,789,813,1189,,1189,813,832,1233,,1233,832,830,1182,,1182,830,766,1110,,1110,766,679,964,,964,679,595,785,,785,595,470,637,,637,470,520,520,544,544,637,637,697,697,,1094,,1094,789,,1189,,1189,813,,1233,,1233,832,,1182,,1182,830,,1110,,1110,766,,964,,964,679,,785,,785,595,,637,,637,470,0.252,1094,,1094,789,0.277,1189,,1189,813,0.17,1233,,1233,832,0.063,1182,,1182,830,-0.107,1110,,1110,766,-0.245,964,,964,679,-0.403,785,,785,595,0.039,637,,637,470
Vertox Whole Wheat - White Label Variant,PestEx Solutions Inc,420,450,320,265,370,575,680,645,610,500,440,280,365,405,485,560,755,775,895,830,715,600,570,420,465,530,640,665,880,930,925,825,830,715,590,455,540,560,690,795,935,1020,965,1025,850,755,580,460,530,620,715,860,890,1045,1085,1100,875,750,635,505,595,615,735,850,940,940,-1,-1,-1,1120,1120,-1,-1,-1,1155,1155,-1,-1,-1,1085,1085,-1,-1,-1,980,980,-1,-1,-1,825,825,-1,-1,-1,720,720,-1,-1,-1,560,560,-1,-1,-1,655,650,780,885,778,778,,778,966,889,889,,889,1083,909,909,,909,1124,868,868,,868,1092,785,785,,785,985,685,685,,685,866,603,603,,603,766,482,482,,482,624,966,778,,778,966,1083,889,,889,1083,1124,909,,909,1124,1092,868,,868,1092,985,785,,785,985,866,685,,685,866,766,603,,603,766,624,482,,482,624,703,703,742,742,827,827,902,902,,778,,778,966,,889,,889,1083,,909,,909,1124,,868,,868,1092,,785,,785,985,,685,,685,866,,603,,603,766,,482,,482,624,0.382,778,,778,966,0.327,889,,889,1083,0.273,909,,909,1124,0.2,868,,868,1092,-0.073,785,,785,985,-0.2,685,,685,866,-0.382,603,,603,766,-0.031,482,,482,624
Vertox Whole Wheat - White Label Variant,EcoShield Pest Control,305,340,240,225,310,390,465,505,430,380,330,230,255,280,380,445,560,615,655,670,580,520,390,320,335,405,450,570,615,670,745,650,610,500,460,360,365,425,520,605,640,750,740,720,670,535,495,330,420,420,505,640,665,800,795,785,640,555,515,375,460,480,540,635,765,765,-1,-1,-1,795,795,-1,-1,-1,835,835,-1,-1,-1,805,805,-1,-1,-1,680,680,-1,-1,-1,655,655,-1,-1,-1,525,525,-1,-1,-1,400,400,-1,-1,-1,445,545,570,685,670,670,,670,745,712,712,,712,819,740,740,,740,850,722,722,,722,829,641,641,,641,738,566,566,,566,658,492,492,,492,584,387,387,,387,465,745,670,,670,745,819,712,,712,819,850,740,,740,850,829,722,,722,829,738,641,,641,738,658,566,,566,658,584,492,,492,584,465,387,,387,465,508,508,551,551,612,612,702,702,,670,,670,745,,712,,712,819,,740,,740,850,,722,,722,829,,641,,641,738,,566,,566,658,,492,,492,584,,387,,387,465,0.349,670,,670,745,0.297,712,,712,819,0.368,740,,740,850,0.077,722,,722,829,-0.053,641,,641,738,-0.163,566,,566,658,-0.397,492,,492,584,-0.037,387,,387,465
Vertox Whole Wheat - White Label Variant,Harvest Agro Traders,415,515,365,325,395,625,665,675,685,590,455,315,330,380,520,610,740,805,885,915,750,645,550,470,485,585,650,805,835,995,1055,920,790,715,640,455,530,540,690,780,950,1100,1000,1055,870,725,670,535,575,590,790,850,1025,1055,1105,1010,985,785,725,515,660,685,830,1000,1045,1045,-1,-1,-1,1170,1170,-1,-1,-1,1170,1170,-1,-1,-1,1145,1145,-1,-1,-1,1085,1085,-1,-1,-1,920,920,-1,-1,-1,710,710,-1,-1,-1,615,615,-1,-1,-1,685,720,895,1060,986,986,,986,1093,1097,1097,,1097,1229,1123,1123,,1123,1241,1095,1095,,1095,1200,985,985,,985,1096,820,820,,820,920,709,709,,709,778,554,554,,554,613,1093,986,,986,1093,1229,1097,,1097,1229,1241,1123,,1123,1241,1200,1095,,1095,1200,1096,985,,985,1096,920,820,,820,920,778,709,,709,778,613,554,,554,613,693,693,739,739,899,899,1043,1043,,986,,986,1093,,1097,,1097,1229,,1123,,1123,1241,,1095,,1095,1200,,985,,985,1096,,820,,820,920,,709,,709,778,,554,,554,613,0.357,986,,986,1093,0.374,1097,,1097,1229,0.309,1123,,1123,1241,0.2,1095,,1095,1200,-0.03,985,,985,1096,-0.1,820,,820,920,-0.37,709,,709,778,-0.053,554,,554,613
Vertox Whole Wheat - White Label Variant,Urban Hygiene Authority,515,515,405,330,440,695,800,835,750,660,545,375,400,490,575,685,790,930,1020,1060,900,780,630,505,555,580,690,915,920,1085,1125,1135,940,815,680,555,630,695,785,995,1025,1065,1265,1165,1035,880,740,530,615,705,915,925,1080,1305,1345,1165,1125,975,855,570,745,750,895,1100,1260,1260,-1,-1,-1,1370,1370,-1,-1,-1,1380,1380,-1,-1,-1,1320,1320,-1,-1,-1,1085,1085,-1,-1,-1,1075,1075,-1,-1,-1,915,915,-1,-1,-1,630,630,-1,-1,-1,795,855,1050,1120,1433,1433,,1433,1236,1607,1607,,1607,1375,1705,1705,,1705,1430,1634,1634,,1634,1349,1372,1372,,1372,1190,1293,1293,,1293,1102,1066,1066,,1066,958,823,823,,823,712,1236,1433,,1433,1236,1375,1607,,1607,1375,1430,1705,,1705,1430,1349,1634,,1634,1349,1190,1372,,1372,1190,1102,1293,,1293,1102,958,1066,,1066,958,712,823,,823,712,843,843,894,894,1052,1052,1164,1164,,1433,,1433,1236,,1607,,1607,1375,,1705,,1705,1430,,1634,,1634,1349,,1372,,1372,1190,,1293,,1293,1102,,1066,,1066,958,,823,,823,712,0.328,1433,,1433,1236,0.297,1607,,1607,1375,0.38,1705,,1705,1430,0.195,1634,,1634,1349,-0.031,1372,,1372,1190,-0.097,1293,,1293,1102,-0.333,1066,,1066,958,-0.087,823,,823,712
Vertox Whole Wheat - White Label Variant,GreenField Agro Supplies,360,415,290,250,360,455,600,575,495,440,345,270,270,345,395,510,590,740,690,685,670,575,470,360,450,425,515,590,690,815,745,815,630,565,485,395,435,490,570,715,815,800,795,785,710,590,505,385,440,495,615,705,820,940,860,845,835,660,540,470,515,520,605,815,880,880,-1,-1,-1,990,990,-1,-1,-1,1015,1015,-1,-1,-1,875,875,-1,-1,-1,865,865,-1,-1,-1,670,670,-1,-1,-1,570,570,-1,-1,-1,445,445,-1,-1,-1,535,630,720,755,900,900,,900,885,1022,1022,,1022,995,1025,1025,,1025,980,958,958,,958,931,877,877,,877,870,731,731,,731,708,640,640,,640,591,508,508,,508,472,885,900,,900,885,995,1022,,1022,995,980,1025,,1025,980,931,958,,958,931,870,877,,877,870,708,731,,731,708,591,640,,640,591,472,508,,508,472,538,538,599,599,683,683,792,792,,900,,900,885,,1022,,1022,995,,1025,,1025,980,,958,,958,931,,877,,877,870,,731,,731,708,,640,,640,591,,508,,508,472,0.232,900,,900,885,0.196,1022,,1022,995,0.123,1025,,1025,980,0.007,958,,958,931,-0.145,877,,877,870,-0.232,731,,731,708,-0.391,640,,640,591,-0.052,508,,508,472
Vertox Whole Wheat - White Label Variant,Kaeferling Pro A - Old,370,385,300,235,375,455,555,625,590,440,365,275,320,320,465,540,655,675,730,770,635,540,510,380,395,430,535,680,785,765,830,825,675,565,525,410,480,455,630,630,775,815,815,800,755,610,520,435,505,540,595,720,840,910,870,915,840,650,625,460,500,515,650,800,870,870,-1,-1,-1,980,980,-1,-1,-1,930,930,-1,-1,-1,895,895,-1,-1,-1,855,855,-1,-1,-1,710,710,-1,-1,-1,635,635,-1,-1,-1,490,490,-1,-1,-1,595,565,725,785,1358,1358,,1358,902,1481,1481,,1481,953,1460,1460,,1460,975,1469,1469,,1469,993,1329,1329,,1329,914,1137,1137,,1137,775,1005,1005,,1005,720,762,762,,762,599,902,1358,,1358,902,953,1481,,1481,953,975,1460,,1460,975,993,1469,,1469,993,914,1329,,1329,914,775,1137,,1137,775,720,1005,,1005,720,599,762,,762,599,658,658,664,664,774,774,845,845,,1358,,1358,902,,1481,,1481,953,,1460,,1460,975,,1469,,1469,993,,1329,,1329,914,,1137,,1137,775,,1005,,1005,720,,762,,762,599,0.255,1358,,1358,902,0.304,1481,,1481,953,0.17,1460,,1460,975,0.013,1469,,1469,993,-0.063,1329,,1329,914,-0.156,1137,,1137,775,-0.371,1005,,1005,720,-0.145,762,,762,599
VERTOX- Base Bulk WL01,UK Pest Solutions Ltd,1330,1400,1005,870,1295,1690,1900,2165,1945,1525,1265,885,1015,1185,1560,1705,2205,2540,2545,2695,2410,1940,1640,1255,1395,1565,1990,2080,2665,2735,2990,2720,2215,2180,1750,1325,1650,1610,2045,2150,2750,2665,3100,2705,2630,2130,1845,1400,1660,1780,2230,2560,2925,3170,3250,3200,2595,2320,2100,1555,1815,1955,2140,2750,2980,2980,-1,-1,-1,3105,3105,-1,-1,-1,3410,3410,-1,-1,-1,3420,3420,-1,-1,-1,2635,2635,-1,-1,-1,2425,2425,-1,-1,-1,2245,2245,-1,-1,-1,1580,1580,-1,-1,-1,1850,2080,2240,2660,4040,4040,,4040,3030,4226,4226,,4226,3223,4423,4423,,4423,3477,4303,4303,,4303,3402,3806,3806,,3806,2863,3201,3201,,3201,2497,2825,2825,,2825,2180,2051,2051,,2051,1597,3030,4040,,4040,3030,3223,4226,,4226,3223,3477,4423,,4423,3477,3402,4303,,4303,3402,2863,3806,,3806,2863,2497,3201,,3201,2497,2180,2825,,2825,2180,1597,2051,,2051,1597,1854,1854,2028,2028,2297,2297,2608,2608,,4040,,4040,3030,,4226,,4226,3223,,4423,,4423,3477,,4303,,4303,3402,,3806,,3806,2863,,3201,,3201,2497,,2825,,2825,2180,,2051,,2051,1597,0.251,4040,,4040,3030,0.286,4226,,4226,3223,0.166,4423,,4423,3477,0.044,4303,,4303,3402,-0.111,3806,,3806,2863,-0.227,3201,,3201,2497,-0.373,2825,,2825,2180,-0.008,2051,,2051,1597
VERTOX- Base Bulk WL01,Euro Agro Chemicals GmbH,515,585,425,345,520,690,855,880,735,720,545,385,450,485,620,750,935,935,1080,980,925,780,655,490,575,635,730,820,960,1140,1200,1185,1015,830,685,565,630,645,850,895,1025,1145,1235,1185,1065,845,815,550,615,705,855,1065,1070,1200,1230,1200,1095,915,765,645,730,705,925,1130,1295,1295,-1,-1,-1,1290,1290,-1,-1,-1,1405,1405,-1,-1,-1,1395,1395,-1,-1,-1,1080,1080,-1,-1,-1,1025,1025,-1,-1,-1,790,790,-1,-1,-1,620,620,-1,-1,-1,770,830,960,1170,1684,1684,,1684,1218,1851,1851,,1851,1312,1978,1978,,1978,1407,1846,1846,,1846,1372,1643,1643,,1643,1216,1484,1484,,1484,1078,1264,1264,,1264,929,966,966,,966,758,1218,1684,,1684,1218,1312,1851,,1851,1312,1407,1978,,1978,1407,1372,1846,,1846,1372,1216,1643,,1643,1216,1078,1484,,1484,1078,929,1264,,1264,929,758,966,,966,758,842,842,880,880,1029,1029,1158,1158,,1684,,1684,1218,,1851,,1851,1312,,1978,,1978,1407,,1846,,1846,1372,,1643,,1643,1216,,1484,,1484,1078,,1264,,1264,929,,966,,966,758,0.268,1684,,1684,1218,0.219,1851,,1851,1312,0.266,1978,,1978,1407,0.072,1846,,1846,1372,-0.032,1643,,1643,1216,-0.217,1484,,1484,1078,-0.395,1264,,1264,929,-0.008,966,,966,758
VERTOX- Base Bulk WL01,Apex Pest Control Services,560,650,480,390,545,730,860,1010,825,770,635,440,480,510,705,800,1025,1110,1255,1195,1010,860,735,545,660,760,825,1070,1220,1180,1225,1245,1100,945,870,580,665,710,870,990,1130,1320,1425,1295,1090,980,925,695,785,865,980,1210,1290,1515,1475,1440,1330,1035,950,750,820,895,1060,1230,1270,1270,-1,-1,-1,1595,1595,-1,-1,-1,1585,1585,-1,-1,-1,1500,1500,-1,-1,-1,1270,1270,-1,-1,-1,1200,1200,-1,-1,-1,915,915,-1,-1,-1,775,775,-1,-1,-1,905,980,1180,1275,2918,2918,,2918,1376,2959,2959,,2959,1539,3103,3103,,3103,1602,3147,3147,,3147,1580,2822,2822,,2822,1405,2336,2336,,2336,1267,2065,2065,,2065,1141,1612,1612,,1612,935,1376,2918,,2918,1376,1539,2959,,2959,1539,1602,3103,,3103,1602,1580,3147,,3147,1580,1405,2822,,2822,1405,1267,2336,,2336,1267,1141,2065,,2065,1141,935,1612,,1612,935,1024,1024,1093,1093,1218,1218,1342,1342,,2918,,2918,1376,,2959,,2959,1539,,3103,,3103,1602,,3147,,3147,1580,,2822,,2822,1405,,2336,,2336,1267,,2065,,2065,1141,,1612,,1612,935,0.36,2918,,2918,1376,0.384,2959,,2959,1539,0.256,3103,,3103,1602,0.163,3147,,3147,1580,-0.028,2822,,2822,1405,-0.132,2336,,2336,1267,-0.381,2065,,2065,1141,-0.018,1612,,1612,935
VERTOX- Base Bulk WL01,SafeHome Pest Control Pvt Ltd,300,350,230,210,320,435,485,470,505,400,300,215,275,265,360,455,500,595,680,625,530,525,440,315,370,395,495,515,650,665,645,650,555,535,440,340,390,435,520,605,700,715,710,705,615,565,460,370,420,410,495,570,695,720,750,725,625,570,525,385,440,480,570,635,695,695,-1,-1,-1,745,745,-1,-1,-1,830,830,-1,-1,-1,810,810,-1,-1,-1,690,690,-1,-1,-1,645,645,-1,-1,-1,555,555,-1,-1,-1,430,430,-1,-1,-1,470,475,565,710,2677,2677,,2677,740,2747,2747,,2747,790,2967,2967,,2967,824,2933,2933,,2933,802,2505,2505,,2505,721,2313,2313,,2313,671,1819,1819,,1819,583,1503,1503,,1503,471,740,2677,,2677,740,790,2747,,2747,790,824,2967,,2967,824,802,2933,,2933,802,721,2505,,2505,721,671,2313,,2313,671,583,1819,,1819,583,471,1503,,1503,471,521,521,535,535,618,618,689,689,,2677,,2677,740,,2747,,2747,790,,2967,,2967,824,,2933,,2933,802,,2505,,2505,721,,2313,,2313,671,,1819,,1819,583,,1503,,1503,471,0.114,2677,,2677,740,0.118,2747,,2747,790,0.143,2967,,2967,824,0.082,2933,,2933,802,-0.074,2505,,2505,721,-0.274,2313,,2313,671,-0.433,1819,,1819,583,-0.119,1503,,1503,471
VERTOX- Base Bulk WL01,Kaeferling Pro A,345,355,270,245,335,445,555,520,475,410,330,255,270,280,400,460,560,600,700,640,550,505,450,355,375,400,520,570,680,700,685,695,665,505,465,380,375,445,495,630,650,750,740,780,620,575,495,380,430,475,535,690,755,845,800,805,670,630,550,385,450,475,590,635,735,735,-1,-1,-1,905,905,-1,-1,-1,895,895,-1,-1,-1,840,840,-1,-1,-1,805,805,-1,-1,-1,640,640,-1,-1,-1,580,580,-1,-1,-1,410,410,-1,-1,-1,480,485,590,730,2263,2263,,2263,756,2432,2432,,2432,869,2651,2651,,2651,913,2451,2451,,2451,892,2310,2310,,2310,791,1950,1950,,1950,686,1595,1595,,1595,601,1258,1258,,1258,457,756,2263,,2263,756,869,2432,,2432,869,913,2651,,2651,913,892,2451,,2451,892,791,2310,,2310,791,686,1950,,1950,686,601,1595,,1595,601,457,1258,,1258,457,479,479,517,517,587,587,669,669,,2263,,2263,756,,2432,,2432,869,,2651,,2651,913,,2451,,2451,892,,2310,,2310,791,,1950,,1950,686,,1595,,1595,601,,1258,,1258,457,0.264,2263,,2263,756,0.179,2432,,2432,869,0.146,2651,,2651,913,0.111,2451,,2451,892,-0.057,2310,,2310,791,-0.214,1950,,1950,686,-0.379,1595,,1595,601,0.058,1258,,1258,457
VERTOX- Base Bulk WL01,Nordic Pest Group AB,450,430,330,275,405,555,685,625,595,495,415,300,365,400,495,600,665,760,825,895,755,625,545,415,510,540,600,765,885,920,935,875,765,730,540,440,550,525,625,750,890,910,905,980,810,740,585,485,540,610,660,745,860,1000,965,965,945,790,665,535,575,595,725,795,1015,1015,-1,-1,-1,1090,1090,-1,-1,-1,1035,1035,-1,-1,-1,1085,1085,-1,-1,-1,960,960,-1,-1,-1,765,765,-1,-1,-1,655,655,-1,-1,-1,575,575,-1,-1,-1,585,625,755,945,2225,2225,,2225,980,2373,2373,,2373,1061,2455,2455,,2455,1076,2392,2392,,2392,1085,2025,2025,,2025,981,1884,1884,,1884,863,1615,1615,,1615,736,1273,1273,,1273,622,980,2225,,2225,980,1061,2373,,2373,1061,1076,2455,,2455,1076,1085,2392,,2392,1085,981,2025,,2025,981,863,1884,,1884,863,736,1615,,1615,736,622,1273,,1273,622,681,681,705,705,795,795,903,903,,2225,,2225,980,,2373,,2373,1061,,2455,,2455,1076,,2392,,2392,1085,,2025,,2025,981,,1884,,1884,863,,1615,,1615,736,,1273,,1273,622,0.22,2225,,2225,980,0.16,2373,,2373,1061,0.22,2455,,2455,1076,-0.02,2392,,2392,1085,-0.1,2025,,2025,981,-0.22,1884,,1884,863,-0.4,1615,,1615,736,-0.1,1273,,1273,622
VERTOX- Base Bulk WL01,Desert Shield Pest Mgmt,570,635,460,405,545,690,920,900,840,705,580,425,430,540,690,775,905,1095,1075,1135,985,910,750,580,655,715,850,990,1010,1205,1310,1135,965,865,760,560,725,720,800,1080,1095,1295,1335,1225,1145,905,805,595,720,710,920,1060,1220,1380,1455,1410,1180,985,920,670,780,765,1005,1095,1200,1200,-1,-1,-1,1475,1475,-1,-1,-1,1540,1540,-1,-1,-1,1470,1470,-1,-1,-1,1320,1320,-1,-1,-1,1020,1020,-1,-1,-1,875,875,-1,-1,-1,650,650,-1,-1,-1,760,825,1115,1150,1790,1790,,1790,1240,2000,2000,,2000,1476,2153,2153,,2153,1567,2001,2001,,2001,1488,1801,1801,,1801,1312,1522,1522,,1522,1085,1242,1242,,1242,945,977,977,,977,699,1240,1790,,1790,1240,1476,2000,,2000,1476,1567,2153,,2153,1567,1488,2001,,2001,1488,1312,1801,,1801,1312,1085,1522,,1522,1085,945,1242,,1242,945,699,977,,977,699,811,811,859,859,1044,1044,1160,1160,,1790,,1790,1240,,2000,,2000,1476,,2153,,2153,1567,,2001,,2001,1488,,1801,,1801,1312,,1522,,1522,1085,,1242,,1242,945,,977,,977,699,0.167,1790,,1790,1240,0.319,2000,,2000,1476,0.265,2153,,2153,1567,0.02,2001,,2001,1488,-0.049,1801,,1801,1312,-0.186,1522,,1522,1085,-0.422,1242,,1242,945,-0.032,977,,977,699
VERTOX- Base Bulk WL01,AgroPlus Distributors SARL,1270,1205,960,855,1165,1585,1800,1890,1675,1435,1085,900,990,990,1440,1600,2110,2340,2180,2450,2080,1905,1545,1110,1360,1345,1615,2025,2120,2300,2625,2495,2290,1980,1500,1145,1445,1420,1925,2000,2425,2765,2600,2790,2420,1915,1825,1220,1540,1720,2000,2165,2640,2620,3080,2735,2275,2175,1885,1375,1520,1625,1955,2240,2770,2770,-1,-1,-1,3010,3010,-1,-1,-1,2915,2915,-1,-1,-1,3030,3030,-1,-1,-1,2585,2585,-1,-1,-1,2140,2140,-1,-1,-1,1930,1930,-1,-1,-1,1380,1380,-1,-1,-1,1710,1690,1990,2485,2742,2742,,2742,2644,2998,2998,,2998,2962,3143,3143,,3143,3096,3143,3143,,3143,3156,2782,2782,,2782,2744,2332,2332,,2332,2384,2019,2019,,2019,1998,1529,1529,,1529,1473,2644,2742,,2742,2644,2962,2998,,2998,2962,3096,3143,,3143,3096,3156,3143,,3143,3156,2744,2782,,2782,2744,2384,2332,,2332,2384,1998,2019,,2019,1998,1473,1529,,1529,1473,1700,1700,1726,1726,2018,2018,2206,2206,,2742,,2742,2644,,2998,,2998,2962,,3143,,3143,3096,,3143,,3143,3156,,2782,,2782,2744,,2332,,2332,2384,,2019,,2019,1998,,1529,,1529,1473,0.233,2742,,2742,2644,0.309,2998,,2998,2962,0.225,3143,,3143,3096,0.086,3143,,3143,3156,-0.018,2782,,2782,2744,-0.259,2332,,2332,2384,-0.429,2019,,2019,1998,-0.057,1529,,1529,1473
VERTOX- Base Bulk WL01,CleanCity Municipal Services,1240,1330,1000,840,1235,1545,2010,1855,1970,1695,1350,865,1030,1120,1540,1695,2135,2450,2625,2680,2190,1970,1735,1240,1345,1545,1875,2050,2390,2800,2550,2545,2450,1910,1610,1295,1620,1515,1845,2415,2535,2835,2870,3020,2560,2260,1790,1340,1590,1600,2100,2250,2635,3195,3110,2830,2480,2235,1975,1400,1690,1730,2265,2660,2935,2935,-1,-1,-1,2960,2960,-1,-1,-1,3065,3065,-1,-1,-1,3315,3315,-1,-1,-1,2940,2940,-1,-1,-1,2550,2550,-1,-1,-1,2010,2010,-1,-1,-1,1525,1525,-1,-1,-1,1680,1860,2355,2720,3269,3269,,3269,2913,3461,3461,,3461,3218,3581,3581,,3581,3278,3650,3650,,3650,3266,3105,3105,,3105,2976,2776,2776,,2776,2633,2405,2405,,2405,2260,1913,1913,,1913,1786,2913,3269,,3269,2913,3218,3461,,3461,3218,3278,3581,,3581,3278,3266,3650,,3650,3266,2976,3105,,3105,2976,2633,2776,,2776,2633,2260,2405,,2405,2260,1786,1913,,1913,1786,1994,1994,2056,2056,2452,2452,2708,2708,,3269,,3269,2913,,3461,,3461,3218,,3581,,3581,3278,,3650,,3650,3266,,3105,,3105,2976,,2776,,2776,2633,,2405,,2405,2260,,1913,,1913,1786,0.402,3269,,3269,2913,0.441,3461,,3461,3218,0.353,3581,,3581,3278,0.186,3650,,3650,3266,0.059,3105,,3105,2976,-0.177,2776,,2776,2633,-0.382,2405,,2405,2260,0.059,1913,,1913,1786
VERTOX- Base Bulk WL01,FarmCare Retail Network,930,980,755,620,840,1255,1385,1460,1395,1255,965,705,730,820,1135,1310,1505,1850,1960,1890,1695,1520,1210,890,1060,1180,1490,1645,1750,1920,1950,1910,1890,1455,1365,945,1155,1280,1550,1765,1925,2225,2270,1960,1750,1580,1410,1080,1120,1195,1630,1750,2185,2220,2265,2380,2030,1675,1530,1195,1350,1460,1570,1980,2085,2085,-1,-1,-1,2270,2270,-1,-1,-1,2525,2525,-1,-1,-1,2530,2530,-1,-1,-1,2060,2060,-1,-1,-1,1890,1890,-1,-1,-1,1590,1590,-1,-1,-1,1240,1240,-1,-1,-1,1345,1445,1765,1910,2979,2979,,2979,2214,3238,3238,,3238,2421,3416,3416,,3416,2567,3107,3107,,3107,2535,2785,2785,,2785,2171,2536,2536,,2536,1898,2149,2149,,2149,1644,1608,1608,,1608,1257,2214,2979,,2979,2214,2421,3238,,3238,2421,2567,3416,,3416,2567,2535,3107,,3107,2535,2171,2785,,2785,2171,1898,2536,,2536,1898,1644,2149,,2149,1644,1257,1608,,1608,1257,1382,1382,1497,1497,1787,1787,2008,2008,,2979,,2979,2214,,3238,,3238,2421,,3416,,3416,2567,,3107,,3107,2535,,2785,,2785,2171,,2536,,2536,1898,,2149,,2149,1644,,1608,,1608,1257,0.3,2979,,2979,2214,0.423,3238,,3238,2421,0.227,3416,,3416,2567,0.092,3107,,3107,2535,-0.008,2785,,2785,2171,-0.135,2536,,2536,1898,-0.339,2149,,2149,1644,-0.111,1608,,1608,1257
VERTOX- Base Bulk WL01,PestEx Solutions Inc,1290,1255,980,815,1165,1680,1830,2095,1770,1640,1285,915,1035,1090,1540,1660,1940,2485,2410,2375,2105,1970,1660,1245,1495,1505,1880,1960,2390,2645,2675,2840,2295,2090,1600,1355,1470,1665,1860,2255,2585,3005,2735,2565,2565,2205,1805,1495,1600,1780,1905,2360,2915,2950,2835,3185,2500,2270,1865,1455,1690,1745,2295,2330,2935,2935,-1,-1,-1,3075,3075,-1,-1,-1,3115,3115,-1,-1,-1,2900,2900,-1,-1,-1,2720,2720,-1,-1,-1,2265,2265,-1,-1,-1,1975,1975,-1,-1,-1,1520,1520,-1,-1,-1,1840,1960,2215,2735,2207,2207,,2207,2930,2411,2411,,2411,3248,2482,2482,,2482,3195,2474,2474,,2474,3229,2186,2186,,2186,2862,1939,1939,,1939,2574,1624,1624,,1624,2174,1309,1309,,1309,1794,2930,2207,,2207,2930,3248,2411,,2411,3248,3195,2482,,2482,3195,3229,2474,,2474,3229,2862,2186,,2186,2862,2574,1939,,1939,2574,2174,1624,,1624,2174,1794,1309,,1309,1794,1984,1984,2106,2106,2398,2398,2654,2654,,2207,,2207,2930,,2411,,2411,3248,,2482,,2482,3195,,2474,,2474,3229,,2186,,2186,2862,,1939,,1939,2574,,1624,,1624,2174,,1309,,1309,1794,0.147,2207,,2207,2930,0.275,2411,,2411,3248,0.147,2482,,2482,3195,-0.037,2474,,2474,3229,-0.119,2186,,2186,2862,-0.284,1939,,1939,2574,-0.413,1624,,1624,2174,-0.039,1309,,1309,1794
VERTOX- Base Bulk WL01,EcoShield Pest Control,1005,1090,705,670,880,1175,1440,1430,1305,1275,985,640,775,800,1080,1220,1485,1735,2005,1740,1645,1460,1175,985,1065,1090,1260,1595,1940,2050,1960,1970,1695,1505,1240,920,1085,1190,1410,1810,1935,2000,2170,2115,1900,1645,1350,1025,1135,1335,1530,1710,2035,2115,2185,2100,1955,1580,1490,1060,1275,1290,1660,2025,2255,2255,-1,-1,-1,2370,2370,-1,-1,-1,2545,2545,-1,-1,-1,2400,2400,-1,-1,-1,2135,2135,-1,-1,-1,1845,1845,-1,-1,-1,1460,1460,-1,-1,-1,1190,1190,-1,-1,-1,1415,1415,1590,2085,1827,1827,,1827,2229,1950,1950,,1950,2371,2015,2015,,2015,2505,1934,1934,,1934,2404,1763,1763,,1763,2207,1551,1551,,1551,1977,1369,1369,,1369,1699,1065,1065,,1065,1376,2229,1827,,1827,2229,2371,1950,,1950,2371,2505,2015,,2015,2505,2404,1934,,1934,2404,2207,1763,,1763,2207,1977,1551,,1551,1977,1699,1369,,1369,1699,1376,1065,,1065,1376,1526,1526,1583,1583,1787,1787,2075,2075,,1827,,1827,2229,,1950,,1950,2371,,2015,,2015,2505,,1934,,1934,2404,,1763,,1763,2207,,1551,,1551,1977,,1369,,1369,1699,,1065,,1065,1376,0.303,1827,,1827,2229,0.35,1950,,1950,2371,0.342,2015,,2015,2505,0.112,1934,,1934,2404,0.008,1763,,1763,2207,-0.154,1551,,1551,1977,-0.35,1369,,1369,1699,-0.074,1065,,1065,1376
VERTOX- Base Bulk WL01,Harvest Agro Traders,1300,1455,1085,930,1195,1610,1905,2025,1850,1775,1420,925,1030,1145,1620,1775,2120,2405,2600,2805,2195,2000,1815,1220,1585,1540,1920,2330,2610,2685,3065,3005,2380,2060,1975,1380,1605,1640,2065,2450,2755,2755,2935,2780,2660,2375,1870,1550,1695,1815,2225,2480,2840,2980,3360,2945,2830,2255,2035,1460,1825,2070,2225,2860,3055,3055,-1,-1,-1,3145,3145,-1,-1,-1,3425,3425,-1,-1,-1,3325,3325,-1,-1,-1,2885,2885,-1,-1,-1,2565,2565,-1,-1,-1,2340,2340,-1,-1,-1,1725,1725,-1,-1,-1,1855,2020,2400,2830,2632,2632,,2632,3090,2833,2833,,2833,3237,2963,2963,,2963,3566,2841,2841,,2841,3413,2497,2497,,2497,3019,2204,2204,,2204,2623,1899,1899,,1899,2318,1455,1455,,1455,1690,3090,2632,,2632,3090,3237,2833,,2833,3237,3566,2963,,2963,3566,3413,2841,,2841,3413,3019,2497,,2497,3019,2623,2204,,2204,2623,2318,1899,,1899,2318,1690,1455,,1455,1690,1924,1924,2093,2093,2430,2430,2861,2861,,2632,,2632,3090,,2833,,2833,3237,,2963,,2963,3566,,2841,,2841,3413,,2497,,2497,3019,,2204,,2204,2623,,1899,,1899,2318,,1455,,1455,1690,0.329,2632,,2632,3090,0.317,2833,,2833,3237,0.327,2963,,2963,3566,0.2,2841,,2841,3413,0.058,2497,,2497,3019,-0.118,2204,,2204,2623,-0.327,1899,,1899,2318,0.008,1455,,1455,1690
VERTOX- Base Bulk WL01,Urban Hygiene Authority,1540,1620,1100,1075,1445,1965,2400,2235,2300,2030,1480,1135,1265,1280,1735,2010,2580,2630,3020,3050,2525,2210,2005,1520,1785,1750,2340,2425,2995,3125,3330,3110,2875,2360,2120,1580,1745,1865,2330,2665,3220,3620,3625,3255,2805,2765,2245,1775,1840,2075,2490,2725,3360,3825,3410,3505,2975,2540,2235,1860,2010,2050,2430,2990,3245,3245,-1,-1,-1,3825,3825,-1,-1,-1,4160,4160,-1,-1,-1,3970,3970,-1,-1,-1,3290,3290,-1,-1,-1,3055,3055,-1,-1,-1,2375,2375,-1,-1,-1,1790,1790,-1,-1,-1,2000,2170,2975,3300,3801,3801,,3801,3497,4202,4202,,4202,4004,4382,4382,,4382,4105,4161,4161,,4161,3947,3561,3561,,3561,3338,3335,3335,,3335,3021,2789,2789,,2789,2463,2129,2129,,2129,1913,3497,3801,,3801,3497,4004,4202,,4202,4004,4105,4382,,4382,4105,3947,4161,,4161,3947,3338,3561,,3561,3338,3021,3335,,3335,3021,2463,2789,,2789,2463,1913,2129,,2129,1913,2096,2096,2238,2238,2867,2867,3244,3244,,3801,,3801,3497,,4202,,4202,4004,,4382,,4382,4105,,4161,,4161,3947,,3561,,3561,3338,,3335,,3335,3021,,2789,,2789,2463,,2129,,2129,1913,0.215,3801,,3801,3497,0.351,4202,,4202,4004,0.279,4382,,4382,4105,0.153,4161,,4161,3947,-0.039,3561,,3561,3338,-0.178,3335,,3335,3021,-0.415,2789,,2789,2463,-0.049,2129,,2129,1913
VERTOX- Base Bulk WL01,GreenField Agro Supplies,1155,1180,825,780,995,1385,1620,1805,1560,1315,1040,810,915,925,1350,1575,1870,2145,2035,2275,1970,1535,1480,1105,1170,1375,1560,1690,2185,2330,2360,2155,2070,1705,1390,1195,1305,1440,1685,1800,2300,2490,2475,2410,2255,1980,1610,1280,1410,1390,1750,2175,2355,2385,2620,2425,2355,2095,1640,1295,1420,1590,2020,2260,2535,2535,-1,-1,-1,2755,2755,-1,-1,-1,2900,2900,-1,-1,-1,2520,2520,-1,-1,-1,2380,2380,-1,-1,-1,2040,2040,-1,-1,-1,1835,1835,-1,-1,-1,1330,1330,-1,-1,-1,1560,1730,1890,2330,2420,2420,,2420,2606,2748,2748,,2748,2797,2796,2796,,2796,2923,2673,2673,,2673,2691,2416,2416,,2416,2532,2069,2069,,2069,2174,1802,1802,,1802,1840,1302,1302,,1302,1404,2606,2420,,2420,2606,2797,2748,,2748,2797,2923,2796,,2796,2923,2691,2673,,2673,2691,2532,2416,,2416,2532,2174,2069,,2069,2174,1840,1802,,1802,1840,1404,1302,,1302,1404,1578,1578,1728,1728,2009,2009,2355,2355,,2420,,2420,2606,,2748,,2748,2797,,2796,,2796,2923,,2673,,2673,2691,,2416,,2416,2532,,2069,,2069,2174,,1802,,1802,1840,,1302,,1302,1404,0.207,2420,,2420,2606,0.283,2748,,2748,2797,0.211,2796,,2796,2923,0.084,2673,,2673,2691,-0.072,2416,,2416,2532,-0.144,2069,,2069,2174,-0.354,1802,,1802,1840,-0.028,1302,,1302,1404
VERTOX- Base Bulk WL01,Kaeferling Pro A - Old,1105,1205,860,695,1060,1430,1760,1865,1670,1325,1180,775,915,985,1240,1650,1855,2245,2055,2195,1995,1590,1405,1065,1270,1420,1555,1830,2125,2440,2255,2205,2165,1895,1410,1130,1315,1510,1700,2115,2330,2270,2395,2530,2150,2025,1660,1175,1315,1415,1745,2045,2370,2730,2520,2455,2130,1860,1655,1350,1500,1665,1850,2165,2490,2490,-1,-1,-1,2640,2640,-1,-1,-1,2805,2805,-1,-1,-1,2980,2980,-1,-1,-1,2360,2360,-1,-1,-1,2080,2080,-1,-1,-1,1745,1745,-1,-1,-1,1320,1320,-1,-1,-1,1655,1620,2035,2250,3505,3505,,3505,2530,3649,3649,,3649,2773,3814,3814,,3814,2768,3880,3880,,3880,2831,3393,3393,,3393,2526,2881,2881,,2881,2233,2493,2493,,2493,1936,1963,1963,,1963,1552,2530,3505,,3505,2530,2773,3649,,3649,2773,2768,3814,,3814,2768,2831,3880,,3880,2831,2526,3393,,3393,2526,2233,2881,,2881,2233,1936,2493,,2493,1936,1552,1963,,1963,1552,1739,1739,1841,1841,2076,2076,2352,2352,,3505,,3505,2530,,3649,,3649,2773,,3814,,3814,2768,,3880,,3880,2831,,3393,,3393,2526,,2881,,2881,2233,,2493,,2493,1936,,1963,,1963,1552,0.315,3505,,3505,2530,0.365,3649,,3649,2773,0.331,3814,,3814,2768,0.107,3880,,3880,2831,-0.008,3393,,3393,2526,-0.128,2881,,2881,2233,-0.381,2493,,2493,1936,-0.072,1963,,1963,1552
---

*PerciBOT Demand Planning Prompt — v2.0 | Percipere Consulting Ltd.*
*Updated: Wide-format CSV structure. No query-time filtering. Company and Plant constants removed from data.*


          `


          ].join('\n');
        }

        else if(this._props.systemPrompt == 'Sony'){

          this.system = [ 
            `You are PerciBOT, a financial Q&A assistant for the Channel Performance Dataset.
All monetary values are ₹ million.
Use ONLY the dataset provided. Do NOT assume or invent values.

===============================================================

CORE RULES

===============================================================

All values → ₹ million, 2 decimals.

Use data as-is.

Do calculations only when explicitly asked or clearly implied (vs, variance, MoM, total, roll-up, compare, best, highest, ranking).

If dataset lacks a value → reply “Not in dataset”.

Keep answers concise, numeric, and business-ready (bold labels + compact tables).

Do NOT explain logic unless asked.

Normalize names (case/spacing/hyphens ignored).

===============================================================

DATA FORMAT

===============================================================
Each row: {Channel, Account, Date, Version, Amount}
Versions: Actual, Budget only. No Forecast (return “Not in dataset” if asked).

===============================================================

SMART NAME NORMALIZATION

===============================================================
Normalize channels & accounts: case-insensitive, ignore spaces/hyphens/underscores.

Examples:

max2, MAX-2, max_2 → MAX 2

“hindi”, “hindi movie” → Hindi Movies

“program cost”, “programme” → Program

===============================================================

CHANNEL HIERARCHY

===============================================================
Parents computed from children (not in dataset):

Common Cost → CORPORATE

English Movies → PIX

Hindi Movies → MAX, MAX 1, MAX 2

Kids → YAY

Mix Content → WAH

Production House → Motion Pictures, STUDIO NEXT

Program → BBC, PAL, SAB, SET

Regional → AATH, SONY MARATHI

All Channels → all leaf channels

===============================================================

ACCOUNT HIERARCHY

===============================================================

REVENUE Accounts

Ad Agency Incentives, Bad Debts, Digital Ad Agency Incentives, Digital AD Sales, Discounts/Rebates, Digital Subscription, Digital Syndication, Net Advertising REV BAU (Domestic), Net Advertising REV BAU (International), Other Income, Subscription REV BAU (Domestic), Subscription REV BAU (International), Syndication REV, Youtube REV.

COST Accounts

Affiliate Marketing, Broadcast, Carriage, Digital Content COST, Depreciation, Dealer Incentives, Digital Marketing, Films Amortisation, G&A, Incentives, Linear Marketing, Programming COST, ROU Building Lease Amort, Sports Amortisation, Salaries, Tech COST.

NET REVENUE

Net Revenue = Revenue – Cost
(Always computed; not stored in dataset.)

===============================================================

AGGREGATION RULES

===============================================================

Channel or Account parent totals = sum of mapped children.

Actual vs Budget:

Variance = A – B

%Variance = (A – B) / B × 100

MoM = current month – previous month.

Cross-rollups supported: Channel × Account, Revenue, Cost, Net Revenue.

===============================================================

RANKING LOGIC (BEST/HIGHEST/LOWEST)

===============================================================
Treat these as calculation triggers, not dataset fields:
best, top, highest, lowest, biggest, smallest, most profitable, least profitable, best performing, worst performing.

Defaults:

If measure unspecified → Actual Net Revenue.

If version unspecified → Actual.

If period unspecified → sum all months.

Steps:

Compute Revenue, Cost, Net Revenue per Channel for the requested period.

Rank channels by the requested measure (or default).

Return channel + numeric value.

Only say “Not in dataset” if no valid channels match.

===============================================================

FISCAL YEAR LOGIC

===============================================================
FY2025 = Apr 2025 → Mar 2026
Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar
If user says “2025” → interpret as Apr–Dec 2025 (YTD).

===============================================================

ANSWERING STYLE

===============================================================

Use bold labels and compact tables.

Responses must be short, numeric, and business-focused.

Ask for clarification only when essential (missing period/version).

=====================================================================

DATASET – CHANNEL PERFORMANCE

=====================================================================

data[1491]{Channels,Account,Date,Version,Amount}:
AATH,Ad Agency Incentives,Apr (2025),Actual,"-1.70"
AATH,Ad Agency Incentives,Apr (2025),Budget,"-1.76"
AATH,Ad Agency Incentives,May (2025),Actual,"-1.80"
AATH,Ad Agency Incentives,May (2025),Budget,"-1.82"
AATH,Ad Agency Incentives,Jun (2025),Actual,"-1.70"
AATH,Ad Agency Incentives,Jun (2025),Budget,"-1.73"
AATH,Ad Agency Incentives,Jul (2025),Actual,"-1.60"
AATH,Ad Agency Incentives,Jul (2025),Budget,"-1.76"
AATH,Ad Agency Incentives,Aug (2025),Actual,"-1.90"
AATH,Ad Agency Incentives,Aug (2025),Budget,"-1.82"
AATH,Ad Agency Incentives,Sep (2025),Actual,"-1.80"
AATH,Ad Agency Incentives,Sep (2025),Budget,"-1.67"
AATH,Ad Agency Incentives,Oct (2025),Actual,"-1.60"
AATH,Ad Agency Incentives,Oct (2025),Budget,"-1.63"
AATH,Ad Agency Incentives,Nov (2025),Actual,"-1.60"
AATH,Ad Agency Incentives,Nov (2025),Budget,"-1.48"
AATH,Ad Agency Incentives,Dec (2025),Actual,"-1.50"
AATH,Ad Agency Incentives,Dec (2025),Budget,"-1.59"
AATH,Ad Agency Incentives,Jan (2026),Budget,"-1.57"
AATH,Ad Agency Incentives,Feb (2026),Budget,"-1.41"
AATH,Ad Agency Incentives,Mar (2026),Budget,"-1.60"
AATH,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"27.00"
AATH,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"28.41"
AATH,Net Advertising REV BAU (Domestic),May (2025),Actual,"27.90"
AATH,Net Advertising REV BAU (Domestic),May (2025),Budget,"29.36"
AATH,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"28.70"
AATH,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"27.89"
AATH,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"25.70"
AATH,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"28.27"
AATH,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"30.10"
AATH,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"29.36"
AATH,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"28.80"
AATH,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"26.83"
AATH,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"26.00"
AATH,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"26.21"
AATH,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"24.90"
AATH,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"23.79"
AATH,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"27.20"
AATH,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"25.67"
AATH,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"25.21"
AATH,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"22.77"
AATH,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"25.75"
AATH,Syndication REV,Apr (2025),Actual,"0.00"
AATH,Syndication REV,Apr (2025),Budget,"0.00"
AATH,Syndication REV,May (2025),Actual,"0.70"
AATH,Syndication REV,May (2025),Budget,"0.75"
AATH,Syndication REV,Jun (2025),Actual,"0.80"
AATH,Syndication REV,Jun (2025),Budget,"0.75"
AATH,Syndication REV,Jul (2025),Actual,"0.70"
AATH,Syndication REV,Jul (2025),Budget,"0.75"
AATH,Syndication REV,Aug (2025),Actual,"1.20"
AATH,Syndication REV,Aug (2025),Budget,"1.25"
AATH,Syndication REV,Sep (2025),Actual,"1.50"
AATH,Syndication REV,Sep (2025),Budget,"1.50"
AATH,Syndication REV,Oct (2025),Actual,"2.00"
AATH,Syndication REV,Oct (2025),Budget,"2.00"
AATH,Syndication REV,Nov (2025),Actual,"1.60"
AATH,Syndication REV,Nov (2025),Budget,"1.50"
AATH,Syndication REV,Dec (2025),Actual,"1.40"
AATH,Syndication REV,Dec (2025),Budget,"1.50"
AATH,Syndication REV,Jan (2026),Budget,"1.25"
AATH,Syndication REV,Feb (2026),Budget,"1.25"
AATH,Syndication REV,Mar (2026),Budget,"1.25"
AATH,Linear Marketing,Apr (2025),Actual,"-3.30"
AATH,Linear Marketing,Apr (2025),Budget,"-3.19"
AATH,Linear Marketing,May (2025),Actual,"-1.20"
AATH,Linear Marketing,May (2025),Budget,"-1.10"
AATH,Linear Marketing,Jun (2025),Actual,"-3.40"
AATH,Linear Marketing,Jun (2025),Budget,"-3.59"
AATH,Linear Marketing,Jul (2025),Actual,"-0.50"
AATH,Linear Marketing,Jul (2025),Budget,"-0.49"
AATH,Linear Marketing,Aug (2025),Actual,"-1.10"
AATH,Linear Marketing,Aug (2025),Budget,"-1.10"
AATH,Linear Marketing,Sep (2025),Actual,"-0.50"
AATH,Linear Marketing,Sep (2025),Budget,"-0.58"
AATH,Linear Marketing,Oct (2025),Actual,"-8.50"
AATH,Linear Marketing,Oct (2025),Budget,"-8.27"
AATH,Linear Marketing,Nov (2025),Actual,"-1.50"
AATH,Linear Marketing,Nov (2025),Budget,"-1.45"
AATH,Linear Marketing,Dec (2025),Actual,"-2.20"
AATH,Linear Marketing,Dec (2025),Budget,"-2.07"
AATH,Linear Marketing,Jan (2026),Budget,"-3.96"
AATH,Linear Marketing,Feb (2026),Budget,"-0.44"
AATH,Linear Marketing,Mar (2026),Budget,"-1.07"
AATH,Programming COST,Apr (2025),Actual,"-4.80"
AATH,Programming COST,Apr (2025),Budget,"-4.90"
AATH,Programming COST,May (2025),Actual,"-5.20"
AATH,Programming COST,May (2025),Budget,"-4.90"
AATH,Programming COST,Jun (2025),Actual,"-4.60"
AATH,Programming COST,Jun (2025),Budget,"-4.90"
AATH,Programming COST,Jul (2025),Actual,"-5.30"
AATH,Programming COST,Jul (2025),Budget,"-4.90"
AATH,Programming COST,Aug (2025),Actual,"-4.80"
AATH,Programming COST,Aug (2025),Budget,"-4.90"
AATH,Programming COST,Sep (2025),Actual,"-4.80"
AATH,Programming COST,Sep (2025),Budget,"-4.90"
AATH,Programming COST,Oct (2025),Actual,"-4.60"
AATH,Programming COST,Oct (2025),Budget,"-4.90"
AATH,Programming COST,Nov (2025),Actual,"-4.80"
AATH,Programming COST,Nov (2025),Budget,"-4.90"
AATH,Programming COST,Dec (2025),Actual,"-5.30"
AATH,Programming COST,Dec (2025),Budget,"-4.90"
AATH,Programming COST,Jan (2026),Budget,"-4.90"
AATH,Programming COST,Feb (2026),Budget,"-4.90"
AATH,Programming COST,Mar (2026),Budget,"-4.90"
BBC,Ad Agency Incentives,Apr (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Apr (2025),Budget,"0.00"
BBC,Ad Agency Incentives,May (2025),Actual,"0.00"
BBC,Ad Agency Incentives,May (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Jun (2025),Actual,"-0.20"
BBC,Ad Agency Incentives,Jun (2025),Budget,"-0.23"
BBC,Ad Agency Incentives,Jul (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Jul (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Aug (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Aug (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Sep (2025),Actual,"-0.20"
BBC,Ad Agency Incentives,Sep (2025),Budget,"-0.23"
BBC,Ad Agency Incentives,Oct (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Oct (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Nov (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Nov (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Dec (2025),Actual,"-0.20"
BBC,Ad Agency Incentives,Dec (2025),Budget,"-0.23"
BBC,Ad Agency Incentives,Jan (2026),Budget,"0.00"
BBC,Ad Agency Incentives,Feb (2026),Budget,"0.00"
BBC,Ad Agency Incentives,Mar (2026),Budget,"-0.23"
BBC,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),May (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),May (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"3.50"
BBC,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"3.75"
BBC,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"4.00"
BBC,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"3.75"
BBC,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"3.40"
BBC,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"3.75"
BBC,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"3.75"
BBC,Syndication REV,Apr (2025),Actual,"0.00"
BBC,Syndication REV,Apr (2025),Budget,"0.00"
BBC,Syndication REV,May (2025),Actual,"0.00"
BBC,Syndication REV,May (2025),Budget,"0.00"
BBC,Syndication REV,Jun (2025),Actual,"0.00"
BBC,Syndication REV,Jun (2025),Budget,"0.00"
BBC,Syndication REV,Jul (2025),Actual,"0.00"
BBC,Syndication REV,Jul (2025),Budget,"0.00"
BBC,Syndication REV,Aug (2025),Actual,"0.00"
BBC,Syndication REV,Aug (2025),Budget,"0.00"
BBC,Syndication REV,Sep (2025),Actual,"0.00"
BBC,Syndication REV,Sep (2025),Budget,"0.00"
BBC,Syndication REV,Oct (2025),Actual,"0.00"
BBC,Syndication REV,Oct (2025),Budget,"0.00"
BBC,Syndication REV,Nov (2025),Actual,"0.00"
BBC,Syndication REV,Nov (2025),Budget,"0.00"
BBC,Syndication REV,Dec (2025),Actual,"0.00"
BBC,Syndication REV,Dec (2025),Budget,"0.00"
BBC,Syndication REV,Jan (2026),Budget,"0.00"
BBC,Syndication REV,Feb (2026),Budget,"0.00"
BBC,Syndication REV,Mar (2026),Budget,"0.00"
BBC,Linear Marketing,Apr (2025),Actual,"-0.90"
BBC,Linear Marketing,Apr (2025),Budget,"-0.92"
BBC,Linear Marketing,May (2025),Actual,"-0.50"
BBC,Linear Marketing,May (2025),Budget,"-0.53"
BBC,Linear Marketing,Jun (2025),Actual,"-2.10"
BBC,Linear Marketing,Jun (2025),Budget,"-2.18"
BBC,Linear Marketing,Jul (2025),Actual,"-0.50"
BBC,Linear Marketing,Jul (2025),Budget,"-0.53"
BBC,Linear Marketing,Aug (2025),Actual,"-5.50"
BBC,Linear Marketing,Aug (2025),Budget,"-5.26"
BBC,Linear Marketing,Sep (2025),Actual,"-1.20"
BBC,Linear Marketing,Sep (2025),Budget,"-1.23"
BBC,Linear Marketing,Oct (2025),Actual,"-1.60"
BBC,Linear Marketing,Oct (2025),Budget,"-1.75"
BBC,Linear Marketing,Nov (2025),Actual,"-1.10"
BBC,Linear Marketing,Nov (2025),Budget,"-1.03"
BBC,Linear Marketing,Dec (2025),Actual,"-1.20"
BBC,Linear Marketing,Dec (2025),Budget,"-1.13"
BBC,Linear Marketing,Jan (2026),Budget,"-0.48"
BBC,Linear Marketing,Feb (2026),Budget,"-1.10"
BBC,Linear Marketing,Mar (2026),Budget,"-0.52"
BBC,Programming COST,Apr (2025),Actual,"-7.00"
BBC,Programming COST,Apr (2025),Budget,"-7.34"
BBC,Programming COST,May (2025),Actual,"-7.00"
BBC,Programming COST,May (2025),Budget,"-7.34"
BBC,Programming COST,Jun (2025),Actual,"-7.40"
BBC,Programming COST,Jun (2025),Budget,"-7.34"
BBC,Programming COST,Jul (2025),Actual,"-7.60"
BBC,Programming COST,Jul (2025),Budget,"-7.34"
BBC,Programming COST,Aug (2025),Actual,"-6.70"
BBC,Programming COST,Aug (2025),Budget,"-7.34"
BBC,Programming COST,Sep (2025),Actual,"-6.80"
BBC,Programming COST,Sep (2025),Budget,"-7.34"
BBC,Programming COST,Oct (2025),Actual,"-7.10"
BBC,Programming COST,Oct (2025),Budget,"-7.34"
BBC,Programming COST,Nov (2025),Actual,"-7.30"
BBC,Programming COST,Nov (2025),Budget,"-7.34"
BBC,Programming COST,Dec (2025),Actual,"-7.10"
BBC,Programming COST,Dec (2025),Budget,"-7.34"
BBC,Programming COST,Jan (2026),Budget,"-7.34"
BBC,Programming COST,Feb (2026),Budget,"-7.34"
BBC,Programming COST,Mar (2026),Budget,"-7.34"
CORPORATE,Ad Agency Incentives,Apr (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Apr (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,May (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,May (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Jun (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Jun (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Jul (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Jul (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Aug (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Aug (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Sep (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Sep (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Oct (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Oct (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Nov (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Nov (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Dec (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Dec (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Jan (2026),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Feb (2026),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Mar (2026),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),May (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),May (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"0.00"
CORPORATE,Linear Marketing,Apr (2025),Actual,"-19.20"
CORPORATE,Linear Marketing,Apr (2025),Budget,"-20.98"
CORPORATE,Linear Marketing,May (2025),Actual,"-24.80"
CORPORATE,Linear Marketing,May (2025),Budget,"-24.79"
CORPORATE,Linear Marketing,Jun (2025),Actual,"-24.90"
CORPORATE,Linear Marketing,Jun (2025),Budget,"-22.75"
CORPORATE,Linear Marketing,Jul (2025),Actual,"-17.90"
CORPORATE,Linear Marketing,Jul (2025),Budget,"-18.72"
CORPORATE,Linear Marketing,Aug (2025),Actual,"-31.10"
CORPORATE,Linear Marketing,Aug (2025),Budget,"-29.42"
CORPORATE,Linear Marketing,Sep (2025),Actual,"-28.20"
CORPORATE,Linear Marketing,Sep (2025),Budget,"-26.55"
CORPORATE,Linear Marketing,Oct (2025),Actual,"-28.90"
CORPORATE,Linear Marketing,Oct (2025),Budget,"-26.86"
CORPORATE,Linear Marketing,Nov (2025),Actual,"-29.60"
CORPORATE,Linear Marketing,Nov (2025),Budget,"-29.09"
CORPORATE,Linear Marketing,Dec (2025),Actual,"-16.90"
CORPORATE,Linear Marketing,Dec (2025),Budget,"-17.09"
CORPORATE,Linear Marketing,Jan (2026),Budget,"-22.12"
CORPORATE,Linear Marketing,Feb (2026),Budget,"-19.36"
CORPORATE,Linear Marketing,Mar (2026),Budget,"-17.11"
CORPORATE,Programming COST,Apr (2025),Actual,"-60.50"
CORPORATE,Programming COST,Apr (2025),Budget,"-56.80"
CORPORATE,Programming COST,May (2025),Actual,"-45.00"
CORPORATE,Programming COST,May (2025),Budget,"-43.00"
CORPORATE,Programming COST,Jun (2025),Actual,"-47.50"
CORPORATE,Programming COST,Jun (2025),Budget,"-43.70"
CORPORATE,Programming COST,Jul (2025),Actual,"-42.60"
CORPORATE,Programming COST,Jul (2025),Budget,"-45.70"
CORPORATE,Programming COST,Aug (2025),Actual,"-51.40"
CORPORATE,Programming COST,Aug (2025),Budget,"-48.70"
CORPORATE,Programming COST,Sep (2025),Actual,"-48.90"
CORPORATE,Programming COST,Sep (2025),Budget,"-47.30"
CORPORATE,Programming COST,Oct (2025),Actual,"-41.10"
CORPORATE,Programming COST,Oct (2025),Budget,"-44.50"
CORPORATE,Programming COST,Nov (2025),Actual,"-42.50"
CORPORATE,Programming COST,Nov (2025),Budget,"-44.30"
CORPORATE,Programming COST,Dec (2025),Actual,"-44.90"
CORPORATE,Programming COST,Dec (2025),Budget,"-44.20"
CORPORATE,Programming COST,Jan (2026),Budget,"-44.60"
CORPORATE,Programming COST,Feb (2026),Budget,"-44.70"
CORPORATE,Programming COST,Mar (2026),Budget,"-43.30"
MAX,Ad Agency Incentives,Apr (2025),Actual,"-9.40"
MAX,Ad Agency Incentives,Apr (2025),Budget,"-9.22"
MAX,Ad Agency Incentives,May (2025),Actual,"-8.60"
MAX,Ad Agency Incentives,May (2025),Budget,"-9.51"
MAX,Ad Agency Incentives,Jun (2025),Actual,"-10.40"
MAX,Ad Agency Incentives,Jun (2025),Budget,"-9.67"
MAX,Ad Agency Incentives,Jul (2025),Actual,"-9.60"
MAX,Ad Agency Incentives,Jul (2025),Budget,"-10.40"
MAX,Ad Agency Incentives,Aug (2025),Actual,"-10.20"
MAX,Ad Agency Incentives,Aug (2025),Budget,"-10.40"
MAX,Ad Agency Incentives,Sep (2025),Actual,"-12.40"
MAX,Ad Agency Incentives,Sep (2025),Budget,"-11.38"
MAX,Ad Agency Incentives,Oct (2025),Actual,"-9.70"
MAX,Ad Agency Incentives,Oct (2025),Budget,"-10.24"
MAX,Ad Agency Incentives,Nov (2025),Actual,"-9.00"
MAX,Ad Agency Incentives,Nov (2025),Budget,"-9.67"
MAX,Ad Agency Incentives,Dec (2025),Actual,"-10.30"
MAX,Ad Agency Incentives,Dec (2025),Budget,"-9.98"
MAX,Ad Agency Incentives,Jan (2026),Budget,"-9.98"
MAX,Ad Agency Incentives,Feb (2026),Budget,"-8.57"
MAX,Ad Agency Incentives,Mar (2026),Budget,"-9.42"
MAX,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"149.10"
MAX,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"148.53"
MAX,Net Advertising REV BAU (Domestic),May (2025),Actual,"146.60"
MAX,Net Advertising REV BAU (Domestic),May (2025),Budget,"153.15"
MAX,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"169.90"
MAX,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"155.78"
MAX,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"166.60"
MAX,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"167.46"
MAX,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"174.20"
MAX,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"167.46"
MAX,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"201.50"
MAX,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"183.33"
MAX,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"156.70"
MAX,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"164.88"
MAX,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"144.60"
MAX,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"155.78"
MAX,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"157.40"
MAX,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"160.63"
MAX,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"160.63"
MAX,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"138.01"
MAX,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"151.72"
MAX,Syndication REV,Apr (2025),Actual,"0.00"
MAX,Syndication REV,Apr (2025),Budget,"0.00"
MAX,Syndication REV,May (2025),Actual,"6.00"
MAX,Syndication REV,May (2025),Budget,"6.50"
MAX,Syndication REV,Jun (2025),Actual,"6.90"
MAX,Syndication REV,Jun (2025),Budget,"6.50"
MAX,Syndication REV,Jul (2025),Actual,"6.70"
MAX,Syndication REV,Jul (2025),Budget,"6.50"
MAX,Syndication REV,Aug (2025),Actual,"6.50"
MAX,Syndication REV,Aug (2025),Budget,"7.15"
MAX,Syndication REV,Sep (2025),Actual,"6.40"
MAX,Syndication REV,Sep (2025),Budget,"6.50"
MAX,Syndication REV,Oct (2025),Actual,"6.00"
MAX,Syndication REV,Oct (2025),Budget,"6.50"
MAX,Syndication REV,Nov (2025),Actual,"8.30"
MAX,Syndication REV,Nov (2025),Budget,"8.67"
MAX,Syndication REV,Dec (2025),Actual,"8.80"
MAX,Syndication REV,Dec (2025),Budget,"8.67"
MAX,Syndication REV,Jan (2026),Budget,"8.67"
MAX,Syndication REV,Feb (2026),Budget,"8.67"
MAX,Syndication REV,Mar (2026),Budget,"8.67"
MAX,Linear Marketing,Apr (2025),Actual,"-2.70"
MAX,Linear Marketing,Apr (2025),Budget,"-2.49"
MAX,Linear Marketing,May (2025),Actual,"-4.70"
MAX,Linear Marketing,May (2025),Budget,"-4.79"
MAX,Linear Marketing,Jun (2025),Actual,"-2.60"
MAX,Linear Marketing,Jun (2025),Budget,"-2.61"
MAX,Linear Marketing,Jul (2025),Actual,"-2.60"
MAX,Linear Marketing,Jul (2025),Budget,"-2.42"
MAX,Linear Marketing,Aug (2025),Actual,"-7.10"
MAX,Linear Marketing,Aug (2025),Budget,"-6.67"
MAX,Linear Marketing,Sep (2025),Actual,"-2.80"
MAX,Linear Marketing,Sep (2025),Budget,"-2.56"
MAX,Linear Marketing,Oct (2025),Actual,"-2.90"
MAX,Linear Marketing,Oct (2025),Budget,"-2.64"
MAX,Linear Marketing,Nov (2025),Actual,"-2.30"
MAX,Linear Marketing,Nov (2025),Budget,"-2.31"
MAX,Linear Marketing,Dec (2025),Actual,"-4.70"
MAX,Linear Marketing,Dec (2025),Budget,"-5.10"
MAX,Linear Marketing,Jan (2026),Budget,"-6.35"
MAX,Linear Marketing,Feb (2026),Budget,"-2.40"
MAX,Linear Marketing,Mar (2026),Budget,"-2.27"
MAX,Programming COST,Apr (2025),Actual,"-4.50"
MAX,Programming COST,Apr (2025),Budget,"-4.67"
MAX,Programming COST,May (2025),Actual,"-4.50"
MAX,Programming COST,May (2025),Budget,"-4.67"
MAX,Programming COST,Jun (2025),Actual,"-4.80"
MAX,Programming COST,Jun (2025),Budget,"-4.67"
MAX,Programming COST,Jul (2025),Actual,"-4.30"
MAX,Programming COST,Jul (2025),Budget,"-4.67"
MAX,Programming COST,Aug (2025),Actual,"-4.70"
MAX,Programming COST,Aug (2025),Budget,"-4.67"
MAX,Programming COST,Sep (2025),Actual,"-4.70"
MAX,Programming COST,Sep (2025),Budget,"-4.67"
MAX,Programming COST,Oct (2025),Actual,"-5.00"
MAX,Programming COST,Oct (2025),Budget,"-4.67"
MAX,Programming COST,Nov (2025),Actual,"-4.90"
MAX,Programming COST,Nov (2025),Budget,"-4.67"
MAX,Programming COST,Dec (2025),Actual,"-4.80"
MAX,Programming COST,Dec (2025),Budget,"-4.67"
MAX,Programming COST,Jan (2026),Budget,"-4.67"
MAX,Programming COST,Feb (2026),Budget,"-4.67"
MAX,Programming COST,Mar (2026),Budget,"-4.67"
MAX 1,Ad Agency Incentives,Apr (2025),Actual,"-1.10"
MAX 1,Ad Agency Incentives,Apr (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,May (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,May (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Jun (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,Jun (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Jul (2025),Actual,"-1.20"
MAX 1,Ad Agency Incentives,Jul (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Aug (2025),Actual,"-1.20"
MAX 1,Ad Agency Incentives,Aug (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Sep (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,Sep (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Oct (2025),Actual,"-1.10"
MAX 1,Ad Agency Incentives,Oct (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Nov (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,Nov (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Dec (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,Dec (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Jan (2026),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Feb (2026),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Mar (2026),Budget,"-1.23"
MAX 1,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"21.90"
MAX 1,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),May (2025),Actual,"19.70"
MAX 1,Net Advertising REV BAU (Domestic),May (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"23.50"
MAX 1,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"19.90"
MAX 1,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"19.80"
MAX 1,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"21.90"
MAX 1,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"22.60"
MAX 1,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"22.90"
MAX 1,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"21.80"
MAX 1,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"21.67"
MAX 1,Syndication REV,Apr (2025),Actual,"0.00"
MAX 1,Syndication REV,Apr (2025),Budget,"0.00"
MAX 1,Syndication REV,May (2025),Actual,"0.00"
MAX 1,Syndication REV,May (2025),Budget,"0.00"
MAX 1,Syndication REV,Jun (2025),Actual,"0.00"
MAX 1,Syndication REV,Jun (2025),Budget,"0.00"
MAX 1,Syndication REV,Jul (2025),Actual,"0.00"
MAX 1,Syndication REV,Jul (2025),Budget,"0.00"
MAX 1,Syndication REV,Aug (2025),Actual,"0.00"
MAX 1,Syndication REV,Aug (2025),Budget,"0.00"
MAX 1,Syndication REV,Sep (2025),Actual,"0.00"
MAX 1,Syndication REV,Sep (2025),Budget,"0.00"
MAX 1,Syndication REV,Oct (2025),Actual,"0.00"
MAX 1,Syndication REV,Oct (2025),Budget,"0.00"
MAX 1,Syndication REV,Nov (2025),Actual,"0.00"
MAX 1,Syndication REV,Nov (2025),Budget,"0.00"
MAX 1,Syndication REV,Dec (2025),Actual,"0.00"
MAX 1,Syndication REV,Dec (2025),Budget,"0.00"
MAX 1,Syndication REV,Jan (2026),Budget,"0.00"
MAX 1,Syndication REV,Feb (2026),Budget,"0.00"
MAX 1,Syndication REV,Mar (2026),Budget,"0.00"
MAX 1,Linear Marketing,Apr (2025),Actual,"-1.50"
MAX 1,Linear Marketing,Apr (2025),Budget,"-1.36"
MAX 1,Linear Marketing,May (2025),Actual,"-1.30"
MAX 1,Linear Marketing,May (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Jun (2025),Actual,"-1.50"
MAX 1,Linear Marketing,Jun (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Jul (2025),Actual,"-1.40"
MAX 1,Linear Marketing,Jul (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Aug (2025),Actual,"-1.20"
MAX 1,Linear Marketing,Aug (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Sep (2025),Actual,"-1.30"
MAX 1,Linear Marketing,Sep (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Oct (2025),Actual,"-1.20"
MAX 1,Linear Marketing,Oct (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Nov (2025),Actual,"-1.30"
MAX 1,Linear Marketing,Nov (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Dec (2025),Actual,"-1.50"
MAX 1,Linear Marketing,Dec (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Jan (2026),Budget,"-1.36"
MAX 1,Linear Marketing,Feb (2026),Budget,"-1.36"
MAX 1,Linear Marketing,Mar (2026),Budget,"-1.36"
MAX 1,Programming COST,Apr (2025),Actual,"0.00"
MAX 1,Programming COST,Apr (2025),Budget,"0.00"
MAX 1,Programming COST,May (2025),Actual,"0.00"
MAX 1,Programming COST,May (2025),Budget,"0.00"
MAX 1,Programming COST,Jun (2025),Actual,"0.00"
MAX 1,Programming COST,Jun (2025),Budget,"0.00"
MAX 1,Programming COST,Jul (2025),Actual,"0.00"
MAX 1,Programming COST,Jul (2025),Budget,"0.00"
MAX 1,Programming COST,Aug (2025),Actual,"0.00"
MAX 1,Programming COST,Aug (2025),Budget,"0.00"
MAX 1,Programming COST,Sep (2025),Actual,"0.00"
MAX 1,Programming COST,Sep (2025),Budget,"0.00"
MAX 1,Programming COST,Oct (2025),Actual,"0.00"
MAX 1,Programming COST,Oct (2025),Budget,"0.00"
MAX 1,Programming COST,Nov (2025),Actual,"0.00"
MAX 1,Programming COST,Nov (2025),Budget,"0.00"
MAX 1,Programming COST,Dec (2025),Actual,"0.00"
MAX 1,Programming COST,Dec (2025),Budget,"0.00"
MAX 1,Programming COST,Jan (2026),Budget,"0.00"
MAX 1,Programming COST,Feb (2026),Budget,"0.00"
MAX 1,Programming COST,Mar (2026),Budget,"0.00"
MAX 2,Ad Agency Incentives,Apr (2025),Actual,"-2.50"
MAX 2,Ad Agency Incentives,Apr (2025),Budget,"-2.65"
MAX 2,Ad Agency Incentives,May (2025),Actual,"-2.60"
MAX 2,Ad Agency Incentives,May (2025),Budget,"-2.74"
MAX 2,Ad Agency Incentives,Jun (2025),Actual,"-3.00"
MAX 2,Ad Agency Incentives,Jun (2025),Budget,"-2.88"
MAX 2,Ad Agency Incentives,Jul (2025),Actual,"-3.10"
MAX 2,Ad Agency Incentives,Jul (2025),Budget,"-2.97"
MAX 2,Ad Agency Incentives,Aug (2025),Actual,"-3.30"
MAX 2,Ad Agency Incentives,Aug (2025),Budget,"-3.09"
MAX 2,Ad Agency Incentives,Sep (2025),Actual,"-2.90"
MAX 2,Ad Agency Incentives,Sep (2025),Budget,"-2.88"
MAX 2,Ad Agency Incentives,Oct (2025),Actual,"-2.80"
MAX 2,Ad Agency Incentives,Oct (2025),Budget,"-2.97"
MAX 2,Ad Agency Incentives,Nov (2025),Actual,"-3.20"
MAX 2,Ad Agency Incentives,Nov (2025),Budget,"-2.99"
MAX 2,Ad Agency Incentives,Dec (2025),Actual,"-3.10"
MAX 2,Ad Agency Incentives,Dec (2025),Budget,"-3.09"
MAX 2,Ad Agency Incentives,Jan (2026),Budget,"-3.09"
MAX 2,Ad Agency Incentives,Feb (2026),Budget,"-2.58"
MAX 2,Ad Agency Incentives,Mar (2026),Budget,"-2.85"
MAX 2,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"39.90"
MAX 2,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"42.62"
MAX 2,Net Advertising REV BAU (Domestic),May (2025),Actual,"45.00"
MAX 2,Net Advertising REV BAU (Domestic),May (2025),Budget,"44.04"
MAX 2,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"45.10"
MAX 2,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"46.33"
MAX 2,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"47.80"
MAX 2,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"47.87"
MAX 2,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"53.00"
MAX 2,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"49.79"
MAX 2,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"48.80"
MAX 2,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"46.33"
MAX 2,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"51.70"
MAX 2,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"47.87"
MAX 2,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"45.30"
MAX 2,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"48.18"
MAX 2,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"54.00"
MAX 2,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"49.79"
MAX 2,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"49.79"
MAX 2,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"41.51"
MAX 2,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"45.96"
MAX 2,Syndication REV,Apr (2025),Actual,"0.00"
MAX 2,Syndication REV,Apr (2025),Budget,"0.00"
MAX 2,Syndication REV,May (2025),Actual,"0.00"
MAX 2,Syndication REV,May (2025),Budget,"0.00"
MAX 2,Syndication REV,Jun (2025),Actual,"0.00"
MAX 2,Syndication REV,Jun (2025),Budget,"0.00"
MAX 2,Syndication REV,Jul (2025),Actual,"0.00"
MAX 2,Syndication REV,Jul (2025),Budget,"0.00"
MAX 2,Syndication REV,Aug (2025),Actual,"0.00"
MAX 2,Syndication REV,Aug (2025),Budget,"0.00"
MAX 2,Syndication REV,Sep (2025),Actual,"0.00"
MAX 2,Syndication REV,Sep (2025),Budget,"0.00"
MAX 2,Syndication REV,Oct (2025),Actual,"0.00"
MAX 2,Syndication REV,Oct (2025),Budget,"0.00"
MAX 2,Syndication REV,Nov (2025),Actual,"0.00"
MAX 2,Syndication REV,Nov (2025),Budget,"0.00"
MAX 2,Syndication REV,Dec (2025),Actual,"0.00"
MAX 2,Syndication REV,Dec (2025),Budget,"0.00"
MAX 2,Syndication REV,Jan (2026),Budget,"0.00"
MAX 2,Syndication REV,Feb (2026),Budget,"0.00"
MAX 2,Syndication REV,Mar (2026),Budget,"0.00"
MAX 2,Linear Marketing,Apr (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Apr (2025),Budget,"-0.64"
MAX 2,Linear Marketing,May (2025),Actual,"-0.60"
MAX 2,Linear Marketing,May (2025),Budget,"-0.65"
MAX 2,Linear Marketing,Jun (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Jun (2025),Budget,"-0.67"
MAX 2,Linear Marketing,Jul (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Jul (2025),Budget,"-0.69"
MAX 2,Linear Marketing,Aug (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Aug (2025),Budget,"-0.71"
MAX 2,Linear Marketing,Sep (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Sep (2025),Budget,"-0.67"
MAX 2,Linear Marketing,Oct (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Oct (2025),Budget,"-0.69"
MAX 2,Linear Marketing,Nov (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Nov (2025),Budget,"-0.69"
MAX 2,Linear Marketing,Dec (2025),Actual,"-0.80"
MAX 2,Linear Marketing,Dec (2025),Budget,"-0.71"
MAX 2,Linear Marketing,Jan (2026),Budget,"-0.71"
MAX 2,Linear Marketing,Feb (2026),Budget,"-0.63"
MAX 2,Linear Marketing,Mar (2026),Budget,"-0.67"
MAX 2,Programming COST,Apr (2025),Actual,"-1.30"
MAX 2,Programming COST,Apr (2025),Budget,"-1.33"
MAX 2,Programming COST,May (2025),Actual,"-1.40"
MAX 2,Programming COST,May (2025),Budget,"-1.33"
MAX 2,Programming COST,Jun (2025),Actual,"-1.20"
MAX 2,Programming COST,Jun (2025),Budget,"-1.33"
MAX 2,Programming COST,Jul (2025),Actual,"-1.20"
MAX 2,Programming COST,Jul (2025),Budget,"-1.33"
MAX 2,Programming COST,Aug (2025),Actual,"-1.40"
MAX 2,Programming COST,Aug (2025),Budget,"-1.33"
MAX 2,Programming COST,Sep (2025),Actual,"-1.30"
MAX 2,Programming COST,Sep (2025),Budget,"-1.33"
MAX 2,Programming COST,Oct (2025),Actual,"-1.40"
MAX 2,Programming COST,Oct (2025),Budget,"-1.33"
MAX 2,Programming COST,Nov (2025),Actual,"-1.30"
MAX 2,Programming COST,Nov (2025),Budget,"-1.33"
MAX 2,Programming COST,Dec (2025),Actual,"-1.40"
MAX 2,Programming COST,Dec (2025),Budget,"-1.33"
MAX 2,Programming COST,Jan (2026),Budget,"-1.33"
MAX 2,Programming COST,Feb (2026),Budget,"-1.33"
MAX 2,Programming COST,Mar (2026),Budget,"-1.33"
Motion Pictures,Syndication REV,Apr (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Apr (2025),Budget,"0.00"
Motion Pictures,Syndication REV,May (2025),Actual,"0.00"
Motion Pictures,Syndication REV,May (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Jun (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Jun (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Jul (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Jul (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Aug (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Aug (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Sep (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Sep (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Oct (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Oct (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Nov (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Nov (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Dec (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Dec (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Jan (2026),Budget,"0.00"
Motion Pictures,Syndication REV,Feb (2026),Budget,"0.00"
Motion Pictures,Syndication REV,Mar (2026),Budget,"0.00"
PAL,Ad Agency Incentives,Apr (2025),Actual,"-7.30"
PAL,Ad Agency Incentives,Apr (2025),Budget,"-7.98"
PAL,Ad Agency Incentives,May (2025),Actual,"-8.40"
PAL,Ad Agency Incentives,May (2025),Budget,"-8.42"
PAL,Ad Agency Incentives,Jun (2025),Actual,"-9.00"
PAL,Ad Agency Incentives,Jun (2025),Budget,"-8.71"
PAL,Ad Agency Incentives,Jul (2025),Actual,"-8.50"
PAL,Ad Agency Incentives,Jul (2025),Budget,"-9.00"
PAL,Ad Agency Incentives,Aug (2025),Actual,"-8.70"
PAL,Ad Agency Incentives,Aug (2025),Budget,"-9.00"
PAL,Ad Agency Incentives,Sep (2025),Actual,"-9.20"
PAL,Ad Agency Incentives,Sep (2025),Budget,"-9.00"
PAL,Ad Agency Incentives,Oct (2025),Actual,"-8.60"
PAL,Ad Agency Incentives,Oct (2025),Budget,"-9.29"
PAL,Ad Agency Incentives,Nov (2025),Actual,"-9.40"
PAL,Ad Agency Incentives,Nov (2025),Budget,"-9.29"
PAL,Ad Agency Incentives,Dec (2025),Actual,"-8.80"
PAL,Ad Agency Incentives,Dec (2025),Budget,"-9.29"
PAL,Ad Agency Incentives,Jan (2026),Budget,"-9.58"
PAL,Ad Agency Incentives,Feb (2026),Budget,"-9.58"
PAL,Ad Agency Incentives,Mar (2026),Budget,"-9.58"
PAL,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"140.60"
PAL,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"128.50"
PAL,Net Advertising REV BAU (Domestic),May (2025),Actual,"135.60"
PAL,Net Advertising REV BAU (Domestic),May (2025),Budget,"135.51"
PAL,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"126.60"
PAL,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"140.19"
PAL,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"144.10"
PAL,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"144.86"
PAL,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"150.80"
PAL,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"144.86"
PAL,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"157.70"
PAL,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"144.86"
PAL,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"149.90"
PAL,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"149.53"
PAL,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"139.50"
PAL,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"149.53"
PAL,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"144.90"
PAL,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"149.53"
PAL,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"154.21"
PAL,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"154.21"
PAL,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"154.21"
PAL,Syndication REV,Apr (2025),Actual,"0.00"
PAL,Syndication REV,Apr (2025),Budget,"0.00"
PAL,Syndication REV,May (2025),Actual,"0.00"
PAL,Syndication REV,May (2025),Budget,"0.00"
PAL,Syndication REV,Jun (2025),Actual,"0.00"
PAL,Syndication REV,Jun (2025),Budget,"0.00"
PAL,Syndication REV,Jul (2025),Actual,"0.00"
PAL,Syndication REV,Jul (2025),Budget,"0.00"
PAL,Syndication REV,Aug (2025),Actual,"0.00"
PAL,Syndication REV,Aug (2025),Budget,"0.00"
PAL,Syndication REV,Sep (2025),Actual,"0.00"
PAL,Syndication REV,Sep (2025),Budget,"0.00"
PAL,Syndication REV,Oct (2025),Actual,"0.00"
PAL,Syndication REV,Oct (2025),Budget,"0.00"
PAL,Syndication REV,Nov (2025),Actual,"0.00"
PAL,Syndication REV,Nov (2025),Budget,"0.00"
PAL,Syndication REV,Dec (2025),Actual,"0.00"
PAL,Syndication REV,Dec (2025),Budget,"0.00"
PAL,Syndication REV,Jan (2026),Budget,"0.00"
PAL,Syndication REV,Feb (2026),Budget,"0.00"
PAL,Syndication REV,Mar (2026),Budget,"0.00"
PAL,Linear Marketing,Apr (2025),Actual,"-1.30"
PAL,Linear Marketing,Apr (2025),Budget,"-1.39"
PAL,Linear Marketing,May (2025),Actual,"-1.40"
PAL,Linear Marketing,May (2025),Budget,"-1.45"
PAL,Linear Marketing,Jun (2025),Actual,"-1.60"
PAL,Linear Marketing,Jun (2025),Budget,"-1.49"
PAL,Linear Marketing,Jul (2025),Actual,"-1.60"
PAL,Linear Marketing,Jul (2025),Budget,"-1.53"
PAL,Linear Marketing,Aug (2025),Actual,"-1.40"
PAL,Linear Marketing,Aug (2025),Budget,"-1.53"
PAL,Linear Marketing,Sep (2025),Actual,"-1.50"
PAL,Linear Marketing,Sep (2025),Budget,"-1.53"
PAL,Linear Marketing,Oct (2025),Actual,"-1.70"
PAL,Linear Marketing,Oct (2025),Budget,"-1.57"
PAL,Linear Marketing,Nov (2025),Actual,"-1.70"
PAL,Linear Marketing,Nov (2025),Budget,"-1.57"
PAL,Linear Marketing,Dec (2025),Actual,"-1.50"
PAL,Linear Marketing,Dec (2025),Budget,"-1.57"
PAL,Linear Marketing,Jan (2026),Budget,"-1.62"
PAL,Linear Marketing,Feb (2026),Budget,"-1.62"
PAL,Linear Marketing,Mar (2026),Budget,"-1.62"
PAL,Programming COST,Apr (2025),Actual,"-0.30"
PAL,Programming COST,Apr (2025),Budget,"-0.29"
PAL,Programming COST,May (2025),Actual,"-0.30"
PAL,Programming COST,May (2025),Budget,"-0.29"
PAL,Programming COST,Jun (2025),Actual,"-1.40"
PAL,Programming COST,Jun (2025),Budget,"-1.42"
PAL,Programming COST,Jul (2025),Actual,"-1.40"
PAL,Programming COST,Jul (2025),Budget,"-1.42"
PAL,Programming COST,Aug (2025),Actual,"-1.30"
PAL,Programming COST,Aug (2025),Budget,"-1.42"
PAL,Programming COST,Sep (2025),Actual,"-1.50"
PAL,Programming COST,Sep (2025),Budget,"-1.42"
PAL,Programming COST,Oct (2025),Actual,"-0.30"
PAL,Programming COST,Oct (2025),Budget,"-0.29"
PAL,Programming COST,Nov (2025),Actual,"-0.30"
PAL,Programming COST,Nov (2025),Budget,"-0.29"
PAL,Programming COST,Dec (2025),Actual,"-1.30"
PAL,Programming COST,Dec (2025),Budget,"-1.42"
PAL,Programming COST,Jan (2026),Budget,"-0.29"
PAL,Programming COST,Feb (2026),Budget,"-0.29"
PAL,Programming COST,Mar (2026),Budget,"-1.42"
PIX,Ad Agency Incentives,Apr (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Apr (2025),Budget,"0.00"
PIX,Ad Agency Incentives,May (2025),Actual,"0.00"
PIX,Ad Agency Incentives,May (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Jun (2025),Actual,"-0.50"
PIX,Ad Agency Incentives,Jun (2025),Budget,"-0.56"
PIX,Ad Agency Incentives,Jul (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Jul (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Aug (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Aug (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Sep (2025),Actual,"-0.50"
PIX,Ad Agency Incentives,Sep (2025),Budget,"-0.56"
PIX,Ad Agency Incentives,Oct (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Oct (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Nov (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Nov (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Dec (2025),Actual,"-0.60"
PIX,Ad Agency Incentives,Dec (2025),Budget,"-0.62"
PIX,Ad Agency Incentives,Jan (2026),Budget,"0.00"
PIX,Ad Agency Incentives,Feb (2026),Budget,"0.00"
PIX,Ad Agency Incentives,Mar (2026),Budget,"-0.62"
PIX,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),May (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),May (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"9.80"
PIX,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"8.98"
PIX,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"9.60"
PIX,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"8.98"
PIX,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"9.70"
PIX,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"10.00"
PIX,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"10.00"
PIX,Syndication REV,Apr (2025),Actual,"0.00"
PIX,Syndication REV,Apr (2025),Budget,"0.00"
PIX,Syndication REV,May (2025),Actual,"0.00"
PIX,Syndication REV,May (2025),Budget,"0.00"
PIX,Syndication REV,Jun (2025),Actual,"0.00"
PIX,Syndication REV,Jun (2025),Budget,"0.00"
PIX,Syndication REV,Jul (2025),Actual,"0.00"
PIX,Syndication REV,Jul (2025),Budget,"0.00"
PIX,Syndication REV,Aug (2025),Actual,"0.00"
PIX,Syndication REV,Aug (2025),Budget,"0.00"
PIX,Syndication REV,Sep (2025),Actual,"0.00"
PIX,Syndication REV,Sep (2025),Budget,"0.00"
PIX,Syndication REV,Oct (2025),Actual,"0.00"
PIX,Syndication REV,Oct (2025),Budget,"0.00"
PIX,Syndication REV,Nov (2025),Actual,"0.00"
PIX,Syndication REV,Nov (2025),Budget,"0.00"
PIX,Syndication REV,Dec (2025),Actual,"0.00"
PIX,Syndication REV,Dec (2025),Budget,"0.00"
PIX,Syndication REV,Jan (2026),Budget,"0.00"
PIX,Syndication REV,Feb (2026),Budget,"0.00"
PIX,Syndication REV,Mar (2026),Budget,"0.00"
PIX,Linear Marketing,Apr (2025),Actual,"0.00"
PIX,Linear Marketing,Apr (2025),Budget,"0.00"
PIX,Linear Marketing,May (2025),Actual,"0.00"
PIX,Linear Marketing,May (2025),Budget,"0.00"
PIX,Linear Marketing,Jun (2025),Actual,"-0.10"
PIX,Linear Marketing,Jun (2025),Budget,"-0.08"
PIX,Linear Marketing,Jul (2025),Actual,"0.00"
PIX,Linear Marketing,Jul (2025),Budget,"0.00"
PIX,Linear Marketing,Aug (2025),Actual,"0.00"
PIX,Linear Marketing,Aug (2025),Budget,"0.00"
PIX,Linear Marketing,Sep (2025),Actual,"-0.10"
PIX,Linear Marketing,Sep (2025),Budget,"-0.08"
PIX,Linear Marketing,Oct (2025),Actual,"0.00"
PIX,Linear Marketing,Oct (2025),Budget,"0.00"
PIX,Linear Marketing,Nov (2025),Actual,"0.00"
PIX,Linear Marketing,Nov (2025),Budget,"0.00"
PIX,Linear Marketing,Dec (2025),Actual,"-0.10"
PIX,Linear Marketing,Dec (2025),Budget,"-0.09"
PIX,Linear Marketing,Jan (2026),Budget,"0.00"
PIX,Linear Marketing,Feb (2026),Budget,"0.00"
PIX,Linear Marketing,Mar (2026),Budget,"-5.09"
PIX,Programming COST,Apr (2025),Actual,"0.00"
PIX,Programming COST,Apr (2025),Budget,"0.00"
PIX,Programming COST,May (2025),Actual,"0.00"
PIX,Programming COST,May (2025),Budget,"0.00"
PIX,Programming COST,Jun (2025),Actual,"0.00"
PIX,Programming COST,Jun (2025),Budget,"0.00"
PIX,Programming COST,Jul (2025),Actual,"0.00"
PIX,Programming COST,Jul (2025),Budget,"0.00"
PIX,Programming COST,Aug (2025),Actual,"0.00"
PIX,Programming COST,Aug (2025),Budget,"0.00"
PIX,Programming COST,Sep (2025),Actual,"0.00"
PIX,Programming COST,Sep (2025),Budget,"0.00"
PIX,Programming COST,Oct (2025),Actual,"0.00"
PIX,Programming COST,Oct (2025),Budget,"0.00"
PIX,Programming COST,Nov (2025),Actual,"0.00"
PIX,Programming COST,Nov (2025),Budget,"0.00"
PIX,Programming COST,Dec (2025),Actual,"0.00"
PIX,Programming COST,Dec (2025),Budget,"0.00"
PIX,Programming COST,Jan (2026),Budget,"0.00"
PIX,Programming COST,Feb (2026),Budget,"0.00"
PIX,Programming COST,Mar (2026),Budget,"0.00"
SAB,Ad Agency Incentives,Apr (2025),Actual,"-36.10"
SAB,Ad Agency Incentives,Apr (2025),Budget,"-35.42"
SAB,Ad Agency Incentives,May (2025),Actual,"-35.80"
SAB,Ad Agency Incentives,May (2025),Budget,"-37.70"
SAB,Ad Agency Incentives,Jun (2025),Actual,"-34.70"
SAB,Ad Agency Incentives,Jun (2025),Budget,"-37.27"
SAB,Ad Agency Incentives,Jul (2025),Actual,"-41.50"
SAB,Ad Agency Incentives,Jul (2025),Budget,"-45.22"
SAB,Ad Agency Incentives,Aug (2025),Actual,"-50.50"
SAB,Ad Agency Incentives,Aug (2025),Budget,"-47.14"
SAB,Ad Agency Incentives,Sep (2025),Actual,"-48.90"
SAB,Ad Agency Incentives,Sep (2025),Budget,"-52.13"
SAB,Ad Agency Incentives,Oct (2025),Actual,"-46.30"
SAB,Ad Agency Incentives,Oct (2025),Budget,"-49.93"
SAB,Ad Agency Incentives,Nov (2025),Actual,"-50.40"
SAB,Ad Agency Incentives,Nov (2025),Budget,"-52.74"
SAB,Ad Agency Incentives,Dec (2025),Actual,"-51.10"
SAB,Ad Agency Incentives,Dec (2025),Budget,"-54.55"
SAB,Ad Agency Incentives,Jan (2026),Budget,"-50.29"
SAB,Ad Agency Incentives,Feb (2026),Budget,"-44.98"
SAB,Ad Agency Incentives,Mar (2026),Budget,"-51.28"
SAB,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"620.60"
SAB,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"570.42"
SAB,Net Advertising REV BAU (Domestic),May (2025),Actual,"580.20"
SAB,Net Advertising REV BAU (Domestic),May (2025),Budget,"607.02"
SAB,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"591.50"
SAB,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"600.09"
SAB,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"718.50"
SAB,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"728.14"
SAB,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"696.00"
SAB,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"759.07"
SAB,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"797.00"
SAB,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"839.41"
SAB,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"740.90"
SAB,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"804.03"
SAB,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"902.70"
SAB,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"849.29"
SAB,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"920.10"
SAB,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"878.41"
SAB,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"809.87"
SAB,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"724.39"
SAB,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"825.69"
SAB,Syndication REV,Apr (2025),Actual,"15.20"
SAB,Syndication REV,Apr (2025),Budget,"14.07"
SAB,Syndication REV,May (2025),Actual,"10.70"
SAB,Syndication REV,May (2025),Budget,"10.33"
SAB,Syndication REV,Jun (2025),Actual,"13.00"
SAB,Syndication REV,Jun (2025),Budget,"13.31"
SAB,Syndication REV,Jul (2025),Actual,"12.90"
SAB,Syndication REV,Jul (2025),Budget,"13.45"
SAB,Syndication REV,Aug (2025),Actual,"10.50"
SAB,Syndication REV,Aug (2025),Budget,"11.45"
SAB,Syndication REV,Sep (2025),Actual,"16.30"
SAB,Syndication REV,Sep (2025),Budget,"15.89"
SAB,Syndication REV,Oct (2025),Actual,"14.10"
SAB,Syndication REV,Oct (2025),Budget,"15.07"
SAB,Syndication REV,Nov (2025),Actual,"11.20"
SAB,Syndication REV,Nov (2025),Budget,"10.37"
SAB,Syndication REV,Dec (2025),Actual,"10.70"
SAB,Syndication REV,Dec (2025),Budget,"10.91"
SAB,Syndication REV,Jan (2026),Budget,"15.16"
SAB,Syndication REV,Feb (2026),Budget,"12.16"
SAB,Syndication REV,Mar (2026),Budget,"12.24"
SAB,Linear Marketing,Apr (2025),Actual,"-19.80"
SAB,Linear Marketing,Apr (2025),Budget,"-19.13"
SAB,Linear Marketing,May (2025),Actual,"-18.80"
SAB,Linear Marketing,May (2025),Budget,"-19.46"
SAB,Linear Marketing,Jun (2025),Actual,"-67.40"
SAB,Linear Marketing,Jun (2025),Budget,"-66.40"
SAB,Linear Marketing,Jul (2025),Actual,"-65.60"
SAB,Linear Marketing,Jul (2025),Budget,"-69.05"
SAB,Linear Marketing,Aug (2025),Actual,"-60.10"
SAB,Linear Marketing,Aug (2025),Budget,"-60.83"
SAB,Linear Marketing,Sep (2025),Actual,"-29.40"
SAB,Linear Marketing,Sep (2025),Budget,"-27.55"
SAB,Linear Marketing,Oct (2025),Actual,"-22.20"
SAB,Linear Marketing,Oct (2025),Budget,"-23.73"
SAB,Linear Marketing,Nov (2025),Actual,"-67.90"
SAB,Linear Marketing,Nov (2025),Budget,"-62.14"
SAB,Linear Marketing,Dec (2025),Actual,"-46.60"
SAB,Linear Marketing,Dec (2025),Budget,"-43.40"
SAB,Linear Marketing,Jan (2026),Budget,"-44.29"
SAB,Linear Marketing,Feb (2026),Budget,"-21.52"
SAB,Linear Marketing,Mar (2026),Budget,"-21.43"
SAB,Programming COST,Apr (2025),Actual,"-327.90"
SAB,Programming COST,Apr (2025),Budget,"-358.34"
SAB,Programming COST,May (2025),Actual,"-398.30"
SAB,Programming COST,May (2025),Budget,"-373.23"
SAB,Programming COST,Jun (2025),Actual,"-322.90"
SAB,Programming COST,Jun (2025),Budget,"-347.90"
SAB,Programming COST,Jul (2025),Actual,"-387.80"
SAB,Programming COST,Jul (2025),Budget,"-382.05"
SAB,Programming COST,Aug (2025),Actual,"-418.30"
SAB,Programming COST,Aug (2025),Budget,"-463.66"
SAB,Programming COST,Sep (2025),Actual,"-452.50"
SAB,Programming COST,Sep (2025),Budget,"-447.02"
SAB,Programming COST,Oct (2025),Actual,"-399.40"
SAB,Programming COST,Oct (2025),Budget,"-435.36"
SAB,Programming COST,Nov (2025),Actual,"-355.50"
SAB,Programming COST,Nov (2025),Budget,"-352.39"
SAB,Programming COST,Dec (2025),Actual,"-358.40"
SAB,Programming COST,Dec (2025),Budget,"-385.46"
SAB,Programming COST,Jan (2026),Budget,"-395.28"
SAB,Programming COST,Feb (2026),Budget,"-345.29"
SAB,Programming COST,Mar (2026),Budget,"-374.01"
SET,Ad Agency Incentives,Apr (2025),Actual,"-24.00"
SET,Ad Agency Incentives,Apr (2025),Budget,"-23.05"
SET,Ad Agency Incentives,May (2025),Actual,"-21.50"
SET,Ad Agency Incentives,May (2025),Budget,"-21.93"
SET,Ad Agency Incentives,Jun (2025),Actual,"-24.10"
SET,Ad Agency Incentives,Jun (2025),Budget,"-22.36"
SET,Ad Agency Incentives,Jul (2025),Actual,"-25.30"
SET,Ad Agency Incentives,Jul (2025),Budget,"-27.77"
SET,Ad Agency Incentives,Aug (2025),Actual,"-44.20"
SET,Ad Agency Incentives,Aug (2025),Budget,"-44.82"
SET,Ad Agency Incentives,Sep (2025),Actual,"-55.80"
SET,Ad Agency Incentives,Sep (2025),Budget,"-56.21"
SET,Ad Agency Incentives,Oct (2025),Actual,"-60.30"
SET,Ad Agency Incentives,Oct (2025),Budget,"-58.63"
SET,Ad Agency Incentives,Nov (2025),Actual,"-57.10"
SET,Ad Agency Incentives,Nov (2025),Budget,"-54.15"
SET,Ad Agency Incentives,Dec (2025),Actual,"-59.90"
SET,Ad Agency Incentives,Dec (2025),Budget,"-55.33"
SET,Ad Agency Incentives,Jan (2026),Budget,"-41.16"
SET,Ad Agency Incentives,Feb (2026),Budget,"-35.41"
SET,Ad Agency Incentives,Mar (2026),Budget,"-30.02"
SET,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"400.60"
SET,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"371.24"
SET,Net Advertising REV BAU (Domestic),May (2025),Actual,"382.00"
SET,Net Advertising REV BAU (Domestic),May (2025),Budget,"353.13"
SET,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"393.70"
SET,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"360.07"
SET,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"438.10"
SET,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"447.18"
SET,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"792.00"
SET,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"721.80"
SET,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"896.20"
SET,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"905.15"
SET,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"934.10"
SET,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"944.06"
SET,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"900.80"
SET,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"871.96"
SET,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"882.50"
SET,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"891.06"
SET,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"662.81"
SET,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"570.20"
SET,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"483.48"
SET,Syndication REV,Apr (2025),Actual,"27.00"
SET,Syndication REV,Apr (2025),Budget,"27.16"
SET,Syndication REV,May (2025),Actual,"34.40"
SET,Syndication REV,May (2025),Budget,"32.36"
SET,Syndication REV,Jun (2025),Actual,"28.70"
SET,Syndication REV,Jun (2025),Budget,"31.21"
SET,Syndication REV,Jul (2025),Actual,"29.60"
SET,Syndication REV,Jul (2025),Budget,"32.00"
SET,Syndication REV,Aug (2025),Actual,"33.20"
SET,Syndication REV,Aug (2025),Budget,"32.85"
SET,Syndication REV,Sep (2025),Actual,"40.80"
SET,Syndication REV,Sep (2025),Budget,"38.04"
SET,Syndication REV,Oct (2025),Actual,"41.10"
SET,Syndication REV,Oct (2025),Budget,"38.12"
SET,Syndication REV,Nov (2025),Actual,"35.60"
SET,Syndication REV,Nov (2025),Budget,"36.74"
SET,Syndication REV,Dec (2025),Actual,"33.80"
SET,Syndication REV,Dec (2025),Budget,"33.43"
SET,Syndication REV,Jan (2026),Budget,"29.38"
SET,Syndication REV,Feb (2026),Budget,"46.80"
SET,Syndication REV,Mar (2026),Budget,"42.88"
SET,Linear Marketing,Apr (2025),Actual,"-94.40"
SET,Linear Marketing,Apr (2025),Budget,"-95.58"
SET,Linear Marketing,May (2025),Actual,"-101.30"
SET,Linear Marketing,May (2025),Budget,"-100.91"
SET,Linear Marketing,Jun (2025),Actual,"-70.90"
SET,Linear Marketing,Jun (2025),Budget,"-70.98"
SET,Linear Marketing,Jul (2025),Actual,"-62.50"
SET,Linear Marketing,Jul (2025),Budget,"-64.31"
SET,Linear Marketing,Aug (2025),Actual,"-139.80"
SET,Linear Marketing,Aug (2025),Budget,"-129.78"
SET,Linear Marketing,Sep (2025),Actual,"-97.60"
SET,Linear Marketing,Sep (2025),Budget,"-91.43"
SET,Linear Marketing,Oct (2025),Actual,"-81.70"
SET,Linear Marketing,Oct (2025),Budget,"-86.78"
SET,Linear Marketing,Nov (2025),Actual,"-75.00"
SET,Linear Marketing,Nov (2025),Budget,"-81.13"
SET,Linear Marketing,Dec (2025),Actual,"-111.70"
SET,Linear Marketing,Dec (2025),Budget,"-111.30"
SET,Linear Marketing,Jan (2026),Budget,"-96.75"
SET,Linear Marketing,Feb (2026),Budget,"-70.42"
SET,Linear Marketing,Mar (2026),Budget,"-69.64"
SET,Programming COST,Apr (2025),Actual,"-456.60"
SET,Programming COST,Apr (2025),Budget,"-416.07"
SET,Programming COST,May (2025),Actual,"-292.80"
SET,Programming COST,May (2025),Budget,"-303.69"
SET,Programming COST,Jun (2025),Actual,"-296.80"
SET,Programming COST,Jun (2025),Budget,"-295.74"
SET,Programming COST,Jul (2025),Actual,"-292.90"
SET,Programming COST,Jul (2025),Budget,"-299.61"
SET,Programming COST,Aug (2025),Actual,"-533.70"
SET,Programming COST,Aug (2025),Budget,"-537.02"
SET,Programming COST,Sep (2025),Actual,"-732.20"
SET,Programming COST,Sep (2025),Budget,"-680.93"
SET,Programming COST,Oct (2025),Actual,"-728.40"
SET,Programming COST,Oct (2025),Budget,"-723.04"
SET,Programming COST,Nov (2025),Actual,"-747.00"
SET,Programming COST,Nov (2025),Budget,"-690.81"
SET,Programming COST,Dec (2025),Actual,"-695.20"
SET,Programming COST,Dec (2025),Budget,"-707.26"
SET,Programming COST,Jan (2026),Budget,"-470.17"
SET,Programming COST,Feb (2026),Budget,"-400.95"
SET,Programming COST,Mar (2026),Budget,"-297.39"
SONY MARATHI,Ad Agency Incentives,Apr (2025),Actual,"-1.10"
SONY MARATHI,Ad Agency Incentives,Apr (2025),Budget,"-1.26"
SONY MARATHI,Ad Agency Incentives,May (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,May (2025),Budget,"-1.26"
SONY MARATHI,Ad Agency Incentives,Jun (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,Jun (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Jul (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,Jul (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Aug (2025),Actual,"-1.40"
SONY MARATHI,Ad Agency Incentives,Aug (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Sep (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,Sep (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Oct (2025),Actual,"-1.20"
SONY MARATHI,Ad Agency Incentives,Oct (2025),Budget,"-1.26"
SONY MARATHI,Ad Agency Incentives,Nov (2025),Actual,"-1.20"
SONY MARATHI,Ad Agency Incentives,Nov (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Dec (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,Dec (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Jan (2026),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Feb (2026),Budget,"-1.26"
SONY MARATHI,Ad Agency Incentives,Mar (2026),Budget,"-1.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"20.60"
SONY MARATHI,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"20.24"
SONY MARATHI,Net Advertising REV BAU (Domestic),May (2025),Actual,"19.20"
SONY MARATHI,Net Advertising REV BAU (Domestic),May (2025),Budget,"20.24"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"23.20"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"21.80"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"20.70"
SONY MARATHI,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"19.70"
SONY MARATHI,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"20.40"
SONY MARATHI,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"20.24"
SONY MARATHI,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"21.40"
SONY MARATHI,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"20.10"
SONY MARATHI,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"20.24"
SONY MARATHI,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"20.24"
SONY MARATHI,Syndication REV,Apr (2025),Actual,"0.00"
SONY MARATHI,Syndication REV,Apr (2025),Budget,"0.00"
SONY MARATHI,Syndication REV,May (2025),Actual,"0.80"
SONY MARATHI,Syndication REV,May (2025),Budget,"0.75"
SONY MARATHI,Syndication REV,Jun (2025),Actual,"1.50"
SONY MARATHI,Syndication REV,Jun (2025),Budget,"1.49"
SONY MARATHI,Syndication REV,Jul (2025),Actual,"0.80"
SONY MARATHI,Syndication REV,Jul (2025),Budget,"0.75"
SONY MARATHI,Syndication REV,Aug (2025),Actual,"1.40"
SONY MARATHI,Syndication REV,Aug (2025),Budget,"1.25"
SONY MARATHI,Syndication REV,Sep (2025),Actual,"1.60"
SONY MARATHI,Syndication REV,Sep (2025),Budget,"1.50"
SONY MARATHI,Syndication REV,Oct (2025),Actual,"1.80"
SONY MARATHI,Syndication REV,Oct (2025),Budget,"2.00"
SONY MARATHI,Syndication REV,Nov (2025),Actual,"1.60"
SONY MARATHI,Syndication REV,Nov (2025),Budget,"1.50"
SONY MARATHI,Syndication REV,Dec (2025),Actual,"2.10"
SONY MARATHI,Syndication REV,Dec (2025),Budget,"2.24"
SONY MARATHI,Syndication REV,Jan (2026),Budget,"1.25"
SONY MARATHI,Syndication REV,Feb (2026),Budget,"1.25"
SONY MARATHI,Syndication REV,Mar (2026),Budget,"1.25"
SONY MARATHI,Linear Marketing,Apr (2025),Actual,"-9.60"
SONY MARATHI,Linear Marketing,Apr (2025),Budget,"-10.33"
SONY MARATHI,Linear Marketing,May (2025),Actual,"-2.90"
SONY MARATHI,Linear Marketing,May (2025),Budget,"-2.81"
SONY MARATHI,Linear Marketing,Jun (2025),Actual,"-6.50"
SONY MARATHI,Linear Marketing,Jun (2025),Budget,"-6.97"
SONY MARATHI,Linear Marketing,Jul (2025),Actual,"-7.70"
SONY MARATHI,Linear Marketing,Jul (2025),Budget,"-7.32"
SONY MARATHI,Linear Marketing,Aug (2025),Actual,"-6.50"
SONY MARATHI,Linear Marketing,Aug (2025),Budget,"-6.74"
SONY MARATHI,Linear Marketing,Sep (2025),Actual,"-3.30"
SONY MARATHI,Linear Marketing,Sep (2025),Budget,"-3.32"
SONY MARATHI,Linear Marketing,Oct (2025),Actual,"-10.90"
SONY MARATHI,Linear Marketing,Oct (2025),Budget,"-11.16"
SONY MARATHI,Linear Marketing,Nov (2025),Actual,"-3.50"
SONY MARATHI,Linear Marketing,Nov (2025),Budget,"-3.32"
SONY MARATHI,Linear Marketing,Dec (2025),Actual,"-6.50"
SONY MARATHI,Linear Marketing,Dec (2025),Budget,"-6.34"
SONY MARATHI,Linear Marketing,Jan (2026),Budget,"-9.47"
SONY MARATHI,Linear Marketing,Feb (2026),Budget,"-2.81"
SONY MARATHI,Linear Marketing,Mar (2026),Budget,"-2.81"
SONY MARATHI,Programming COST,Apr (2025),Actual,"-44.10"
SONY MARATHI,Programming COST,Apr (2025),Budget,"-41.84"
SONY MARATHI,Programming COST,May (2025),Actual,"-38.30"
SONY MARATHI,Programming COST,May (2025),Budget,"-40.81"
SONY MARATHI,Programming COST,Jun (2025),Actual,"-44.80"
SONY MARATHI,Programming COST,Jun (2025),Budget,"-41.63"
SONY MARATHI,Programming COST,Jul (2025),Actual,"-42.90"
SONY MARATHI,Programming COST,Jul (2025),Budget,"-41.73"
SONY MARATHI,Programming COST,Aug (2025),Actual,"-35.10"
SONY MARATHI,Programming COST,Aug (2025),Budget,"-38.48"
SONY MARATHI,Programming COST,Sep (2025),Actual,"-42.60"
SONY MARATHI,Programming COST,Sep (2025),Budget,"-43.43"
SONY MARATHI,Programming COST,Oct (2025),Actual,"-35.10"
SONY MARATHI,Programming COST,Oct (2025),Budget,"-34.47"
SONY MARATHI,Programming COST,Nov (2025),Actual,"-32.60"
SONY MARATHI,Programming COST,Nov (2025),Budget,"-31.82"
SONY MARATHI,Programming COST,Dec (2025),Actual,"-36.80"
SONY MARATHI,Programming COST,Dec (2025),Budget,"-40.09"
SONY MARATHI,Programming COST,Jan (2026),Budget,"-34.64"
SONY MARATHI,Programming COST,Feb (2026),Budget,"-31.25"
SONY MARATHI,Programming COST,Mar (2026),Budget,"-34.97"
Sports,Ad Agency Incentives,Apr (2025),Actual,"-0.90"
Sports,Ad Agency Incentives,Apr (2025),Budget,"-0.79"
Sports,Ad Agency Incentives,May (2025),Actual,"-2.10"
Sports,Ad Agency Incentives,May (2025),Budget,"-2.19"
Sports,Ad Agency Incentives,Jun (2025),Actual,"-10.20"
Sports,Ad Agency Incentives,Jun (2025),Budget,"-11.27"
Sports,Ad Agency Incentives,Jul (2025),Actual,"-27.60"
Sports,Ad Agency Incentives,Jul (2025),Budget,"-27.37"
Sports,Ad Agency Incentives,Aug (2025),Actual,"-11.20"
Sports,Ad Agency Incentives,Aug (2025),Budget,"-10.67"
Sports,Ad Agency Incentives,Sep (2025),Actual,"-138.70"
Sports,Ad Agency Incentives,Sep (2025),Budget,"-136.45"
Sports,Ad Agency Incentives,Oct (2025),Actual,"-0.80"
Sports,Ad Agency Incentives,Oct (2025),Budget,"-0.86"
Sports,Ad Agency Incentives,Nov (2025),Actual,"-0.80"
Sports,Ad Agency Incentives,Nov (2025),Budget,"-0.86"
Sports,Ad Agency Incentives,Dec (2025),Actual,"-0.80"
Sports,Ad Agency Incentives,Dec (2025),Budget,"-0.79"
Sports,Ad Agency Incentives,Jan (2026),Budget,"-2.10"
Sports,Ad Agency Incentives,Feb (2026),Budget,"-2.10"
Sports,Ad Agency Incentives,Mar (2026),Budget,"-0.72"
Sports,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"13.90"
Sports,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"12.79"
Sports,Net Advertising REV BAU (Domestic),May (2025),Actual,"32.80"
Sports,Net Advertising REV BAU (Domestic),May (2025),Budget,"35.29"
Sports,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"194.40"
Sports,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"181.55"
Sports,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"452.70"
Sports,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"440.76"
Sports,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"167.30"
Sports,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"171.77"
Sports,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"1241.10"
Sports,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"1137.79"
Sports,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"13.20"
Sports,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"13.89"
Sports,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"13.50"
Sports,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"13.89"
Sports,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"12.70"
Sports,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"12.79"
Sports,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"33.89"
Sports,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"33.89"
Sports,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"11.59"
Sports,Syndication REV,Apr (2025),Actual,"5.20"
Sports,Syndication REV,Apr (2025),Budget,"5.02"
Sports,Syndication REV,May (2025),Actual,"0.00"
Sports,Syndication REV,May (2025),Budget,"0.00"
Sports,Syndication REV,Jun (2025),Actual,"11.30"
Sports,Syndication REV,Jun (2025),Budget,"12.51"
Sports,Syndication REV,Jul (2025),Actual,"88.70"
Sports,Syndication REV,Jul (2025),Budget,"86.44"
Sports,Syndication REV,Aug (2025),Actual,"0.40"
Sports,Syndication REV,Aug (2025),Budget,"0.37"
Sports,Syndication REV,Sep (2025),Actual,"455.40"
Sports,Syndication REV,Sep (2025),Budget,"490.00"
Sports,Syndication REV,Oct (2025),Actual,"4.90"
Sports,Syndication REV,Oct (2025),Budget,"4.90"
Sports,Syndication REV,Nov (2025),Actual,"2.50"
Sports,Syndication REV,Nov (2025),Budget,"2.72"
Sports,Syndication REV,Dec (2025),Actual,"1.30"
Sports,Syndication REV,Dec (2025),Budget,"1.34"
Sports,Syndication REV,Jan (2026),Budget,"-4.65"
Sports,Syndication REV,Feb (2026),Budget,"-4.65"
Sports,Syndication REV,Mar (2026),Budget,"0.00"
Sports,Linear Marketing,Apr (2025),Actual,"-3.20"
Sports,Linear Marketing,Apr (2025),Budget,"-3.18"
Sports,Linear Marketing,May (2025),Actual,"-48.70"
Sports,Linear Marketing,May (2025),Budget,"-50.09"
Sports,Linear Marketing,Jun (2025),Actual,"-134.40"
Sports,Linear Marketing,Jun (2025),Budget,"-128.70"
Sports,Linear Marketing,Jul (2025),Actual,"-10.90"
Sports,Linear Marketing,Jul (2025),Budget,"-12.04"
Sports,Linear Marketing,Aug (2025),Actual,"-16.30"
Sports,Linear Marketing,Aug (2025),Budget,"-17.61"
Sports,Linear Marketing,Sep (2025),Actual,"-83.90"
Sports,Linear Marketing,Sep (2025),Budget,"-85.31"
Sports,Linear Marketing,Oct (2025),Actual,"-8.20"
Sports,Linear Marketing,Oct (2025),Budget,"-8.19"
Sports,Linear Marketing,Nov (2025),Actual,"-14.40"
Sports,Linear Marketing,Nov (2025),Budget,"-13.19"
Sports,Linear Marketing,Dec (2025),Actual,"-4.10"
Sports,Linear Marketing,Dec (2025),Budget,"-4.18"
Sports,Linear Marketing,Jan (2026),Budget,"-8.87"
Sports,Linear Marketing,Feb (2026),Budget,"-15.37"
Sports,Linear Marketing,Mar (2026),Budget,"-9.67"
Sports,Programming COST,Apr (2025),Actual,"-27.80"
Sports,Programming COST,Apr (2025),Budget,"-30.89"
Sports,Programming COST,May (2025),Actual,"-46.70"
Sports,Programming COST,May (2025),Budget,"-45.89"
Sports,Programming COST,Jun (2025),Actual,"-100.10"
Sports,Programming COST,Jun (2025),Budget,"-96.35"
Sports,Programming COST,Jul (2025),Actual,"-192.00"
Sports,Programming COST,Jul (2025),Budget,"-190.23"
Sports,Programming COST,Aug (2025),Actual,"-90.00"
Sports,Programming COST,Aug (2025),Budget,"-97.48"
Sports,Programming COST,Sep (2025),Actual,"-206.80"
Sports,Programming COST,Sep (2025),Budget,"-228.36"
Sports,Programming COST,Oct (2025),Actual,"-26.90"
Sports,Programming COST,Oct (2025),Budget,"-27.28"
Sports,Programming COST,Nov (2025),Actual,"-29.70"
Sports,Programming COST,Nov (2025),Budget,"-27.28"
Sports,Programming COST,Dec (2025),Actual,"-32.30"
Sports,Programming COST,Dec (2025),Budget,"-32.28"
Sports,Programming COST,Jan (2026),Budget,"-57.89"
Sports,Programming COST,Feb (2026),Budget,"-27.89"
Sports,Programming COST,Mar (2026),Budget,"-27.89"
STUDIO NEXT,Programming COST,Apr (2025),Actual,"8.20"
STUDIO NEXT,Programming COST,Apr (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,May (2025),Actual,"7.90"
STUDIO NEXT,Programming COST,May (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Jun (2025),Actual,"9.10"
STUDIO NEXT,Programming COST,Jun (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Jul (2025),Actual,"8.60"
STUDIO NEXT,Programming COST,Jul (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Aug (2025),Actual,"8.00"
STUDIO NEXT,Programming COST,Aug (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Sep (2025),Actual,"8.10"
STUDIO NEXT,Programming COST,Sep (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Oct (2025),Actual,"9.10"
STUDIO NEXT,Programming COST,Oct (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Nov (2025),Actual,"8.00"
STUDIO NEXT,Programming COST,Nov (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Dec (2025),Actual,"9.60"
STUDIO NEXT,Programming COST,Dec (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Jan (2026),Budget,"8.70"
STUDIO NEXT,Programming COST,Feb (2026),Budget,"8.70"
STUDIO NEXT,Programming COST,Mar (2026),Budget,"8.70"
WAH,Ad Agency Incentives,Apr (2025),Actual,"-5.20"
WAH,Ad Agency Incentives,Apr (2025),Budget,"-4.88"
WAH,Ad Agency Incentives,May (2025),Actual,"-4.50"
WAH,Ad Agency Incentives,May (2025),Budget,"-4.88"
WAH,Ad Agency Incentives,Jun (2025),Actual,"-4.90"
WAH,Ad Agency Incentives,Jun (2025),Budget,"-5.28"
WAH,Ad Agency Incentives,Jul (2025),Actual,"-5.40"
WAH,Ad Agency Incentives,Jul (2025),Budget,"-5.28"
WAH,Ad Agency Incentives,Aug (2025),Actual,"-5.10"
WAH,Ad Agency Incentives,Aug (2025),Budget,"-5.54"
WAH,Ad Agency Incentives,Sep (2025),Actual,"-4.80"
WAH,Ad Agency Incentives,Sep (2025),Budget,"-5.28"
WAH,Ad Agency Incentives,Oct (2025),Actual,"-6.00"
WAH,Ad Agency Incentives,Oct (2025),Budget,"-5.54"
WAH,Ad Agency Incentives,Nov (2025),Actual,"-5.50"
WAH,Ad Agency Incentives,Nov (2025),Budget,"-5.54"
WAH,Ad Agency Incentives,Dec (2025),Actual,"-5.40"
WAH,Ad Agency Incentives,Dec (2025),Budget,"-5.41"
WAH,Ad Agency Incentives,Jan (2026),Budget,"-5.41"
WAH,Ad Agency Incentives,Feb (2026),Budget,"-5.15"
WAH,Ad Agency Incentives,Mar (2026),Budget,"-5.15"
WAH,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"72.20"
WAH,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"78.63"
WAH,Net Advertising REV BAU (Domestic),May (2025),Actual,"78.50"
WAH,Net Advertising REV BAU (Domestic),May (2025),Budget,"78.63"
WAH,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"81.50"
WAH,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"85.00"
WAH,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"77.30"
WAH,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"85.00"
WAH,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"94.80"
WAH,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"89.25"
WAH,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"86.80"
WAH,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"85.00"
WAH,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"85.10"
WAH,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"89.25"
WAH,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"96.00"
WAH,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"89.25"
WAH,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"80.90"
WAH,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"87.13"
WAH,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"87.13"
WAH,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"82.88"
WAH,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"82.88"
WAH,Syndication REV,Apr (2025),Actual,"0.00"
WAH,Syndication REV,Apr (2025),Budget,"0.00"
WAH,Syndication REV,May (2025),Actual,"0.00"
WAH,Syndication REV,May (2025),Budget,"0.00"
WAH,Syndication REV,Jun (2025),Actual,"0.00"
WAH,Syndication REV,Jun (2025),Budget,"0.00"
WAH,Syndication REV,Jul (2025),Actual,"0.00"
WAH,Syndication REV,Jul (2025),Budget,"0.00"
WAH,Syndication REV,Aug (2025),Actual,"0.00"
WAH,Syndication REV,Aug (2025),Budget,"0.00"
WAH,Syndication REV,Sep (2025),Actual,"0.00"
WAH,Syndication REV,Sep (2025),Budget,"0.00"
WAH,Syndication REV,Oct (2025),Actual,"0.00"
WAH,Syndication REV,Oct (2025),Budget,"0.00"
WAH,Syndication REV,Nov (2025),Actual,"0.00"
WAH,Syndication REV,Nov (2025),Budget,"0.00"
WAH,Syndication REV,Dec (2025),Actual,"0.00"
WAH,Syndication REV,Dec (2025),Budget,"0.00"
WAH,Syndication REV,Jan (2026),Budget,"0.00"
WAH,Syndication REV,Feb (2026),Budget,"0.00"
WAH,Syndication REV,Mar (2026),Budget,"0.00"
WAH,Linear Marketing,Apr (2025),Actual,"-2.30"
WAH,Linear Marketing,Apr (2025),Budget,"-2.49"
WAH,Linear Marketing,May (2025),Actual,"-1.30"
WAH,Linear Marketing,May (2025),Budget,"-1.19"
WAH,Linear Marketing,Jun (2025),Actual,"-1.00"
WAH,Linear Marketing,Jun (2025),Budget,"-1.09"
WAH,Linear Marketing,Jul (2025),Actual,"-1.10"
WAH,Linear Marketing,Jul (2025),Budget,"-1.19"
WAH,Linear Marketing,Aug (2025),Actual,"-1.10"
WAH,Linear Marketing,Aug (2025),Budget,"-1.13"
WAH,Linear Marketing,Sep (2025),Actual,"-1.00"
WAH,Linear Marketing,Sep (2025),Budget,"-1.09"
WAH,Linear Marketing,Oct (2025),Actual,"-2.80"
WAH,Linear Marketing,Oct (2025),Budget,"-2.73"
WAH,Linear Marketing,Nov (2025),Actual,"-1.20"
WAH,Linear Marketing,Nov (2025),Budget,"-1.23"
WAH,Linear Marketing,Dec (2025),Actual,"-1.00"
WAH,Linear Marketing,Dec (2025),Budget,"-1.11"
WAH,Linear Marketing,Jan (2026),Budget,"-1.11"
WAH,Linear Marketing,Feb (2026),Budget,"-1.07"
WAH,Linear Marketing,Mar (2026),Budget,"-1.17"
WAH,Programming COST,Apr (2025),Actual,"-0.70"
WAH,Programming COST,Apr (2025),Budget,"-0.67"
WAH,Programming COST,May (2025),Actual,"-0.70"
WAH,Programming COST,May (2025),Budget,"-0.67"
WAH,Programming COST,Jun (2025),Actual,"-0.70"
WAH,Programming COST,Jun (2025),Budget,"-0.67"
WAH,Programming COST,Jul (2025),Actual,"-0.70"
WAH,Programming COST,Jul (2025),Budget,"-0.67"
WAH,Programming COST,Aug (2025),Actual,"-0.70"
WAH,Programming COST,Aug (2025),Budget,"-0.67"
WAH,Programming COST,Sep (2025),Actual,"-0.70"
WAH,Programming COST,Sep (2025),Budget,"-0.67"
WAH,Programming COST,Oct (2025),Actual,"-0.60"
WAH,Programming COST,Oct (2025),Budget,"-0.67"
WAH,Programming COST,Nov (2025),Actual,"-0.70"
WAH,Programming COST,Nov (2025),Budget,"-0.67"
WAH,Programming COST,Dec (2025),Actual,"-0.70"
WAH,Programming COST,Dec (2025),Budget,"-0.67"
WAH,Programming COST,Jan (2026),Budget,"-0.67"
WAH,Programming COST,Feb (2026),Budget,"-0.67"
WAH,Programming COST,Mar (2026),Budget,"-0.67"
YAY,Ad Agency Incentives,Apr (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Apr (2025),Budget,"-1.48"
YAY,Ad Agency Incentives,May (2025),Actual,"-1.50"
YAY,Ad Agency Incentives,May (2025),Budget,"-1.52"
YAY,Ad Agency Incentives,Jun (2025),Actual,"-1.50"
YAY,Ad Agency Incentives,Jun (2025),Budget,"-1.45"
YAY,Ad Agency Incentives,Jul (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Jul (2025),Budget,"-1.36"
YAY,Ad Agency Incentives,Aug (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Aug (2025),Budget,"-1.34"
YAY,Ad Agency Incentives,Sep (2025),Actual,"-1.60"
YAY,Ad Agency Incentives,Sep (2025),Budget,"-1.43"
YAY,Ad Agency Incentives,Oct (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Oct (2025),Budget,"-1.38"
YAY,Ad Agency Incentives,Nov (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Nov (2025),Budget,"-1.43"
YAY,Ad Agency Incentives,Dec (2025),Actual,"-1.50"
YAY,Ad Agency Incentives,Dec (2025),Budget,"-1.36"
YAY,Ad Agency Incentives,Jan (2026),Budget,"-1.29"
YAY,Ad Agency Incentives,Feb (2026),Budget,"-1.36"
YAY,Ad Agency Incentives,Mar (2026),Budget,"-1.36"
YAY,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"22.30"
YAY,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"23.79"
YAY,Net Advertising REV BAU (Domestic),May (2025),Actual,"26.90"
YAY,Net Advertising REV BAU (Domestic),May (2025),Budget,"24.55"
YAY,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"22.90"
YAY,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"23.41"
YAY,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"21.40"
YAY,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"21.90"
YAY,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"23.40"
YAY,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"21.52"
YAY,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"21.80"
YAY,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"23.03"
YAY,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"21.70"
YAY,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"22.28"
YAY,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"22.50"
YAY,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"23.03"
YAY,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"20.50"
YAY,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"21.90"
YAY,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"20.77"
YAY,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"21.90"
YAY,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"21.90"
YAY,Syndication REV,Apr (2025),Actual,"1.00"
YAY,Syndication REV,Apr (2025),Budget,"1.00"
YAY,Syndication REV,May (2025),Actual,"0.00"
YAY,Syndication REV,May (2025),Budget,"0.00"
YAY,Syndication REV,Jun (2025),Actual,"0.50"
YAY,Syndication REV,Jun (2025),Budget,"0.50"
YAY,Syndication REV,Jul (2025),Actual,"0.50"
YAY,Syndication REV,Jul (2025),Budget,"0.50"
YAY,Syndication REV,Aug (2025),Actual,"1.00"
YAY,Syndication REV,Aug (2025),Budget,"1.00"
YAY,Syndication REV,Sep (2025),Actual,"2.00"
YAY,Syndication REV,Sep (2025),Budget,"2.00"
YAY,Syndication REV,Oct (2025),Actual,"1.10"
YAY,Syndication REV,Oct (2025),Budget,"1.00"
YAY,Syndication REV,Nov (2025),Actual,"0.90"
YAY,Syndication REV,Nov (2025),Budget,"1.00"
YAY,Syndication REV,Dec (2025),Actual,"1.10"
YAY,Syndication REV,Dec (2025),Budget,"1.00"
YAY,Syndication REV,Jan (2026),Budget,"1.89"
YAY,Syndication REV,Feb (2026),Budget,"1.00"
YAY,Syndication REV,Mar (2026),Budget,"2.00"
YAY,Linear Marketing,Apr (2025),Actual,"-9.90"
YAY,Linear Marketing,Apr (2025),Budget,"-9.12"
YAY,Linear Marketing,May (2025),Actual,"-29.20"
YAY,Linear Marketing,May (2025),Budget,"-26.77"
YAY,Linear Marketing,Jun (2025),Actual,"-15.00"
YAY,Linear Marketing,Jun (2025),Budget,"-16.58"
YAY,Linear Marketing,Jul (2025),Actual,"-6.80"
YAY,Linear Marketing,Jul (2025),Budget,"-7.47"
YAY,Linear Marketing,Aug (2025),Actual,"-7.40"
YAY,Linear Marketing,Aug (2025),Budget,"-7.01"
YAY,Linear Marketing,Sep (2025),Actual,"-4.70"
YAY,Linear Marketing,Sep (2025),Budget,"-5.20"
YAY,Linear Marketing,Oct (2025),Actual,"-8.60"
YAY,Linear Marketing,Oct (2025),Budget,"-8.84"
YAY,Linear Marketing,Nov (2025),Actual,"-18.90"
YAY,Linear Marketing,Nov (2025),Budget,"-20.67"
YAY,Linear Marketing,Dec (2025),Actual,"-20.40"
YAY,Linear Marketing,Dec (2025),Budget,"-21.11"
YAY,Linear Marketing,Jan (2026),Budget,"-6.78"
YAY,Linear Marketing,Feb (2026),Budget,"-6.79"
YAY,Linear Marketing,Mar (2026),Budget,"-6.10"
YAY,Programming COST,Apr (2025),Actual,"-85.80"
YAY,Programming COST,Apr (2025),Budget,"-82.41"
YAY,Programming COST,May (2025),Actual,"-63.20"
YAY,Programming COST,May (2025),Budget,"-69.93"
YAY,Programming COST,Jun (2025),Actual,"-65.40"
YAY,Programming COST,Jun (2025),Budget,"-67.33"
YAY,Programming COST,Jul (2025),Actual,"-64.50"
YAY,Programming COST,Jul (2025),Budget,"-65.97"
YAY,Programming COST,Aug (2025),Actual,"-64.70"
YAY,Programming COST,Aug (2025),Budget,"-61.70"
YAY,Programming COST,Sep (2025),Actual,"-72.30"
YAY,Programming COST,Sep (2025),Budget,"-70.59"
YAY,Programming COST,Oct (2025),Actual,"-56.60"
YAY,Programming COST,Oct (2025),Budget,"-59.11"
YAY,Programming COST,Nov (2025),Actual,"-54.70"
YAY,Programming COST,Nov (2025),Budget,"-56.53"
YAY,Programming COST,Dec (2025),Actual,"-51.20"
YAY,Programming COST,Dec (2025),Budget,"-56.00"
YAY,Programming COST,Jan (2026),Budget,"-54.98"
YAY,Programming COST,Feb (2026),Budget,"-51.19"
YAY,Programming COST,Mar (2026),Budget,"-52.03"
`].join('\n')
        } else if (this._props.systemPrompt === 'FUTUROOT') {
          this.system = [`You are PerciBOT for Process Mining (Procure-to-Pay).

You are given:
1) A synthetic P2P event log embedded below in TOON format.
2) User questions in natural language.

Your job:
- Answer strictly using ONLY the embedded event log. Do not invent missing data.
- If a question cannot be answered from the data, say exactly what is missing.
- Be business-context-first: explain the metric/insight in plain business language.
- When relevant, show: (a) the exact KPI value, (b) breakdown by vendor / company_code / plant, (c) the top 3 contributing cases, and (d) an actionable recommendation.

Event log semantics:
- Each case_id is one P2P process instance.
- The process order is typically:
  PR -> Approve PR -> PO -> (optional Change PO) -> GR -> IR -> (optional Block Invoice) -> Post Invoice -> Payment.
- Change Purchase Order events represent changes to PO after creation (qty/amount/payment terms/delivery date).
- Block Invoice indicates an invoice hold before posting. Cycle time to post may include time spent blocked.
- Amount and qty represent the state at that event. For Change PO, use amount_old/amount_new and qty_old/qty_new.

Define these KPIs (compute from timestamps):
- PR approval lead time = time(Approve Purchase Requisition) - time(Create Purchase Requisition) per case.
- PO cycle time to GR = time(Goods Receipt) - time(Create Purchase Order) per case (if both exist).
- Invoice receipt to posting = time(Post Invoice) - time(Invoice Receipt) per case.
- Invoice-to-pay time = time(Clear Invoice (Payment)) - time(Post Invoice) per case.
- End-to-end P2P cycle time = time(Clear Invoice (Payment)) - first available of (Create Purchase Requisition OR Create Purchase Order) per case.
- Touchless rate = % cases with NO "Block Invoice" events.
- Block rate = % cases with at least one "Block Invoice" event.
- PO change rate = % cases with at least one "Change Purchase Order" event.
- Most common variants = the distinct activity sequences per case, ranked by frequency.

Rules for answers:
- Always state the time window covered by the dataset (min timestamp to max timestamp).
- If asked “why”, use evidence: reference vendors/plants/company_code/cases and show the pattern (e.g., “blocked cases take longer to post”).
- If asked “show cases”, list case_ids and key timestamps.
- If asked for “top bottlenecks”, identify the stage with the highest median time gap between consecutive standard steps (PR->Approve, PO->GR, IR->Post, Post->Pay).
- Keep results concise: summary first, then supporting numbers.

Embedded Event Log (TOON):
data[70]: {case_id, activity, timestamp, resource, company_code, vendor, po_id, invoice_id, currency, amount, amount_old, amount_new, qty, qty_old, qty_new, qty_uom, payment_terms, plant, doc_type, change_type, change_field}:
P2P-001, Create Purchase Requisition, 2025-12-01T09:10:00, User_A, 1000, VND-Alpha, PO-2001, , INR, 120000, , , 100, , , EA, NET30, Pune, PR, , ,
P2P-001, Approve Purchase Requisition, 2025-12-01T11:30:00, Manager_1, 1000, VND-Alpha, PO-2001, , INR, 120000, , , 100, , , EA, NET30, Pune, PR, , ,
P2P-001, Create Purchase Order, 2025-12-01T12:05:00, Buyer_1, 1000, VND-Alpha, PO-2001, , INR, 120000, , , 100, , , EA, NET30, Pune, PO, , ,
P2P-001, Goods Receipt, 2025-12-05T16:20:00, WH_1, 1000, VND-Alpha, PO-2001, , INR, 120000, , , 100, , , EA, NET30, Pune, GR, , ,
P2P-001, Invoice Receipt, 2025-12-06T10:40:00, AP_1, 1000, VND-Alpha, PO-2001, INV-9101, INR, 120000, , , 100, , , EA, NET30, Pune, IR, , ,
P2P-001, Post Invoice, 2025-12-06T11:12:00, AP_1, 1000, VND-Alpha, PO-2001, INV-9101, INR, 120000, , , 100, , , EA, NET30, Pune, Post, , ,
P2P-001, Clear Invoice (Payment), 2025-12-25T14:30:00, Treasury_1, 1000, VND-Alpha, PO-2001, INV-9101, INR, 120000, , , 100, , , EA, NET30, Pune, Pay, , ,
P2P-002, Create Purchase Requisition, 2025-12-02T10:00:00, User_B, 1000, VND-Beta, PO-2002, , INR, 85000, , , 50, , , EA, NET15, Mumbai, PR, , ,
P2P-002, Approve Purchase Requisition, 2025-12-04T18:40:00, Manager_2, 1000, VND-Beta, PO-2002, , INR, 85000, , , 50, , , EA, NET15, Mumbai, PR, , ,
P2P-002, Create Purchase Order, 2025-12-05T09:20:00, Buyer_2, 1000, VND-Beta, PO-2002, , INR, 85000, , , 50, , , EA, NET15, Mumbai, PO, , ,
P2P-002, Change Purchase Order, 2025-12-05T15:05:00, Buyer_2, 1000, VND-Beta, PO-2002, , INR, 87000, 85000, 87000, 50, 50, 50, EA, NET15, Mumbai, PO, PRICE_UPDATE, amount,
P2P-002, Invoice Receipt, 2025-12-06T12:00:00, AP_2, 1000, VND-Beta, PO-2002, INV-9102, INR, 87000, , , 50, , , EA, NET15, Mumbai, IR, , ,
P2P-002, Block Invoice, 2025-12-06T12:05:00, System, 1000, VND-Beta, PO-2002, INV-9102, INR, 87000, , , 50, , , EA, NET15, Mumbai, Block, , ,
P2P-002, Post Invoice, 2025-12-08T15:15:00, AP_2, 1000, VND-Beta, PO-2002, INV-9102, INR, 87000, , , 50, , , EA, NET15, Mumbai, Post, , ,
P2P-002, Clear Invoice (Payment), 2025-12-20T10:10:00, Treasury_1, 1000, VND-Beta, PO-2002, INV-9102, INR, 87000, , , 50, , , EA, NET15, Mumbai, Pay, , ,
P2P-003, Create Purchase Order, 2025-12-03T09:05:00, Buyer_1, 2000, VND-Gamma, PO-2003, , INR, 50000, , , 25, , , EA, NET30, Pune, PO, URGENT_PO, ,
P2P-003, Invoice Receipt, 2025-12-09T10:00:00, AP_1, 2000, VND-Gamma, PO-2003, INV-9103, INR, 50000, , , 25, , , EA, NET30, Pune, IR, , ,
P2P-003, Block Invoice, 2025-12-09T10:02:00, System, 2000, VND-Gamma, PO-2003, INV-9103, INR, 50000, , , 25, , , EA, NET30, Pune, Block, , ,
P2P-003, Goods Receipt, 2025-12-10T17:00:00, WH_2, 2000, VND-Gamma, PO-2003, , INR, 50000, , , 25, , , EA, NET30, Pune, GR, , ,
P2P-003, Post Invoice, 2025-12-10T17:12:00, AP_1, 2000, VND-Gamma, PO-2003, INV-9103, INR, 50000, , , 25, , , EA, NET30, Pune, Post, , ,
P2P-003, Clear Invoice (Payment), 2026-01-05T11:00:00, Treasury_2, 2000, VND-Gamma, PO-2003, INV-9103, INR, 50000, , , 25, , , EA, NET30, Pune, Pay, , ,
P2P-004, Create Purchase Requisition, 2025-12-04T09:30:00, User_C, 1000, VND-Alpha, PO-2004, , INR, 65000, , , 40, , , EA, NET30, Delhi, PR, , ,
P2P-004, Approve Purchase Requisition, 2025-12-04T10:00:00, Manager_1, 1000, VND-Alpha, PO-2004, , INR, 65000, , , 40, , , EA, NET30, Delhi, PR, , ,
P2P-004, Create Purchase Order, 2025-12-04T10:20:00, Buyer_3, 1000, VND-Alpha, PO-2004, , INR, 65000, , , 40, , , EA, NET30, Delhi, PO, , ,
P2P-004, Change Purchase Order, 2025-12-05T13:30:00, Buyer_3, 1000, VND-Alpha, PO-2004, , INR, 78000, 65000, 78000, 48, 40, 48, EA, NET30, Delhi, PO, QTY_INCREASE, qty,
P2P-004, Goods Receipt, 2025-12-07T15:30:00, WH_3, 1000, VND-Alpha, PO-2004, , INR, 78000, , , 48, , , EA, NET30, Delhi, GR, , ,
P2P-004, Invoice Receipt, 2025-12-08T09:00:00, AP_3, 1000, VND-Alpha, PO-2004, INV-9104, INR, 78000, , , 48, , , EA, NET30, Delhi, IR, , ,
P2P-004, Post Invoice, 2025-12-08T09:20:00, AP_3, 1000, VND-Alpha, PO-2004, INV-9104, INR, 78000, , , 48, , , EA, NET30, Delhi, Post, , ,
P2P-004, Clear Invoice (Payment), 2026-01-10T12:00:00, Treasury_1, 1000, VND-Alpha, PO-2004, INV-9104, INR, 78000, , , 48, , , EA, NET30, Delhi, Pay, , ,
P2P-005, Create Purchase Requisition, 2025-12-05T09:00:00, User_D, 3000, VND-Delta, PO-2005, , INR, 110000, , , 200, , , KG, NET45, Chennai, PR, , ,
P2P-005, Approve Purchase Requisition, 2025-12-05T12:45:00, Manager_3, 3000, VND-Delta, PO-2005, , INR, 110000, , , 200, , , KG, NET45, Chennai, PR, , ,
P2P-005, Create Purchase Order, 2025-12-05T13:10:00, Buyer_4, 3000, VND-Delta, PO-2005, , INR, 110000, , , 200, , , KG, NET45, Chennai, PO, , ,
P2P-005, Change Purchase Order, 2025-12-06T10:00:00, Buyer_4, 3000, VND-Delta, PO-2005, , INR, 99000, 110000, 99000, 180, 200, 180, KG, NET45, Chennai, PO, QTY_DECREASE, qty,
P2P-005, Goods Receipt, 2025-12-12T16:00:00, WH_4, 3000, VND-Delta, PO-2005, , INR, 99000, , , 180, , , KG, NET45, Chennai, GR, , ,
P2P-005, Invoice Receipt, 2025-12-13T11:00:00, AP_4, 3000, VND-Delta, PO-2005, INV-9105, INR, 99000, , , 180, , , KG, NET45, Chennai, IR, , ,
P2P-005, Post Invoice, 2025-12-13T11:30:00, AP_4, 3000, VND-Delta, PO-2005, INV-9105, INR, 99000, , , 180, , , KG, NET45, Chennai, Post, , ,
P2P-005, Clear Invoice (Payment), 2026-01-31T10:15:00, Treasury_3, 3000, VND-Delta, PO-2005, INV-9105, INR, 99000, , , 180, , , KG, NET45, Chennai, Pay, , ,
P2P-006, Create Purchase Requisition, 2025-12-06T09:10:00, User_E, 2000, VND-Epsilon, PO-2006, , INR, 42000, , , 30, , , EA, NET30, Pune, PR, , ,
P2P-006, Approve Purchase Requisition, 2025-12-06T09:40:00, Manager_2, 2000, VND-Epsilon, PO-2006, , INR, 42000, , , 30, , , EA, NET30, Pune, PR, , ,
P2P-006, Create Purchase Order, 2025-12-06T10:00:00, Buyer_2, 2000, VND-Epsilon, PO-2006, , INR, 42000, , , 30, , , EA, NET30, Pune, PO, , ,
P2P-006, Change Purchase Order, 2025-12-07T10:15:00, Buyer_2, 2000, VND-Epsilon, PO-2006, , INR, 42000, 42000, 42000, 30, 30, 30, EA, NET45, Pune, PO, TERMS_UPDATE, payment_terms,
P2P-006, Goods Receipt, 2025-12-14T09:30:00, WH_2, 2000, VND-Epsilon, PO-2006, , INR, 42000, , , 30, , , EA, NET45, Pune, GR, , ,
P2P-006, Invoice Receipt, 2025-12-14T12:00:00, AP_2, 2000, VND-Epsilon, PO-2006, INV-9106, INR, 42000, , , 30, , , EA, NET45, Pune, IR, , ,
P2P-006, Post Invoice, 2025-12-14T12:10:00, AP_2, 2000, VND-Epsilon, PO-2006, INV-9106, INR, 42000, , , 30, , , EA, NET45, Pune, Post, , ,
P2P-006, Clear Invoice (Payment), 2026-01-28T12:00:00, Treasury_2, 2000, VND-Epsilon, PO-2006, INV-9106, INR, 42000, , , 30, , , EA, NET45, Pune, Pay, , ,
P2P-007, Create Purchase Requisition, 2025-12-07T09:00:00, User_F, 1000, VND-Zeta, PO-2007, , INR, 30000, , , 60, , , EA, NET15, Mumbai, PR, , ,
P2P-007, Approve Purchase Requisition, 2025-12-09T19:30:00, Manager_1, 1000, VND-Zeta, PO-2007, , INR, 30000, , , 60, , , EA, NET15, Mumbai, PR, , ,
P2P-007, Create Purchase Order, 2025-12-10T09:15:00, Buyer_1, 1000, VND-Zeta, PO-2007, , INR, 30000, , , 60, , , EA, NET15, Mumbai, PO, , ,
P2P-007, Goods Receipt, 2025-12-18T16:00:00, WH_1, 1000, VND-Zeta, PO-2007, , INR, 30000, , , 60, , , EA, NET15, Mumbai, GR, , ,
P2P-007, Invoice Receipt, 2025-12-19T10:10:00, AP_1, 1000, VND-Zeta, PO-2007, INV-9107, INR, 30000, , , 60, , , EA, NET15, Mumbai, IR, , ,
P2P-007, Post Invoice, 2025-12-19T10:20:00, AP_1, 1000, VND-Zeta, PO-2007, INV-9107, INR, 30000, , , 60, , , EA, NET15, Mumbai, Post, , ,
P2P-007, Clear Invoice (Payment), 2026-01-03T09:00:00, Treasury_1, 1000, VND-Zeta, PO-2007, INV-9107, INR, 30000, , , 60, , , EA, NET15, Mumbai, Pay, , ,
P2P-008, Create Purchase Order, 2025-12-08T10:00:00, Buyer_5, 3000, VND-Theta, PO-2008, , INR, 150000, , , 300, , , KG, NET30, Chennai, PO, , ,
P2P-008, Change Purchase Order, 2025-12-08T18:00:00, Buyer_5, 3000, VND-Theta, PO-2008, , INR, 160000, 150000, 160000, 320, 300, 320, KG, NET30, Chennai, PO, QTY_INCREASE, qty,
P2P-008, Goods Receipt, 2025-12-15T14:00:00, WH_4, 3000, VND-Theta, PO-2008, , INR, 160000, , , 320, , , KG, NET30, Chennai, GR, , ,
P2P-008, Invoice Receipt, 2025-12-16T10:00:00, AP_4, 3000, VND-Theta, PO-2008, INV-9108, INR, 160000, , , 320, , , KG, NET30, Chennai, IR, , ,
P2P-008, Block Invoice, 2025-12-16T10:05:00, System, 3000, VND-Theta, PO-2008, INV-9108, INR, 160000, , , 320, , , KG, NET30, Chennai, Block, , ,
P2P-008, Post Invoice, 2025-12-18T12:00:00, AP_4, 3000, VND-Theta, PO-2008, INV-9108, INR, 160000, , , 320, , , KG, NET30, Chennai, Post, , ,
P2P-008, Clear Invoice (Payment), 2026-01-20T10:00:00, Treasury_3, 3000, VND-Theta, PO-2008, INV-9108, INR, 160000, , , 320, , , KG, NET30, Chennai, Pay, , ,
P2P-009, Create Purchase Requisition, 2025-12-09T09:15:00, User_G, 2000, VND-Iota, PO-2009, , INR, 95000, , , 70, , , EA, NET30, Pune, PR, , ,
P2P-009, Approve Purchase Requisition, 2025-12-09T11:45:00, Manager_2, 2000, VND-Iota, PO-2009, , INR, 95000, , , 70, , , EA, NET30, Pune, PR, , ,
P2P-009, Create Purchase Order, 2025-12-09T12:10:00, Buyer_2, 2000, VND-Iota, PO-2009, , INR, 95000, , , 70, , , EA, NET30, Pune, PO, , ,
P2P-009, Change Purchase Order, 2025-12-10T09:00:00, Buyer_2, 2000, VND-Iota, PO-2009, , INR, 95000, 95000, 95000, 70, 70, 70, EA, NET30, Pune, PO, DELIVERY_DATE_UPDATE, delivery_date,
P2P-009, Goods Receipt, 2025-12-16T17:00:00, WH_2, 2000, VND-Iota, PO-2009, , INR, 95000, , , 70, , , EA, NET30, Pune, GR, , ,
P2P-009, Invoice Receipt, 2025-12-17T10:00:00, AP_2, 2000, VND-Iota, PO-2009, INV-9109, INR, 95000, , , 70, , , EA, NET30, Pune, IR, , ,
P2P-009, Post Invoice, 2025-12-17T10:15:00, AP_2, 2000, VND-Iota, PO-2009, INV-9109, INR, 95000, , , 70, , , EA, NET30, Pune, Post, , ,
P2P-009, Clear Invoice (Payment), 2026-01-16T12:00:00, Treasury_2, 2000, VND-Iota, PO-2009, INV-9109, INR, 95000, , , 70, , , EA, NET30, Pune, Pay, , ,
P2P-010, Create Purchase Requisition, 2025-12-10T09:00:00, User_H, 1000, VND-Kappa, PO-2010, , INR, 72000, , , 90, , , EA, NET30, Delhi, PR, , ,
P2P-010, Approve Purchase Requisition, 2025-12-10T17:40:00, Manager_1, 1000, VND-Kappa, PO-2010, , INR, 72000, , , 90, , , EA, NET30, Delhi, PR, , ,
P2P-010, Create Purchase Order, 2025-12-11T10:00:00, Buyer_3, 1000, VND-Kappa, PO-2010, , INR, 72000, , , 90, , , EA, NET30, Delhi, PO, , ,
P2P-010, Change Purchase Order, 2025-12-11T16:20:00, Buyer_3, 1000, VND-Kappa, PO-2010, , INR, 80000, 72000, 80000, 100, 90, 100, EA, NET30, Delhi, PO, QTY_INCREASE, qty,
P2P-010, Goods Receipt, 2025-12-20T15:00:00, WH_3, 1000, VND-Kappa, PO-2010, , INR, 80000, , , 100, , , EA, NET30, Delhi, GR, , ,
P2P-010, Invoice Receipt, 2025-12-21T10:00:00, AP_3, 1000, VND-Kappa, PO-2010, INV-9110, INR, 80000, , , 100, , , EA, NET30, Delhi, IR, , ,
P2P-010, Post Invoice, 2025-12-21T10:10:00, AP_3, 1000, VND-Kappa, PO-2010, INV-9110, INR, 80000, , , 100, , , EA, NET30, Delhi, Post, , ,
P2P-010, Clear Invoice (Payment), 2026-01-20T12:30:00, Treasury_1, 1000, VND-Kappa, PO-2010, INV-9110, INR, 80000, , , 100, , , EA, NET30, Delhi, Pay, , ,

`].join('\n')
        } else {
          this.system = [`
You are **PerciBOT**, a conversational AI for analytics.

Your role is to answer user queries about financial performance across Companies, Branches, Products, and Accounts (Revenue, Opex, Interest Expense).
All figures are in INR, aggregated for Jan–Apr 2025.

Use this dataset summary as your ground truth. Provide clear, business-analyst style answers with tables or breakdowns when useful.

Companies:
- IKF Finance Ltd → Revenue: 4,178,132.07, Opex: 3,183,336.85, Interest Expense: 5,010,185.45
- IKF House Finance Ltd → Revenue: 4,178,132.07, Opex: 3,183,336.85, Interest Expense: 5,010,185.45

Branches:
- Amar Chambers → Revenue: 1,441,039.88, Opex: 878,538.58, Interest Expense: 1,343,608.88
- Apra Tower → Revenue: 1,080,626.42, Opex: 898,949.30, Interest Expense: 1,076,335.00
- Borivali → Revenue: 988,853.88, Opex: 936,281.90, Interest Expense: 1,379,355.52
- Broadway Business Centre → Revenue: 1,194,118.34, Opex: 1,155,437.00, Interest Expense: 1,376,638.86
- Dosti Pinacle → Revenue: 945,528.48, Opex: 998,130.38, Interest Expense: 1,888,149.90
- Part II Gurugram → Revenue: 883,096.80, Opex: 809,298.44, Interest Expense: 1,324,802.60
- Pusa Road → Revenue: 1,823,000.34, Opex: 690,038.10, Interest Expense: 1,631,480.14

Products:
- Cars & MUV Loans → Revenue: 1,731,314.20, Opex: 3,940,045.52, Interest Expense: 5,856,240.84
- Commercial Vehicle Loans → Revenue: 2,060,208.94, Opex: -3,216,340.58, Interest Expense: -4,835,485.26
- Construction Equipment Loans → Revenue: 2,764,835.70, Opex: 9,039,834.06, Interest Expense: 13,885,900.40
- Home Loans → Revenue: 947,721.66, Opex: -2,036,823.34, Interest Expense: -2,992,687.48
- MSME Loans → Revenue: 852,183.64, Opex: -1,360,041.96, Interest Expense: -1,893,597.60

Branch × Product:
- Amar Chambers × Cars & MUV Loans → Revenue: 24,150.46, Opex: 645,579.34, Interest Expense: 920,755.74
- Amar Chambers × Commercial Vehicle Loans → Revenue: 468,571.72, Opex: -472,048.02, Interest Expense: -761,812.40
- Amar Chambers × Construction Equipment Loans → Revenue: 637,315.18, Opex: 1,173,960.84, Interest Expense: 1,980,768.68
- Amar Chambers × Home Loans → Revenue: 251,661.72, Opex: -297,792.86, Interest Expense: -525,119.46
- Amar Chambers × MSME Loans → Revenue: 59,340.80, Opex: -171,160.72, Interest Expense: -270,983.68
- Apra Tower × Cars & MUV Loans → Revenue: 79,456.72, Opex: 594,146.06, Interest Expense: 758,427.04
- Apra Tower × Commercial Vehicle Loans → Revenue: 506,309.20, Opex: -554,853.16, Interest Expense: -692,147.38
- Apra Tower × Construction Equipment Loans → Revenue: 197,115.92, Opex: 1,349,913.32, Interest Expense: 1,742,450.08
- Apra Tower × Home Loans → Revenue: 158,539.00, Opex: -300,252.44, Interest Expense: -441,784.08
- Apra Tower × MSME Loans → Revenue: 139,205.58, Opex: -190,004.48, Interest Expense: -290,610.66
- Borivali × Cars & MUV Loans → Revenue: 498,004.64, Opex: 502,471.44, Interest Expense: 822,200.18
- Borivali × Commercial Vehicle Loans → Revenue: 170,514.82, Opex: -391,055.20, Interest Expense: -689,009.04
- Borivali × Construction Equipment Loans → Revenue: 34,511.84, Opex: 1,372,489.84, Interest Expense: 1,850,767.64
- Borivali × Home Loans → Revenue: 104,230.22, Opex: -318,845.86, Interest Expense: -343,216.30
- Borivali × MSME Loans → Revenue: 181,592.36, Opex: -228,778.32, Interest Expense: -261,386.96
- Broadway Business Centre × Cars & MUV Loans → Revenue: 46,930.10, Opex: 638,044.48, Interest Expense: 813,013.58
- Broadway Business Centre × Commercial Vehicle Loans → Revenue: 296,488.44, Opex: -517,156.12, Interest Expense: -673,445.38
- Broadway Business Centre × Construction Equipment Loans → Revenue: 720,956.08, Opex: 1,451,712.70, Interest Expense: 1,933,980.36
- Broadway Business Centre × Home Loans → Revenue: 49,306.12, Opex: -274,182.12, Interest Expense: -399,004.50
- Broadway Business Centre × MSME Loans → Revenue: 80,437.60, Opex: -142,981.94, Interest Expense: -297,905.20
- Dosti Pinacle × Cars & MUV Loans → Revenue: 212,562.38, Opex: 548,269.22, Interest Expense: 900,908.86
- Dosti Pinacle × Commercial Vehicle Loans → Revenue: 199,143.64, Opex: -420,283.32, Interest Expense: -629,481.18
- Dosti Pinacle × Construction Equipment Loans → Revenue: 128,304.20, Opex: 1,370,412.80, Interest Expense: 2,290,529.20
- Dosti Pinacle × Home Loans → Revenue: 200,492.42, Opex: -294,332.92, Interest Expense: -409,800.78
- Dosti Pinacle × MSME Loans → Revenue: 205,025.84, Opex: -205,935.40, Interest Expense: -264,006.20
- Part II Gurugram × Cars & MUV Loans → Revenue: 393,176.60, Opex: 519,246.88, Interest Expense: 861,983.62
- Part II Gurugram × Commercial Vehicle Loans → Revenue: 346,465.50, Opex: -485,738.84, Interest Expense: -730,764.00
- Part II Gurugram × Construction Equipment Loans → Revenue: -112,718.64, Opex: 1,285,467.42, Interest Expense: 1,924,433.42
- Part II Gurugram × Home Loans → Revenue: 105,595.58, Opex: -270,528.28, Interest Expense: -468,056.24
- Part II Gurugram × MSME Loans → Revenue: 150,577.76, Opex: -239,148.74, Interest Expense: -262,794.20
- Pusa Road × Cars & MUV Loans → Revenue: 477,033.30, Opex: 492,288.10, Interest Expense: 778,951.82
- Pusa Road × Commercial Vehicle Loans → Revenue: 72,715.62, Opex: -375,205.92, Interest Expense: -658,825.88
- Pusa Road × Construction Equipment Loans → Revenue: 1,159,351.12, Opex: 1,035,877.14, Interest Expense: 2,162,971.02
- Pusa Road × Home Loans → Revenue: 77,896.60, Opex: -280,888.86, Interest Expense: -405,706.12
- Pusa Road × MSME Loans → Revenue: 36,003.70, Opex: -182,032.36, Interest Expense: -245,910.70

When responding, Keep it concise and executive-friendly.
`].join('\n')
        }

        console.log(this.system)

        const body = {
          model: this._props.model || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: this.system },
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
        const ans  = data.choices?.[0]?.message?.content || '(No content)'
        this._stopTyping()

        // Try to parse structured { answer, chart_data } from LLM
        let parsed = null
        try {
          const clean = ans.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
          const candidate = JSON.parse(clean)
          if (candidate && (candidate.answer !== undefined || candidate.chart_data !== undefined)) {
            parsed = candidate
          }
        } catch (_) { /* plain text — that's fine */ }

        if (parsed) {
          this._renderBotResponse(parsed)
        } else {
          this._renderBotResponse({ answer: ans })
        }
      } catch (e) {
        this._stopTyping()
        this._append('bot', ` ${e.message}`)
      } finally {
        this.$send.disabled = false
      }
    }

    // ── Render a raw Chart.js config object directly (backdoor / keyword path) ─
    // This accepts the full Chart.js { type, data, options } object directly,
    // bypassing the renderChart() pipeline which expects our internal format.
    _renderChartJsConfig (config) {
      const b = document.createElement('div')
      b.className = 'msg bot'
      b.style.background = '#ffffff'
      b.style.border     = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'

      const card = document.createElement('div')
      card.className = 'chartCard'

      const canvasWrap = document.createElement('div')
      canvasWrap.className = 'chartCanvas'
      card.appendChild(canvasWrap)

      const footer = document.createElement('div')
      footer.className = 'chartFooter'
      const titleText = config?.options?.plugins?.title?.text || config?.data?.datasets?.[0]?.label || 'Chart'
      footer.innerHTML = `<span class="cfName">${this._escapeHtml(titleText)}</span>`
      card.appendChild(footer)

      b.appendChild(card)
      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight

      _loadChartJs().then(Chart => {
        // Destroy any previous instance on this container
        const prev = _instances.get(canvasWrap)
        if (prev) { try { prev.destroy() } catch (_) {} }

        canvasWrap.innerHTML = ''
        const canvas = document.createElement('canvas')
        canvas.style.cssText = 'display:block; width:100%; height:100%;'
        canvasWrap.appendChild(canvas)

        try {
          const instance = new Chart(canvas, config)
          _instances.set(canvasWrap, instance)
        } catch (err) {
          _showError(canvasWrap, `Chart render failed: ${err.message}`)
        }
        this.$chat.scrollTop = this.$chat.scrollHeight
      }).catch(err => {
        _showError(canvasWrap, 'Could not load chart library. Check your network connection.')
      })
    }
  }

  if (!customElements.get('perci-bot')) {
    customElements.define('perci-bot', PerciBot)
  }
})()