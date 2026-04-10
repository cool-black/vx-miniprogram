import fs from "node:fs";
import path from "node:path";

let loaded = false;

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) return null;

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (!key) return null;

  return { key, value };
}

export function loadEnvFile() {
  if (loaded) return;

  const candidates = [
    path.resolve(process.cwd(), "backend", ".env"),
    path.resolve(process.cwd(), ".env")
  ];

  for (const filepath of candidates) {
    if (!fs.existsSync(filepath)) continue;

    const content = fs.readFileSync(filepath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;

      if (!process.env[parsed.key]) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }

  loaded = true;
}
