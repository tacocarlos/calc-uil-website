// Installs the KEYPAD program (and the CE C libraries it needs) on a
// TI-84 Plus CE over WebUSB. It can also send arTIfiCE, the jailbreak OS 5.5+
// needs before it will run C programs, and read the calculator's OS version.
//
// This uses TI's normal link protocol (dusb.ts), so the calculator must NOT be
// running KEYPAD (which switches USB to serial mode).

import { DusbLink, formatOsVersion, PARAM, type UsbDeviceLike } from './dusb.js';
import { Store } from './store.js';
import { parseTiFile, TiFileError, type TiVariable } from './tifile.js';

/** File names in assets/ti84ce. Libraries first, so KEYPAD finds them on first run. */
export const TI84CE_FILES = ['libload.8xv', 'keypadc.8xv', 'usbdrvce.8xv', 'srldrvce.8xv', 'KEYPAD.8xp'] as const;

/**
 * arTIfiCE release files in assets/ti84ce, by stage. v3 is sent in two steps
 * with the student acting in between (see ARTIFICE_STEPS in artifice.ts).
 */
export const ARTIFICE_FILES = {
  'v2.1': ['artifice/v2.1/arTIfiCE_v2.1.8xp'],
  'v3-installer': ['artifice/v3/arTIfiCE.8xp'],
  'v3-trigger': ['artifice/v3/INEQUVAR.8xv'],
} as const;

export type ArtificeStage = keyof typeof ARTIFICE_FILES;

/** What's being sent: KEYPAD and its libraries, or an arTIfiCE stage. */
export type InstallJob = 'keypad' | ArtificeStage;

/** Where the assets/ti84ce files are served from by default (e.g. Next.js public/). */
export const DEFAULT_ASSET_BASE_URL = '/calc-keypad/ti84ce/';

/** USB ids of the TI-84 Plus CE family in link (non-KEYPAD) mode. */
export const TI84CE_USB_FILTER = { vendorId: 0x0451, productId: 0xe008 } as const;

/** The parts of navigator.usb the installer uses. */
export interface UsbLike {
  getDevices(): Promise<UsbDeviceLike[]>;
  requestDevice(options: { filters: { vendorId: number; productId?: number }[] }): Promise<UsbDeviceLike>;
}

export type InstallStatus = 'idle' | 'installing' | 'done' | 'error';

export interface InstallerState {
  status: InstallStatus;
  /** The transfer this state describes, or null when idle. */
  job: InstallJob | null;
  /** Human-readable progress or error message. */
  message: string | null;
  done: number;
  total: number;
}

export interface InstallerOptions {
  /** URL of the directory holding the assets/ti84ce files. Default '/calc-keypad/ti84ce/'. */
  baseUrl?: string;
  /** WebUSB to use. Defaults to navigator.usb. */
  usb?: UsbLike;
  /** Return an error message to refuse installing (e.g. KEYPAD is running). */
  precheck?: () => string | null;
}

export type OsVersionResult = { ok: true; version: string } | { ok: false; message: string | null };

const getUsb = (): UsbLike | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { usb?: UsbLike }).usb;

const isTi84ce = (d: UsbDeviceLike): boolean =>
  d.vendorId === TI84CE_USB_FILTER.vendorId && d.productId === TI84CE_USB_FILTER.productId;

/** Thrown when the student closes the device picker without choosing. */
class Cancelled extends Error {}

export class CalculatorInstaller extends Store<InstallerState> {
  /** True in browsers with WebUSB (Chrome/Edge). False during SSR. */
  static get supported(): boolean {
    return getUsb() !== undefined;
  }

  #options: InstallerOptions;
  #busy = false;

  constructor(options: InstallerOptions = {}) {
    super({ status: 'idle', job: null, message: null, done: 0, total: 0 });
    this.#options = options;
  }

