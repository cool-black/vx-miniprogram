const ENV_CONFIG = {
  speechMode: "tencent",
  devtoolsApiBaseUrl: "http://127.0.0.1:8787",
  deviceApiBaseUrl: "http://192.168.1.5:8787"
};

function resolveApiBaseUrl() {
  try {
    const systemInfo = wx.getSystemInfoSync();
    if (systemInfo.platform === "devtools") {
      return ENV_CONFIG.devtoolsApiBaseUrl;
    }
  } catch {}

  return ENV_CONFIG.deviceApiBaseUrl;
}

module.exports = {
  ENV_CONFIG,
  resolveApiBaseUrl
};
