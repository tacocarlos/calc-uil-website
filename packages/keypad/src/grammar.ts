// Problem generator for this grammar:
//
//   OP   = + | - | * | /
//   P    = E | E OP P
//   E    = E OP E        (d < 4)
//        | (E)^LIT       (d < 2)
//        | LIT^E         (d < 2)
//        | \frac{E}{E}   (d < 1; distinct from the ÷ operator)
//        | F(E)
//        | LIT           (added: the grammar needs a way to stop)
//   LIT  = real numbers, e, pi
//   POS  = { x in LIT | x > 0 }
//   F    = TRIG(E) | ln(POS)
//   TRIG = sin | cos | tan | sin^-1 | cos^-1
//
// d is global to the problem: a single counter, starting at 0 for each P, that
// goes up by one every time any E expands into a rule other than LIT. Rules are
// expanded depth-first, left to right, across all the terms of P. Past
// `maxExpansions`, E can only be LIT, so F(E) chains always end.

import { evaluate } from './evaluate.js';
import {
  add, div, e, evaluateExpr, fn, frac, mul, num, pi, pow, sci, sub, toTiTokens,
  type Expr, type FunctionName,
} from './expr.js';
import { problemFrom, type Problem } from './practice.js';

/** The E productions. */
export type Production = 'binary' | 'powLit' | 'litPow' | 'frac' | 'fn' | 'lit';

/** Rules are allowed while d < limit. LIT and F(E) have no limit. */
export const PRODUCTION_LIMITS: Readonly<Record<Production, number>> = {
  binary: 4,
  powLit: 2,
  litPow: 2,
  frac: 1,
  fn: Number.POSITIVE_INFINITY,
  lit: Number.POSITIVE_INFINITY,
};

export interface GrammarOptions {
  /** Random source in [0, 1). Pass a seeded one for reproducible problems. */
  random?: () => number;
  /** Relative weights for choosing among the allowed E rules. */
  weights?: Partial<Record<Production, number>>;
  /** Chance that P continues with another `OP E` term. Default 0.35. */
  continueChance?: number;
  /** Most terms in P. Default 3. */
  maxTerms?: number;
  /** Past this many expansions, E can only be LIT. Default 6. */
  maxExpansions?: number;
  /**
   * Reject problems with fewer operators and functions than this (the grammar
   * alone allows a bare literal). Default 3.
   */
  minOperations?: number;
  /** Generates LIT. `positive` is set for POS (the argument of ln). */
  literal?: (random: () => number, positive: boolean) => Expr;
  /**
   * Reject problems you don't want; return true to keep. By default problems
   * are kept when every subexpression is finite and |answer| is in [1e-6, 1e9].
   */
  accept?: (problem: Problem) => boolean;
  /**
   * Also require that keying the problem on the TI-84 (see toTiTokens) gives
   * the same answer. Default true.
   */
  requireKeyable?: boolean;
  /** Give up after this many rejected attempts. Default 500. */
  maxAttempts?: number;
  /** Called for every E rule used, with d at the time. For debugging and tests. */
  onProduction?: (production: Production, depth: number) => void;
}

const DEFAULT_WEIGHTS: Readonly<Record<Production, number>> = {
  binary: 3,
  powLit: 1,
  litPow: 1,
  frac: 2,
  fn: 2,
  lit: 3,
};

const TRIG: readonly FunctionName[] = ['sin', 'cos', 'tan', 'asin', 'acos'];
const OPS = ['+', '-', '*', '/'] as const;
export type Op = (typeof OPS)[number];

const OP_BUILDERS: Record<Op, (l: Expr, r: Expr) => Expr> = {
  '+': add,
  '-': sub,
  '*': mul,
  '/': div,
};

/** Round to `digits` significant digits without float noise. */
const roundSig = (x: number, digits: number): number => Number(x.toPrecision(digits));

/**
 * Default LIT: e or π 8% of the time each; otherwise a real number with 2–4
 * significant digits between 0.01 and 9999, negative 15% of the time (never
 * for POS), and in scientific notation 10% of the time.
 */
export function defaultLiteral(random: () => number, positive: boolean): Expr {
  const r = random();
  if (r < 0.08) return e;
  if (r < 0.16) return pi;

  const digits = 2 + Math.floor(random() * 3);
  const sign = !positive && random() < 0.15 ? -1 : 1;
  if (random() < 0.1) {
    const exponents = [-6, -5, -4, -3, 4, 5, 6, 7, 8];
    const exponent = exponents[Math.floor(random() * exponents.length)]!;
    const mantissa = roundSig(1 + random() * 8.99, digits);
    return sci(sign * mantissa, exponent);
  }
  const magnitude = -2 + Math.floor(random() * 6); // 10^-2 … 10^3
  return num(sign * roundSig((1 + random() * 9) * 10 ** magnitude, digits));
}

class Builder {
  d = 0;

  constructor(
    private readonly random: () => number,
    private readonly weights: Readonly<Record<Production, number>>,
    private readonly maxExpansions: number,
    private readonly literal: (random: () => number, positive: boolean) => Expr,
    private readonly onProduction?: (production: Production, depth: number) => void,
  ) {}

  /** P = E | E OP P, combined with normal order of operations. */
  p(continueChance: number, maxTerms: number): Expr {
    const terms = [this.e()];
    const ops: Op[] = [];
    while (terms.length < maxTerms && this.random() < continueChance) {
      ops.push(this.op());
      terms.push(this.e());
    }
    return combineTerms(terms, ops);
  }

