/* Ds Compiler — Pydroid 3 风格编辑器 UI */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var DsLang = window.DsLang;
  var ed = $('#edCode');
  var gutter = $('#gutter');
  var fileName = $('#fileName');
  var consoleOut = $('#consoleOut');
  var consolePane = $('#consolePane');
  var runState = $('#runState');
  var statusMsg = $('#statusMsg');
  var cursorPos = $('#cursorPos');
  var drawer = $('#drawer');
  var mask = $('#drawerMask');

  var LS_FILES = 'ds.files';
  var LS_FONT = 'ds.font';
  var LS_DRAFT = 'ds.draft.v2';
  var LS_CURRENT = 'ds.current';

  var samples = [
    { name: 'flow_hello.dsf', code: '#!flow\np "hello, Ds"\n' },
    { name: 'flow_fib.dsf', code: '#!flow\n\\fib n = ?n<2: n; fib(n-1)+fib(n-2)\nfor i in 0..10: p f"fib({i})={fib(i)}"\n' },
    { name: 'concise.ds', code: 'p("hello, 0.1c")\nfn add(a,b)=a+b\np(f"2+3={add(2,3)}")\nvar t=0\nfor i in 1..6: t+=i\np(f"total={t}")\n' },
    { name: 'hello.ds', code: 'package hello\n\nfn main() {\n    println("hello, Ds!")\n    println("在手机上运行 Ds v0.1")\n}\n' },
    { name: 'fib.ds', code: 'package algos\n\nfn fib(n: i32) -> i32 {\n    if n < 2 { n } else { fib(n - 1) + fib(n - 2) }\n}\n\nfn main() {\n    for i in range(0, 10) {\n        println("fib(" + str(i) + ") = " + str(fib(i)))\n    }\n}\n' },
    { name: 'primes.ds', code: 'package algos\n\nfn is_prime(n: i32) -> bool {\n    if n < 2 { return false }\n    var i = 2\n    while i * i <= n {\n        if n % i == 0 { return false }\n        i = i + 1\n    }\n    true\n}\n\nfn main() {\n    var found = 0\n    for n in range(2, 60) {\n        if is_prime(n) {\n            print(str(n) + " ")\n            found = found + 1\n        }\n    }\n    println("")\n    println("共 " + str(found) + " 个质数")\n}\n' },
    { name: 'collections.ds', code: 'package data\n\nfn main() {\n    let xs = [5 3 8 1 9 2]\n    var total = 0\n    for v in xs { total = total + v }\n    println("数组: " + str(xs))\n    println("总和: " + str(total))\n\n    let person = {"name": "Ds", "version": 1}\n    println(person)\n    println("name = " + person["name"])\n\n    println([1 2 3] |> len)\n}\n' }
  ];

  var currentFile = 'new.ds';
  var dirty = false;

  function loadFiles() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_FILES) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function persistFiles(list) {
    try { localStorage.setItem(LS_FILES, JSON.stringify(list)); } catch (e) {}
  }
  function saveFile(name, code) {
    var list = loadFiles();
    var hit = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) { list[i].code = code; list[i].updated = Date.now(); hit = true; }
    }
    if (!hit) list.unshift({ name: name, code: code, updated: Date.now() });
    persistFiles(list);
    renderFiles();
    setDirty(false);
    setStatus('已保存 · ' + name);
  }
  function deleteFile(name) {
    persistFiles(loadFiles().filter(function (f) { return f.name !== name; }));
    renderFiles();
    if (name === currentFile) newFile();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setStatus(text) {
    statusMsg.textContent = text || '';
    runState.textContent = text || '就绪';
  }
  function setDirty(v) {
    dirty = !!v;
    fileName.classList.toggle('dirty', dirty);
  }
  function saveDraft() {
    try {
      localStorage.setItem(LS_DRAFT, JSON.stringify({ name: currentFile, code: ed.value }));
      localStorage.setItem(LS_CURRENT, currentFile);
    } catch (e) {}
  }

  function updateGutter() {
    var lines = ed.value.split('\n').length;
    var html = '';
    for (var i = 1; i <= Math.max(lines, 1); i++) html += i + '\n';
    gutter.textContent = html;
    gutter.scrollTop = ed.scrollTop;
  }
  function updateCursor() {
    var pos = ed.selectionStart || 0;
    var before = ed.value.slice(0, pos);
    var line = before.split('\n').length;
    var col = pos - before.lastIndexOf('\n');
    cursorPos.textContent = 'Ln ' + line + ', Col ' + col;
    updateGutter();
  }
  function openCode(name, code) {
    currentFile = name || 'new.ds';
    fileName.value = currentFile;
    ed.value = code || '';
    setDirty(false);
    saveDraft();
    updateGutter();
    updateCursor();
    ed.scrollTop = 0;
    setStatus('就绪');
    closeDrawer();
    setTimeout(function () { ed.focus(); }, 120);
  }
  function latestFile() {
    var list = loadFiles().slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    return list.length ? list[0] : null;
  }
  function newFile() {
    var name = 'new.ds';
    openCode(name, '');
    setStatus('新建脚本');
  }

  /* ---------------- 运行 ---------------- */
  function appendConsole(text, cls) {
    var div = document.createElement('div');
    div.className = 'out-line ' + (cls || '');
    div.textContent = text;
    consoleOut.appendChild(div);
    consoleOut.scrollTop = consoleOut.scrollHeight;
    return div;
  }
  function clearConsole() {
    consoleOut.innerHTML = '';
    setStatus('就绪');
  }
  function setConsoleOpen(open) {
    consolePane.classList.toggle('collapsed', !open);
    $('#app').classList.toggle('console-open', open);
    var btn = $('#btnToggleConsole');
    if (btn) btn.textContent = open ? '▾' : '▴';
  }
  function runCode() {
    var code = ed.value;
    if (!code.trim()) { setStatus('没有可运行的代码'); return; }
    setConsoleOpen(true);
    consoleOut.innerHTML = '';
    runState.textContent = '编译中…';
    var t0 = Date.now();
    var r;
    try {
      r = DsLang.run(code);
    } catch (e) {
      appendConsole('编译器内部错误：' + (e && e.message ? e.message : String(e)), 'err');
      setStatus('内部错误');
      return;
    }
    var out = (r.output || []).map(function (o) { return o.s; }).join('');
    if (r.ok) {
      appendConsole(out.length ? out.replace(/\n$/, '') : '(无输出)', out.length ? '' : 'meta');
      appendConsole('✓ 运行成功 · ' + (Date.now() - t0) + ' ms', 'ok');
      setStatus('成功');
    } else {
      var err = r.error || { message: '未知错误', line: 0, col: 0 };
      var loc = err.line ? '第 ' + err.line + ' 行' + (err.col ? ' 第 ' + err.col + ' 列' : '') + '：' : '';
      appendConsole('✗ ' + loc + err.message, 'err');
      if (out.trim()) appendConsole(out.replace(/\n$/, ''), 'meta');
      setStatus('错误 · 第 ' + (err.line || '?') + ' 行');
    }
    consoleOut.scrollTop = consoleOut.scrollHeight;
  }

  /* ---------------- 快捷符号 / 键盘 ---------------- */
  function insertText(text) {
    var s = ed.selectionStart || 0, e = ed.selectionEnd || 0;
    ed.value = ed.value.slice(0, s) + text + ed.value.slice(e);
    var pos = s + text.length;
    ed.selectionStart = ed.selectionEnd = pos;
    ed.focus();
    updateCursor();
    saveDraft();
  }
  document.querySelectorAll('#quickKeys .sym').forEach(function (b) {
    b.addEventListener('click', function () { insertText(b.getAttribute('data-key') || b.textContent); });
  });
  ed.addEventListener('input', function () {
    updateCursor();
    setDirty(true);
    saveDraft();
  });
  ed.addEventListener('click', updateCursor);
  ed.addEventListener('keyup', updateCursor);
  ed.addEventListener('scroll', function () { gutter.scrollTop = ed.scrollTop; });
  ed.addEventListener('keydown', function (e) {
    if (e.isComposing) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      insertText('    ');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      var pos = ed.selectionStart;
      var lineStart = ed.value.lastIndexOf('\n', pos - 1) + 1;
      var line = ed.value.slice(lineStart, pos);
      var indent = (line.match(/^[ \t]*/) || [''])[0];
      e.preventDefault();
      insertText('\n' + indent);
      return;
    }
  });

  /* ---------------- 文件名 / 保存 ---------------- */
  fileName.addEventListener('input', function () {
    currentFile = (fileName.value || 'new.ds').trim() || 'new.ds';
    setDirty(true);
    saveDraft();
  });
  $('#btnSave').addEventListener('click', function () { saveFile(currentFile, ed.value); });
  $('#btnOpen').addEventListener('click', function () { openDrawer('files'); });
  $('#btnMenu').addEventListener('click', function () { openDrawer('files'); });
  $('#btnSamples').addEventListener('click', function () { openDrawer('samples'); });
  $('#btnMore').addEventListener('click', function () { openDrawer('links'); });
  $('#fabRun').addEventListener('click', runCode);
  $('#btnClearConsole').addEventListener('click', clearConsole);
  $('#btnClearAll').addEventListener('click', clearConsole);
  $('#btnToggleConsole').addEventListener('click', function () {
    setConsoleOpen(consolePane.classList.contains('collapsed'));
  });

  /* ---------------- 抽屉 ---------------- */
  function openDrawer(tab) {
    renderFiles();
    renderSamples();
    drawer.classList.add('open');
    mask.classList.remove('hidden');
    mask.classList.add('open');
    if (tab === 'samples') {
      var s = $('#drawerSamples');
      if (s) s.scrollIntoView({ block: 'start' });
    }
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    mask.classList.remove('open');
    mask.classList.add('hidden');
  }
  function renderFiles() {
    var box = $('#drawerFiles');
    box.innerHTML = '<div class="drawer-title">脚本</div>';
    var list = loadFiles().slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    list.forEach(function (f) {
      var item = document.createElement('div');
      item.className = 'drawer-item';
      item.innerHTML = '<span>📄</span><span class="fname">' + esc(f.name) + '</span>' +
        '<button class="del" aria-label="删除">✕</button>';
      item.querySelector('.fname').addEventListener('click', function () { openCode(f.name, f.code); });
      item.querySelector('.del').addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (confirm('删除 ' + f.name + '？')) deleteFile(f.name);
      });
      box.appendChild(item);
    });
    var add = document.createElement('div');
    add.className = 'drawer-item add';
    add.innerHTML = '<span>＋</span><span>新建脚本</span>';
    add.addEventListener('click', newFile);
    box.appendChild(add);
  }
  function renderSamples() {
    var box = $('#drawerSamples');
    box.innerHTML = '<div class="drawer-title">示例</div>';
    samples.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'drawer-item';
      item.innerHTML = '<span>🧩</span><span class="fname">' + esc(s.name) + '</span>';
      item.addEventListener('click', function () { openCode(s.name, s.code); });
      box.appendChild(item);
    });
  }

  /* ---------------- 外部链接 / AI ---------------- */
  var RESOURCES = {
    gh: 'https://github.com/yzxcrush/ds',
    plus: 'https://github.com/yzxcrush/ds/tree/ds-plus',
    dspm: 'https://github.com/yzxcrush/ds/blob/main/docs/DSPM.md',
    spec: 'https://github.com/yzxcrush/ds/blob/main/spec/DS-v0.1.md',
    llms: 'https://raw.githubusercontent.com/yzxcrush/ds/main/llms.txt',
    data: 'https://github.com/yzxcrush/ds/tree/main/datasets',
    site: 'https://yzxcrush.github.io/ds/'
  };
  document.querySelectorAll('[data-open]').forEach(function (item) {
    item.addEventListener('click', function () {
      var what = item.getAttribute('data-open');
      if (what === 'ai') { closeDrawer(); openAiPanel(); return; }
      closeDrawer();
      if (RESOURCES[what]) location.href = RESOURCES[what];
    });
  });
  mask.addEventListener('click', closeDrawer);

  var aiPanel = $('#aiPanel');
  function openAiPanel() { aiPanel.classList.remove('hidden'); aiPanel.scrollTop = 0; }
  function closeAiPanel() { aiPanel.classList.add('hidden'); }
  $('#aiClose').addEventListener('click', closeAiPanel);
  $('#aiGithub').addEventListener('click', function () { location.href = 'https://github.com/yzxcrush/ds'; });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
  document.querySelectorAll('[data-copy-url]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyText(btn.getAttribute('data-copy-url'));
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1200);
    });
  });
  document.querySelectorAll('[data-copy-el]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-copy-el'));
      if (el) copyText(el.textContent);
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1200);
    });
  });

  /* ---------------- 字号 ---------------- */
  var fontSize = 15;
  function applyFont(delta) {
    fontSize = Math.max(11, Math.min(26, fontSize + delta));
    document.documentElement.style.setProperty('--font-size', fontSize + 'px');
    try { localStorage.setItem(LS_FONT, String(fontSize)); } catch (e) {}
  }
  $('#fontMinus').addEventListener('click', function () { applyFont(-1); });
  $('#fontPlus').addEventListener('click', function () { applyFont(1); });

  /* ---------------- 启动 ---------------- */
  (function init() {
    try {
      var savedFont = parseInt(localStorage.getItem(LS_FONT) || '15', 10);
      if (!isNaN(savedFont)) fontSize = savedFont;
    } catch (e) {}
    document.documentElement.style.setProperty('--font-size', fontSize + 'px');

    var draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(LS_DRAFT) || 'null');
      if (!draft || typeof draft.code !== 'string') draft = null;
    } catch (e) { draft = null; }
    if (draft) {
      openCode(draft.name || 'new.ds', draft.code);
    } else {
      var last = latestFile();
      if (last) openCode(last.name, last.code);
      else openCode(samples[0].name, samples[0].code);
    }
    renderFiles();
    renderSamples();
    updateGutter();
    updateCursor();
  })();
})();
