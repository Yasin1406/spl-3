# Content Scripts

Planned content-script modules:

- Main content script.
- Page/DOM extractor.
- Accessibility tree/context builder.
- Mutation observer.
- Accessibility injector.
- NVDA-friendly live-region announcer.

Current files:

- `banglaDictionary.js`: exact phrase, brand, field, and short-label dictionaries.
- `domTranslator.js`: phrase-first, pattern-based DOM text and attribute translation helpers.
- `contentScript.js`: starts/stops translation and observes live DOM changes while enabled.
- `reasonCodes.js`: stable reason identifiers for findings and adaptations.
- `accessibilityCore.js`: shared selectors, visibility checks, accessible-name sources, and fingerprints.
- `scanner.js`: accessibility inventory and selected issue detection.
- `adaptationRegistry.js`: validated temporary attribute changes and rollback.
- `liveRegion.js`: extension-owned polite and assertive announcement channels.
- `contentScript.js`: coordinates scanning, affected-region mutation handling, repair, announcements, translation, and rollback.
