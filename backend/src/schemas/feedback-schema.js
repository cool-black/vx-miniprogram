const FEEDBACK_KEYS = ["overall", "relevance", "length", "naturalness"];

export function normalizeFeedback(payload) {
  const fallback = {
    overall: "You answered the question once. Try again and make it a little fuller.",
    relevance: "The system could not fully judge relevance this time. Please try again.",
    length: "The system could not fully judge answer length this time. Please try again.",
    naturalness: "The system could not fully judge naturalness this time. Please try again."
  };

  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const normalized = {};

  for (const key of FEEDBACK_KEYS) {
    const value = payload[key];
    normalized[key] =
      typeof value === "string" && value.trim().length > 0
        ? value.trim().slice(0, 120)
        : fallback[key];
  }

  return normalized;
}

export function isValidFeedback(payload) {
  if (!payload || typeof payload !== "object") return false;
  return FEEDBACK_KEYS.every(
    (key) => typeof payload[key] === "string" && payload[key].trim().length > 0
  );
}
