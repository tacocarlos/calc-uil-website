// "Number cruncher" problems in the style of UIL Calculator Applications.
// Problems are expression trees; the LaTeX and the answer both come from the
// tree (see expr.ts). newProblem() uses the grammar in grammar.ts.

import { evaluateExpr, superscript, toLatex, type Expr } from './expr.js';
import { createGrammarGenerator } from './grammar.js';

export interface Problem {
  expr: Expr;
  /** LaTeX for display, e.g. in a read-only MathLive <math-field>. */
  latex: string;
  answer: number;
  /** Extra instruction shown with the problem, e.g. "radians". */
  note?: string;
}

/** Turn an expression into a problem. Use this for your own generators. */
export function problemFrom(expr: Expr, note?: string): Problem {
  return { expr, latex: toLatex(expr), answer: evaluateExpr(expr), ...(note && { note }) };
}

// Created on first use: grammar.ts imports this module too.
let defaultGenerator: (() => Problem) | null = null;

/** A random problem from the default grammar generator. */
export function newProblem(): Problem {
  defaultGenerator ??= createGrammarGenerator();
  return defaultGenerator();
}

/**
 * The answer format students write: 3 significant digits in scientific
 * notation, X.YZ × 10^k, always (e.g. "1.23 × 10^2", "5.00 × 10^0", "-4.56 × 10^-7").
 */
export function threeSigFigs(x: number): string {
  // toExponential rounds the mantissa and carries into the exponent (9.996 → 1.00e+1).
  const [m, e] = x.toExponential(2).split('e');
  return `${m} × 10^${Number(e)}`;
}

/** threeSigFigs as LaTeX, e.g. "9.95\times 10^{\textstyle -6}". */
export function threeSigFigsLatex(x: number): string {
  return threeSigFigs(x).replace(/ × 10\^(-?\d+)$/, (_, exp: string) => `\\times 10${superscript(exp)}`);
}

/**
 * 'exact'   — the result matches what correct keying produces
 * 'sigfigs' — only agrees to 3 significant digits (e.g. rounded intermediates)
 * null      — wrong
 */
export type Grade = 'exact' | 'sigfigs' | null;

export function grade(value: number, answer: number): Grade {
  if (Math.abs(value - answer) <= 1e-8 * Math.abs(answer)) return 'exact';
  if (threeSigFigs(value) === threeSigFigs(answer)) return 'sigfigs';
  return null;
}
