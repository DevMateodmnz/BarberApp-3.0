# Mobile Role Navigation QA (Manual / Physical Device)

This runbook now includes the recorded physical-device PASS for the multilingual role-navigation batch and remains the checklist for future regression retests.

## Latest execution record

- **Date**: 2026-06-25
- **Device**: Samsung Galaxy S21
- **Runtime**: Expo Go
- **Feature commit tested**: `ceea8ced4efa9782d6fe866e7faef2dabdfe7f9d` (`feat(mobile): add role-based daily navigation`)
- **Overall result**: PASS
- **Non-blocking observations**: none reported during the compact multilingual navigation pass

## Recorded PASS summary

### Spanish OWNER

- Tabs showed exactly `Inicio`, `Citas`, `Registrar`, `Gestionar`
- `Registrar` remained the visually emphasized central action
- Home hierarchy and spacing were clear, with Revenue moved earlier and no stacked OWNER management cards
- Appointments remained usable from the tab bar
- Record opened directly, OWNER employee picker remained present, and the flow stayed usable
- Manage exposed Services, Employees, Working Hours, and Language with stable back navigation and no duplicate screen implementation
- Sign-out/navigation behavior remained clean from OWNER-accessible routes

### Spanish BARBER

- Tabs showed exactly `Inicio`, `Citas`, `Registrar`
- `Gestionar` stayed hidden
- Home preserved Daily Actions and barber-scoped revenue with no OWNER shortcuts
- Appointments and Record remained usable
- Record correctly omitted the employee picker
- No stale OWNER tab, blank screen, redirect loop, or missing-context error was reported

### German stress check

- Tab labels remained readable with no overlap or clipping
- Home Daily Actions wrapped correctly and kept spacing
- Manage descriptions wrapped without clipping
- Working Hours weekday labels, time fields, and Save remained reachable
- Appointments controls stayed usable

### Simplified Chinese check

- Chinese glyphs rendered correctly with no missing-glyph boxes
- Bottom-tab icons and labels stayed aligned
- Home, Manage, Appointments, and Record remained understandable
- Language selector remained usable

### Persistence

- Selected non-Spanish language survived a normal Expo app reload
- App returned to Spanish successfully before concluding QA

### Navigation / safe area / spacing

- Bottom safe area remained stable on device
- Tab labels did not clip against navigation chrome
- Home and Manage spacing hierarchy read clearly on the physical device
- Runtime language switching did not break route state or tab-shell stability

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

## Regression checklist for future reruns

### OWNER tab bar

- [ ] Sign in as OWNER
- [ ] Confirm tabs are `Home`, `Appointments`, `Record`, `Manage`
- [ ] Confirm Record is visually emphasized with the orange primary treatment
- [ ] Confirm tab labels remain readable with no overlap or clipping
- [ ] Confirm bottom safe area is respected on the device
- [ ] Confirm switching tabs does not reset stores unexpectedly

### BARBER tab bar

- [ ] Sign in as BARBER
- [ ] Confirm tabs are `Home`, `Appointments`, `Record`
- [ ] Confirm `Manage` never appears
- [ ] Confirm Record remains visually emphasized
- [ ] Confirm no OWNER-only destination flashes during app start

### Home hierarchy

#### OWNER

- [ ] Confirm Home shows app header plus language access
- [ ] Confirm current context card is visible
- [ ] Confirm Daily Actions shows only `Record Service` and `Appointments`
- [ ] Confirm old large `Services`, `Employees`, and `Working Hours` cards are gone
- [ ] Confirm Revenue appears before Service Records
- [ ] Confirm OWNER employee revenue filter still works

#### BARBER

- [ ] Confirm Home shows app header plus language access
- [ ] Confirm Daily Actions shows `Record Service` and `Appointments`
- [ ] Confirm no OWNER management cards appear
- [ ] Confirm barber revenue remains personal/self-scoped
- [ ] Confirm Service Records still render and refresh correctly

### Manage surface (OWNER only)

- [ ] Open `Manage`
- [ ] Confirm Services card opens Services
- [ ] Confirm Employees card opens Employees
- [ ] Confirm Working Hours card opens Working Hours
- [ ] Confirm Language card opens the existing language selector modal
- [ ] Confirm long descriptions wrap without clipping
- [ ] Confirm BARBER cannot access Manage content
