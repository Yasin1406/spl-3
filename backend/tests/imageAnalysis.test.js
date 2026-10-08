import assert from "node:assert/strict";
import test from "node:test";
import { createProviderImageAnalysisService } from "../src/services/providerImageAnalysis.js";
import { validateImageAnalysisRequest, validateImageAnalysisResult } from "../src/validators/imageAnalysis.js";
import { createApp } from "../src/app.js";

const image = { mode: "ocr", imageDataUrl: "data:image/png;base64,AAAA" };

test("image detail defaults to standard and accepts only supported sizes", () => {
  assert.equal(validateImageAnalysisRequest(image).detail, "standard");
  for (const detail of ["brief", "standard", "detailed"]) {
    assert.equal(validateImageAnalysisRequest({ ...image, detail }).detail, detail);
  }
  assert.throws(() => validateImageAnalysisRequest({ ...image, detail: "arbitrary prompt" }), /INVALID_IMAGE_ANALYSIS_DETAIL/);
});

test("OCR provider receives distinct size instructions and output budgets", async () => {
  const requests = [];
  const analyze = createProviderImageAnalysisService({
    providers: [{ name: "test", endpoint: "https://example.test", model: "vision", apiKey: "test" }],
    logger: { info() {}, warn() {} },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ text: "বাংলা ফলাফল" }) } }] }) };
    }
  });
  for (const detail of ["brief", "standard", "detailed"]) await analyze(validateImageAnalysisRequest({ ...image, detail }));
  const prompts = requests.map(request => request.messages[0].content[0].text);
  assert.match(prompts[0], /brief summary.*1-3 sentences/);
  assert.match(prompts[1], /balanced summary.*4-6 sentences/);
  assert.match(prompts[2], /all readable text in reading order/);
  assert.ok(requests[0].max_tokens < requests[1].max_tokens && requests[1].max_tokens < requests[2].max_tokens);
  await analyze({ ...image, mode: "describe", detail: "detailed" });
  assert.match(requests[3].messages[0].content[0].text, /Describe the image concisely/);
  assert.equal(requests[3].max_tokens, 800);
});

test("detailed OCR text is preserved beyond the former 2000-character limit", () => {
  const text = "বাংলা লেখা ".repeat(400).trim();
  assert.ok(text.length > 2000);
  assert.equal(validateImageAnalysisResult({ text }), text);
  assert.throws(() => validateImageAnalysisResult({ text: "ব".repeat(16001) }), /INVALID_IMAGE_ANALYSIS_RESPONSE/);
});

test("image endpoint forwards the selected size to analysis", async context => {
  let received;
  const app = createApp({ analyzeImage: async input => { received = input; return { text: "বাংলা ফলাফল" }; } });
  const server = app.listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise(resolve => server.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/assist/image-analysis`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...image, detail: "detailed" })
  });
  assert.equal(response.status, 200);
  assert.equal(received.detail, "detailed");
});
