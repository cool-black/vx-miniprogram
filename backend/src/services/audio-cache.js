import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const AUDIO_DIR = path.resolve(process.cwd(), "backend", ".runtime", "audio");

function sanitizeSegment(value, fallback) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

export function hashAudioText(text) {
  return crypto.createHash("sha1").update(text || "").digest("hex").slice(0, 12);
}

export function buildAudioFilename({ questionId, type, text }) {
  const safeQuestionId = sanitizeSegment(questionId, "question");
  const safeType = sanitizeSegment(type, "audio");
  const textHash = hashAudioText(text);
  return `${safeQuestionId}-${safeType}-${textHash}.mp3`;
}

export function getAudioPublicPath(filename) {
  return `/runtime/audio/${filename}`;
}

export function getAudioFilePath(filename) {
  return path.join(AUDIO_DIR, filename);
}

export async function ensureAudioCacheDir() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

export async function hasCachedAudio(filename) {
  try {
    await fs.access(getAudioFilePath(filename));
    return true;
  } catch {
    return false;
  }
}

export async function writeAudioBuffer(filename, buffer) {
  await ensureAudioCacheDir();
  await fs.writeFile(getAudioFilePath(filename), buffer);
  return {
    filename,
    filepath: getAudioFilePath(filename),
    publicPath: getAudioPublicPath(filename)
  };
}

