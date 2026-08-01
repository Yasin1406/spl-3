import { createApp } from "./app.js";
import { createProviderTranslationService, providersFromEnvironment } from "./services/providerTranslation.js";

const providers = providersFromEnvironment(process.env);
if (providers.length === 0) {
  console.error("At least one of GROQ_API_KEY, MISTRAL_API_KEY, or CEREBRAS_API_KEY is required.");
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
const translateBatch = createProviderTranslationService({ providers });
const app = createApp({
  translateBatch,
  allowedOrigin: process.env.ALLOWED_EXTENSION_ORIGIN || "*"
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Bangla accessibility backend listening on http://127.0.0.1:${port}; providers: ${providers.map((provider) => provider.name).join(" -> ")}`);
});
