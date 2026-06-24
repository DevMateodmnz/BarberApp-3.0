# Mobile i18n QA Runbook

Use this runbook for the later physical-device multilingual pass. This document is intentionally broader than the automated suite and should be executed after localization changes are stable.

## Quick path

1. Verify signed-out switching from the sign-in screen.
2. Verify signed-in switching from Home.
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

## Signed-out checks

- [ ] Open the sign-in screen in default/system mode.
- [ ] Open the language selector from sign-in.
- [ ] Confirm `system` plus all six locale self-names are visible.
- [ ] Switch to each locale and confirm the sign-in title, subtitle, labels, placeholders, buttons, and validation copy update immediately.
- [ ] Confirm changing locale does not reload the app.
- [ ] Confirm returning from the selector preserves typed email/code input.

## Signed-in checks

- [ ] Sign in as OWNER.
- [ ] Open the language selector from Home.
- [ ] Switch through all six locales.
- [ ] Confirm Home, navigation labels, and current screen copy update immediately.
- [ ] Confirm switching locale does not sign the user out.
- [ ] Confirm switching locale does not reset selected dates, filters, or in-progress forms.

## Persistence checks

- [ ] Choose an explicit locale, fully close the app, reopen, and confirm the same locale remains selected.
- [ ] Switch back to `Use device language`, close/reopen, and confirm the resolved locale follows the device language.
- [ ] If the device language is unsupported, confirm the app falls back to Spanish.

## OWNER surface checks

### Home

- [ ] Dashboard subtitle and action cards are translated.
- [ ] Revenue labels, selected-date controls, and records section are translated.
- [ ] Money/date/time formatting changes by locale while business-day semantics stay correct.

### Appointments

- [ ] Title, subtitle, date controls, empty states, and status/action labels are translated.
- [ ] Employee filter labels remain usable after switching languages.

### Record Service

- [ ] Employee selection, service selection, payment options, price/notes/client labels, and success/error states are translated.
- [ ] User-created client names and notes remain unchanged across language switches.

### Services

- [ ] Search, filters, create/edit forms, active/inactive states, and action buttons are translated.
- [ ] Service names remain exactly as entered by the business.

### Employees

- [ ] Add-employee form, status labels, role labels, and service-assignment actions are translated.
- [ ] Employee names/emails remain unchanged.

### Working Hours

- [ ] Title, helper text, weekday labels, open/closed states, time labels, and save states are translated.
- [ ] Weekday display changes with locale without changing stored weekday IDs.

## BARBER surface checks

- [ ] Sign in as BARBER.
- [ ] Repeat Home, Appointments, Record Service, and blocked/limited management surfaces in all six locales.
- [ ] Confirm BARBER-scoped summaries and appointment/service flows preserve role rules after switching languages.

## Overflow and rendering stress

### German and French

- [ ] Check buttons, badges, cards, filters, and headers for clipping or overlap.
- [ ] Confirm long labels still wrap and remain tappable.

### Simplified Chinese

- [ ] Confirm Chinese strings render in headers, cards, forms, and list rows.
- [ ] Confirm there are no missing glyphs or fallback boxes.

### Large accessibility fonts

- [ ] Repeat sign-in, Home, Services, Employees, and Working Hours with larger system font size.
- [ ] Confirm primary actions remain visible and tappable without copy overlap.

## Data-preservation checks

- [ ] Service names remain unchanged across locale switches.
- [ ] Employee names remain unchanged across locale switches.
- [ ] Client names remain unchanged across locale switches.
- [ ] Notes remain unchanged across locale switches.
- [ ] Money/date/time presentation changes only visually, not in stored values.

## Failure capture

For every issue, record:

- locale
- role
- screen
- exact control/text
- screenshot
- whether the issue is translation quality, truncation, formatting, persistence, or state-loss

## Exit criteria

- [ ] Signed-out switching passes in all six languages
- [ ] Signed-in switching passes in all six languages
- [ ] Persistence passes
- [ ] OWNER flow checks pass
- [ ] BARBER flow checks pass
- [ ] German/French overflow checks pass
- [ ] Simplified Chinese rendering checks pass
- [ ] Large-font checks pass
- [ ] User-content preservation passes
