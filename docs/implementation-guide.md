# Implementation Guide

> FR-13 navigation voice update (2026-10-08): implemented the user's revised plan with on-demand recording inside the Alt+Shift+Z navigator, scoped Alt+Shift+V, Gemini/Speechmatics/Sarvam transcription fallback and Gemini fuzzy resolution against the displayed destination list. A validated listed destination is focused directly; no_match leaves navigation open. No arbitrary generated browser actions are allowed. This slice remains PARTIAL pending real microphone/NVDA/provider acceptance; description voice commands remain deferred. See `docs/voice-navigation.md` and `docs/implementation-status.md`.

> FR-15/FR-16 implementation update (2026-10-08): the extension now includes default-off, local heuristic noise classification for its guided region navigator. Qualifying promotional regions appear later and remain individually reachable; publisher content is not hidden, deleted or changed. Protected-content checks override scores and propagate through containing inventoried regions. Settings, dynamic reclassification and automated browser/unit verification are implemented. Manual NVDA and representative-site acceptance remain pending; see `docs/implementation-status.md` and `docs/navigation-acceptance.md` for the exact policy and limitations.
## AI-Driven Bangla Web Accessibility Assistant for Visually Impaired Users

> **Purpose of this file:** This document is the implementation brief for Codex inside VS Code.  
> The repository may already contain a small amount of code. Codex must inspect and preserve useful existing work before adding or changing anything.

---

## 1. Project Authority and Scope

Implement the project according to the following priority:

1. **Submitted project proposal** — authoritative source for project identity, goals, scope and principal features.
2. **Midterm technical report** — authoritative source for architecture, requirements, diagrams, data design, AI pipeline and constraints.
3. **Feature execution plan** — secondary implementation guide only. It helps sequence the work but must not silently expand the project beyond the proposal.
4. **Existing repository code** — inspect first, reuse when correct, and refactor only when necessary.

Do not implement every feature at equal depth. Build a narrow but complete end-to-end prototype first.

### Core committed workflow

```text
Detect accessibility problem
        ↓
Preserve valid existing information
        ↓
Try deterministic rule-based solution
        ↓
Call AI/OCR/speech service only when rules are insufficient
        ↓
Validate the generated result
        ↓
Calculate deterministic evidence/confidence
        ↓
Apply a temporary reversible adaptation
        ↓
Expose the result through NVDA-compatible semantics
        ↓
Collect user correction or confirmation
```

---

## 2. Motivation

Visually impaired Bangla-speaking users often face major barriers when browsing websites with screen readers and keyboard navigation. Common problems include unlabeled controls, inaccessible forms, missing image descriptions, unannounced dynamic updates and complex page structures. Even when accessibility information exists, it is frequently available only in English, creating an additional language barrier.

This project is motivated by the need for a browser-level accessibility assistant that improves webpage structure, generates contextual Bangla support, assists keyboard navigation and helps users understand webpage content more effectively.

## 5. Project Description

The product is a Google Chrome extension for Microsoft Windows and requires the NVDA screen reader. It dynamically analyzes webpages and provides temporary accessibility improvements such as Bangla accessibility labels, selected semantic repair, accessible navigation support, understandable form guidance, dynamic-content announcements, image descriptions, page summaries, accessibility feedback and user-controlled personalization.

The extension combines deterministic accessibility rules with AI only when semantic understanding or content generation is necessary. All changes must remain temporary, reversible and safe for the original webpage.

## 6. Product Summary

Build a Google Chrome extension for Windows 11 users who browse with the NVDA screen reader.

The system analyzes webpages and provides temporary accessibility improvements for visually impaired Bangla-speaking users, including:

- meaningful Bangla accessible names;
- repair of selected non-semantic controls;
- understandable Bangla form instructions and validation explanations;
- OCR and multimodal descriptions of unlabeled informative images;
- navigation using headings, landmarks, links, form controls and generated skip links;
- page or selected-region summaries;
- relevant dynamic-content announcements;
- optional noise reduction for repetitive non-essential regions;
- optional accessible first-run setup;
- separate current-page, session and confirmed long-term context;
- keyboard-accessible confirmation before saving inferred preferences.

The extension must not permanently modify third-party websites.

---

## 5. Target Users and External Stakeholders

### Primary user

**Visually impaired Bangla-speaking person**

The user may:

- browse through NVDA;
- use keyboard navigation;
- optionally use a limited set of Bangla voice commands;
- request brief, standard or detailed descriptions;
- receive Bangla labels, summaries and form guidance;
- confirm, reject, edit or delete learned preferences.

### External service providers

**AI service providers**

These may include:

- Google Gemini API for Bangla generation, simplification, page summaries and multimodal interpretation;
- Tesseract OCR for extracting visible text from images;
- Whisper or another speech-to-text service for limited Bangla voice commands.

External services must receive only the minimum sanitized context required for a task.

---

## 6. Required Technology Direction

Use the existing repository stack where it already matches this design. Otherwise prefer:

### Browser extension

