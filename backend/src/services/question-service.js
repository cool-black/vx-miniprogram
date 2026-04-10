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
