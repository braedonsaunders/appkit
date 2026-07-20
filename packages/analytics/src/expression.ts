import type { AggregateFunction, FormulaExpression } from './types'

const AGGREGATES = new Set<AggregateFunction>(['count', 'count_distinct', 'sum', 'avg', 'min', 'max'])
export const FORMULA_FUNCTIONS = [
  'now', 'current_date', 'coalesce', 'nullif', 'abs', 'round', 'ceil', 'floor',
  'power', 'sqrt', 'lower', 'upper', 'length', 'trim', 'concat', 'datediff', 'datetrunc', 'datepart',
] as const
const FUNCTIONS = new Set<string>(FORMULA_FUNCTIONS)
export const FORMULA_FUNCTION_ARITY: Record<(typeof FORMULA_FUNCTIONS)[number], { min: number; max: number }> = {
  now: { min: 0, max: 0 }, current_date: { min: 0, max: 0 },
  coalesce: { min: 2, max: 20 }, nullif: { min: 2, max: 2 },
  abs: { min: 1, max: 1 }, round: { min: 1, max: 2 }, ceil: { min: 1, max: 1 },
  floor: { min: 1, max: 1 }, power: { min: 2, max: 2 }, sqrt: { min: 1, max: 1 },
  lower: { min: 1, max: 1 }, upper: { min: 1, max: 1 }, length: { min: 1, max: 1 },
  trim: { min: 1, max: 1 }, concat: { min: 1, max: 20 },
  datediff: { min: 3, max: 3 }, datetrunc: { min: 2, max: 2 }, datepart: { min: 2, max: 2 },
}
export function validFormulaFunctionArity(fn: string, count: number): boolean {
  const rule = FORMULA_FUNCTION_ARITY[fn as keyof typeof FORMULA_FUNCTION_ARITY]
  return !!rule && count >= rule.min && count <= rule.max
}

export const FORMULA_HELP: Record<string, { signature: string; description: string }> = {
  count: { signature: 'count()', description: 'Count rows.' },
  count_distinct: { signature: 'count_distinct([Field])', description: 'Count unique values.' },
  sum: { signature: 'sum([Field])', description: 'Add numeric values.' },
  avg: { signature: 'avg([Field])', description: 'Average numeric values.' },
  min: { signature: 'min([Field])', description: 'Smallest value.' },
  max: { signature: 'max([Field])', description: 'Largest value.' },
  now: { signature: 'now()', description: 'Current date and time.' },
  datediff: { signature: 'datediff("day", start, end)', description: 'Whole date units between values.' },
  datetrunc: { signature: 'datetrunc("month", date)', description: 'Start of a date unit.' },
  coalesce: { signature: 'coalesce(a, b)', description: 'First non-null value.' },
  case: { signature: 'case(condition, value, otherwise)', description: 'Conditional value.' },
}

type Token =
  | { type: 'number'; value: number; position: number }
  | { type: 'string'; value: string; position: number }
  | { type: 'field'; value: string; position: number }
  | { type: 'identifier'; value: string; position: number }
  | { type: 'operator'; value: string; position: number }
  | { type: 'keyword'; value: 'and' | 'or' | 'not'; position: number }
  | { type: 'left' | 'right' | 'comma' | 'end'; position: number }

