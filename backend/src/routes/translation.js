import { Router } from "express";
import { validateTranslationRequest, validateTranslationVerbosity } from "../validators/translation.js";

export function createTranslationRouter({ translateBatch }) {
  const router = Router();
  router.post("/", async (request, response, next) => {
    try {
      const items = validateTranslationRequest(request.body);
      const verbosity = validateTranslationVerbosity(request.body?.verbosity);
      const result = await translateBatch(items, { verbosity });
      response.json(Array.isArray(result) ? { translations: result } : result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
