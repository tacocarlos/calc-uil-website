// A minimal client for TI's DUSB link protocol, which the TI-84 Plus CE speaks
// over USB (outside KEYPAD). Enough to read a few parameters and send variables.
//
// Raw packet:     u32 data length · u8 type · data              (big-endian)
// Virtual packet: u32 data length · u16 type · data             (split across raw packets)
//
// Each raw packet may arrive split over several USB transfers (the CE sends
// the 9-byte buffer-size reply as 8 + 1 bytes), so reads are reassembled.

import type { TiVariable } from './tifile.js';

// The parts of WebUSB we use (not yet in TypeScript's DOM lib).
export interface UsbEndpointLike {
  direction: 'in' | 'out';
  endpointNumber: number;
  packetSize: number;
}
export interface UsbDeviceLike {
  vendorId: number;
  productId: number;
  productName?: string | null;
  opened?: boolean;
  configuration: {
    configurationValue: number;
    interfaces: { interfaceNumber: number; alternates: { endpoints: UsbEndpointLike[] }[] }[];
  } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(number: number): Promise<void>;
  releaseInterface?(number: number): Promise<void>;
  clearHalt?(direction: 'in' | 'out', endpointNumber: number): Promise<void>;
  transferIn(endpointNumber: number, length: number): Promise<{ status?: string; data?: DataView | null }>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ status?: string }>;
}

const RAW = { BUF_SIZE_REQ: 1, BUF_SIZE_ALLOC: 2, VIRT_DATA: 3, VIRT_DATA_LAST: 4, VIRT_DATA_ACK: 5 } as const;
const VIRT = {
  PING: 0x0001,
  PARM_REQ: 0x0007,
  PARM_DATA: 0x0008,
  RTS: 0x000b,
  VAR_CNTS: 0x000d,
  MODE_SET: 0x0012,
  DATA_ACK: 0xaa00,
  DELAY_ACK: 0xbb00,
  EOT: 0xdd00,
  ERROR: 0xee00,
} as const;

/** DUSB parameter ids. */
export const PARAM = {
  PRODUCT_NAME: 0x0002,
  BOOT_VERSION: 0x0009,
  OS_VERSION: 0x000b,
  FREE_RAM: 0x000e,
  FREE_FLASH: 0x0011,
} as const;

const NORMAL_MODE = [0, 3, 0, 1, 0, 0, 0, 0, 7, 208];
const REQUESTED_BUFFER = 1024;
const TIMEOUT_MS = 10_000;

export class DusbError extends Error {}

const be = (value: number, bytes: number): number[] =>
  Array.from({ length: bytes }, (_, i) => Math.floor(value / 256 ** (bytes - 1 - i)) & 0xff);
const readBe = (data: Uint8Array, offset: number, bytes: number): number =>
  Array.from(data.slice(offset, offset + bytes)).reduce((acc, b) => acc * 256 + b, 0);

export class DusbLink {
  #device: UsbDeviceLike;
  #interfaceNumber: number;
  #in: UsbEndpointLike;
  #out: UsbEndpointLike;
  #pending = new Uint8Array(0);
  /** Raw packet size the calculator negotiated. */
  bufferSize = 0;

  private constructor(device: UsbDeviceLike, interfaceNumber: number, inEp: UsbEndpointLike, outEp: UsbEndpointLike) {
    this.#device = device;
    this.#interfaceNumber = interfaceNumber;
    this.#in = inEp;
    this.#out = outEp;
  }

