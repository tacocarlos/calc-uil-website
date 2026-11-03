// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CalcKeypadProvider,
  useCalcKeypad,
  useCalculatorConnection,
  useCalculatorInstaller,
  useHomeScreen,
  useKeyButton,
  useKeyboardInput,
  useKeypad,
} from '../src/react/index.js';
import type { KeyId } from '../src/keys.js';

const wrapper = ({ children }: { children: ReactNode }) => <CalcKeypadProvider>{children}</CalcKeypadProvider>;

afterEach(cleanup);

function Key({ id }: { id: KeyId }) {
  const { pressedBy, buttonProps } = useKeyButton(id);
  return <button data-testid={id} data-pressed={pressedBy ?? ''} {...buttonProps} />;
}

function Screen() {
  const { tokens, history } = useHomeScreen();
  const { second } = useKeypad();
  return (
    <>
      <output data-testid="entry">{tokens.join('')}</output>
      <output data-testid="last">{history.at(-1)?.output}</output>
      <output data-testid="second">{String(second)}</output>
    </>
  );
}

describe('React hooks', () => {
  it('drives a home screen from on-screen keys', () => {
    const ui = render(
      <CalcKeypadProvider>
        <Screen />
        {(['2nd', 'square', '8', '1', 'add', 'enter'] as const).map((id) => <Key key={id} id={id} />)}
      </CalcKeypadProvider>
    );
    const press = (id: string) => {
      fireEvent.pointerDown(ui.getByTestId(id));
      fireEvent.pointerUp(ui.getByTestId(id));
    };

    press('2nd');
    expect(ui.getByTestId('second').textContent).toBe('true');
    ['square', '8', '1'].forEach(press);
    expect(ui.getByTestId('entry').textContent).toBe('√(81');
    ['add', '1', 'enter'].forEach(press);
    // TI parses √(81+1 as √(82) since the paren is still open
    expect(ui.getByTestId('last').textContent).toBe('9.055385138');
  });

  it('shows which source holds a key', () => {
    const { result } = renderHook(() => ({ calc: useCalcKeypad(), key: useKeyButton('7') }), { wrapper });
    act(() => result.current.calc.keypad.keyDown('7', 'calculator'));
    expect(result.current.key).toMatchObject({ pressed: true, pressedBy: 'calculator' });
    act(() => result.current.calc.keypad.keyUp('7', 'calculator'));
    expect(result.current.key.pressed).toBe(false);
  });

  it('routes the computer keyboard', () => {
    const { result } = renderHook(
      () => {
        useKeyboardInput();
        return useHomeScreen();
      },
      { wrapper }
    );
    act(() => {
      for (const key of ['4', '*', 'p']) {
        fireEvent.keyDown(window, { key, code: `Key${key}` });
        fireEvent.keyUp(window, { key, code: `Key${key}` });
      }
    });
    expect(result.current.tokens).toEqual(['4', '×', 'π']);
  });

  it('reports no Web Serial / WebUSB support in jsdom', () => {
    const { result } = renderHook(() => ({ conn: useCalculatorConnection(), inst: useCalculatorInstaller() }), { wrapper });
    expect(result.current.conn).toMatchObject({ supported: false, state: 'disconnected', modelName: null });
    expect(result.current.inst).toMatchObject({ supported: false, status: 'idle' });
  });

  it('throws a helpful error outside the provider', () => {
    expect(() => renderHook(() => useKeypad())).toThrow(/CalcKeypadProvider/);
  });
});
