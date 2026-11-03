import { KEYS, REPEATING_KEYS, isKeyId, type KeyAction, type KeyId } from './keys.js';
import { Store } from './store.js';

const REPEAT_DELAY_MS = 420;
const REPEAT_RATE_MS = 70;

/** Where a key event came from. Built-in sources plus anything you like. */
export type KeySource = 'calculator' | 'screen' | 'keyboard' | (string & {});

export type KeyLayer = 'primary' | 'second' | 'alpha';

export interface KeyPress {
  id: KeyId;
  layer: KeyLayer;
  action: KeyAction;
  source: KeySource;
  /** True for auto-repeat presses while the key is held. */
  repeat: boolean;
}

export interface KeypadState {
  second: boolean;
  alpha: boolean;
  /** Keys currently held down, and which source is holding them. */
  held: ReadonlyMap<KeyId, KeySource>;
}

interface KeypadEvents {
  press: KeyPress;
  keystate: { id: KeyId; down: boolean; source: KeySource };
}

/**
 * Merges raw key up/down events from every input source and turns them into
 * calculator actions, tracking the 2nd / alpha modifiers the way a TI does.
 *
 * Events: 'press', 'keystate', 'change' (state snapshot).
 */
export class Keypad extends Store<KeypadState, KeypadEvents> {
  #timers = new Map<KeyId, ReturnType<typeof setTimeout>>();

  constructor() {
    super({ second: false, alpha: false, held: new Map() });
  }

  get second(): boolean {
    return this.getSnapshot().second;
  }

  get alpha(): boolean {
    return this.getSnapshot().alpha;
  }

  /** Accepts any string so raw ids from the calculator can be passed straight in. */
  keyDown(id: string, source: KeySource): void {
    if (!isKeyId(id) || this.getSnapshot().held.has(id)) return;

    this.#setHeld(id, source);
    this.emit('keystate', { id, down: true, source });
    this.#press(id, source, false);

    if (REPEATING_KEYS.has(id)) {
      const repeat = (): void => {
        this.#press(id, source, true);
        this.#timers.set(id, setTimeout(repeat, REPEAT_RATE_MS));
      };
      this.#timers.set(id, setTimeout(repeat, REPEAT_DELAY_MS));
    }
  }

  keyUp(id: string, source: KeySource): void {
    if (!isKeyId(id) || !this.getSnapshot().held.has(id)) return;
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.#setHeld(id, null);
    this.emit('keystate', { id, down: false, source });
  }

  /** Press and release, for sources that don't report key-up. */
  tap(id: string, source: KeySource): void {
    this.keyDown(id, source);
    this.keyUp(id, source);
  }

  /** Release every key a source is holding (e.g. when the calculator unplugs). */
  releaseAll(source?: KeySource): void {
    for (const [id, holder] of this.getSnapshot().held) {
      if (source === undefined || holder === source) this.keyUp(id, holder);
    }
  }

  resetModifiers(): void {
    this.#setModifiers(false, false);
  }

  #press(id: KeyId, source: KeySource, repeat: boolean): void {
    const key = KEYS[id];

    if (id === '2nd' || id === 'alpha') {
      if (id === '2nd') this.#setModifiers(!this.second, false);
      else this.#setModifiers(false, !this.alpha);
      this.emit('press', { id, layer: 'primary', action: key.action, source, repeat });
      return;
    }

    let layer: KeyLayer = 'primary';
    let action: KeyAction = key.action;
    if (this.second && !repeat) {
      layer = 'second';
      action = ('secondAction' in key ? key.secondAction : undefined) ?? {
        type: 'unsupported',
        name: ('second' in key ? key.second : undefined) ?? key.label,
      };
    } else if (this.alpha && !repeat) {
      layer = 'alpha';
      action = ('alphaAction' in key ? key.alphaAction : undefined) ?? {
        type: 'unsupported',
        name: ('alpha' in key ? key.alpha : undefined) ?? key.label,
      };
    }

    if (!repeat) this.#setModifiers(false, false);
    this.emit('press', { id, layer, action, source, repeat });
  }

  #setHeld(id: KeyId, source: KeySource | null): void {
    const held = new Map(this.getSnapshot().held);
    if (source === null) held.delete(id);
    else held.set(id, source);
    this.setState({ held });
  }

  #setModifiers(second: boolean, alpha: boolean): void {
    if (second === this.second && alpha === this.alpha) return;
    this.setState({ second, alpha });
  }
}
