# Mobile Service Record Creation — Manual QA Checklist

This checklist verifies the current mobile service record flow on a real device or in Expo Go.

## Scope

Covers the mobile flow for:
- OWNER service record creation
- BARBER service record creation
- Home summary refresh after returning from the creation screen
- CLIENT access restrictions

Relevant screens/routes:
- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/record-service.tsx`
- `apps/mobile/src/components/ServiceRecordCreateSection.tsx`

## Preconditions

Before testing, confirm:

- [ ] API server is running and reachable from the device.
- [ ] Mobile app `EXPO_PUBLIC_API_URL` points to the reachable API host.
- [ ] If testing on a physical phone, `EXPO_PUBLIC_API_URL` uses the LAN IP or reachable host, not `localhost`.
- [ ] Clerk publishable key is configured in the mobile environment.
- [ ] Test OWNER user exists and has a barbershop context.
- [ ] Test BARBER user exists and has an employee context.
- [ ] Required employees, services, and employee-service assignments exist.

## Start the app

If using the current repo scripts:

1. Start the API server using the existing API workflow for this repo.
2. Start the mobile app:

```bash
npm run dev --workspace @barberapp/mobile
```

3. Open the app in Expo Go or the selected simulator/emulator.

## OWNER flow

1. Sign in as an OWNER user.
2. Confirm the Home summary loads.
3. Tap the **Record Service** entry point on Home.
4. Confirm the creation screen opens.
5. Select an employee.
6. Confirm that assigned services load for the selected employee.
7. Select a service.
8. Confirm the price field pre-fills from the selected service.
9. Optionally select a payment method.
10. Optionally enter a client name.
11. Optionally enter notes.
12. Submit the form.
13. Confirm success feedback appears.
14. Confirm the screen returns to Home.
15. Confirm the selected date summary refreshes.
16. Confirm the new service record appears in the summary data.
17. If a payment method was selected, confirm the payment-method breakdown updates.
18. Confirm revenue totals update accordingly.

## BARBER flow

1. Sign in as a BARBER user.
2. Confirm the Home summary loads.
3. Tap the **Record Service** entry point on Home.
4. Confirm the creation screen opens.
5. Confirm there is no employee picker.
6. Confirm the barber’s assigned services load automatically.
7. Select a service.
8. Confirm the price field pre-fills from the selected service.
9. Optionally select a payment method.
10. Optionally enter a client name.
11. Optionally enter notes.
12. Submit the form.
13. Confirm success feedback appears.
14. Confirm the screen returns to Home.
15. Confirm the selected date summary refreshes.
16. Confirm the new service record appears in the summary data.
17. If a payment method was selected, confirm the payment-method breakdown updates.
18. Confirm revenue totals update accordingly.

## CLIENT flow

1. Sign in as a CLIENT user.
2. Confirm Home loads the client dashboard message.
3. Confirm there is no **Record Service** entry point.
4. Confirm the client cannot access the creation screen directly.

## Negative / edge checks

### OWNER-specific

- [ ] OWNER with no employees sees a clear empty state.
- [ ] OWNER selecting an employee with no assigned services sees a clear empty state.
- [ ] Switching OWNER employees clears stale selected service and stale price.
- [ ] Duplicate taps on submit do not send multiple create requests.

### BARBER-specific

- [ ] BARBER with no assigned services sees a clear empty state.
- [ ] BARBER cannot choose an employee manually.

### Validation checks

- [ ] Empty price is rejected.
- [ ] Decimal price is rejected.
- [ ] Negative price is rejected.
- [ ] Client name longer than 200 characters is rejected.
- [ ] Notes longer than 1000 characters is rejected.
- [ ] Whitespace-only client name is omitted from the request body.
- [ ] Whitespace-only notes are omitted from the request body.

## Expected backend evidence

After a successful create:

- [ ] The new service record is visible in the summary.
- [ ] Total revenue updates.
- [ ] If payment method was selected, the payment-method breakdown updates.
- [ ] The selected date summary refreshes after returning to Home.

## Known limitations

- [ ] No performedAt/date-time picker yet.
- [ ] Price is entered as integer cents only.
- [ ] No decimal currency UX yet.
- [ ] No automated route interaction tests yet.
- [ ] No edit/delete service record UI yet.

## Notes for testers

- Use the smallest realistic test data set that still proves the flow:
  - one OWNER user with a barbershop
  - one BARBER user with an employee record
  - at least one service assigned to the employee
  - at least one service record creation target
- If testing on a phone, make sure the API host is reachable from the device network.
