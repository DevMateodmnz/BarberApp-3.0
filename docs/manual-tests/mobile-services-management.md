# Mobile Services Management — Manual QA Checklist

This checklist verifies the mobile service catalog management flow (PR-049A through PR-053A) on a real device or in Expo Go.

## Scope

Covers the mobile OWNER flow for:
- Viewing the service catalog with status filter chips
- Creating a new service
- Editing an existing service (name, price, duration, description)
- Toggling service activation (deactivate / reactivate)
- Searching services by name
- Clearing the search query
- Pull-to-refresh

Relevant files:
- `apps/mobile/app/(tabs)/services.tsx`
- `apps/mobile/src/lib/serviceFilters.ts`
- `apps/mobile/src/lib/serviceForm.ts`
- `apps/mobile/src/lib/servicesStore.ts`

## Preconditions

> **Setup first**: If you haven't started the stack yet, follow **[MVP QA Setup Guide](./mobile-mvp-qa-setup.md)** before continuing.

Before testing, confirm:

- [ ] API server is running and reachable from the device.
- [ ] Mobile app `EXPO_PUBLIC_API_URL` points to the reachable API host.
- [ ] If testing on a physical phone, `EXPO_PUBLIC_API_URL` uses the LAN IP or reachable host, not `localhost`.
- [ ] Clerk publishable key is configured in the mobile environment.
- [ ] Test OWNER user exists with a barbershop context.
- [ ] Test BARBER and CLIENT users exist for role-restriction tests.

## Start the app

If using the current repo scripts:

1. Start the API server using the existing API workflow for this repo.
2. Start the mobile app:

```bash
npm run dev --workspace @barberapp/mobile
```

3. Open the app in Expo Go or the selected simulator/emulator.

## OWNER happy path

### View the Services screen

1. Sign in as an OWNER user.
2. Confirm the Home summary loads.
3. Tap the **View Services** card on Home.
4. Confirm the Services screen opens.

### Service list and filters

5. Confirm the service list loads and shows services.
6. Confirm the default filter is **Active** and the chip is highlighted.
7. Confirm each filter chip shows a count: `Active (N)`, `Inactive (N)`, `All (N)`.
8. Tap the **Inactive** filter chip.
9. Confirm the list shows only inactive services.
10. Tap the **All** filter chip.
11. Confirm the list shows all services (active and inactive).
12. Tap **Active** to return.

### Search by service name

13. Type a few characters of a service name in the search input.
14. Confirm the list filters to services whose name contains the query (case-insensitive).
15. Confirm the **Clear (×)** button appears next to the search input.
16. Tap the clear button.
17. Confirm the search query is cleared and the full filtered list is restored.
18. Type a query that matches no services.
19. Confirm the empty state shows: `No services match your search.`

### Create a service

20. Tap the **+ Add Service** button.
21. Confirm the create form appears with Name, Price, Duration, and Description fields.
22. Enter a valid name, price (e.g. `5000`), and duration (e.g. `30`).
23. Optionally enter a description.
24. Tap **Create Service**.
25. Confirm a success flash message appears.
26. Confirm the new service appears in the list.
27. Confirm the filter counts update to reflect the new service.

### Edit a service

28. Tap the **Edit** button on a service card.
29. Confirm the inline edit form appears, pre-filled with the service's current values.
30. Change the name, price, and duration.
31. Change or clear the description.
32. Tap **Save Changes**.
33. Confirm a success flash message appears.
34. Confirm the updated values are shown in the list.
35. Tap **Cancel** on another service's edit form.
36. Confirm the service remains unchanged.

### Toggle activation

37. Tap the **Deactivate** button on an active service.
38. Confirm the deactivation confirmation alert appears with **Cancel** and **Deactivate** options.
39. Tap **Cancel**.
40. Confirm the service is still active.
41. Tap **Deactivate** again and confirm.
42. Confirm the service now shows **Inactive** badge.
43. Switch to the **Inactive** filter.
44. Confirm the deactivated service appears.
45. Tap **Reactivate** on the inactive service.
46. Confirm the service immediately shows **Active** badge (no confirmation needed).
47. Switch to the **Active** filter and confirm the service is back.

