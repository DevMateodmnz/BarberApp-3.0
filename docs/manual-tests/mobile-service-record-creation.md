# Mobile Service Record Creation — Manual QA Checklist

This checklist verifies the current mobile service record flow (through PR-056A) on a real device or in Expo Go.

## Scope

Covers the mobile flow for:
- OWNER service record creation (employee selection → service selection → price → submit)
- BARBER service record creation (own context → service selection → price → submit)
- Selected service context display (name, default price, duration)
- Price intent preservation when switching services (PR-055A)
- Custom vs default price messaging (PR-039A, PR-056A)
- paymentMethod, clientName, notes fields (PR-031A/031B)
- Home summary refresh after returning from the creation screen
- CLIENT access restrictions

Relevant files:
- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/record-service.tsx`
- `apps/mobile/src/components/ServiceRecordCreateSection.tsx`
- `apps/mobile/src/lib/serviceRecordPayload.ts`
- `apps/mobile/src/lib/format.ts`

## Preconditions

> **Setup first**: If you haven't started the stack yet, follow **[MVP QA Setup Guide](./mobile-mvp-qa-setup.md)** before continuing.

Before testing, confirm:

- [ ] API server is running and reachable from the device.
- [ ] Mobile app `EXPO_PUBLIC_API_URL` points to the reachable API host.
- [ ] If testing on a physical phone, `EXPO_PUBLIC_API_URL` uses the LAN IP or reachable host, not `localhost`.
- [ ] Clerk publishable key is configured in the mobile environment.
- [ ] Test OWNER user exists and has a barbershop context.
- [ ] Test BARBER user exists and has an employee context.
- [ ] Required employees exist (at least one active employee in the barbershop).
- [ ] Required services exist with non-zero price and duration (at least two services assigned to employees, ideally with different default prices).
- [ ] At least one service has a price of zero for edge-case testing (optional).

## Start the app

If using the current repo scripts:

1. Start the API server using the existing API workflow for this repo.
2. Start the mobile app:

```bash
npm run dev --workspace @barberapp/mobile
```

3. Open the app in Expo Go or the selected simulator/emulator.

## OWNER happy path

### Basic flow — employee selection and service list

1. Sign in as an OWNER user.
2. Confirm the Home summary loads.
3. Tap the **Record Service** entry point on Home.
4. Confirm the creation screen opens with the "Create Service Record" title.
5. Confirm the employee picker appears with available employees.
6. Select an employee.
7. Confirm assigned services load for the selected employee.

### Service selection and context block (PR-056A)

8. Select a service.
9. Confirm the selected service context block appears between the service selector and the price input:
   - Shows `Selected: [service name]`
   - Shows `Default: $[price] · [duration] min`
   - Shows `Using default service price.` (green italic text)
10. Select a different service.
11. Confirm the context block updates with the new service's information.

### Price behavior — default and custom (PR-055A)

12. With a service selected, confirm the price input is pre-filled with the service's default price.
13. Confirm the "Using default service price." indicator is visible.
14. Change the price to a custom value (e.g. type a different amount).
15. Confirm the "Using default service price." indicator disappears.
16. Confirm the "Price differs from the service default." indicator appears (orange italic text below the price input).
17. Keep the custom price and switch to a different service.
18. Confirm the custom price is **preserved** (not overwritten).
19. Clear the price input manually and switch to another service.
20. Confirm the price auto-fills with the newly selected service's default.

### Price intent — switching services (PR-055A)

21. Select service A (default 5000 cents → input shows "50").
22. Without touching the price, switch to service B (default 3000 cents).
23. Confirm the price **updates** to "30" (the new default, because user hadn't modified it).
24. Select service A again. Type a custom price "75.50".
25. Switch to service B.
26. Confirm the custom price "75.50" is **preserved** (not overwritten).
27. Tap the employee switcher and select a different employee.
28. Confirm the price input clears (new employee context).

### Submit — default price

29. Select an employee and a service.
30. Keep the default price (do not modify it).
31. Optionally select a payment method.
32. Optionally enter a client name and notes.
33. Tap **Create Record**.
34. Confirm success feedback appears.
35. Confirm the screen returns to Home.
36. Confirm the selected date summary refreshes.
37. Confirm the new service record appears in the summary data.

### Submit — custom price

38. Repeat the flow with the same or a different service.
39. Change the price to a custom value.
40. Confirm the "Price differs from the service default." indicator is visible.
41. Optionally select a different payment method.
42. Submit the form.
43. Confirm the summary records show the custom price, not the service default.

### Payment method behavior

44. Create a record with a specific payment method (e.g. CARD).
45. Confirm the payment-method breakdown updates on the Home summary.
46. Create a record with "Unspecified" (the default).
47. Confirm the record appears without a payment-method classification.

### Client name and notes

48. Create a record with a client name and notes.
49. Confirm the client name and notes appear on the summary records list (if the summary view shows them).
50. Create a record without a client name.
51. Confirm no error is shown — client name is optional.

## BARBER happy path

1. Sign in as a BARBER user with an employee record.
2. Confirm the Home summary loads.
3. Tap the **Record Service** entry point on Home.
4. Confirm the creation screen opens.
5. Confirm there is **no employee picker** — the barber's own context is used.
6. Confirm the barber's assigned services load automatically.
7. Select a service.
8. Confirm the selected service context block appears (same as OWNER).
9. Confirm the price auto-fills with the service default.
10. Change the price to a custom value.
11. Confirm the "Price differs from the service default." indicator appears.
12. Submit the form with the custom price.
13. Confirm success feedback appears.
14. Confirm the screen returns to Home.
15. Confirm the selected date summary refreshes.
16. Confirm the new service record appears in the summary data.

## Price-intent edge cases (PR-055A)

- [ ] Empty price input auto-fills on service select.
- [ ] Price matching previous service default updates when switching to a different service.
- [ ] Custom price (different from any default) is preserved when switching services.
- [ ] Switching employees clears the price input (OWNER mode).
- [ ] Service with default price 0: selecting it fills "0" in the input.
- [ ] Service with default price 0: "0" is preserved when switching to another service with price 0, and updates to the new default when switching to a non-zero service.

## Validation errors

### Required fields

- [ ] No employee selected (OWNER): shows "Select an employee."
- [ ] No service selected: shows "Select a service."
- [ ] Empty price input: shows "Enter a valid price amount."

### Price validation

- [ ] Non-numeric price (e.g. `abc`): rejected with "Enter a valid price amount."
- [ ] Negative price (e.g. `-10`): rejected.
- [ ] Price with more than two decimal places (e.g. `10.999`): rejected.
- [ ] Price with comma as decimal separator (e.g. `10,50`): accepted and correctly parsed as 1050 cents.
- [ ] Price with dot as decimal separator (e.g. `10.50`): accepted and correctly parsed as 1050 cents.

### Text field limits

- [ ] Client name longer than 200 characters: rejected with "Client name must be 200 characters or fewer."
- [ ] Notes longer than 1000 characters: rejected with "Notes must be 1000 characters or fewer."

### Optional field handling

- [ ] Whitespace-only client name: omitted from the request body (record is created without client name).
- [ ] Whitespace-only notes: omitted from the request body.
- [ ] Blank payment method: sent as unspecified (no paymentMethod key in payload).

## Negative / edge checks

### OWNER-specific

- [ ] OWNER with no employees sees a clear "No employees available yet." message.
- [ ] OWNER selecting an employee with no assigned services sees a clear empty state.
- [ ] Switching OWNER employees clears stale selected service and stale price.
- [ ] Duplicate rapid taps on **Create Record** do not send multiple create requests (button disabled during submit).

### BARBER-specific

- [ ] BARBER with no assigned services sees a clear empty state.
- [ ] BARBER cannot choose an employee manually (no employee picker).

### Selected service context (PR-056A)

- [ ] Context block is hidden when no service is selected.
- [ ] Context block appears immediately on first service select.
- [ ] Context block updates on subsequent service selections.
- [ ] "Using default service price." disappears when custom price is entered.
- [ ] "Price differs from the service default." appears when custom price differs from default.
- [ ] Neither message appears when price input is empty (though this shouldn't normally happen since service select auto-fills).

## Role restrictions — CLIENT

1. Sign in as a CLIENT user.
2. Confirm Home loads the client dashboard message.
3. Confirm there is **no Record Service** entry point on Home.
4. Confirm the client cannot access the creation screen directly.

## Expected backend evidence

After submitting a record with default price:
- [ ] The service record appears in the database (`ServiceRecord` table).
- [ ] `priceCents` matches the expected integer cents (e.g. 5000 for "$50.00").
- [ ] The record is linked to the correct `employeeId`, `serviceId`, and `barbershopId`.

After submitting with custom price:
- [ ] `priceCents` reflects the custom entered amount, not the service default.

After submitting with optional fields:
- [ ] `clientName` is stored when entered (or absent/null when omitted).
- [ ] `notes` is stored when entered (or absent/null when omitted).
- [ ] `paymentMethod` is stored when selected (or null when "Unspecified").

### Summary refresh

- [ ] OWNER summary includes records from all employees.
- [ ] BARBER summary only includes the barber's own records.
- [ ] Total revenue updates immediately after returning to Home.
- [ ] Payment-method breakdown updates when a payment method is selected.

## Known limitations

- [ ] No component-level interaction tests (React Native / Vitest component-test infrastructure is blocked).
- [ ] No `performedAt` date-time picker — records use the current server time.
- [ ] No multi-service cart — one record per submission.
- [ ] No edit/delete service record UI.
- [ ] No offline queue — records require active network connection.
- [ ] Service duration is displayed in the context block but not sent to the backend.
- [ ] Price input shows human-friendly decimal (e.g. "50.00") but the backend receives integer cents. The conversion is handled transparently by `parseCurrencyInputToCents`.
- [ ] Custom price is preserved in memory only — refreshing the page or navigating away loses it.

## Notes for testers

- Use the smallest realistic test data set that still proves the flow:
  - one OWNER user with a barbershop
  - one BARBER user with an employee record
  - at least two services assigned to the employee(s), with different default prices
  - optionally one service with price 0 for edge-case testing
- If testing on a phone, make sure `EXPO_PUBLIC_API_URL` is reachable from the device network.
- The creation screen is accessed via the **Record Service** button on Home. It is not in the tab bar.
- To test price-intent preservation: select service A, type a custom price, then tap service B. The custom price should stay.
