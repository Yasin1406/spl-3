import { readFileSync } from "node:fs";
import { providerRequestOptions } from "./providerPolicy.js";
import { validateSummaryResult } from "../validators/pageSummary.js";

const PROMPT_VERSION = "page-summary-v1";
const PROMPT = readFileSync(new URL("../../../ai/prompts/page-summary-v1.txt", import.meta.url), "utf8");

export function createProviderPageSummaryService({ providers, fetchImpl = fetch, timeoutMs = 15000, logger = console }) {
  return async function summarize(context, { signal } = {}) {
    const overall = AbortSignal.any([AbortSignal.timeout(150000), ...(signal ? [signal] : [])]);
    const blocks = context.regions.flatMap(region => region.blocks);
    const controls = context.regions.flatMap(region => region.controls);
    const notices = context.regions.flatMap(region => region.notices);
    const sections = context.regions.filter(region => region.blocks.length).map(region => ({ region_id: region.id, source_ids: region.blocks.map(block => block.id) }));
    let metadata = { provider: null, model: null, failedProviders: [] };
    // Nested semantic regions are one reading task. Chunk by content size, never
    // by every heading/table/section (which creates tiny, contextless summaries).
    const chunks = [];
    let current = [], size = 0;
    for (const block of blocks) {
      if (current.length && size + block.text.length > 10000) { chunks.push(current); current = []; size = 0; }
      current.push(block); size += block.text.length;
    }
    if (current.length) chunks.push(current);
    const partials = [];
    const extra = [context.title, ...context.regions.map(region => region.name), ...controls.flatMap(control => [control.name, ...Object.values(control.constraints || {})])].join(" ");
    for (const chunk of chunks) {
      const result = await request({ stage: "summarize", scope: context.scope, purpose: context.purpose, detail: context.detail,
        title: context.title, region: { ...context.regions[0], blocks: chunk, controls, notices: notices.filter(id => chunk.some(block => block.id === id)) }, coverage: context.coverage }, chunk, extra, overall);
      partials.push(result.output);
      metadata = result.metadata;
    }
    let summary = partials[0]?.summary_bn || "";
    if (partials.length > 1) {
      const combined = await request({ stage: "combine", scope: context.scope, purpose: context.purpose, detail: context.detail,
        title: context.title, partials, source_ids: blocks.map(block => block.id), coverage: context.coverage }, blocks, extra, overall);
      summary = combined.output.summary_bn; metadata = combined.metadata;
    }
    return { summary_bn: summary, sections, ...metadata,
      prompt_version: PROMPT_VERSION, coverage: context.coverage };
  };

  async function request(input, blocks, extra, signal) {
    const failures = [];
    for (const provider of providers) {
      if (signal.aborted) throw aborted();
      try {
        const response = await fetchImpl(provider.endpoint, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
          body: JSON.stringify({ model: provider.model,
            messages: [{ role: "system", content: PROMPT }, { role: "user", content: JSON.stringify(input) }],
            response_format: { type: "json_object" }, temperature: 0.1,
            max_tokens: Math.min(8192, (input.detail === "brief" ? 1800 : input.detail === "detailed" ? 5000 : 3200) + blocks.length * 20),
            stream: false, ...providerRequestOptions(provider) })
        });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const result = await response.json();
        const raw = result?.choices?.[0]?.message?.content;
        const output = validateSummaryResult(JSON.parse(raw), blocks, extra);
        logger.info?.(`Summary provider ${provider.name} succeeded: model=${provider.model} blocks=${blocks.length} prompt=${PROMPT_VERSION}`);
        return { output, metadata: { provider: provider.name, model: provider.model, failedProviders: failures.map(attempt => attempt.provider) } };
      } catch (error) {
        if (signal.aborted) throw aborted();
        const reason = error?.name === "TimeoutError" || error?.name === "AbortError" ? "TIMEOUT" : error instanceof SyntaxError ? "INVALID_JSON" :
          /^[A-Z][A-Z0-9_]{0,70}$/.test(error.code || error.message || "") ? error.code || error.message : "PROVIDER_ERROR";
        failures.push({ provider: provider.name, reason });
        // Logs deliberately contain no page text, response text, request bodies or keys.
        logger.warn?.(`Summary provider ${provider.name} failed: ${reason}`);
      }
    }
    const error = new Error("ALL_SUMMARY_PROVIDERS_FAILED"); error.code = error.message; error.status = 503; error.attempts = failures; throw error;
  }
}

function aborted() { const error = new Error("SUMMARY_CANCELLED"); error.code = error.message; error.status = 499; return error; }
