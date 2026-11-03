// The installer end to end against a fake TI-84 Plus CE (fake-ti84ce.ts), which
// behaves like the real one: split USB transfers, free RAM reported as 0.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTIFICE_FILES, CalculatorInstaller, TI84CE_FILES } from '../src/installer.js';
import { createFakeCalculator, type FakeCalculatorOptions } from './fake-ti84ce.js';

const assets = new URL('../assets/ti84ce/', import.meta.url);

vi.stubGlobal('fetch', async (url: string) => {
  // Requests look like /x/<path inside assets/ti84ce>.
  const path = url.replace(/^\/x\//, '');
  try {
    return new Response(readFileSync(new URL(path, assets)));
  } catch {
    return new Response('missing', { status: 404 });
  }
});
afterEach(() => vi.clearAllMocks());

function setup(options: FakeCalculatorOptions = {}, precheck?: () => string | null) {
  const fake = createFakeCalculator(options);
  const installer = new CalculatorInstaller({ baseUrl: '/x', usb: fake.usb, precheck });
  return { fake, installer };
}

/** Fail fast instead of hanging if a transfer never ends. */
async function within<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('transfer did not finish')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

describe('install()', () => {
  it('sends the libraries, then KEYPAD, byte for byte, to archive', async () => {
    const { fake, installer } = setup();
    expect(await within(installer.install())).toBe(true);
    expect(fake.received.map((v) => v.name)).toEqual(['LibLoad', 'KEYPADC', 'USBDRVCE', 'SRLDRVCE', 'KEYPAD']);
    expect(fake.received.every((v) => v.archived)).toBe(true);
    expect(fake.received.at(-1)).toMatchObject({ type: 6, size: 2154 });
    expect(installer.getSnapshot()).toMatchObject({ status: 'done', job: 'keypad', done: TI84CE_FILES.length, total: 5 });
  });

  it('releases the calculator afterwards, so KEYPAD’s serial mode and other tools can use it', async () => {
    const { fake, installer } = setup();
    await within(installer.install());
    expect(fake.opens()).toBe(1);
    expect(fake.closes()).toBe(1);
    expect(fake.device.opened).toBe(false);
  });

  it('uses a calculator the site already has permission for, without a picker', async () => {
    const { fake, installer } = setup({ granted: true, pick: false });
    expect(await within(installer.install())).toBe(true);
    expect(fake.received).toHaveLength(5);
  });

  it('reports a busy calculator', async () => {
    const { installer } = setup({ busy: true });
    expect(await within(installer.install())).toBe(false);
    expect(installer.getSnapshot()).toMatchObject({ status: 'error' });
    expect(installer.getSnapshot().message).toMatch(/didn’t respond/);
  });

  it('checks archive memory', async () => {
    const { fake, installer } = setup({ freeFlash: 1000 });
    expect(await within(installer.install())).toBe(false);
    expect(installer.getSnapshot().message).toMatch(/Not enough archive memory: this needs about 15 KB/);
    expect(fake.received).toEqual([]);
  });

  it('returns to idle when the picker is closed', async () => {
    const { installer } = setup({ pick: false });
    expect(await within(installer.install())).toBe(false);
    expect(installer.getSnapshot()).toMatchObject({ status: 'idle', message: null });
  });

  it('refuses while the precheck fails', async () => {
    const { fake, installer } = setup({}, () => 'KEYPAD is running');
    expect(await within(installer.install())).toBe(false);
    expect(installer.getSnapshot()).toMatchObject({ status: 'error', message: 'KEYPAD is running' });
    expect(fake.opens()).toBe(0);
  });

  it.each([5, 0, 3])('stops with an error when the calculator reports buffer size %d', async (bufferSize) => {
    const { fake, installer } = setup({ bufferSize });
    expect(await within(installer.install())).toBe(false);
    expect(installer.getSnapshot().message).toMatch(/unusable buffer size/);
    expect(fake.received).toEqual([]);
  });

  it('reports a disconnect mid-transfer', async () => {
    const { fake, installer } = setup();
    let packets = 0;
    const transferOut = fake.device.transferOut.bind(fake.device);
    fake.device.transferOut = async (endpoint: number, data: Uint8Array) => {
      if (++packets > 12) throw new DOMException('The device was disconnected.', 'NotFoundError');
      return transferOut(endpoint, data);
    };
    expect(await within(installer.install())).toBe(false);
    expect(installer.getSnapshot().message).toMatch(/disconnected during the transfer/);
  });

  it('works with a small negotiated buffer (many raw packets per variable)', async () => {
    const { fake, installer } = setup({ bufferSize: 64 });
    expect(await within(installer.install())).toBe(true);
    expect(fake.received.find((v) => v.name === 'USBDRVCE')?.data.length).toBe(8997);
  });
});

describe('installArtifice()', () => {
  it('sends v2.1 as program A, kept in archive like its file says', async () => {
    const { fake, installer } = setup();
    expect(await within(installer.installArtifice('v2.1'))).toBe(true);
    expect(fake.received.map((v) => [v.name, v.data.length, v.archived])).toEqual([['A', 904, true]]);
    expect(installer.getSnapshot().message).toMatch(/\[prgm\], choose A/);
  });

  it('sends v3 in two stages, both to RAM, including the 32 KB installer', async () => {
    const { fake, installer } = setup();
    expect(await within(installer.installArtifice('v3-installer'))).toBe(true);
    installer.reset();
    expect(await within(installer.installArtifice('v3-trigger'))).toBe(true);
    expect(fake.received.map((v) => [v.name, v.data.length, v.archived])).toEqual([
      ['PPPP', 32770, false],
      ['INEQUVAR', 285, false],
    ]);
  });

  it('gives Inequalz advice when the calculator does not answer during the trigger stage', async () => {
    const { installer } = setup({ busy: true });
    await within(installer.installArtifice('v3-trigger'));
    expect(installer.getSnapshot().message).toMatch(/Inequalz is open on its Y= screen/);
  });

  it('ships every file it refers to', () => {
    for (const names of Object.values(ARTIFICE_FILES)) {
      for (const name of names) expect(() => readFileSync(new URL(name, assets))).not.toThrow();
    }
  });
});

describe('detectOsVersion()', () => {
  it('reads the OS version', async () => {
    const { fake, installer } = setup({ osVersion: [5, 8, 3] });
    expect(await within(installer.detectOsVersion())).toEqual({ ok: true, version: '5.8.3' });
    expect(fake.device.opened).toBe(false);
  });

  it('returns no message when the picker is closed', async () => {
    const { installer } = setup({ pick: false });
    expect(await within(installer.detectOsVersion())).toEqual({ ok: false, message: null });
  });
});