  e(): Expr {
    const production = this.choose();
    this.onProduction?.(production, this.d);
    if (production === 'lit') return this.literal(this.random, false);

    this.d++;
    switch (production) {
      case 'binary': {
        const left = this.e();
        const op = this.op();
        return OP_BUILDERS[op](left, this.e());
      }
      case 'powLit': return pow(this.e(), this.literal(this.random, false));
      case 'litPow': return pow(this.literal(this.random, false), this.e());
      case 'frac': {
        const n = this.e();
        return frac(n, this.e());
      }
      case 'fn': return this.f();
    }
  }

  /** F = TRIG(E) | ln(POS) */
  f(): Expr {
    if (this.random() < 0.5) return fn('ln', this.literal(this.random, true));
    const name = TRIG[Math.floor(this.random() * TRIG.length)]!;
    return fn(name, this.e());
  }

  op(): Op {
    return OPS[Math.floor(this.random() * OPS.length)]!;
  }

  choose(): Production {
    const allowed = (Object.keys(this.weights) as Production[]).filter(
      (p) =>
        this.weights[p] > 0 &&
        this.d < PRODUCTION_LIMITS[p] &&
        (p === 'lit' || this.d < this.maxExpansions),
    );
    const total = allowed.reduce((sum, p) => sum + this.weights[p], 0);
    let r = this.random() * total;
    for (const p of allowed) {
      r -= this.weights[p];
      if (r < 0) return p;
    }
    return 'lit';
  }
}

/** Build a tree from E OP E OP … with × ÷ before + −, left to right. */
export function combineTerms(terms: Expr[], ops: readonly Op[]): Expr {
  const sums: Expr[] = [terms[0]!];
  const sumOps: Op[] = [];
  ops.forEach((op, i) => {
    const term = terms[i + 1]!;
    if (op === '*' || op === '/') {
      sums.push(OP_BUILDERS[op](sums.pop()!, term));
    } else {
      sumOps.push(op);
      sums.push(term);
    }
  });
  return sumOps.reduce((acc, op, i) => OP_BUILDERS[op](acc, sums[i + 1]!), sums[0]!);
}

/** Operators and functions in the tree. */
export function countOperations(x: Expr): number {
  switch (x.type) {
    case 'num':
    case 'sci':
    case 'const':
      return 0;
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
      return 1 + countOperations(x.left) + countOperations(x.right);
    case 'frac':
      return 1 + countOperations(x.num) + countOperations(x.den);
    case 'pow':
      return 1 + countOperations(x.base) + countOperations(x.exp);
    case 'sqrt':
    case 'fn':
    case 'neg':
      return 1 + countOperations(x.arg);
  }
}

/** Every subexpression evaluates to a finite number, and no denominator is ~0. */
function wellDefined(x: Expr): boolean {
  if (!Number.isFinite(evaluateExpr(x))) return false;
  switch (x.type) {
    case 'num':
    case 'sci':
    case 'const':
      return true;
    case 'div':
      return Math.abs(evaluateExpr(x.right)) > 1e-9 && wellDefined(x.left) && wellDefined(x.right);
    case 'frac':
      return Math.abs(evaluateExpr(x.den)) > 1e-9 && wellDefined(x.num) && wellDefined(x.den);
    case 'add':
    case 'sub':
    case 'mul':
      return wellDefined(x.left) && wellDefined(x.right);
    case 'pow':
      return wellDefined(x.base) && wellDefined(x.exp);
    case 'sqrt':
    case 'fn':
    case 'neg':
      return wellDefined(x.arg);
  }
}

const defaultAccept = (problem: Problem): boolean => {
  const a = Math.abs(problem.answer);
  return wellDefined(problem.expr) && a >= 1e-6 && a <= 1e9;
};

/** True when keying the problem on the TI-84 gives the same answer. */
export function isKeyable(problem: Problem): boolean {
  try {
    const keyed = evaluate(toTiTokens(problem.expr), { ans: 0, mode: 'radian' });
    return Math.abs(keyed - problem.answer) <= 1e-9 * Math.abs(problem.answer);
  } catch {
    return false;
  }
}

const usesTrig = (x: Expr): boolean => {
  switch (x.type) {
    case 'fn':
      return x.name !== 'ln' && x.name !== 'log' ? true : usesTrig(x.arg);
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
      return usesTrig(x.left) || usesTrig(x.right);
    case 'frac':
      return usesTrig(x.num) || usesTrig(x.den);
    case 'pow':
      return usesTrig(x.base) || usesTrig(x.exp);
    case 'sqrt':
    case 'neg':
      return usesTrig(x.arg);
    default:
      return false;
  }
};

/** Returns a function that generates one problem from the grammar per call. */
export function createGrammarGenerator(options: GrammarOptions = {}): () => Problem {
  const random = options.random ?? Math.random;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const continueChance = options.continueChance ?? 0.35;
  const maxTerms = options.maxTerms ?? 3;
  const maxExpansions = options.maxExpansions ?? 6;
  const minOperations = options.minOperations ?? 3;
  const literal = options.literal ?? defaultLiteral;
  const accept = options.accept ?? defaultAccept;
  const requireKeyable = options.requireKeyable ?? true;
  const maxAttempts = options.maxAttempts ?? 500;

  return () => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const builder = new Builder(random, weights, maxExpansions, literal, options.onProduction);
      const expr = builder.p(continueChance, maxTerms);
      if (countOperations(expr) < minOperations) continue;
      const problem = problemFrom(expr, usesTrig(expr) ? 'radians' : undefined);
      if (accept(problem) && (!requireKeyable || isKeyable(problem))) return problem;
    }
    throw new Error(`No acceptable problem after ${maxAttempts} attempts; loosen the options.`);
  };
}

/** A small seeded random source (mulberry32), for reproducible problem sets. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
