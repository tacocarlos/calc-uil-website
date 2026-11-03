// Guidance for setting up arTIfiCE (https://yvantt.github.io/arTIfiCE/), the
// jailbreak that lets TI-84 Plus CE calculators on OS 5.5 and later run C
// programs such as KEYPAD. Files are sent with CalculatorInstaller.installArtifice.

import type { ArtificeStage } from './installer.js';

/** Which arTIfiCE a calculator needs, by OS version. */
export type ArtificeRelease = 'not-needed' | 'v2.1' | 'v3' | 'unsupported';

/** How students find their OS version on the calculator. */
export const FIND_OS_VERSION =
  'On the calculator, press [2nd][mem] (above [+]), then choose 1:About. The OS version is a number like 5.8.5.0021.';

export const INEQUALZ_URL =
  'https://education.ti.com/en/software/details/en/8C7FB96338F9469BB9D970AFC034EC39/inequality-graphing-app';

export const ARTIFICE_URL = 'https://yvantt.github.io/arTIfiCE/';

/**
 * Pick the arTIfiCE release for an OS version such as "5.8.5" or "5.8.5.0021".
 * Returns null if `os` isn't a version number.
 *
 * - 5.4 and earlier run C programs without it.
 * - 5.5 through 5.8.4 use v2.1.
 * - 5.8.5 uses v3 (v3 supports 5.8.5 only).
 * - Anything newer isn't supported by arTIfiCE yet.
 */
export function artificeReleaseFor(os: string): ArtificeRelease | null {
  const match = /^\s*(\d+)\.(\d+)(?:\.(\d+))?/.exec(os);
  if (!match) return null;
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  const version = major * 10000 + minor * 100 + patch;
  if (version < 50500) return 'not-needed';
  if (version <= 50804) return 'v2.1';
  if (version === 50805) return 'v3';
  return 'unsupported';
}

/** One step of the setup. Steps with `send` are done by the site; the rest by the student. */
export interface ArtificeStep {
  text: string;
  /** Files the site sends at this step (pass to installer.installArtifice). */
  send?: ArtificeStage;
  /** Shown as a caution: data loss, or something that must be true first. */
  warning?: boolean;
  /** A related download or page. */
  link?: { href: string; label: string };
}

export const ARTIFICE_STEPS: Readonly<Record<'v2.1' | 'v3', readonly ArtificeStep[]>> = {
  'v2.1': [
    { text: 'Send arTIfiCE v2.1 to the calculator.', send: 'v2.1' },
    {
      text:
        'On the calculator, press [prgm], choose TI-Basic if asked, choose the first program (A), and press ' +
        '[enter]. C programs like KEYPAD can now run.',
    },
    { text: 'Run prgmKEYPAD as usual. If the arTIfiCE shell is showing, press [mode] to leave it first.' },
    { text: 'If KEYPAD stops launching later (for example after a RAM reset), run A again.' },
  ],
  v3: [
    {
      text: 'The Inequalz app (free from TI) must be installed on the calculator. arTIfiCE v3 uses it.',
      warning: true,
      link: { href: INEQUALZ_URL, label: 'Get Inequalz' },
    },
    {
      text:
        'Back up anything important, then do a RAM reset: [2nd][mem], 7:Reset, 1:All RAM, 2:Reset. ' +
        'KEYPAD and its libraries are kept in archive memory, so they survive.',
      warning: true,
    },
    { text: 'Send the arTIfiCE installer.', send: 'v3-installer' },
    {
      text:
        'On the calculator, press [apps] and open Inequalz. Press any key to dismiss the splash screen, then ' +
        'stay on the Y= screen. If it says CONFLICTING APPS, choose option 2.',
    },
    { text: 'Send the trigger. The calculator installs AsmHook2 and reboots by itself.', send: 'v3-trigger' },
    { text: 'Press [apps] and open AsmHook2 once. Then run prgmKEYPAD as usual.' },
    { text: 'After any RAM reset, open AsmHook2 again. You won’t need the computer for that.' },
  ],
};

/** Press-to-Test (exam mode) disables arTIfiCE; it has to be set up again afterwards. */
export const ARTIFICE_EXAM_NOTE =
  'Press-to-Test (exam mode) disables arTIfiCE. Set it up again after an exam.';