- Chrome Extension Manifest V3
- TypeScript or JavaScript
- Semantic HTML and CSS
- Content script
- Background service worker
- Options/settings page
- Popup only where useful
- `MutationObserver`
- `chrome.storage.session`
- `chrome.storage.local`

### Backend

- Node.js
- Express.js
- TypeScript preferred if the repository already uses it
- REST API
- JSON schema validation
- Environment variables for secrets
- HTTPS in deployment

### Database

- PostgreSQL
- Store only confirmed profiles, sanitized feedback, evidence counters and audit metadata
- Do not store raw page HTML, passwords, payment data or full browsing history

### Testing

- Jest or Vitest
- Local inaccessible HTML fixture pages
- Chrome extension integration testing where practical
- Manual keyboard and NVDA testing

Do not train or fine-tune a new machine-learning model for this prototype.

---

## 7. Mandatory First Step: Repository Audit

Before implementing features, Codex must inspect the repository.

### Audit tasks

1. List the current directory structure.
2. Identify:
   - extension code;
   - backend code;
   - database configuration;
   - implemented features;
   - unfinished modules;
   - duplicated or dead code;
   - environment files and missing variables;
   - tests;
   - build and run scripts.
3. Read the important source files.
4. Run existing lint, tests and build commands.
5. Record what already works.
6. Create or update:
   - `docs/implementation-status.md`
   - `docs/implementation-plan.md`
7. Do not delete existing code merely because it differs from this document.
8. Refactor only after explaining the reason in the implementation plan.

### Required status categories

For every feature, mark one of:

- `NOT_STARTED`
- `PARTIAL`
- `IMPLEMENTED`
- `BLOCKED`
- `DEFERRED`

---

## 8. Functional Requirements

### FR-01 — Initial DOM analysis

The extension shall scan the DOM and relevant accessibility attributes after initial page load.

Implementation notes:

- inspect interactive controls, forms, images, headings, landmarks and live regions;
- avoid scanning irrelevant hidden or script/style content;
- assign stable internal fingerprints to analyzed elements where needed.

### FR-02 — Dynamic DOM analysis

The extension shall observe meaningful DOM mutations and re-analyze only affected regions.

Implementation notes:

- use `MutationObserver`;
- debounce rapid changes;
- ignore mutations caused by the extension itself;
- do not rescan the entire document for every mutation.

### FR-03 — Accessibility issue detection

Detect selected problems:

- missing accessible names;
- clickable non-semantic controls;
- missing form labels;
- inaccessible or overly technical validation messages;
- absent or unreliable landmarks;
- selected keyboard-access problems;
- unlabeled informative images;
- relevant dynamic updates not announced to screen readers.

### FR-04 — Preserve valid information

Never overwrite meaningful developer-provided accessibility information unless the user explicitly asks for an alternative explanation.

Preserve:

- valid `aria-label`;
- `aria-labelledby`;
- associated `<label>`;
- native element semantics;
- useful `alt`;
- existing live-region behavior;
- security and completion-critical content.

### FR-05 — Bangla accessible-name generation

Generate a Bangla accessible name only when deterministic sources are insufficient.

Use this order:

1. associated label;
2. visible text;
3. `aria-labelledby`;
4. `title`;
5. `placeholder`;
6. recognized icon mapping;
7. nearby heading or surrounding context;
8. AI-assisted generation as final fallback.

AI must not invent an action unsupported by the element.

### FR-06 — Candidate semantic-role inference

For selected non-semantic clickable controls, infer a candidate role using:

- native tag;
- click or keyboard event handlers;
- current focusability;
- visible action text;
- ARIA state;
- form position;
- surrounding context;
- conflicting native behavior.

Initial supported patterns should be limited to common cases such as clickable `div` and `span` elements that clearly behave as buttons.

### FR-07 — Confidence-controlled semantic repair

Do not train an ML model for this.

Calculate a deterministic weighted evidence score between `0` and `1`.

Example evidence:

| Evidence | Example weight |
|---|---:|
| Click handler exists | +0.20 |
| Action-oriented visible text | +0.20 |
| `cursor: pointer` | +0.10 |
| Element is inside a form action region | +0.10 |
| Existing keyboard handler | +0.15 |
| ARIA state consistent with role | +0.10 |
| Conflicting native semantics | −0.35 |
| Contains multiple independent controls | −0.30 |

Initial policy:

- score `>= 0.85` and validators pass: apply temporary repair;
- score `0.60–0.84`: present suggestion or ask the user;
- score `< 0.60`: do not modify automatically.

AI-provided confidence is advisory only and must not control the final decision.

### FR-08 — Dynamic announcements and form errors

Announce relevant updates through an NVDA-compatible live region.

Prioritize:

- validation errors;
- successful completion messages;
- loading completion;
- important status changes;
- authentication or security warnings.

Do not announce every DOM mutation.

### FR-09 — Understandable Bangla form guidance

This feature is not merely literal translation.

The system shall:

1. detect existing HTML constraints and page-provided error messages;
2. preserve every original requirement;
3. explain the requirement in simple, task-oriented Bangla;
4. announce it through NVDA.

