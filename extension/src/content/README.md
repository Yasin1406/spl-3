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