class FormulaError extends Error {
  constructor(message: string, readonly position: number) { super(message) }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const char = input[i]!
    if (/\s/.test(char)) { i++; continue }
    const position = i
    if (/[0-9]/.test(char)) {
      let end = i + 1
      while (end < input.length && /[0-9.]/.test(input[end]!)) end++
      const value = Number(input.slice(i, end))
      if (!Number.isFinite(value)) throw new FormulaError('Invalid number', position)
      tokens.push({ type: 'number', value, position }); i = end; continue
    }
    if (char === '"' || char === "'") {
      let end = i + 1; let value = ''
      while (end < input.length && input[end] !== char) {
        if (input[end] === '\\' && end + 1 < input.length) { value += input[end + 1]; end += 2 }
        else value += input[end++]
      }
      if (end >= input.length) throw new FormulaError('Unterminated string', position)
      tokens.push({ type: 'string', value, position }); i = end + 1; continue
    }
    if (char === '[') {
      const end = input.indexOf(']', i + 1)
      if (end === -1) throw new FormulaError('Unclosed field reference', position)
      tokens.push({ type: 'field', value: input.slice(i + 1, end).trim(), position }); i = end + 1; continue
    }
    if (/[a-zA-Z_]/.test(char)) {
      let end = i + 1
      while (end < input.length && /[a-zA-Z0-9_]/.test(input[end]!)) end++
      const value = input.slice(i, end); const lower = value.toLowerCase()
      if (lower === 'and' || lower === 'or' || lower === 'not') tokens.push({ type: 'keyword', value: lower, position })
      else tokens.push({ type: 'identifier', value, position })
      i = end; continue
    }
    const pair = input.slice(i, i + 2)
    if (['!=', '<=', '>=', '<>'].includes(pair)) {
      tokens.push({ type: 'operator', value: pair === '<>' ? '!=' : pair, position }); i += 2; continue
    }
    if ('+-*/=<>'.includes(char)) { tokens.push({ type: 'operator', value: char, position }); i++; continue }
    if (char === '(') tokens.push({ type: 'left', position })
    else if (char === ')') tokens.push({ type: 'right', position })
    else if (char === ',') tokens.push({ type: 'comma', position })
    else throw new FormulaError(`Unexpected character "${char}"`, position)
    i++
  }
  tokens.push({ type: 'end', position: input.length })
  return tokens
}

