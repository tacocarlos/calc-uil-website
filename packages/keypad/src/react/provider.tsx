'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createCalcKeypad, type CalcKeypad, type CreateCalcKeypadOptions } from '../create.js';

const CalcKeypadContext = createContext<CalcKeypad | null>(null);

export interface CalcKeypadProviderProps extends CreateCalcKeypadOptions {
  children?: ReactNode;
  /** Reopen a previously granted calculator on mount. Default true. */
  autoReconnect?: boolean;
}

/**
 * Owns one keypad, serial connection, and installer for the subtree.
 * Mount it once, high in the tree. A serial port can only be opened once,
 * so every component that uses the calculator should share this provider.
 */
export function CalcKeypadProvider({ children, autoReconnect = true, installer }: CalcKeypadProviderProps) {
  const [calc] = useState(() => createCalcKeypad({ installer }));

  useEffect(() => calc.start({ autoReconnect }), [calc, autoReconnect]);

  return <CalcKeypadContext.Provider value={calc}>{children}</CalcKeypadContext.Provider>;
}

/** The keypad, serial connection, and installer from the nearest provider. */
export function useCalcKeypad(): CalcKeypad {
  const calc = useContext(CalcKeypadContext);
  if (!calc) throw new Error('useCalcKeypad must be used inside <CalcKeypadProvider>.');
  return calc;
}
