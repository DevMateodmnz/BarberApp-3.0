# Mobile Role Navigation QA (Manual / Physical Device)

This runbook is for the next physical-phone QA pass after the Prompt 3 implementation batch. It does **not** claim phone QA is complete.

## Preconditions

- Branch under test includes `feat(mobile): add role-based daily navigation`
- Mobile public runtime config resolves correctly
- Test accounts exist for:
  - OWNER with active barbershop data
  - BARBER with assigned employee context
- Supported locales available:
  - `es`
  - `en`
  - `de`
  - `fr`
  - `it`
  - `zh-Hans`

## OWNER tab bar

- [ ] Sign in as OWNER
- [ ] Confirm tabs are `Home`, `Appointments`, `Record`, `Manage`
- [ ] Confirm Record is visually emphasized with the orange primary treatment
- [ ] Confirm tab labels remain readable with no overlap or clipping
- [ ] Confirm bottom safe area is respected on the device
- [ ] Confirm switching tabs does not reset stores unexpectedly

## BARBER tab bar

- [ ] Sign in as BARBER
- [ ] Confirm tabs are `Home`, `Appointments`, `Record`
- [ ] Confirm `Manage` never appears
- [ ] Confirm Record remains visually emphasized
- [ ] Confirm no OWNER-only destination flashes during app start

## Home hierarchy

### OWNER

- [ ] Confirm Home shows app header plus language access
- [ ] Confirm current context card is visible
- [ ] Confirm Daily Actions shows only `Record Service` and `Appointments`
- [ ] Confirm old large `Services`, `Employees`, and `Working Hours` cards are gone
- [ ] Confirm Revenue appears before Service Records
- [ ] Confirm OWNER employee revenue filter still works

### BARBER

- [ ] Confirm Home shows app header plus language access
- [ ] Confirm Daily Actions shows `Record Service` and `Appointments`
- [ ] Confirm no OWNER management cards appear
- [ ] Confirm barber revenue remains personal/self-scoped
- [ ] Confirm Service Records still render and refresh correctly

## Manage surface (OWNER only)

- [ ] Open `Manage`
- [ ] Confirm Services card opens Services
- [ ] Confirm Employees card opens Employees
- [ ] Confirm Working Hours card opens Working Hours
- [ ] Confirm Language card opens the existing language selector modal
- [ ] Confirm long descriptions wrap without clipping
- [ ] Confirm BARBER cannot access Manage content

## Route restrictions

- [ ] While signed in as BARBER, attempt to open `/(tabs)/manage`
- [ ] Confirm safe fallback to Home or another allowed route
- [ ] While signed in as BARBER, attempt to open `/(tabs)/services`
- [ ] While signed in as BARBER, attempt to open `/(tabs)/employees`
- [ ] While signed in as BARBER, attempt to open `/(tabs)/working-hours`
- [ ] Confirm no blank screen or redirect loop occurs
- [ ] Sign out from an OWNER-only route and confirm auth fallback is clean

## Central Record action

- [ ] Open Record from the tab bar
- [ ] Confirm the screen remains reachable in one tap
- [ ] Confirm the tab shell stays stable after creating a record and returning
- [ ] Confirm large font sizes do not break the primary tab affordance

## Appointments

- [ ] Open Appointments from Home
- [ ] Open Appointments from the tab bar
- [ ] Confirm both entry points land on the same screen
- [ ] Confirm date controls and role behavior remain intact

## Language switching

- [ ] Open language settings from Home
- [ ] Open language settings from Manage
- [ ] Change language while on Home
- [ ] Change language while on Appointments
- [ ] Change language while on Record
- [ ] Change language while on Manage
- [ ] Confirm labels update without restart and without losing route state

## Locale-specific checks

### Spanish
- [ ] Tab labels read naturally
- [ ] Home and Manage descriptions look balanced

### English
- [ ] Baseline reference pass

### German
- [ ] No clipped tab labels
- [ ] Working-hours and management descriptions wrap cleanly

### French
- [ ] `Rendez-vous` remains readable in the tab bar
- [ ] Manage descriptions wrap without truncation

### Italian
- [ ] Appointments and management labels remain readable

### Simplified Chinese
- [ ] Glyph rendering is correct
- [ ] Icon/text alignment remains centered and legible

## Device layout stress checks

- [ ] Small phone width
- [ ] Large accessibility font size
- [ ] Keyboard open/close while returning to Home
- [ ] Android system navigation area
- [ ] iPhone safe-area bottom inset

## Expected outcome for release readiness

Phone QA should confirm that the role-based shell is stable enough to carry forward toward the release branch, with no additional code batch required unless device testing reveals:

- tab-label clipping
- route-guard loops
- safe-area regressions
- language-switch instability
- role-flash regressions
