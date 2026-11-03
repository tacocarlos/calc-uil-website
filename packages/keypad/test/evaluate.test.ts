import { describe, expect, it } from 'vitest';
import { evaluate, formatResult } from '../src/evaluate.js';

const ctx = { ans: 5, mode: 'radian' as const };
const run = (expr: string) => {
  try {
    return formatResult(evaluate(expr.split(' '), ctx));
  } catch (e) {
    return `ERR:${(e as Error).message}`;
  }
};

describe('evaluate', () => {
  it.each([
    ['⁻ 2 ²', '⁻4'],
    ['2 ^ 3 ^ 2', '64'],
    ['2 π', '6.283185307'],
    ['3 ( 4 + 1', '15'],
    ['1 ÷ 0', 'ERR:DIVIDE BY 0'],
    ['√( ⁻ 4 )', 'ERR:NONREAL ANSWERS'],
    ['ln( 0 )', 'ERR:DOMAIN'],
    ['2 ᴇ ⁻ 5', '2ᴇ⁻5'],
    ['1 . 2 3 ᴇ 1 5', '1.23ᴇ15'],
    ['. 5', '.5'],
    ['sin( π ÷ 6', '.5'],
    ['Ans × 2', '10'],
    ['2 ^ ⁻ 1', '.5'],
    ['( ⁻ 8 ) ^ ( 1 ÷ 3 )', '⁻2'],
    ['10^( 3', '1000'],
    ['4 ⁻¹', '.25'],
    ['2 + × 3', 'ERR:SYNTAX'],
    ['1 2 3 4 5 6 7 8 9 0 1', '1.23456789ᴇ10'],
    ['1 ÷ 3', '.3333333333'],
    ['0 . 0 0 0 1 2', '1.2ᴇ⁻4'],
    ['e^( 1', '2.718281828'],
  ])('%s → %s', (expr, want) => {
    expect(run(expr)).toBe(want);
  });

  it('respects degree mode', () => {
    expect(evaluate(['sin(', '3', '0'], { ans: 0, mode: 'degree' })).toBeCloseTo(0.5, 12);
  });
});
