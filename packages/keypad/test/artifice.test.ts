import { describe, expect, it } from 'vitest';
import { ARTIFICE_STEPS, artificeReleaseFor } from '../src/artifice.js';
import { ARTIFICE_FILES } from '../src/installer.js';

describe('artificeReleaseFor', () => {
  it.each([
    ['5.3.0', 'not-needed'],
    ['5.4.0.0034', 'not-needed'],
    ['5.5', 'v2.1'],
    ['5.5.1.0038', 'v2.1'],
    ['5.6.0', 'v2.1'],
    ['5.8.4', 'v2.1'],
    ['5.8.5', 'v3'],
    ['5.8.5.0021', 'v3'],
    ['5.8.6', 'unsupported'],
    ['5.9.0', 'unsupported'],
    ['6.0', 'unsupported'],
    [' 5.7.0 ', 'v2.1'],
  ])('%s → %s', (os, release) => {
    expect(artificeReleaseFor(os)).toBe(release);
  });

  it('returns null for text that is not a version', () => {
    expect(artificeReleaseFor('')).toBeNull();
    expect(artificeReleaseFor('latest')).toBeNull();
  });
});

describe('ARTIFICE_STEPS', () => {
  it('sends each stage of a release exactly once, in order', () => {
    const sends = (release: 'v2.1' | 'v3') => ARTIFICE_STEPS[release].flatMap((s) => (s.send ? [s.send] : []));
    expect(sends('v2.1')).toEqual(['v2.1']);
    expect(sends('v3')).toEqual(['v3-installer', 'v3-trigger']);
    for (const stage of [...sends('v2.1'), ...sends('v3')]) expect(ARTIFICE_FILES[stage]).toBeDefined();
  });

  it('puts the RAM reset before the v3 installer is sent', () => {
    const steps = ARTIFICE_STEPS.v3.map((s) => s.send ?? s.text);
    const at = (pattern: RegExp) => {
      const i = steps.findIndex((t) => pattern.test(t));
      expect(i, String(pattern)).toBeGreaterThanOrEqual(0);
      return i;
    };
    expect(at(/RAM reset/)).toBeLessThan(steps.indexOf('v3-installer'));
    expect(at(/open Inequalz\. Press any key/)).toBeLessThan(steps.indexOf('v3-trigger'));
    expect(at(/open AsmHook2 once/)).toBeGreaterThan(steps.indexOf('v3-trigger'));
  });
});