Examples of machine-readable constraints:

- `required`
- `minlength`
- `maxlength`
- `min`
- `max`
- `pattern`
- `type="email"`
- `aria-required`
- `aria-invalid`
- `aria-describedby`

Example:

```text
Original:
Password must be at least 8 characters and contain one uppercase
letter, one digit and one special character.

Expected Bangla explanation:
পাসওয়ার্ডটি অন্তত ৮টি চিহ্নের করুন। এর মধ্যে ইংরেজি বড় হাতের
অন্তত একটি অক্ষর, অন্তত একটি সংখ্যা এবং @, # বা $-এর মতো
অন্তত একটি বিশেষ চিহ্ন দিন।
```

### Rule sufficiency for form messages

Use rule-based templates when:

- every detected constraint is recognized;
- no unresolved technical term remains;
- the generated explanation covers all conditions;
- the message is structurally simple.

Calculate:

```text
coverage = recognized constraints / total detected constraints
```

Use rules when:

```text
coverage >= 0.90
AND no unresolved technical phrase remains
```

Use AI assistance when:

- coverage is below `0.90`;
- the message contains unmatched free text;
- technical language remains;
- nearby context is necessary;
- multiple conditions are combined ambiguously.

The AI prompt must include the original constraints and must be instructed not to omit or invent requirements.

### FR-10 — Image interpretation

For selected unlabeled informative images:

1. determine whether the image is decorative or informative;
2. extract visible text with OCR when appropriate;
3. call multimodal AI for contextual description when needed;
4. produce brief, standard or detailed Bangla output;
5. expose the result through an accessible description mechanism.

Do not automatically send every image to an external service.

Skip or mark as decorative when appropriate:

- tiny tracking images;
- separators;
- visual ornaments;
- empty images;
- duplicate icons already explained by adjacent text.

### FR-11 — Output detail preference

Support:

- brief;
- standard;
- detailed.

The preference affects:

- image descriptions;
- page summaries;
- form guidance;
- optional announcements.

A current explicit command overrides saved preferences.

### FR-12 — Navigation support

The system must contribute more than NVDA's existing shortcuts.

It shall:

- detect existing headings, landmarks, links and form controls;
- expose a structured region list;
- generate skip links for important regions;
- move focus safely to selected regions;
- repair selected missing navigation semantics when reliable;
- preserve native NVDA navigation behavior.

Possible generated skip links:

- মূল কনটেন্টে যান
- সার্চ ফর্মে যান
- ফলাফলে যান
- ফর্মের ভুলগুলোতে যান

### FR-13 — Limited Bangla voice commands

This is optional and lower priority than keyboard navigation.

Support only a predefined intent set, for example:

- “মূল কনটেন্টে যান”
- “শিরোনামগুলো দেখান”
- “ফর্মে যান”
- “ছবিটি বর্ণনা করুন”
- “সংক্ষেপে বলুন”
- “বিস্তারিত বলুন”

Voice transcription must be mapped to allowed intents. Do not allow arbitrary model-generated browser actions.

### FR-14 — Bangla page or region summary

Generate a structured summary from sanitized information such as:

- page title;
- headings;
- landmarks;
- forms;
- selected visible text;
- current task;
- currently focused region.

Prefer summaries such as:

```text
এই পৃষ্ঠায় একটি প্রধান নিবন্ধ, দুটি নেভিগেশন অঞ্চল,
একটি সার্চ ফর্ম এবং তিনটি গুরুত্বপূর্ণ ছবি রয়েছে।
```

Do not send the full webpage unless explicitly necessary and permitted.

### FR-15 — Repetitive non-essential region classification

Do not train an ML model for the first version.

Use heuristics:

- explicit advertisement or sponsored attributes;
- class/id/ARIA keywords;
- repeated structural signatures;
- repeated link groups;
- location outside `<main>`;
- `<aside>` or footer placement;
- promotional vocabulary;
- relevance to the current task.

Example indicators:

- `aria-label="advertisement"`
- class names containing `ad`, `promo`, `sponsored`
- text such as `advertisement`, `sponsored`, `বিজ্ঞাপন`, `অফার`
- structurally repeated recommendation blocks

Create a normalized noise score.

Only deprioritize when:

- the feature is enabled;
- the score is above the selected threshold;
- the region is not protected;
- the user can still reach it.

“Reduce navigation priority” may mean:

- place it later in the generated region list;
- skip it during guided navigation;
- announce it as promotional;
- provide a “show low-priority regions” command.

Do not delete content or remove it permanently.

### FR-16 — Protected content

Never suppress or deprioritize:

- security warnings;
- validation errors;
- payment information;
- consent text;
- legal instructions;
- authentication controls;
- controls required to complete the current task.

### FR-17 — Optional accessible setup

On first run, offer a keyboard-accessible and NVDA-announced setup flow.

The user may skip it.

Possible settings:

- language: Bangla / English / mixed;
- output detail: brief / standard / detailed;
- image descriptions: off / on request / important images;
- navigation preference: headings / landmarks / forms / no preference;
- form guidance: errors only / simple explanation / step-by-step;
- noise reduction: enabled / disabled;
- voice commands: enabled / disabled;
- confirmation preference.

