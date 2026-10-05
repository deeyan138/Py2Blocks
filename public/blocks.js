/* Py2Blocks - Blockly layer: block definitions, toolbox, dark theme,
 * Blocks -> Python generator and Python (AST) -> Blocks converter.
 * Only the functions that need Blockly touch the global `Blockly`.
 */
(function (root) {
  'use strict';

  const C = { basic: '#2a9d8f', vars: '#d98324', logic: '#4f7bd9', math: '#8957e5', loops: '#3fa34d', lists: '#c2417a', warn: '#da3633' };
  const NL = '\u21b5'; // marks a line break inside buffer blocks

  /* ---------------- block definitions ---------------- */
  const val = (name) => ({ type: 'input_value', name });
  const stmt = (name) => ({ type: 'input_statement', name });
  const bin = (type, sym, colour) => ({
    type, message0: '%1 ' + sym + ' %2', args0: [val('LEFT'), val('RIGHT')],
    inputsInline: true, output: null, colour
  });

  const DEFS = [
    { type: 'text_block', message0: '" %1 "', args0: [{ type: 'field_input', name: 'TEXT', text: 'hello' }], output: null, colour: C.basic },
    { type: 'number_block', message0: '%1', args0: [{ type: 'field_number', name: 'NUM', value: 0 }], output: null, colour: C.math },
    { type: 'bool_block', message0: '%1', args0: [{ type: 'field_dropdown', name: 'BOOL', options: [['True', 'True'], ['False', 'False']] }], output: null, colour: C.logic },
    { type: 'none_block', message0: 'None', output: null, colour: C.logic },
    { type: 'input_block', message0: 'input()', output: null, colour: C.basic },
    { type: 'print_block', message0: 'print %1', args0: [val('VALUE')], previousStatement: null, nextStatement: null, colour: C.basic },

    { type: 'create_variable', message0: 'create variable %1', args0: [{ type: 'field_input', name: 'VAR', text: 'x' }], previousStatement: null, nextStatement: null, colour: C.vars },
    { type: 'set_variable', message0: 'set %1 to %2', args0: [{ type: 'field_input', name: 'VAR', text: 'x' }, val('VALUE')], previousStatement: null, nextStatement: null, colour: C.vars },
    { type: 'change_variable', message0: 'change %1 by %2', args0: [{ type: 'field_input', name: 'VAR', text: 'x' }, val('VALUE')], previousStatement: null, nextStatement: null, colour: C.vars },
    { type: 'get_variable', message0: '%1', args0: [{ type: 'field_input', name: 'VAR', text: 'x' }], output: null, colour: C.vars },

    {
      type: 'comparison_block', message0: '%1 %2 %3',
      args0: [val('LEFT'), { type: 'field_dropdown', name: 'OPERATOR', options: [['==', '=='], ['!=', '!='], ['<', '<'], ['>', '>'], ['<=', '<='], ['>=', '>=']] }, val('RIGHT')],
      inputsInline: true, output: null, colour: C.logic
    },
    bin('and_block', 'and', C.logic),
    bin('or_block', 'or', C.logic),
    { type: 'not_block', message0: 'not %1', args0: [val('VALUE')], output: null, colour: C.logic },
    { type: 'if_block', message0: 'if %1', args0: [val('COND')], message1: 'do %1', args1: [stmt('DO')], previousStatement: null, nextStatement: null, colour: C.logic },
    {
      type: 'if_else_block', message0: 'if %1', args0: [val('COND')], message1: 'do %1', args1: [stmt('DO')],
      message2: 'else %1', args2: [stmt('ELSE')], previousStatement: null, nextStatement: null, colour: C.logic
    },

    bin('addition_block', '+', C.math),
    bin('subtraction_block', '-', C.math),
    bin('multiplication_block', '*', C.math),
    bin('division_block', '/', C.math),
    bin('modulo_block', '%', C.math),

    { type: 'repeat_block', message0: 'repeat %1 times', args0: [val('TIMES')], message1: 'do %1', args1: [stmt('DO')], previousStatement: null, nextStatement: null, colour: C.loops },
    { type: 'while_block', message0: 'while %1', args0: [val('COND')], message1: 'do %1', args1: [stmt('DO')], previousStatement: null, nextStatement: null, colour: C.loops },
    {
      type: 'for_block', message0: 'for %1 from %2 up to %3 (not incl.)',
      args0: [{ type: 'field_input', name: 'VAR', text: 'i' }, val('FROM'), val('TO')], inputsInline: true,
      message1: 'do %1', args1: [stmt('DO')], previousStatement: null, nextStatement: null, colour: C.loops
    },
    { type: 'break_block', message0: 'break', previousStatement: null, nextStatement: null, colour: C.loops },
    { type: 'continue_block', message0: 'continue', previousStatement: null, nextStatement: null, colour: C.loops },

    { type: 'create_list', message0: 'create list %1', args0: [{ type: 'field_input', name: 'LIST', text: 'my_list' }], previousStatement: null, nextStatement: null, colour: C.lists },
    { type: 'add_to_list', message0: 'add %1 to list %2', args0: [val('ITEM'), { type: 'field_input', name: 'LIST', text: 'my_list' }], inputsInline: true, previousStatement: null, nextStatement: null, colour: C.lists },
    { type: 'get_item', message0: 'item %1 of list %2', args0: [val('INDEX'), { type: 'field_input', name: 'LIST', text: 'my_list' }], inputsInline: true, output: null, colour: C.lists },

    {
      type: 'buffer_block', message0: '\u26a0 UNSUPPORTED code: %1', args0: [{ type: 'field_input', name: 'CODE', text: 'unsupported code' }],
      message1: 'reason: %1', args1: [{ type: 'field_input', name: 'REASON', text: 'Not supported yet' }],
      previousStatement: null, nextStatement: null, colour: C.warn
    },
    { type: 'buffer_expr_block', message0: '\u26a0 %1', args0: [{ type: 'field_input', name: 'CODE', text: 'expression' }], output: null, colour: C.warn }
  ];

  function cat(name, colour, types) {
    return { kind: 'category', name, colour, contents: types.map(type => ({ kind: 'block', type })) };
  }
  const TOOLBOX = {
    kind: 'categoryToolbox',
    contents: [
      cat('Basic', C.basic, ['text_block', 'number_block', 'bool_block', 'none_block', 'input_block', 'print_block']),
      cat('Variables', C.vars, ['create_variable', 'set_variable', 'change_variable', 'get_variable']),
      cat('Logic', C.logic, ['comparison_block', 'and_block', 'or_block', 'not_block', 'if_block', 'if_else_block']),
      cat('Math', C.math, ['addition_block', 'subtraction_block', 'multiplication_block', 'division_block', 'modulo_block']),
      cat('Loops', C.loops, ['repeat_block', 'while_block', 'for_block', 'break_block', 'continue_block']),
      cat('Lists', C.lists, ['create_list', 'add_to_list', 'get_item']),
      cat('Unsupported', C.warn, ['buffer_block', 'buffer_expr_block'])
    ]
  };

  function defineBlocks() {
    (Blockly.common || Blockly).defineBlocksWithJsonArray(DEFS);
  }

  function darkTheme() {
    return Blockly.Theme.defineTheme('py2dark', {
      name: 'py2dark',
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: '#0d1117',
        toolboxBackgroundColour: '#161b22',
        toolboxForegroundColour: '#c9d1d9',
        flyoutBackgroundColour: '#1c2128',
        flyoutForegroundColour: '#c9d1d9',
        flyoutOpacity: 0.97,
        scrollbarColour: '#484f58',
        scrollbarOpacity: 0.6,
        insertionMarkerColour: '#ffffff',
        insertionMarkerOpacity: 0.3,
        cursorColour: '#58a6ff'
      },
      fontStyle: { family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', weight: 'normal', size: 11 }
    });
  }

  /* ---------------- Blocks -> Python ---------------- */
  const PY_RESERVED = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
  const P = { OR: 1, AND: 2, NOT: 3, CMP: 4, ADD: 5, MUL: 6, UNARY: 7, ATOM: 10 };

  function safeName(n, fallback) {
    n = String(n == null ? '' : n).trim().replace(/\W+/g, '_');
    if (!n) return fallback || 'x';
    if (/^\d/.test(n)) n = '_' + n;
    if (PY_RESERVED.has(n)) n += '_';
    return n;
  }
  const indent = (code) => code.split('\n').map(l => (l.trim() ? '    ' + l : l)).join('\n');
  const decodeBuf = (s) => String(s || '').split(NL).join('\n');

  function valueCode(block, name, minPrec, dflt) {
    const child = block.getInputTargetBlock(name);
    if (!child) return dflt;
    const e = expr(child);
    return e.prec < minPrec ? '(' + e.code + ')' : e.code;
  }

  function expr(b) {
    switch (b.type) {
      case 'text_block': return { code: JSON.stringify(String(b.getFieldValue('TEXT') || '')), prec: P.ATOM };
      case 'number_block': {
        let n = Number(b.getFieldValue('NUM'));
        if (!Number.isFinite(n)) n = 0;
        const code = String(n);
        return { code, prec: code.startsWith('-') ? P.UNARY : P.ATOM };
      }
      case 'bool_block': return { code: b.getFieldValue('BOOL') === 'False' ? 'False' : 'True', prec: P.ATOM };
      case 'none_block': return { code: 'None', prec: P.ATOM };
      case 'input_block': return { code: 'input()', prec: P.ATOM };
      case 'get_variable': return { code: safeName(b.getFieldValue('VAR')), prec: P.ATOM };
      case 'addition_block': case 'subtraction_block': {
        const op = b.type === 'addition_block' ? '+' : '-';
        return { code: valueCode(b, 'LEFT', P.ADD, '0') + ' ' + op + ' ' + valueCode(b, 'RIGHT', P.ADD + 1, '0'), prec: P.ADD };
      }
      case 'multiplication_block': case 'division_block': case 'modulo_block': {
        const op = b.type === 'multiplication_block' ? '*' : b.type === 'division_block' ? '/' : '%';
        return { code: valueCode(b, 'LEFT', P.MUL, '0') + ' ' + op + ' ' + valueCode(b, 'RIGHT', P.MUL + 1, op === '*' ? '0' : '1'), prec: P.MUL };
      }
      case 'comparison_block': {
        const ops = ['==', '!=', '<', '>', '<=', '>='];
        const op = ops.includes(b.getFieldValue('OPERATOR')) ? b.getFieldValue('OPERATOR') : '==';
        return { code: valueCode(b, 'LEFT', P.CMP + 1, '0') + ' ' + op + ' ' + valueCode(b, 'RIGHT', P.CMP + 1, '0'), prec: P.CMP };
      }
      case 'and_block': return { code: valueCode(b, 'LEFT', P.AND, 'False') + ' and ' + valueCode(b, 'RIGHT', P.AND + 1, 'False'), prec: P.AND };
      case 'or_block': return { code: valueCode(b, 'LEFT', P.OR, 'False') + ' or ' + valueCode(b, 'RIGHT', P.OR + 1, 'False'), prec: P.OR };
      case 'not_block': return { code: 'not ' + valueCode(b, 'VALUE', P.NOT, 'False'), prec: P.NOT };
      case 'get_item': return { code: safeName(b.getFieldValue('LIST'), 'my_list') + '[' + valueCode(b, 'INDEX', 0, '0') + ']', prec: P.ATOM };
      case 'buffer_expr_block': {
        const code = decodeBuf(b.getFieldValue('CODE')).trim() || 'None';
        const simple = /^[\w.]+$/.test(code) || /^[\w.]+\([^()]*\)$/.test(code);
        return { code, prec: simple ? P.ATOM : 0 };
      }
      default: return { code: 'None', prec: P.ATOM };
    }
  }

  function body(block, input) {
    const first = block.getInputTargetBlock(input);
    const code = first ? chainCode(first) : '';
    return code.trim() ? indent(code.replace(/\n$/, '')) + '\n' : '    pass\n';
  }

  function ifCode(block) {
    let out = 'if ' + valueCode(block, 'COND', 0, 'False') + ':\n' + body(block, 'DO');
    let cur = block;
    while (cur.type === 'if_else_block') {
      const first = cur.getInputTargetBlock('ELSE');
      if (first && !first.getNextBlock() && (first.type === 'if_block' || first.type === 'if_else_block')) {
        out += 'elif ' + valueCode(first, 'COND', 0, 'False') + ':\n' + body(first, 'DO');
        cur = first;
      } else {
        out += 'else:\n' + body(cur, 'ELSE');
        break;
      }
    }
    return out;
  }

  function stmtCode(b) {
    switch (b.type) {
      case 'print_block': return 'print(' + valueCode(b, 'VALUE', 0, '') + ')\n';
      case 'create_variable': return safeName(b.getFieldValue('VAR')) + ' = None\n';
      case 'set_variable': return safeName(b.getFieldValue('VAR')) + ' = ' + valueCode(b, 'VALUE', 0, 'None') + '\n';
      case 'change_variable': return safeName(b.getFieldValue('VAR')) + ' += ' + valueCode(b, 'VALUE', 0, '1') + '\n';
      case 'if_block': case 'if_else_block': return ifCode(b);
      case 'repeat_block': return 'for _ in range(' + valueCode(b, 'TIMES', 0, '0') + '):\n' + body(b, 'DO');
      case 'while_block': return 'while ' + valueCode(b, 'COND', 0, 'False') + ':\n' + body(b, 'DO');
      case 'for_block':
        return 'for ' + safeName(b.getFieldValue('VAR'), 'i') + ' in range(' + valueCode(b, 'FROM', 0, '0') + ', ' + valueCode(b, 'TO', 0, '0') + '):\n' + body(b, 'DO');
      case 'break_block': return 'break\n';
      case 'continue_block': return 'continue\n';
      case 'create_list': return safeName(b.getFieldValue('LIST'), 'my_list') + ' = []\n';
      case 'add_to_list': return safeName(b.getFieldValue('LIST'), 'my_list') + '.append(' + valueCode(b, 'ITEM', 0, 'None') + ')\n';
      case 'buffer_block': {
        const code = decodeBuf(b.getFieldValue('CODE')).replace(/\s+$/, '');
        return (code.trim() ? code : 'pass') + '\n';
      }
      default: return '';
    }
  }

  function chainCode(first) {
    let out = '';
    for (let b = first; b; b = b.getNextBlock()) out += stmtCode(b);
    return out;
  }

  /** Python source for every top-level stack in the workspace (top to bottom). */
  function generateCode(workspace) {
    let out = '';
    for (const top of workspace.getTopBlocks(true)) {
      if (top.outputConnection) continue; // loose value blocks produce no code
      out += chainCode(top);
    }
    return out;
  }

  /* ---------------- Python AST -> Blockly serialization ---------------- */
  function astToState(ast) {
    const src = ast.source;
    const stats = { blocks: 0, buffers: 0 };

    const blk = (type, fields, inputs) => {
      stats.blocks++;
      const b = { type };
      if (fields) b.fields = fields;
      if (inputs) {
        const o = {};
        for (const k of Object.keys(inputs)) if (inputs[k]) o[k] = { block: inputs[k] };
        if (Object.keys(o).length) b.inputs = o;
      }
      return b;
    };
    const text = (n) => src.slice(n.s, n.e);
    const bufExpr = (n) => { stats.buffers++; return blk('buffer_expr_block', { CODE: text(n).replace(/\s*\n\s*/g, ' ') }); };
    const bufStmt = (n, reason) => {
      stats.buffers++;
      const col = n.col || 0;
      const lines = text(n).split('\n').map((l, i) => (i === 0 ? l : l.replace(new RegExp('^[ \\t]{0,' + col + '}'), '')));
      return blk('buffer_block', { CODE: lines.join(NL), REASON: reason || 'Not supported yet' });
    };

    const BIN = { '+': 'addition_block', '-': 'subtraction_block', '*': 'multiplication_block', '/': 'division_block', '%': 'modulo_block' };
    const CMP = ['==', '!=', '<', '>', '<=', '>='];

    function ex(n) {
      switch (n.type) {
        case 'num': return n.isFloat && Number.isInteger(n.v) ? bufExpr(n) : blk('number_block', { NUM: n.v });
        case 'str': return blk('text_block', { TEXT: n.v });
        case 'bool': return blk('bool_block', { BOOL: n.v ? 'True' : 'False' });
        case 'none': return blk('none_block');
        case 'name': return blk('get_variable', { VAR: n.name });
        case 'neg':
          if (n.op === '-' && n.v.type === 'num' && !n.v.isFloat) return blk('number_block', { NUM: -n.v.v });
          return bufExpr(n);
        case 'bin':
          return BIN[n.op] ? blk(BIN[n.op], null, { LEFT: ex(n.l), RIGHT: ex(n.r) }) : bufExpr(n);
        case 'cmp':
          return CMP.includes(n.op) ? blk('comparison_block', { OPERATOR: n.op }, { LEFT: ex(n.l), RIGHT: ex(n.r) }) : bufExpr(n);
        case 'bool_op': return blk(n.op === 'and' ? 'and_block' : 'or_block', null, { LEFT: ex(n.l), RIGHT: ex(n.r) });
        case 'not': return blk('not_block', null, { VALUE: ex(n.v) });
        case 'index':
          return n.obj.type === 'name' ? blk('get_item', { LIST: n.obj.name }, { INDEX: ex(n.index) }) : bufExpr(n);
        case 'call':
          if (n.func.type === 'name' && n.func.name === 'input' && !n.args.length && !n.kwargs.length) return blk('input_block');
          return bufExpr(n);
        default: return bufExpr(n);
      }
    }

    function body(list) { return chain(list); }

    function st(s) {
      switch (s.type) {
        case 'pass': return null;
        case 'break': return blk('break_block');
        case 'continue': return blk('continue_block');
        case 'raw': return bufStmt(s, (s.kind === 'syntax' ? 'Syntax problem: ' : '') + s.reason);
        case 'expr': {
          const e = s.expr;
          if (e.type === 'call' && e.func.type === 'name' && e.func.name === 'print' && e.args.length === 1 && !e.kwargs.length) {
            return blk('print_block', null, { VALUE: ex(e.args[0]) });
          }
          if (e.type === 'call' && e.func.type === 'attr' && e.func.name === 'append' && e.func.obj.type === 'name' && e.args.length === 1 && !e.kwargs.length) {
            return blk('add_to_list', { LIST: e.func.obj.name }, { ITEM: ex(e.args[0]) });
          }
          return bufStmt(s, 'This statement has no block yet');
        }
        case 'assign': {
          if (s.target.type !== 'name') return bufStmt(s, 'Item assignment has no block yet');
          const v = s.value, name = s.target.name;
          if (v.type === 'none') return blk('create_variable', { VAR: name });
          if (v.type === 'list' && !v.items.length) return blk('create_list', { LIST: name });
          return blk('set_variable', { VAR: name }, { VALUE: ex(v) });
        }
        case 'aug': {
          if (s.target.type !== 'name') return bufStmt(s, 'Item assignment has no block yet');
          if (s.op === '+') return blk('change_variable', { VAR: s.target.name }, { VALUE: ex(s.value) });
          if (BIN[s.op]) {
            const left = blk('get_variable', { VAR: s.target.name });
            return blk('set_variable', { VAR: s.target.name }, { VALUE: blk(BIN[s.op], null, { LEFT: left, RIGHT: ex(s.value) }) });
          }
          return bufStmt(s, 'This operator has no block yet');
        }
        case 'if': {
          const hasElse = s.orelse && s.orelse.length;
          return blk(hasElse ? 'if_else_block' : 'if_block', null, {
            COND: ex(s.test), DO: body(s.body), ELSE: hasElse ? body(s.orelse) : null
          });
        }
        case 'while': return blk('while_block', null, { COND: ex(s.test), DO: body(s.body) });
        case 'for': {
          const it = s.iter;
          const isRange = it.type === 'call' && it.func.type === 'name' && it.func.name === 'range' && !it.kwargs.length && (it.args.length === 1 || it.args.length === 2);
          if (!isRange) return bufStmt(s, 'Only "for ... in range(...)" has a block');
          if (it.args.length === 1) {
            if (s.var === '_') return blk('repeat_block', null, { TIMES: ex(it.args[0]), DO: body(s.body) });
            return blk('for_block', { VAR: s.var }, { FROM: blk('number_block', { NUM: 0 }), TO: ex(it.args[0]), DO: body(s.body) });
          }
          return blk('for_block', { VAR: s.var }, { FROM: ex(it.args[0]), TO: ex(it.args[1]), DO: body(s.body) });
        }
        default: return bufStmt(s, 'Not supported yet');
      }
    }

    function chain(list) {
      let first = null, prev = null;
      for (const s of list) {
        const b = st(s);
        if (!b) continue;
        if (prev) prev.next = { block: b }; else first = b;
        prev = b;
      }
      return first;
    }

    const rootBlock = chain(ast.body);
    if (rootBlock) { rootBlock.x = 30; rootBlock.y = 30; }
    return { state: { blocks: { languageVersion: 0, blocks: rootBlock ? [rootBlock] : [] } }, stats };
  }

  const api = { DEFS, TOOLBOX, defineBlocks, darkTheme, generateCode, astToState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Py2Blocks = api;
})(typeof window !== 'undefined' ? window : globalThis);
