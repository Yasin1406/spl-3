# Background

Planned background service worker modules:

- Chrome runtime message handling.
- API client.
- Permission handling.
- Extension-wide coordination.

Current implementation:

- `serviceWorker.js` initializes non-sensitive local defaults and exposes them through a runtime message.
- API and permission orchestration remain deferred until an extension feature needs them.
