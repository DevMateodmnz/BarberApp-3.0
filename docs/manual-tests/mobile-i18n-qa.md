# Mobile i18n QA Runbook

Use this runbook for multilingual regression passes. The latest compact device validation for the multilingual navigation batch is now recorded below.

## Latest physical-device result

- **Date**: 2026-06-25
- **Device**: Samsung Galaxy S21
- **Runtime**: Expo Go
- **Feature commit tested**: `ceea8ced4efa9782d6fe866e7faef2dabdfe7f9d`
- **Overall result**: PASS

### Recorded coverage

- Spanish OWNER flow: PASS
- Spanish BARBER flow: PASS
- German layout/overflow stress: PASS
- Simplified Chinese rendering: PASS
- Runtime language switching: PASS
- Locale persistence after reload: PASS

### Notes from the recorded pass

- Role-based tab labels remained stable while switching languages at runtime.
- German remained the effective long-label stress case and did not introduce clipping.
- Simplified Chinese rendered without missing-glyph boxes or broken alignment.
- The selected non-Spanish locale persisted after a normal Expo reload.
- The app was returned to Spanish before finishing the recorded session.

## Quick path

1. Verify signed-out switching from the sign-in screen.
2. Verify signed-in switching from Home or Manage.
3. Repeat key OWNER/BARBER flows in all six languages, then rerun stress checks for German, French, Simplified Chinese, and large accessibility fonts.

## Scope

### Languages

- Spanish
- English
- German
- French
- Italian
- Simplified Chinese

### Roles

- OWNER
- BARBER

### Out of scope for this runbook

- CLIENT product behavior beyond confirming untranslated future placeholders are not introduced
- backend business-logic validation unrelated to localization

## Preconditions

- mobile app builds and launches locally
- localization tests are green
- test accounts exist for OWNER and BARBER
- known sample user-created content exists:
  - service names
  - employee names
  - client names
  - notes

## Regression checklist for future reruns

### Signed-out checks

- [ ] Open the sign-in screen in default/system mode.
- [ ] Open the language selector from sign-in.
- [ ] Confirm `system` plus all six locale self-names are visible.
- [ ] Switch to each locale and confirm the sign-in title, subtitle, labels, placeholders, buttons, and validation copy update immediately.
- [ ] Confirm changing locale does not reload the app.
- [ ] Confirm returning from the selector preserves typed email/code input.

### Signed-in checks

- [ ] Sign in as OWNER.
- [ ] Open the language selector from Home or Manage.
- [ ] Switch through all six locales.
- [ ] Confirm Home, navigation labels, and current screen copy update immediately.
- [ ] Confirm switching locale does not sign the user out.
- [ ] Confirm switching locale does not reset selected dates, filters, or in-progress forms.

### Persistence checks

- [ ] Choose an explicit locale, fully close the app, reopen, and confirm the same locale remains selected.
- [ ] Switch back to `Use device language`, close/reopen, and confirm the resolved locale follows the device language.
- [ ] If the device language is unsupported, confirm the app falls back to Spanish.
