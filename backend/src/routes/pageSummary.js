import { Router } from "express";
import { validatePageSummaryRequest } from "../validators/pageSummary.js";

export function createPageSummaryRouter({ summarizePage }) {
  const router = Router();
  router.post("/", async (request, response, next) => {
    const controller = new AbortController();
    const cancel = () => { if (!response.writableEnded) controller.abort(); };
    response.on("close", cancel);
    try {
      const context = validatePageSummaryRequest(request.body);
      const result = await summarizePage(context, { signal: controller.signal });
      if (!controller.signal.aborted) response.json(result);
    } catch (error) { if (!controller.signal.aborted) next(error); }
    finally { response.off("close", cancel); }
  });
  return router;
}
