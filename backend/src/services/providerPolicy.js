// Keep short accessibility tasks out of expensive/default reasoning modes.
// Only send model-specific parameters where the host documents support.
export function providerRequestOptions({ name, model }) {
  if ((name === "groq" && model === "qwen/qwen3.8-27b") ||
      (name === "cerebras" && model === "qwen-3.8-27b") ||
      (name === "mistral" && ["mistral-small-2603", "mistral-small-latest"].includes(model))) {
    return { reasoning_effort: "none" };
  }
  if ((name === "groq" && ["openai/gpt-oss-20b", "openai/gpt-oss-120b"].includes(model)) ||
      (name === "cerebras" && model === "gpt-oss-120b")) {
    return { reasoning_effort: "low" };
  }
  return {};
}
