// Runs in plain Node (no DOM), like a Next.js server render.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CalcKeypadProvider, useCalculatorConnection, useHomeScreen, useKeyButton } from '../src/react/index.js';

function App() {
  const { supported, state } = useCalculatorConnection();
  const { tokens } = useHomeScreen();
  const { pressed } = useKeyButton('enter');
  return <p>{`${supported}|${state}|${tokens.length}|${pressed}`}</p>;
}

describe('server rendering', () => {
  it('renders without touching browser APIs', () => {
    expect(typeof window).toBe('undefined');
    const html = renderToString(<CalcKeypadProvider><App /></CalcKeypadProvider>);
    expect(html).toBe('<p>false|disconnected|0|false</p>');
  });
});
