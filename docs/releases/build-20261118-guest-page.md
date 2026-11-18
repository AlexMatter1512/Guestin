# build-20261118-guest-page

This edge build adds guest page customization, an AI provider picker, and staff attribution in activity. It publishes the Docker Hub edge alias and updates the edge manifest after CI passes.

## Reviewed comparison

The previous published edge build was `build-20261118-host-navigation` (`7269ff2d8763b782ce24e5157f84c06511aa95db`), confirmed on the `update-manifests` branch. The log and commit diff from that tag to HEAD were empty before this release commit. The release review also covered staged and unstaged changes and the new source files included below.

## Changes

- **Guest Page** under Other now controls the selected property's logo visibility, accent color, welcome message, and single-use door message. Upload a PNG, JPEG, or WebP logo when editing the property.
- Edit intro and single-use Markdown independently in English, Italian, German, French, or Spanish. The editors show the current text, support headings, bold and underline, and offer a rendered preview and a restore-default control. Choose a fallback language per message. English is the default.
- Open a guest preview with selected doors and the saved settings. Preview buttons are simulated. The page does not create an access code or send door commands. The editor can load and save any of the ten retained previous versions per property.
- Open each connector by selecting its row. For AI screenshot imports, choose Google Gemini, OpenAI, or Anthropic Claude, enter an API token, and select a model from that provider's list. Screenshot extraction uses the OpenAI-compatible format. Existing Gemini connections keep their saved model and key.
- Staff names appear in notifications and activity for authenticated code and door actions, including permission changes and link replacements. Deleting an access code leaves an attributed property event without retaining the deleted code's details or prior history.
- On mobile, a selected favourite highlights only its shortcut next to the create button. Other still highlights for its own page and for menu items that are not the favourite.

## Compatibility and safety

No database schema migration is required. Guest page settings and version history are stored with the property. Existing guest pages keep their built-in text until customized. AI keys remain encrypted and are not exposed in connection metadata.

## CI and validation

Main pushes retain the secret scan, type checks, tests, and landing deployment. Pull requests and publishing tags run the container smoke test. The tag job retains its own checks and shares build metadata and a BuildKit cache between the smoke image and multi-platform publication. The edge manifest is updated only after publication.

Local type checks, all 171 tests, and both app builds passed. Browser checks used isolated data, fake door adapters, and mocked AI API responses.
