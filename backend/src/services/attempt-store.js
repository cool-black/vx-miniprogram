import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ATTEMPT_DIR = path.resolve(process.cwd(), "backend", ".runtime", "attempts");
const ATTEMPT_LOG = path.resolve(process.cwd(), "backend", ".runtime", "attempts.jsonl");

async function ensureAttemptDir() {
  await fs.mkdir(ATTEMPT_DIR, { recursive: true });
}

export async function persistAttemptAudio({ audioBase64, audioMimeType, attemptId }) {
  if (typeof audioBase64 !== "string" || audioBase64.length === 0) {
    return null;
  }

  await ensureAttemptDir();

  const extension = audioMimeType === "audio/mp3" || audioMimeType === "audio/mpeg" ? "mp3" : "bin";
  const safeAttemptId = attemptId || crypto.randomUUID();
  const filename = `${safeAttemptId}.${extension}`;
  const filepath = path.join(ATTEMPT_DIR, filename);

  await fs.writeFile(filepath, Buffer.from(audioBase64, "base64"));

  return {
    filename,
    filepath
  };
}

export async function persistAttemptRecord(record) {
  await ensureAttemptDir();
  await fs.appendFile(ATTEMPT_LOG, `${JSON.stringify(record)}\n`, "utf8");
}
