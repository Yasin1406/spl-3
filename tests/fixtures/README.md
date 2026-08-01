# Test Fixtures

- `phase1-accessibility.html`: initial scanner, preservation, nearby-label repair, missing image-alt detection, landmark inventory, and mutation-observer smoke testing.

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