  /** Open and claim the device, then negotiate the packet buffer size. */
  static async open(device: UsbDeviceLike): Promise<DusbLink> {
    if (!device.opened) await device.open();
    const config = device.configuration;
    if (!config) throw new DusbError('The calculator has no USB configuration.');
    await device.selectConfiguration(config.configurationValue);
    const iface = device.configuration?.interfaces[0];
    const endpoints = iface?.alternates[0]?.endpoints ?? [];
    const inEp = endpoints.find((e) => e.direction === 'in');
    const outEp = endpoints.find((e) => e.direction === 'out');
    if (!iface || !inEp || !outEp) throw new DusbError('The calculator’s USB interface is missing endpoints.');
    await device.claimInterface(iface.interfaceNumber);

    // Recover from a previous session that died mid-transfer.
    await device.clearHalt?.('in', inEp.endpointNumber).catch(() => {});
    await device.clearHalt?.('out', outEp.endpointNumber).catch(() => {});

    const link = new DusbLink(device, iface.interfaceNumber, inEp, outEp);
    try {
      await link.#sendRaw(RAW.BUF_SIZE_REQ, be(REQUESTED_BUFFER, 4));
      const reply = await link.#readRaw();
      if (reply.type !== RAW.BUF_SIZE_ALLOC) throw new DusbError(`Unexpected reply to the buffer size request (${reply.type}).`);
      link.bufferSize = readBe(reply.data, 0, reply.data.length);
      // Packets carry a 5-byte header; anything this small can't carry data.
      if (!(link.bufferSize > 16)) throw new DusbError(`The calculator reported an unusable buffer size (${link.bufferSize}).`);
    } catch (err) {
      await link.close();
      throw err;
    }
    return link;
  }

  /** True if the calculator answers (it must be idle, e.g. on the home screen). */
  async ping(): Promise<boolean> {
    try {
      await this.#sendVirtual(VIRT.PING, NORMAL_MODE);
      await this.#expect(VIRT.MODE_SET);
      return true;
    } catch {
      return false;
    }
  }

  /** Read parameters; missing ones are left out of the result. */
  async getParameters(ids: readonly number[]): Promise<Map<number, Uint8Array>> {
    await this.#sendVirtual(VIRT.PARM_REQ, [...be(ids.length, 2), ...ids.flatMap((id) => be(id, 2))]);
    const data = await this.#expect(VIRT.PARM_DATA);
    const out = new Map<number, Uint8Array>();
    let offset = 2;
    for (let i = 0; i < readBe(data, 0, 2); i++) {
      const id = readBe(data, offset, 2);
      const ok = data[offset + 2] === 0;
      const size = ok ? readBe(data, offset + 3, 2) : 0;
      if (ok) out.set(id, data.slice(offset + 5, offset + 5 + size));
      offset += ok ? 5 + size : 3;
    }
    return out;
  }

