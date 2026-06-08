# Daily Operations MVP — End-to-End Manual QA Checklist

This checklist verifies the complete MVP daily operations flow on a real device or in Expo Go. It ties together the Services, Employees, Service Record creation, and Home summary screens into a single end-to-end session.

## Scope

Covers the full daily-operations loop (PR-060A through PR-062A + earlier):
1. OWNER setup — services, employees, assignments
2. BARBER daily work — recording performed services
3. OWNER monitoring — summary, records, breakdowns
4. Lifecycle/negative — unassign, deactivate, reactivate

Relevant screens:
- `apps/mobile/app/(tabs)/index.tsx` (Home)
- `apps/mobile/app/(tabs)/services.tsx` (Services)
- `apps/mobile/app/(tabs)/employees.tsx` (Employees)
- `apps/mobile/app/(tabs)/record-service.tsx` (Record Service)

## Preconditions

Before starting, confirm:

- [ ] API server is running and reachable from the device.
- [ ] Mobile app `EXPO_PUBLIC_API_URL` points to the reachable API host.
- [ ] If testing on a physical phone, `EXPO_PUBLIC_API_URL` uses the LAN IP, not `localhost`.
- [ ] Clerk publishable key is configured.
- [ ] An OWNER account exists with a barbershop context.
- [ ] A BARBER account exists (a Clerk user with BARBER role).
- [ ] You know the BARBER's Clerk user ID (e.g. `user_<clerk-id>...`) — needed for employee add.
- [ ] The barbershop has no pre-existing services or employees (clean state) — or you can work with existing data.

## Start the app

```bash
# 1. Start the API server (existing repo workflow)
# 2. Start the mobile app:
npm run dev --workspace @barberapp/mobile
# 3. Open in Expo Go or simulator
```

---

## Phase 1: OWNER Setup

### 1.1 Services — Create the catalog

1. Sign in as the OWNER.
2. Confirm Home loads with the summary section.
3. Tap **View Services** on Home.
4. Confirm the Services screen opens.

5. Tap **+ Add Service**.
6. Enter:
   - Name: `Classic Cut`
   - Price: `5000`
   - Duration: `30`
7. Tap **Create Service**.
8. Confirm success flash and the service appears in the list.

9. Repeat to create a second service:
   - Name: `Beard Trim`
   - Price: `3000`
   - Duration: `20`

10. Confirm both services appear in the Active filter.
11. Confirm filter counts show `Active (2)`.

### 1.2 Employees — Add a barber

12. Tap **Back to Home**.
13. Tap **View Employees**.
14. Confirm the Employees screen opens (empty list or existing employees).

15. Tap **+ Add Employee**.
16. Enter the BARBER's Clerk user ID in the User ID field.
17. Tap **Add Employee**.
18. Confirm success flash and the employee appears in the list.
19. Confirm the employee shows: name/email, role `BARBER`, `Active` badge.

### 1.3 Assignments — Link services to the barber

20. On the employee row, tap **Manage Services**.
21. Confirm the assignment section expands with two lists:
    - **Assigned Services** — empty (or existing)
    - **Available Services** — shows `Classic Cut` and `Beard Trim`

22. Tap **Assign** on `Classic Cut`.
23. Confirm `Classic Cut` moves to the Assigned Services list.
24. Tap **Assign** on `Beard Trim`.
25. Confirm both services are now assigned.

26. Tap **Hide Services** to collapse the section.
27. Tap **Manage Services** again — confirm both are still assigned.

---

## Phase 2: BARBER Daily Work

### 2.1 Log in and verify context

28. Sign out of the OWNER account.
29. Sign in as the BARBER.
30. Confirm Home loads with the BARBER summary.
31. Confirm the **Record Service** entry point is visible.

### 2.2 Create record — default price

32. Tap **Record Service**.
33. Confirm the creation screen opens.
34. Confirm there is **no employee picker** (BARBER uses own context).
35. Confirm `Classic Cut` and `Beard Trim` appear in the service list.