Use native semantic controls and correct focus management.

### FR-18 — Separate context layers

Maintain three different lifetimes.

#### Current-page context

Store in tab-scoped memory or the content script.

Examples:

- current tab ID;
- page type;
- focused element;
- nearby heading;
- active validation error;
- detected regions;
- current task.

Clear on page navigation or tab close.

Do not store full page HTML.

#### Session context

Store in `chrome.storage.session` or service-worker memory.

Examples:

- temporary detail preference;
- current task;
- last error field;
- session-only noise preference;
- repeated interaction counters.

Expire at browser/session end.

#### Long-term profile

Store only confirmed preferences in `chrome.storage.local` or PostgreSQL when synchronization is enabled.

Examples:

- preferred language;
- output detail;
- form-guidance level;
- navigation mode;
- image-description mode;
- noise-reduction preference;
- voice-command preference.

Remain until edited, reset or deleted.

### Context priority order

1. current explicit user instruction;
2. security-critical and completion-critical information;
3. current task and focused-element context;
4. temporary session preference;
5. confirmed long-term preference;
6. system default.

### FR-19 — Confirmation before long-term storage

Repeated behavior may create a candidate preference, but must not automatically change the long-term profile.

Prompt the visually impaired user through a keyboard-accessible NVDA-announced dialog.

Example:

```text
আপনি কয়েকবার বিস্তারিত ছবির বর্ণনা চেয়েছেন।
ভবিষ্যতে বিস্তারিত বর্ণনা স্বয়ংক্রিয়ভাবে দিতে চান?
```

Required choices:

- হ্যাঁ, স্থায়ীভাবে সংরক্ষণ করুন
- শুধু এই সেশনে ব্যবহার করুন
- না
- এই বিষয়ে আর জিজ্ঞাসা করবেন না

Dialog requirements:

- semantic `role="dialog"`;
- accessible name and description;
- focus moves into the dialog;
- Escape closes it;
- focus returns to the previous element;
- no repeated prompting after rejection according to cooldown rules.

### FR-20 — Preference management

The user shall be able to:

- review saved settings;
- edit settings;
- reset selected settings;
- reset all settings;
- delete persistent profile and preference evidence.

### FR-21 — Audit metadata

Record:

- adaptation type;
- reason code;
- deterministic score;
- whether AI was called;
- prompt version;
- model version;
- validator result;
- user feedback;
- rollback status.

Do not store raw page content by default.

---

## 9. Non-Functional Requirements

### NFR-01 — Accessibility

The extension's own interface must be accessible.

Requirements:

- keyboard operable;
- semantic HTML;
- visible focus;
- correct label associations;
- NVDA-compatible status announcements;
- accessible dialogs;
- no color-only meaning.

### NFR-02 — Performance

- local rule checks must not noticeably block the page;
- scan only relevant regions;
- debounce mutation processing;
- AI/OCR calls must be selective and asynchronous;
- allow cancellation when the page changes;
- cache only safe, reusable outputs.

### NFR-03 — Reliability

If Gemini, OCR, speech or backend services fail:

- preserve the original page;
- keep rule-only features working;
- announce a concise failure status;
- do not leave partial or broken adaptations.

### NFR-04 — Security

- keep API keys on the backend;
- use environment variables;
- use HTTPS in deployment;
- validate all external responses;
- sanitize data sent to services;
- never execute model-generated JavaScript;
- minimize Chrome permissions.

### NFR-05 — Privacy

Do not collect or send:

- raw browsing history;
- passwords;
- payment values;
- unrelated form values;
- complete page HTML unless strictly necessary and explicitly allowed.

Provide consent, reset and deletion controls.

### NFR-06 — Explainability

Every adaptation must have a reason code, such as:

- `missing-name`
- `non-semantic-control`
- `missing-form-label`
- `unannounced-update`
- `missing-image-description`
- `repetitive-promotional-region`

### NFR-07 — Maintainability

Keep modules separate:

- DOM scanners;
- accessibility rules;
- context stores;
- prompt templates;
- validators;
- external service adapters;
- accessible UI;
- repositories.

Avoid one large content-script file.

### NFR-08 — Compatibility

Document the exact tested versions of:

- Windows 11;
- Google Chrome;
- NVDA.

Do not claim universal browser or screen-reader support.

### NFR-09 — Localization

All extension-generated:

- controls;
- errors;
- instructions;
- status messages;
- setup questions;
- confirmation prompts

must support understandable Bangla.

### NFR-10 — Reversibility

All page modifications must be temporary and reversible.

Maintain original values before changing:

- role;
- accessible name;
- tabindex;
- event handlers added by the extension;
- inserted skip links;
- live regions.

Rollback on:

- extension disablement;
- page reload;
- navigation;
- explicit user action.

### NFR-11 — Auditability

Store only minimal metadata required for debugging and evaluation.

Version:

- rules;
- prompts;
- model configuration;
- validators.

### NFR-12 — Usability

