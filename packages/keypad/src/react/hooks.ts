'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react';
import { HomeScreen, type HomeScreenState, type ResultEvent } from '../home-screen.js';
import { type ArtificeStage, CalculatorInstaller, type InstallerState, type OsVersionResult } from '../installer.js';
import { bindKeyboard, type KeyboardOptions } from '../keyboard.js';
import type { KeyPress, KeySource, KeypadState } from '../keypad.js';
import type { KeyId } from '../keys.js';
import { MODEL_NAMES, SerialCalculator, type SerialState } from '../serial.js';
import { useCalcKeypad } from './provider.js';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Keep a ref pointing at the latest value, for event handlers. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useIsomorphicLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

const noopSubscribe = () => () => {};

/** Browser support, false during SSR so hydration matches. */
function useSupported(check: () => boolean): boolean {
  return useSyncExternalStore(noopSubscribe, check, () => false);
}

// ---------- Keypad ----------

/** Modifier state and held keys, plus the Keypad instance. */
export function useKeypad(): KeypadState & { keypad: ReturnType<typeof useCalcKeypad>['keypad'] } {
  const { keypad } = useCalcKeypad();
  const state = useSyncExternalStore(keypad.subscribe, keypad.getSnapshot, keypad.getSnapshot);
  return { ...state, keypad };
}

/** Call `handler` for every key press from any source (calculator, screen, keyboard). */
export function useKeyPress(handler: (press: KeyPress) => void): void {
  const { keypad } = useCalcKeypad();
  const latest = useLatest(handler);
  useEffect(() => keypad.on('press', (press) => latest.current(press)), [keypad, latest]);
}

export interface KeyButtonProps {
  onPointerDown(e: PointerEvent<HTMLElement>): void;
  onPointerUp(): void;
  onPointerCancel(): void;
  onLostPointerCapture(): void;
}

/**
 * Wire an on-screen key. Spread `buttonProps` on a button; `pressedBy` tells
 * you which source is holding the key (e.g. light it up for 'calculator').
 */
export function useKeyButton(
  id: KeyId,
  source: KeySource = 'screen'
): { pressed: boolean; pressedBy: KeySource | undefined; buttonProps: KeyButtonProps } {
  const { keypad } = useCalcKeypad();
  const getHolder = useCallback(() => keypad.getSnapshot().held.get(id), [keypad, id]);
  const pressedBy = useSyncExternalStore(keypad.subscribe, getHolder, getHolder);

  const [buttonProps] = useState<KeyButtonProps>(() => {
    const release = () => keypad.keyUp(id, source);
    return {
      onPointerDown(e) {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        keypad.keyDown(id, source);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
    };
  });

  return { pressed: pressedBy !== undefined, pressedBy, buttonProps };
}

/** Let the computer keyboard drive the keypad while mounted (and `enabled`). */
export function useKeyboardInput(enabled = true, options?: KeyboardOptions): void {
  const { keypad } = useCalcKeypad();
  const map = options?.map;
  const target = options?.target;
  useEffect(() => {
    if (!enabled) return;
    return bindKeyboard(keypad, { map, target });
  }, [keypad, enabled, map, target]);
}

// ---------- Calculator connection ----------

export interface CalculatorConnection extends SerialState {
  /** Web Serial available (Chrome/Edge). */
  supported: boolean;
  /** Friendly model name, e.g. "TI-84 Plus CE". */
  modelName: string | null;
  /** Last error from connect(), if any. */
  error: string | null;
  /** Dismiss `error`. */
  clearError(): void;
  /** Opens the port picker. Call from a click handler. Resolves true when a port opened. */
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export function useCalculatorConnection(): CalculatorConnection {
  const { serial } = useCalcKeypad();
  const state = useSyncExternalStore(serial.subscribe, serial.getSnapshot, serial.getSnapshot);
  const supported = useSupported(() => SerialCalculator.supported);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await serial.requestAndOpen();
      return true;
    } catch (err) {
      // NotFoundError = the user closed the picker without choosing.
      if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return false;
    }
  }, [serial]);

  const disconnect = useCallback(() => serial.close(), [serial]);
  const clearError = useCallback(() => setError(null), []);

  return {
    ...state,
    supported,
    modelName: state.model ? (MODEL_NAMES[state.model] ?? state.model) : null,
    error,
    clearError,
    connect,
    disconnect,
  };
}

/** Call `handler` with every raw line the calculator sends (for debugging). */
export function useSerialLines(handler: (text: string) => void): void {
  const { serial } = useCalcKeypad();
  const latest = useLatest(handler);
  useEffect(() => serial.on('line', ({ text }) => latest.current(text)), [serial, latest]);
}

// ---------- Installer ----------

export interface CalculatorInstallerHook extends InstallerState {
  /** WebUSB available (Chrome/Edge). */
  supported: boolean;
  /** Installs KEYPAD and its libraries. Call from a click handler. */
  install(): Promise<boolean>;
  /** Sends one arTIfiCE stage (see ARTIFICE_STEPS). Call from a click handler. */
  installArtifice(stage: ArtificeStage): Promise<boolean>;
  /** Reads the calculator's OS version, e.g. "5.8.3". Call from a click handler. */
  detectOsVersion(): Promise<OsVersionResult>;
  /** Clear a finished or failed install's message. */
  reset(): void;
}

export function useCalculatorInstaller(): CalculatorInstallerHook {
  const { installer } = useCalcKeypad();
  const state = useSyncExternalStore(installer.subscribe, installer.getSnapshot, installer.getSnapshot);
  const supported = useSupported(() => CalculatorInstaller.supported);
  const install = useCallback(() => installer.install(), [installer]);
  const installArtifice = useCallback((stage: ArtificeStage) => installer.installArtifice(stage), [installer]);
  const detectOsVersion = useCallback(() => installer.detectOsVersion(), [installer]);
  const reset = useCallback(() => installer.reset(), [installer]);
  return { ...state, supported, install, installArtifice, detectOsVersion, reset };
}

// ---------- Home screen ----------

export interface HomeScreenOptions {
  onResult?(result: ResultEvent): void;
  onError?(message: string): void;
  /** Presses the home screen ignores: menus, unsupported 2nd/alpha functions, [on]. */
  onUnhandled?(press: KeyPress): void;
}

/**
 * A TI-84 home screen driven by the keypad. Each call creates its own screen;
 * render `tokens`/`cursor` as the entry line and `history` above it.
 */
export function useHomeScreen(options: HomeScreenOptions = {}): HomeScreenState & { screen: HomeScreen } {
  const { keypad } = useCalcKeypad();
  const [screen] = useState(() => new HomeScreen());
  const state = useSyncExternalStore(screen.subscribe, screen.getSnapshot, screen.getSnapshot);
  const latest = useLatest(options);

  useEffect(() => {
    const offs = [
      keypad.on('press', (press) => {
        if (!screen.handle(press)) latest.current.onUnhandled?.(press);
      }),
      screen.on('result', (result) => latest.current.onResult?.(result)),
      screen.on('error', ({ message }) => latest.current.onError?.(message)),
    ];
    return () => offs.forEach((off) => off());
  }, [keypad, screen, latest]);

  return { ...state, screen };
}
