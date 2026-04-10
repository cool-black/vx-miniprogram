import crypto from "node:crypto";
import { getQuestionById } from "./question-service.js";
import { transcribeAttempt } from "./transcription-service.js";
import { generateFeedback } from "./feedback-service.js";
import { persistAttemptAudio, persistAttemptRecord } from "./attempt-store.js";
import { persistAnalyticsEvent } from "./analytics-store.js";

function isDevelopment() {
  return (process.env.NODE_ENV || "development") !== "production";
}

export async function createPracticeAttempt(body) {
  const question = getQuestionById(body.questionId);

  if (!question) {
    return {
      ok: false,
      statusCode: 400,
      error: {
        code: "invalid_question_id",
        message: "Current question is unavailable. Please go back and try again."
      }
    };
  }

  const hasAudio = typeof body.audioBase64 === "string" && body.audioBase64.trim().length > 0;
  const hasMockTranscript =
    typeof body.mockTranscript === "string" && body.mockTranscript.trim().length > 0;
  const hasTranscript = typeof body.transcript === "string" && body.transcript.trim().length > 0;

  if (!hasAudio && !hasMockTranscript && !hasTranscript) {
    return {
      ok: false,
      statusCode: 400,
      error: {
        code: "audio_required",
        message: "Please record an answer before submitting."
      }
    };
  }

  const attemptId = `attempt_${crypto.randomUUID()}`;
  const storedAudio = await persistAttemptAudio({
    audioBase64: body.audioBase64,
    audioMimeType: body.audioMimeType,
    attemptId
  });

  const transcript = await transcribeAttempt({
    transcript: body.transcript,
    mockTranscript: body.mockTranscript,
    question,
    audioBase64: body.audioBase64,
    audioMimeType: body.audioMimeType
  });

  if (!transcript || transcript.trim().length === 0) {
    return {
      ok: false,
      statusCode: 502,
      error: {
        code: "transcription_failed",
        message: "We could not recognize your answer this time. Please try again."
      }
    };
  }

  const { feedback, usedFallback, provider, source, errorReason } = await generateFeedback({
    transcript,
    question
  });
  const retryToken = `retry_${crypto.randomUUID()}`;
  const responseData = {
    attemptId,
    question: {
      id: question.id,
      topic: question.topic,
      prompt: question.prompt,
      hint: question.hint,
      keywords: question.keywords
    },
    transcript,
    feedback,
    sampleAnswer: question.sampleAnswer,
    retryToken,
    audioStored: Boolean(storedAudio),
    parentAttemptId: body.parentAttemptId || null,
    isRetry: Boolean(body.retryToken)
  };

  if (isDevelopment()) {
    responseData.debug = {
      audioStored: Boolean(storedAudio),
      feedbackProvider: provider,
      feedbackSource: source,
      feedbackUsedFallback: usedFallback,
      feedbackErrorReason: errorReason
    };
  }

  await persistAttemptRecord({
    attemptId,
    questionId: question.id,
    topic: question.topic,
    transcript,
    audioStored: Boolean(storedAudio),
    audioFilename: storedAudio?.filename || null,
    parentAttemptId: body.parentAttemptId || null,
    isRetry: Boolean(body.retryToken),
    createdAt: new Date().toISOString()
  });

  await persistAnalyticsEvent({
    name: body.retryToken ? "retry_submit_success" : "first_submit_success",
    sessionId: body.analyticsSessionId || "",
    questionId: question.id,
    attemptId,
    isRetry: Boolean(body.retryToken),
    source: "practice_service"
  });

  return {
    ok: true,
    statusCode: 200,
    data: responseData
  };
}
