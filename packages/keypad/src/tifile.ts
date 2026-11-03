// Parser for TI-83 Plus family variable files (.8xp programs, .8xv appvars, …),
// which the TI-84 Plus CE uses too.
//
// Layout (multi-byte numbers little-endian):
//   0x00  "**TI83F*" 1A 0A 00     signature
//   0x0B  42 bytes                comment
//   0x35  u16                     length of the entry section
//   0x37  entries…                each: u16 header length (11 or 13), u16 data length,
//                                 u8 type, 8-byte name, [u8 version, u8 flags], u16 data length, data
//   end   u16                     checksum

export interface TiVariable {
  name: string;
  /** Variable type: 5 = program, 6 = protected program, 21 = appvar, … */
  type: number;
  archived: boolean;
  version: number;
  data: Uint8Array;
}

const SIGNATURE = '**TI83F*';

export class TiFileError extends Error {}

/** Parse a .8x? file into its variables. Throws TiFileError if it isn't one. */
export function parseTiFile(bytes: Uint8Array): TiVariable[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (from: number, length: number) =>
    String.fromCharCode(...bytes.slice(from, from + length)).replace(/\0+$/, '');

  if (bytes.length < 0x39 || text(0, 8) !== SIGNATURE) {
    throw new TiFileError('Not a TI-83 Plus/TI-84 Plus family file.');
  }
  const sectionLength = view.getUint16(0x35, true);
  const end = 0x37 + sectionLength;
  if (end > bytes.length) throw new TiFileError('File is truncated.');

  const variables: TiVariable[] = [];
  let offset = 0x37;
  while (offset < end) {
    if (offset + 15 > end) throw new TiFileError('Truncated variable header.');
    const headerLength = view.getUint16(offset, true);
    if (headerLength !== 11 && headerLength !== 13) {
      throw new TiFileError(`Unexpected variable header length ${headerLength}.`);
    }
    const dataLength = view.getUint16(offset + 2, true);
    const type = bytes[offset + 4]!;
    const name = text(offset + 5, 8);

    // Version and flags only exist in 13-byte headers. Like TI Connect (and
    // ticalc-usb), a flags/version word of exactly 0x0080 also means archived.
    let archived = false;
    let version = 0;
    if (headerLength === 13) {
      const word = view.getUint16(offset + 13, true); // version | flags << 8
      archived = word === 0x0080 || (word & 0x8000) !== 0;
      version = word === 0x0080 ? 0 : word & 0xff;
    }

    const dataStart = offset + 2 + headerLength + 2;
    if (dataStart + dataLength > end) throw new TiFileError(`Variable ${name} is truncated.`);
    variables.push({ name, type, archived, version, data: bytes.slice(dataStart, dataStart + dataLength) });
    offset = dataStart + dataLength;
  }
  if (!variables.length) throw new TiFileError('File has no variables.');
  return variables;
}
