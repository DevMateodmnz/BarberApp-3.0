# Mobile Daily-Workflow Navigation

This batch turns the mobile shell into a role-based daily workflow instead of a single Home tab with stacked management cards.

## Product intent

### OWNER daily workflow

1. Check appointments.
2. Record completed services.
3. Review revenue and service records.
4. Occasionally manage services, employees, and working hours.

### BARBER daily workflow

1. Check assigned appointments.
2. Record completed services.
3. Review personal revenue and records.

The navigation keeps high-frequency work one tap away and moves lower-frequency administration behind an OWNER-only Manage surface.

## Previous route graph

Before Prompt 3, the `(tabs)` group exposed only one visible tab:

- `index` → visible Home tab
- `appointments` → hidden route
- `record-service` → hidden route
- `services` → hidden route
- `employees` → hidden route
- `working-hours` → hidden route

That layout forced frequent daily actions to start from a long Home menu and mixed operational work with occasional administration.

## Selected Expo Router strategy

### Chosen pattern

- `Tabs` for the persistent shell
- `Tabs.Protected` for OWNER/BARBER route availability
- `href: null` for hidden secondary management routes
- a centralized role-navigation model in `apps/mobile/src/lib/mobileNavigation.ts`

### Why this strategy

`expo-router` v6 supports `Tabs.Protected` directly, including redirecting away from routes that become unavailable and pruning stale history entries when guards change. That is safer than hand-rolled redirect loops or unsupported dynamic routing hacks.

## Primary destinations

### OWNER

1. Home
2. Appointments
3. Record
4. Manage

### BARBER

1. Home
2. Appointments
3. Record

### Primary-action decision

Record remains the primary daily action and is visually emphasized in the tab shell with the orange brand accent. The label stays visible, but the icon treatment makes the destination stand out without using a fragile floating button.

## Navigation model

`apps/mobile/src/lib/mobileNavigation.ts` centralizes:

- stable destination ids
- route paths
- tab route names
- icon metadata
- allowed roles
- tab-label translation keys
- accessibility-label translation keys
- primary-action status
- ordering

This avoids scattering role checks across the tab layout and keeps tests focused on one source of truth.

## Hidden secondary routes

These routes stay inside the tabs group but are not shown as primary tabs:

- `/(tabs)/services`
- `/(tabs)/employees`
- `/(tabs)/working-hours`

They are reachable from Manage and keep their existing screen logic instead of duplicating features inside a new container.

## Manage surface

`apps/mobile/app/(tabs)/manage.tsx` and `apps/mobile/src/components/ManageContent.tsx` provide an OWNER-only management surface with:

- Services
- Employees
- Working Hours
- Language

### Why Manage is OWNER-only

These destinations are business administration, not daily execution work. BARBER users should not see them in persistent navigation.

## Home information hierarchy

Home now prioritizes the daily workflow:

1. App identity/header and language access
2. Current account/barbershop context
3. Compact Daily Actions section
4. Revenue overview
5. Service records

### Removed from Home

The large stacked OWNER cards for Services, Employees, and Working Hours were removed from Home.

### Daily Actions section

Both OWNER and BARBER now get compact full-card tiles for:

- Record Service
- Appointments

The tiles are fully tappable and do not contain a second competing button.

## Spacing system

This batch uses shared layout tokens instead of ad-hoc margins:

- `screenHorizontalPadding` → 16 px
- `compactControlGap` → 8 px
- `relatedCardGap` → 12 px
- `sectionContentGap` → 16 px
- `majorSectionGap` → 24 px
- `bottomSafeAreaSpacing` → 32 px

These values are defined in `apps/mobile/src/theme/tokens.ts` and applied to Home, Manage, and the tab shell state layouts to resolve the previous no-gap feel without rewriting unrelated screens.

## Multilingual constraints

The navigation uses dedicated concise tab labels instead of reusing long full screen titles.

Examples:

- English: `Record` instead of `Record Service`
- German: `Erfassen`
- French: `Saisir`
- Italian: `Registra`
- Simplified Chinese: `登记`

This keeps the tab bar readable across all six locales while preserving fuller screen titles and accessibility labels elsewhere.

## Direct-route authorization behavior

UI visibility is not the authorization boundary.

### Client-side behavior

- `Tabs.Protected` prevents BARBER users from keeping OWNER-only routes active.
- Hidden management routes still carry OWNER-only route guards in the shell.
- Manage content also has a localized owner-only fallback state.
- Signed-out users are redirected back to the auth stack.

### Server-side behavior

Backend authorization remains authoritative for services, employees, working hours, appointments, and record creation.

## Accessibility considerations

- visible labels remain present in the tab bar
- every primary tab has a localized accessibility label
- Manage and Daily Action tiles are full-width press targets, not tiny icon affordances
- long text is allowed to wrap in cards instead of depending on English-only fixed heights
- language access remains reachable from signed-in and signed-out flows

## Deferred work

This batch intentionally does **not** add:

- CLIENT navigation redesign
- backend authorization changes
- appointment feature redesign
- analytics changes
- physical-device QA evidence
- release merge or deployment work

## Files of record

- `apps/mobile/src/lib/mobileNavigation.ts`
- `apps/mobile/app/(tabs)/_layout.tsx`
- `apps/mobile/app/(tabs)/manage.tsx`
- `apps/mobile/src/components/HomeContent.tsx`
- `apps/mobile/src/components/ManageContent.tsx`
- `apps/mobile/src/theme/tokens.ts`
