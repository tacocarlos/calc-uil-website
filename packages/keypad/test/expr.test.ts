import { validateLatex } from 'mathlive/ssr';
import { describe, expect, it } from 'vitest';
import {
  add, div, e, evaluateExpr, exp, fn, frac, mul, neg, num, pi, pow, sci, sqrt, sub, toLatex,
} from '../src/expr.js';
import { newProblem, problemFrom, threeSigFigs, threeSigFigsLatex } from '../src/practice.js';

describe('toLatex', () => {
  it.each([
    // The bug this replaces: a scientific-notation numerator over a denominator.
    [frac(sci(9.95, -6), 75.65), '\\frac{9.95\\times 10^{\\textstyle -6}}{75.65}'],
    [sub(mul(3.5, pow(2.25, 2)), -120.5), '3.5\\times 2.25^{\\textstyle 2}-\\left(-120.5\\right)'],
    [add(sqrt(81), frac(1, 2)), '\\sqrt{81}+\\frac{1}{2}'],
    [mul(fn('ln', 20), 3), '\\ln\\left(20\\right)\\times 3'],
    [sub(exp(1.5), 4), 'e^{\\textstyle 1.5}-4'],
    [pow(-2, 2), '\\left(-2\\right)^{\\textstyle 2}'],
    [pow(sci(1.2, 4), 2), '\\left(1.2\\times 10^{\\textstyle 4}\\right)^{\\textstyle 2}'],
    [pow(frac(1, 2), 3), '\\left(\\frac{1}{2}\\right)^{\\textstyle 3}'],
    [sub(10, sub(4, 1)), '10-\\left(4-1\\right)'],
    [sub(sub(10, 4), 1), '10-4-1'],
    [mul(add(1, 2), 3), '\\left(1+2\\right)\\times 3'],
    [div(8, mul(2, 2)), '8\\div \\left(2\\times 2\\right)'],
    [neg(pow(2, 2)), '-2^{\\textstyle 2}'],
    [mul(2, pi), '2\\times \\pi '],
    // Regression: \\times followed by e must not merge into an unknown \\timese command.
    [div(mul(2, e), e), '2\\times e\\div e'],
    [num(0.000012), '0.000012'],
  ])('%#', (tree, latex) => {
    expect(toLatex(tree)).toBe(latex);
  });
});

describe('evaluateExpr', () => {
  it('evaluates trees', () => {
    expect(evaluateExpr(frac(sci(9.95, -6), 75.65))).toBeCloseTo(1.3153e-7, 10);
    expect(evaluateExpr(sub(10, sub(4, 1)))).toBe(7);
    expect(evaluateExpr(neg(pow(2, 2)))).toBe(-4);
    expect(evaluateExpr(pow(e, 1))).toBe(Math.E);
  });
});

describe('generated problems', () => {
  it('always produce valid LaTeX and a finite answer', () => {
    for (let i = 0; i < 500; i++) {
      const p = newProblem();
      expect(validateLatex(p.latex), p.latex).toEqual([]);
      // No JS exponent notation like 1e-7 (a digit right before e; the constant e is fine).
      expect(p.latex).not.toMatch(/NaN|undefined|Infinity|\de[+-]?\d/);
      expect(Number.isFinite(p.answer), p.latex).toBe(true);
      expect(p.answer).toBe(evaluateExpr(p.expr));
    }
  });

  it('builds problems from custom trees', () => {
    expect(problemFrom(frac(1, 4), 'note')).toEqual({ expr: frac(1, 4), latex: '\\frac{1}{4}', answer: 0.25, note: 'note' });
  });
});

describe('answer formatting', () => {
  it.each([
    [1.3153e-7, '1.32 × 10^-7'],
    [123.456, '1.23 × 10^2'],
    [5, '5.00 × 10^0'],
    [0.5, '5.00 × 10^-1'],
    [-4382.85, '-4.38 × 10^3'],
    [9.996, '1.00 × 10^1'], // rounding carries into the exponent
    [999.6e6, '1.00 × 10^9'],
    [0, '0.00 × 10^0'],
  ])('always writes %d as X.YZ × 10^k: %s', (x, text) => {
    expect(threeSigFigs(x)).toBe(text);
  });

  it('has a LaTeX form with a pronounced exponent', () => {
    expect(threeSigFigsLatex(1.3153e-7)).toBe('1.32\\times 10^{\\textstyle -7}');
    expect(threeSigFigsLatex(123.456)).toBe('1.23\\times 10^{\\textstyle 2}');
  });

  it('always matches the X.YZ × 10^k pattern for generated answers', () => {
    for (let i = 0; i < 500; i++) {
      expect(threeSigFigs(newProblem().answer)).toMatch(/^-?\d\.\d\d × 10\^-?\d+$/);
    }
  });
});
