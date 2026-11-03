// A fake TI-84 Plus CE behind a fake WebUSB API, speaking enough of TI's DUSB
// link protocol to receive files. Modelled on a real CE (OS 5.8.3):
// - replies are split across USB transfers (the first holds 8 bytes, the rest
//   come in 64-byte pieces), so readers must reassemble packets;
// - free RAM is reported as 0;
// - the buffer size negotiated is 1023.
//
// Raw packet:     size (4 bytes, BE) · type (1) · data
// Virtual packet: size (4 bytes, BE) · type (2) · data   (split across raw packets)

const RAW = { BUF_SIZE_REQ: 1, BUF_SIZE_ALLOC: 2, VIRT_DATA: 3, VIRT_DATA_LAST: 4, VIRT_DATA_ACK: 5 } as const;
const VIRT = {
  PING: 0x0001,
  PARM_REQ: 0x0007,
  PARM_DATA: 0x0008,
  RTS: 0x000b,
  VAR_CNTS: 0x000d,
  MODE_SET: 0x0012,
  DATA_ACK: 0xaa00,
  EOT: 0xdd00,
  ERROR: 0xee00,
} as const;

const be = (value: number, bytes: number): number[] =>
  Array.from({ length: bytes }, (_, i) => Math.floor(value / 256 ** (bytes - 1 - i)) & 0xff);
const readBe = (data: Uint8Array, offset: number, bytes: number): number =>
  Array.from(data.slice(offset, offset + bytes)).reduce((acc, b) => acc * 256 + b, 0);

export interface ReceivedVariable {
  name: string;
  size: number;
  archived: boolean;
  type: number;
  data: Uint8Array;
}

export interface FakeCalculatorOptions {
  /** Raw packet buffer size the calculator negotiates. Real CEs use 1023. */
  bufferSize?: number;
  freeFlash?: number;
  /** OS version bytes as reported by the real CE: 00 major minor patch. */
  osVersion?: [number, number, number];
  /** Answer pings with an error, like a calculator busy running a program. */
  busy?: boolean;
  /** Whether the site already has permission (getDevices finds it). */
  granted?: boolean;
  /** Whether the student picks the calculator in the browser's picker. */
  pick?: boolean;
}