### Pull-to-refresh

48. Pull down on the service list.
49. Confirm the refresh indicator appears.
50. Confirm the list reloads and counts update (if backend data changed).

## Negative / edge checks

### Validation — create form

- [ ] Empty name is rejected with `Service name is required.`
- [ ] Whitespace-only name is rejected.
- [ ] Non-numeric price (e.g. `abc`) is rejected with `Enter a valid price amount.`
- [ ] Negative price (e.g. `-10`) is rejected.
- [ ] Price with more than two decimal places (e.g. `10.999`) is rejected.
- [ ] Duration zero is rejected with `Enter a valid positive duration in minutes.`
- [ ] Negative duration (e.g. `-5`) is rejected.
- [ ] Decimal duration (e.g. `30.5`) is rejected.
- [ ] Non-numeric duration (e.g. `abc`) is rejected.
- [ ] Blank description is accepted without error (service is created without a description).

### Validation — edit form

- [ ] Empty name is rejected with the same message as create.
- [ ] Invalid price is rejected with the same message as create.
- [ ] Invalid duration is rejected with the same message as create.
- [ ] Blank description is accepted and clears any existing description.

### Filter edge cases

- [ ] Active filter with no active services shows `No active services.`
- [ ] Inactive filter with no inactive services shows `No inactive services.`
- [ ] All filter with no services at all shows `No services yet.`

### Search edge cases

- [ ] Leading and trailing whitespace in the search query is trimmed.
- [ ] Search combined with Active filter only searches active services.
- [ ] Search combined with Inactive filter only searches inactive services.
- [ ] Clearing search does not change the selected status filter.
- [ ] Filter counts remain based on the full service list, not search results.

## Role restrictions

### BARBER

1. Sign in as a BARBER user with an employee record.
2. Confirm Home loads.
3. Confirm there is no **View Services** card on Home.
4. Confirm the BARBER cannot directly navigate to the Services screen.

### CLIENT

1. Sign in as a CLIENT user.
2. Confirm Home loads the client dashboard message.
3. Confirm there is no **View Services** card on Home.
4. Confirm the CLIENT cannot directly navigate to the Services screen.

## Expected backend evidence

After creating a service:

- [ ] The service appears in the database (`Service` table with the barbershop's ID).
- [ ] The service is returned by `GET /api/v1/barbershops/:id/services?includeInactive=true`.

After editing a service:

- [ ] The updated fields are persisted in the database.
- [ ] A pull-to-refresh on the mobile app returns the updated values.

After deactivating a service:

- [ ] The service has `isActive: false` in the database.
- [ ] The service disappears from the Active filter on the mobile.
- [ ] The service still appears under Inactive and All filters.

After reactivating a service:

- [ ] The service has `isActive: true` in the database.
- [ ] The service returns to the Active filter on the mobile.

## Known limitations

- [ ] No component-level interaction tests (React Native / Vitest component-test infrastructure is blocked).
- [ ] Filter choice is not persisted across app restarts (resets to Active).
- [ ] Search query is not persisted across app restarts.
- [ ] No debounce on the search input — filters on every keystroke.
- [ ] No service detail screen — all editing is inline.
- [ ] No delete service functionality.
- [ ] No batch operations on services.

## Notes for testers

- Use the smallest realistic test data set:
  - one OWNER user with a barbershop
  - at least two active services and one inactive service in the catalog
  - one BARBER user and one CLIENT user for role-restriction tests
- If testing on a phone, make sure `EXPO_PUBLIC_API_URL` is reachable from the device network.
- The Services screen is only accessible to OWNER users via the **View Services** card on Home. It is not in the tab bar.
