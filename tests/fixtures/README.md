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
