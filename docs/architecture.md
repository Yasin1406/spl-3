# Architecture Skeleton

```text
Chrome Extension
  - Popup UI
  - Content script
  - Background service worker
  - Local/session storage

Backend API
  - Controllers
  - Routes
  - Services
  - Rule engine
  - Context engine
  - Data models

AI Layer
  - Prompt templates
  - Bangla terminology
  - Input/output schemas

Database
  - User profile
  - Preferences
  - Interaction context
  - Accessibility fixes
```

## Main Flow

```text
Webpage
-> Extension extracts DOM/accessibility context
-> Backend receives page snapshot and user context
-> Rule engine detects accessibility issues
-> Context engine enriches decision-making
-> AI layer generates Bangla assistance only when needed
-> Validation layer checks output
-> Extension applies accessibility enhancements
```
