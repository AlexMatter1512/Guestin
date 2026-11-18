# Personal KrossBooking settings

This edge build follows `build-20261118-kross-breakfast` (`cb74b0e`), the previous published edge image.

- The settings button in KrossBooking opens a dedicated page. Each staff member can choose the contact name format and the fields shown in the **Reservation** accordion for bookings opened from the planner or the list.
- Eight fields are selected by default: reservation number, booking source, status, arrival, departure, rooms, guest count, and phone. Staff can also select additional fields, including nested fields discovered when they open a reservation.
- Saved choices follow the signed-in account across devices and use the existing user preferences table.

TypeScript and Svelte checks, both production builds, and all 179 automated tests passed. The connector browser test verified the settings page after reload and checked field visibility in both reservation views using a mocked provider.
