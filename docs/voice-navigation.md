# Bangla voice navigation

This slice implements the user's 2026-10-08 plan: transcribe a short command, send the transcript
and the displayed **গন্তব্য** list to Gemini, then directly focus a validated matching destination.
No additional confirmation or strict exact-label matching is required. A no-match result keeps the
navigator open. This is navigation within the current page; it does not click links, submit forms,
fill fields, open URLs, or execute model-generated actions. Description voice intents remain deferred.

## Setup and use

1. In `backend/.env`, set `GEMINI_API_KEY` to your Google AI Studio key. Gemini is required for resolution.
2. Optionally add `SPEECHMATICS_API_KEY` and `SARVAM_API_KEY` for transcription fallback.
3. Set `VOICE_STT_PROVIDER_ORDER=gemini,speechmatics,sarvam`. Change this order to test a preferred service;
   unconfigured providers are skipped. Translation still uses its existing Groq/Mistral/Cerebras policy.
4. `GEMINI_STT_MODEL` defaults to `gemini-3.8-flash` and `GEMINI_VOICE_RESOLVER_MODEL` to `gemini-3.1-flash-lite`. Both can be changed
   to an audio/structured-output-capable model available to your account. `SARVAM_STT_MODEL` defaults to `saaras:v3`.
5. Restart the backend using `npm.cmd start` from `backend`. Reload the unpacked `extension/dist`
   extension in Chrome, then refresh the webpage. Chrome 116 or later is required.
6. Press **Alt+Shift+Z**, then **Alt+Shift+V** to focus **কথা বলা শুরু করুন**. Press **Enter** to start recording.
   The shortcut works only inside navigation and moves focus without recording. Clicking the button also starts recording.
7. On first use, microphone denial opens an extension setup tab. Activate its permission button,
   grant access, return to the original page, and start again. Windows microphone privacy settings
   must also permit Chrome to access the microphone.
8. Speak after the tone: “সার্চে যান”, “পার্সোনাল টুলসে যান”, or “ছয় নম্বর গন্তব্যে যান”. Numbers correspond
   to the numbered, currently filtered destination list. Destination names alone can also be resolved.
9. While recording, focus remains on **রেকর্ডিং শেষ করুন**. Press **Enter** or click that button to finish and send for transcription,
   or wait for the ten-second limit. Alt+Shift+V returns focus to this button if you moved away. Focus remains there during processing.
   Startup and processing use Bangla progress labels without disabling the focused button; repeated activation is ignored internally.
10. A matching verdict closes navigation and invokes the existing safe focus handler. No match or service
    failure stays in the dialog and offers retry/manual selection. Escape cancels voice first; a second Escape closes navigation.

## Data and execution contract

- Capture starts only after explicit button activation with Enter or a click. Opening Alt+Shift+Z or focusing with Alt+Shift+V never records.
- An extension-origin offscreen document owns microphone capture, with echo cancellation and noise suppression
  requested from the browser. Microphone setup grants permission and immediately releases its stream; it uploads nothing.
- Capture releases every media track on stop/cancel/error and converts to bounded mono 16 kHz, 16-bit PCM WAV.
  The ready tone and visible recording status do not establish that NVDA is silent; headphones are recommended for testing.
- The backend accepts only canonical WAV of 0.2–10 seconds, at most 200 destination labels, and bounded context.
  A simple near-silence energy check rejects empty capture; it is not a speech or speaker classifier.
- Audio is sent to one configured STT provider at a time, in order. HTTP/format/timeout failures advance to the
  next provider. Valid empty text does not advance; recognition quality is not guessed from model confidence.
- Every intelligible positive transcript is sent with that recording's displayed destination IDs, labels and
  one-based numbers to Gemini. The resolver tolerates spelling, phonetic and transliteration errors and can return no match.
  Prompt v2 accepts short type labels and distinctive title fragments for every destination category; users need not
  speak a whole title or a navigation verb. Punctuation and Bangla number words are handled as speech variations.
  For a broad type request with several candidates, it selects the first matching displayed destination.
  Explicit destination ordinals use list numbers; “শিরোনাম এক” refers to a heading labelled level 1, not list entry 1.
  Absent types/numbers, unrelated requests, conflicting instructions and equally plausible partial names return no_match.
  Its versioned prompt treats all labels/transcript as untrusted data. It refuses negated, unrelated or ambiguous commands.
  A local negation/cancellation guard also prevents common negative requests from reaching resolution.
