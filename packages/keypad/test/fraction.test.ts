import { describe, expect, it } from 'vitest';
import { evaluate, FRACTION } from '../src/evaluate.js';
import { fractionAtCursor, HomeScreen, tokensToText } from '../src/home-screen.js';
import { bindKeyboard } from '../src/keyboard.js';
import { Keypad } from '../src/keypad.js';

const { start: S, bar: B, end: E } = FRACTION;

function setup() {
  const keypad = new Keypad();
  const screen = new HomeScreen();
  const unhandled: string[] = [];
  const results: string[] = [];
  keypad.on('press', (p) => { if (!screen.handle(p)) unhandled.push(p.id); });
  screen.on('result', (r) => results.push(r.text));
  const tap = (...ids: string[]) => ids.forEach((id) => keypad.tap(id, 'test'));
  const state = () => screen.getSnapshot();
  return { keypad, screen, tap, state, results, unhandled };
}

describe('n/d fraction template', () => {
  it('[alpha][X,T,θ,n] inserts it with the cursor in the numerator', () => {
    const { tap, state, unhandled } = setup();
    tap('alpha', 'xton');
    expect(state().tokens).toEqual([S, B, E]);
    expect(state().cursor).toBe(1);
    expect(unhandled).toEqual([]);
  });

  it('[X,T,θ,n] without alpha still inserts X', () => {
    const { tap, state } = setup();
    tap('xton');
    expect(state().tokens).toEqual(['X']);
  });

  it('types a fraction with ▼ and ▶ like the TI', () => {
    const { tap, state, results } = setup();
    tap('alpha', 'xton', '1', 'down', '4', 'right', 'add', '1', 'enter');
    expect(results).toEqual(['1.25']);
    expect(state().history[0]?.input).toBe('(1)/(4)+1');
  });

  it('moves into the denominator with ▶ from the end of the numerator, and back with ▲', () => {
    const { tap, state } = setup();
    tap('alpha', 'xton', '3', 'right');
    expect(fractionAtCursor(state().tokens, state().cursor)?.part).toBe('denominator');
    tap('2', 'up');
    expect(fractionAtCursor(state().tokens, state().cursor)?.part).toBe('numerator');
    tap('right', 'right', 'right');
    expect(fractionAtCursor(state().tokens, state().cursor)).toBeNull();
    expect(state().cursor).toBe(state().tokens.length);
  });

  it('is a single value: implicit multiplication and powers', () => {
    const { tap, results } = setup();
    tap('2', 'alpha', 'xton', '1', 'down', '4', 'right', 'enter'); // 2·(1/4)
    tap('lparen', 'alpha', 'xton', '1', 'down', '2', 'right', 'rparen', 'square', 'enter'); // (1/2)²
    expect(results).toEqual(['.5', '.25']);
  });

  it('nests, and auto-closes functions at the template edge', () => {
    expect(evaluate([S, '1', B, S, '1', B, '4', E, E], { ans: 0, mode: 'radian' })).toBe(4);
    expect(evaluate([S, '√(', '9', B, '3', E], { ans: 0, mode: 'radian' })).toBe(1);
  });

  it('reports syntax errors for empty parts and divide by zero', () => {
    const { tap, state } = setup();
    tap('alpha', 'xton', 'down', '2', 'right', 'enter');
    expect(state().history.at(-1)?.output).toBe('ERR:SYNTAX');
    tap('alpha', 'xton', '1', 'down', '0', 'right', 'enter');
    expect(state().history.at(-1)?.output).toBe('ERR:DIVIDE BY 0');
  });

  it('is never overwritten by typing, and DEL removes it only when empty', () => {
    const { tap, state } = setup();
    tap('alpha', 'xton', '5');
    tap('left', 'left', '7'); // cursor on the start token: inserts before it
    expect(tokensToText(state().tokens)).toBe('7(5)/()');
    tap('del'); // on the start token of a non-empty fraction: nothing
    expect(tokensToText(state().tokens)).toBe('7(5)/()');
    tap('right', 'del', 'del'); // delete the 5, then the now-empty template
    expect(state().tokens).toEqual(['7']);
  });

  it('can be typed from the computer keyboard with f', () => {
    const keypad = new Keypad();
    const screen = new HomeScreen();
    keypad.on('press', (p) => screen.handle(p));
    const target = new EventTarget();
    bindKeyboard(keypad, { target: target as unknown as Window });
    const type = (key: string) => {
      for (const type of ['keydown', 'keyup']) {
        target.dispatchEvent(Object.assign(new Event(type), { key, code: `Key${key}`, repeat: false, preventDefault() {} }));
      }
    };
    type('f');
    expect(screen.getSnapshot().tokens).toEqual([S, B, E]);
    expect(keypad.alpha).toBe(false);
  });
});
