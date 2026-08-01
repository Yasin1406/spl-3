import { Router } from "express";
import { validateTranslationRequest } from "../validators/translation.js";

export function createTranslationRouter({ translateBatch }) {
  const router = Router();
  router.post("/", async (request, response, next) => {
    try {
      const items = validateTranslationRequest(request.body);
      const result = await translateBatch(items);
      response.json(Array.isArray(result) ? { translations: result } : result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
