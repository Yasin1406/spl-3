# Bangla Web Accessibility Assistant

A Chrome extension that helps Bangla-speaking users, especially visually impaired users, read and navigate webpages. It combines local accessibility rules with AI-assisted translation, summaries, image interpretation, and voice navigation.

Developed as a final-year software engineering project: **An AI-Driven Bangla Web Accessibility Assistant for Visually Impaired Users**.

This repository contains a working prototype, a local Node.js/Express backend, automated tests, and manual accessibility fixtures. Browser, screen-reader, and real-site acceptance testing remains necessary; implemented features do not establish accessibility compliance.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Usage and shortcuts](#usage-and-shortcuts)
- [Configuration](#configuration)
- [Optional accounts](#optional-accounts)
- [API](#api)
- [Development and testing](#development-and-testing)
- [Privacy and limitations](#privacy-and-limitations)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Documentation](#documentation)

## Features

| Feature | Current behavior |
| --- | --- |
| Accessibility assistance | Scans controls, forms, images, headings, landmarks, and live regions; applies selected label and keyboard repairs and handles dynamic DOM changes. |
| Keyboard reading and navigation | Makes headings and article reading blocks reachable, provides a page destination navigator and skip links, and manages focus. |
| Bangla form guidance | Explains supported native validation errors without reading entered field values. |
| English-to-Bangla translation | Uses local phrases and patterns first, then an optional backend fallback for unresolved text. Supports concise, balanced, and detailed output. |
| Page and region summaries | Provides a local overview and, on request, AI-generated Bangla summaries of bounded page or focused-region content. |
| Image descriptions and OCR | Describes a focused/hovered image or reads its text after an explicit request. Requires a configured vision model. |
| Voice navigation | Records a short command, transcribes it, and resolves it to a displayed destination in the current page navigator. |
| Navigation prioritization | Optionally places detected repetitive or promotional destinations later in the list, with protection rules for important content. |
| Preferences and accounts | Stores guest preferences locally; optionally supports Supabase email/password accounts, signup/recovery OTP, and preference sync. |
| Reversible changes | Tracks temporary adaptations and restores original content or attributes when the relevant feature is disabled. |

## Architecture

```text
Webpage DOM and user actions
          |
          v
Chrome extension (Manifest V3)
  Scan -> local rules -> reversible accessibility changes
          |
          | bounded requests via background service worker
          v
Local Express backend (127.0.0.1:3000)
  Validate input -> provider orchestration -> validate output
          |
          v
Bangla assistance returned to the extension

Optional: extension <-> Supabase Auth and preference storage
```

Translation, summaries, and image analysis use configured Groq, Mistral, and Cerebras providers in order. Missing keys are skipped; image analysis also skips providers without a vision model. The first validated success stops the fallback chain.

Voice uses a separate transcription chain (Gemini, Speechmatics, Sarvam by default) and a Gemini destination resolver. Provider credentials stay in the backend.

## Requirements

- Node.js **24 or later** and npm for the commands below. The build uses Node's built-in environment parser, and the backend start script loads `.env` directly.
- Google Chrome **116 or later**, as specified by the extension manifest.
- At least one Groq, Mistral, or Cerebras API key to start the backend.
- A vision-capable model for image assistance; a Gemini API key and microphone permission for voice navigation.
- Optional: a Supabase project for accounts and preference sync, and NVDA on Windows for manual screen-reader testing.

Local accessibility rules, keyboard navigation, form guidance, and dictionary translation can run without the backend or an account. AI-backed features require network access to their configured services.

## Getting started

These commands use **PowerShell** from the repository root. On other shells, use the equivalent copy command and `npm` instead of `npm.cmd`. There is no root-level npm workspace; run package commands in `backend/` or `extension/`.

### 1. Configure and start the backend

For a new setup:

```powershell
Copy-Item .env.example backend/.env
Set-Location backend
npm.cmd ci
```

If `backend/.env` already exists, edit it rather than replacing it. Set at least one of `GROQ_API_KEY`, `MISTRAL_API_KEY`, or `CEREBRAS_API_KEY`. The template includes model settings and optional voice/account configuration.

Start the service from `backend/` and leave the terminal running:

```powershell
npm.cmd start
```

In another terminal, check the default service address:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

A healthy response contains `status: "ok"`. This checks the server, not provider credentials or model availability.

### 2. Build the extension

In a second terminal, from the repository root:

```powershell
Set-Location extension
npm.cmd ci
npm.cmd run build
```

The build writes the loadable extension to **`extension/dist`**. It also reads optional public Supabase configuration from `backend/.env`.

### 3. Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project's **`extension/dist`** folder.
4. Open or refresh a normal webpage, then open the extension popup.
5. Use the popup or extension **Options** page to configure assistance and translation.

For local HTML fixtures and images, enable **Allow access to file URLs** in the extension's Chrome **Details** page.

After extension source changes, rebuild, click **Reload** in `chrome://extensions`, and refresh the target webpage. Restart the backend after changes to its source or environment settings.

## Usage and shortcuts

The assistant is enabled by default; page translation is off by default. Enable translation explicitly in the popup or settings. Turning it off restores original text while other enabled assistance remains available.

Keep focus on the webpage when using these default shortcuts:

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+Z` | Open the page destination navigator. |
| `Alt+Shift+V` | Focus the voice recording button inside the navigator; this does not start recording. |
| `Alt+Shift+A` | Request a page summary. |
| `Alt+Shift+S` | Request a summary of the meaningful region containing the last focused page element. |
| `Alt+Shift+O` | Read text from the focused or hovered image using OCR. |
| `Alt+Shift+D` | Request a description of the focused or hovered image. |

Use Tab/Shift+Tab to move through controls and reading blocks. Escape closes dialogs or cancels an active voice operation. An explicitly focused image takes priority over a hovered image.

For voice navigation, open the navigator, focus the voice button, and press Enter or click to record. Speak a destination name or command, then activate the stop button or wait for the ten-second limit. A validated match moves focus to a displayed destination. Voice navigation does not activate links or submit forms. First use may open a microphone permission setup tab.

Customize shortcuts in **Settings** using `Alt+Shift+letter` or `Alt+Shift+digit`. Blank fields use defaults. Saving rejects duplicate effective bindings and Chrome's reserved `Alt+Shift+B`, `Alt+Shift+T`, and `Alt+Shift+I` combinations. OS, screen-reader, and website conflicts still need manual checking.

## Configuration

Backend configuration belongs in **`backend/.env`**, copied from [`.env.example`](.env.example).

| Variables | Purpose |
| --- | --- |
| `PORT` | Backend port; defaults to `3000`. |
| `ALLOWED_EXTENSION_ORIGIN` | Allowed CORS origin; the development template uses `*`. |
| `AI_PROVIDER_ORDER` | Ordered text/image fallback; defaults to `groq,mistral,cerebras`. |
| `GROQ_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY` | Backend-only credentials for assistance providers. |
| `GROQ_MODEL`, `MISTRAL_MODEL`, `CEREBRAS_MODEL` | Text model identifiers. |
| `GROQ_VISION_MODEL`, `MISTRAL_VISION_MODEL`, `CEREBRAS_VISION_MODEL` | Vision model identifiers; blank entries disable that provider for images. |
| `VOICE_STT_PROVIDER_ORDER` | Transcription fallback order. |
| `GEMINI_API_KEY`, `SPEECHMATICS_API_KEY`, `SARVAM_API_KEY` | Backend-only voice credentials; Gemini is required for destination resolution. |
| `GEMINI_STT_MODEL`, `GEMINI_VOICE_RESOLVER_MODEL`, `SARVAM_STT_MODEL` | Voice model identifiers. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Optional public account configuration included at extension build time. |

Model identifiers in the template are project defaults. Availability depends on your provider account; adjust them if a request reports an unavailable model.

The extension's backend URL defaults to `http://127.0.0.1:3000` and is configurable in Settings. If you change `PORT`, update that URL too. The backend binds to `127.0.0.1`.

## Optional accounts

Guest mode requires no Supabase setup. To enable accounts:

1. Set `SUPABASE_URL` and an `sb_publishable_...` key in `backend/.env`.
2. Run [migration 001](database/migrations/001_user_preferences.sql), then [migration 002](database/migrations/002_preference_columns.sql), in Supabase SQL Editor.
3. Configure email/password authentication, SMTP delivery, and signup/recovery email templates containing `{{ .Token }}`.
4. Rebuild and reload the extension, then open Settings to sign up or sign in.

Ordinary sign-in uses a password; signup and password recovery use email OTP. Signed-in preferences sync to the user's own database row under Row Level Security. Signing out restores guest preferences.

SMTP credentials belong in the Supabase dashboard. Provider keys and privileged Supabase keys must never be added to extension source or build output. See [account setup and testing](docs/accounts.md) for the full procedure.

## API

Default base URL: `http://127.0.0.1:3000`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Server health check. |
| POST | `/api/v1/assist/translation` | Bounded text-to-Bangla translation. |
| POST | `/api/v1/assist/image-analysis` | Explicit image OCR or description. |
| POST | `/api/v1/assist/page-summary` | Summary of sanitized page/region context. |
| POST | `/api/v1/assist/voice-navigation` | Audio transcription and destination resolution. |

Example translation request in PowerShell:

```powershell
$body = @{
    verbosity = "balanced"
    items = @(
        @{ id = "example-1"; text = "Review your account before continuing."; context = "page instruction" }
    )
} | ConvertTo-Json -Depth 4

Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/assist/translation" -Method Post -ContentType "application/json" -Body $body
```

Translation accepts at most 20 items and 500 characters per item. See the [backend guide](backend/README.md) and [request validators](backend/src/validators) for endpoint details and accepted payloads.

## Development and testing

Run syntax checks and automated tests separately in each package:

```powershell
# From the repository root
Set-Location backend
npm.cmd run check
npm.cmd test

Set-Location ../extension
npm.cmd run check
npm.cmd test
npm.cmd run build
```

The suites use Node's built-in test runner and cover local logic, request validation, provider fallback, cancellation, rollback, accounts, and Chrome integration. Browser tests use an installed Chrome executable and skip when it is unavailable. To select a different executable before running extension tests:

```powershell
$env:BAA_CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm.cmd test
```

Automated provider behavior is mocked; it does not establish live model quality. Live provider checks and NVDA acceptance are separate. Use the [HTML fixtures and manual checklists](tests/fixtures/README.md), [navigation acceptance guide](docs/navigation-acceptance.md), and [voice checklist](docs/voice-navigation.md).

Optional account configuration check, from `extension/`:

```powershell
npm.cmd run check:accounts
```

## Privacy and limitations

- Local rules run in the browser. With AI translation enabled, unresolved eligible text is sent to the backend and a configured provider when translation is active.
- Image bytes are sent only after an explicit OCR/description action. Summary generation and microphone capture also require explicit actions.
- Summary collection excludes entered form values, raw HTML, and hidden/editable content and redacts recognized sensitive patterns. Recognized private contexts require one-request permission before content is sent; these heuristics cannot detect all sensitive information.
- Guest preferences remain local. Signed-in preferences and authentication data use Supabase. Passwords are not saved in extension storage.
- Summary text is not persisted or logged by the application. Voice diagnostics do print transcripts and destination information in the backend terminal; recordings are not stored by the application. External provider retention policies apply.
- AI output and DOM heuristics can be wrong. Summaries have extraction limits; voice commands can return no match; poorly marked pages may need a smaller region or manual navigation.
- Chrome restricts extension injection on internal pages and certain protected pages. Automated tests cannot establish compatibility with every website, keyboard layout, or screen reader.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Backend exits immediately | Set at least one text-provider key in `backend/.env`; start from `backend/`. |
| AI assistance is unavailable | Check `/health`, the backend URL in Settings, credentials/model access, and backend diagnostics. Restart after environment changes. |
| New extension changes do not appear | Rebuild, reload `extension/dist` in Chrome, and refresh the webpage. |
| Local fixtures or images do not work | Enable **Allow access to file URLs** in the extension's Details page. |
| Image analysis fails | Configure a vision-capable model; source files above 32 MB and uploads above 4 MB are rejected. |
| Voice recording or matching fails | Check Chrome/Windows microphone permissions and the Gemini key; use the microphone setup tab if permission was denied. |
| Shortcuts do not respond | Focus the webpage, enable the assistant, check custom bindings and OS/NVDA conflicts; the voice shortcut requires an open navigator. |
| Account options are unavailable | Configure both public Supabase values, apply both migrations, rebuild, and reload. |
| Browser tests are skipped | Install Chrome or set `BAA_CHROME_PATH` to its executable. |

## Project structure

```text
.
|-- extension/               Chrome extension package
|   |-- public/              Manifest V3 source
|   |-- src/                 Content scripts, background worker, popup, settings, voice
|   |-- scripts/             Build and configuration/syntax checks
|   |-- tests/               Unit and Chrome integration tests
|   `-- dist/                Generated unpacked extension (ignored by Git)
|-- backend/                 Local Node.js/Express API
|   |-- src/                 Routes, provider services, and validators
|   |-- scripts/             Live voice resolver evaluation
|   `-- tests/               API and provider behavior tests
|-- ai/                      Versioned prompts and supporting AI asset folders
|-- database/migrations/     Supabase preference schema and RLS migrations
|-- docs/                    Architecture, setup, plans, and acceptance guides
|-- tests/fixtures/          HTML pages for manual accessibility evaluation
|-- .env.example             Configuration template
`-- spl-3_proposal.pdf       Project proposal
```

## Documentation

- [Extension behavior and build guide](extension/README.md)
- [Backend setup and provider behavior](backend/README.md)
- [Architecture](docs/architecture.md)
- [Implementation plan](docs/implementation-plan.md)
- [Implementation guide](docs/implementation-guide.md)
- [Implementation status and history](docs/implementation-status.md)
- [Accounts and preference sync](docs/accounts.md)
- [Voice navigation](docs/voice-navigation.md)
- [Navigation acceptance](docs/navigation-acceptance.md)
- [Evaluation plan](docs/evaluation-plan.md)
- [Manual test fixtures](tests/fixtures/README.md)

Some planning documents and older implementation-status entries describe earlier stages. Check the current source and focused feature guides when those notes differ.

## Contributing

Keep provider secrets backend-only, preserve native page behavior, and make temporary adaptations reversible. For behavior changes, run the relevant package checks/tests and record applicable Chrome/NVDA manual results. Edit `extension/src` or `extension/public`; rebuild generated files in `dist`.

## License

No license file is currently included in this repository.
