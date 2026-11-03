import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTiFile, TiFileError } from '../src/tifile.js';

const asset = (name: string) => new Uint8Array(readFileSync(new URL(`../assets/ti84ce/${name}`, import.meta.url)));

describe('parseTiFile', () => {
  it.each([
    // Same results ticalc-usb's parser gave for these files.
    ['KEYPAD.8xp', 'KEYPAD', 6, 2154, true],
    ['libload.8xv', 'LibLoad', 21, 1133, true],
    ['usbdrvce.8xv', 'USBDRVCE', 21, 8997, true],
    ['artifice/v2.1/arTIfiCE_v2.1.8xp', 'A', 5, 904, true],
    ['artifice/v3/arTIfiCE.8xp', 'PPPP', 5, 32770, false],
    ['artifice/v3/INEQUVAR.8xv', 'INEQUVAR', 21, 285, false],
  ])('%s', (file, name, type, size, archived) => {
    const [variable, ...rest] = parseTiFile(asset(file));
    expect(rest).toEqual([]);
    expect(variable).toMatchObject({ name, type, archived });
    expect(variable?.data.length).toBe(size);
  });

  it('rejects files that are not TI variable files', () => {
    expect(() => parseTiFile(new TextEncoder().encode('hello'))).toThrow(TiFileError);
    const truncated = asset('KEYPAD.8xp').slice(0, 100);
    expect(() => parseTiFile(truncated)).toThrow(TiFileError);
  });
});
