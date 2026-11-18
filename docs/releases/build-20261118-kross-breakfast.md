# KrossBooking reservation details and breakfast imports

This edge build is compared with `v0.5.0` (`ee392fc`), the previous published edge image.

- Opening a KrossBooking reservation from the planner or search results shows two expandable sections. **Reservation** opens first and displays booking source, guest count, contact details, and additional fields returned by KrossBooking. A message flags a missing phone number. **Proposed code** shows the mapped doors, validity dates, breakfast allowance and guest links.
- When an import supplies stay dates and a guest count, the draft includes one breakfast per guest for each morning from the day after arrival through checkout. This applies to KrossBooking, iCal events with a supported guest-count field, and AI screenshot imports. Hosts can adjust the allowance before saving.
- Existing installations can pull the edge image directly. These changes use the existing database schema and access-code format.

TypeScript and Svelte checks, both production builds, and all 178 automated tests passed. The browser smoke test verified both reservation entry points and the editable breakfast allowance using isolated data and mocked providers.
