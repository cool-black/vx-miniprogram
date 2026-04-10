import { writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

function getTranscriptionConfig() {
  return {
    provider: process.env.STT_PROVIDER || "frontend",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.STT_MODEL || "gpt-4o-mini-transcribe"
  };
}

async function transcribeWithOpenAI({ audioBase64, audioMimeType }) {
  const { apiKey, model } = getTranscriptionConfig();

  if (!apiKey || !audioBase64) {
    return null;
  }

  const extension = audioMimeType === "audio/mp3" || audioMimeType === "audio/mpeg" ? "mp3" : "wav";
  const filename = `stt-${crypto.randomUUID()}.${extension}`;
  const filepath = path.join(os.tmpdir(), filename);

  try {
    await writeFile(filepath, Buffer.from(audioBase64, "base64"));

    const formData = new FormData();
    const blob = new Blob([Buffer.from(audioBase64, "base64")], {
      type: audioMimeType || "audio/mpeg"
    });

    formData.append("file", blob, filename);
    formData.append("model", model);
    formData.append("response_format", "json");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      return typeof payload?.text === "string" ? payload.text.trim() : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  } finally {
    await unlink(filepath).catch(() => {});
  }
}

export async function transcribeAttempt({
  transcript,
  mockTranscript,
  question,
  audioBase64,
  audioMimeType
}) {
  if (typeof transcript === "string" && transcript.trim().length > 0) {
    return transcript.trim();
  }

  if (typeof mockTranscript === "string" && mockTranscript.trim().length > 0) {
    return mockTranscript.trim();
  }

  const config = getTranscriptionConfig();

  if (config.provider === "openai" && audioBase64) {
    const realTranscript = await transcribeWithOpenAI({ audioBase64, audioMimeType });
    if (realTranscript) {
      return realTranscript;
    }
  }

  if (typeof audioBase64 === "string" && audioBase64.length > 0) {
    return `This is a mock transcript for ${question.topic}. The audio file was uploaded successfully and is ready for real STT integration.`;
  }

  return `Yes, I do. This is a mock answer for ${question.topic}. I want to improve my speaking step by step.`;
}
