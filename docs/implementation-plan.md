# Implementation Plan

This plan maps `CODEX_IMPLEMENTATION_README_UPDATED.md` onto the audited repository. The goal is a narrow, testable end-to-end prototype. Existing working translation code will be preserved until its replacement is verified.

## Baseline and implementation approach

- Keep the current dependency-free JavaScript extension for Phase 1 instead of introducing a framework or broad rewrite.
- Separate pure analysis/rule functions from browser integration so core behavior can be tested with small fixtures.
- Detect an accessibility issue before adapting the page.
- Preserve meaningful developer-provided semantics and content.
- Use deterministic rules first; external AI/OCR/speech services are later fallbacks.
- Record every applied change in a generalized adaptation registry and make it reversible.
- Treat the existing full-page dictionary translator as legacy prototype behavior. Do not delete it during foundation work; prevent it from becoming the accessibility repair engine.

## Phase 0 - Audit and stabilization

Status: `PARTIAL`

Completed:

- Repository/source/configuration audit.
- Extension install, syntax check, and build verification.
- Implementation inventory, risk analysis, status matrix, and phased plan.

Remaining:

1. Add a root-level command/workspace convention after a test runner is selected.
2. Add `.env.example` when the backend scaffold defines concrete variables; never expose provider secrets to the extension.
3. Add linting and automated tests as part of Phase 1 rather than selecting tools without code to exercise.
4. Perform manual unpacked-extension smoke testing in Chrome.

Exit criteria:

- Existing build remains green.
- New foundation tests and lint/check commands are documented and green.
- Any provider-dependent blockers are documented rather than bypassed.

## Phase 1 - Extension foundation

Status: `PARTIAL`

Map to existing code:

- Extend `extension/public/manifest.json` with a background service worker and accessible settings/options entry.
- Keep `extension/src/content/contentScript.js` as the browser entry point but delegate scanning, observing, announcing, and rollback to focused modules.
- Generalize the rollback pattern in `extension/src/content/domTranslator.js` into a registry for adaptations; preserve the translator until migration is complete.
- Update `extension/scripts/build-extension.js` to copy every new runtime asset.
- Add local fixture pages under `tests/fixtures/` and pure-rule tests close to the extension or under `tests/unit/`.

Tasks:

1. Define stable reason codes and plain-JavaScript issue/adaptation contracts.
2. Implement a scanner for visible interactive controls, form controls, images, headings, landmarks, and live regions.
3. Add stable internal fingerprints without transmitting page HTML or form values.
4. Add a debounced `MutationObserver` queue that analyzes affected regions and ignores extension-owned mutations.
5. Add an extension-owned polite/assertive live-region facility compatible with screen readers.
6. Add an adaptation registry containing target, changed attributes, reason, rule score, validation state, and rollback function.
7. Prove one safe reversible adaptation on a fixture; the initial candidate should be a missing accessible name resolved from deterministic visible text, not AI.
8. Add an accessible settings shell using native controls and correct focus/label relationships.
9. Add a minimal background service worker for state/message coordination; do not place secrets in it.
10. Add unit and fixture-based integration tests, then document Chrome keyboard and NVDA smoke checks.

Implemented on 2026-08-01:

- Stable reason codes and structured issue/adaptation records.
- Accessibility inventory for controls, form controls, images, headings, landmarks, and live regions.
- Preservation-aware accessible-name source resolution and minimal fingerprints.
- Debounced affected-region mutation scanning with extension-owned/adapted mutation guards.
- Reversible attribute adaptation registry.
- Extension-owned polite/assertive live-region channels.
- Conservative adjacent-label relationship repair.
- Background service worker, native-control settings page, fixture page, recursive syntax check, and five core tests.

Remaining before Phase 1 is complete:

- Load `extension/dist` in Chrome and perform the documented fixture smoke test.
- Verify settings, focus behavior, announcements, and rollback with NVDA on Windows.
- Address any browser-only findings and add regression tests where practical.

Exit criteria:

- Extension loads from `dist` and scans the fixture page.
- Selected issues are represented with reason codes.
- At least one deterministic adaptation applies and rolls back without overwriting meaningful existing accessibility information.
- Mutation bursts do not trigger full-document rescans per mutation.
- Build, checks, and core tests pass.

## Phase 2 - Accessible names and preservation

Status: `NOT_STARTED`

Hybrid translation groundwork completed on 2026-08-01:

- Local rules now require full coverage; unresolved text is sent to an ordered Groq/Mistral/Cerebras backend fallback rather than partially translated.
- The extension batches, temporarily caches, applies, and rolls back validated translations.
- The Express backend keeps all keys server-side, bounds and sanitizes requests, times out each provider, validates complete Bangla output, and continues to the next provider on failure.
- Live provider verification remains pending until user-provided API keys are configured.

Tasks:

1. Implement the required source order: associated label, visible text, `aria-labelledby`, title, placeholder, known icon, nearby context, then AI fallback.
2. Add explicit meaningful-name and useful-alt preservation rules.
3. Convert the useful portions of `banglaDictionary.js` into deterministic functional Bangla templates.
4. Add sanitized context generation for icon-only controls.
5. Add the backend accessible-name endpoint, versioned prompt, strict schema/language/action validator, timeout, and safe fallback.
6. Cache only safe, non-sensitive results using a bounded key.

