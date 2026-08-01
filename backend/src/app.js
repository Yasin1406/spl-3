import express from "express";
import { createTranslationRouter } from "./routes/translation.js";

export function createApp({ translateBatch, allowedOrigin = "*" }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });

  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.use("/api/v1/assist/translation", createTranslationRouter({ translateBatch }));
  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const body = { error: status === 500 ? "TRANSLATION_SERVICE_ERROR" : error.code || "INVALID_REQUEST" };
    if (Array.isArray(error.attempts)) body.attemptedProviders = error.attempts.map((attempt) => attempt.provider);
    response.status(status).json(body);
  });
  return app;
}
