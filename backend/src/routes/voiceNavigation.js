import { Router } from "express";
import { validateVoiceRequest, voiceError } from "../validators/voiceNavigation.js";

export function createVoiceNavigationRouter({ navigateVoice }) {
  const router = Router();
  let running = 0;
  const recent = [];
  router.post("/", async (request, response, next) => {
    const now = Date.now();
    while (recent.length && recent[0] < now - 60000) recent.shift();
    if (running >= 2 || recent.length >= 20) return next(voiceError("VOICE_RATE_LIMIT", 429));
    const controller = new AbortController();
    const cancel = () => { if (!response.writableEnded) controller.abort(); };
    response.on("close", cancel);
    let counted = false;
    try {
      const input = validateVoiceRequest(request.body);
      recent.push(now); running++; counted = true;
      const result = await navigateVoice(input, { signal: controller.signal });
      if (!controller.signal.aborted) response.json(result);
    } catch (error) { if (!controller.signal.aborted) next(error); }
    finally { if (counted) running--; response.off("close", cancel); }
  });
  return router;
}
