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

Long paragraphs are split into items of at most 500 characters and reassembled only after all parts succeed. Sequential batches contain at most 20 items and 1,200 source characters. Existing links and page structure remain intact. Dynamic text updates are translated too; disabling translation clears pending work and restores original text. If a provider request fails, the affected original text remains and the assistant announces that some text could not be translated. Toggle translation off and on to retry.

## Heading and article content focus

While the accessibility assistant is enabled, visible, non-empty headings gain `tabindex="0"` so Tab and Shift+Tab can reach article titles and section headings. This also makes headings with negative tabindex reachable. Headings keep their native/ARIA semantics and existing non-negative tabindex values. Inserted headings are handled automatically; disabling the assistant removes its temporary focus adaptations and restores original negative tabindex values.

Report/article paragraphs, quotations, list items, captions, preformatted blocks, and plain text blocks inside article/main regions also gain Tab focus. Inline links remain independently usable. The assistant focuses the reading blocks rather than layout containers repeating the same content; hidden/inert, editable, navigation, form, and extension-owned content is excluded. Existing non-negative tabindex values remain intact, original negative values return on disablement, and newly inserted or newly populated reading blocks are handled automatically. Content focus remains available when translation is switched off while the assistant stays enabled.

## Bangla page and focused-region summaries

With the assistant enabled, press **Alt+Shift+A** for a page summary or **Alt+Shift+S** for the meaningful region containing the last focused page element. The popup and the page's summary toolbar also provide buttons. A focused link or field resolves to its enclosing article, section, form, table, or other identified region. If there is no suitable focused region, the assistant announces that.

The summary dialog leads with a Bangla gist of the main content and at most five useful links or actions. While generation is pending or unavailable, a short page introduction remains available. Nested sections of a main landmark belong to the same task; multiple tables alone do not make a page a dashboard. Extraction uses semantic landmarks, standard document roles, heading labels, prose concentration and link density, with no hostname or site-specific CSS selectors. For unmarked articles it selects a narrow container holding most substantial paragraphs, avoiding forms and side content. Named reference/editorial sections and link-heavy layout tables are secondary; declared data headers and numeric table values protect genuine data tables. Inline topic/citation links stay in the prose rather than becoming an inventory. Related/“See also” destinations can appear as clickable useful links without their linked pages being summarized. Important form requirements/errors, notices, table header/value relationships and coverage limits remain available. Only independent regions without a clear main task require choosing a region. These signals are heuristics; poorly labeled layouts may still require selecting a region.

Set brief/standard/detailed output and enable/disable AI summaries in extension settings. Preferences are absent from the summary dialog. After a page or region summary finishes (including regeneration), focus moves to the summary paragraph under “মূল তথ্যের সারাংশ”. Closing the dialog or pressing Escape restores the previous page focus. Changes to summarized content, navigation, superseding requests, closing, and assistant disablement cancel outstanding work and ignore late results. Unrelated navigation/widget updates and the extension's own translations do not invalidate a content summary; extraction uses the original authored text when translated text is available.

If generation fails or the summarized content changes, focus moves to “আবার তৈরি করুন”. A successful retry returns focus to the summary text. Cancelled or superseded requests cannot move focus or display stale content.

Only explicit summary requests invoke providers. The collector excludes raw HTML, scripts, hidden/editable/extension-owned text and entered field values. It redacts recognized email addresses, card-like numeric sequences and credential strings. Recognized private contexts use structural-only output until the user explicitly permits a content request in the dialog; that permission is consumed for one request and is not saved. Privacy/page-purpose heuristics cannot identify every sensitive page or layout, so representative private-site acceptance remains necessary. No summary text is persisted or logged.

Extraction is bounded to 40 retained regions, 400 source blocks, 1,200 characters per block and 120,000 source characters, with up to 80 controls per region. Limits are disclosed rather than presented as complete coverage. Focused-region extraction prioritizes its own content budget. Backend generation summarizes bounded sections and combines them; unloaded results, embeds and unavailable chart data are not invented. Complex nested application layouts may require choosing a smaller region.

After updating, restart the backend, reload the unpacked extension from `dist`, and refresh the target tab. NVDA/real-site acceptance is documented in `../tests/fixtures/README.md`.

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

The article integration test uses an installed Chrome browser with a temporary headless profile and mocked translation responses. It skips when Chrome is unavailable. Set `BAA_CHROME_PATH` to use a different Chrome executable. It verifies actual DOM focus, long-article translation, inline links, dynamic changes, stale responses, and rollback; NVDA and live-provider checks remain manual.

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
