import http from "node:http";
import { getTodayQuestion } from "./services/question-service.js";
import { createPracticeAttempt } from "./services/practice-service.js";
import { createTencentAsrSession } from "./services/tencent-asr-service.js";
import { readJsonBody, sendJson } from "./utils/http.js";
import { loadEnvFile } from "./utils/env.js";

loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const PRACTICE_TIMEOUT_MS = Number(process.env.PRACTICE_TIMEOUT_MS || 15000);

function withTimeout(promise, timeoutMs, timeoutPayload) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(timeoutPayload), timeoutMs);
    })
  ]);
}

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
      const result = await withTimeout(
        createPracticeAttempt(body),
        PRACTICE_TIMEOUT_MS,
        {
          ok: false,
          statusCode: 504,
          error: {
            code: "practice_timeout",
            message: "分析时间有点长，这次先失败了，请重新试一次。"
          }
        }
      );

      if (!result.ok) {
        sendJson(res, result.statusCode, { error: result.error });
        return;
      }

      sendJson(res, result.statusCode, result.data);
      return;
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, {
          error: {
            code: "invalid_json",
            message: "提交数据格式不正确，请重新试一次。"
          }
        });
        return;
      }

      sendJson(res, 500, {
        error: {
          code: "internal_error",
          message: "处理回答时发生异常，请稍后再试。"
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
