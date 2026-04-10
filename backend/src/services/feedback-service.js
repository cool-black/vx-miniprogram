import { isValidFeedback, normalizeFeedback } from "../schemas/feedback-schema.js";

function getFeedbackConfig() {
  return {
    provider: process.env.FEEDBACK_PROVIDER || "minimax",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    minimaxApiKey: process.env.MINIMAX_API_KEY || "",
    minimaxBaseUrl: process.env.MINIMAX_BASE_URL || "https://api.minimax.chat/v1",
    model: process.env.FEEDBACK_MODEL || "MiniMax-M2.7"
  };
}

function buildFeedbackFromTranscript(transcript) {
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const shortAnswer = wordCount < 12;

  return {
    overall: shortAnswer
      ? "先回答到题目了。下次再补一个原因会更完整。"
      : "回答已经完整了。下次可以再说得更自然一点。",
    relevance: "内容基本切题。",
    length: shortAnswer
      ? "回答偏短。下次加一句原因或例子。"
      : "长度够了。可以继续保持。",
    naturalness: "表达清楚。下次把句子说得更顺一点。"
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  const parts = [];

  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function tryParseJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function generateFeedbackWithOpenAI({ transcript, question }) {
  const { openaiApiKey, model } = getFeedbackConfig();

  if (!openaiApiKey) {
    return null;
  }

  const prompt = [
    "你在给雅思口语初学者做中文反馈。",
    "只返回 JSON，不要返回 Markdown，不要加代码块。",
    "必须严格使用这四个 key：overall, relevance, length, naturalness。",
    "每个 value 都必须是一句简短中文，最好 12 到 20 个字。",
    "语气要鼓励、具体、低压力，给出一个能马上照做的小建议。",
    "",
    `题目: ${question.prompt}`,
    `回答骨架: ${question.hint}`,
    `关键词: ${question.keywords.join(", ")}`,
    `参考答案: ${question.sampleAnswer}`,
    `学员回答转写: ${transcript}`
  ].join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model,
          input: prompt
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const outputText = extractOutputText(payload);
      return tryParseJson(outputText);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

async function generateFeedbackWithMiniMax({ transcript, question }) {
  const { minimaxApiKey, minimaxBaseUrl, model } = getFeedbackConfig();

  if (!minimaxApiKey) {
    return null;
  }

  const prompt = [
    "你在给雅思口语初学者做中文反馈。",
    "只返回 JSON，不要返回 Markdown，不要加代码块。",
    "必须严格使用这四个 key：overall, relevance, length, naturalness。",
    "每个 value 都必须是一句简短中文，最好 12 到 20 个字。",
    "语气要鼓励、具体、低压力，给出一个能马上照做的小建议。",
    "",
    `题目: ${question.prompt}`,
    `回答骨架: ${question.hint}`,
    `关键词: ${question.keywords.join(", ")}`,
    `参考答案: ${question.sampleAnswer}`,
    `学员回答转写: ${transcript}`
  ].join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(`${minimaxBaseUrl}/text/chatcompletion_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${minimaxApiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "你生成简短的中文 JSON 口语反馈。"
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.3
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const outputText =
        payload?.choices?.[0]?.message?.content ||
        payload?.reply ||
        "";
      return tryParseJson(outputText);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export async function generateFeedback({ transcript, question }) {
  const config = getFeedbackConfig();
  let rawFeedback = null;
  let source = "mock";
  let errorReason = "";

  if (config.provider === "openai") {
    rawFeedback = await generateFeedbackWithOpenAI({ transcript, question });
    if (rawFeedback) {
      source = "openai";
    } else {
      errorReason = "openai_empty_or_invalid";
    }
  } else if (config.provider === "minimax") {
    rawFeedback = await generateFeedbackWithMiniMax({ transcript, question });
    if (rawFeedback) {
      source = "minimax";
    } else {
      errorReason = "minimax_empty_or_invalid";
    }
  }

  if (!rawFeedback) {
    rawFeedback = buildFeedbackFromTranscript(transcript);
  }
  const feedback = normalizeFeedback(rawFeedback);
  const usedFallback = source === "mock";

  return {
    feedback,
    usedFallback,
    provider: config.provider,
    source,
    errorReason
  };
}