- do not interrupt for every minor decision;
- group announcements;
- use confirmation only when necessary;
- provide “do not ask again” or cooldown behavior;
- keep frequent tasks short;
- provide safe defaults;
- allow setup to be skipped.

---

## 10. Architecture

### 8.1 Browser extension components

```text
Chrome Extension
├── Content Script
│   ├── DOM Scanner
│   ├── Mutation Observer
│   ├── Adaptation Layer
│   ├── Focus Manager
│   └── Live Region Manager
├── Rule Engine
│   ├── Accessible Name Rules
│   ├── Semantic Role Rules
│   ├── Form Rules
│   ├── Landmark and Navigation Rules
│   ├── Image Rules
│   └── Noise Classification Rules
├── Context Manager
│   ├── Current Page Context
│   ├── Session Context
│   ├── Long-Term Profile
│   └── Context Priority Resolver
├── Accessible Extension UI
│   ├── First-Run Setup
│   ├── Settings
│   ├── Confirmation Dialog
│   ├── Feedback Controls
│   └── Profile Reset/Delete
├── Voice Command Handler
└── Background Service Worker
    ├── API Client
    ├── Cache
    ├── Storage Coordinator
    └── Permission Coordinator
```

### 8.2 Backend components

```text
Node.js / Express Backend
├── Routes
│   ├── accessible-name
│   ├── form-message
│   ├── image-description
│   ├── page-summary
│   ├── profile
│   └── feedback
├── Services
│   ├── Prompt Orchestrator
│   ├── Gemini Adapter
│   ├── OCR Adapter
│   ├── Speech Adapter
│   ├── Output Validators
│   └── Redaction Service
├── Repositories
│   ├── Profile Repository
│   ├── Preference Evidence Repository
│   ├── Feedback Repository
│   └── Audit Repository
└── Security
    ├── Secret Management
    ├── Request Validation
    ├── Rate Limiting
    └── Context Sanitization
```

---

## 11. Suggested Repository Structure

Adapt this to the current repository rather than replacing working structure without reason.

```text
project-root/
├── browser-extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── content/
│   │   │   ├── index.ts
│   │   │   ├── domScanner.ts
│   │   │   ├── mutationObserver.ts
│   │   │   ├── adaptationLayer.ts
│   │   │   ├── focusManager.ts
│   │   │   └── liveRegionManager.ts
│   │   ├── rules/
│   │   │   ├── accessibleNameRules.ts
│   │   │   ├── semanticRoleRules.ts
│   │   │   ├── formRules.ts
│   │   │   ├── navigationRules.ts
│   │   │   ├── imageRules.ts
│   │   │   └── noiseRules.ts
│   │   ├── context/
│   │   │   ├── pageContext.ts
│   │   │   ├── sessionContext.ts
│   │   │   ├── profileContext.ts
│   │   │   └── priorityResolver.ts
│   │   ├── background/
│   │   │   ├── serviceWorker.ts
│   │   │   ├── apiClient.ts
│   │   │   ├── cache.ts
│   │   │   └── storage.ts
│   │   ├── ui/
│   │   │   ├── setup/
│   │   │   ├── settings/
│   │   │   ├── confirmation/
│   │   │   └── feedback/
│   │   ├── voice/
│   │   │   ├── commandParser.ts
│   │   │   └── intents.ts
│   │   ├── shared/
│   │   │   ├── reasonCodes.ts
│   │   │   ├── schemas.ts
│   │   │   └── types.ts
│   │   └── i18n/
│   │       ├── bn.ts
│   │       └── en.ts
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── fixtures/
├── backend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── routes/
│   │   ├── services/
│   │   ├── adapters/
│   │   ├── validators/
│   │   ├── repositories/
│   │   ├── security/
│   │   ├── prompts/
│   │   └── types/
│   ├── tests/
│   └── prisma/ or migrations/
├── docs/
│   ├── implementation-guide.md
│   ├── implementation-status.md
│   ├── implementation-plan.md
│   ├── architecture.md
│   ├── accessibility-testing.md
│   └── api.md
├── README.md
├── .env.example
└── package.json or workspace configuration
```

---

## 12. Database Design

The prototype may keep current-page and ordinary session state in the extension. PostgreSQL is for persistent or evaluation data.

### USER

Purpose:

- pseudonymous user identifier;
- preferred language;
- consent status.

Do not require a real name.

Suggested fields:

```text
user_id UUID PRIMARY KEY
preferred_language VARCHAR
consent_status BOOLEAN
created_at TIMESTAMP
updated_at TIMESTAMP
```

### ACCESSIBILITY_PROFILE

Confirmed long-term preferences.

```text
profile_id UUID PRIMARY KEY
user_id UUID REFERENCES USER
navigation_mode VARCHAR
description_detail VARCHAR
form_guidance_level VARCHAR
noise_reduction_enabled BOOLEAN
voice_enabled BOOLEAN
updated_at TIMESTAMP
```

### PREFERENCE_EVIDENCE

Temporary evidence for a possible preference.

