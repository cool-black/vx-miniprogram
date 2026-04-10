const { ENV_CONFIG, resolveApiBaseUrl } = require("./config/env");

App({
  globalData: {
    apiBaseUrl: resolveApiBaseUrl(),
    speechMode: ENV_CONFIG.speechMode,
    currentQuestion: null,
    latestAttempt: null
  }
});
