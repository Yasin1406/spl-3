import { Router } from "express";
import { validateImageAnalysisRequest } from "../validators/imageAnalysis.js";

export function createImageAnalysisRouter({ analyzeImage }) {
  const router = Router();
  router.post("/", async (request, response, next) => {
    try { response.json(await analyzeImage(validateImageAnalysisRequest(request.body))); }
    catch (error) { next(error); }
  });
  return router;
}
