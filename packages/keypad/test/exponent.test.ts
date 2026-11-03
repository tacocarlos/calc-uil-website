import { describe, expect, it } from 'vitest';
import { evaluate, POWER } from '../src/evaluate.js';
import { HomeScreen, templateAtCursor, tokensToText } from '../src/home-screen.js';
import { Keypad } from '../src/keypad.js';

const { start: S, end: E } = POWER;

function setup() {
  const keypad = new Keypad();
  const screen = new HomeScreen();
  const results: string[] = [];
  keypad.on('press', (p) => screen.handle(p));
  screen.on('result', (r) => results.push(r.text));
  const tap = (...ids: string[]) => ids.forEach((id) => keypad.tap(id, 'test'));
  const state = () => screen.getSnapshot();
  return { tap, state, results };
}

describe('exponent template', () => {
  it('[^] opens it with the cursor inside', () => {
    const { tap, state } = setup();
    tap('2', 'power');
    expect(state().tokens).toEqual(['2', S, E]);
    expect(templateAtCursor(state().tokens, state().cursor)?.kind).toBe('power');
  });

  it('holds a whole expression, and ▶ leaves it', () => {
    const { tap, state, results } = setup();
    tap('2', 'power', '1', 'add', '2', 'right', 'add', '1', 'enter'); // 2^(1+2) + 1
    expect(results).toEqual(['9']);
    expect(state().history[0]?.input).toBe('2^(1+2)+1');
  });

  it('▼ also returns to the baseline', () => {
    const { tap, results } = setup();
    tap('3', 'power', '2', 'down', 'mul', '2', 'enter'); // 3² × 2
    expect(results).toEqual(['18']);
  });

  it('applies to the operand just before it, like the TI', () => {
    const { tap, results } = setup();
    tap('chs', '2', 'power', '2', 'right', 'enter'); // ⁻2^(2) = ⁻4
    tap('2', 'mul', '3', 'power', '2', 'right', 'enter'); // 2×3^(2) = 18
    tap('lparen', '2', 'mul', '3', 'rparen', 'power', '2', 'right', 'enter'); // (2×3)^(2)
    expect(results).toEqual(['⁻4', '18', '36']);
  });

  it('starts from Ans on an empty line', () => {
    const { tap, state, results } = setup();
    tap('3', 'enter', 'power');
    expect(state().tokens).toEqual(['Ans', S, E]);
    tap('2', 'enter');
    expect(results).toEqual(['3', '9']);
  });

  it('nests with negative and fractional exponents', () => {
    const ctx = { ans: 0, mode: 'radian' as const };
    expect(evaluate(['2', S, '3', S, '2', E, E], ctx)).toBe(512); // 2^(3^2)
    expect(evaluate(['4', S, '⁻', '1', E], ctx)).toBe(0.25);
    expect(evaluate(['8', S, 'n/d[', '1', 'n/d|', '3', 'n/d]', E], ctx)).toBe(2);
    expect(evaluate(['e', S, 'ln(', '5', E], ctx)).toBeCloseTo(5, 12); // ln( auto-closes at the edge
  });

  it('reports a syntax error when left empty', () => {
    const { tap, state } = setup();
    tap('2', 'power', 'right', 'enter');
    expect(state().history.at(-1)?.output).toBe('ERR:SYNTAX');
  });

  it('is never overwritten, and DEL removes it only when empty', () => {
    const { tap, state } = setup();
    tap('2', 'power', '5', 'right');
    tap('left', 'left', 'left', '7'); // cursor on the template start: inserts, doesn't overwrite
    expect(tokensToText(state().tokens)).toBe('27^(5)');
    tap('del'); // template isn't empty: nothing
    expect(tokensToText(state().tokens)).toBe('27^(5)');
    tap('right', 'del', 'del'); // delete the 5, then the empty template
    expect(tokensToText(state().tokens)).toBe('27');
  });
});
