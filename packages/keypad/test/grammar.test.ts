import { validateLatex } from 'mathlive/ssr';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { tokensToText } from '../src/home-screen.js';
import { add, div, e, evaluateExpr, fn, frac, mul, num, pi, pow, sci, sub, toLatex, toTiTokens } from '../src/expr.js';
import {
  combineTerms,
  countOperations,
  createGrammarGenerator,
  isKeyable,
  PRODUCTION_LIMITS,
  type Production,
  seededRandom,
} from '../src/grammar.js';

const key = (x: Parameters<typeof toTiTokens>[0]) => evaluate(toTiTokens(x), { ans: 0, mode: 'radian' });

describe('grammar depth (d is global to each problem)', () => {
  it('only uses a rule while d is under its limit, with one counter per problem', () => {
    const random = seededRandom(1);
    for (let i = 0; i < 2000; i++) {
      const used: { production: Production; depth: number }[] = [];
      // One attempt per call, nothing filtered, so `used` covers exactly one problem.
      const generate = createGrammarGenerator({
        random,
        maxAttempts: 1,
        minOperations: 0,
        requireKeyable: false,
        accept: () => true,
        onProduction: (production, depth) => used.push({ production, depth }),
      });
      generate();

      let expansions = 0;
      for (const { production, depth } of used) {
        expect(depth).toBeLessThan(PRODUCTION_LIMITS[production]);
        // Global: d equals the number of non-LIT expansions made so far in this problem.
        expect(depth).toBe(expansions);
        if (production !== 'lit') expansions++;
      }
      expect(expansions).toBeLessThanOrEqual(6); // maxExpansions
    }
  });

  it('uses frac only as the first expansion of a problem', () => {
    const random = seededRandom(2);
    let fracs = 0;
    for (let i = 0; i < 2000; i++) {
      createGrammarGenerator({
        random,
        maxAttempts: 1,
        minOperations: 0,
        requireKeyable: false,
        accept: () => true,
        onProduction: (production, depth) => {
          if (production === 'frac') {
            fracs++;
            expect(depth).toBe(0);
          }
        },
      })();
    }
    expect(fracs).toBeGreaterThan(0);
  });
});

describe('generated problems', () => {
  const generate = createGrammarGenerator({ random: seededRandom(3) });
  const problems = Array.from({ length: 2000 }, generate);

  it('have valid LaTeX', () => {
    for (const p of problems) expect(validateLatex(p.latex), p.latex).toEqual([]);
  });

  it('can be keyed on the TI-84 to get the answer', () => {
    for (const p of problems) {
      const keyed = key(p.expr);
      expect(Math.abs(keyed - p.answer), p.latex).toBeLessThanOrEqual(1e-9 * Math.abs(p.answer));
      expect(isKeyable(p)).toBe(true);
    }
  });

  it('meet the default constraints', () => {
    for (const p of problems) {
      expect(Math.abs(p.answer)).toBeGreaterThanOrEqual(1e-6);
      expect(Math.abs(p.answer)).toBeLessThanOrEqual(1e9);
      expect(countOperations(p.expr)).toBeGreaterThanOrEqual(3);
    }
  });

  it('note radians exactly when trig is involved', () => {
    for (const p of problems) {
      expect(p.note === 'radians').toBe(/\\(sin|cos|tan)/.test(p.latex));
    }
  });

  it('are reproducible from a seed', () => {
    const a = createGrammarGenerator({ random: seededRandom(99) });
    const b = createGrammarGenerator({ random: seededRandom(99) });
    for (let i = 0; i < 50; i++) expect(a().latex).toBe(b().latex);
  });

  it('respect custom weights', () => {
    const noTrig = createGrammarGenerator({ random: seededRandom(4), weights: { fn: 0 } });
    for (let i = 0; i < 300; i++) expect(noTrig().latex).not.toMatch(/\\(sin|cos|tan|ln)/);
  });
});

describe('P combines terms with normal order of operations', () => {
  it.each([
    [[2, 3, 4], ['+', '*'], 14],
    [[2, 3, 4], ['*', '+'], 10],
    [[10, 4, 1], ['-', '-'], 5],
    [[24, 4, 2], ['/', '/'], 3],
    [[1, 2, 3, 4], ['-', '*', '+'], -1],
  ] as const)('%j %j = %d', (values, ops, expected) => {
    expect(evaluateExpr(combineTerms(values.map(num), ops))).toBe(expected);
  });
});

describe('toTiTokens', () => {
  it.each([
    // A stacked fraction is keyed with the n/d template, a single value: 3 ÷ (1/2) = 6.
    [div(3, frac(1, 2)), '3÷(1)/(2)', 6],
    [pow(fn('sin', 2), 2), '(sin(2))^(2)', Math.sin(2) ** 2],
    [pow(2, sub(1, 3)), '2^(1−3)', 0.25],
    [pow(pow(2, 3), 2), '(2^(3))^(2)', 64],
    [sub(5, -3), '5−(⁻3)', 8],
    [mul(sci(2.5, -3), 4), '2.5ᴇ⁻3×4', 0.01],
    [pow(e, fn('asin', 0.5)), 'e^(sin⁻¹(.5))', Math.E ** Math.asin(0.5)],
    [add(pi, frac(fn('ln', 2), 3)), 'π+(ln(2))/(3)', Math.PI + Math.log(2) / 3],
    [pow(frac(1, 2), 3), '((1)/(2))^(3)', 0.125],
  ])('%#', (tree, keys, value) => {
    // tokensToText writes n/d templates as (n)/(d).
    expect(tokensToText(toTiTokens(tree)).replace('0.', '.')).toBe(keys);
    expect(key(tree)).toBeCloseTo(value, 12);
  });

  it('renders inverse trig and parenthesised powers in LaTeX', () => {
    expect(toLatex(fn('acos', 0.5))).toBe('\\cos^{-1}\\left(0.5\\right)');
    expect(toLatex(pow(fn('sin', 2), 2))).toBe('\\left(\\sin\\left(2\\right)\\right)^{\\textstyle 2}');
  });
});
