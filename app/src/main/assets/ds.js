/*!
 * Ds 编译器内核（JavaScript 版，供 Ds Compiler Android App 内嵌使用）
 * 覆盖核心子集：package/fn/let/var、字面量、数组/映射、控制流、函数/闭包、
 *   |> 管道、错误定位、步数保护；内建 println/print/len/range/str/concat/format/math.*
 * 0.1c 精简写法：隐式入口、表达式函数体、`if c: stmt`、复合赋值、`a..b`、f-string、
 *   首次赋值即不可变绑定；Flow 写法（#!flow / `\` / .dsf）：`\name a b = expr`、
 *   并置调用、`.` 块、`?`/`^`/`;`、短别名 p/s/l/r。
 * 许可：MIT
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DsLang = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.2.0';
  var MAX_STEPS = 20 * 1000 * 1000;
  var MAX_OUTPUT = 1024 * 1024;

  var KEYWORDS = new Set([
    'fn','let','var','type','class','trait','impl','mod','package',
    'if','else','loop','while','for','break','continue','return','goto',
    'try','catch','panic','recover','assert','res','opt',
    'use','as','export','pub','priv','prot','static','extern',
    'spawn','go','thread','chan','send','recv','mutex','wait',
    'raw','free','alloc','rc','arc','gc','ptr','ref','mut',
    '@','asm','volatile','at','irq','section','packed',
    'comptime','macro','typeinfo','attr',
    'self','super','new','drop','extends','dyn',
    'match','when','where','in','is','sizeof','alignof',
    '->','=>','|>'
  ]);

  var UNSUPPORTED = new Set([
    'type','class','trait','impl','mod','use','export','pub','priv','prot',
    'static','extern','macro','attr','section','comptime','try','catch','panic',
    'recover','assert','spawn','go','thread','chan','send','recv','mutex','wait',
    'alloc','free','rc','arc','gc','raw','volatile','asm','irq','at','packed',
    'dyn','self','super','new','drop','extends','match','when','where','is',
    'sizeof','alignof','goto','res','opt','mut','ref','ptr'
  ]);

  function DsError(message, line, col) {
    this.name = 'DsError';
    this.message = message;
    this.line = line || 0;
    this.col = col || 0;
  }
  DsError.prototype = Object.create(Error.prototype);
  DsError.prototype.constructor = DsError;

  /* ============================ 词法 ============================ */
  var OPS = ['<<=','>>=','+=','-=','*=','/=','%=','&=','|=','^=',
             '|>','->','=>','<<','>>','<=','>=','==','!=','&&','||','..',
             '+','-','*','/','%','=','!','<','>','&','|','^','~','.','@'];
  var PUNCT = '(){}[],:;';

  function tokenize(src, flow) {
    var toks = [];
    var i = 0, line = 1, lineStart = 0, n = src.length;
    var sp = false, bol = true;

    function push(kind, text, start, value) {
      toks.push({ k: kind, text: text, line: line, col: start - lineStart + 1, v: value,
                  sp: sp, bol: bol && kind !== 'nl' });
      sp = false; bol = false;
    }
    function fail(msg, at) {
      at = at === undefined ? i : at;
      throw new DsError(msg, line, at - lineStart + 1);
    }
    function readEscape(start) {
      var e = src[i + 1];
      if (e === 'n') { i += 2; return '\n'; }
      if (e === 'r') { i += 2; return '\r'; }
      if (e === 't') { i += 2; return '\t'; }
      if (e === '0') { i += 2; return '\0'; }
      if (e === '\\') { i += 2; return '\\'; }
      if (e === '"') { i += 2; return '"'; }
      if (e === '{') { i += 2; return '{'; }
      if (e === '}') { i += 2; return '}'; }
      if (e === 'x') {
        var h = src.substr(i + 2, 2);
        if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('非法 \\xNN 转义', start);
        i += 4; return String.fromCharCode(parseInt(h, 16));
      }
      if (e === 'u' && src[i + 2] === '{') {
        var close = src.indexOf('}', i + 3);
        if (close < 0) fail('非法 \\u{...} 转义', start);
        var code = parseInt(src.slice(i + 3, close), 16);
        i = close + 1;
        return String.fromCodePoint(code);
      }
      fail('未知转义 \\' + e, start);
    }

    while (i < n) {
      var c = src[i];
      if (i === 0 && c === '\uFEFF') { i++; continue; }
      if (c === '\n') { push('nl', '\n', i); i++; line++; lineStart = i; bol = true; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; sp = true; continue; }

      if (src.startsWith('#|', i)) {
        var start = i, depth = 0;
        while (i < n) {
          if (src.startsWith('#|', i)) { depth++; i += 2; }
          else if (src.startsWith('|#', i)) { depth--; i += 2; if (depth === 0) break; }
          else { if (src[i] === '\n') { line++; lineStart = i + 1; } i++; }
        }
        if (depth !== 0) fail('块注释 #| 未闭合', start);
        continue;
      }
      if (c === '#' || src.startsWith('//', i)) {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }

      if (c === '"') {
        var s0 = i; i++; var buf = '';
        while (i < n && src[i] !== '"') {
          if (src[i] === '\n') fail('字符串不可含裸换行', s0);
          if (src[i] === '\\') {
            var e = src[i + 1];
            if (e === 'n') { buf += '\n'; i += 2; }
            else if (e === 'r') { buf += '\r'; i += 2; }
            else if (e === 't') { buf += '\t'; i += 2; }
            else if (e === '0') { buf += '\0'; i += 2; }
            else if (e === '\\') { buf += '\\'; i += 2; }
            else if (e === '"') { buf += '"'; i += 2; }
            else if (e === 'x') {
              var h = src.substr(i + 2, 2);
              if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('非法 \\xNN 转义', s0);
              buf += String.fromCharCode(parseInt(h, 16)); i += 4;
            } else if (e === 'u' && src[i + 2] === '{') {
              var close = src.indexOf('}', i + 3);
              if (close < 0) fail('非法 \\u{...} 转义', s0);
              buf += String.fromCodePoint(parseInt(src.slice(i + 3, close), 16));
              i = close + 1;
            } else fail('未知转义 \\' + e, s0);
            continue;
          }
          buf += src[i++];
        }
        if (i >= n) fail('字符串未闭合', s0);
        i++;
        push('str', buf, s0, buf);
        continue;
      }

      if (c === 'b' && src[i + 1] === '"') {
        var b0 = i; i += 2; var body = '';
        while (i < n && src[i] !== '"') body += src[i++];
        if (i >= n) fail('字节串未闭合', b0);
        i++;
        var bytes = [];
        for (var bi = 0; bi < body.length; bi++) bytes.push(body.charCodeAt(bi) & 255);
        push('bytes', body, b0, bytes);
        continue;
      }

      if (c === 'f' && src[i + 1] === '"') {
        var f0 = i; i += 2;
        var parts = [], fbuf = '', closed = false;
        while (i < n) {
          var ch = src[i];
          if (ch === '"') { i++; closed = true; break; }
          if (ch === '\n') fail('f-string 不可含裸换行', f0);
          if (ch === '\\') { fbuf += readEscape(f0); continue; }
          if (ch === '{') {
            if (src[i + 1] === '{') { fbuf += '{'; i += 2; continue; }
            if (fbuf) { parts.push({ s: fbuf }); fbuf = ''; }
            var e0 = i + 1, depth = 1, j = e0;
            while (j < n && depth > 0) {
              var cj = src[j];
              if (cj === '"') {
                j++;
                while (j < n && src[j] !== '"') { if (src[j] === '\\') j++; j++; }
                j++; continue;
              }
              if (cj === '\n') fail('f-string 插值不可跨行', f0);
              if (cj === '{') depth++;
              else if (cj === '}') { depth--; if (depth === 0) break; }
              j++;
            }
            if (depth !== 0) fail("f-string 插值缺少 '}'", f0);
            var srcExpr = src.slice(e0, j);
            if (!srcExpr.trim()) fail('f-string 插值为空', f0);
            parts.push({ e: srcExpr, line: line });
            i = j + 1;
            continue;
          }
          if (ch === '}') {
            if (src[i + 1] === '}') { fbuf += '}'; i += 2; continue; }
            fail("f-string 中单独的 '}'（字面花括号写作 }}）", f0);
          }
          fbuf += ch; i++;
        }
        if (!closed) fail('f-string 未闭合', f0);
        if (fbuf) parts.push({ s: fbuf });
        push('fstr', src.slice(f0, i), f0, parts);
        continue;
      }

      if (c === '`') {
        var r0 = i; i++; var rid = '';
        while (i < n && src[i] !== '`') rid += src[i++];
        if (i >= n || rid.length === 0) fail('原始标识符必须非空且以反引号闭合', r0);
        i++;
        push('ident', rid, r0, rid);
        continue;
      }

      if (/[0-9]/.test(c)) {
        var n0 = i;
        if (src.startsWith('0x', i) || src.startsWith('0X', i)) {
          i += 2; var hx = '';
          while (i < n && /[0-9a-fA-F_]/.test(src[i])) hx += src[i++];
          if (!hx) fail('十六进制字面量缺少数字', n0);
          push('int', hx, n0, parseInt(hx.replace(/_/g, ''), 16));
          continue;
        }
        if (src.startsWith('0b', i) || src.startsWith('0B', i)) {
          i += 2; var bn = '';
          while (i < n && /[01_]/.test(src[i])) bn += src[i++];
          if (!bn) fail('二进制字面量缺少 0/1', n0);
          push('int', bn, n0, parseInt(bn.replace(/_/g, ''), 2));
          continue;
        }
        var isFloat = false;
        while (i < n && /[0-9_]/.test(src[i])) i++;
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) {
          isFloat = true; i++;
          while (i < n && /[0-9_]/.test(src[i])) i++;
        }
        if (src[i] === 'e' || src[i] === 'E') {
          var save = i; i++;
          if (src[i] === '+' || src[i] === '-') i++;
          if (/[0-9]/.test(src[i] || '')) { isFloat = true; while (i < n && /[0-9]/.test(src[i])) i++; }
          else i = save;
        }
        var raw = src.slice(n0, i).replace(/_/g, '');
        push(isFloat ? 'float' : 'int', raw, n0, isFloat ? parseFloat(raw) : parseInt(raw, 10));
        continue;
      }

      if (/[A-Za-z_]/.test(c)) {
        var i0 = i;
        while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
        var word = src.slice(i0, i);
        if (word === '_') push('ident', '_', i0, '_');
        else if (KEYWORDS.has(word)) push('kw', word, i0, word);
        else push('ident', word, i0, word);
        continue;
      }

      var matched = false;
      for (var oi = 0; oi < OPS.length; oi++) {
        if (src.startsWith(OPS[oi], i)) {
          var op = OPS[oi];
          var isKw = op === '@' || op === '->' || op === '=>' || op === '|>';
          push(isKw ? 'kw' : 'op', op, i, op);
          i += op.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      if (flow && (c === '\\' || c === '?')) { push('punct', c, i); i++; continue; }
      if (PUNCT.indexOf(c) >= 0) { push('punct', c, i); i++; continue; }
      fail("未知字符 '" + c + "'（标识符仅 ASCII）", i);
    }
    toks.push({ k: 'eof', text: '<eof>', line: line, col: i - lineStart + 1, v: '<eof>' });
    return toks;
  }

  /* ============================ 语法 ============================ */
  function Parser(toks, repl, flow) {
    this.toks = toks; this.pos = 0; this.repl = !!repl; this.flow = !!flow; this.noApply = 0;
  }
  Parser.prototype = {
    cur: function () { return this.toks[this.pos]; },
    peek: function (k) { var i = this.pos + (k || 1); return this.toks[Math.min(i, this.toks.length - 1)]; },
    adv: function () { if (this.cur().k !== 'eof') this.pos++; },
    skipNl: function () { while (this.cur().k === 'nl') this.adv(); },
    is: function (kind, text) { var t = this.cur(); return t.k === kind && (text === undefined || t.text === text); },
    isKw: function (t) { return this.is('kw', t); },
    isOp: function (t) { return this.is('op', t); },
    isPunct: function (t) { return this.is('punct', t); },
    fail: function (msg, tok) {
      tok = tok || this.cur();
      throw new DsError(msg, tok.line, tok.col);
    },
    expectPunct: function (ch, what) {
      this.skipNl();
      if (!this.isPunct(ch)) this.fail("期望 '" + ch + "'（" + what + "），得到 '" + this.cur().text + "'");
      this.adv();
    },
    expectIdent: function (what) {
      var t = this.cur();
      if (t.k !== 'ident') this.fail('期望 ' + what + '，得到 ' + t.text);
      this.adv();
      return t.v;
    },
    rejectUnsupported: function () {
      var t = this.cur();
      if (t.k === 'kw' && UNSUPPORTED.has(t.text)) {
        this.fail('当前版本暂不支持 `' + t.text + '`（编译器核心子集）');
      }
    },

    skipType: function () {
      this.skipNl();
      var depth = 0;
      for (;;) {
        var t = this.cur();
        if (t.k === 'eof') return;
        if (t.k === 'punct') {
          var ch = t.text;
          if (ch === '(' || ch === '[') { depth++; this.adv(); continue; }
          if (ch === '{') { if (depth === 0) return; depth++; this.adv(); continue; }
          if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) return; depth--; this.adv(); continue; }
          if (depth === 0 && (ch === ',' || ch === ';' || ch === ':')) return;
        }
        if (depth === 0 && t.k === 'nl') return;
        if (depth === 0 && t.k === 'op' && t.text === '=') return;
        if (depth === 0 && t.k === 'kw' && (t.text === 'where' || t.text === '->')) this.adv();
        else this.adv();
      }
    },

    parseProgram: function () {
      this.pos = 0;
      var prog = { type: 'Program', items: [], name: null, hasTopStmt: false };
      this.skipNl();
      if (this.isKw('package')) {
        this.adv(); this.skipNl();
        if (this.cur().k === 'ident') prog.name = this.expectIdent('包名');
        this.skipNl();
      }
      for (;;) {
        this.skipNl();
        while (this.isPunct(';')) { this.adv(); this.skipNl(); }
        if (this.cur().k === 'eof') break;
        if (this.isKw('package')) { this.adv(); this.skipNl(); if (this.cur().k === 'ident') this.adv(); continue; }
        var item;
        if (this.isKw('fn')) item = this.parseFn();
        else if (this.isKw('let') || this.isKw('var')) item = this.parseLet();
        else {
          if (this.cur().k === 'kw') this.rejectUnsupported();
          item = this.parseStmt();
        }
        if (item.type !== 'Fn' && item.type !== 'Let' && item.type !== 'Var') prog.hasTopStmt = true;
        prog.items.push(item);
        this.skipNl();
      }
      return prog;
    },

    parseFn: function () {
      var t = this.cur(); this.adv();
      var name = this.expectIdent('函数名');
      var params = this.parseParams();
      var node = { type: 'Fn', name: name, params: params, body: null, line: t.line, col: t.col };
      this.skipNl();
      if (this.isKw('->')) { this.adv(); this.skipType(); }
      this.skipNl();
      if (this.isKw('where')) while (!this.isPunct('{') && this.cur().k !== 'eof') this.adv();
      node.body = this.parseFnBody();
      return node;
    },

    parseFnBody: function () {
      this.skipNl();
      if (this.isOp('=')) {
        this.adv();
        var expr = this.parseExpr(1);
        return { type: 'Block', stmts: [{ type: 'ExprStmt', expr: expr, line: expr.line, col: expr.col }],
                 line: expr.line, col: expr.col };
      }
      if (this.isPunct(':')) {
        this.adv(); this.skipNl();
        var st = this.parseStmt();
        return { type: 'Block', stmts: st ? [st] : [], line: st ? st.line : 0, col: st ? st.col : 0 };
      }
      return this.parseBlock();
    },

    parseParams: function () {
      this.expectPunct('(', '函数参数表');
      var params = [];
      this.skipNl();
      if (!this.isPunct(')')) {
        for (;;) {
          this.skipNl();
          if (this.isKw('mut') || this.isKw('ref')) { this.adv(); this.skipNl(); }
          var t = this.cur();
          if (t.k !== 'ident') this.fail('期望参数名，得到 ' + t.text);
          var name = t.v; this.adv();
          var def = null;
          this.skipNl();
          if (this.isPunct(':')) { this.adv(); this.skipType(); }
          this.skipNl();
          if (this.isOp('=')) { this.adv(); def = this.parseExpr(1); }
          params.push({ name: name, def: def });
          this.skipNl();
          if (this.isPunct(',')) { this.adv(); continue; }
          break;
        }
      }
      this.expectPunct(')', '参数表结束');
      return params;
    },

    parseBlock: function () {
      this.skipNl();
      var t = this.cur();
      if (!this.isPunct('{')) this.fail("期望块 '{'，得到 " + t.text);
      this.adv();
      var block = { type: 'Block', stmts: [], line: t.line, col: t.col };
      for (;;) {
        this.skipNl();
        while (this.isPunct(';')) { this.adv(); this.skipNl(); }
        if (this.cur().k === 'eof') this.fail("块未闭合（缺少 '}'）", t);
        if (this.isPunct('}')) { this.adv(); break; }
        var stmt = this.parseStmt();
        if (stmt) block.stmts.push(stmt);
      }
      return block;
    },

    /* 0.1c / Flow：`if c: stmt` 这类单语句体；`{...}` 依旧可用 */
    parseBody: function (what) {
      this.skipNl();
      if (this.isPunct('{')) return this.parseBlock();
      if (this.isPunct(':')) {
        var ct = this.cur(); this.adv(); this.skipNl();
        var st = this.parseStmt();
        if (!st) this.fail('期望语句（' + what + ' 的 `:` 体）', ct);
        return { type: 'Block', stmts: [st], line: st.line, col: st.col };
      }
      /* Flow：while/for/loop 也可用单独 `.` 结束的多语句块 */
      if (this.flow) return this.parseFlowBlock();
      this.fail("期望块 '{' 或单语句 ':'（" + what + "），得到 " + this.cur().text);
    },

    parseSingleStmtBlock: function (what) {
      this.skipNl();
      if (this.isPunct('{')) return this.parseBlock();
      if (this.isPunct(':')) this.adv();
      this.skipNl();
      var st = this.parseStmt();
      if (!st) this.fail('期望语句（' + what + '）');
      return { type: 'Block', stmts: [st], line: st.line, col: st.col };
    },

    parseLet: function () {
      var t = this.cur();
      var isMut = this.isKw('var');
      this.adv();
      var name = this.expectIdent('变量名');
      this.skipNl();
      if (this.isPunct(':')) { this.adv(); this.skipType(); }
      this.skipNl();
      var init = null;
      if (this.isOp('=')) { this.adv(); init = this.parseExpr(1); }
      return { type: 'Let', name: name, init: init, mutable: isMut, line: t.line, col: t.col };
    },

    parseStmt: function () {
      this.skipNl();
      var t = this.cur();
      if (t.k === 'eof') return null;
      if (this.isPunct('{')) return this.parseBlock();
      if (this.isKw('let') || this.isKw('var')) return this.parseLet();
      if (this.flow && this.isPunct('\\')) return this.parseFlowFn();
      if (this.flow && this.isPunct('?')) return this.parseFlowIf();
      if (this.flow && this.isOp('^')) {
        this.adv();
        var rv0 = null;
        if (this.canStartExpr() && !this.isPunct(';') && !this.isPunct('}')) rv0 = this.parseExpr(1);
        return { type: 'Return', value: rv0, line: t.line, col: t.col };
      }
      if (this.isKw('if')) return this.parseIf();
      if (this.isKw('while')) {
        this.adv();
        var w = { type: 'While', cond: this.parseExpr(1), body: this.parseBody('while'), line: t.line, col: t.col };
        return w;
      }
      if (this.isKw('loop')) {
        this.adv();
        return { type: 'Loop', body: this.parseBody('loop'), line: t.line, col: t.col };
      }
      if (this.isKw('for')) {
        this.adv();
        this.skipNl();
        var p = this.cur();
        if (p.k !== 'ident') this.fail('for 循环只支持 `for 名字 in ...`');
        var name = p.v; this.adv();
        this.skipNl();
        if (!this.isKw('in')) this.fail('for 需要 `in`');
        this.adv();
        var iter = this.parseExpr(1);
        return { type: 'For', name: name, iter: iter, body: this.parseBody('for'), line: t.line, col: t.col };
      }
      if (this.isKw('break')) {
        this.adv();
        var bv = null;
        if (!this.isPunct('}') && !this.isPunct(';') && this.cur().k !== 'nl' && this.cur().k !== 'eof') bv = this.parseExpr(1);
        return { type: 'Break', value: bv, line: t.line, col: t.col };
      }
      if (this.isKw('continue')) {
        this.adv();
        return { type: 'Continue', line: t.line, col: t.col };
      }
      if (this.isKw('return')) {
        this.adv();
        var rv = null;
        if (!this.isPunct('}') && !this.isPunct(';') && this.cur().k !== 'nl' && this.cur().k !== 'eof') rv = this.parseExpr(1);
        return { type: 'Return', value: rv, line: t.line, col: t.col };
      }
      this.rejectUnsupported();
      var left = this.parseExpr(1);
      if (this.isOp('=')) {
        this.adv();
        var right = this.parseExpr(1);
        if (left.type !== 'Var' && left.type !== 'Index') this.fail('赋值目标只能是变量或下标', t);
        return { type: 'Assign', target: left, value: right, line: t.line, col: t.col };
      }
      var cop = this.cur().k === 'op' ? COMPOUND[this.cur().text] : null;
      if (cop) {
        this.adv();
        var cright = this.parseExpr(1);
        if (left.type !== 'Var' && left.type !== 'Index') this.fail('复合赋值目标只能是变量或下标', t);
        return { type: 'Assign', target: left, value: cright, op: cop, line: t.line, col: t.col };
      }
      return { type: 'ExprStmt', expr: left, line: left.line, col: left.col };
    },

    parseIf: function () {
      var t = this.cur(); this.adv();
      var cond = this.parseExpr(1);
      var thenBlock = this.parseBody('if');
      var elseNode = null;
      this.skipNl();
      if (this.isKw('else')) {
        this.adv(); this.skipNl();
        if (this.isKw('if')) elseNode = this.parseIf();
        else if (this.isPunct('{')) elseNode = this.parseBlock();
        else if (this.flow && this.cur().bol) elseNode = this.parseFlowBlock();
        else elseNode = this.parseSingleStmtBlock('else');
        this.skipNl();
      }
      return { type: 'If', cond: cond, then: thenBlock, else: elseNode, line: t.line, col: t.col };
    },

    /* ---------------- Flow（0.1c 结构性精简写法） ---------------- */
    canStartExpr: function () {
      var t = this.cur();
      if (t.k === 'nl' || t.k === 'eof') return false;
      if (t.k === 'int' || t.k === 'float' || t.k === 'str' || t.k === 'bytes' || t.k === 'fstr' || t.k === 'ident') return true;
      if (t.k === 'punct') return t.text === '(' || t.text === '[' || t.text === '{' || t.text === '?';
      if (t.k === 'kw') return t.text === 'if' || t.text === 'loop';
      if (t.k === 'op') return t.text === '-' || t.text === '!' || t.text === '~' || t.text === '^';
      return false;
    },

    /* 并置调用的“原子”必须与上一个记号空白分隔、且同一行 */
    atomStarter: function () {
      var t = this.cur();
      if (t.bol || !t.sp || t.k === 'nl' || t.k === 'eof') return false;
      if (t.k === 'int' || t.k === 'float' || t.k === 'str' || t.k === 'bytes' || t.k === 'fstr' || t.k === 'ident') return true;
      if (t.k === 'punct') return t.text === '(' || t.text === '[';
      if (t.k === 'kw') return t.text === 'if' || t.text === 'loop';
      if (t.k === 'op') {
        if (t.text !== '-' && t.text !== '!' && t.text !== '~') return false;
        var nx = this.peek(1);
        if (nx.sp || nx.k === 'nl' || nx.k === 'eof') return false;
        return nx.k === 'ident' || nx.k === 'int' || nx.k === 'float' || nx.k === 'str' || nx.k === 'fstr' ||
               (nx.k === 'punct' && (nx.text === '(' || nx.text === '['));
      }
      return false;
    },

    parseFlowFn: function () {
      var t = this.cur(); this.adv(); /* '\\' */
      var name = this.expectIdent('函数名');
      var params = [];
      for (;;) {
        var p = this.cur();
        if (p.k !== 'ident') break;
        var pname = p.v; this.adv();
        /* 紧贴的类型标注 `a:i32`；`:` 后有空格视为语句体分隔符 */
        if (this.isPunct(':') && this.peek(1).k !== 'nl' && !this.peek(1).sp) {
          this.adv();
          this.consumeFlowType();
        }
        params.push({ name: pname, def: null });
      }
      var node = { type: 'Fn', name: name, params: params, body: null, line: t.line, col: t.col };
      if (this.isKw('->')) {
        this.adv();
        this.skipFlowType();
      }
      if (this.isOp('=')) {
        this.adv();
        var expr = this.parseExpr(1);
        node.body = { type: 'Block', stmts: [{ type: 'ExprStmt', expr: expr, line: expr.line, col: expr.col }],
                      line: expr.line, col: expr.col };
      } else if (this.isPunct(':')) {
        this.adv(); this.skipNl();
        var st = this.parseStmt();
        node.body = { type: 'Block', stmts: st ? [st] : [], line: st ? st.line : 0, col: st ? st.col : 0 };
      } else if (this.isPunct('{')) {
        node.body = this.parseBlock();
      } else {
        node.body = this.parseFlowBlock();
      }
      return node;
    },

    consumeFlowType: function () {
      if (this.isPunct('[') || this.isPunct('(')) { this.skipBalanced(); return; }
      if (this.cur().k === 'ident') this.adv();
      else this.fail('期望类型名，得到 ' + this.cur().text);
      while (this.isOp('.') && this.peek(1).k === 'ident') { this.adv(); this.adv(); }
      while (this.isPunct('[')) this.skipBalanced();
    },

    skipBalanced: function () {
      var open = this.cur().text;
      var close = open === '[' ? ']' : ')';
      var depth = 0;
      for (;;) {
        var a = this.cur();
        if (a.k === 'eof' || a.k === 'nl') this.fail('类型注解未闭合');
        if (a.k === 'punct' && a.text === open) depth++;
        else if (a.k === 'punct' && a.text === close) {
          depth--; this.adv();
          if (depth === 0) return;
          continue;
        }
        this.adv();
      }
    },

    skipFlowType: function () {
      for (;;) {
        var a = this.cur();
        if (a.k === 'nl' || a.k === 'eof') return;
        if (a.k === 'punct' && (a.text === ':' || a.text === ';' || a.text === '{')) return;
        if (a.k === 'op' && a.text === '=') return;
        this.adv();
      }
    },

    parseFlowBlock: function () {
      this.skipNl();
      var t = this.cur();
      var block = { type: 'Block', stmts: [], line: t.line, col: t.col };
      for (;;) {
        this.skipNl();
        while (this.isPunct(';')) { this.adv(); this.skipNl(); }
        var c = this.cur();
        if (c.k === 'eof') this.fail("块未闭合（缺少单独一行的 '.'）", t);
        if (c.k === 'op' && c.text === '.' && c.bol) { this.adv(); break; }
        if (c.k === 'kw' && c.text === 'else') break;   /* else 属于外层 if */
        var stmt = this.parseStmt();
        if (stmt) block.stmts.push(stmt);
      }
      return block;
    },

    parseFlowIf: function () {
      var t = this.cur(); this.adv(); /* '?' */
      var cond = this.parseExpr(1);
      var thenB;
      if (this.isPunct(':')) {
        this.adv();
        thenB = this.parseSingleStmtBlock('?');
      } else if (this.isPunct('{')) {
        thenB = this.parseBlock();
      } else {
        thenB = this.parseFlowBlock();
      }
      var elseN = null;
      this.skipNl();
      var sep = false;
      if (this.isPunct(';')) { this.adv(); sep = true; this.skipNl(); }
      if (this.isKw('else')) {
        this.adv(); this.skipNl();
        elseN = this.parseFlowElse(true);
      } else if (sep && this.canStartExpr()) {
        elseN = this.parseFlowElse(false);
      }
      return { type: 'If', cond: cond, then: thenB, else: elseN, line: t.line, col: t.col };
    },

    parseFlowElse: function (viaElse) {
      if (this.isPunct('?')) return this.parseFlowIf();
      if (this.isPunct('{')) return this.parseBlock();
      /* `else` 独占一行时，后接以单独 `.` 结束的多语句块（内层先结束） */
      if (viaElse && this.cur().bol) return this.parseFlowBlock();
      return this.parseSingleStmtBlock('else');
    },


    parseExpr: function (minPrec) {
      var left = this.parseApply();
      for (;;) {
        var t = this.cur();
        /* Flow：换行即语句边界，二元运算符不可从下一行续接 */
        if (this.flow && t.bol) break;
        var op = null;
        if (t.k === 'op') op = t.text;
        else if (t.k === 'kw' && t.text === '|>') op = t.text;
        if (!op) break;
        var pr = PREC[op] || 0;
        if (!pr || pr < minPrec) break;
        this.adv();
        var right = this.parseExpr(pr + 1);
        if (op === '..') left = { type: 'Range', lo: left, hi: right, line: t.line, col: t.col };
        else left = { type: 'Binary', op: op, left: left, right: right, line: t.line, col: t.col };
      }
      return left;
    },

    /* Flow：并置调用（同一层连续原子收集为多实参） */
    parseApply: function () {
      var e = this.parseUnary();
      if (!this.flow || this.noApply) return e;
      var args = [];
      while (this.atomStarter()) args.push(this.parseUnary());
      if (!args.length) return e;
      return { type: 'Call', callee: e, args: args, line: e.line, col: e.col };
    },

    /* 数组字面量 / 显式调用实参 / 映射键值：空白分隔的是多个元素，不是并置调用 */
    parseNoApply: function (fn) {
      this.noApply++;
      try { return fn.call(this); }
      finally { this.noApply--; }
    },

    parseUnary: function () {
      this.skipNl();
      var t = this.cur();
      if (t.k === 'op' && ['-', '!', '~', '&', '*'].indexOf(t.text) >= 0) {
        this.adv();
        return { type: 'Unary', op: t.text, expr: this.parseUnary(), line: t.line, col: t.col };
      }
      return this.parsePostfix();
    },

    parsePostfix: function () {
      var e = this.parsePrimary();
      for (;;) {
        this.skipNl();
        if (this.isPunct('(')) {
          var t = this.cur();
          if (this.flow && (t.sp || t.bol)) break; /* Flow：`f (a)` 交给并置调用 */
          this.adv();
          var args = [];
          this.skipNl();
          if (!this.isPunct(')')) {
            for (;;) {
              this.skipNl();
              args.push(this.parseNoApply(function () { return this.parseExpr(1); }));
              this.skipNl();
              if (this.isPunct(',')) { this.adv(); continue; }
              /* Flow：显式括号内也允许空白分隔实参（`add(2 3)`） */
              if (this.flow && !this.isPunct(')') && !this.cur().bol && this.canStartExpr()) continue;
              break;
            }
          }
          this.expectPunct(')', '调用参数表');
          e = { type: 'Call', callee: e, args: args, line: t.line, col: t.col };
          continue;
        }
        if (this.isPunct('[')) {
          var ti = this.cur();
          if (this.flow && (ti.sp || ti.bol)) break; /* Flow：`xs [0]` 视为并置实参 */
          this.adv();
          var idx = this.parseExpr(1);
          this.expectPunct(']', '下标');
          e = { type: 'Index', obj: e, index: idx, line: ti.line, col: ti.col };
          continue;
        }
        break;
      }
      return e;
    },

    parsePrimary: function () {
      this.skipNl();
      var t = this.cur();
      if (t.k === 'int' || t.k === 'float' || t.k === 'str' || t.k === 'bytes') {
        this.adv();
        return { type: 'Lit', kind: t.k, value: t.v, line: t.line, col: t.col };
      }
      if (t.k === 'fstr') {
        this.adv();
        var self = this;
        var fparts = t.v.map(function (p) {
          if (p.e === undefined) return { str: p.s };
          var sub = new Parser(tokenize(p.e, self.flow), false, self.flow);
          try {
            var ex = sub.parseExpr(1);
            if (sub.cur().k !== 'eof') sub.fail('f-string 插值存在多余内容');
            return { expr: ex };
          } catch (err) {
            if (err instanceof DsError) err.line += (p.line || 1) - 1;
            throw err;
          }
        });
        return { type: 'FStr', parts: fparts, line: t.line, col: t.col };
      }
      if (t.k === 'ident') {
        var name = t.v; this.adv();
        if (name === 'true' || name === 'false') {
          return { type: 'Lit', kind: 'bool', value: name === 'true', line: t.line, col: t.col };
        }
        while (this.isOp('.') && this.peek(1).k === 'ident') {
          this.adv();
          name += '.' + this.cur().v;
          this.adv();
        }
        return { type: 'Var', name: name, line: t.line, col: t.col };
      }
      if (t.k === 'punct') {
        if (t.text === '(') { this.adv(); var e = this.parseExpr(1); this.expectPunct(')', '括号'); return e; }
        if (t.text === '[') return this.parseArray();
        if (t.text === '{') return this.parseBrace();
        if (this.flow && t.text === '?') return this.parseFlowIf();
      }
      if (t.k === 'kw') {
        if (t.text === 'if') return this.parseIf();
        if (t.text === 'loop') {
          this.adv();
          return { type: 'LoopExpr', body: this.parseBody('loop'), line: t.line, col: t.col };
        }
      }
      this.rejectUnsupported();
      this.fail("无法解析的表达式 '" + t.text + "'", t);
    },

    parseArray: function () {
      var t = this.cur(); this.adv();
      var arr = { type: 'Array', items: [], line: t.line, col: t.col };
      for (;;) {
        this.skipNl();
        while (this.isPunct(',')) { this.adv(); this.skipNl(); }
        if (this.isPunct(']')) { this.adv(); break; }
        if (this.cur().k === 'eof') this.fail('数组字面量未闭合', t);
        arr.items.push(this.parseNoApply(function () { return this.parseExpr(1); }));
        this.skipNl();
        if (this.isPunct(',')) this.adv();
      }
      return arr;
    },

    parseBrace: function () {
      var t = this.cur();
      var after = this.peek(1), after2 = this.peek(2);
      if (after.k === 'punct' && after.text === '}') {
        this.adv(); this.adv();
        return { type: 'BlockExpr', block: { type: 'Block', stmts: [] }, line: t.line, col: t.col };
      }
      if (after.k === 'punct' && after.text === ':' && after2.k === 'punct' && after2.text === '}') {
        this.adv(); this.adv(); this.expectPunct('}', '空映射');
        return { type: 'Map', keys: [], vals: [], line: t.line, col: t.col };
      }
      var keyKinds = ['ident', 'str', 'int', 'float'];
      if (keyKinds.indexOf(after.k) >= 0 && after2.k === 'punct' && after2.text === ':') {
        this.adv();
        var map = { type: 'Map', keys: [], vals: [], line: t.line, col: t.col };
        for (;;) {
          this.skipNl();
          while (this.isPunct(',')) { this.adv(); this.skipNl(); }
          if (this.isPunct('}')) { this.adv(); break; }
          var key = this.parseNoApply(function () { return this.parseExpr(1); });
          this.skipNl();
          this.expectPunct(':', '映射键值对');
          var val = this.parseNoApply(function () { return this.parseExpr(1); });
          map.keys.push(key); map.vals.push(val);
          this.skipNl();
          if (this.isPunct(',')) this.adv();
        }
        return map;
      }
      this.adv();
      var body = { type: 'Block', stmts: [] };
      for (;;) {
        this.skipNl();
        while (this.isPunct(';')) { this.adv(); this.skipNl(); }
        if (this.isPunct('}')) { this.adv(); break; }
        if (this.cur().k === 'eof') this.fail('块表达式未闭合', t);
        var stmt = this.parseStmt();
        if (stmt) body.stmts.push(stmt);
      }
      return { type: 'BlockExpr', block: body, line: t.line, col: t.col };
    }
  };

  var PREC = { '|>': 1, '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7,
               '<': 8, '>': 8, '<=': 8, '>=': 8, '<<': 9, '>>': 9, '+': 10, '-': 10,
               '*': 11, '/': 11, '%': 11, '..': 8 };
  var COMPOUND = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%',
                   '&=': '&', '|=': '|', '^=': '^', '<<=': '<<', '>>=': '>>' };
  var CMP = new Set(['<', '>', '<=', '>=']);
  var BIT = new Set(['&', '|', '^', '<<', '>>']);

  /* ============================ 运行时 ============================ */
  function valueOf(v) {
    switch (v.k) {
      case 'unit': return 'unit';
      case 'bool': return v.v ? 'true' : 'false';
      case 'int': return String(v.v);
      case 'float': return Number.isInteger(v.v) ? v.v.toFixed(1) : String(v.v);
      case 'str': return v.v;
      case 'bytes': return v.v.map(function (b) { return b >= 32 && b < 127 ? String.fromCharCode(b) : '\\x' + b.toString(16).padStart(2, '0'); }).join('');
      case 'arr': return '[' + v.v.map(valueOf).join(' ') + ']';
      case 'map': {
        var parts = [];
        for (var i = 0; i < v.v.length; i++) parts.push(valueOf(v.v[i][0]) + ': ' + valueOf(v.v[i][1]));
        return '{' + parts.join(', ') + '}';
      }
      case 'func': return '<fn ' + (v.name || 'anonymous') + '>';
      case 'native': return '<native fn ' + v.name + '>';
      default: return String(v.v);
    }
  }
  function vUnit() { return { k: 'unit' }; }
  function vBool(b) { return { k: 'bool', v: !!b }; }
  function vInt(n) { return { k: 'int', v: Math.trunc(n) }; }
  function vFloat(n) { return { k: 'float', v: n }; }
  function vStr(s) { return { k: 'str', v: s }; }
  function vBytes(a) { return { k: 'bytes', v: a }; }
  function vArr(a) { return { k: 'arr', v: a }; }
  function vMap(pairs) { return { k: 'map', v: pairs }; }
  function rangeValue(lo, hi) {
    var arr = [];
    for (var i = lo; i < hi; i++) arr.push(vInt(i));
    return vArr(arr);
  }

  function valueEqual(a, b) {
    if (a.k !== b.k) return false;
    switch (a.k) {
      case 'unit': return true;
      case 'bool': return a.v === b.v;
      case 'int': return a.v === b.v;
      case 'float': return a.v === b.v;
      case 'str': return a.v === b.v;
      case 'bytes': return a.v.length === b.v.length && a.v.every(function (x, i) { return x === b.v[i]; });
      case 'arr': return a.v.length === b.v.length && a.v.every(function (x, i) { return valueEqual(x, b.v[i]); });
      case 'map':
        if (a.v.length !== b.v.length) return false;
        return a.v.every(function (pair) {
          for (var i = 0; i < b.v.length; i++) if (valueEqual(pair[0], b.v[i][0])) return valueEqual(pair[1], b.v[i][1]);
          return false;
        });
      default: return a === b;
    }
  }

  function Env(parent) { this.vars = new Map(); this.parent = parent || null; }
  Env.prototype.get = function (name, line, col) {
    for (var e = this; e; e = e.parent) if (e.vars.has(name)) return e.vars.get(name).v;
    throw new DsError('未定义的名字 `' + name + '`', line, col);
  };
  Env.prototype.has = function (name) {
    for (var e = this; e; e = e.parent) if (e.vars.has(name)) return true;
    return false;
  };
  Env.prototype.define = function (name, val, mutable) { this.vars.set(name, { v: val, mutable: !!mutable }); };
  Env.prototype.assign = function (name, val, line, col) {
    for (var e = this; e; e = e.parent) {
      if (e.vars.has(name)) {
        var slot = e.vars.get(name);
        if (!slot.mutable) throw new DsError('`' + name + '` 不可变，不能赋值（用 var 声明）', line, col);
        slot.v = val;
        return;
      }
    }
    throw new DsError('未定义的名字 `' + name + '`', line, col);
  };

  function BreakSignal(v) { this.value = v; }
  function ContinueSignal() { }
  function ReturnSignal(v) { this.value = v; }

  /* ============================ 解释器 ============================ */
  function Interpreter(opts) {
    opts = opts || {};
    this.out = [];
    this.outSize = 0;
    this.steps = 0;
    this.flow = !!opts.flow;
    this.maxSteps = opts.maxSteps || MAX_STEPS;
    this.global = new Env(null);
    this.installBuiltins();
  }
  Interpreter.prototype = {
    emit: function (kind, text) {
      if (this.outSize > MAX_OUTPUT) return;
      this.out.push({ t: kind, s: text });
      this.outSize += text.length;
    },
    tick: function (line, col) {
      if (++this.steps > this.maxSteps) throw new DsError('执行步数超过上限（可能是死循环）', line, col);
    },

    installBuiltins: function () {
      var self = this;
      function native(name, fn) { return { k: 'native', name: name, fn: fn }; }
      function num(v, line, col, what) {
        if (v.k === 'int') return v.v;
        if (v.k === 'float') return v.v;
        throw new DsError(what + ' 需要数值', line, col);
      }
      function define(name, fn) { self.global.define(name, native(name, fn), false); }
      define('println', function (args) {
        var text = args.map(valueOf).join(' ');
        self.emit('out', text + '\n');
        return vUnit();
      });
      define('print', function (args) { self.emit('out', args.map(valueOf).join('')); return vUnit(); });
      define('len', function (args, line, col) {
        if (args.length !== 1) throw new DsError('len 需要 1 个参数', line, col);
        var v = args[0];
        if (v.k === 'arr' || v.k === 'str' || v.k === 'bytes') return vInt(v.v.length);
        if (v.k === 'map') return vInt(v.v.length);
        throw new DsError('len 不支持 ' + valueOf(v), line, col);
      });
      define('range', function (args, line, col) {
        if (args.length < 1 || args.length > 2) throw new DsError('range 需要 1~2 个参数', line, col);
        var lo = args.length === 2 ? num(args[0], line, col, 'range') : 0;
        var hi = args.length === 2 ? num(args[1], line, col, 'range') : num(args[0], line, col, 'range');
        var arr = [];
        for (var i = lo; i < hi; i++) arr.push(vInt(i));
        return vArr(arr);
      });
      define('str', function (args) { return vStr(valueOf(args[0])); });
      define('concat', function (args, line, col) {
        if (args.length !== 2) throw new DsError('concat 需要 2 个参数', line, col);
        var a = args[0], b = args[1];
        if (a.k === 'str' && b.k === 'str') return vStr(a.v + b.v);
        if (a.k === 'arr' && b.k === 'arr') return vArr(a.v.concat(b.v));
        throw new DsError('concat 需要两个 str 或两个数组', line, col);
      });
      define('format', function (args) {
        if (!args.length) return vStr('');
        if (args[0].k === 'str' && args.length > 1) {
          var tpl = args[0].v, ai = 1;
          return vStr(tpl.replace(/\{\}/g, function () { return ai < args.length ? valueOf(args[ai++]) : '{}'; }));
        }
        return vStr(args.map(valueOf).join(''));
      });
      ['sqrt', 'round', 'floor', 'ceil'].forEach(function (fn) {
        define('math.' + fn, function (args, line, col) {
          if (args.length !== 1) throw new DsError('math.' + fn + ' 需要 1 个参数', line, col);
          return vFloat(Math[fn](num(args[0], line, col, 'math.' + fn)));
        });
      });
      define('math.abs', function (args, line, col) {
        var v = args[0];
        if (v.k === 'int') return vInt(Math.abs(v.v));
        return vFloat(Math.abs(num(v, line, col, 'math.abs')));
      });
      define('math.pow', function (args, line, col) {
        return vFloat(Math.pow(num(args[0], line, col, 'math.pow'), num(args[1], line, col, 'math.pow')));
      });
      define('abs', function (args, line, col) {
        var v = args[0];
        if (v.k === 'int') return vInt(Math.abs(v.v));
        return vFloat(Math.abs(num(v, line, col, 'abs')));
      });
      define('pow', function (args, line, col) {
        return vFloat(Math.pow(num(args[0], line, col, 'pow'), num(args[1], line, col, 'pow')));
      });
      /* 短别名：与 Python 参考实现一致，所有写法都可用 */
      var alias = { p: 'println', s: 'str', l: 'len', r: 'range' };
      for (var ak in alias) {
        if (Object.prototype.hasOwnProperty.call(alias, ak)) {
          self.global.define(ak, self.global.vars.get(alias[ak]).v, false);
        }
      }
    },

    run: function (src) {
      var toks = tokenize(src, this.flow);
      var prog = new Parser(toks, false, this.flow).parseProgram();
      try {
        this.execProgram(prog);
        if (!prog.hasTopStmt) {
          var main = this.global.vars.get('main');
          if (main) this.callValue(main.v, [], 0, 0);
        }
      } catch (e) {
        if (e instanceof ReturnSignal) throw new DsError('`return` / `^` 只能出现在函数体内');
        if (e instanceof BreakSignal) throw new DsError('`break` 只能出现在循环体内');
        if (e instanceof ContinueSignal) throw new DsError('`continue` 只能出现在循环体内');
        throw e;
      }
      return this.out;
    },

    execProgram: function (prog) {
      var i, item;
      /* 0.1c：函数声明先注册（可前向引用），再由顶层语句按顺序执行 */
      for (i = 0; i < prog.items.length; i++) {
        item = prog.items[i];
        if (item.type === 'Fn') this.execStmt(this.global, item);
      }
      for (i = 0; i < prog.items.length; i++) {
        this.execStmt(this.global, prog.items[i]);
      }
    },

    returnSignalValue: null,

    execStmt: function (env, node) {
      if (!node) return vUnit();
      this.tick(node.line, node.col);
      switch (node.type) {
        case 'Fn':
          env.define(node.name, { k: 'func', name: node.name, params: node.params, body: node.body, env: env }, false);
          return vUnit();
        case 'Let': {
          var val = node.init ? this.evalExpr(env, node.init) : vUnit();
          env.define(node.name, val, node.mutable);
          return vUnit();
        }
        case 'Assign': {
          var value = this.evalExpr(env, node.value);
          if (node.target.type === 'Var') {
            var tname = node.target.name;
            if (tname === '_') return value;
            if (node.op) {
              var cur = env.get(tname, node.line, node.col);
              value = this.binop(node.op, cur, value, node.line, node.col);
            } else if (!env.has(tname)) {
              /* 0.1c：首次赋值定义不可变绑定（可变请用 var） */
              env.define(tname, value, false);
              return value;
            }
            env.assign(tname, value, node.line, node.col);
          } else {
            var obj = this.evalExpr(env, node.target.obj);
            var idx = this.evalExpr(env, node.target.index);
            if (obj.k === 'arr') {
              var ai = this.indexValue(obj, idx, node.line, node.col);
              if (node.op) value = this.binop(node.op, obj.v[ai], value, node.line, node.col);
              obj.v[ai] = value;
            } else if (obj.k === 'map') {
              if (node.op) {
                var cur2 = this.mapGet(obj, idx, node.line, node.col);
                value = this.binop(node.op, cur2, value, node.line, node.col);
              }
              this.mapSet(obj, idx, value);
            } else throw new DsError('不可下标赋值', node.line, node.col);
          }
          return vUnit();
        }
        case 'ExprStmt':
          return this.evalExpr(env, node.expr);
        case 'If': {
          var cond = this.requireBool(this.evalExpr(env, node.cond), node.line, node.col, 'if 条件');
          var last = vUnit();
          if (cond) last = this.execBlock(env, node.then);
          else if (node.else) {
            last = node.else.type === 'If' ? this.execStmt(env, node.else) : this.execBlock(env, node.else);
          }
          return last;
        }
        case 'Block':
          return this.execBlock(env, node);
        case 'While': {
          for (;;) {
            this.tick(node.line, node.col);
            var c = this.requireBool(this.evalExpr(env, node.cond), node.line, node.col, 'while 条件');
            if (!c) break;
            try { this.execBlock(env, node.body); }
            catch (e) {
              if (e instanceof BreakSignal) break;
              if (e instanceof ContinueSignal) continue;
              throw e;
            }
          }
          return vUnit();
        }
        case 'Loop': {
          for (;;) {
            this.tick(node.line, node.col);
            try { this.execBlock(env, node.body); }
            catch (e) {
              if (e instanceof BreakSignal) return vUnit();
              if (e instanceof ContinueSignal) continue;
              throw e;
            }
          }
        }
        case 'For': {
          var it = this.evalExpr(env, node.iter);
          var seq = [];
          if (it.k === 'arr') seq = it.v;
          else if (it.k === 'str') seq = Array.from(it.v).map(vStr);
          else if (it.k === 'bytes') seq = it.v.map(function (b) { return vInt(b); });
          else if (it.k === 'map') seq = it.v.map(function (p) { return p[0]; });
          else throw new DsError('值不可迭代：' + valueOf(it), node.line, node.col);
          for (var i = 0; i < seq.length; i++) {
            this.tick(node.line, node.col);
            var iterEnv = new Env(env);
            if (node.name !== '_') iterEnv.define(node.name, seq[i], false);
            try { this.execBlock(iterEnv, node.body); }
            catch (e) {
              if (e instanceof BreakSignal) break;
              if (e instanceof ContinueSignal) continue;
              throw e;
            }
          }
          return vUnit();
        }
        case 'Break': throw new BreakSignal(node.value ? this.evalExpr(env, node.value) : vUnit());
        case 'Continue': throw new ContinueSignal();
        case 'Return': throw new ReturnSignal(node.value ? this.evalExpr(env, node.value) : vUnit());
        default:
          return this.evalExpr(env, node);
      }
    },

    execBlock: function (parent, block) {
      var env = new Env(parent);
      var last = vUnit();
      for (var i = 0; i < block.stmts.length; i++) last = this.execStmt(env, block.stmts[i]);
      return last;
    },

    evalExpr: function (env, node) {
      this.tick(node.line, node.col);
      switch (node.type) {
        case 'Lit':
          if (node.kind === 'int') return vInt(node.value);
          if (node.kind === 'float') return vFloat(node.value);
          if (node.kind === 'str') return vStr(node.value);
          if (node.kind === 'bytes') return vBytes(node.value);
          return vBool(node.value);
        case 'Var': return env.get(node.name, node.line, node.col);
        case 'Array': return vArr(node.items.map(function (x) { return this.evalExpr(env, x); }, this));
        case 'Map': {
          var pairs = [];
          for (var i = 0; i < node.keys.length; i++) pairs.push([this.evalExpr(env, node.keys[i]), this.evalExpr(env, node.vals[i])]);
          return vMap(pairs);
        }
        case 'BlockExpr': return this.execBlock(env, node.block);
        case 'If': return this.execStmt(env, node);
        case 'FStr': {
          var fout = '';
          for (var pi = 0; pi < node.parts.length; pi++) {
            var pt = node.parts[pi];
            fout += pt.str !== undefined ? pt.str : valueOf(this.evalExpr(env, pt.expr));
          }
          return vStr(fout);
        }
        case 'Range': {
          var lo = this.evalExpr(env, node.lo);
          var hi = this.evalExpr(env, node.hi);
          if ((lo.k !== 'int' && lo.k !== 'float') || (hi.k !== 'int' && hi.k !== 'float')) {
            throw new DsError('范围 `..` 需要数值端点', node.line, node.col);
          }
          return rangeValue(lo.v, hi.v);
        }
        case 'LoopExpr': {
          for (;;) {
            this.tick(node.line, node.col);
            try { this.execBlock(env, node.body); }
            catch (e) {
              if (e instanceof BreakSignal) return e.value;
              if (e instanceof ContinueSignal) continue;
              throw e;
            }
          }
        }
        case 'Unary': {
          if (node.op === '&' || node.op === '*') throw new DsError('当前版本不支持指针/解引用', node.line, node.col);
          var u = this.evalExpr(env, node.expr);
          if (node.op === '-') {
            if (u.k === 'int') return vInt(-u.v);
            if (u.k === 'float') return vFloat(-u.v);
            throw new DsError('一元 `-` 需要数值', node.line, node.col);
          }
          if (node.op === '!') return vBool(!this.requireBool(u, node.line, node.col, '`!`'));
          if (node.op === '~') { if (u.k !== 'int') throw new DsError('`~` 需要整数', node.line, node.col); return vInt(~u.v); }
          throw new DsError('未知一元运算符 ' + node.op, node.line, node.col);
        }
        case 'Binary': return this.evalBinary(env, node);
        case 'Call': {
          var callee = this.evalExpr(env, node.callee);
          var args = node.args.map(function (a) { return this.evalExpr(env, a); }, this);
          return this.callValue(callee, args, node.line, node.col);
        }
        case 'Index': {
          var obj = this.evalExpr(env, node.obj);
          var idx = this.evalExpr(env, node.index);
          if (obj.k === 'arr') return obj.v[this.indexValue(obj, idx, node.line, node.col)];
          if (obj.k === 'str') {
            var chars = Array.from(obj.v);
            var ci = this.indexValue02(chars, idx, node.line, node.col);
            return vStr(chars[ci]);
          }
          if (obj.k === 'bytes') return vInt(obj.v[this.indexValue02(obj.v, idx, node.line, node.col)]);
          if (obj.k === 'map') return this.mapGet(obj, idx, node.line, node.col);
          throw new DsError('值不可索引：' + valueOf(obj), node.line, node.col);
        }
        default: throw new DsError('无法求值的节点 ' + node.type, node.line, node.col);
      }
    },

    indexValue: function (arr, idx, line, col) { return this.indexValue02(arr.v, idx, line, col); },
    indexValue02: function (list, idx, line, col) {
      if (idx.k !== 'int') throw new DsError('下标需要整数', line, col);
      var i = idx.v;
      if (i < 0) i += list.length;
      if (i < 0 || i >= list.length) throw new DsError('下标越界：' + idx.v, line, col);
      return i;
    },

    mapGet: function (map, key, line, col) {
      for (var i = 0; i < map.v.length; i++) if (valueEqual(map.v[i][0], key)) return map.v[i][1];
      throw new DsError('映射中没有键 ' + valueOf(key), line, col);
    },
    mapSet: function (map, key, val) {
      for (var i = 0; i < map.v.length; i++) if (valueEqual(map.v[i][0], key)) { map.v[i][1] = val; return; }
      map.v.push([key, val]);
    },

    requireBool: function (v, line, col, what) {
      if (v.k !== 'bool') throw new DsError(what + ' 需要 bool，实际是 ' + valueOf(v), line, col);
      return v.v;
    },

    evalBinary: function (env, node) {
      var op = node.op;
      if (op === '&&') {
        var l = this.requireBool(this.evalExpr(env, node.left), node.line, node.col, '`&&`');
        if (!l) return vBool(false);
        return vBool(this.requireBool(this.evalExpr(env, node.right), node.line, node.col, '`&&`'));
      }
      if (op === '||') {
        var l2 = this.requireBool(this.evalExpr(env, node.left), node.line, node.col, '`||`');
        if (l2) return vBool(true);
        return vBool(this.requireBool(this.evalExpr(env, node.right), node.line, node.col, '`||`'));
      }
      if (op === '|>') {
        var left = this.evalExpr(env, node.left);
        if (node.right.type === 'Call') {
          var callee = this.evalExpr(env, node.right.callee);
          var args = node.right.args.map(function (a) { return this.evalExpr(env, a); }, this);
          return this.callValue(callee, [left].concat(args), node.line, node.col);
        }
        return this.callValue(this.evalExpr(env, node.right), [left], node.line, node.col);
      }
      var a = this.evalExpr(env, node.left);
      var b = this.evalExpr(env, node.right);
      return this.binop(op, a, b, node.line, node.col);
    },

    binop: function (op, a, b, line, col) {
      if (op === '==') return vBool(valueEqual(a, b));
      if (op === '!=') return vBool(!valueEqual(a, b));
      if (op === '+' && a.k === 'str' && b.k === 'str') return vStr(a.v + b.v);
      if (op === '+' && a.k === 'arr' && b.k === 'arr') return vArr(a.v.concat(b.v));
      if ((op === '+' || op === '-' || op === '*' || op === '/' || op === '%') && a.k === 'int' && b.k === 'int') {
        if ((op === '/' || op === '%') && b.v === 0) throw new DsError('除数为 0', line, col);
        if (op === '+') return vInt(a.v + b.v);
        if (op === '-') return vInt(a.v - b.v);
        if (op === '*') return vInt(a.v * b.v);
        if (op === '/') return vInt(a.v / b.v < 0 ? Math.ceil(a.v / b.v) : Math.floor(a.v / b.v));
        return vInt(a.v % b.v);
      }
      if ((op === '+' || op === '-' || op === '*' || op === '/' || op === '%') && a.k === 'float' && b.k === 'float') {
        if ((op === '/' || op === '%') && b.v === 0) throw new DsError('除数为 0', line, col);
        if (op === '+') return vFloat(a.v + b.v);
        if (op === '-') return vFloat(a.v - b.v);
        if (op === '*') return vFloat(a.v * b.v);
        if (op === '/') return vFloat(a.v / b.v);
        return vFloat(a.v % b.v);
      }
      if (BIT.has(op)) {
        if (a.k !== 'int' || b.k !== 'int') throw new DsError('位运算需要两个整数', line, col);
        if ((op === '<<' || op === '>>') && (b.v < 0 || b.v >= 64)) throw new DsError('移位量越界', line, col);
        if (op === '&') return vInt(a.v & b.v);
        if (op === '|') return vInt(a.v | b.v);
        if (op === '^') return vInt(a.v ^ b.v);
        if (op === '<<') return vInt(a.v << b.v);
        return vInt(a.v >> b.v);
      }
      if (CMP.has(op)) {
        var cmp;
        if (a.k === 'int' && b.k === 'int') cmp = a.v - b.v;
        else if (a.k === 'float' && b.k === 'float') cmp = a.v - b.v;
        else if (a.k === 'str' && b.k === 'str') cmp = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
        else throw new DsError('不可比较：' + valueOf(a) + ' 与 ' + valueOf(b), line, col);
        if (op === '<') return vBool(cmp < 0);
        if (op === '>') return vBool(cmp > 0);
        if (op === '<=') return vBool(cmp <= 0);
        return vBool(cmp >= 0);
      }
      throw new DsError('不支持的类型组合：' + valueOf(a) + ' 与 ' + valueOf(b), line, col);
    },

    callValue: function (callee, args, line, col) {
      if (callee.k === 'native') return callee.fn(args, line, col);
      if (callee.k !== 'func') throw new DsError('不可调用：' + valueOf(callee), line, col);
      var f = callee;
      if (args.length > f.params.length) throw new DsError('`' + f.name + '` 实参过多', line, col);
      var env = new Env(f.env);
      for (var i = 0; i < f.params.length; i++) {
        var val;
        if (i < args.length) val = args[i];
        else if (f.params[i].def) val = this.evalExpr(env, f.params[i].def);
        else throw new DsError('`' + f.name + '` 缺少实参 `' + f.params[i].name + '`', line, col);
        env.define(f.params[i].name, val, false);
      }
      try {
        return this.execBlock(env, f.body);
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
    }
  };

  /* ============================ 对外 API ============================ */
  /* Flow 自动识别：#!flow 开头 / `\` 开头 / .dsf 文件名 / options.flow 强制 */
  function detectFlow(source, options) {
    if (options && options.flow) return true;
    var fname = options && (options.filename || options.file);
    if (typeof fname === 'string' && /\.dsf$/i.test(fname)) return true;
    if (typeof source !== 'string') return false;
    var s = source;
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    s = s.replace(/^\s+/, '');
    if (s.indexOf('\\') === 0) return true;
    if (s.indexOf('#!flow') === 0) return true;
    return false;
  }

  function run(source, options) {
    options = options || {};
    var flow = detectFlow(source, options);
    try {
      var interp = new Interpreter({ maxSteps: options.maxSteps, flow: flow });
      interp.run(source);
      return { ok: true, output: interp.out, steps: interp.steps, error: null, flow: flow };
    } catch (e) {
      if (e instanceof DsError) {
        return { ok: false, output: (typeof interp !== 'undefined' && interp ? interp.out : []),
                 error: { message: e.message, line: e.line, col: e.col } };
      }
      throw e;
    }
  }

  function check(source, options) {
    options = options || {};
    try {
      var flow = detectFlow(source, options);
      var toks = tokenize(source, flow);
      new Parser(toks, false, flow).parseProgram();
      return { ok: true, error: null };
    } catch (e) {
      if (e instanceof DsError) return { ok: false, error: { message: e.message, line: e.line, col: e.col } };
      throw e;
    }
  }

  function tokenList(source, options) {
    options = options || {};
    var toks = tokenize(source, detectFlow(source, options));
    return toks.filter(function (t) { return t.k !== 'nl'; }).map(function (t) {
      return { kind: t.k, text: String(t.text), line: t.line, col: t.col };
    });
  }

  return { VERSION: VERSION, KEYWORDS: KEYWORDS, run: run, check: check,
           tokenize: tokenList, isFlow: detectFlow, DsError: DsError, Interpreter: Interpreter };
});
