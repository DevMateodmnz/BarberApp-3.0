# Manual QA — Customer Directory and Visit History

> Manual verification for the customer directory, customer detail,
> visit-history aggregation, and the “create appointment from customer”
> flow.

## Quick path

1. Open **Home → Customers** as an `OWNER` or `BARBER`.
2. Verify list/search/sort behavior and open one customer profile.
3. Edit notes/email, save, and confirm the detail view refreshes.
4. Use **Create appointment** from that profile and confirm the new
   appointment stays linked to the same customer.

## Preconditions

- API and mobile are running against a DB with
  `20260715143000_add_customer_domain` applied.
- The barbershop has at least:
  - one customer with past completed visits,
  - one customer with a no-show,
  - one customer with an upcoming appointment.
- Use an `OWNER` and a `BARBER` account from the same barbershop for the
  access checks.

## A. Directory list and search

### Steps

1. Open **Customers** from the Home daily actions card.
2. Confirm the list renders at least one customer row.
3. Switch sort between **Recent**, **Name**, and **No-shows**.
4. Search by:
   - customer name,
   - phone digits from a normalized phone number.
5. Clear the search.

### Expected

- The screen is reachable only from barbershop-scoped OWNER/BARBER
  sessions.
- Customer rows show phone, last-visit summary, and badges for
  no-shows/upcoming appointments when applicable.
- Search is case-insensitive for names.
- Phone search matches normalized digits without exposing the phone in a
  URL query string.
- Clearing search restores the default paginated list.

## B. Customer detail and editable fields

### Steps

1. Open a customer profile from the list.
2. Verify the summary card shows:
   - name,
   - phone,
   - optional email,
   - first visit,
   - last visit.
3. Verify metric cards for completed, no-shows, cancellations, and
   upcoming.
4. Edit email and internal notes, then save.
5. Pull to refresh or reopen the profile.

### Expected

- Upcoming and recent-history sections render the correct appointments.
- Saving updates the profile without leaving the screen.
- Reopening the customer shows the saved email/notes.
- Historical appointment snapshot values remain unchanged elsewhere.

## C. Create appointment from customer detail

### Steps

1. From a customer profile, tap **Create appointment**.
2. Confirm the appointment-create form is prefilled with:
   - customer name,
   - customer phone.
3. Choose employee, service, date, and slot.
4. Optionally tweak the visible client name/phone snapshot.
5. Create the appointment.
6. Reopen the customer profile and verify the upcoming appointment
   appears there.

### Expected

- The create screen opens without losing the customer context.
- The newly created appointment is linked back to the same customer
  directory row.
- Editing the visible snapshot for that booking does not break the
  customer link.

## D. Access-control checks

### Steps

1. Try to open the Customers screen as a `CLIENT`.
2. Try to access a customer from another barbershop by tampering with the
   route or API request.

### Expected

- CLIENT users do not get directory access.
- Cross-tenant reads/updates are hidden as not-found behavior.
- The API never links an appointment to a customer from another
  barbershop.

## E. Regression checks

- [ ] Public booking for a known phone still works
- [ ] Staff-created guest appointment without `customerId` still works
- [ ] Appointment list and detail screens still load normally
- [ ] Customer list can load additional pages without duplicate rows

## Evidence to capture

- Screenshot of the customer list with badges
- Screenshot of one customer profile
- Screenshot of the appointment-create screen opened from customer detail
- API log or inspector proof that customer search/lookup stayed body-based
