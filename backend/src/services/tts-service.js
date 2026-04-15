import crypto from "node:crypto";
import {
  buildAudioFilename,
  getAudioPublicPath,
  hasCachedAudio,
  writeAudioBuffer
} from "./audio-cache.js";

const TENCENT_TTS_HOST = "tts.tencentcloudapi.com";
const TENCENT_TTS_ENDPOINT = `https://${TENCENT_TTS_HOST}`;
const TENCENT_TTS_VERSION = "2019-08-23";
const TENCENT_TTS_ACTION = "TextToVoice";
const DEFAULT_REGION = "ap-guangzhou";

function getTencentTtsConfig() {
  return {
    secretId: process.env.TENCENT_TTS_SECRET_ID || "",
    secretKey: process.env.TENCENT_TTS_SECRET_KEY || "",
    region: process.env.TENCENT_TTS_REGION || DEFAULT_REGION,
    voiceType: Number(process.env.TENCENT_TTS_VOICE_TYPE || "101001"),
    sampleRate: Number(process.env.TENCENT_TTS_SAMPLE_RATE || "16000"),
    codec: process.env.TENCENT_TTS_CODEC || "mp3"
  };
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function hmacSha256(key, content, encoding) {
  return crypto.createHmac("sha256", key).update(content).digest(encoding);
}

function buildTc3Authorization({ secretId, secretKey, region, action, timestamp, payload }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const service = "tts";
  const credentialScope = `${date}/${service}/tc3_request`;
  const canonicalHeaders = [
    "content-type:application/json; charset=utf-8",
    `host:${TENCENT_TTS_HOST}`,
    `x-tc-action:${action.toLowerCase()}`
  ].join("\n");
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    sha256(payload)
  ].join("\n");
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest)
  ].join("\n");
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign, "hex");

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function resolveQuestionText(question, type) {
  if (type === "prompt") {
    return question?.prompt || "";
  }

  if (type === "recommendedAnswer") {
    return question?.recommendedAnswer || question?.sampleAnswer || "";
  }

  return "";
}

export function isTencentTtsConfigured() {
  const config = getTencentTtsConfig();
  return Boolean(config.secretId && config.secretKey);
}

export function buildQuestionAudioUrls(question) {
  if (!question || !isTencentTtsConfigured()) {
    return {
      promptAudioUrl: null,
      recommendedAnswerAudioUrl: null
    };
  }

  return {
    promptAudioUrl: `/questions/${encodeURIComponent(question.id)}/audio?type=prompt`,
    recommendedAnswerAudioUrl: `/questions/${encodeURIComponent(question.id)}/audio?type=recommendedAnswer`
  };
}

export async function ensureQuestionAudio({ question, type }) {
  if (!question) {
    return {
      ok: false,
      statusCode: 404,
      error: {
        code: "question_unavailable",
        message: "Question is unavailable."
      }
    };
  }

  const config = getTencentTtsConfig();

  if (!config.secretId || !config.secretKey) {
    return {
      ok: false,
      statusCode: 503,
      error: {
        code: "tencent_tts_not_configured",
        message: "Tencent TTS is not configured yet."
      }
    };
  }

  const text = resolveQuestionText(question, type);

  if (!text) {
    return {
      ok: false,
      statusCode: 400,
      error: {
        code: "audio_text_unavailable",
        message: "There is no text available for this audio."
      }
    };
  }

  const filename = buildAudioFilename({
    questionId: question.id,
    type,
    text
  });

  if (await hasCachedAudio(filename)) {
    return {
      ok: true,
      statusCode: 200,
      data: {
        cached: true,
        filename,
        publicPath: getAudioPublicPath(filename)
      }
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    Text: text,
    SessionId: `${question.id}-${type}-${timestamp}`,
    ModelType: 1,
    VoiceType: config.voiceType,
    PrimaryLanguage: 1,
    SampleRate: config.sampleRate,
    Codec: config.codec
  });

  const response = await fetch(TENCENT_TTS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: buildTc3Authorization({
        secretId: config.secretId,
        secretKey: config.secretKey,
        region: config.region,
        action: TENCENT_TTS_ACTION,
        timestamp,
        payload
      }),
      "Content-Type": "application/json; charset=utf-8",
      Host: TENCENT_TTS_HOST,
      "X-TC-Action": TENCENT_TTS_ACTION,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": TENCENT_TTS_VERSION,
      "X-TC-Region": config.region
    },
    body: payload
  });

  const result = await response.json();
  const error = result?.Response?.Error;

  if (!response.ok || error) {
    return {
      ok: false,
      statusCode: response.ok ? 502 : response.status,
      error: {
        code: error?.Code || "tencent_tts_failed",
        message: error?.Message || "Tencent TTS failed."
      }
    };
  }

  const audioBase64 = result?.Response?.Audio;

  if (typeof audioBase64 !== "string" || audioBase64.length === 0) {
    return {
      ok: false,
      statusCode: 502,
      error: {
        code: "tts_audio_missing",
        message: "Tencent TTS did not return audio content."
      }
    };
  }

  const audioFile = await writeAudioBuffer(filename, Buffer.from(audioBase64, "base64"));

  return {
    ok: true,
    statusCode: 200,
    data: {
      cached: false,
      filename: audioFile.filename,
      publicPath: audioFile.publicPath
    }
  };
}