Exit criteria:

- Visible-text controls avoid AI.
- Existing meaningful names are preserved and logged with a reason code.
- An icon-only fixture receives a validated Bangla label or remains safely unchanged.

## Phase 3 - Semantic repair and keyboard access

Status: `NOT_STARTED`

Tasks:

1. Detect only clear clickable `div`/`span` candidates initially.
2. Implement deterministic weighted evidence and threshold policy.
3. Validate conflicts, nested controls, native behavior, and protected states.
4. Apply temporary role/tabindex and Enter/Space behavior without duplicate activation.
5. Register and test complete rollback.

Exit criteria:

- High-confidence fixture is keyboard operable.
- Medium-confidence fixture is suggested but not auto-repaired.
- Conflicting or low-confidence fixture remains unchanged.

## Phase 4 - Form assistance

Status: `NOT_STARTED`

Tasks:

1. Resolve labels/descriptions without reading or logging field values.
2. Extract native constraints and page-authored validation messages.
3. Create Bangla templates for required, length, range, email, and known pattern requirements.
4. Calculate rule coverage and use AI only below the specified sufficiency threshold.
5. Validate that every original condition is retained and none is invented.
6. Announce errors and move focus only when safe and appropriate.

Exit criteria:

- Required, minlength, email, and combined password fixtures are fully explained in Bangla.
- Password/payment values never enter logs, storage, or requests.

## Phase 5 - Visual content interpretation

Status: `NOT_STARTED`

Tasks:

1. Classify decorative, duplicate, tiny, text-bearing, and informative images locally.
2. Add an OCR adapter for selected text-bearing images.
3. Add a backend multimodal description adapter with request minimization and validation.
4. Support brief, standard, and detailed output.
5. Expose descriptions without replacing useful existing `alt` text.

Exit criteria:

- Decorative images are skipped, text images can use OCR, and selected informative images receive accessible Bangla output.

## Phase 6 - Navigation and summaries

Status: `NOT_STARTED`

Tasks:

1. Build heading, landmark, link, form-control, and error-region inventories from scanner results.
2. Add generated keyboard-accessible skip links and safe focus movement.
3. Repair only reliable missing landmark cases.
4. Add sanitized page/region summary input and a validated backend endpoint.

Exit criteria:

- Users can reach main content, forms, and current errors without losing focus or disrupting native NVDA shortcuts.

## Phase 7 - Context and personalization

Status: `NOT_STARTED`

Tasks:

1. Keep page context in content-script/tab memory and clear it on navigation.
2. Keep temporary preferences in `chrome.storage.session`.
3. Keep only explicitly confirmed long-term preferences in `chrome.storage.local` or PostgreSQL when synchronization is enabled.
4. Implement the fixed context priority resolver.
5. Add evidence counters and an accessible confirmation dialog with confirm/reject/edit/delete paths.
6. Add optional first-run setup and complete profile reset/deletion.

Exit criteria:

- Explicit commands override saved preferences; repeated behavior only proposes a preference; persistence requires explicit confirmation.

## Phase 8 - Limited dynamic updates, noise, and voice

Status: `DEFERRED`

Tasks:

1. Classify and announce only validation, completion, loading completion, security, and important status updates.
2. Add heuristic noise scoring with protected-content checks and no deletion.
3. Add predefined Bangla voice intents only after every action has a keyboard equivalent.

Exit criteria:

- Announcements are useful and rate-limited, protected content is never deprioritized, and voice cannot trigger arbitrary browser actions.

## Phase 9 - Backend, persistence, integration, and evaluation completion

Status: `NOT_STARTED`

Backend tasks begin when the first AI-dependent vertical slice reaches Phase 2; an empty API should not be built earlier merely to fill folders.

Tasks:

1. Add a Node/Express backend with versioned routes, JSON schema validation, redaction, timeouts, and structured safe errors.
2. Add PostgreSQL migrations only for confirmed profiles, evidence, sanitized feedback, and audit metadata.
3. Implement accessible-name, form-message, image-description, and page-summary endpoints as their extension consumers become ready.
4. Add profile, preference-evidence, and feedback endpoints with consent and deletion behavior.
5. Add unit, API, fixture integration, privacy, keyboard, and manual NVDA test documentation.
6. Update architecture/API/install documentation and the implementation status after each vertical slice.

Exit criteria:

- The core detect-rule-fallback-validate-adapt-announce-feedback workflow operates end to end with safe provider failure behavior.
- No raw HTML, passwords, payment values, or full browsing history are persisted.

## Verification strategy

Every phase should run, at minimum:

1. Extension syntax/lint checks.
2. Core unit tests for deterministic logic.
3. A production extension build.
4. Fixture-page keyboard smoke tests.
5. NVDA manual checks for user-facing semantics and announcements when those surfaces change.
6. Backend schema/safety tests once backend code exists.

The exact commands and results must be appended to `IMPLEMENTATION_STATUS.md` after each implementation session.
