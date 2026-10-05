(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SAMPLE = 'a = 10\nb = 5\nprint(a + b)\n';
  const MEDIA = 'https://unpkg.com/blockly@11.2.1/media/';

  let workspace = null;
  let config = { manualAfterMs: 30000, model: '', gemmaReady: true };
  let suppress = 0;          // >0 while we load blocks programmatically
  let blocksTimer = null, codeTimer = null, saveTimer = null;
  let running = false;

  /* ------------------------------------------------------------ */
  /* API helper                                                    */
  /* ------------------------------------------------------------ */
  async function api(path, body, signal) {
    const opt = body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
    };
    if (signal && body === undefined) opt.signal = signal;
    const r = await fetch(path, opt);
    let data = {};
    try { data = await r.json(); } catch { /* ignore */ }
    if (r.status === 401 && path !== '/api/me') { location.href = '/login.html'; throw new Error('Please log in.'); }
    if (!r.ok) { const e = new Error(data.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
    return data;
  }

  /* ------------------------------------------------------------ */
  /* Editor (textarea + highlight overlay + gutter)                */
  /* ------------------------------------------------------------ */
  function highlight(src) {
    const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(
      /(f?(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(#[^\n]*)|\b(if|elif|else|while|for|in|and|or|not|is|True|False|None|def|class|return|import|from|pass|break|continue|try|except|with|as|lambda)\b|\b(print|input|len|range|str|int|float|bool|list|abs|min|max|sum|round|sorted)\b(?=\()|\b(\d+(?:\.\d+)?)\b/g,
      (m, s, c, k, f, n) => {
        if (s) return '<span class="tk-str">' + s + '</span>';
        if (c) return '<span class="tk-cm">' + c + '</span>';
        if (k) return '<span class="tk-kw">' + k + '</span>';
        if (f) return '<span class="tk-fn">' + f + '</span>';
        if (n) return '<span class="tk-num">' + n + '</span>';
        return m;
      }
    );
  }

  function refreshEditor() {
    const code = $('code').value;
    $('hl').innerHTML = highlight(code) + '\n';
    const lines = code.split('\n').length;
    let nums = '';
    for (let i = 1; i <= lines; i++) nums += i + '\n';
    $('gutter').textContent = nums;
    syncScroll();
  }
  function syncScroll() {
    const t = $('code');
    $('hl').scrollTop = t.scrollTop; $('hl').scrollLeft = t.scrollLeft;
    $('gutter').scrollTop = t.scrollTop;
  }
  function setCode(text) { $('code').value = text; refreshEditor(); }

  function setSync(msg, bad) {
    const el = $('syncState');
    el.textContent = msg;
    el.style.color = bad ? 'var(--amber)' : '';
  }

  /* ------------------------------------------------------------ */
  /* Blockly workspace                                             */
  /* ------------------------------------------------------------ */
  function initWorkspace() {
    Py2Blocks.defineBlocks();
    workspace = Blockly.inject('blocklyDiv', {
      toolbox: Py2Blocks.TOOLBOX,
      theme: Py2Blocks.darkTheme(),
      renderer: 'zelos',
      media: MEDIA,
      trashcan: true,
      grid: { spacing: 24, length: 2, colour: '#21262d', snap: true },
      zoom: { controls: true, wheel: false, startScale: 0.9, minScale: 0.4, maxScale: 1.6 },
      move: { scrollbars: true, drag: true, wheel: true }
    });

    workspace.addChangeListener((e) => {
      if (suppress > 0 || e.isUiEvent || e.type === Blockly.Events.FINISHED_LOADING) return;
      clearTimeout(blocksTimer);
      blocksTimer = setTimeout(syncBlocksToCode, 120);
    });

    new ResizeObserver(() => Blockly.svgResize(workspace)).observe($('blocklyDiv'));
  }

  function updateStats(stats) {
    const count = workspace.getAllBlocks(false).length;
    $('blockStat').textContent = count + (count === 1 ? ' block' : ' blocks');
    const buffers = stats ? stats.buffers : workspace.getAllBlocks(false).filter(b => b.type.startsWith('buffer_')).length;
    $('bufferStat').textContent = buffers ? buffers + ' unsupported (buffer) block' + (buffers > 1 ? 's' : '') : '';
  }

  /** Blocks -> Python (runs after the user edits blocks). */
  function syncBlocksToCode() {
    setCode(Py2Blocks.generateCode(workspace));
    setSync('blocks \u2192 python');
    updateStats();
    scheduleSave();
  }

  /** Python -> Blocks (runs after the user edits code or Gemma returns code). Blocks arrange themselves. */
  function syncCodeToBlocks() {
    const code = $('code').value;
    let ast;
    try { ast = Py2.parse(code); }
    catch (e) { setSync('line ' + (e.line || '?') + ': ' + (e.pyMsg || e.message) + ' - blocks not updated', true); return; }

    const { state, stats } = Py2Blocks.astToState(ast);
    suppress++;
    Blockly.Events.disable();
    try {
      workspace.clear();
      Blockly.serialization.workspaces.load(state, workspace);
    } finally {
      Blockly.Events.enable();
      setTimeout(() => { suppress--; }, 100);
    }
    setTimeout(() => { Blockly.svgResize(workspace); workspace.scrollCenter(); }, 30);
    setSync(ast.raws.length ? 'python \u2192 blocks (' + ast.raws.length + ' issue' + (ast.raws.length > 1 ? 's' : '') + ')' : 'python \u2192 blocks', ast.raws.length > 0);
    updateStats(stats);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { api('/api/code', { python: $('code').value }).catch(() => {}); }, 1500);
  }

  /* ------------------------------------------------------------ */
  /* Terminal                                                      */
  /* ------------------------------------------------------------ */
  function termClear() { $('term').textContent = ''; }
  function term(text, cls) {
    const s = document.createElement('span');
    if (cls) s.className = cls;
    s.textContent = text;
    $('term').appendChild(s);
  }
  function showTab(name) {
    document.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    ['out', 'stdin', 'ask'].forEach(n => $('tab-' + n).classList.toggle('hidden', n !== name));
  }

  /* ------------------------------------------------------------ */
  /* Run: Gemma first, manual interpreter after the pop-up         */
  /* ------------------------------------------------------------ */
  function showResult(modeLabel, output, error, ok) {
    termClear();
    term('$ python main.py\n', 'cmd');
    if (output) term(output.endsWith('\n') ? output : output + '\n');
    if (error) term(error + '\n', 'err');
    else if (ok !== false) term('\nProcess finished.\n', 'ok');
    $('runMode').textContent = modeLabel;
  }

  function runManual(code) {
    const stdin = $('stdin').value ? $('stdin').value.split('\n') : [];
    const res = Py2.run(code, { stdin, inputFn: (p) => window.prompt(p || 'input():') });
    showResult('manual interpreter', res.output, res.error, !res.error);
  }

  function openModal() {
    $('modalText').textContent = 'Gemma has not answered after ' + Math.round(config.manualAfterMs / 1000) +
      ' seconds. Process the output manually with the built-in safe interpreter, or keep waiting for Gemma?';
    $('modal').classList.remove('hidden');
    $('manualBtn').focus();
  }
  const closeModal = () => $('modal').classList.add('hidden');

  async function runCode() {
    if (running) return;
    const code = $('code').value;
    if (!code.trim()) { showTab('out'); termClear(); term('Nothing to run yet.\n', 'warn'); return; }
    running = true;
    $('runBtn').disabled = true;
    showTab('out');
    termClear();
    term('$ python main.py\n', 'cmd');
    term('Gemma is calculating the output...\n', 'dim');
    $('runMode').textContent = 'gemma';

    const ctrl = new AbortController();
    let manual = false;
    const onManual = () => { manual = true; closeModal(); ctrl.abort(); };
    const onWait = () => closeModal();
    $('manualBtn').onclick = onManual;
    $('waitBtn').onclick = onWait;
    const timer = setTimeout(openModal, config.manualAfterMs);

    try {
      const d = await api('/api/execute', { code, stdin: $('stdin').value }, ctrl.signal);
      clearTimeout(timer); closeModal();
      if (d.status === 'blocked') {
        showResult('blocked', '', 'Blocked for safety: ' + (d.reason || 'unsafe code') + '.', false);
      } else if (d.status === 'error') {
        showResult('gemma', d.output, d.error || 'Error', false);
      } else {
        showResult('gemma', d.output, '', true);
      }
    } catch (err) {
      clearTimeout(timer); closeModal();
      if (manual) runManual(code);
      else if (err.name !== 'AbortError') showResult('gemma', '', err.message, false);
    } finally {
      running = false;
      $('runBtn').disabled = false;
    }
  }

  /* ------------------------------------------------------------ */
  /* Gemma: generate + ask                                         */
  /* ------------------------------------------------------------ */
  function chat(who, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + (who === 'user' ? 'user' : 'bot');
    d.textContent = text;
    $('chatLog').appendChild(d);
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
  }

  async function generate(prompt) {
    $('genBtn').disabled = true;
    $('genBtn').textContent = 'Thinking...';
    setSync('gemma is writing code...');
    try {
      const d = await api('/api/generate', { prompt });
      setCode(d.python);
      syncCodeToBlocks();          // code from Gemma -> blocks, auto-arranged
      setSync('gemma \u2192 blocks + python');
      chat('user', prompt);
      chat('bot', (d.title ? d.title + '\n' : '') + (d.explanation || 'Done.'));
      $('promptInput').value = '';
      scheduleSave();
    } catch (err) {
      setSync(err.message, true);
      showTab('out'); termClear(); term(err.message + '\n', 'err');
    } finally {
      $('genBtn').disabled = false;
      $('genBtn').textContent = 'Generate';
    }
  }

  async function ask(question) {
    chat('user', question);
    const wait = document.createElement('div');
    wait.className = 'msg bot dim'; wait.textContent = 'Gemma is thinking...';
    $('chatLog').appendChild(wait);
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
    try {
      const d = await api('/api/ask', { question, code: $('code').value });
      wait.className = 'msg bot'; wait.textContent = d.answer || '(no answer)';
    } catch (err) {
      wait.className = 'msg bot'; wait.style.color = 'var(--red)'; wait.textContent = err.message;
    }
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
  }

  /* ------------------------------------------------------------ */
  /* Wiring                                                        */
  /* ------------------------------------------------------------ */
  function bindUI() {
    const ta = $('code');
    ta.addEventListener('input', () => {
      refreshEditor();
      setSync('editing...');
      clearTimeout(codeTimer);
      codeTimer = setTimeout(syncCodeToBlocks, 450);
      scheduleSave();
    });
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 4;
        ta.dispatchEvent(new Event('input'));
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode(); }
    });

    $('runBtn').addEventListener('click', runCode);
    $('arrangeBtn').addEventListener('click', () => { workspace.cleanUp(); workspace.scrollCenter(); });
    $('clearBtn').addEventListener('click', () => {
      if (!$('code').value.trim() && !workspace.getAllBlocks(false).length) return;
      if (!confirm('Clear all blocks and code?')) return;
      setCode(''); syncCodeToBlocks(); termClear();
      term('Cleared.\n', 'dim');
    });
    $('logoutBtn').addEventListener('click', async () => {
      try { await api('/api/logout', {}); } catch { /* ignore */ }
      location.href = '/login.html';
    });

    $('promptForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const p = $('promptInput').value.trim();
      if (p) generate(p);
    });
    $('askForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('askInput').value.trim();
      if (!q) return;
      $('askInput').value = '';
      ask(q);
    });
    $('explainBtn').addEventListener('click', () => ask('Explain this program step by step for a beginner.'));
    document.querySelectorAll('.ptab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  }

  async function boot() {
    let me;
    try { me = await api('/api/me'); } catch { location.href = '/login.html'; return; }
    $('userChip').textContent = '@' + me.user;

    try { config = Object.assign(config, await api('/api/config')); } catch { /* defaults */ }
    $('gemmaState').innerHTML = '<i class="dot"></i> Gemma ' + (config.gemmaReady ? '(' + config.model + ')' : 'not configured - add GEMINI_API_KEY to .env');
    document.querySelector('.statusbar').classList.toggle('bad', !config.gemmaReady);

    initWorkspace();
    bindUI();

    let initial = SAMPLE;
    try {
      const saved = await api('/api/code');
      if (saved && typeof saved.python === 'string' && saved.python.trim()) {
        initial = saved.python;
        if (saved.explanation) {
          chat('bot', (saved.title ? saved.title + '\n' : '') + saved.explanation);
        }
      }
    } catch { /* first visit */ }

    setCode(initial);
    syncCodeToBlocks();
  }

  boot();
})();
