// Evaluates a TI-84-style token list (as produced by the keypad) in real mode.
// Precedence, lowest → highest, matching the TI-84 Plus CE:
//   + −   →   × ÷ (and implicit ×)   →   negation ⁻   →   ^ (left-assoc)   →   ² ⁻¹   →   primary

export class CalcError extends Error {}

/**
 * Tokens for the MathPrint n/d fraction template ([alpha][X,T,θ,n]):
 * start, …numerator…, bar, …denominator…, end. The fraction is a single value.
 */
export const FRACTION = { start: 'n/d[', bar: 'n/d|', end: 'n/d]' } as const;

export const isFractionToken = (t: string | undefined): boolean =>
  t === FRACTION.start || t === FRACTION.bar || t === FRACTION.end;

/**
 * Tokens for the MathPrint exponent template ([^]): start, …exponent…, end.
 * It raises the operand right before it to the exponent.
 */
export const POWER = { start: '^[', end: '^]' } as const;

/** A token that's part of a template (n/d or exponent). */
export const isTemplateToken = (t: string | undefined): boolean =>
  isFractionToken(t) || t === POWER.start || t === POWER.end;

export type AngleMode = 'radian' | 'degree';

export interface EvalContext {
  ans: number;
  mode: AngleMode;
  x?: number;
}

type Fn = (x: number, mode: AngleMode) => number;

const toRad = (x: number, mode: AngleMode): number => (mode === 'degree' ? (x * Math.PI) / 180 : x);
const fromRad = (x: number, mode: AngleMode): number => (mode === 'degree' ? (x * 180) / Math.PI : x);

function domain(ok: boolean, value: number): number {
  if (!ok) throw new CalcError('DOMAIN');
  return value;
}

function log(x: number, fn: (x: number) => number): number {
  if (x < 0) throw new CalcError('NONREAL ANSWERS');
  if (x === 0) throw new CalcError('DOMAIN');
  return fn(x);
}

const FUNCTIONS: Readonly<Record<string, Fn>> = {
  'sin(': (x, m) => Math.sin(toRad(x, m)),
  'cos(': (x, m) => Math.cos(toRad(x, m)),
  'tan(': (x, m) => Math.tan(toRad(x, m)),
  'sin⁻¹(': (x, m) => fromRad(domain(Math.abs(x) <= 1, Math.asin(x)), m),
  'cos⁻¹(': (x, m) => fromRad(domain(Math.abs(x) <= 1, Math.acos(x)), m),
  'tan⁻¹(': (x, m) => fromRad(Math.atan(x), m),
  'ln(': (x) => log(x, Math.log),
  'log(': (x) => log(x, Math.log10),
  'e^(': (x) => Math.exp(x),
  '10^(': (x) => 10 ** x,
  '√(': (x) => {
    if (x < 0) throw new CalcError('NONREAL ANSWERS');
    return Math.sqrt(x);
  },
};

function power(base: number, exp: number): number {
  if (base === 0 && exp < 0) throw new CalcError('DIVIDE BY 0');
  if (base < 0 && !Number.isInteger(exp)) {
    // Real-mode odd roots, e.g. (⁻8)^(1/3) = ⁻2.
    const root = 1 / exp;
    if (Math.abs(root - Math.round(root)) < 1e-9 && Math.round(root) % 2 !== 0) {
      return -((-base) ** exp);
    }
    throw new CalcError('NONREAL ANSWERS');
  }
  return base ** exp;
}

type Lexeme = string | { num: number };

const DIGIT = /^[0-9.]$/;

/** Group digit tokens into number literals; everything else passes through. */
function lex(tokens: readonly string[]): Lexeme[] {
  const out: Lexeme[] = [];
  let i = 0;
  const at = (n: number): string | undefined => tokens[n];
  while (i < tokens.length) {
    const t = at(i)!;
    if (DIGIT.test(t) || t === 'ᴇ') {
      let mantissa = '';
      while (i < tokens.length && DIGIT.test(at(i)!)) mantissa += at(i++);
      if (mantissa === '.' || (mantissa.match(/\./g) ?? []).length > 1) throw new CalcError('SYNTAX');

      let exponent = '';
      if (at(i) === 'ᴇ') {
        i++;
        if (at(i) === '⁻') { exponent = '-'; i++; }
        let digits = '';
        while (i < tokens.length && /^[0-9]$/.test(at(i)!)) digits += at(i++);
        if (!digits) throw new CalcError('SYNTAX');
        exponent += digits;
      }
      out.push({ num: Number(`${mantissa || '1'}e${exponent || '0'}`) });
    } else {
      out.push(t);
      i++;
    }
  }
  return out;
}

