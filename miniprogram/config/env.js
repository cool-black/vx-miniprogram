const ENV_CONFIG = {
  // Transcript mode for the app:
  // - manual: user types the transcript by hand
  // - tencent: real-device Tencent ASR flow
  speechMode: "tencent",

  // WeChat DevTools runs on the desktop, so localhost is correct there.
  devtoolsApiBaseUrl: "http://127.0.0.1:8787",

  // Real phones must call the computer's LAN IP on the same Wi-Fi/LAN.
  // Update this when the backend host or network changes.
  deviceApiBaseUrl: "http://192.168.1.5:8787"
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
  ENV_CONFIG,
  resolveApiBaseUrl
};
