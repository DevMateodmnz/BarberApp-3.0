# Mobile Interface Localization

BarberApp mobile now uses one shared localization system for the complete OWNER/BARBER interface, including a reusable language selector, centralized formatting, localized mobile-owned validation/errors, and a hardcoded-string audit guard.

## Quick path

1. Add or update interface copy in `apps/mobile/src/i18n/locales/es.ts` first.
2. Keep every other locale in parity with the Spanish catalog.
3. Use `translate(...)`, `useTranslation()`, or the shared formatter/helpers instead of inline UI copy or manual formatting.

## Current outcome

| Topic | Decision |
|-------|----------|
| Supported locales | `es`, `en`, `de`, `fr`, `it`, `zh-Hans` |
| Fallback locale | Spanish (`es`) |
| Selector architecture | Root Expo Router modal route at `app/language.tsx` |
| Signed-out entry | `SignInScreenView` language action |
| Signed-in entry | `HomeContent` plus OWNER `Manage` language actions |
| Persistence | Explicit locale or `system` preference stored through the existing localization runtime |
| Runtime switching | Immediate, no restart, no Metro reload |
| Formatter source of truth | `apps/mobile/src/i18n/formatters.ts` |
| Legacy formatter status | `apps/mobile/src/lib/format.ts` now delegates user-facing presentation to the i18n formatter layer |
| Error strategy | Known stable cases map to translated keys; unknown API/mobile errors use localized generic fallback with dev-only diagnostics |
| Hardcoded-string guard | `apps/mobile/tests/unit/i18n-hardcoded-audit.test.ts` plus reviewed allowlist |

## What is now localized

### Surfaces completed

- root loading and configuration states
- sign-in flow
- language selector
- Home/dashboard
- Appointments
- Record Service
- Services
- Employees
- Working Hours
- shared role/status/payment labels
- loading, empty, success, validation, and confirmation copy owned by mobile

### Shared formatting completed

- localized date labels
- localized time labels
- localized integer/decimal/percent rendering
- localized ARS money formatting
- localized weekday rendering
- localized role/status/payment labels without changing backend codes

## Language selector architecture

### Route

- `apps/mobile/app/language.tsx`

### Behavior

- supports `system` mode plus the six explicit locales
- shows locale self-names:
  - Español
  - English
  - Deutsch
  - Français
  - Italiano
  - 简体中文
- shows the resolved active language while `system` mode is selected
- applies selection immediately
- preserves auth/session state, navigation state, and local stores
- persists the preference through the shared localization runtime

### Accessibility rules

- selector actions expose localized labels
- selected rows expose selected-state semantics
- language entry points remain reachable from signed-out and signed-in flows
- long labels are allowed to wrap instead of clipping

## Formatter migration rules

### Separation of concerns

| Concern | Rule |
|-------|------|
| Interface language | Controlled by locale preference/runtime |
| Business timezone | Still barbershop-local calendar semantics |
| Currency | Still ARS |
| User-created content | Never auto-translated |

### Implementation notes

- `apps/mobile/src/i18n/formatters.ts` is the presentation source of truth.
- `apps/mobile/src/lib/format.ts` keeps legacy call sites stable while delegating display formatting to the i18n formatter layer.
- Locale changes affect presentation only, not stored values or date-boundary logic.

## Error localization strategy

### Mobile-owned errors

- form validation uses translation keys
- screen-level missing-context states use translation keys
- unknown mobile/API failures flow through `localizeUnknownError(...)`

### Structured API mapping

- employee create flow maps known `NOT_FOUND` and `CONFLICT` cases to stable translated copy
- unknown backend messages are hidden behind a localized generic fallback in production
- development may append sanitized raw diagnostics for debugging

### Remaining backend gaps

The mobile app still depends on human-readable backend messages for some unknown-error diagnostics. This batch did **not** redesign the backend error contract; it only ensured the mobile UI no longer depends on untranslated fallback copy for user-facing presentation.

## Responsive text hardening

### Components updated for translation safety

- `AppButton`
- `ActionRow`
- `FormSection`
- `ListItem`
- `NavigationTile`
- `ScreenHeader`
- `SectionHeader`
- `RoleBadge`
- `StatusBadge`
- `MoneyText`
- Home/sign-in language entry placements
- role-based tab labels and OWNER Manage cards

### Rules enforced

- labels may wrap
- concise tab-specific labels can differ from full screen titles
- buttons can grow vertically
- action rows can wrap across lines
- headers no longer depend on short English text
- long German/French text must remain tappable
- Chinese strings must flow through the same component tree without custom branching

## Intentional untranslated literals

These remain by design and are protected by the hardcoded audit allowlist:

| Literal | Why it stays |
|--------|---------------|
| `BarberApp` | Brand name |
| `HH:mm` | Format mask placeholder |
| `—` | Neutral missing-value glyph |
| `‹` | Back icon glyph |
| legacy raw employee backend messages | internal matcher inputs for structured localization fallback |

## Verification

### Automated

- catalog parity tests
- locale render matrix smoke tests for auth, role-based navigation labels, Home, Manage, Appointments, Record Service, Services, Employees, and Working Hours
- language-selector tests
- formatter tests
- hardcoded-string audit

### Human review still required

- native-speaker review for German
- native-speaker review for French
- native-speaker review for Italian
- native-speaker review for Simplified Chinese
- physical-device overflow verification across larger accessibility font sizes

## Translation quality warning

Non-Spanish catalogs are implementation-ready for development and QA, but not launch-approved localization. They still require native-speaker product review before production release.

## Checklist

- [x] Complete OWNER/BARBER mobile interface migrated to i18n
- [x] Shared language selector available before and after sign-in
- [x] User-facing formatting centralized
- [x] Unknown mobile/API fallbacks localized
- [x] Hardcoded runtime UI literals audited with allowlist
- [ ] Native-speaker review completed for non-Spanish locales
- [ ] Physical six-language device QA completed

## Next step

Prompt 3 can now focus on navigation/layout redesign constraints using real translated copy instead of English-only placeholders.
