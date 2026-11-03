// Web Serial bridge to a calculator running the KEYPAD program.
//
// Line protocol (calculator → host), one ASCII line each:
//   HELLO <model> <version>   handshake, e.g. "HELLO TI84CE 1"
//   D <key>                   key down (ids from keys.ts)
//   U <key>                   key up
//   BYE                       program exited
// Host → calculator: any line (we send "?") asks the calculator to re-send HELLO.

import type { Keypad } from './keypad.js';
import { Store } from './store.js';

const HANDSHAKE_TIMEOUT_MS = 2500;

export type ConnectionState = 'disconnected' | 'connecting' | 'no-handshake' | 'connected';

export interface SerialState {
  state: ConnectionState;
  /** Model reported in the handshake, e.g. "TI84CE". */
  model: string | null;
}

interface SerialEvents {
  keydown: { id: string };
  keyup: { id: string };
  line: { text: string };
}

// Just the parts of the Web Serial API we use (not yet in TypeScript's DOM lib).
export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}

interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener(type: 'connect' | 'disconnect', listener: (e: Event) => void): void;
  removeEventListener(type: 'connect' | 'disconnect', listener: (e: Event) => void): void;
}

const getSerial = (): SerialLike | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { serial?: SerialLike }).serial;

export const MODEL_NAMES: Readonly<Record<string, string>> = {
  TI84CE: 'TI-84 Plus CE',
  NSPIRE: 'TI-Nspire',
};

export class SerialCalculator extends Store<SerialState, SerialEvents> {
  /** True in browsers with Web Serial (Chrome/Edge). False during SSR. */
  static get supported(): boolean {
    return getSerial() !== undefined;
  }

  port: SerialPortLike | null = null;
  #reader: ReadableStreamDefaultReader<string> | null = null;
  #pipeClosed: Promise<void> | null = null;
  #closing: Promise<void> | null = null;
  #handshakeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super({ state: 'disconnected', model: null });
  }

  /**
   * Reconnect automatically when a previously granted calculator is plugged
   * in (it re-enumerates every time KEYPAD starts). Returns a cleanup function.
   */
  watch(): () => void {
    const serial = getSerial();
    if (!serial) return () => {};

    const onConnect = (e: Event): void => {
      if (!this.port) this.open(e.target as unknown as SerialPortLike).catch(() => {});
    };
    const onDisconnect = (e: Event): void => {
      if (e.target === this.port) this.#teardown();
    };
    serial.addEventListener('connect', onConnect);
    serial.addEventListener('disconnect', onDisconnect);
    return () => {
      serial.removeEventListener('connect', onConnect);
      serial.removeEventListener('disconnect', onDisconnect);
    };
  }

  /** Forward this calculator's keys into a Keypad. Returns a cleanup function. */
  attach(keypad: Keypad): () => void {
    const offs = [
      this.on('keydown', ({ id }) => keypad.keyDown(id, 'calculator')),
      this.on('keyup', ({ id }) => keypad.keyUp(id, 'calculator')),
      this.on('change', ({ state }) => {
        if (state === 'disconnected') keypad.releaseAll('calculator');
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      keypad.releaseAll('calculator');
    };
  }

  /** Ask the user to pick a port. Must be called from a user gesture (click). */
  async requestAndOpen(): Promise<void> {
    const serial = getSerial();
    if (!serial) throw new Error('Web Serial is not supported in this browser.');
    await this.open(await serial.requestPort());
  }

  /** Reopen a previously granted port, if any, without prompting. */
  async reconnectGranted(): Promise<boolean> {
    const serial = getSerial();
    if (!serial) return false;
    const [port] = await serial.getPorts();
    if (!port) return false;
    await this.open(port).catch(() => {});
    return this.port !== null;
  }

  async open(port: SerialPortLike): Promise<void> {
    if (this.port) await this.close();
    await this.#closing;
    this.setState({ state: 'connecting', model: null });

    try {
      await port.open({ baudRate: 9600 });
    } catch (err) {
      this.setState({ state: 'disconnected' });
      throw err;
    }
    if (!port.readable) {
      this.setState({ state: 'disconnected' });
      throw new Error('Serial port is not readable.');
    }

    this.port = port;
    const decoder = new TextDecoderStream();
    this.#pipeClosed = port.readable.pipeTo(decoder.writable as WritableStream<Uint8Array>).catch(() => {});
    this.#reader = decoder.readable.getReader();

    this.#handshakeTimer = setTimeout(() => {
      if (!this.getSnapshot().model) this.setState({ state: 'no-handshake' });
    }, HANDSHAKE_TIMEOUT_MS);

    void this.#send('?\n');
    void this.#readLoop(this.#reader);
  }

  async close(): Promise<void> {
    const port = this.port;
    if (!port) return this.#closing ?? undefined;
    this.port = null;
    const reader = this.#reader;
    const pipeClosed = this.#pipeClosed;

    this.#closing = (async () => {
      try {
        await reader?.cancel();
        await pipeClosed;
        await port.close();
      } catch {
        // Port may already be gone (unplugged).
      }
    })();
    await this.#closing;
    this.#closing = null;
    this.#teardown();
  }

  async #send(text: string): Promise<void> {
    const writable = this.port?.writable;
    if (!writable) return;
    const writer = writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(text));
    } catch {
      // Ignore; the read loop will notice a dead port.
    } finally {
      writer.releaseLock();
    }
  }

  async #readLoop(reader: ReadableStreamDefaultReader<string>): Promise<void> {
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) this.#handleLine(line);
        }
      }
    } catch {
      // Device lost mid-read.
    }
    // Only tear down if this loop still belongs to the open port.
    if (this.#reader === reader) {
      this.port = null;
      this.#teardown();
    }
  }

  #handleLine(text: string): void {
    this.emit('line', { text });
    const [verb, arg] = text.split(/\s+/, 2);

    switch (verb) {
      case 'HELLO':
        clearTimeout(this.#handshakeTimer);
        this.setState({ state: 'connected', model: arg ?? 'unknown' });
        break;
      case 'D':
        if (arg) this.emit('keydown', { id: arg });
        break;
      case 'U':
        if (arg) this.emit('keyup', { id: arg });
        break;
      case 'BYE':
        void this.close();
        break;
    }
  }

  #teardown(): void {
    clearTimeout(this.#handshakeTimer);
    this.#reader = null;
    this.#pipeClosed = null;
    if (this.getSnapshot().state !== 'disconnected' || this.getSnapshot().model !== null) {
      this.setState({ state: 'disconnected', model: null });
    }
  }
}
