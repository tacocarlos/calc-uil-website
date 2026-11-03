import { KEYBOARD_MAP, type KeyboardBinding } from './keys.js';
import type { Keypad } from './keypad.js';

export interface KeyboardOptions {
  /** Defaults to KEYBOARD_MAP. */
  map?: Readonly<Record<string, KeyboardBinding>>;
  /** Defaults to window. */
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Lets the computer keyboard drive the keypad. Returns a cleanup function.
 * Ignored while typing in form fields or holding Ctrl/Cmd/Alt.
 */
export function bindKeyboard(keypad: Keypad, options: KeyboardOptions = {}): () => void {
  const map = options.map ?? KEYBOARD_MAP;
  const target = options.target ?? window;
  // Physical key code → key id, so key-up still matches when Shift is
  // released first (e.g. "E" down, "e" up).
  const held = new Map<string, string>();

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typeof Element !== 'undefined' && e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const binding = map[e.key];
    if (!binding) return;
    e.preventDefault();
    if (e.repeat) return; // Keypad does its own TI-style auto-repeat

    const id: string = typeof binding === 'string' ? binding : binding[1];
    if (typeof binding !== 'string') {
      const [modifier] = binding;
      const active = modifier === '2nd' ? keypad.second : keypad.alpha;
      if (!active) keypad.tap(modifier, 'keyboard');
    }
    held.set(e.code, id);
    keypad.keyDown(id, 'keyboard');
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    const id = held.get(e.code);
    if (!id) return;
    held.delete(e.code);
    keypad.keyUp(id, 'keyboard');
  };

  const onBlur = (): void => {
    held.clear();
    keypad.releaseAll('keyboard');
  };

  target.addEventListener('keydown', onKeyDown as EventListener);
  target.addEventListener('keyup', onKeyUp as EventListener);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown as EventListener);
    target.removeEventListener('keyup', onKeyUp as EventListener);
    target.removeEventListener('blur', onBlur);
    onBlur();
  };
}
