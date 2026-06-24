# Extension

Chrome extension module.

Planned responsibilities:

- Read webpage DOM structure.
- Collect accessibility-related element context.
- Collect user interaction context.
- Communicate with backend API.
- Inject accessible labels, roles, skip links, and live regions.
- Provide popup/settings UI for user preferences.

## Current Feature

The extension currently includes a simple content-script prototype that:

- Captures visible live DOM text.
- Watches newly added DOM nodes with `MutationObserver`.
- Uses a small generic English-to-Bangla dictionary.
- Replaces matching visible text and selected accessibility attributes with Bangla text.

## Build

The extension is now structured like a final product: source files stay in `src`, production extension files are generated in `dist`.

```powershell
cd D:\SPL-3\extension
npm.cmd run build
```

Then load this folder in Chrome:

```text
D:\SPL-3\extension\dist
```

## Load In Chrome

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select the `extension/dist` folder.