export function createFakeCalculator(options: FakeCalculatorOptions = {}) {
  const bufferSize = options.bufferSize ?? 1023;
  const received: ReceivedVariable[] = [];
  /** Queued USB transfers from the calculator. */
  const transfers: Uint8Array[] = [];
  let virtual: number[] = [];
  let pending: Omit<ReceivedVariable, 'data'> | null = null;
  let opens = 0;
  let closes = 0;

  // Queue a raw packet the way a real CE sends it: 8 bytes, then 64-byte pieces.
  const queue = (packet: Uint8Array) => {
    transfers.push(packet.slice(0, 8));
    for (let i = 8; i < packet.length; i += 64) transfers.push(packet.slice(i, i + 64));
  };
  const raw = (type: number, data: number[]) => new Uint8Array([...be(data.length, 4), type, ...data]);
  const reply = (type: number, data: number[] = []) => {
    // Split long replies into raw packets of at most bufferSize - 5 bytes.
    const packet = [...be(data.length, 4), ...be(type, 2), ...data];
    const chunk = bufferSize - 5;
    for (let i = 0; i < packet.length; i += chunk) {
      queue(raw(i + chunk >= packet.length ? RAW.VIRT_DATA_LAST : RAW.VIRT_DATA, packet.slice(i, i + chunk)));
    }
  };

  function handleVirtual(packet: Uint8Array): void {
    const type = readBe(packet, 4, 2);
    const data = packet.slice(6);
    switch (type) {
      case VIRT.PING:
        if (options.busy) reply(VIRT.ERROR, [0x00, 0x04]);
        else reply(VIRT.MODE_SET, [0x00, 0x00, 0x07, 0xd0]);
        break;
      case VIRT.PARM_REQ: {
        const count = readBe(data, 0, 2);
        const out = [...be(count, 2)];
        for (let i = 0; i < count; i++) {
          const pid = readBe(data, 2 + 2 * i, 2);
          const value =
            pid === 0x000b
              ? [0, ...(options.osVersion ?? [5, 8, 3])]
              : pid === 0x000e
                ? be(0, 8) // the CE reports no free RAM over USB
                : pid === 0x0011
                  ? be(options.freeFlash ?? 934_446, 8)
                  : null;
          if (value) out.push(...be(pid, 2), 0, ...be(value.length, 2), ...value);
          else out.push(...be(pid, 2), 1);
        }
        reply(VIRT.PARM_DATA, out);
        break;
      }
      case VIRT.RTS: {
        const nameLength = readBe(data, 0, 2);
        const name = new TextDecoder().decode(data.slice(2, 2 + nameLength));
        const size = readBe(data, 2 + nameLength + 1, 4);
        let p = 2 + nameLength + 1 + 4 + 1; // name, 0, size, transfer mode
        const params = readBe(data, p, 2);
        p += 2;
        let archived = false;
        let varType = 0;
        for (let i = 0; i < params; i++) {
          const id = readBe(data, p, 2);
          const len = readBe(data, p + 2, 2);
          if (id === 0x0002) varType = readBe(data, p + 4, len) & 0xff;
          if (id === 0x0003) archived = readBe(data, p + 4, len) === 1;
          p += 4 + len;
        }
        pending = { name, size, archived, type: varType };
        reply(VIRT.DATA_ACK, [0, 0]);
        break;
      }
      case VIRT.VAR_CNTS:
        if (pending) received.push({ ...pending, data });
        pending = null;
        reply(VIRT.DATA_ACK, [0, 0]);
        break;
      case VIRT.EOT:
        break;
    }
  }

  const device = {
    vendorId: 0x0451,
    productId: 0xe008,
    productName: 'TI-84 Plus CE',
    opened: false,
    configuration: {
      configurationValue: 1,
      interfaces: [
        {
          interfaceNumber: 0,
          alternates: [
            {
              endpoints: [
                { direction: 'in' as const, endpointNumber: 1, packetSize: 64 },
                { direction: 'out' as const, endpointNumber: 2, packetSize: 64 },
              ],
            },
          ],
        },
      ],
    },
    async open() {
      opens++;
      device.opened = true;
    },
    async close() {
      closes++;
      device.opened = false;
    },
    async selectConfiguration() {},
    async claimInterface() {},
    async releaseInterface() {},
    async clearHalt() {},
    async transferOut(_endpoint: number, data: Uint8Array) {
      const type = data[4];
      const body = data.slice(5);
      if (type === RAW.BUF_SIZE_REQ) {
        queue(raw(RAW.BUF_SIZE_ALLOC, be(bufferSize, 4)));
      } else if (type === RAW.VIRT_DATA || type === RAW.VIRT_DATA_LAST) {
        if (body.length > bufferSize) throw new Error(`Raw packet of ${body.length} bytes exceeds the buffer`);
        virtual.push(...body);
        queue(raw(RAW.VIRT_DATA_ACK, [0xe0, 0x00]));
        if (type === RAW.VIRT_DATA_LAST) {
          handleVirtual(new Uint8Array(virtual));
          virtual = [];
        }
      }
      // Host ACKs (type 5) need no reply.
      return { status: 'ok' };
    },
    async transferIn(_endpoint: number, length: number) {
      const next = transfers.shift();
      if (!next) throw new Error('Fake calculator has nothing to send (protocol out of sync)');
      if (next.length > length) throw new Error('Transfer longer than requested');
      return { status: 'ok', data: new DataView(next.buffer, next.byteOffset, next.byteLength) };
    },
  };

  const usb = {
    async getDevices() {
      return options.granted ? [device] : [];
    },
    async requestDevice() {
      if (options.pick === false) throw new DOMException('No device selected.', 'NotFoundError');
      return device;
    },
  };

  return { usb, device, received, opens: () => opens, closes: () => closes };
}
