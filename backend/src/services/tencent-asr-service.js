import crypto from "node:crypto";

function getTencentAsrConfig() {
  return {
    appId: process.env.TENCENT_ASR_APP_ID || "",
    secretId: process.env.TENCENT_ASR_SECRET_ID || "",
    secretKey: process.env.TENCENT_ASR_SECRET_KEY || "",
    engineModelType: process.env.TENCENT_ASR_ENGINE_MODEL || "16k_zh",
    voiceFormat: Number(process.env.TENCENT_ASR_VOICE_FORMAT || "8"),
    needVad: Number(process.env.TENCENT_ASR_NEED_VAD || "0")
  };
}

function buildSigningSource({ appId, params }) {
  const query = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return `asr.cloud.tencent.com/asr/v2/${appId}?${query}`;
}

export function createTencentAsrSession() {
  const config = getTencentAsrConfig();

  if (!config.appId || !config.secretId || !config.secretKey) {
    return {
      ok: false,
      statusCode: 400,
      error: {
        code: "tencent_asr_not_configured",
        message: "Tencent ASR is not configured yet."
      }
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const expired = timestamp + 60 * 60;
  const voiceId = crypto.randomUUID();
  const nonce = Math.floor(Math.random() * 1_000_000_000);

  const params = {
    engine_model_type: config.engineModelType,
    expired,
    needvad: config.needVad,
    nonce,
    secretid: config.secretId,
    timestamp,
    voice_format: config.voiceFormat,
    voice_id: voiceId
  };

  const signa = crypto
    .createHmac("sha1", config.secretKey)
    .update(buildSigningSource({ appId: config.appId, params }))
    .digest("base64");

  const query = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");

  return {
    ok: true,
    statusCode: 200,
    data: {
      voiceId,
      wsUrl: `wss://asr.cloud.tencent.com/asr/v2/${config.appId}?${query}&signature=${encodeURIComponent(signa)}`,
      config: {
        engineModelType: config.engineModelType,
        voiceFormat: config.voiceFormat,
        needVad: config.needVad
      }
    }
  };
}