const startsOperand = (t: Lexeme | undefined): boolean =>
  t !== undefined &&
  (typeof t === 'object' ||
    t === '(' ||
    t === FRACTION.start ||
    t === 'π' ||
    t === 'e' ||
    t === 'Ans' ||
    t === 'X' ||
    t in FUNCTIONS);

export function evaluate(tokens: readonly string[], ctx: EvalContext): number {
  const toks = lex(tokens);
  let pos = 0;
  const peek = (): Lexeme | undefined => toks[pos];
  const next = (): Lexeme | undefined => toks[pos++];

  function sum(): number {
    let v = product();
    while (peek() === '+' || peek() === '−') {
      const op = next();
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  function product(): number {
    let v = negation();
    while (true) {
      const t = peek();
      if (t === '×') { next(); v *= negation(); }
      else if (t === '÷') {
        next();
        const r = negation();
        if (r === 0) throw new CalcError('DIVIDE BY 0');
        v /= r;
      } else if (startsOperand(t) || t === '⁻') {
        v *= negation(); // implicit multiplication, e.g. 2π or 3(4)
      } else {
        return v;
      }
    }
  }

  function negation(): number {
    if (peek() === '⁻') { next(); return -negation(); }
    return exponentiation();
  }

  function exponentiation(): number {
    let v = postfix();
    while (peek() === '^' || peek() === POWER.start) {
      if (next() === POWER.start) {
        // Exponent template: the whole exponent is inside it.
        const exp = sum();
        expect(POWER.end);
        v = power(v, exp);
        continue;
      }
      // Classic ^ token (still accepted).
      let sign = 1;
      while (peek() === '⁻') { next(); sign = -sign; }
      v = power(v, sign * postfix());
    }
    return v;
  }

  function postfix(): number {
    let v = primary();
    while (true) {
      if (peek() === '²') { next(); v *= v; }
      else if (peek() === '⁻¹') {
        next();
        if (v === 0) throw new CalcError('DIVIDE BY 0');
        v = 1 / v;
      } else return v;
    }
  }

  function closeParen(): void {
    // Like the TI, a closing parenthesis may be omitted at the end of the line
    // or of a template part (numerator, denominator, exponent).
    const t = peek();
    if (t === ')') next();
    else if (pos < toks.length && t !== FRACTION.bar && t !== FRACTION.end && t !== POWER.end) {
      throw new CalcError('SYNTAX');
    }
  }

  function expect(token: string): void {
    if (next() !== token) throw new CalcError('SYNTAX');
  }

  function primary(): number {
    const t = next();
    if (t === undefined) throw new CalcError('SYNTAX');
    if (typeof t === 'object') return t.num;
    if (t === 'π') return Math.PI;
    if (t === 'e') return Math.E;
    if (t === 'Ans') return ctx.ans;
    if (t === 'X') return ctx.x ?? 0;
    if (t === '(') {
      const v = sum();
      closeParen();
      return v;
    }
    if (t === FRACTION.start) {
      const n = sum();
      expect(FRACTION.bar);
      const d = sum();
      expect(FRACTION.end);
      if (d === 0) throw new CalcError('DIVIDE BY 0');
      return n / d;
    }
    const fn = FUNCTIONS[t];
    if (fn) {
      const arg = sum();
      closeParen();
      return fn(arg, ctx.mode);
    }
    throw new CalcError('SYNTAX');
  }

  if (toks.length === 0) throw new CalcError('SYNTAX');
  const result = sum();
  if (pos < toks.length) throw new CalcError('SYNTAX');
  if (Number.isNaN(result)) throw new CalcError('DOMAIN');
  if (!Number.isFinite(result) || Math.abs(result) >= 1e100) throw new CalcError('OVERFLOW');
  // The TI-84 carries 14 significant digits internally.
  return Number(result.toPrecision(14));
}

/** Format like the TI-84 Plus CE in NORMAL FLOAT mode (10 significant digits). */
export function formatResult(x: number): string {
  if (x === 0) return '0';
  const neg = x < 0 ? '⁻' : '';
  const a = Math.abs(x);
  const rounded = Number(a.toPrecision(10));

  if (rounded >= 1e10 || rounded < 1e-3) {
    const [m = '', e = '0'] = rounded.toExponential(9).split('e');
    const exp = Number(e);
    return `${neg}${m.replace(/\.?0+$/, '')}ᴇ${exp < 0 ? '⁻' : ''}${Math.abs(exp)}`;
  }

  let s = rounded.toPrecision(10);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  if (s.startsWith('0.')) s = s.slice(1); // TI shows .5, not 0.5
  return neg + s;
}
