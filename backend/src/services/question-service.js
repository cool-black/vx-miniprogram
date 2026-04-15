import questions from "../content/questions.json" with { type: "json" };
import { validateQuestion } from "../schemas/question-schema.js";

const validQuestions = questions.filter(validateQuestion);

export function getTodayQuestion() {
  if (validQuestions.length === 0) {
    return null;
  }

  const dayIndex = new Date().getDate() % validQuestions.length;
  return validQuestions[dayIndex];
}

export function getQuestionById(questionId) {
  return validQuestions.find((question) => question.id === questionId) || null;
}

export function getNextQuestion(afterQuestionId) {
  if (typeof afterQuestionId !== "string" || afterQuestionId.trim().length === 0) {
    return null;
  }

  if (validQuestions.length === 0) {
    return null;
  }

  const currentIndex = validQuestions.findIndex((question) => question.id === afterQuestionId);

  if (currentIndex === -1) {
    return null;
  }

  return validQuestions[(currentIndex + 1) % validQuestions.length];
}