  /** Send one variable, silently, like TI Connect. */
  async sendVariable(variable: TiVariable): Promise<void> {
    const name = Array.from(new TextEncoder().encode(variable.name));
    const attributes = [
      [0x0002, 4, 0xf0070000 + variable.type], // variable type
      [0x0003, 1, variable.archived ? 1 : 0], // archived
      [0x0008, 4, variable.version], // version
    ];
    await this.#sendVirtual(VIRT.RTS, [
      ...be(name.length, 2),
      ...name,
      0,
      ...be(variable.data.length, 4),
      1, // silent transfer
      ...be(attributes.length, 2),
      ...attributes.flatMap(([id, size, value]) => [...be(id!, 2), ...be(size!, 2), ...be(value!, size!)]),
    ]);
    await this.#expect(VIRT.DATA_ACK);
    await this.#sendVirtual(VIRT.VAR_CNTS, Array.from(variable.data));
    await this.#expect(VIRT.DATA_ACK);
    await this.#sendVirtual(VIRT.EOT, []);
  }

  /** Release the device so other programs (and KEYPAD's serial mode) can use it. */
  async close(): Promise<void> {
    await this.#device.releaseInterface?.(this.#interfaceNumber).catch(() => {});
    await this.#device.close().catch(() => {});
  }

  // ---------- Virtual packets ----------

  async #sendVirtual(type: number, data: readonly number[]): Promise<void> {
    const packet = [...be(data.length, 4), ...be(type, 2), ...data];
    const chunk = this.bufferSize - 5;
    for (let offset = 0; offset < packet.length || offset === 0; offset += chunk) {
      const last = offset + chunk >= packet.length;
      await this.#sendRaw(last ? RAW.VIRT_DATA_LAST : RAW.VIRT_DATA, packet.slice(offset, offset + chunk));
      const ack = await this.#readRaw();
      if (ack.type !== RAW.VIRT_DATA_ACK) throw new DusbError(`Expected an acknowledgement, got packet type ${ack.type}.`);
      if (last) break;
    }
  }

  /** Read virtual packets until one of `type` arrives, honouring delay requests. */
  async #expect(type: number): Promise<Uint8Array> {
    while (true) {
      const packet = await this.#readVirtual();
      if (packet.type === type) return packet.data;
      if (packet.type === VIRT.DELAY_ACK) {
        const micros = readBe(packet.data, 0, packet.data.length);
        await new Promise((resolve) => setTimeout(resolve, Math.min(micros / 1000, TIMEOUT_MS)));
        continue;
      }
      if (packet.type === VIRT.ERROR) {
        const code = readBe(packet.data, 0, Math.min(2, packet.data.length));
        throw new DusbError(`The calculator refused the transfer (error 0x${code.toString(16)}).`);
      }
      throw new DusbError(`Unexpected reply from the calculator (0x${packet.type.toString(16)}).`);
    }
  }

  async #readVirtual(): Promise<{ type: number; data: Uint8Array }> {
    const body: number[] = [];
    while (true) {
      const raw = await this.#readRaw();
      if (raw.type !== RAW.VIRT_DATA && raw.type !== RAW.VIRT_DATA_LAST) {
        throw new DusbError(`Expected data from the calculator, got packet type ${raw.type}.`);
      }
      body.push(...raw.data);
      await this.#sendRaw(RAW.VIRT_DATA_ACK, [0xe0, 0x00]);
      if (raw.type === RAW.VIRT_DATA_LAST) break;
    }
    const packet = new Uint8Array(body);
    return { type: readBe(packet, 4, 2), data: packet.slice(6) };
  }

  // ---------- Raw packets ----------

  async #sendRaw(type: number, data: readonly number[]): Promise<void> {
    const packet = new Uint8Array([...be(data.length, 4), type, ...data]);
    const result = await this.#timed(this.#device.transferOut(this.#out.endpointNumber, packet));
    if (result.status && result.status !== 'ok') throw new DusbError(`USB send failed (${result.status}).`);
  }

  /** One complete raw packet, however many USB transfers it arrives in. */
  async #readRaw(): Promise<{ type: number; data: Uint8Array }> {
    // Read in whole USB packets, enough for a full buffer.
    const length = Math.ceil((REQUESTED_BUFFER + 5) / this.#in.packetSize) * this.#in.packetSize;
    while (true) {
      if (this.#pending.length >= 5) {
        const size = readBe(this.#pending, 0, 4);
        if (size > REQUESTED_BUFFER * 64) throw new DusbError('The calculator sent a malformed packet.');
        if (this.#pending.length >= 5 + size) {
          const packet = this.#pending.slice(0, 5 + size);
          this.#pending = this.#pending.slice(5 + size);
          return { type: packet[4]!, data: packet.slice(5) };
        }
      }
      const result = await this.#timed(this.#device.transferIn(this.#in.endpointNumber, length));
      if (result.status && result.status !== 'ok') throw new DusbError(`USB receive failed (${result.status}).`);
      const view = result.data;
      if (!view) continue;
      const chunk = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      const merged = new Uint8Array(this.#pending.length + chunk.length);
      merged.set(this.#pending);
      merged.set(chunk, this.#pending.length);
      this.#pending = merged;
    }
  }

  /** USB calls have no timeout of their own; a silent calculator would hang forever. */
  #timed<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DusbError('The calculator stopped responding.')), TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}

/** "5.8.3" from the OS_VERSION parameter (bytes: 0, major, minor, patch). */
export function formatOsVersion(value: Uint8Array): string {
  const bytes = Array.from(value);
  const parts = bytes.length >= 4 ? bytes.slice(1, 4) : bytes;
  return parts.join('.');
}
