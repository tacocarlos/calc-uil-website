import { describe, expect, it, vi } from 'vitest';
import { Keypad } from '../src/keypad.js';
import { SerialCalculator, type SerialPortLike } from '../src/serial.js';

function fakePort() {
  let push!: (line: string) => void;
  let end!: () => void;
  const written: string[] = [];
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (text) => controller.enqueue(new TextEncoder().encode(text));
      end = () => controller.close();
    },
  });
  const writable = new WritableStream<Uint8Array>({
    write(chunk) { written.push(new TextDecoder().decode(chunk)); },
  });
  const port: SerialPortLike = { open: vi.fn(async () => {}), close: vi.fn(async () => {}), readable, writable };
  return { port, push: (t: string) => push(t), end: () => end(), written };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('SerialCalculator', () => {
  it('handshakes and forwards keys, split across chunks', async () => {
    const serial = new SerialCalculator();
    const keypad = new Keypad();
    serial.attach(keypad);
    const presses: string[] = [];
    keypad.on('press', (p) => presses.push(p.id));

    const { port, push, written } = fakePort();
    await serial.open(port);
    expect(serial.getSnapshot().state).toBe('connecting');
    await tick();
    expect(written).toEqual(['?\n']);

    push('HELLO TI84CE 1\nD 7\nU ');
    push('7\nD enter\n');
    await tick();
    expect(serial.getSnapshot()).toEqual({ state: 'connected', model: 'TI84CE' });
    expect(presses).toEqual(['7', 'enter']);
    expect(keypad.getSnapshot().held.get('enter')).toBe('calculator');

    push('BYE\n');
    await tick();
    await tick();
    expect(serial.getSnapshot().state).toBe('disconnected');
    expect(port.close).toHaveBeenCalled();
    expect(keypad.getSnapshot().held.size).toBe(0); // released on disconnect
  });

  it('reports a missing handshake', async () => {
    vi.useFakeTimers();
    const serial = new SerialCalculator();
    await serial.open(fakePort().port);
    vi.advanceTimersByTime(3000);
    expect(serial.getSnapshot().state).toBe('no-handshake');
    vi.useRealTimers();
  });

  it('tears down when the device stream ends', async () => {
    const serial = new SerialCalculator();
    const { port, push, end } = fakePort();
    await serial.open(port);
    push('HELLO TI84CE 1\n');
    await tick();
    end();
    await tick();
    expect(serial.getSnapshot().state).toBe('disconnected');
    expect(serial.port).toBeNull();
  });
});