type ParseOptions = { resolveField: (label: string) => string | null }
const PRECEDENCE: Record<string, number> = { '=': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': 5 }

class Parser {
  private index = 0
  constructor(private readonly tokens: Token[], private readonly options: ParseOptions) {}
  private peek() { return this.tokens[this.index]! }
  private next() { return this.tokens[this.index++]! }
  private expect(type: Token['type']) { const token = this.peek(); if (token.type !== type) throw new FormulaError(`Expected ${type}`, token.position); return this.next() }
  parse(): FormulaExpression { const expression = this.parseOr(); if (this.peek().type !== 'end') throw new FormulaError('Unexpected trailing input', this.peek().position); return expression }
  private parseOr(): FormulaExpression { let left = this.parseAnd(); for (;;) { const token = this.peek(); if (token.type !== 'keyword' || token.value !== 'or') return left; this.next(); left = { expression: 'logic', operator: 'or', arguments: [left, this.parseAnd()] } } }
  private parseAnd(): FormulaExpression { let left = this.parseNot(); for (;;) { const token = this.peek(); if (token.type !== 'keyword' || token.value !== 'and') return left; this.next(); left = { expression: 'logic', operator: 'and', arguments: [left, this.parseNot()] } } }
  private parseNot(): FormulaExpression { const token = this.peek(); if (token.type === 'keyword' && token.value === 'not') { this.next(); return { expression: 'logic', operator: 'not', arguments: [this.parseNot()] } } return this.parseBinary(3) }
  private parseBinary(minimum: number): FormulaExpression {
    let left = this.parseUnary()
    for (;;) {
      const token = this.peek(); if (token.type !== 'operator') break
      const precedence = PRECEDENCE[token.value]
      if (precedence == null || precedence < minimum) break
      this.next(); const right = this.parseBinary(precedence + 1)
      left = ['+', '-', '*', '/'].includes(token.value)
        ? { expression: 'arithmetic', operator: token.value as '+' | '-' | '*' | '/', left, right }
        : { expression: 'compare', operator: token.value as '=' | '!=' | '<' | '<=' | '>' | '>=', left, right }
    }
    return left
  }
  private parseUnary(): FormulaExpression { const token = this.peek(); if (token.type === 'operator' && token.value === '-') { this.next(); return { expression: 'arithmetic', operator: '-', left: { expression: 'literal', value: 0 }, right: this.parseUnary() } } return this.parsePrimary() }
  private parsePrimary(): FormulaExpression {
    const token = this.next()
    if (token.type === 'number' || token.type === 'string') return { expression: 'literal', value: token.value }
    if (token.type === 'field') { const field = this.options.resolveField(token.value); if (!field) throw new FormulaError(`Unknown field "${token.value}"`, token.position); return { expression: 'field', field } }
    if (token.type === 'left') { const value = this.parseOr(); this.expect('right'); return value }
    if (token.type === 'identifier') return this.parseCall(token.value, token.position)
    throw new FormulaError('Expected a value', token.position)
  }
  private parseCall(name: string, position: number): FormulaExpression {
    this.expect('left'); const args: FormulaExpression[] = []
    if (this.peek().type !== 'right') { args.push(this.parseOr()); while (this.peek().type === 'comma') { this.next(); args.push(this.parseOr()) } }
    this.expect('right'); const fn = name.toLowerCase()
    if (fn === 'if') { if (args.length !== 3) throw new FormulaError('if() requires three arguments', position); return { expression: 'case', branches: [{ when: args[0]!, then: args[1]! }], otherwise: args[2] } }
    if (fn === 'case') { const branches: { when: FormulaExpression; then: FormulaExpression }[] = []; let cursor = 0; while (cursor + 1 < args.length) { branches.push({ when: args[cursor]!, then: args[cursor + 1]! }); cursor += 2 } if (!branches.length) throw new FormulaError('case() requires a condition and value', position); return { expression: 'case', branches, otherwise: args[cursor] } }
    if (fn === 'isnull' || fn === 'isnotnull') { if (args.length !== 1) throw new FormulaError(`${fn}() requires one argument`, position); return { expression: 'null', argument: args[0]!, negated: fn === 'isnotnull' } }
    if (AGGREGATES.has(fn as AggregateFunction)) {
      if (fn === 'count' && args.length !== 0) throw new FormulaError('count() does not accept arguments', position)
      if (fn !== 'count' && args.length !== 1) throw new FormulaError(`${fn}() requires exactly one expression`, position)
      return { expression: 'aggregate', fn: fn as AggregateFunction, argument: args[0] }
    }
    if (FUNCTIONS.has(fn)) {
      if (!validFormulaFunctionArity(fn, args.length)) throw new FormulaError(`${fn}() has the wrong number of arguments`, position)
      return { expression: 'call', fn, arguments: args }
    }
    throw new FormulaError(`Unknown function "${name}"`, position)
  }
}

export type FormulaParseResult = { ok: true; expression: FormulaExpression } | { ok: false; error: string; position: number }
export function parseFormula(input: string, options: ParseOptions): FormulaParseResult {
  if (!input.trim()) return { ok: false, error: 'Empty formula', position: 0 }
  try { return { ok: true, expression: new Parser(tokenize(input.trim()), options).parse() } }
  catch (error) { return error instanceof FormulaError ? { ok: false, error: error.message, position: error.position } : { ok: false, error: 'Could not parse formula', position: 0 } }
}

export function serializeFormula(expression: FormulaExpression, labelForField: (key: string) => string): string {
  const render = (item: FormulaExpression): string => {
    switch (item.expression) {
      case 'field': return `[${labelForField(item.field)}]`
      case 'literal': return typeof item.value === 'string' ? JSON.stringify(item.value) : String(item.value)
      case 'arithmetic': case 'compare': return `(${render(item.left)} ${item.operator} ${render(item.right)})`
      case 'null': return `${item.negated ? 'isnotnull' : 'isnull'}(${render(item.argument)})`
      case 'logic': return item.operator === 'not' ? `not ${render(item.arguments[0]!)}` : `(${item.arguments.map(render).join(` ${item.operator} `)})`
      case 'case': return `case(${item.branches.flatMap((branch) => [render(branch.when), render(branch.then)]).concat(item.otherwise ? [render(item.otherwise)] : []).join(', ')})`
      case 'call': return `${item.fn}(${item.arguments.map(render).join(', ')})`
      case 'aggregate': return item.fn === 'count' ? 'count()' : `${item.fn}(${item.argument ? render(item.argument) : ''})`
    }
  }
  return render(expression)
}