  /**
   * Install KEYPAD and its libraries. Call from a click handler (the device
   * picker needs a user gesture). Resolves true on success; failures are
   * reported through the state, not thrown.
   */
  install(): Promise<boolean> {
    return this.#send('keypad', TI84CE_FILES, {
      notReady:
        'The calculator didn’t respond. Make sure it’s on the home screen and not running a program. ' +
        'If KEYPAD is running, press [on] to quit it first.',
      done:
        'Installed! On the calculator, run prgmKEYPAD, then connect. ' +
        'On OS 5.5 or later, set up arTIfiCE first or KEYPAD won’t run.',
    });
  }

  /**
   * Send one stage of arTIfiCE (see ARTIFICE_STEPS for what the student does
   * around each stage). Same rules as install().
   */
  installArtifice(stage: ArtificeStage): Promise<boolean> {
    const notReady =
      stage === 'v3-trigger'
        ? 'The calculator didn’t respond. Make sure Inequalz is open on its Y= screen.'
        : 'The calculator didn’t respond. Make sure it’s on the home screen and not running a program.';
    const done = {
      'v2.1': 'arTIfiCE sent. On the calculator, press [prgm], choose A, and press [enter].',
      'v3-installer': 'Installer sent. Now open Inequalz on the calculator.',
      'v3-trigger': 'Trigger sent. The calculator installs AsmHook2 and reboots.',
    }[stage];
    return this.#send(stage, ARTIFICE_FILES[stage], { notReady, done });
  }

  /**
   * Read the calculator's OS version, e.g. "5.8.3". Call from a click handler.
   * `message` is null when the student closed the device picker.
   */
  async detectOsVersion(): Promise<OsVersionResult> {
    if (this.#busy) return { ok: false, message: 'The calculator is busy with a transfer.' };
    const refusal = this.#options.precheck?.();
    if (refusal) return { ok: false, message: refusal };
    const usb = this.#options.usb ?? getUsb();
    if (!usb) return { ok: false, message: 'Reading the OS version needs WebUSB (Chrome or Edge).' };

    this.#busy = true;
    try {
      const link = await DusbLink.open(await this.#device(usb));
      try {
        const os = (await link.getParameters([PARAM.OS_VERSION])).get(PARAM.OS_VERSION);
        if (!os) return { ok: false, message: 'The calculator didn’t report its OS version.' };
        return { ok: true, version: formatOsVersion(os) };
      } finally {
        await link.close();
      }
    } catch (err) {
      return { ok: false, message: err instanceof Cancelled ? null : errorMessage(err) };
    } finally {
      this.#busy = false;
    }
  }

  reset(): void {
    if (this.getSnapshot().status !== 'installing') {
      this.setState({ status: 'idle', job: null, message: null, done: 0, total: 0 });
    }
  }

  async #send(
    job: InstallJob,
    names: readonly string[],
    messages: { notReady: string; done: string },
  ): Promise<boolean> {
    if (this.#busy) return false;
    const refusal = this.#options.precheck?.();
    if (refusal) return this.#fail(job, refusal);
    const usb = this.#options.usb ?? getUsb();
    if (!usb) return this.#fail(job, 'Installing needs WebUSB (Chrome or Edge).');

    const total = names.length;
    this.#busy = true;
    this.setState({ status: 'installing', job, message: 'Getting ready…', done: 0, total });
    try {
      // Download first, so a bad file fails before touching the calculator.
      const files = await Promise.all(names.map((name) => this.#loadFile(name)));

      const device = await this.#device(usb);
      this.#progress('Talking to the calculator…');
      const link = await DusbLink.open(device);
      try {
        if (!(await link.ping())) throw new Error(messages.notReady);

        // Free RAM isn't reported over USB (the CE says 0), so only archive is checked.
        const archive = files.flatMap((f) => f.variables).filter((v) => v.archived);
        const needed = archive.reduce((sum, v) => sum + v.data.length, 0);
        if (needed) {
          const free = (await link.getParameters([PARAM.FREE_FLASH])).get(PARAM.FREE_FLASH);
          const freeBytes = free ? Array.from(free).reduce((acc, b) => acc * 256 + b, 0) : Number.POSITIVE_INFINITY;
          if (freeBytes < needed) {
            throw new Error(`Not enough archive memory: this needs about ${Math.ceil(needed / 1024)} KB free.`);
          }
        }

        for (const [i, { name, variables }] of files.entries()) {
          this.#progress(`Sending ${name.split('/').pop()}…`, i);
          for (const variable of variables) await link.sendVariable(variable);
        }
      } finally {
        await link.close();
      }
      this.setState({ status: 'done', done: total, message: messages.done });
      return true;
    } catch (err) {
      if (err instanceof Cancelled) {
        this.setState({ status: 'idle', job: null, message: null, done: 0 });
        return false;
      }
      return this.#fail(job, errorMessage(err));
    } finally {
      this.#busy = false;
    }
  }

  /** A calculator the student already allowed, or one they pick now. */
  async #device(usb: UsbLike): Promise<UsbDeviceLike> {
    const granted = (await usb.getDevices()).find(isTi84ce);
    if (granted) return granted;
    this.#progress('Choose your calculator in the browser’s popup…');
    try {
      return await usb.requestDevice({ filters: [TI84CE_USB_FILTER] });
    } catch (err) {
      // NotFoundError from the picker means the student closed it without choosing.
      if (err instanceof DOMException && err.name === 'NotFoundError') throw new Cancelled();
      throw err;
    }
  }

  async #loadFile(name: string): Promise<{ name: string; variables: TiVariable[] }> {
    const base = this.#options.baseUrl ?? DEFAULT_ASSET_BASE_URL;
    const url = base.endsWith('/') ? base + name : `${base}/${name}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Couldn’t download ${name} (${response.status}).`);
    try {
      return { name, variables: parseTiFile(new Uint8Array(await response.arrayBuffer())) };
    } catch (err) {
      if (err instanceof TiFileError) throw new Error(`${name} isn’t a valid calculator file: ${err.message}`);
      throw err;
    }
  }

  #progress(message: string, done = this.getSnapshot().done): void {
    if (this.getSnapshot().status === 'installing') this.setState({ message, done });
  }

  #fail(job: InstallJob, message: string): false {
    this.setState({ status: 'error', job, message });
    return false;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'NetworkError')) {
    return 'The calculator disconnected during the transfer. Plug it back in and try again.';
  }
  if (err instanceof DOMException && err.name === 'SecurityError') {
    return 'The browser blocked access to the calculator. Close other tabs or apps using it (like TI Connect CE) and try again.';
  }
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'Transfer failed.';
}
