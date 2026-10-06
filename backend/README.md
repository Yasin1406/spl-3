# Backend

Local Node/Express service for provider-backed accessibility assistance. Groq, Mistral, and Cerebras API keys remain here and are never bundled with the Chrome extension.

## Hybrid translation flow

1. The extension tries exact phrases, known patterns, and fully covered short labels locally.
2. Unresolved English text is sent to this backend in a bounded batch.
3. The backend validates and sanitizes the batch.
4. Every uncached batch starts with the first configured provider in `AI_PROVIDER_ORDER`: Groq first, Mistral only if Groq fails, Cerebras only if both fail.
5. Authorization, quota, timeout, service, malformed JSON, incomplete output, and non-Bangla failures trigger the next provider.
6. The first valid result is returned with provider/model metadata and applied temporarily by the extension. Each provider is tried at most once per request. Concurrent requests independently use the same fixed order.
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
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_VISION_MODEL=qwen/qwen3.8-27b

MISTRAL_API_KEY=your_mistral_key
MISTRAL_MODEL=mistral-small-2603
MISTRAL_VISION_MODEL=mistral-small-2603

CEREBRAS_API_KEY=your_cerebras_key
CEREBRAS_MODEL=gpt-oss-120b
CEREBRAS_VISION_MODEL=

PORT=3000
ALLOWED_EXTENSION_ORIGIN=*
```

Change `AI_PROVIDER_ORDER` to change the fallback priority, for example:

```text
AI_PROVIDER_ORDER=cerebras,groq,mistral
```

Providers without a key are skipped. Image requests also skip providers without a configured vision model. A successful Groq request does not call Mistral or Cerebras. Each new request starts at the first configured provider again, including after a previous failure. Extension cache hits do not call any provider. Do not commit `backend/.env`.

The start command reads `backend/.env` when launched from `backend/`; a root `.env` is not loaded by that command. After editing models, stop the backend with Ctrl+C and run `npm.cmd start` again. Preserve your keys instead of copying `.env.example` over an existing `.env`.

Run the service:

```powershell
npm.cmd start
```

Startup displays the active order without displaying any key:

```text
Bangla accessibility backend listening on http://127.0.0.1:3000; scheduling: ordered failover; providers: groq (qwen/qwen3.8-27b) -> mistral (mistral-small-2603) -> cerebras (gpt-oss-120b); vision: groq (qwen/qwen3.8-27b) -> mistral (mistral-small-2603)
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
Translation provider groq failed: HTTP_429 model=qwen/qwen3.8-27b
Translation provider mistral succeeded: model=mistral-small-2603 items=1 durationMs=418 failedBefore=groq
```

## Automated verification

```powershell
npm.cmd run check
npm.cmd test
```

The translation endpoint accepts at most 20 items and 500 characters per item. It does not accept page HTML or form values.

Translation requests may include `verbosity` as `concise`, `balanced`, or `detailed`. Image assistance uses `POST /api/v1/assist/image-analysis`; only providers with a configured `GROQ_VISION_MODEL`, `MISTRAL_VISION_MODEL`, or `CEREBRAS_VISION_MODEL` are tried. The configured model must support image input.

## Model choices checked on 2026-10-06

- Groq: `qwen/qwen3.8-27b` for multilingual text and vision, with reasoning disabled. This is a preview model; the production text-only alternative is `openai/gpt-oss-20b`. The documented free limits for either are 30 requests/minute, 1,000/day, 8,000 tokens/minute, and 200,000/day; account-specific limits may differ. The old Llama 3.1 8B model stopped serving free/developer accounts on August 16, 2026; Qwen 3.6 stopped on September 14. Sources: [deprecations](https://console.groq.com/docs/deprecations), [Qwen model](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [free limits](https://console.groq.com/docs/rate-limits).
- Mistral: pinned `mistral-small-2603` (Small 4) for text and vision, with reasoning disabled. At $0.15 input / $0.60 output per million tokens, it suits frequent translation requests. The Pro plan does not imply unlimited API calls; check the API credits and billing linked to your key in Studio. Medium 3.5 costs $1.50 input / $7.50 output and is not the budget default for this workflow. Sources: [Small 4](https://docs.mistral.ai/models/mistral-small-4-0-26-03), [model pricing](https://docs.mistral.ai/inference/pricing), [Pro plan](https://mistral.ai/pricing/).
- Cerebras: `gpt-oss-120b` for economical text requests with low reasoning ($0.35 input / $0.75 output per million tokens). `qwen-3.8-27b` is a current text/vision alternative ($0.99 input / $1.49 output); the adapter disables its reasoning. Leave `CEREBRAS_VISION_MODEL` blank to preserve your small balance or set it to `qwen-3.8-27b` to enable Cerebras image fallback. A promotional $5 credit expires 30 days after activation; purchased credits have their own terms. Sources: [catalog](https://inference-docs.cerebras.ai/models/overview), [public capabilities](https://api.cerebras.ai/public/v1/models), [pricing/credit terms](https://www.cerebras.ai/pricing).

These are choices based on documented capabilities, cost, and latency rather than a measured Bangla quality comparison. Validate representative Bangla output before treating any model as the highest-quality option. One batch stops at the first validated success; failures can spend tokens on additional providers. Rate-limit failures retain the existing safe failover behavior.
