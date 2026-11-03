import { describe, expect, it } from 'vitest';
import { HomeScreen } from '../src/home-screen.js';
import { Keypad } from '../src/keypad.js';

function setup() {
  const keypad = new Keypad();
  const screen = new HomeScreen();
  const unhandled: string[] = [];
  const results: string[] = [];
  keypad.on('press', (p) => { if (!screen.handle(p)) unhandled.push(p.id); });
  screen.on('result', (r) => results.push(r.text));
  const tap = (...ids: string[]) => ids.forEach((id) => keypad.tap(id, 'test'));
  return { keypad, screen, tap, results, unhandled };
}

describe('Keypad → HomeScreen', () => {
  it('behaves like the TI home screen', () => {
    const { tap, results, screen } = setup();
    tap('2nd', 'square', '2', '5', 'rparen', 'add', '3', 'enter'); // √(25)+3
    tap('mul', '2', 'enter'); // auto Ans
    tap('2nd', 'power', 'enter'); // π
    tap('enter'); // repeat last entry
    tap('1', '2', '3', 'del', 'del', '4', 'enter');
    tap('2nd', 'chs', 'add', '1', 'enter'); // Ans+1
    expect(results).toEqual(['8', '16', '3.141592654', '3.141592654', '14', '15']);
    expect(screen.getSnapshot().history.at(-1)?.input).toBe('Ans+1');
  });

  it('tracks modifiers and reports unhandled presses', () => {
    const { keypad, tap, unhandled } = setup();
    keypad.tap('2nd', 'test');
    expect(keypad.second).toBe(true);
    tap('math', 'alpha', 'math');
    expect(keypad.alpha).toBe(false);
    expect(unhandled).toEqual(['math', 'math']); // 2nd/alpha themselves are handled
  });

  it('ignores unknown key ids and tracks who holds a key', () => {
    const { keypad } = setup();
    keypad.keyDown('bogus', 'calculator');
    keypad.keyDown('7', 'calculator');
    expect([...keypad.getSnapshot().held]).toEqual([['7', 'calculator']]);
    keypad.releaseAll('calculator');
    expect(keypad.getSnapshot().held.size).toBe(0);
  });
});
