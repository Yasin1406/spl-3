import assert from "node:assert/strict";
import test from "node:test";
import { validatePageSummaryRequest, validateSummaryResult } from "../src/validators/pageSummary.js";
import { createProviderPageSummaryService } from "../src/services/providerPageSummary.js";
import { createApp } from "../src/app.js";

const context = () => ({ scope: "page", detail: "standard", purpose: "article", title: "Community report",
  privateContext: false, allowPrivateContent: false, coverage: { complete: true, limitations: [] },
  regions: [{ id: "region-1", type: "article", name: "Report", blocks: [{ id: "source-1", type: "text", text: "500 people attended the meeting." }], controls: [], notices: [] }] });
const providers = ["groq", "mistral", "cerebras"].map(name => ({ name, endpoint: `https://${name}.test`, model: "test-model", apiKey: "secret" }));
const response = input => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary_bn: "সভায় ৫০০ জন উপস্থিত ছিলেন।", source_ids: input.source_ids || input.region.blocks.map(block => block.id) }) } }] }) });

test("summary validation strips HTML/redacts text and discards unapproved properties and field values", () => {
  const input = context();
  input.rawHtml = "<html>secret</html>";
  input.regions[0].blocks[0].text = "<strong>Contact</strong> person@example.com password=hidden";
  input.regions[0].controls = [{ id: "control-1", type: "field", name: "Email", value: "private", constraints: { minlength: "8", value: "private" } }];
  const result = validatePageSummaryRequest(input);
  assert.doesNotMatch(JSON.stringify(result), /example.com|hidden|<strong>|rawHtml|"private"/);
  assert.deepEqual(result.regions[0].controls[0].constraints, { minlength: "8" });
  assert.equal(result.regions[0].controls[0].value, undefined);
});

test("summary validator rejects private requests without permission, duplicate sources and excessive context", () => {
  const input = context();
  input.privateContext = true;
  assert.throws(() => validatePageSummaryRequest(input), /PRIVATE_SUMMARY_NOT_ALLOWED/);
  input.allowPrivateContent = true;
  assert.equal(validatePageSummaryRequest(input).privateContext, true);
  input.regions[0].blocks.push({ ...input.regions[0].blocks[0] });
  assert.throws(() => validatePageSummaryRequest(input), /INVALID_SUMMARY_ID/);
  input.regions[0].blocks = [{ id: "source-1", type: "text", text: "x".repeat(1201) }];
  assert.throws(() => validatePageSummaryRequest(input), /INVALID_SUMMARY_TEXT/);
});

test("generated summaries require Bangla, complete source references and supported numbers", () => {
  const blocks = context().regions[0].blocks;
  assert.equal(validateSummaryResult({ summary_bn: "৫০০ জন উপস্থিত ছিলেন।", source_ids: ["source-1"] }, blocks).source_ids.length, 1);
  assert.equal(validateSummaryResult({ summary_bn: "৮ অক্টোবর ২০২৬ তারিখে ৫০,০০০ টাকা।", source_ids: ["source-1"] },
    [{ id: "source-1", text: "Date: 2026-10-08. Amount: 50000." }]).source_ids.length, 1);
  for (const invalid of [
    { summary_bn: "English only", source_ids: ["source-1"] },
    { summary_bn: "৫০০ জন।", source_ids: ["source-99"] },
    { summary_bn: "৫০০ জন।", source_ids: [] },
    { summary_bn: "৬০০ জন উপস্থিত ছিলেন।", source_ids: ["source-1"] },
    { summary_bn: "<script>বাংলা</script>", source_ids: ["source-1"] }
  ]) assert.throws(() => validateSummaryResult(invalid, blocks), /SUMMARY/);
});

