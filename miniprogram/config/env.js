let localOverrides = {};

try {
  localOverrides = require("./env.local");
} catch {
  localOverrides = {};
}

const DEFAULT_ENV_CONFIG = {
  // Transcript mode for the app:
  // - manual: user types the transcript by hand
  // - tencent: real-device Tencent ASR flow
  speechMode: "tencent",

  // WeChat DevTools runs on the desktop, so localhost is correct there.
  devtoolsApiBaseUrl: "http://127.0.0.1:8787",

  // Real phones must call the computer's LAN IP on the same Wi-Fi/LAN.
  // Override this in env.local.js instead of editing this tracked file.
  deviceApiBaseUrl: "http://127.0.0.1:8787"
};

const ENV_CONFIG = {
  ...DEFAULT_ENV_CONFIG,
  ...localOverrides
};

function isDevtoolsPlatform() {
  try {
    return wx.getSystemInfoSync().platform === "devtools";
  } catch {
    return false;
  }
}

function resolveApiBaseUrl() {
  return isDevtoolsPlatform()
    ? ENV_CONFIG.devtoolsApiBaseUrl
    : ENV_CONFIG.deviceApiBaseUrl;
}

module.exports = {
  DEFAULT_ENV_CONFIG,
  ENV_CONFIG,
  resolveApiBaseUrl
};
