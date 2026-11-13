/* Ds Compiler —— Telegram 风格聊天式 UI + Pydroid 式编辑器/运行/控制台 */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var chat = $('#chat');
  var input = $('#codeInput');
  var statusEl = $('#status');
  var editor = $('#editor');
  var edCode = $('#edCode');
  var edName = $('#edName');
  var gutter = $('#lineNumbers');
  var drawer = $('#drawer');
  var mask = $('#drawerMask');

  var LS_FILES = 'ds.files';
  var LS_FONT = 'ds.font';
  var LS_DRAFT = 'ds.draft';
  var currentFile = 'untitled.ds';

  var samples = [
    {
      name: 'hello.ds',
      code: 'package hello\n\nfn main() {\n    println("hello, Ds!")\n    println("在手机上运行 Ds v0.1")\n}\n'
    },
    {
      name: 'fib.ds',
      code: 'package algos\n\nfn fib(n: i32) -> i32 {\n    if n < 2 { n } else { fib(n - 1) + fib(n - 2) }\n}\n\nfn main() {\n    for i in range(0, 10) {\n        println("fib(" + str(i) + ") = " + str(fib(i)))\n    }\n}\n'
    },
    {
      name: 'primes.ds',
      code: 'package algos\n\nfn is_prime(n: i32) -> bool {\n    if n < 2 { return false }\n    var i = 2\n    while i * i <= n {\n        if n % i == 0 { return false }\n        i = i + 1\n    }\n    true\n}\n\nfn main() {\n    var found = 0\n    for n in range(2, 60) {\n        if is_prime(n) {\n            print(str(n) + " ")\n            found = found + 1\n        }\n    }\n    println("")\n    println("共 " + str(found) + " 个质数")\n}\n'
    },
    {
      name: 'collections.ds',
      code: 'package data\n\nfn main() {\n    let xs = [5 3 8 1 9 2]\n    var total = 0\n    for v in xs { total = total + v }\n    println("数组: " + str(xs))\n    println("总和: " + str(total))\n\n    let person = {"name": "Ds", "version": 1}\n    println(person)\n    println("name = " + person["name"])\n\n    println([1 2 3] |> len)\n}\n'
    }
  ];

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function now() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function setStatus(text) { statusEl.textContent = text; }
  function scrollBottom() { setTimeout(function () { chat.scrollTop = chat.scrollHeight; }, 30); }

  /* ---------------- 聊天气泡 ---------------- */
  function bubble(kind, bodyHtml, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + kind;
    if (kind === 'in') {
      var av = document.createElement('div');
      av.className = 'mini-avatar';
      av.textContent = 'Ds';
      wrap.appendChild(av);
    }
    var b = document.createElement('div');
    b.className = 'bubble' + (opts.ok === true ? ' ok' : '') + (opts.error ? ' error' : '');
    b.innerHTML =
      (opts.who ? '<div class="who">' + esc(opts.who) + '</div>' : '') +
      bodyHtml +
      '<div class="meta"><span>' + now() + '</span>' +
      (opts.ok === true ? '<span class="tick">✓✓</span>' : '') +
      (opts.copyText ? '<button class="copy" data-copy="1">复制</button>' : '') +
      '</div>';
    if (opts.copyText) {
      b.querySelector('.copy').addEventListener('click', function () {
        copyText(opts.copyText);
      });
    }
    wrap.appendChild(b);
    chat.appendChild(wrap);
    scrollBottom();
    return wrap;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    document.body.removeChild(ta);
  }

  function welcome() {
    bubble('in',
      '<pre>欢迎使用 <b>Ds Compiler</b> —— 手机上的 Ds v0.1 编译器。\n\n' +
      '· 在下方输入 Ds 代码，点 ▶ 运行\n' +
      '· ＋ 新建：打开全屏编辑器\n' +
      '· 🧩 示例：内置 hello / 斐波那契 / 质数 / 集合\n' +
      '· 📂 文件：保存与打开脚本（本地离线）</pre>',
      { who: 'Ds Compiler' });
  }

  /* ---------------- 运行 ---------------- */
  function runCode(code, label) {
    if (!code || !code.trim()) { setStatus('没有可运行的代码'); return; }
    bubble('out', '<pre>' + esc(code) + '</pre>', { who: label || '你' });
    setStatus('编译中…');
    var r;
    try {
      r = DsLang.run(code);
    } catch (e) {
      bubble('in', '<div class="err-title">编译器内部错误</div><pre>' + esc(e && e.stack || String(e)) + '</pre>',
        { who: 'Ds Compiler', error: true });
      setStatus('内部错误');
      return;
    }
    var out = r.output.map(function (o) { return o.s; }).join('');
    if (r.ok) {
      var body = out.trim().length ? '<pre>' + esc(out.replace(/\n$/, '')) + '</pre>' : '<pre><i class="muted">(无输出)</i></pre>';
      bubble('in', body, { who: '编译器输出', ok: true, copyText: out });
      setStatus('运行成功 · v0.1.0');
    } else {
      var err = r.error || { message: '未知错误', line: 0, col: 0 };
      var loc = err.line ? '第 ' + err.line + ' 行' + (err.col ? ' 第 ' + err.col + ' 列' : '') + '：' : '';
      var partial = out.trim().length ? '<pre class="muted">' + esc(out.replace(/\n$/, '')) + '</pre>' : '';
      bubble('in',
        '<div class="err-title">编译/运行错误</div><pre>' + esc(loc + err.message) + '</pre>' + partial,
        { who: 'Ds Compiler', error: true });
      setStatus('错误 · 第 ' + (err.line || '?') + ' 行');
    }
  }

  /* ---------------- 输入 ---------------- */
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  }
  input.addEventListener('input', function () {
    autoGrow();
    try { localStorage.setItem(LS_DRAFT, input.value); } catch (e) { }
  });
  $('#btnSend').addEventListener('click', function () {
    runCode(input.value, '你');
  });

  /* ---------------- 编辑器 ---------------- */
  function updateGutter() {
    var lines = edCode.value.split('\n').length;
    var html = '';
    for (var i = 1; i <= Math.max(lines, 1); i++) html += i + '\n';
    gutter.textContent = html;
    gutter.scrollTop = edCode.scrollTop;
  }
  function openEditor(name, code) {
    currentFile = name;
    edName.value = name;
    edCode.value = code;
    editor.classList.remove('hidden');
    updateGutter();
    setTimeout(function () { edCode.focus(); edCode.scrollTop = 0; updateGutter(); }, 60);
  }
  function closeEditor() { editor.classList.add('hidden'); }
  edCode.addEventListener('input', updateGutter);
  edCode.addEventListener('scroll', function () { gutter.scrollTop = edCode.scrollTop; });
  edCode.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      var start = edCode.selectionStart, end = edCode.selectionEnd;
      edCode.value = edCode.value.slice(0, start) + '    ' + edCode.value.slice(end);
      edCode.selectionStart = edCode.selectionEnd = start + 4;
      updateGutter();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doEditorRun();
    }
  });
  function doEditorRun() {
    var code = edCode.value;
    var name = edName.value.trim() || 'untitled.ds';
    saveFile(name, code, false);
    closeEditor();
    input.value = code;
    autoGrow();
    runCode(code, name);
  }
  $('#edClose').addEventListener('click', closeEditor);
  $('#edRun').addEventListener('click', doEditorRun);
  $('#edSave').addEventListener('click', function () {
    var name = edName.value.trim() || 'untitled.ds';
    saveFile(name, edCode.value, true);
  });

  /* ---------------- 文件存储 ---------------- */
  function loadFiles() {
    try { return JSON.parse(localStorage.getItem(LS_FILES) || '[]'); } catch (e) { return []; }
  }
  function persistFiles(files) {
    try { localStorage.setItem(LS_FILES, JSON.stringify(files)); } catch (e) { }
  }
  function saveFile(name, code, toast) {
    var files = loadFiles();
    var hit = false;
    for (var i = 0; i < files.length; i++) {
      if (files[i].name === name) { files[i].code = code; files[i].updated = Date.now(); hit = true; }
    }
    if (!hit) files.unshift({ name: name, code: code, updated: Date.now() });
    persistFiles(files);
    renderFiles();
    if (toast) {
      bubble('in', '<pre>已保存 <b>' + esc(name) + '</b></pre>', { who: 'Ds Compiler' });
      setStatus('已保存 · ' + name);
    }
  }
  function deleteFile(name) {
    var files = loadFiles().filter(function (f) { return f.name !== name; });
    persistFiles(files);
    renderFiles();
  }

  /* ---------------- 抽屉 ---------------- */
  function openDrawer(tab) {
    renderFiles();
    renderSamples();
    drawer.classList.add('open');
    mask.classList.remove('hidden');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    mask.classList.add('hidden');
  }
  function renderFiles() {
    var box = $('#drawerFiles');
    box.innerHTML = '<div class="drawer-title">我的脚本</div>';
    var files = loadFiles();
    if (!files.length) {
      box.innerHTML += '<div class="drawer-item muted" style="padding-left:10px">还没有保存的脚本</div>';
    }
    files.forEach(function (f) {
      var item = document.createElement('div');
      item.className = 'drawer-item';
      item.innerHTML = '<span>📄</span><span class="fname">' + esc(f.name) + '</span><span class="del">✕</span>';
      item.querySelector('.fname').addEventListener('click', function () {
        closeDrawer();
        openEditor(f.name, f.code);
      });
      item.querySelector('.del').addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('删除 ' + f.name + ' ?')) { deleteFile(f.name); }
      });
      box.appendChild(item);
    });
    var add = document.createElement('div');
    add.className = 'drawer-item';
    add.innerHTML = '<span>＋</span><span class="fname">新建脚本</span>';
    add.addEventListener('click', function () {
      closeDrawer();
      openEditor('script' + (Date.now() % 1000) + '.ds', 'package app\n\nfn main() {\n    println("hello")\n}\n');
    });
    box.appendChild(add);
  }
  function renderSamples() {
    var box = $('#drawerSamples');
    box.innerHTML = '<div class="drawer-title">示例</div>';
    samples.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'drawer-item';
      item.innerHTML = '<span>🧩</span><span class="fname">' + esc(s.name) + '</span>';
      item.addEventListener('click', function () {
        closeDrawer();
        openEditor(s.name, s.code);
      });
      box.appendChild(item);
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  $('#btnMenu').addEventListener('click', function () { openDrawer('files'); });
  $('#btnFilesTop').addEventListener('click', function () { openDrawer('files'); });
  mask.addEventListener('click', closeDrawer);
  document.querySelectorAll('.chip[data-act]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var act = btn.getAttribute('data-act');
      if (act === 'run') { runCode(input.value, '你'); }
      else if (act === 'new') { openEditor('script' + (Date.now() % 1000) + '.ds', 'package app\n\nfn main() {\n    println("hello")\n}\n'); }
      else if (act === 'files') { openDrawer('files'); }
      else if (act === 'samples') { openDrawer('samples'); }
      else if (act === 'clear') {
        chat.innerHTML = '<div class="date-divider"><span>今天</span></div>';
        setStatus('已清屏 · 编译器就绪');
      }
    });
  });

  /* ---------------- 字号 ---------------- */
  function applyFont(delta) {
    var cur = parseFloat(localStorage.getItem(LS_FONT) || '14');
    cur = Math.max(11, Math.min(20, cur + (delta || 0)));
    localStorage.setItem(LS_FONT, String(cur));
    document.documentElement.style.setProperty('--fs', cur + 'px');
  }
  $('#fontPlus').addEventListener('click', function () { applyFont(1); });
  $('#fontMinus').addEventListener('click', function () { applyFont(-1); });

  /* ---------------- 启动 ---------------- */
  applyFont(0);
  welcome();
  var draft;
  try { draft = localStorage.getItem(LS_DRAFT); } catch (e) { draft = null; }
  input.value = draft || 'package hello\n\nfn main() {\n    println("hello, Ds!")\n}\n';
  autoGrow();
  setStatus('编译器就绪 · v0.1.0');
})();
