const { ENV_CONFIG, resolveApiBaseUrl } = require("./config/env");

function createAnalyticsSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

App({
  globalData: {
    apiBaseUrl: resolveApiBaseUrl(),
    speechMode: ENV_CONFIG.speechMode,
    currentQuestion: null,
    latestAttempt: null,
    analyticsSessionId: createAnalyticsSessionId()
  }
});
