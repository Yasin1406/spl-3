const BANGLA_PATTERN = /[\u0980-\u09FF]/u;

export function validateImageAnalysisRequest(body) {
  const mode = body?.mode === "ocr" ? "ocr" : body?.mode === "describe" ? "describe" : "";
  const imageDataUrl = typeof body?.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";
  const context = typeof body?.context === "string" ? body.context.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const detail = body?.detail ?? "standard";
  if (!["brief", "standard", "detailed"].includes(detail)) {
    const error = new Error("INVALID_IMAGE_ANALYSIS_DETAIL"); error.status = 400; error.code = error.message; throw error;
  }
  if (!mode || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/u.test(imageDataUrl) || imageDataUrl.length > 5_500_000) {
    const error = new Error("INVALID_IMAGE_ANALYSIS_REQUEST"); error.status = 400; error.code = error.message; throw error;
  }
  return { mode, imageDataUrl, context, detail };
}

export function validateImageAnalysisResult(payload) {
  const text = typeof payload?.text === "string" ? payload.text.replace(/\s+/g, " ").trim() : "";
  if (!text || text.length > 16000 || !BANGLA_PATTERN.test(text)) { const error = new Error("INVALID_IMAGE_ANALYSIS_RESPONSE"); error.code = error.message; throw error; }
  return text;
}
