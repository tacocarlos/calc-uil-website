// Expression trees for generated problems. One tree produces both the LaTeX
// shown to the student and the exact answer, so they can't drift apart.

import { FRACTION, POWER as POWER_TEMPLATE } from './evaluate.js';

export type FunctionName = 'ln' | 'log' | 'sin' | 'cos' | 'tan' | 'asin' | 'acos';

export type Expr =
  | { type: 'num'; value: number }
  /** mantissa × 10^exponent, shown in scientific notation */
  | { type: 'sci'; mantissa: number; exponent: number }
  | { type: 'const'; name: 'pi' | 'e' }
  | { type: 'add' | 'sub' | 'mul' | 'div'; left: Expr; right: Expr }
  /** Stacked fraction (div is the inline ÷ sign). */
  | { type: 'frac'; num: Expr; den: Expr }
  | { type: 'pow'; base: Expr; exp: Expr }
  | { type: 'sqrt'; arg: Expr }
  | { type: 'fn'; name: FunctionName; arg: Expr }
  | { type: 'neg'; arg: Expr };

// ---------- Builders ----------

export const num = (value: number): Expr => ({ type: 'num', value });
export const sci = (mantissa: number, exponent: number): Expr => ({ type: 'sci', mantissa, exponent });
export const pi: Expr = { type: 'const', name: 'pi' };
export const e: Expr = { type: 'const', name: 'e' };

type Operand = Expr | number;
const lift = (x: Operand): Expr => (typeof x === 'number' ? num(x) : x);

export const add = (left: Operand, right: Operand): Expr => ({ type: 'add', left: lift(left), right: lift(right) });
export const sub = (left: Operand, right: Operand): Expr => ({ type: 'sub', left: lift(left), right: lift(right) });
export const mul = (left: Operand, right: Operand): Expr => ({ type: 'mul', left: lift(left), right: lift(right) });
export const div = (left: Operand, right: Operand): Expr => ({ type: 'div', left: lift(left), right: lift(right) });
export const frac = (n: Operand, d: Operand): Expr => ({ type: 'frac', num: lift(n), den: lift(d) });
export const pow = (base: Operand, exp: Operand): Expr => ({ type: 'pow', base: lift(base), exp: lift(exp) });
export const sqrt = (arg: Operand): Expr => ({ type: 'sqrt', arg: lift(arg) });
export const fn = (name: FunctionName, arg: Operand): Expr => ({ type: 'fn', name, arg: lift(arg) });
export const neg = (arg: Operand): Expr => ({ type: 'neg', arg: lift(arg) });
/** e^x */
export const exp = (arg: Operand): Expr => pow(e, arg);

// ---------- Evaluation ----------

/** Exact value of the expression (trig in radians). NaN if out of domain. */
export function evaluateExpr(x: Expr): number {
  switch (x.type) {
    case 'num': return x.value;
    case 'sci': return x.mantissa * 10 ** x.exponent;
    case 'const': return x.name === 'pi' ? Math.PI : Math.E;
    case 'add': return evaluateExpr(x.left) + evaluateExpr(x.right);
    case 'sub': return evaluateExpr(x.left) - evaluateExpr(x.right);
    case 'mul': return evaluateExpr(x.left) * evaluateExpr(x.right);
    case 'div': return evaluateExpr(x.left) / evaluateExpr(x.right);
    case 'frac': return evaluateExpr(x.num) / evaluateExpr(x.den);
    case 'pow': return evaluateExpr(x.base) ** evaluateExpr(x.exp);
    case 'sqrt': return Math.sqrt(evaluateExpr(x.arg));
    case 'neg': return -evaluateExpr(x.arg);
    case 'fn': {
      const v = evaluateExpr(x.arg);
      switch (x.name) {
        case 'ln': return Math.log(v);
        case 'log': return Math.log10(v);
        case 'sin': return Math.sin(v);
        case 'cos': return Math.cos(v);
        case 'tan': return Math.tan(v);
        case 'asin': return Math.asin(v);
        case 'acos': return Math.acos(v);
      }
    }
  }
}

// ---------- LaTeX ----------

// Binding strength, used to decide where parentheses are needed.
const SUM = 1;
const PRODUCT = 2;
const NEGATION = 3;
const POWER = 4;
const ATOM = 5;

function precedence(x: Expr): number {
  switch (x.type) {
    case 'add':
    case 'sub': return SUM;
    case 'mul':
    case 'div':
    case 'sci': return PRODUCT;
    case 'neg': return NEGATION;
    case 'num': return x.value < 0 ? NEGATION : ATOM;
    case 'pow': return POWER;
    default: return ATOM;
  }
}

const paren = (latex: string): string => `\\left(${latex}\\right)`;

/**
 * A superscript at full size. TeX normally shrinks exponents to ~70%, which
 * makes them hard to read at problem size; \textstyle keeps them pronounced.
 */
export const superscript = (latex: string): string => `^{\\textstyle ${latex}}`;

const isNegative = (x: Expr): boolean => x.type === 'neg' || (x.type === 'num' && x.value < 0);

/** A base or exponent that needs no parentheses: a non-negative number or a constant. */
const isPlainBase = (x: Expr): boolean => (x.type === 'num' && x.value >= 0) || x.type === 'const';