36. Select `Classic Cut`.
37. Confirm the selected service context block appears:
    - `Selected: Classic Cut`
    - `Default: $50.00 · 30 min`
    - `Using default service price.`
38. Confirm the price input is pre-filled with `5000`.

39. Select `CARD` as payment method.
40. Enter a client name: `Jane Doe`.
41. Tap **Create Record**.
42. Confirm success feedback.
43. Confirm the screen returns to Home.
44. Confirm the summary refreshes and shows the new record.

### 2.3 Create record — custom price

45. Tap **Record Service** again.
46. Select `Beard Trim`.
47. Confirm the price pre-fills with `3000`.
48. Change the price to `40.00` (type `4000`).
49. Confirm the "Price differs from the service default." indicator appears.
50. Confirm the "Using default service price." indicator disappears.

51. Select `CASH` as payment method.
52. Tap **Create Record**.
53. Confirm the record is created with the custom price.

### 2.4 Create another record

54. Tap **Record Service** again.
55. Select `Classic Cut`.
56. Keep the default price. Select `TRANSFER` as payment. Submit.

57. Return to Home. Confirm:
    - The summary shows 3 records total.
    - Revenue reflects all three records.
    - Payment breakdown shows CARD, CASH, and TRANSFER.

### 2.5 Verify service records list

58. On Home, scroll to **Service Records**.
59. Confirm all 3 records are visible.
60. Confirm each shows: service name, price, time, payment method (Cash/Card/Transfer).
61. Confirm `Jane Doe` appears on the first record as `Client: Jane Doe`.

---

## Phase 3: OWNER Monitoring

### 3.1 Verify cross-employee summary

62. Sign out of BARBER. Sign in as OWNER.
63. Confirm Home loads the OWNER summary.
64. Confirm today's date is selected.
65. Confirm the summary shows:
    - Total records: 3
    - Total revenue includes all three amounts
    - Employee breakdown shows the BARBER's name with 3 records
    - Payment-method breakdown shows CARD, CASH, TRANSFER

### 3.2 Verify service records list

66. Scroll to **Service Records**.
67. Confirm all 3 records are visible.
68. Confirm OWNER sees the employee name on each record.
69. Confirm payment methods show as formatted labels (Cash, Card, Transfer — not raw CASH/CARD/TRANSFER).

### 3.3 Verify OWNER can also record services

70. Tap **Record Service**.
71. Confirm the employee picker appears (unlike BARBER).
72. Select the BARBER employee.
73. Select a service, enter a price, and submit.
74. Return to Home and confirm the new record appears in OWNER's summary.

---

## Phase 4: Lifecycle & Negative Checks

### 4.1 Unassign service

75. On Home, tap **View Employees**.
76. Tap **Manage Services** on the BARBER employee.
77. Tap **Remove** on `Beard Trim`.
78. Confirm `Beard Trim` moves to Available Services.

79. Sign out. Sign in as BARBER.
80. Tap **Record Service**.
81. Confirm `Beard Trim` is **no longer** in the service list.
82. Confirm `Classic Cut` is still available.

### 4.2 Reassign service

83. Sign out. Sign in as OWNER.
84. Go to Employees → Manage Services.
85. Tap **Assign** on `Beard Trim`.
86. Confirm it moves back to Assigned Services.

87. Sign out. Sign in as BARBER.
88. Tap **Record Service** → confirm `Beard Trim` is back.

### 4.3 Deactivate service

89. Sign out. Sign in as OWNER.
90. Go to Services.
91. Tap **Deactivate** on `Beard Trim`. Confirm the alert.
92. Confirm the service shows `Inactive` badge.
93. Switch to Inactive filter → confirm `Beard Trim (1)`.

94. Go to Employees → Manage Services on the BARBER.
95. Confirm `Beard Trim` is **not** in Available Services (inactive services are not assignable).
96. Confirm it is **not** in Assigned Services (deactivated services are hidden).

