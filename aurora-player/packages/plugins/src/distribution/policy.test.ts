import { describe, expect, it } from 'vitest';
import { runDistributionPolicyContract } from '../contract/policy-contract.js';
import {
  DESKTOP_PROFILE,
  PLAY_PROFILE,
  SIDELOAD_PROFILE,
  exclusionReason,
  isAllowedUnder,
} from './policy.js';

// LSP: the real gate passes the same reusable spec any policy must satisfy.
runDistributionPolicyContract({ name: 'isAllowedUnder', isAllowed: isAllowedUnder });

describe('isAllowedUnder specifics', () => {
  it('ships the bundled (no-meta) plugins under the Play profile', () => {
    expect(isAllowedUnder(undefined, PLAY_PROFILE)).toBe(true);
  });

  it('excludes a YouTube-shaped plugin from Play but not desktop/sideload', () => {
    const youtube = { storeSafe: false, platforms: ['desktop', 'sideload'] } as const;
    expect(isAllowedUnder(youtube, PLAY_PROFILE)).toBe(false);
    expect(isAllowedUnder(youtube, DESKTOP_PROFILE)).toBe(true);
    expect(isAllowedUnder(youtube, SIDELOAD_PROFILE)).toBe(true);
  });
});

describe('exclusionReason', () => {
  it('names the platform mismatch when a plugin is platform-pinned', () => {
    const reason = exclusionReason({ platforms: ['desktop'] }, PLAY_PROFILE);
    expect(reason).toContain("not distributed on 'play'");
    expect(reason).toContain('desktop');
  });

  it('cites store policy when a plugin is not store-safe', () => {
    const reason = exclusionReason({ storeSafe: false }, PLAY_PROFILE);
    expect(reason).toContain('store policy');
    expect(reason).toContain("'play'");
  });
});
