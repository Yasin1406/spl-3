# AI-Driven Bangla Web Accessibility Assistant

This repository contains the architecture skeleton for a final-year software engineering project:

**An AI-Driven Bangla Web Accessibility Assistant for Visually Impaired Users**

The project is planned as a Chrome extension with a backend service. The final system will support Bangla accessibility labels, semantic repair, keyboard navigation support, form assistance, visual content description, user context collection, and AI-assisted page understanding.

## Architectural Idea

```text
Chrome Extension
-> DOM and Accessibility Context Collection
-> Backend API
-> Rule Engine
-> Context Engine
-> AI Orchestration Layer
-> Bangla Accessibility Response
-> Extension Accessibility Injection
```

## Important Design Direction

The system should not behave like a basic AI chatbot. It should use:

- Accessibility rules.
- Bangla localization rules.
- User context.
- AI only where contextual generation is needed.
- Validation before applying accessibility changes.

## Repository Structure

```text
extension/      Chrome extension skeleton
backend/        Backend API and service skeleton
ai/             Prompt, schema, and Bangla terminology assets
database/       Database schema and migrations
docs/           Project documentation and diagrams
tests/          Future test cases and evaluation assets
```

Current assistance includes reversible keyboard repair for high-confidence pseudo-buttons, configurable concise/balanced/detailed Bangla translation, and explicit image OCR/description commands. Focus or hover an image and press `Alt+Shift+O` for OCR or `Alt+Shift+D` for a visual description. An image is sent to the configured vision provider only after that action.
