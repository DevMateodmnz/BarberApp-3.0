# Mobile Internationalization Foundation

This document defines the first mobile i18n foundation for BarberApp. It adds shared locale resolution, persisted language preference, typed translation catalogs, locale-aware formatters, and localized error mapping **before** the navigation/dashboard redesign so future translated layouts can be built safely.

## Quick path

1. Use the shared mobile i18n runtime in `apps/mobile/src/i18n/`.
2. Keep interface language, business timezone, and currency as separate concerns.
3. Migrate screens incrementally in the next batch instead of rewriting every hardcoded string now.

## What is in scope now

| Topic | Decision |
|-------|----------|
| Libraries | Use `expo-localization`, `i18next`, and `react-i18next`. |
| Supported app locales | `es`, `en`, `de`, `fr`, `it`, `zh-Hans`. |
| Android locale declaration | Declare `zh-CN` in `app.json`, then normalize it to canonical app locale `zh-Hans` in code. |
| Fallback | Unsupported or invalid locale input falls back to Spanish (`es`). |
| Preference storage | Persist explicit language preference in Expo Secure Store; `system` means “use device language”. |
| Runtime switching | Language can change at runtime through the localization runtime without Metro restart or source edits. |
| Missing keys | Fallback to Spanish; parity tests protect catalogs; dev diagnostics stay non-fatal. |
| Formatting | New shared `Intl` helpers format dates, times, decimals, percentages, and money without changing business timezone semantics or ARS defaults. |
| Error localization | Stable employee `NOT_FOUND` / `CONFLICT` cases are localized; unknown errors use localized generic copy with dev-only raw diagnostics. |

## Supported languages and locale behavior

### Supported interface languages

| Language | Canonical locale |
|----------|------------------|
| Spanish | `es` |
| English | `en` |
| German | `de` |
| French | `fr` |
| Italian | `it` |
| Simplified Chinese | `zh-Hans` |

### Device locale resolution

- Regional aliases normalize to supported app locales.
- Examples:
  - `es-AR` → `es`
  - `en-US` → `en`
  - `de-DE` → `de`
  - `fr-FR` → `fr`
  - `it-IT` → `it`
  - `zh-CN`, `zh-SG`, `zh-Hans-CN` → `zh-Hans`
- Unsupported locales (for example `pt-BR`) fall back to `es`.

### Preference behavior

- Stored values can be one supported locale or `system`.
- Missing or invalid stored values fall back safely to `system`.
- Storage failures must not block app startup.
- The visible language selector is deferred to the next batch, but the runtime API is ready for it.

## Locale, timezone, and currency are separate

These values must **not** be conflated:

| Concern | Current rule |
|---------|--------------|
| Interface language | Comes from device locale or saved user preference. |
| Business timezone | Remains the barbershop-local timezone behavior already used by the app. |
| Currency | Remains Argentine peso behavior until currency becomes configurable. |

Rules:

- Do not infer currency from language.
- Do not infer timezone from language.
- Do not concatenate money strings manually when the shared formatter is available.
- Continue treating user-entered calendar/day semantics as barbershop-local, not UTC-derived.

## Translation resource conventions

### Key conventions

- Use stable semantic keys, not translated strings, as identifiers.
- Group keys by feature or cross-cutting concern (`common`, `navigation`, `errors`, `paymentMethods`, and so on).
- Prefer short, composable keys over large sentence blobs.
- Keep interpolation variables semantic (`countLabel`, `amount`, `count`).

### Pluralization and interpolation

- Use i18next plural keys (`*_one`, `*_other`) through the base key.
- Use interpolation for dynamic values.
- Keep user-created data outside the translation catalog.

### User-content policy

Never auto-translate user-created content, including:

- barbershop names
- employee names
- client names
- service names
- notes

These values are content, not interface copy.

## Missing-translation behavior

- Spanish is the fallback catalog.
- Catalog parity tests are required across all six locales.
- Development diagnostics may append raw unknown error text.
- Production must not crash on missing keys or storage errors.

## Shared responsive text rules

These rules exist now so the next layout batch does not assume English-only dimensions:

