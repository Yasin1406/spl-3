# Navigator acceptance checks

## Noise reduction and protected content (FR-15/FR-16)

1. Open `tests/fixtures/navigation-noise.html` after reloading the extension. Leave the new noise checkbox off initially; confirm destinations follow document order.
2. In extension settings, enable “পুনরাবৃত্ত অপ্রয়োজনীয় অংশগুলো গন্তব্যের তালিকায় পরে দেখান” and save. Reopen Alt+Shift+Z from the initial page button. Confirm the promotional sidebars and their headings appear after normal regions, with “কম অগ্রাধিকার” announced by NVDA. Every destination must remain selectable and reachable.
3. Confirm the sponsored regions containing security warnings, errors, payment, consent/legal text, authentication and task actions do not receive low priority. Confirm ordinary sidebar/footer placement alone does not lower priority.
4. With the list open, use developer tools to append a security-warning paragraph to a promotional aside. Confirm its priority changes without losing the selected destination or moving focus. Remove the warning and confirm it can qualify again.
5. Navigate to a low-priority aside and reopen the navigator: that focused region must retain normal priority. Confirm native NVDA heading/link navigation and ordinary Tab remain available throughout.
6. Disable noise reduction and save while a destination is selected; confirm document order returns and selection remains. Disable/re-enable the assistant and reload the page; confirm the explicit saved setting is honored and no duplicate UI/listeners appear.
7. Check representative Bangla/English article, login, checkout and consent pages. Record NVDA speech, browse-cursor behavior, any missed critical content or false positives. Automated checks do not establish universal semantic classification or manual acceptance.

Implementation date: 2026-10-08. Headless Chrome DOM integration passes; actual NVDA speech, browse-cursor synchronization, physical shortcuts and keyboard-layout interactions still require manual verification.

## Load and open

1. Run `npm.cmd run build` in `extension`, reload `extension/dist` in Chrome's extension manager, then refresh the webpage.
2. Open `tests/fixtures/navigation-accessibility.html`. Enable the extension's file URL access for a local file, or serve the fixture through a local HTTP server.
3. With NVDA running and focus in the webpage, press **Alt+Shift+Z**. Confirm that the dialog title and focused category control are announced in Bangla.
4. Open the navigator from the extension popup as well. Confirm that focus transfers to the page dialog when the popup closes.
5. Confirm popup/settings display fixed **Alt+Shift+Z**, have no custom-shortcut controls, and the extension no longer lists a navigator command in `chrome://extensions/shortcuts` after reload. Focus must be in the webpage; the address bar and Chrome's internal pages do not receive this page shortcut.
6. Repeat with English and Bangla keyboard layouts. Confirm no unwanted input-language switch.

## Navigate and return

1. Use Tab/Shift+Tab between controls; use arrow keys in the native category and destination lists. Verify names, heading levels and duplicate region numbering are readable.
2. Choose a main region, heading, search form, ordinary form and error. Activate **যান** or press Enter in the destination list. Verify focus reaches the selected heading/region or usable field and NVDA reads the destination.
3. Confirm Tab and Shift+Tab continue from the destination, with a visible focus indicator. Confirm NVDA's browse cursor follows focus; DOM focus alone is not evidence of this.
4. Press Escape or Close without selecting a destination. Confirm focus returns to the previous page control or a safe main-region fallback if that control disappeared.
5. From the page start, press Tab. Verify the focus-visible navigation toolbar, opener and generated skip links are available. Activate each link and verify both focus and scrolling move without changing the URL hash or submitting a form.
6. Verify NVDA H/Shift+H, D/Shift+D, F/Shift+F and NVDA+F7 remain available in browse mode. The navigator handles only fixed Alt+Shift+Z; extra Ctrl/Meta modifiers, repeated events and IME composition are ignored.

## Errors and changing pages

1. Confirm the authored email error is available immediately. Verify selecting its message takes focus to the linked field.
2. Confirm untouched required fields are not listed as current errors. Attempt native form validation; then confirm the failed required field appears. Correct it and confirm it disappears.
3. Add/remove the fixture's dynamic heading. Confirm the list updates without stealing focus or changing an existing selected destination.
4. On a dynamic site, hide/remove a destination immediately before activating it. Confirm the navigator reports its absence and stays usable.
5. Open the page modal. Attempt the shortcut; confirm the site's modal keeps focus. Close it and confirm the navigator works again.
6. Disable the assistant while the navigator is open and while a skip link has focus. Verify UI, generated IDs and temporary focus attributes disappear, page-authored attributes remain, and focus returns safely. Re-enable and verify a fresh navigator works.

## Coverage limits

The navigator uses authored native/ARIA regions, headings, forms and reported errors. It does not infer a missing main landmark or enumerate cross-origin frames and closed shadow roots. Existing reversible heading/reading-block Tab support remains in place. A destination that blocks programmatic focus is reported rather than activated or clicked.

## Shortcut delivery follow-up

The user requested a fixed shortcut after the Chrome command and assignment-aware fallback both failed on their machine. The navigator now opens synchronously from a window capture listener for physical Alt+Shift+Z, without Chrome command registration, assignment queries or background messaging. Custom shortcut UI was removed. The browser regression verifies English/Bangla key events, rejected modifiers/repeats/composition and handler cleanup. This does not reproduce the user's physical-key delivery failure; OS/browser interception can still prevent the page from receiving an event.

## Generic page conflict handling

The shortcut listener now loads at document_start, before page capture handlers. It consumes keydown, keypress and keyup for the reserved gesture, including repeats and Z keyup after modifier release. Other gestures continue to the page. A trusted Chrome key-event regression reproduced native accesskey=z navigation despite preventDefault; while the assistant is enabled, only Z tokens in page accesskey attributes are temporarily removed. Other tokens remain available, dynamic additions/changes are handled, and current authored values are restored on disablement without overwriting subsequent page changes. This uses no hostname or site-selector rules.

Test on a page with a Z access key and key handlers on all three phases. Verify the navigator opens without URL changes; then disable the assistant and verify the original page gesture works. The trusted-event regression also accepts an optional downloaded layout through `BAA_NAVIGATION_LAYOUT_FIXTURE` or live public URL through `BAA_NAVIGATION_LAYOUT_URL`. The W3C survey snapshot, live W3C survey and live Wikipedia Accessibility article passed with the complete content-script code injected into Chrome and trusted key events. Physical-key/NVDA acceptance remains manual.
