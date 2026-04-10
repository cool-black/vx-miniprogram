export function validateQuestion(question) {
  if (!question || typeof question !== "object") return false;

  const hasBaseFields =
    typeof question.id === "string" &&
    question.id.length > 0 &&
    question.part === "part1" &&
    typeof question.topic === "string" &&
    typeof question.prompt === "string" &&
    typeof question.hint === "string" &&
    Array.isArray(question.keywords) &&
    question.keywords.every((keyword) => typeof keyword === "string") &&
    typeof question.sampleAnswer === "string";

  return hasBaseFields;
}