1. Do not assume one-line labels for tabs, buttons, cards, or section headers.
2. Avoid fixed heights that only fit short English labels.
3. Expect German and French strings to be longer than English.
4. Expect Chinese strings to be shorter but visually denser.
5. Check accessibility font scaling before locking vertical spacing.
6. Prefer content-driven layout over hardcoded widths.
7. Hidden routes still need translated titles because they appear in headers and future navigation flows.

## Current migration inventory

This batch intentionally does **not** migrate every hardcoded string. Current rough inventory from the mobile audit:

| Domain | Approx. string count | Notes |
|--------|-----------------------|-------|
| Home / dashboard | 91 | Largest visible summary surface |
| Services | 84 | Forms, buttons, validation, labels |
| Service records | 65 | Record flow + summary copy |
| Employees | 63 | Owner management + onboarding errors |
| Appointments | 62 | Status/action heavy |
| Working hours | 44 | Weekdays + validation |
| Roles / statuses / payment methods | 34 | Shared cross-screen labels |
| Authentication | 24 | Sign-in and auth errors |
| Runtime / configuration errors | 20 | Startup/config surfaces |
| Dates / times / currency | 19 | Needs formatter migration |
| Navigation | 6 | Tabs + hidden route titles |
| Shared UI / misc | 9+ | Small but cross-cutting |

## Migration plan by screen

### Next migration order

1. `app/(tabs)/index.tsx` and Home shared components
2. `app/(tabs)/appointments.tsx`
3. `app/(tabs)/record-service.tsx`
4. `app/(tabs)/services.tsx`
5. `app/(tabs)/employees.tsx`
6. `app/(tabs)/working-hours.tsx`
7. auth surfaces and remaining startup/runtime copy

### Why this order

- Home and Appointments define the future daily-workflow navigation priorities.
- Record/Services/Employees/Working Hours already depend on many shared labels and formatters.
- Shared formatters should migrate before deeper layout changes so text wrapping can be measured with translated content.

## Current shared components to revisit in Prompt 2

These components were audited but not redesigned here:

- `AppButton`
- `AppCard`
- `Screen`
- `ScreenHeader`
- `SectionHeader`
- `ListItem`
- `FormSection`
- tab/navigation labels

Review them for:

- fixed heights
- fixed widths
- single-line assumptions
- truncated labels without fallback behavior
- spacing that breaks under accessibility font scaling

## Translation review status

Current non-Spanish catalogs are implementation starters only.

| Locale | Review status |
|--------|---------------|
| `es` | Project fallback / reference catalog |
| `en` | Needs product review |
| `de` | Needs native-speaker review before commercial launch |
| `fr` | Needs native-speaker review before commercial launch |
| `it` | Needs native-speaker review before commercial launch |
| `zh-Hans` | Needs native-speaker review before commercial launch |

Do **not** treat AI-generated German, French, Italian, or Chinese copy as launch-ready localization.

## Future QA matrix

| Area | Spanish | English | German | French | Italian | Simplified Chinese | Accessibility font sizes |
|------|---------|---------|--------|--------|---------|--------------------|--------------------------|
| Root/config surfaces | ✅ | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Home | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Appointments | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Record Service | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Services | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Employees | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Working Hours | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Runtime language switching | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |

Legend:

- ✅ covered by current automated foundation tests
- 🔲 requires future screen-level migration + QA

## Reviewer checklist

- [ ] Supported locales are limited to the six approved interface languages.
- [ ] Unsupported and invalid locale inputs fall back to Spanish.
- [ ] Language preference storage cannot crash startup.
- [ ] Runtime switching works without app rebuild or Metro restart.
- [ ] Translation catalogs stay in parity across all locales.
- [ ] New formatters keep timezone semantics separate from language.
- [ ] User-created content is not auto-translated.
- [ ] Unknown API errors do not leak raw server copy in production.

## Next step

Prompt 2 should migrate the first screen batch onto this foundation, starting with Home + Appointments + shared navigation labels, and then validate translated layout behavior under German/French length pressure and larger accessibility font sizes.
