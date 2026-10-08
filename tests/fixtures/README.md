# Test Fixtures

- `phase1-accessibility.html`: initial scanner, preservation, nearby-label repair, missing image-alt detection, landmark inventory, and mutation-observer smoke testing.
- `article-accessibility.html`: article title/section/body focus, long paragraphs, inline links, quotations/list items/captions/plain divs, authored tabindex preservation/rollback, and excluded content.

Manual article check:

1. Restart the backend, reload `extension/dist` in Chrome, and open the article fixture or the user's BBC article in a fresh tab.
2. With the assistant enabled, use Tab/Shift+Tab and confirm visible headings receive focus and NVDA announces their heading level/text. Negative-tabindex headings temporarily become reachable; existing non-negative tabindex choices remain intact.
   Continue through report paragraphs, the quotation, list item, caption, and plain text block. Confirm NVDA reads each focused block and links remain individually reachable. Hidden/inert/editable content and duplicate containers should not gain focus.
3. Enable translation and wait for the queued batches. Confirm every visible article paragraph, including text around links and the end of the long paragraph, receives Bangla output when providers succeed.
4. Disable translation and confirm exact original text and links return while reading blocks remain focusable. Disable the assistant and confirm generated heading/content tabindex attributes disappear and original negative values return.
5. The automated Chrome regression uses synthetic article text and mocked provider responses; the actual BBC page and NVDA require this manual acceptance check.

Manual Phase 1 check:

1. Serve or open the fixture in Chrome with the unpacked extension enabled.
2. Confirm the existing button names remain unchanged.
3. Inspect the email input and confirm it temporarily receives `aria-labelledby` pointing to the adjacent label.
4. Disable the assistant in settings and confirm the generated relationship is removed.
5. Insert a new control under `#dynamicArea` and confirm the affected subtree is scanned after the debounce interval.
6. Submit the empty form and confirm the email and password requirements are announced in Bangla.
7. Enter an invalid email, move focus away, and confirm the email-specific guidance is announced without exposing the entered value.
8. Enter a short password and confirm the minimum length is announced using Bangla digits.
9. Disable form guidance in settings and confirm generated descriptions are removed while native browser validation still works.

Manual summary acceptance (Chrome + NVDA):

1. Restart the backend and reload the extension, then refresh an article, results page, product page, public application form, and table/dashboard page.
2. With the assistant enabled, press Alt+Shift+A. Confirm the dialog is named in Bangla, a short page introduction appears immediately, and the generated content gist leads the results. Verify at most five useful links/actions and no region/control inventory. Test both semantic articles and unmarked prose containers: main text should survive changes to arbitrary CSS class names, while named reference/editorial sections and link-heavy layout tables stay secondary. Link-rich data tables with headers must retain their data.
3. Confirm an article's related stories are separate, search-result links remain relevant results, form fields expose labels/requirements/errors without entered values, and table values retain their headers.
4. Focus a paragraph, link or form field, then press Alt+Shift+S. Confirm the enclosing meaningful region is selected. With no suitable focused region, verify the announcement and absence of a provider request.
5. Set brief/standard/detailed output in extension settings, then invoke a fresh summary and verify the setting is used. Confirm no length preference appears in the dialog. Where independent regions are ambiguous, choose one. Verify the on-page and popup buttons provide equivalent commands. Press Tab/Shift+Tab within the native modal; close it with the button or Escape and confirm original focus returns.
6. On a private-page fixture, verify the structural-only default and no automatic request. For an explicit permitted content request, verify that the permission resets and field values are still excluded.
7. Disable AI summaries or disconnect the backend and verify the short page introduction remains. Close the panel, disable the assistant, navigate, or change summarized content during a pending request and verify no late summary reopens or updates the panel. Changing unrelated navigation widgets or applying extension translations must not cancel a pending gist.
8. Confirm default shortcuts work alongside the user's actual Chrome/NVDA and keyboard-layout configuration. Automated key-event tests do not establish OS/screen-reader shortcut compatibility.

`extension/tests/summaryBrowser.test.js` covers synthetic examples of these layouts with real Chrome DOM/dialog behavior and mocked provider messages. Backend summary tests cover schema/redaction, ordered fallback, long-content coverage, source/numerical checks, cancellation and the route.
