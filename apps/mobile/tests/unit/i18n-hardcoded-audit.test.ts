import { describe, expect, it } from 'vitest';

import {
  collectHardcodedLiteralFindings,
  HARD_CODED_STRING_ALLOWLIST,
} from '../support/i18nHardcodedAudit.js';

describe('mobile runtime hardcoded-string audit', () => {
  it('keeps user-visible runtime literals translated or explicitly allowlisted', () => {
    const findings = collectHardcodedLiteralFindings();

    expect(
      findings,
      findings.length === 0
        ? 'No suspicious runtime literals found.'
        : [
            'Unexpected runtime literals:',
            ...findings.map((finding) => `- ${finding.file}:${finding.line} → ${JSON.stringify(finding.literal)}`),
          ].join('\n'),
    ).toEqual([]);
  });

  it('documents every intentionally untranslated runtime literal', () => {
    expect(HARD_CODED_STRING_ALLOWLIST).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/components/ui/ScreenHeader.tsx',
          literal: '‹',
        }),
        expect.objectContaining({
          file: 'src/components/WorkingHoursScreenView.tsx',
          literal: 'HH:mm',
        }),
        expect.objectContaining({
          file: 'src/lib/constants.ts',
          literal: 'BarberApp',
        }),
      ]),
    );
  });
});