97. Sign in as BARBER → Record Service.
98. Confirm `Beard Trim` is not in the service list.

### 4.4 Reactivate service

99. Sign in as OWNER. Go to Services.
100. Switch to Inactive filter.
101. Tap **Reactivate** on `Beard Trim`.
102. Confirm the service shows `Active` badge.

103. Go to Employees → Manage Services → confirm `Beard Trim` is back in Available Services.
104. Tap **Assign** to reassign it.

### 4.5 Deactivate / reactivate employee

105. On Employees screen, tap **Deactivate** on the BARBER employee.
106. Confirm the confirmation alert appears. Tap **Deactivate**.
107. Confirm the employee disappears from the list.

108. **Note**: Reactivation is not visible here because deactivated employees are soft-deleted (`deletedAt` set) and the list endpoint filters them out. To test reactivation, use the API directly:
    ```
    PATCH /api/v1/barbershops/:id/employees/:eid/reactivate
    ```
    Then pull-to-refresh on the Employees screen to see the employee reappear.

### 4.6 Validation — add employee

109. On Employees screen, tap **+ Add Employee**.
110. Leave the User ID field empty and tap **Add Employee**.
111. Confirm the error: `User ID is required.`

112. Enter a nonexistent user ID (e.g. `nonexistent-123`).
113. Confirm the API returns an error message (e.g. `User not found`).

---

## Phase 5: Additional Checks

### 5.1 Pull-to-refresh

114. On Home (OWNER), pull to refresh. Confirm summary and records reload.
115. On Services, pull to refresh. Confirm service list reloads.
116. On Employees, pull to refresh. Confirm employee list reloads.

### 5.2 Date navigation

117. On Home (OWNER), tap the left arrow to go to yesterday.
118. Confirm the summary shows "No summary for this date" or the correct empty state.
119. Tap "Today" to return.

### 5.3 BARBER cannot access OWNER screens

120. Sign in as BARBER.
121. Confirm there is **no View Services** card on Home.
122. Confirm there is **no View Employees** card on Home.
123. Try navigating directly to `/(tabs)/services` — should not be accessible.
124. Try navigating directly to `/(tabs)/employees` — should not be accessible.

### 5.4 CLIENT cannot create records

125. Sign in as CLIENT.
126. Confirm there is **no Record Service** entry.
127. Confirm there is **no View Services** or **View Employees**.
128. Confirm the Home shows the client dashboard message.

---

## Known Limitations

Documented for testers and future PRs:

- [ ] **Employee add requires raw User ID**: OWNER must know the Clerk user ID (e.g. `user_<clerk-id>...`). No email lookup or invite flow yet.
- [ ] **No invite-by-email**: cannot create a new Clerk user from the mobile app.
- [ ] **No component-level tests**: React Native / Vitest component-test infrastructure is blocked. All manual.
- [ ] **No service record edit/delete**: mistakes cannot be corrected from mobile.
- [ ] **No batch service assignment**: services must be assigned one at a time.
- [ ] **Assignment UI shows only service name**: price and duration are not displayed in the assignment lists.
- [ ] **Deactivated employees disappear from the list**: reactivation requires a direct API call (`PATCH /employees/:id/reactivate`) because the list endpoint filters by `deletedAt: null`.
- [ ] **No performedAt picker**: all records use the current server time.
- [ ] **No offline queue**: records require an active network connection.
- [ ] **Filter and search not persisted**: reset on app restart.

## Notes for testers

- **Minimal test data set**:
  - 1 OWNER with a barbershop
  - 1 BARBER (Clerk user with BARBER role)
  - 2 services (`Classic Cut` and `Beard Trim`)
  - The BARBER's Clerk user ID for the add-employee step
- If the BARBER user doesn't exist yet, create one via Clerk dashboard or seed script before testing.
- The flow is designed to be run sequentially — each phase depends on the previous.
- If a step fails, note the step number and what you observed vs expected.
