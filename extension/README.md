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
- Uses phrase-first and pattern-based English-to-Bangla translation rules.
- Falls back to short word translation only for compact UI labels.
- Avoids partially translating unknown long sentences into broken mixed-language text.
- Provides a popup button to start and stop translation.

The Phase 1 accessibility foundation also:

- inventories controls, form controls, images, headings, landmarks, and live regions;
- records selected findings with stable reason codes;
- preserves existing accessible names;
- links one reliably adjacent label to an otherwise unnamed form control;
- observes affected DOM regions with a debounced mutation queue;
- records temporary changes in a reversible adaptation registry;
- exposes announcements through an extension-owned live region;
- provides an accessible settings page and background service worker.

## Adaptive Bangla form validation

When enabled in settings, the extension listens to native form validation without reading or transmitting field values. It explains required, email, minimum/maximum length, minimum/maximum value, and selected password-pattern requirements in simple Bangla. Guidance is shown in Chrome's native validation bubble through a temporary custom-validity message, connected through `aria-describedby`, announced through the extension live region, deduplicated, and removed reversibly when corrected or disabled. Existing page-provided custom-validity messages are preserved. Unknown constraints receive a safe generic Bangla fallback.

## Hybrid translation

When DOM Translation is enabled, exact phrases, recognized patterns, and fully covered short labels are translated locally. Unresolved text is sent in a bounded batch to the local backend, which tries Groq, Mistral, and Cerebras in the configured order and validates the Bangla result. Partial dictionary replacements are not applied.

Start the backend first by following `../backend/README.md`. Provider API keys must never be added to extension source, settings, or the built `dist` directory.

## Image descriptions and OCR

Focus or hover an image and press `Alt+Shift+D` for a Bangla description or `Alt+Shift+O` to read its text. Explicit image focus takes priority over hover. Large images are resized before upload (1600 pixels on the longest edge for descriptions, 2048 for OCR); decodable unsupported formats are converted to PNG or JPEG. Source files above 32 MB are rejected, and uploaded image bytes remain limited to 4 MB.

For local HTML pages and local images, open the extension's **Details** in `chrome://extensions` and enable **Allow access to file URLs**. After rebuilding, reload the extension and refresh the test page. Image failures are logged in the extension service worker console and the page console; the latest result or error is available as `BAA_LAST_IMAGE_ANALYSIS` in the content script's console context.

## Build

The extension is now structured like a final product: source files stay in `src`, production extension files are generated in `dist`.

```powershell
cd D:\SPL-3\extension
npm.cmd run build
```

Run automated verification with:

```powershell
npm.cmd run check
npm.cmd test
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