```text
evidence_id UUID PRIMARY KEY
user_id UUID REFERENCES USER
preference_key VARCHAR
candidate_value VARCHAR
observation_count INTEGER
evidence_score NUMERIC
confirmation_status VARCHAR
last_observed_at TIMESTAMP
```

A candidate must not update the profile until the user confirms it.

### BROWSING_SESSION

Optional server-side session metadata only when needed.

```text
session_id UUID PRIMARY KEY
user_id UUID REFERENCES USER
started_at TIMESTAMP
ended_at TIMESTAMP
current_task VARCHAR
```

Do not store page HTML or sensitive form values.

### PAGE_ANALYSIS

Minimal evaluation metadata.

```text
analysis_id UUID PRIMARY KEY
session_id UUID
url_hash VARCHAR
page_category VARCHAR
issue_counts JSONB
created_at TIMESTAMP
```

### USER_FEEDBACK

```text
feedback_id UUID PRIMARY KEY
analysis_id UUID
adaptation_id UUID
feedback_type VARCHAR
optional_correction TEXT
created_at TIMESTAMP
```

### ADAPTATION_AUDIT

```text
adaptation_id UUID PRIMARY KEY
analysis_id UUID
adaptation_type VARCHAR
reason_code VARCHAR
rule_score NUMERIC
ai_used BOOLEAN
prompt_version VARCHAR
model_version VARCHAR
validation_status VARCHAR
rollback_status VARCHAR
created_at TIMESTAMP
```

---

## 13. AI Engineering Rules

### AI is used for

- contextual Bangla accessible-name generation;
- simplification of unmatched technical form messages;
- page or selected-region summaries;
- multimodal image descriptions;
- limited semantic suggestions where rules cannot determine meaning.

### AI is not used for

- deciding whether existing valid accessibility information should be preserved;
- final semantic repair confidence;
- protected-content policy;
- context priority;
- permanent preference storage;
- arbitrary browser actions;
- executing generated code;
- hiding content automatically.

### Required response style

Prefer structured JSON.

Example accessible-name response:

```json
{
  "label_bn": "সেটিংস খুলুন",
  "suggested_role": "button",
  "model_confidence": 0.91,
  "reason": "The gear icon and nearby account heading indicate a settings action."
}
```

### Required validators

Validate:

- JSON schema;
- allowed fields;
- Bangla script presence where required;
- label length;
- allowed roles;
- consistency with provided action;
- no invented action;
- no prohibited instructions;
- no script or executable code;
- no attempt to suppress protected content.

A schema, safety or consistency failure must cause rejection and safe fallback.

---

## 14. Prompt Templates

Store prompts as versioned files.

### Accessible-name prompt

```text
SYSTEM:
You are an accessibility transformation module.
Use only the supplied webpage context.
Preserve valid existing accessibility information.
Do not invent actions.
Return JSON only.

TASK:
Generate a concise functional Bangla accessible name for one control.

CONTEXT:
{sanitized_element_context}

RULES:
1. Prefer functional meaning over literal translation.
2. Maximum eight words unless clarification is necessary.
3. Preserve important product names.
4. Use only an allowed role.
5. State uncertainty through model_confidence.
6. Do not output HTML or JavaScript.

SCHEMA:
{
  "label_bn": "string",
  "suggested_role": "button|link|checkbox|menuitem|none",
  "model_confidence": 0.00,
  "reason": "string"
}
```

### Form-message prompt

```text
SYSTEM:
You explain existing form requirements in understandable Bangla.
Do not add, remove or weaken any requirement.
Do not provide a literal translation when a clearer functional explanation is possible.
Return JSON only.

TASK:
Explain the supplied validation requirement for a non-technical Bangla-speaking user.

INPUT:
{
  "field_type": "...",
  "html_constraints": {...},
  "original_message": "...",
  "nearby_instruction": "..."
}

SCHEMA:
{
  "message_bn": "string",
  "covered_constraints": ["..."],
  "unresolved_constraints": ["..."]
}
```

### Page-summary prompt

```text
SYSTEM:
Summarize only the supplied sanitized page structure.
Do not invent hidden content or actions.

INPUT:
{
  "title": "...",
  "headings": [...],
  "landmarks": [...],
  "forms": [...],
  "selected_text": "...",
  "current_task": "..."
}

SCHEMA:
{
  "summary_bn": "string",
  "important_regions": [
    {"name_bn": "string", "type": "heading|landmark|form|section"}
  ]
}
```

---

## 15. Execution Plan

Do not attempt all modules simultaneously.

### Phase 0 — Audit and stabilization

Deliverables:

- repository audit;
- existing-feature inventory;
- working build commands;
- `.env.example`;
- updated implementation status;
- basic lint and test setup.

Completion condition:

- current code builds or documented blockers exist;
- implemented code is not accidentally broken.

### Phase 1 — Extension foundation

Implement:

- Manifest V3;
- content script;
- service worker;
- accessible settings page;
- DOM scanner;
- MutationObserver;
- reason-code system;
- reversible adaptation registry;
- fixture pages.

Completion condition:

