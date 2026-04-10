import fs from "node:fs/promises";
import path from "node:path";

const RUNTIME_DIR = path.resolve(process.cwd(), "backend", ".runtime");
const EVENT_LOG = path.resolve(RUNTIME_DIR, "events.jsonl");

async function ensureRuntimeDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

export async function persistAnalyticsEvent(event) {
  if (!event || typeof event.name !== "string" || event.name.trim().length === 0) {
    return;
  }

  await ensureRuntimeDir();
  await fs.appendFile(
    EVENT_LOG,
    `${JSON.stringify({
      ...event,
      name: event.name.trim(),
      createdAt: event.createdAt || new Date().toISOString()
    })}\n`,
    "utf8"
  );
}
