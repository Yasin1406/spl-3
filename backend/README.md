# Backend

Local Node/Express service for provider-backed accessibility assistance. Groq, Mistral, and Cerebras API keys remain here and are never bundled with the Chrome extension.

## Hybrid translation flow

1. The extension tries exact phrases, known patterns, and fully covered short labels locally.
2. Unresolved English text is sent to this backend in a bounded batch.
3. The backend validates and sanitizes the batch.
4. Configured AI providers are tried in `AI_PROVIDER_ORDER`.
5. Authorization, quota, timeout, service, malformed JSON, incomplete output, and non-Bangla failures trigger the next provider.
6. The first valid result is returned with provider/model metadata and applied temporarily by the extension.
7. If every provider fails, the original text remains usable.

## Setup

```powershell
cd D:\spl-3\backend
Copy-Item ..\.env.example .env
npm.cmd install
```

Edit `backend/.env`. You may configure one, two, or all three keys:

```text
AI_PROVIDER_ORDER=groq,mistral,cerebras

GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.1-8b-instant

MISTRAL_API_KEY=your_mistral_key
MISTRAL_MODEL=mistral-small-latest

CEREBRAS_API_KEY=your_cerebras_key
CEREBRAS_MODEL=llama3.1-8b

PORT=3000
ALLOWED_EXTENSION_ORIGIN=*
```

Change `AI_PROVIDER_ORDER` to change priority, for example:

```text
AI_PROVIDER_ORDER=cerebras,groq,mistral
```

Providers without a key are skipped. Do not commit `backend/.env`.

Run the service:

```powershell
npm.cmd start
```

Startup displays the active order without displaying any key:

```text
Bangla accessibility backend listening on http://127.0.0.1:3000; providers: groq -> mistral -> cerebras
```

Verify it at `http://127.0.0.1:3000/health`.

## Test a real translation

```powershell
$body = @{
  items = @(
    @{ id = "test-1"; text = "Review your account before continuing."; context = "page instruction" }
  )
} | ConvertTo-Json -Depth 4

Invoke-RestMethod `
  -Uri "http://127.0.0.1:3000/api/v1/assist/translation" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

The response includes `provider`, `model`, `failedProviders`, and `translations`. If all providers fail, the response is `ALL_TRANSLATION_PROVIDERS_FAILED` with provider names but no keys or provider response bodies.

The backend terminal logs both failures and successful provider calls. Successful entries contain only provider metadata, never source text, translated text, request bodies, or keys:

```text
Translation provider groq failed: HTTP_429
Translation provider mistral succeeded: model=mistral-small-latest items=1 durationMs=418 failedBefore=groq
```

## Automated verification

```powershell
npm.cmd run check
npm.cmd test
```

The translation endpoint accepts at most 20 items and 500 characters per item. It does not accept page HTML or form values.

Translation requests may include `verbosity` as `concise`, `balanced`, or `detailed`. Image assistance uses `POST /api/v1/assist/image-analysis`; only providers with a configured `GROQ_VISION_MODEL`, `MISTRAL_VISION_MODEL`, or `CEREBRAS_VISION_MODEL` are tried. The configured model must support image input.
