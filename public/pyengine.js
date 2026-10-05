/* Py2Blocks - safe Python-subset engine: tokenizer, parser, interpreter.
 * Used for (1) Python -> Blocks conversion and (2) "manual" output processing.
 * It never calls eval()/Function(), so user code can never touch the page or the server.
 */
(function (root) {
  'use strict';

  class PyError extends Error {
    constructor(type, msg, line) {
      super(msg);
      this.pyType = type;
      this.pyMsg = msg;
      this.line = line || null;
    }
  }
  class Flt { constructor(v) { this.v = v; } }

  const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
  const UNSUPPORTED = new Set(['def', 'class', 'try', 'with', 'import', 'from', 'return', 'global', 'nonlocal', 'del', 'assert', 'raise', 'lambda', 'yield', 'async', 'await', 'except', 'finally', 'as']);
  const OPS2 = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '->'];
  const OPS1 = '+-*/%<>=()[]{},:.';

  /* ------------------------------------------------------------------ */
  /* Tokenizer                                                           */
  /* ------------------------------------------------------------------ */
  const NUM_RE = /(?:\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/y;
  const NAME_RE = /[A-Za-z_\u00C0-\uFFFF][\w\u00C0-\uFFFF]*/y;
  const STR_RE = /([fFrRbBuU]{0,2})('''|"""|'|")/y;

  function tokenize(src) {
    const toks = [];
    const indents = [0];
    const n = src.length;
    let i = 0, line = 1, lineStart = 0, depth = 0, atLineStart = true;
    const push = (t, v, s, e, extra) => toks.push(Object.assign({ t, v, s, e, line, col: s - lineStart }, extra || {}));

    while (i < n) {
      if (atLineStart && depth === 0) {
        let j = i, col = 0;
        while (j < n && (src[j] === ' ' || src[j] === '\t')) { col += src[j] === '\t' ? 4 : 1; j++; }
        if (j >= n) { i = j; break; }
        if (src[j] === '\n') { i = j + 1; line++; lineStart = i; continue; }
        if (src[j] === '#') { while (j < n && src[j] !== '\n') j++; i = j; continue; }
        const top = indents[indents.length - 1];
        if (col > top) {
          indents.push(col);
          toks.push({ t: 'INDENT', v: '', s: j, e: j, line, col });
        } else if (col < top) {
          while (col < indents[indents.length - 1]) {
            indents.pop();
            toks.push({ t: 'DEDENT', v: '', s: j, e: j, line, col });
          }
          if (col !== indents[indents.length - 1]) throw new PyError('IndentationError', 'unindent does not match any outer indentation level', line);
        }
        i = j; atLineStart = false; continue;
      }

      const c = src[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; lineStart = i; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '\n') {
        if (depth === 0) { push('NEWLINE', '\n', i, i + 1); atLineStart = true; }
        i++; line++; lineStart = i; continue;
      }

      STR_RE.lastIndex = i;
      const sm = STR_RE.exec(src);
      if (sm) {
        const prefix = sm[1].toLowerCase();
        const q = sm[2];
        const triple = q.length === 3;
        const start = i, startLine = line, startCol = i - lineStart;
        i += sm[0].length;
        let body = '', closed = false;
        while (i < n) {
          if (src.startsWith(q, i)) { i += q.length; closed = true; break; }
          if (src[i] === '\\' && i + 1 < n) {
            body += src[i] + src[i + 1];
            if (src[i + 1] === '\n') { line++; lineStart = i + 2; }
            i += 2; continue;
          }
          if (src[i] === '\n') {
            if (!triple) break;
            line++; lineStart = i + 1;
          }
          body += src[i]; i++;
        }
        if (!closed) throw new PyError('SyntaxError', 'unterminated string literal', startLine);
        toks.push({ t: 'STR', v: body, s: start, e: i, line: startLine, col: startCol, isF: prefix.includes('f'), isRaw: prefix.includes('r') });
        continue;
      }

      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        NUM_RE.lastIndex = i;
        const m = NUM_RE.exec(src);
        const text = m[0].replace(/_/g, '');
        push('NUM', parseFloat(text), i, i + m[0].length, { isFloat: /[.eE]/.test(text) });
        i += m[0].length; continue;
      }

      NAME_RE.lastIndex = i;
      const nm = NAME_RE.exec(src);
      if (nm) { push('NAME', nm[0], i, i + nm[0].length); i += nm[0].length; continue; }

      const three = src.substr(i, 3);
      if (three === '**=' || three === '//=') { push('OP', three, i, i + 3); i += 3; continue; }
      const two = src.substr(i, 2);
      if (OPS2.includes(two)) { push('OP', two, i, i + 2); i += 2; continue; }
      if (OPS1.includes(c)) {
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
        push('OP', c, i, i + 1); i++; continue;
      }
      throw new PyError('SyntaxError', `invalid character '${c}'`, line);
    }

    const last = toks[toks.length - 1];
    if (last && last.t !== 'NEWLINE') push('NEWLINE', '\n', n, n);
    while (indents.length > 1) { indents.pop(); toks.push({ t: 'DEDENT', v: '', s: n, e: n, line, col: 0 }); }
    toks.push({ t: 'EOF', v: '', s: n, e: n, line, col: 0 });
    return toks;
  }

  function decodeEsc(s) {
    return s.replace(/\\(n|t|r|\\|'|"|0|\n|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/g, (m, g) => {
      switch (g[0]) {
        case 'n': return '\n';
        case 't': return '\t';
        case 'r': return '\r';
        case '0': return '\0';
        case '\n': return '';
        case 'x': case 'u': return String.fromCharCode(parseInt(g.slice(1), 16));
        default: return g;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Parser                                                              */
  /* ------------------------------------------------------------------ */
  class Parser {
    constructor(toks, src) {
      this.t = toks; this.p = 0; this.src = src; this.lastEnd = 0; this.raws = [];
    }
    peek(o) { return this.t[Math.min(this.p + (o || 0), this.t.length - 1)]; }
    next() {
      const k = this.t[this.p];
      if (this.p < this.t.length - 1) this.p++;
      if (k.t !== 'NEWLINE' && k.t !== 'INDENT' && k.t !== 'DEDENT' && k.t !== 'EOF') this.lastEnd = k.e;
      return k;
    }
    isOp(v, o) { const k = this.peek(o); return k.t === 'OP' && k.v === v; }
    isKw(v, o) { const k = this.peek(o); return k.t === 'NAME' && k.v === v; }
    isNL() { return this.peek().t === 'NEWLINE'; }
    fail(msg, tok) { throw new PyError('SyntaxError', msg, (tok || this.peek()).line); }
    expectOp(v) { if (!this.isOp(v)) this.fail(`expected '${v}'`); return this.next(); }

    parseProgram() {
      const body = [];
      while (this.peek().t !== 'EOF') {
        if (this.isNL()) { this.next(); continue; }
        body.push(this.parseStatement());
      }
      return body;
    }

    parseBlock() {
      if (!this.isNL()) return [this.parseSimple()];
      this.next();
      if (this.peek().t !== 'INDENT') this.fail('expected an indented block');
      this.next();
      const body = [];
      while (this.peek().t !== 'DEDENT' && this.peek().t !== 'EOF') {
        if (this.isNL()) { this.next(); continue; }
        body.push(this.parseStatement());
      }
      if (this.peek().t === 'DEDENT') this.next();
      return body;
    }

    parseStatement() {
      const startP = this.p;
      const first = this.peek();
      try {
        let node;
        if (first.t === 'INDENT') this.fail('unexpected indent');
        if (first.t === 'NAME') {
          switch (first.v) {
            case 'if': node = this.parseIf(); break;
            case 'while': node = this.parseWhile(); break;
            case 'for': node = this.parseFor(); break;
            case 'pass': case 'break': case 'continue':
              this.next(); node = { type: first.v }; this.endSimple(); break;
            default:
              if (UNSUPPORTED.has(first.v)) throw new PyError('Unsupported', `'${first.v}' statements are not supported in blocks`, first.line);
              node = this.parseSimple();
          }
        } else {
          node = this.parseSimple();
        }
        node.line = first.line; node.s = first.s; node.e = this.lastEnd; node.col = first.col;
        return node;
      } catch (err) {
        if (!(err instanceof PyError)) throw err;
        return this.recover(startP, first, err);
      }
    }

    recover(startP, first, err) {
      const prevNL = this.p > startP && this.t[this.p - 1].t === 'NEWLINE';
      if (!prevNL) {
        while (this.peek().t !== 'NEWLINE' && this.peek().t !== 'EOF') this.next();
        if (this.peek().t === 'NEWLINE') this.next();
      }
      if (this.peek().t === 'INDENT') {
        let d = 0;
        do {
          const k = this.next();
          if (k.t === 'INDENT') d++; else if (k.t === 'DEDENT') d--;
        } while (d > 0 && this.peek().t !== 'EOF');
      }
      const node = {
        type: 'raw',
        kind: err.pyType === 'Unsupported' ? 'unsupported' : 'syntax',
        reason: err.pyMsg, line: first.line, s: first.s,
        e: Math.max(this.lastEnd, first.e), col: first.col
      };
      this.raws.push(node);
      return node;
    }

    parseIf() {
      this.next();
      const test = this.parseExpr();
      this.expectOp(':');
      const body = this.parseBlock();
      let orelse = [];
      if (this.isKw('elif')) {
        const st = this.peek();
        const el = this.parseIf();
        el.line = st.line; el.s = st.s; el.e = this.lastEnd; el.col = st.col; el.isElif = true;
        orelse = [el];
      } else if (this.isKw('else')) {
        this.next(); this.expectOp(':');
        orelse = this.parseBlock();
      }
      return { type: 'if', test, body, orelse };
    }

    parseWhile() {
      this.next();
      const test = this.parseExpr();
      this.expectOp(':');
      return { type: 'while', test, body: this.parseBlock() };
    }

    parseFor() {
      this.next();
      const v = this.peek();
      if (v.t !== 'NAME' || KEYWORDS.has(v.v)) this.fail('invalid loop variable');
      this.next();
      if (!this.isKw('in')) {
        if (this.isOp(',')) throw new PyError('Unsupported', 'tuple loop variables are not supported', v.line);
        this.fail("expected 'in'");
      }
      this.next();
      const iter = this.parseExpr();
      this.expectOp(':');
      return { type: 'for', var: v.v, iter, body: this.parseBlock() };
    }

    parseSimple() {
      const e = this.parseExpr();
      const k = this.peek();
      let node;
      if (k.t === 'OP' && k.v === '=') {
        this.checkTarget(e);
        this.next();
        const value = this.parseExpr();
        if (this.isOp('=')) throw new PyError('Unsupported', 'chained assignment is not supported', k.line);
        node = { type: 'assign', target: e, value };
      } else if (k.t === 'OP' && ['+=', '-=', '*=', '/=', '//=', '%=', '**='].includes(k.v)) {
        this.checkTarget(e);
        this.next();
        node = { type: 'aug', op: k.v.slice(0, -1), target: e, value: this.parseExpr() };
      } else if (k.t === 'OP' && k.v === ',') {
        throw new PyError('Unsupported', 'tuples are not supported', k.line);
      } else {
        node = { type: 'expr', expr: e };
      }
      this.endSimple();
      return node;
    }
    checkTarget(e) { if (e.type !== 'name' && e.type !== 'index') this.fail('cannot assign to this expression'); }
    endSimple() {
      const k = this.peek();
      if (k.t === 'NEWLINE') this.next();
      else if (k.t !== 'EOF' && k.t !== 'DEDENT') this.fail('invalid syntax');
    }

    /* ---- expressions ---- */
    parseExpr() { return this.parseOr(); }
    parseOr() {
      let l = this.parseAnd();
      while (this.isKw('or')) {
        this.next();
        const r = this.parseAnd();
        l = { type: 'bool_op', op: 'or', l, r, s: l.s, e: r.e };
      }
      return l;
    }
    parseAnd() {
      let l = this.parseNot();
      while (this.isKw('and')) {
        this.next();
        const r = this.parseNot();
        l = { type: 'bool_op', op: 'and', l, r, s: l.s, e: r.e };
      }
      return l;
    }
    parseNot() {
      if (this.isKw('not')) {
        const k = this.next();
        const v = this.parseNot();
        return { type: 'not', v, s: k.s, e: v.e };
      }
      return this.parseCmp();
    }
    parseCmp() {
      const left = this.parseArith();
      const operands = [left], ops = [];
      for (;;) {
        const k = this.peek();
        let op = null;
        if (k.t === 'OP' && ['<', '>', '<=', '>=', '==', '!='].includes(k.v)) { op = k.v; this.next(); }
        else if (this.isKw('in')) { op = 'in'; this.next(); }
        else if (this.isKw('not') && this.isKw('in', 1)) { op = 'not in'; this.next(); this.next(); }
        else if (this.isKw('is')) { this.next(); if (this.isKw('not')) { this.next(); op = 'is not'; } else op = 'is'; }
        else break;
        operands.push(this.parseArith()); ops.push(op);
      }
      if (!ops.length) return left;
      const s = left.s, e = operands[operands.length - 1].e;
      if (ops.length === 1) return { type: 'cmp', op: ops[0], l: operands[0], r: operands[1], s, e };
      return { type: 'chain', operands, ops, s, e };
    }
    parseArith() {
      let l = this.parseTerm();
      while (this.isOp('+') || this.isOp('-')) {
        const op = this.next().v;
        const r = this.parseTerm();
        l = { type: 'bin', op, l, r, s: l.s, e: r.e };
      }
      return l;
    }
    parseTerm() {
      let l = this.parseUnary();
      while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
        const op = this.next().v;
        const r = this.parseUnary();
        l = { type: 'bin', op, l, r, s: l.s, e: r.e };
      }
      return l;
    }
    parseUnary() {
      if (this.isOp('-') || this.isOp('+')) {
        const k = this.next();
        const v = this.parseUnary();
        return { type: 'neg', op: k.v, v, s: k.s, e: v.e };
      }
      return this.parsePower();
    }
    parsePower() {
      const b = this.parsePostfix();
      if (this.isOp('**')) {
        this.next();
        const x = this.parseUnary();
        return { type: 'bin', op: '**', l: b, r: x, s: b.s, e: x.e };
      }
      return b;
    }
    parsePostfix() {
      let e = this.parseAtom();
      for (;;) {
        if (this.isOp('(')) {
          this.next();
          const args = [], kwargs = [];
          while (!this.isOp(')')) {
            if (this.peek().t === 'EOF') this.fail("expected ')'");
            const k = this.peek();
            if (k.t === 'NAME' && !KEYWORDS.has(k.v) && this.isOp('=', 1)) {
              this.next(); this.next();
              kwargs.push({ name: k.v, value: this.parseExpr() });
            } else {
              args.push(this.parseExpr());
            }
            if (this.isOp(',')) this.next(); else break;
          }
          const c = this.expectOp(')');
          e = { type: 'call', func: e, args, kwargs, s: e.s, e: c.e };
        } else if (this.isOp('[')) {
          this.next();
          const idx = this.parseExpr();
          if (this.isOp(':')) throw new PyError('Unsupported', 'slices are not supported', this.peek().line);
          const c = this.expectOp(']');
          e = { type: 'index', obj: e, index: idx, s: e.s, e: c.e };
        } else if (this.isOp('.')) {
          this.next();
          const nm = this.peek();
          if (nm.t !== 'NAME') this.fail('invalid syntax');
          this.next();
          e = { type: 'attr', obj: e, name: nm.v, s: e.s, e: nm.e };
        } else break;
      }
      return e;
    }
    parseAtom() {
      const k = this.peek();
      if (k.t === 'NUM') { this.next(); return { type: 'num', v: k.v, isFloat: k.isFloat, s: k.s, e: k.e }; }
      if (k.t === 'STR') {
        this.next();
        if (k.isF) return { type: 'fstr', parts: this.parseFString(k.v, k.isRaw, k.line), s: k.s, e: k.e };
        return { type: 'str', v: k.isRaw ? k.v : decodeEsc(k.v), s: k.s, e: k.e };
      }
      if (k.t === 'NAME') {
        if (k.v === 'True' || k.v === 'False') { this.next(); return { type: 'bool', v: k.v === 'True', s: k.s, e: k.e }; }
        if (k.v === 'None') { this.next(); return { type: 'none', s: k.s, e: k.e }; }
        if (KEYWORDS.has(k.v)) this.fail(`invalid syntax near '${k.v}'`);
        this.next();
        return { type: 'name', name: k.v, s: k.s, e: k.e };
      }
      if (k.t === 'OP' && k.v === '(') {
        this.next();
        const e = this.parseExpr();
        if (this.isOp(',')) throw new PyError('Unsupported', 'tuples are not supported', k.line);
        const c = this.expectOp(')');
        return Object.assign({}, e, { s: k.s, e: c.e, paren: true });
      }
      if (k.t === 'OP' && k.v === '[') {
        this.next();
        const items = [];
        while (!this.isOp(']')) {
          if (this.peek().t === 'EOF') this.fail("expected ']'");
          items.push(this.parseExpr());
          if (this.isOp(',')) this.next(); else break;
        }
        const c = this.expectOp(']');
        return { type: 'list', items, s: k.s, e: c.e };
      }
      if (k.t === 'OP' && k.v === '{') throw new PyError('Unsupported', 'dictionaries and sets are not supported', k.line);
      this.fail('invalid syntax');
    }

    parseFString(raw, isRaw, line) {
      const parts = [];
      let lit = '', i = 0;
      const flush = () => { if (lit) { parts.push(isRaw ? lit : decodeEsc(lit)); lit = ''; } };
      while (i < raw.length) {
        const c = raw[i];
        if (c === '{') {
          if (raw[i + 1] === '{') { lit += '{'; i += 2; continue; }
          flush();
          let depth = 0, j = i + 1, q = null, colon = -1;
          for (; j < raw.length; j++) {
            const d = raw[j];
            if (q) { if (d === q) q = null; continue; }
            if (d === '"' || d === "'") { q = d; continue; }
            if ('([{'.includes(d)) depth++;
            else if (')]'.includes(d)) depth--;
            else if (d === '}') { if (depth === 0) break; depth--; }
            else if (d === ':' && depth === 0 && colon < 0) colon = j;
          }
          if (j >= raw.length) throw new PyError('SyntaxError', "f-string: expecting '}'", line);
          let exprText = raw.slice(i + 1, colon < 0 ? j : colon);
          const spec = colon < 0 ? '' : raw.slice(colon + 1, j);
          let conv = null;
          const cm = /!([rs])\s*$/.exec(exprText);
          if (cm) { conv = cm[1]; exprText = exprText.slice(0, cm.index); }
          exprText = exprText.trim();
          if (!exprText) throw new PyError('SyntaxError', 'f-string: empty expression', line);
          const sub = new Parser(tokenize(exprText), exprText);
          const ex = sub.parseExpr();
          if (sub.peek().t !== 'NEWLINE' && sub.peek().t !== 'EOF') throw new PyError('SyntaxError', 'f-string: invalid expression', line);
          parts.push({ expr: ex, spec, conv });
          i = j + 1;
        } else if (c === '}') {
          if (raw[i + 1] === '}') { lit += '}'; i += 2; continue; }
          throw new PyError('SyntaxError', "f-string: single '}' is not allowed", line);
        } else { lit += c; i++; }
      }
      flush();
      return parts;
    }
  }

  function parse(src) {
    src = String(src).replace(/\r\n?/g, '\n');
    const toks = tokenize(src);
    const p = new Parser(toks, src);
    const body = p.parseProgram();
    return { body, raws: p.raws, source: src };
  }

  /* ------------------------------------------------------------------ */
  /* Value helpers                                                       */
  /* ------------------------------------------------------------------ */
  const isNumLike = v => typeof v === 'number' || typeof v === 'boolean' || v instanceof Flt;
  const isIntLike = v => typeof v === 'number' || typeof v === 'boolean';
  const toNum = v => (v instanceof Flt ? v.v : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const mk = (v, fl) => (fl ? new Flt(v) : v);

  function typeName(v) {
    if (v === null) return 'NoneType';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return 'int';
    if (v instanceof Flt) return 'float';
    if (typeof v === 'string') return 'str';
    if (Array.isArray(v)) return 'list';
    return 'object';
  }
  function fmtFloat(x) {
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    if (Number.isNaN(x)) return 'nan';
    if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1);
    return String(x);
  }
  function pyStr(v) {
    if (v === null) return 'None';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (v instanceof Flt) return fmtFloat(v.v);
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return '[' + v.map(pyRepr).join(', ') + ']';
    return String(v);
  }
  function pyRepr(v) {
    if (typeof v === 'string') {
      const q = v.includes("'") && !v.includes('"') ? '"' : "'";
      return q + v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(new RegExp(q, 'g'), '\\' + q) + q;
    }
    return pyStr(v);
  }
  function roundHalfEven(x) {
    const f = Math.floor(x), d = x - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return f % 2 === 0 ? f : f + 1;
  }

  /* ------------------------------------------------------------------ */
  /* Interpreter                                                         */
  /* ------------------------------------------------------------------ */
  class Interp {
    constructor(opts) {
      opts = opts || {};
      this.buf = '';
      this.steps = 0;
      this.max = opts.maxSteps || 1000000;
      this.stdin = (opts.stdin || []).slice();
      this.inputFn = opts.inputFn || null;
      this.env = Object.create(null);
      this.line = 0;
    }
    err(type, msg) { return new PyError(type, msg, this.line); }
    write(s) {
      this.buf += s;
      if (this.buf.length > 200000) throw this.err('RuntimeError', 'output too large');
    }
    tick() { if (++this.steps > this.max) throw this.err('TimeoutError', 'step limit reached - the program may contain an infinite loop'); }

    execBlock(list) {
      for (const s of list) {
        const r = this.exec(s);
        if (r) return r;
      }
      return null;
    }
    exec(s) {
      this.tick();
      this.line = s.line;
      switch (s.type) {
        case 'expr': this.eval(s.expr); return null;
        case 'assign': this.assign(s.target, this.eval(s.value)); return null;
        case 'aug': {
          const cur = this.eval(s.target);
          const val = this.eval(s.value);
          this.assign(s.target, this.binop(s.op, cur, val));
          return null;
        }
        case 'if':
          if (this.truthy(this.eval(s.test))) return this.execBlock(s.body);
          return this.execBlock(s.orelse);
        case 'while':
          while (this.truthy(this.eval(s.test))) {
            this.tick();
            const r = this.execBlock(s.body);
            if (r === 'break') break;
          }
          return null;
        case 'for': {
          const items = this.iterable(this.eval(s.iter));
          for (const v of items) {
            this.tick();
            this.env[s.var] = v;
            const r = this.execBlock(s.body);
            if (r === 'break') break;
          }
          return null;
        }
        case 'pass': return null;
        case 'break': return 'break';
        case 'continue': return 'continue';
        default: throw this.err('ManualModeError', 'unsupported statement');
      }
    }
    iterable(v) {
      if (Array.isArray(v)) return v.slice();
      if (typeof v === 'string') return Array.from(v);
      throw this.err('TypeError', `'${typeName(v)}' object is not iterable`);
    }
    assign(target, value) {
      if (target.type === 'name') { this.env[target.name] = value; return; }
      const obj = this.eval(target.obj);
      const idx = this.eval(target.index);
      if (!Array.isArray(obj)) throw this.err('TypeError', `'${typeName(obj)}' object does not support item assignment`);
      const i = this.listIndex(obj, idx);
      obj[i] = value;
    }
    listIndex(obj, idx) {
      if (!isIntLike(idx)) throw this.err('TypeError', `${typeName(obj)} indices must be integers`);
      let i = toNum(idx);
      const len = obj.length;
      if (i < 0) i += len;
      if (i < 0 || i >= len) throw this.err('IndexError', `${typeName(obj)} index out of range`);
      return i;
    }
    truthy(v) {
      if (v === null) return false;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      if (v instanceof Flt) return v.v !== 0;
      if (typeof v === 'string' || Array.isArray(v)) return v.length > 0;
      return true;
    }

    eval(e) {
      switch (e.type) {
        case 'num': return e.isFloat ? new Flt(e.v) : e.v;
        case 'str': return e.v;
        case 'fstr': return e.parts.map(p => (typeof p === 'string' ? p : this.fmt(this.eval(p.expr), p.spec, p.conv))).join('');
        case 'bool': return e.v;
        case 'none': return null;
        case 'name':
          if (!(e.name in this.env)) throw this.err('NameError', `name '${e.name}' is not defined`);
          return this.env[e.name];
        case 'list': return e.items.map(x => this.eval(x));
        case 'neg': {
          const v = this.eval(e.v);
          if (!isNumLike(v)) throw this.err('TypeError', `bad operand type for unary ${e.op}: '${typeName(v)}'`);
          const n = e.op === '-' ? -toNum(v) : toNum(v);
          return v instanceof Flt ? new Flt(n) : n;
        }
        case 'not': return !this.truthy(this.eval(e.v));
        case 'bool_op': {
          const l = this.eval(e.l);
          if (e.op === 'and') return this.truthy(l) ? this.eval(e.r) : l;
          return this.truthy(l) ? l : this.eval(e.r);
        }
        case 'bin': return this.binop(e.op, this.eval(e.l), this.eval(e.r));
        case 'cmp': return this.compare(e.op, this.eval(e.l), this.eval(e.r));
        case 'chain': {
          let l = this.eval(e.operands[0]);
          for (let i = 0; i < e.ops.length; i++) {
            const r = this.eval(e.operands[i + 1]);
            if (!this.compare(e.ops[i], l, r)) return false;
            l = r;
          }
          return true;
        }
        case 'index': {
          const obj = this.eval(e.obj), idx = this.eval(e.index);
          if (Array.isArray(obj)) return obj[this.listIndex(obj, idx)];
          if (typeof obj === 'string') {
            const chars = Array.from(obj);
            return chars[this.listIndex(chars, idx)];
          }
          throw this.err('TypeError', `'${typeName(obj)}' object is not subscriptable`);
        }
        case 'call': return this.call(e);
        case 'attr': throw this.err('AttributeError', 'attributes are only supported as method calls');
        default: throw this.err('ManualModeError', 'unsupported expression');
      }
    }

    binop(op, a, b) {
      if (op === '+') {
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
      }
      if (op === '*') {
        const rep = (seq, n) => {
          const k = Math.max(0, toNum(n));
          if (seq.length * k > 1000000) throw this.err('RuntimeError', 'result too large');
          return typeof seq === 'string' ? seq.repeat(k) : [].concat(...Array.from({ length: k }, () => seq));
        };
        if ((typeof a === 'string' || Array.isArray(a)) && isIntLike(b)) return rep(a, b);
        if ((typeof b === 'string' || Array.isArray(b)) && isIntLike(a)) return rep(b, a);
      }
      if (!isNumLike(a) || !isNumLike(b)) {
        throw this.err('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
      }
      const x = toNum(a), y = toNum(b), fl = a instanceof Flt || b instanceof Flt;
      switch (op) {
        case '+': return mk(x + y, fl);
        case '-': return mk(x - y, fl);
        case '*': return mk(x * y, fl);
        case '/':
          if (y === 0) throw this.err('ZeroDivisionError', 'division by zero');
          return new Flt(x / y);
        case '//':
          if (y === 0) throw this.err('ZeroDivisionError', fl ? 'float floor division by zero' : 'integer division or modulo by zero');
          return mk(Math.floor(x / y), fl);
        case '%':
          if (y === 0) throw this.err('ZeroDivisionError', fl ? 'float modulo' : 'integer modulo by zero');
          return mk(x - y * Math.floor(x / y), fl);
        case '**':
          if (!fl && y >= 0) return Math.pow(x, y);
          return new Flt(Math.pow(x, y));
        default: throw this.err('ManualModeError', `operator ${op} is not supported`);
      }
    }
    eq(a, b) {
      if (isNumLike(a) && isNumLike(b)) return toNum(a) === toNum(b);
      if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => this.eq(x, b[i]));
      return a === b;
    }
    compare(op, a, b) {
      switch (op) {
        case '==': return this.eq(a, b);
        case '!=': return !this.eq(a, b);
        case 'is': return a === b;
        case 'is not': return a !== b;
        case 'in': return this.contains(b, a);
        case 'not in': return !this.contains(b, a);
      }
      let x, y;
      if (isNumLike(a) && isNumLike(b)) { x = toNum(a); y = toNum(b); }
      else if (typeof a === 'string' && typeof b === 'string') { x = a; y = b; }
      else throw this.err('TypeError', `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`);
      switch (op) {
        case '<': return x < y;
        case '>': return x > y;
        case '<=': return x <= y;
        case '>=': return x >= y;
      }
      throw this.err('ManualModeError', `comparison ${op} is not supported`);
    }
    contains(container, item) {
      if (Array.isArray(container)) return container.some(x => this.eq(x, item));
      if (typeof container === 'string') {
        if (typeof item !== 'string') throw this.err('TypeError', "'in <string>' requires string as left operand");
        return container.includes(item);
      }
      throw this.err('TypeError', `argument of type '${typeName(container)}' is not iterable`);
    }

    fmt(v, spec, conv) {
      if (conv === 'r') v = pyRepr(v);
      else if (conv === 's') v = pyStr(v);
      if (!spec) return pyStr(v);
      const m = /^(?:(.)?([<>^]))?(\d+)?(,)?(?:\.(\d+))?([a-z%]?)$/.exec(spec);
      if (!m) throw this.err('ValueError', `Invalid format specifier '${spec}'`);
      const fill = m[1] || ' ';
      let align = m[2];
      const width = m[3] ? parseInt(m[3], 10) : 0;
      const comma = !!m[4];
      const prec = m[5] !== undefined ? parseInt(m[5], 10) : null;
      const type = m[6];
      let out;
      if (type === 'f' || type === 'd' || type === '%' || (isNumLike(v) && (prec !== null || comma))) {
        if (!isNumLike(v)) throw this.err('ValueError', `Unknown format code '${type || 'f'}' for object of type '${typeName(v)}'`);
        const n = toNum(v);
        if (type === 'd') out = String(Math.trunc(n));
        else if (type === '%') out = (n * 100).toFixed(prec === null ? 6 : prec) + '%';
        else if (type === 'f' || prec !== null) out = n.toFixed(prec === null ? 6 : prec);
        else out = pyStr(v);
        if (comma) { const [ip, fp] = out.split('.'); out = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fp !== undefined ? '.' + fp : ''); }
        if (!align) align = '>';
      } else {
        out = pyStr(v);
        if (!align) align = isNumLike(v) ? '>' : '<';
      }
      if (out.length < width) {
        const pad = width - out.length;
        if (align === '<') out += fill.repeat(pad);
        else if (align === '>') out = fill.repeat(pad) + out;
        else { const l = Math.floor(pad / 2); out = fill.repeat(l) + out + fill.repeat(pad - l); }
      }
      return out;
    }

    readInput(prompt) {
      let value;
      if (this.stdin.length) value = this.stdin.shift();
      else if (this.inputFn) {
        value = this.inputFn(prompt);
        if (value === null || value === undefined) throw this.err('EOFError', 'EOF when reading a line');
      } else throw this.err('EOFError', 'EOF when reading a line');
      this.write(prompt + value + '\n');
      return String(value);
    }

    call(e) {
      const f = e.func;
      if (f.type === 'attr') {
        const obj = this.eval(f.obj);
        return this.method(obj, f.name, e.args.map(a => this.eval(a)));
      }
      if (f.type !== 'name') throw this.err('TypeError', 'object is not callable');
      const args = e.args.map(a => this.eval(a));
      const kw = {};
      for (const k of e.kwargs) kw[k.name] = this.eval(k.value);
      const need = (n) => { if (args.length < n) throw this.err('TypeError', `${f.name}() missing required argument`); };
      switch (f.name) {
        case 'print': {
          const sep = kw.sep !== undefined && kw.sep !== null ? pyStr(kw.sep) : ' ';
          const end = kw.end !== undefined && kw.end !== null ? pyStr(kw.end) : '\n';
          this.write(args.map(pyStr).join(sep) + end);
          return null;
        }
        case 'input': return this.readInput(args.length ? pyStr(args[0]) : '');
        case 'len':
          need(1);
          if (typeof args[0] === 'string') return Array.from(args[0]).length;
          if (Array.isArray(args[0])) return args[0].length;
          throw this.err('TypeError', `object of type '${typeName(args[0])}' has no len()`);
        case 'str': return args.length ? pyStr(args[0]) : '';
        case 'int': {
          if (!args.length) return 0;
          const v = args[0];
          if (typeof v === 'string') {
            if (!/^\s*[+-]?\d+\s*$/.test(v)) throw this.err('ValueError', `invalid literal for int() with base 10: ${pyRepr(v)}`);
            return parseInt(v, 10);
          }
          if (isNumLike(v)) return Math.trunc(toNum(v));
          throw this.err('TypeError', `int() argument must be a string or a number, not '${typeName(v)}'`);
        }
        case 'float': {
          if (!args.length) return new Flt(0);
          const v = args[0];
          if (typeof v === 'string') {
            if (!/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v)) throw this.err('ValueError', `could not convert string to float: ${pyRepr(v)}`);
            return new Flt(parseFloat(v));
          }
          if (isNumLike(v)) return new Flt(toNum(v));
          throw this.err('TypeError', `float() argument must be a string or a number, not '${typeName(v)}'`);
        }
        case 'bool': return args.length ? this.truthy(args[0]) : false;
        case 'abs': {
          need(1);
          if (!isNumLike(args[0])) throw this.err('TypeError', `bad operand type for abs(): '${typeName(args[0])}'`);
          return mk(Math.abs(toNum(args[0])), args[0] instanceof Flt);
        }
        case 'round': {
          need(1);
          if (!isNumLike(args[0])) throw this.err('TypeError', `type ${typeName(args[0])} doesn't define __round__ method`);
          const x = toNum(args[0]);
          if (args.length > 1 && args[1] !== null) {
            const f10 = Math.pow(10, toNum(args[1]));
            const r = roundHalfEven(x * f10) / f10;
            return args[0] instanceof Flt ? new Flt(r) : r;
          }
          return roundHalfEven(x);
        }
        case 'min': case 'max': {
          const vals = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          if (!vals.length) throw this.err('ValueError', `${f.name}() arg is an empty sequence`);
          let best = vals[0];
          for (const v of vals.slice(1)) {
            if (f.name === 'min' ? this.compare('<', v, best) : this.compare('>', v, best)) best = v;
          }
          return best;
        }
        case 'sum': {
          need(1);
          let acc = args.length > 1 ? args[1] : 0;
          for (const v of this.iterable(args[0])) acc = this.binop('+', acc, v);
          return acc;
        }
        case 'sorted': {
          need(1);
          const arr = this.iterable(args[0]);
          arr.sort((a, b) => (this.compare('<', a, b) ? -1 : this.compare('>', a, b) ? 1 : 0));
          if (kw.reverse !== undefined && this.truthy(kw.reverse)) arr.reverse();
          return arr;
        }
        case 'list': return args.length ? this.iterable(args[0]) : [];
        case 'range': {
          const a = args.map(x => {
            if (!isIntLike(x)) throw this.err('TypeError', `'${typeName(x)}' object cannot be interpreted as an integer`);
            return toNum(x);
          });
          let start = 0, stop, step = 1;
          if (a.length === 1) stop = a[0];
          else if (a.length >= 2) { start = a[0]; stop = a[1]; if (a.length >= 3) step = a[2]; }
          else throw this.err('TypeError', 'range expected at least 1 argument, got 0');
          if (step === 0) throw this.err('ValueError', 'range() arg 3 must not be zero');
          const n = Math.max(0, Math.ceil((stop - start) / step));
          if (n > 1000000) throw this.err('RuntimeError', 'range is too large for manual mode');
          const out = [];
          for (let i = 0; i < n; i++) out.push(start + i * step);
          return out;
        }
        default:
          throw this.err('NameError', `name '${f.name}' is not defined`);
      }
    }

    method(obj, name, args) {
      if (Array.isArray(obj)) {
        switch (name) {
          case 'append': if (args.length !== 1) throw this.err('TypeError', 'append() takes exactly one argument'); obj.push(args[0]); return null;
          case 'extend': obj.push(...this.iterable(args[0])); return null;
          case 'insert': {
            if (args.length !== 2 || !isIntLike(args[0])) throw this.err('TypeError', 'insert() takes an index and a value');
            obj.splice(toNum(args[0]), 0, args[1]); return null;
          }
          case 'pop': {
            if (!obj.length) throw this.err('IndexError', 'pop from empty list');
            const i = args.length ? this.listIndex(obj, args[0]) : obj.length - 1;
            return obj.splice(i, 1)[0];
          }
          case 'reverse': obj.reverse(); return null;
          case 'sort': obj.sort((a, b) => (this.compare('<', a, b) ? -1 : this.compare('>', a, b) ? 1 : 0)); return null;
          case 'count': return obj.filter(x => this.eq(x, args[0])).length;
          case 'index': {
            const i = obj.findIndex(x => this.eq(x, args[0]));
            if (i < 0) throw this.err('ValueError', `${pyRepr(args[0])} is not in list`);
            return i;
          }
        }
      } else if (typeof obj === 'string') {
        switch (name) {
          case 'upper': return obj.toUpperCase();
          case 'lower': return obj.toLowerCase();
          case 'title': return obj.toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
          case 'strip': return obj.trim();
          case 'split': return args.length && typeof args[0] === 'string' ? obj.split(args[0]) : obj.trim().split(/\s+/).filter(Boolean);
          case 'replace': return obj.split(pyStr(args[0])).join(pyStr(args[1]));
          case 'join': return this.iterable(args[0]).map(x => {
            if (typeof x !== 'string') throw this.err('TypeError', 'sequence item: expected str instance');
            return x;
          }).join(obj);
          case 'startswith': return obj.startsWith(pyStr(args[0]));
          case 'endswith': return obj.endsWith(pyStr(args[0]));
        }
      }
      throw this.err('AttributeError', `'${typeName(obj)}' object has no attribute '${name}'`);
    }
  }

  function fmtErr(e) {
    if (e instanceof PyError) {
      return (e.line ? `Traceback (most recent call last):\n  line ${e.line}\n` : '') + `${e.pyType}: ${e.pyMsg}`;
    }
    return 'InternalError: ' + (e && e.message ? e.message : String(e));
  }

  /** Runs code with the built-in safe interpreter. Returns { output, error }. */
  function run(src, opts) {
    let ast;
    try { ast = parse(src); } catch (e) { return { output: '', error: fmtErr(e) }; }
    if (ast.raws.length) {
      const r = ast.raws[0];
      const label = r.kind === 'syntax' ? 'SyntaxError' : 'ManualModeError';
      return { output: '', error: `${label}: ${r.reason} (line ${r.line})` };
    }
    const it = new Interp(opts);
    try {
      it.execBlock(ast.body);
    } catch (e) {
      return { output: it.buf, error: fmtErr(e) };
    }
    return { output: it.buf, error: null };
  }

  const api = { parse, run, tokenize, PyError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Py2 = api;
})(typeof window !== 'undefined' ? window : globalThis);
