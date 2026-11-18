# build-20261118-host-navigation

Edge build for the host navigation, access-code layout, and calendar input changes. CI publishes the Docker Hub `edge` alias and the build and commit tags, then updates the edge manifest. The stable channel remains at `v0.4.0`.

## Reviewed comparison

The previous published edge build was `build-20261118-access-activity` (`127946bd78800f51827d5a1b3fca1a5dcdcfab0b`), as recorded on the `update-manifests` branch. The comparison covers the commit log and diff from that tag through HEAD, plus the staged and unstaged changes prepared for this build.

## Changes

- Organize Properties, Connectors, Stats, Breakfasts, and Settings under **Other**. On mobile, **Choose favourite** lets hosts replace Stats beside the create button with another available item. The choice is saved per account in the browser.
- Expand **Other** in the desktop sidebar. Center the main content beside the sidebar and show dedicated **Add door** and **Create access code** buttons on their respective pages. Guided setup follows the controls available at each screen size.
- Align access-code search, filters, and list actions in the title row. Open search inline above Guests/Staff and date navigation. Show **Go to today** beneath the date selector when viewing another date.
- Use calendar pickers for code validity, breakfast dates, and connector arrivals. Access validity retains separate time controls and uses the property's timezone.
- Remove duplicate headings and outer cards from Team, Guest links, Email delivery, and Statistics.
- Show **Door opened** for accepted device requests in the guest app and host activity. The success criteria and event type stay the same.

There are no database migrations, security policy changes, or breaking API changes in this build. Existing booking connector permissions still apply to menu items and shortcuts.

## Validation

`bun run check`, `LOG_FILE=- bun test` (169 tests), and `bun run build` passed. Mobile and desktop browser checks covered the favourite shortcut, sidebar, create buttons, search, date layout, calendar selection, and guided setup. Validation used isolated data and fake device adapters.