/** LaTeX for `x`, parenthesised if it binds looser than `min`. */
function operand(x: Expr, min: number): string {
  const latex = toLatex(x);
  return precedence(x) < min ? paren(latex) : latex;
}

/** Right-hand operand: also parenthesise negatives, so a − (−3) never prints as a − −3. */
function rightOperand(x: Expr, min: number): string {
  return isNegative(x) ? paren(toLatex(x)) : operand(x, min);
}

function formatNumber(value: number): string {
  // Generated values are already rounded; avoid exponent notation and float noise.
  const s = Number(value.toPrecision(12)).toString();
  if (!/e/i.test(s)) return s;
  return value.toFixed(20).replace(/\.?0+$/, '');
}

const FUNCTION_LATEX: Record<FunctionName, string> = {
  ln: '\\ln',
  log: '\\log',
  sin: '\\sin',
  cos: '\\cos',
  tan: '\\tan',
  asin: '\\sin^{-1}',
  acos: '\\cos^{-1}',
};

export function toLatex(x: Expr): string {
  switch (x.type) {
    case 'num': return formatNumber(x.value);
    case 'sci': return `${formatNumber(x.mantissa)}\\times 10${superscript(String(x.exponent))}`;
    // Commands end with a space so a following letter (e.g. e) isn't read as part of the name.
    case 'const': return x.name === 'pi' ? '\\pi ' : 'e';
    case 'add': return `${operand(x.left, SUM)}+${rightOperand(x.right, PRODUCT)}`;
    case 'sub': return `${operand(x.left, SUM)}-${rightOperand(x.right, PRODUCT)}`;
    case 'mul': return `${operand(x.left, PRODUCT)}\\times ${rightOperand(x.right, POWER)}`;
    case 'div': return `${operand(x.left, PRODUCT)}\\div ${rightOperand(x.right, POWER)}`;
    case 'frac': return `\\frac{${toLatex(x.num)}}{${toLatex(x.den)}}`;
    // Only plain positive numbers and constants go unparenthesised, so
    // (−2)², (a/b)³, (1.2×10⁴)² and (sin(x))² all keep their parentheses.
    case 'pow': {
      const base = isPlainBase(x.base) ? toLatex(x.base) : paren(toLatex(x.base));
      return `${base}${superscript(toLatex(x.exp))}`;
    }
    case 'sqrt': return `\\sqrt{${toLatex(x.arg)}}`;
    case 'fn': return `${FUNCTION_LATEX[x.name]}${paren(toLatex(x.arg))}`;
    case 'neg': return `-${operand(x.arg, POWER)}`;
  }
}

// ---------- TI-84 keystrokes ----------

const TI_FUNCTIONS: Record<FunctionName, string> = {
  ln: 'ln(',
  log: 'log(',
  sin: 'sin(',
  cos: 'cos(',
  tan: 'tan(',
  asin: 'sin⁻¹(',
  acos: 'cos⁻¹(',
};


const tiParen = (tokens: string[]): string[] => ['(', ...tokens, ')'];

function tiOperand(x: Expr, min: number): string[] {
  const tokens = toTiTokens(x);
  return precedence(x) < min ? tiParen(tokens) : tokens;
}

function tiRightOperand(x: Expr, min: number): string[] {
  return isNegative(x) ? tiParen(toTiTokens(x)) : tiOperand(x, min);
}

function tiNumber(value: number): string[] {
  return [...(value < 0 ? ['⁻'] : []), ...formatNumber(Math.abs(value))];
}

/**
 * The keystrokes a student would enter on a TI-84 Plus CE (in radian mode),
 * as home-screen tokens. `evaluate(toTiTokens(x), …)` should equal evaluateExpr(x).
 */
export function toTiTokens(x: Expr): string[] {
  switch (x.type) {
    case 'num': return tiNumber(x.value);
    case 'sci': return [...tiNumber(x.mantissa), 'ᴇ', ...tiNumber(x.exponent)];
    case 'const': return [x.name === 'pi' ? 'π' : 'e'];
    case 'add': return [...tiOperand(x.left, SUM), '+', ...tiRightOperand(x.right, PRODUCT)];
    case 'sub': return [...tiOperand(x.left, SUM), '−', ...tiRightOperand(x.right, PRODUCT)];
    case 'mul': return [...tiOperand(x.left, PRODUCT), '×', ...tiRightOperand(x.right, POWER)];
    case 'div': return [...tiOperand(x.left, PRODUCT), '÷', ...tiRightOperand(x.right, POWER)];
    // Keyed with the n/d template ([alpha][X,T,θ,n]), which is a single value.
    case 'frac': return [FRACTION.start, ...toTiTokens(x.num), FRACTION.bar, ...toTiTokens(x.den), FRACTION.end];
    case 'pow': {
      // Keyed with the exponent template ([^]), which holds the whole exponent.
      // It applies to the operand right before it, so a compound base needs parentheses.
      const base = isPlainBase(x.base) ? toTiTokens(x.base) : tiParen(toTiTokens(x.base));
      return [...base, POWER_TEMPLATE.start, ...toTiTokens(x.exp), POWER_TEMPLATE.end];
    }
    case 'sqrt': return ['√(', ...toTiTokens(x.arg), ')'];
    case 'fn': return [TI_FUNCTIONS[x.name], ...toTiTokens(x.arg), ')'];
    case 'neg': return ['⁻', ...tiOperand(x.arg, POWER)];
  }
}