- extension loads;
- scans a fixture page;
- logs selected issues;
- can add and roll back one safe adaptation.

### Phase 2 — Accessible names and preservation

Implement:

- preservation checks;
- accessible-name calculation hierarchy;
- missing-name detection;
- Bangla label templates;
- Gemini fallback;
- output validation;
- caching where safe.

Completion condition:

- visible-text button uses deterministic name with no AI;
- meaningful existing `aria-label` is preserved;
- icon-only fixture can receive a validated Bangla label.

### Phase 3 — Semantic repair and keyboard access

Implement:

- candidate detection;
- weighted evidence score;
- threshold configuration;
- temporary role/tabindex support;
- Enter/Space behavior without duplicate activation;
- rollback.

Completion condition:

- common clickable `div` fixture becomes keyboard operable;
- conflicting or low-confidence fixture remains unchanged.

### Phase 4 — Form assistance

Implement:

- form-control association;
- constraint extraction;
- known-template explanations;
- rule-coverage calculation;
- AI simplification fallback;
- NVDA live-region announcement;
- focus movement to invalid field where appropriate.

Completion condition:

- required, minlength, email and combined password constraints are explained clearly in Bangla;
- no condition is lost;
- passwords and field values are never logged or transmitted.

### Phase 5 — Visual content interpretation

Implement:

- informative/decorative classification;
- OCR adapter;
- multimodal image-description endpoint;
- detail-level preference;
- accessible delivery of descriptions.

Completion condition:

- image fixture with text uses OCR;
- informative image receives Bangla description;
- decorative image is skipped.

### Phase 6 — Navigation support

Implement:

- heading/landmark/link/form-control collection;
- region navigator;
- generated skip links;
- safe focus movement;
- selected missing-landmark repair;
- page summary endpoint.

Completion condition:

- user can move to main content, form and validation-error regions;
- generated skip links are keyboard accessible;
- focus does not become lost.

### Phase 7 — Context and personalization

Implement:

- optional first-run setup;
- current-page context;
- session context;
- long-term profile;
- priority resolver;
- interaction evidence counter;
- accessible confirmation dialog;
- review/reset/delete.

Completion condition:

- current explicit command overrides saved detail;
- one interaction does not create a permanent preference;
- repeated evidence triggers confirmation;
- rejection keeps behavior session-only;
- profile deletion works.

### Phase 8 — Limited dynamic updates, noise and voice

Implement only after core phases work.

#### Dynamic updates

- classify relevant mutations;
- announce errors, completion and important status;
- avoid announcement flooding.

#### Noise reduction

- heuristic classifier;
- protected-content rules;
- deprioritization rather than deletion;
- feature disabled by default if reliability is uncertain.

#### Voice

- predefined command intents only;
- keyboard equivalents for every voice action.

### Phase 9 — Integration, testing and documentation

Implement:

- unit tests;
- fixture-based integration tests;
- backend validation tests;
- NVDA manual test checklist;
- privacy review;
- API documentation;
- installation and setup documentation.

---

## 16. Feature Priority

### Priority 1 — Must work

- extension foundation;
- DOM scanning;
- mutation handling;
- preservation of valid information;
- accessible-name generation;
- form explanation;
- reversible changes;
- NVDA-compatible announcements;
- safe backend communication.

### Priority 2 — Should work

- selected semantic repair;
- image OCR and description;
- heading/landmark navigation;
- skip links;
- optional setup;
- page/session/long-term context;
- confirmation and deletion.

### Priority 3 — Limited prototype

- page summary;
- relevant dynamic translation;
- heuristic noise reduction;
- limited voice commands;
- interaction-based preference suggestions.

### Priority 4 — Do not expand without approval

- full autonomous webpage repair;
- complete WCAG auditing;
- arbitrary voice-controlled browsing;
- automatic form submission;
- payment or legal actions;
- model training;
- storing full browsing history;
- automatic permanent preferences.

---

## 17. Minimum API Endpoints

Use existing endpoints where present. Avoid unnecessary API expansion.

```text
POST /api/v1/assist/accessible-name
POST /api/v1/assist/form-message
POST /api/v1/assist/image-description
POST /api/v1/assist/page-summary

GET    /api/v1/profile
PATCH  /api/v1/profile
DELETE /api/v1/profile

POST /api/v1/preferences/evidence
POST /api/v1/feedback
```

Every AI endpoint must:

1. validate request schema;
2. redact sensitive fields;
3. select a versioned task-specific prompt;
4. call the configured adapter;
5. validate response schema;
6. perform language, safety and consistency checks;
7. return a structured result or safe error;
8. record sanitized metadata.

---

## 18. Reason Codes

Create a shared enum or constant map.

