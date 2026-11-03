import { CalculatorInstaller, type InstallerOptions } from './installer.js';
import { Keypad } from './keypad.js';
import { SerialCalculator } from './serial.js';

export interface CalcKeypad {
  keypad: Keypad;
  serial: SerialCalculator;
  installer: CalculatorInstaller;
}

export interface CreateCalcKeypadOptions {
  installer?: Omit<InstallerOptions, 'precheck'>;
}

/**
 * Create a keypad, a serial connection, and an installer that refuses to run
 * while KEYPAD is connected (the calculator can't do both at once).
 *
 * Creating is side-effect free. Call `start()` in the browser to forward
 * calculator keys and auto-reconnect; it returns a cleanup function.
 */
export function createCalcKeypad(options: CreateCalcKeypadOptions = {}): CalcKeypad & {
  start(opts?: { autoReconnect?: boolean }): () => void;
} {
  const keypad = new Keypad();
  const serial = new SerialCalculator();
  const installer = new CalculatorInstaller({
    ...options.installer,
    precheck: () =>
      serial.port ? 'Quit KEYPAD on the calculator (press [on]) before installing.' : null,
  });

  return {
    keypad,
    serial,
    installer,
    start({ autoReconnect = true } = {}) {
      const offs = [serial.attach(keypad), serial.watch()];
      if (autoReconnect) void serial.reconnectGranted();
      return () => {
        offs.forEach((off) => off());
        void serial.close();
      };
    },
  };
}