test("summary providers use ordered failover after invalid output and log no page or response text", async () => {
  const calls = [], logs = [];
  const summarize = createProviderPageSummaryService({ providers, logger: { info: value => logs.push(value), warn: value => logs.push(value) },
    fetchImpl: async (url, options) => {
      calls.push(url);
      const input = JSON.parse(JSON.parse(options.body).messages[1].content);
      if (url.includes("groq")) return { ok: true, json: async () => ({ choices: [{ message: { content: 'invalid "private text" secret' } }] }) };
      return response(input);
    } });
  const result = await summarize(validatePageSummaryRequest(context()));
  assert.equal(result.provider, "mistral");
  assert.deepEqual(result.failedProviders, ["groq"]);
  assert.deepEqual(calls, ["https://groq.test", "https://mistral.test"]);
  assert.doesNotMatch(logs.join(" "), /private|secret|Community|people|৫০০/);
});

test("long regions cover every source chunk and combine partial summaries", async () => {
  const input = context();
  input.regions[0].blocks = Array.from({ length: 24 }, (_, index) => ({ id: `source-${index + 1}`, type: "text", text: `500 people attended. ${"Details of the community meeting. ".repeat(28)}` }));
  const calls = [];
  const summarize = createProviderPageSummaryService({ providers, logger: {}, fetchImpl: async (_url, options) => {
    const body = JSON.parse(JSON.parse(options.body).messages[1].content); calls.push(body); return response(body);
  } });
  const result = await summarize(validatePageSummaryRequest(input));
  assert.ok(calls.filter(call => call.stage === "summarize").length > 1);
  assert.equal(calls.at(-1).stage, "combine");
  assert.equal(result.sections[0].source_ids.length, 24);
  assert.equal(calls.filter(call => call.stage === "summarize").flatMap(call => call.region.blocks).length, 24);
  assert.ok(calls.filter(call => call.stage === "summarize").every(call => call.region.blocks.reduce((n, block) => n + block.text.length, 0) <= 10000));
});

test("summary cancellation stops provider failover", async () => {
  const controller = new AbortController();
  let calls = 0;
  const summarize = createProviderPageSummaryService({ providers, logger: {}, fetchImpl: async () => { calls++; controller.abort(); throw new Error("Cancelled"); } });
  await assert.rejects(() => summarize(validatePageSummaryRequest(context()), { signal: controller.signal }), /SUMMARY_CANCELLED/);
  assert.equal(calls, 1);
});

test("nested main-content regions share one request and coherent gist rather than separate heading summaries", async () => {
  const input = context();
  input.regions.push({ id: "region-2", type: "section", name: "Follow-up", blocks: [{ id: "source-2", type: "text", text: "500 people agreed to meet again." }], controls: [], notices: [] });
  const calls = [];
  const summarize = createProviderPageSummaryService({ providers, logger: {}, fetchImpl: async (_url, options) => {
    const body = JSON.parse(JSON.parse(options.body).messages[1].content); calls.push(body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary_bn: "সভায় ৫০০ জন অংশ নেন এবং আবার দেখা করার সিদ্ধান্ত হয়।", source_ids: body.region.blocks.map(block => block.id) }) } }] }) };
  } });
  const result = await summarize(validatePageSummaryRequest(input));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stage, "summarize");
  assert.deepEqual(calls[0].region.blocks.map(block => block.id), ["source-1", "source-2"]);
  assert.equal(result.sections.length, 2);
  assert.equal(result.summary_bn, "সভায় ৫০০ জন অংশ নেন এবং আবার দেখা করার সিদ্ধান্ত হয়।");
});

test("page-summary endpoint validates and returns a dedicated summary response", async t => {
  const app = createApp({ translateBatch: async () => [], summarizePage: async input => ({ summary_bn: "সভার সারাংশ।", sections: [{ region_id: input.regions[0].id, summary_bn: "সভার সারাংশ।", source_ids: ["source-1"] }] }) });
  const server = app.listen(0, "127.0.0.1"); t.after(() => server.close());
  await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/assist/page-summary`;
  const valid = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context()) });
  assert.equal(valid.status, 200); assert.equal((await valid.json()).summary_bn, "সভার সারাংশ।");
  const invalid = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...context(), privateContext: true }) });
  assert.equal(invalid.status, 400);
});
