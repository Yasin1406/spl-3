const TYPES = new Set(["article", "form", "table", "collection", "navigation", "supporting", "section"]);
const PURPOSES = new Set(["article", "form", "results", "product", "checkout", "dashboard", "conversation", "general"]);
const LIMITATIONS = new Set(["content_limited", "regions_limited", "controls_limited", "embedded_content_limited", "loading_content", "private_structure_only"]);
function failure(code, status = 400) { const error = new Error(code); error.code = code; error.status = status; return error; }

export function sanitizeSummaryText(value, maxLength) {
  if (typeof value !== "string" || value.length > maxLength) throw failure("INVALID_SUMMARY_TEXT");
  return value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ").trim()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[ব্যক্তিগত তথ্য]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[ব্যক্তিগত তথ্য]")
    .replace(/\b(?:bearer\s+\S+|(?:password|token|secret|api[_ -]?key)\s*[:=]\s*\S+)/gi, "[ব্যক্তিগত তথ্য]");
}

export function validatePageSummaryRequest(body) {
  if (!body || !["page", "region"].includes(body.scope) || !["brief", "standard", "detailed"].includes(body.detail) ||
      !PURPOSES.has(body.purpose) || !Array.isArray(body.regions) || !body.regions.length || body.regions.length > 40) throw failure("INVALID_SUMMARY_REQUEST");
  if (body.privateContext === true && body.allowPrivateContent !== true) throw failure("PRIVATE_SUMMARY_NOT_ALLOWED");
  const seen = new Set();
  const id = value => {
    if (typeof value !== "string" || !/^(region|source|control)-\d+$/.test(value) || seen.has(value)) throw failure("INVALID_SUMMARY_ID");
    seen.add(value);
    return value;
  };
  let characters = 0;
  let count = 0;
  const regions = body.regions.map(region => {
    if (!TYPES.has(region?.type) || !Array.isArray(region.blocks) || region.blocks.length > 400 ||
        !Array.isArray(region.controls) || region.controls.length > 80 || !Array.isArray(region.notices)) throw failure("INVALID_SUMMARY_REGION");
    const regionId = id(region.id);
    const blocks = region.blocks.map(block => {
      if (!["text", "heading", "row"].includes(block?.type)) throw failure("INVALID_SUMMARY_BLOCK");
      const text = sanitizeSummaryText(block.text, 1200);
      characters += text.length; count++;
      if (!text || count > 400 || characters > 120000) throw failure("SUMMARY_CONTEXT_TOO_LARGE");
      return { id: id(block.id), type: block.type, text };
    });
    const controls = region.controls.map(control => {
      if (!["field", "link", "action"].includes(control?.type)) throw failure("INVALID_SUMMARY_CONTROL");
      return { id: id(control.id), type: control.type, name: sanitizeSummaryText(control.name, 240),
        constraints: Object.fromEntries(["type", "minlength", "maxlength", "min", "max", "pattern"].filter(key => typeof control.constraints?.[key] === "string").map(key => [key, sanitizeSummaryText(control.constraints[key], 160)])),
        required: control.required === true, invalid: control.invalid === true, disabled: control.disabled === true };
    });
    if (region.notices.some(notice => !blocks.some(block => block.id === notice))) throw failure("INVALID_SUMMARY_NOTICE");
    return { id: regionId, type: region.type, name: sanitizeSummaryText(region.name, 240), blocks, controls, notices: [...new Set(region.notices)] };
  });
  if (!regions.some(region => region.blocks.length)) throw failure("EMPTY_SUMMARY_CONTENT");
  const limitations = Array.isArray(body.coverage?.limitations) ? body.coverage.limitations.filter(item => LIMITATIONS.has(item)) : [];
  return { scope: body.scope, detail: body.detail, purpose: body.purpose, title: sanitizeSummaryText(body.title || "", 240),
    privateContext: body.privateContext === true, allowPrivateContent: body.allowPrivateContent === true,
    regions, coverage: { complete: body.coverage?.complete === true && limitations.length === 0, limitations } };
}

const normalizeDigits = value => value.replace(/[০-৯]/g, digit => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
const numbers = value => (normalizeDigits(value).match(/\d+(?:[.,]\d+)*/g) || []).map(number => {
  const canonical = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(number) ? number.replace(/,/g, "") : number;
  return canonical.replace(/^0+(?=\d)/, "");
});

export function validateSummaryResult(payload, blocks, extraContext = "") {
  const text = payload?.summary_bn;
  const ids = payload?.source_ids;
  const expected = new Set(blocks.map(block => block.id));
  if (typeof text !== "string" || text.length > 8000 || !/[\u0980-\u09FF]/.test(text) || /<[^>]+>|```|javascript:/i.test(text) ||
      !Array.isArray(ids) || ids.length !== expected.size || new Set(ids).size !== ids.length || ids.some(id => !expected.has(id))) throw failure("INVALID_SUMMARY_RESPONSE", 502);
  const allowedNumbers = new Set(numbers(blocks.map(block => block.text).join(" ") + " " + extraContext));
  if (numbers(text).some(number => !allowedNumbers.has(number))) throw failure("UNSUPPORTED_SUMMARY_NUMBER", 502);
  return { summary_bn: text.trim(), source_ids: ids };
}
