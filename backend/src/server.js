import http from "node:http";
import { getNextQuestion, getQuestionById, getTodayQuestion } from "./services/question-service.js";
import { createPracticeAttempt } from "./services/practice-service.js";
import { createTencentAsrSession } from "./services/tencent-asr-service.js";
import { persistAnalyticsEvent } from "./services/analytics-store.js";
import { getAudioFilePath } from "./services/audio-cache.js";
import { buildQuestionAudioUrls, ensureQuestionAudio } from "./services/tts-service.js";
import { readJsonBody, sendAudioFile, sendJson } from "./utils/http.js";
import { loadEnvFile } from "./utils/env.js";

loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const PRACTICE_TIMEOUT_MS = Number(process.env.PRACTICE_TIMEOUT_MS || 15000);

function serializeQuestion(question) {
  return {
    id: question.id,
    topic: question.topic,
    prompt: question.prompt,
    hint: question.hint,
    keywords: question.keywords,
    recommendedAnswer: question.recommendedAnswer || question.sampleAnswer,
    audio: buildQuestionAudioUrls(question)
  };
}

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
      question: serializeQuestion(question)
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/questions/next")) {
    const requestUrl = new URL(req.url, "http://localhost");
    const afterQuestionId = requestUrl.searchParams.get("after") || "";

    if (afterQuestionId.trim().length === 0) {
      sendJson(res, 400, {
        error: {
          code: "invalid_question_id",
          message: "Current question id is required."
        }
      });
      return;
    }

    const question = getNextQuestion(afterQuestionId);

    if (!question) {
      sendJson(res, 400, {
        error: {
          code: "invalid_question_id",
          message: "Current question id is invalid."
        }
      });
      return;
    }

    sendJson(res, 200, {
      question: serializeQuestion(question)
    });
    return;
  }

  if (req.method === "GET" && /^\/questions\/[^/]+\/audio(?:\?|$)/.test(req.url || "")) {
    const requestUrl = new URL(req.url, "http://localhost");
    const pathnameParts = requestUrl.pathname.split("/");
    const questionId = decodeURIComponent(pathnameParts[2] || "");
    const type = requestUrl.searchParams.get("type") || "";

    if (type !== "prompt" && type !== "recommendedAnswer") {
      sendJson(res, 400, {
        error: {
          code: "invalid_audio_type",
          message: "Audio type must be prompt or recommendedAnswer."
        }
      });
      return;
    }

    const question = getQuestionById(questionId);
    const audioResult = await ensureQuestionAudio({ question, type });

    if (!audioResult.ok) {
      sendJson(res, audioResult.statusCode, { error: audioResult.error });
      return;
    }

    sendAudioFile(res, getAudioFilePath(audioResult.data.filename));
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
