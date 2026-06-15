# UI/UX Redesign — Preparation

**Date**: 2026-06-15  
**Status**: Planning — not started  
**Precedes**: Implementation phase

---

## Current State

The BarberApp mobile MVP is **functionally complete** for OWNER and BARBER roles. All screens work correctly, data flows are validated, and physical QA has passed.

However, the UI is **visually rough and inconsistent**:

- No design system or shared component library
- Inconsistent spacing, typography, and color usage
- Basic card layouts with minimal visual hierarchy
- Loading states are minimal or absent
- Empty states are not designed
- Form inputs lack cohesive styling
- Navigation and transitions feel utilitarian
- No animations or micro-interactions
- Status badges and indicators are basic

---

## Goals

Build a cohesive, professional mobile UI that:

1. **Feels like a polished product**, not a prototype
2. **Is consistent** across all screens and roles
3. **Reduces cognitive load** for barbershop staff during daily operations
4. **Scales** to future features (CLIENT, booking, photos)
5. **Respects platform conventions** (iOS/Android) while maintaining brand identity

---

## Non-Goals (Constraints)

- ❌ Do **not** change business logic
- ❌ Do **not** modify API contracts
- ❌ Do **not** alter auth flow (Clerk)
- ❌ Do **not** change data models or Prisma schema
- ❌ Do **not** add new features
- ❌ Do **not** touch CLIENT role

---

## Scope — Screens to Redesign

| Screen | Current Issues | Priority |
|--------|---------------|----------|
| Sign-in | Basic Clerk default UI | Medium |
| Home (OWNER) | Card layout lacks hierarchy, summary section basic | High |
| Home (BARBER) | Same as OWNER minus some cards | High |
| Services list | Functional but plain list rows | High |
| Service form (create/edit) | Basic form, no validation indicators | High |
| Employees list | Plain rows, assignment section cramped | High |
| Employee service assignments | Expand/collapse works but visually raw | Medium |
| Working Hours | Table-like layout, time picker basic | High |
| Appointments list | Card layout, filter chips, date navigation all basic | High |
| Appointment detail/actions | Status badges and action buttons need hierarchy | High |
| Service Record form | Service selector, price display, payment picker | High |
| Empty states | Missing or placeholder text only | Medium |
| Loading states | Skeleton/spinner inconsistent | Medium |
| Error states | Toast/flash only, no inline errors | Low |

---

## Design System — Proposed Foundations

### Colors
- Primary: barbershop brand color (warm amber/brown palette)
- Semantic: success (green), warning (amber), error (red), info (blue)
- Neutral: gray scale for text, borders, backgrounds
- Dark mode: deferred

### Typography
- System font stack (San Francisco / Roboto)
- Scale: title, heading, subheading, body, caption, label
- Weight hierarchy: bold for emphasis, regular for body, light for captions

### Spacing
- 4px base grid (4, 8, 12, 16, 20, 24, 32, 48)
- Consistent padding/margin across all screens
- Safe area insets respected (notch, home indicator)

### Components (to extract)
- `AppCard` — consistent card with title, body, footer
- `StatusBadge` — appointment status (PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW)
- `FilterChip` — employee filter chips on appointments
- `DateNavigator` — previous/next day with Today button
- `ServiceSelector` — service picker with price display
- `EmployeePicker` — dropdown for OWNER record creation
- `EmptyState` — icon + message for empty lists
- `LoadingSkeleton` — shimmer placeholders
- `FormField` — consistent label, input, error pattern
- `FlashMessage` — toast/notification component

---

## Approach

### Phase 1: Audit & Design
1. Collect UI references (barbershop apps, scheduling apps, design inspiration)
2. Define design system tokens (colors, spacing, typography)
3. Create screen mockups for priority screens (Home, Appointments, Record Service)
4. Review with stakeholders

### Phase 2: Component Extraction
1. Extract shared components from existing screens
2. Apply design system tokens
3. Build component storybook/documentation
4. Ensure all existing functionality preserved

### Phase 3: Screen-by-Screen Redesign
1. Redesign one screen at a time
2. Run full test suite after each screen
3. Physical QA after each screen batch
4. Commit atomically per screen

### Phase 4: Polish
1. Add micro-interactions and transitions
2. Implement loading skeletons
3. Design empty states
4. Final QA pass

---

## References

- Mobile screens: `apps/mobile/src/app/(auth)/`
- Components: `apps/mobile/src/components/`
- Stores: `apps/mobile/src/stores/`
- Type definitions: `apps/mobile/src/lib/types.ts`