- Only `{result:"match",destination_id:"supplied ID"}` or `{result:"no_match",destination_id:null}` is accepted.
  Backend, worker and content code validate IDs. No confidence threshold, generated selectors or code is used.
- Background page mutations are deferred during recording and resolution: the displayed list and destination identities remain
  fixed for that request. Pending updates resume when voice becomes idle. Unchanged lists retain their option nodes and selection.
  Explicit category changes, manual selection, dialog closure, page navigation, tab removal and assistant disablement cancel/invalidate
  the request. A matched target is checked again for visibility and availability before focus; removed targets cannot be focused.
- Focused destinations receive a visible outline that is restored on blur or assistant cleanup. Enter retains native behavior for links
  and controls; headings and regions remain reading destinations and do not acquire invented click actions.
- Only inventory labels, ordinals and opaque IDs accompany audio. No HTML, form values or browsing history is added.
  Labels and recordings can themselves contain private information; microphone setup explains external transmission.
  At the user's explicit request, the backend terminal prints the transcript and its STT provider,
  including empty/negative transcripts; control characters are escaped. Silence is reported separately.
  Resolver diagnostics also show the model, matched ID/no_match, and sanitized HTTP failure/timeout/quota reason.
  The terminal prints the returned verdict before validation, the matched destination label, malformed output
  (bounded to 4096 characters), and the reason when resolution is skipped for silence/empty/negative commands.
  No application audio storage or transcript cache is added. Provider retention policies still apply.
- Speechmatics batch jobs are deleted on a best-effort basis after completion/cancellation; remote deletion is not guaranteed.
  The local backend limits voice requests to 20/minute and two concurrent jobs.

## Acceptance checklist (manual)

- Test first-use permission, denial, permission retry, unavailable microphone and Windows permission disablement.
- Check physical Alt+Shift+V with English/Bangla layouts and NVDA, including modifier/repeat exclusions and webpage conflicts.
- Compare ten individual commands with quiet audio, fan noise, mixed Bangla/English labels, two speakers and NVDA on.
- Verify fuzzy match directly focuses the intended region; verify silence, unrelated speech, negation and duplicate-label ambiguity do not navigate.
- Test manual stop, automatic ten-second stop, Escape during acquisition/capture/request, close, reload and disablement.
  Check Chrome's microphone indicator turns off after capture or cancellation.
- Change background destination labels/add destinations during processing; the existing request must continue against its snapshot.
  After no-match/cancellation, pending list changes must appear. Remove the matched target before resolution and verify no navigation.
  Change the category or selected destination during processing; a late result must not navigate.
- With NVDA, verify Alt+Shift+V focuses the start button, Enter starts recording and focuses the stop button, and Enter stops recording.
  Verify the destination outline appears, disappears on blur, and Enter still activates native controls.
- Test missing Gemini key, quota/HTTP failures, STT fallback and resolver failure. Existing keyboard navigation must remain usable.
- Record real recognition accuracy, latency and any wrong destination matches before marking FR-13 complete.

## Live resolver evaluation

Run `node --env-file=.env scripts/evaluate-voice-resolver.js` from `backend` to test short commands across all
destination types and explicit no-match examples. This makes live Gemini calls using synthetic labels/transcripts
from `backend/tests/fixtures/voiceResolverCases.json`; it does not record or upload audio and is not part of `npm test`.

## Provider references

- [Gemini audio input](https://ai.google.dev/gemini-api/docs/audio)
- [Gemini generateContent API](https://ai.google.dev/api/generate-content)
- [Speechmatics batch jobs](https://docs.speechmatics.com/api-ref/batch/create-a-new-job)
- [Sarvam transcription](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe)
- [Chrome offscreen capture](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
