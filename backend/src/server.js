import http from "node:http";
import { getTodayQuestion } from "./services/question-service.js";
import { createPracticeAttempt } from "./services/practice-service.js";
import { createTencentAsrSession } from "./services/tencent-asr-service.js";
import { persistAnalyticsEvent } from "./services/analytics-store.js";
import { readJsonBody, sendJson } from "./utils/http.js";
import { loadEnvFile } from "./utils/env.js";

loadEnvFile();

const PORT = Number(process.env.PORT || 8787);

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/questions/today") {
    const question = getTodayQuestion();

    if (!question) {
      sendJson(res, 503, {
        error: {
          code: "question_unavailable",
          message: "There is no question available right now."
        }
      });
      return;
    }

    sendJson(res, 200, {
      question: {
        id: question.id,
        topic: question.topic,
        prompt: question.prompt,
        hint: question.hint,
        keywords: question.keywords
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/asr/tencent/session") {
    const result = createTencentAsrSession();

    if (!result.ok) {
      sendJson(res, result.statusCode, { error: result.error });
      return;
    }

    sendJson(res, result.statusCode, result.data);
    return;
  }

  if (req.method === "POST" && req.url === "/practice-attempts") {
    try {
      const body = await readJsonBody(req);
      const result = await createPracticeAttempt(body);

      if (!result.ok) {
        sendJson(res, result.statusCode, { error: result.error });
        return;
      }

      sendJson(res, result.statusCode, result.data);
      return;
    } catch {
      sendJson(res, 500, {
        error: {
          code: "internal_error",
          message: "Something went wrong while processing your answer."
        }
      });
      return;
    }
  }

  if (req.method === "POST" && req.url === "/events") {
    try {
      const body = await readJsonBody(req);

      if (typeof body?.name !== "string" || body.name.trim().length === 0) {
        sendJson(res, 400, {
          error: {
            code: "invalid_event_name",
            message: "Event name is required."
          }
        });
        return;
      }

      await persistAnalyticsEvent({
        name: body.name,
        sessionId: body.sessionId || "",
        questionId: body.questionId || "",
        attemptId: body.attemptId || "",
        isRetry: Boolean(body.isRetry),
        source: body.source || "miniprogram"
      });

      sendJson(res, 200, { ok: true });
      return;
    } catch {
      sendJson(res, 400, {
        error: {
          code: "invalid_event_payload",
          message: "Event payload is invalid."
        }
      });
      return;
    }
  }

  sendJson(res, 404, {
    error: {
      code: "not_found",
      message: "Route not found."
    }
  });
});

server.listen(PORT, () => {
  console.log(`IELTS speaking backend running on http://localhost:${PORT}`);
});