```text
MISSING_ACCESSIBLE_NAME
EXISTING_ACCESSIBLE_NAME_PRESERVED
NON_SEMANTIC_CLICKABLE_CONTROL
KEYBOARD_ACCESS_MISSING
FORM_LABEL_MISSING
FORM_CONSTRAINT_EXPLANATION
FORM_ERROR_UNANNOUNCED
IMAGE_ALT_MISSING
IMAGE_CLASSIFIED_DECORATIVE
DYNAMIC_STATUS_UNANNOUNCED
LANDMARK_MISSING
SKIP_LINK_GENERATED
REPETITIVE_PROMOTIONAL_REGION
PROTECTED_CONTENT_PRESERVED
AI_RESPONSE_INVALID
AI_RESPONSE_LOW_CONFIDENCE
AI_SERVICE_UNAVAILABLE
USER_CONFIRMATION_REQUIRED
PREFERENCE_CONFIRMED
PREFERENCE_REJECTED
ADAPTATION_ROLLED_BACK
```

---

## 19. Testing Requirements

### Unit tests

Test:

- accessible-name hierarchy;
- preservation rule;
- semantic-role evidence score;
- threshold policy;
- form-constraint extraction;
- rule coverage;
- protected-content rule;
- context priority;
- sanitization;
- validators;
- preference confirmation logic.

### Fixture pages

Create local fixtures for:

1. button with visible text but no ARIA label;
2. icon-only settings control;
3. valid existing accessible name;
4. clickable `div`;
5. conflicting clickable container;
6. registration form with several constraints;
7. unannounced validation error;
8. image with visible text;
9. informative chart image;
10. decorative image;
11. repeated advertisement blocks;
12. security warning resembling promotional content;
13. dynamic success message;
14. page with no `<main>` landmark;
15. long navigation before main content.

### Essential acceptance scenarios

#### Scenario A — Deterministic label

- control has visible text;
- extension uses the text;
- AI is not called;
- NVDA announces a meaningful name.

#### Scenario B — Existing label

- control already has a meaningful name;
- extension does not replace it;
- preservation reason is recorded.

#### Scenario C — Semantic repair

- clickable `div` clearly behaves as a button;
- evidence score is high;
- temporary role and keyboard behavior are applied;
- Enter/Space do not trigger duplicate actions.

#### Scenario D — Form explanation

- password constraint contains length, uppercase, digit and special-character requirements;
- Bangla explanation includes all four conditions;
- no form value is sent to the backend.

#### Scenario E — Invalid AI result

- mock AI returns malformed JSON or invented action;
- validator rejects it;
- page remains usable;
- fallback is announced.

#### Scenario F — Preference learning

- user requests detailed description repeatedly;
- candidate preference is created;
- NVDA-announced confirmation appears;
- permanent storage occurs only after explicit confirmation.

#### Scenario G — Protected content

- security warning matches some noise keywords;
- protected-content rule prevents deprioritization.

---

## 20. Definition of Done for Every Feature

A feature is complete only when:

- code is modular;
- TypeScript types or clear interfaces exist;
- lint passes;
- tests exist for core logic;
- keyboard operation is checked;
- NVDA behavior is documented;
- sensitive context is not logged;
- failure has a safe fallback;
- changes are reversible where applicable;
- documentation and `docs/implementation-status.md` are updated.

---

## 21. Codex Working Rules

Codex must follow these rules during implementation.

1. Inspect before editing.
2. Make small, reviewable changes.
3. Do not rewrite the whole project unless necessary.
4. Do not remove working code without documenting why.
5. Do not silently change requirements.
6. Prefer deterministic logic over unnecessary AI calls.
7. Do not train an ML model.
8. Do not trust AI self-confidence as the final confidence score.
9. Do not execute model-generated code.
10. Do not store secrets in client-side files.
11. Do not collect passwords, payment values or complete browsing history.
12. Keep every webpage adaptation reversible.
13. Use semantic HTML in the extension UI.
14. Preserve valid developer-provided accessibility information.
15. Do not hide or deprioritize protected content.
16. Add tests with every core rule.
17. Update status documents after each phase.
18. Stop and document a blocker rather than inventing an unsafe workaround.
19. When repository behavior conflicts with this guide, document the conflict before changing it.
20. Prioritize a working end-to-end prototype over incomplete breadth.

---

## 22. Required Progress Reporting

After each implementation session, update `docs/implementation-status.md` using this format:

```markdown
## Date

### Completed
- ...

### Changed files
- ...

### Tests run
- Command:
- Result:

### Current feature status
| Feature | Status | Notes |
|---|---|---|
| DOM scanner | PARTIAL | ... |

### Known issues
- ...

### Next recommended task
- ...
```

Also keep `docs/implementation-plan.md` synchronized with actual progress.

---

## 23. Initial Codex Task

Start with this exact task:

```text
Audit this repository against CODEX_IMPLEMENTATION_README.md.

1. Show the current directory structure.
2. Identify the extension, backend, database, tests and configuration.
3. Determine which requirements are already implemented, partially implemented or missing.
4. Run the existing install, lint, test and build commands where available.
5. Do not implement features yet unless a small fix is required to make the repository inspectable.
6. Create docs/implementation-status.md.
7. Create docs/implementation-plan.md with phased tasks mapped to the existing codebase.
8. Report blockers, missing environment variables and architectural conflicts.
```

After reviewing the audit, continue with **Phase 1 — Extension foundation**.
