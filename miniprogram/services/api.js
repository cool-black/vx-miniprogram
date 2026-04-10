function getAppBaseUrl() {
  const app = getApp();
  return app.globalData.apiBaseUrl;
}

function getReadableHost() {
  try {
    const apiBaseUrl = getAppBaseUrl();
    return apiBaseUrl.replace(/^https?:\/\//, "");
  } catch {
    return "127.0.0.1:8787";
  }
}

function request({ url, method = "GET", data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getAppBaseUrl()}${url}`,
      method,
      data,
      timeout: 15000,
      success: (response) => {
        const { statusCode, data: responseData } = response;

        if (statusCode >= 200 && statusCode < 300) {
          resolve(responseData);
          return;
        }

        reject(responseData?.error || { message: "Request failed." });
      },
      fail: () => {
        reject({
          code: "network_request_failed",
          message: `网络请求失败或超时，请确认本地后端正在运行，并且 ${getReadableHost()} 可访问。`
        });
      }
    });
  });
}

function fetchTodayQuestion() {
  return request({ url: "/questions/today" });
}

function fetchTencentAsrSession() {
  return request({ url: "/asr/tencent/session" });
}

function createPracticeAttempt(payload) {
  return request({
    url: "/practice-attempts",
    method: "POST",
    data: payload
  });
}

function trackPracticeEvent(payload) {
  return request({
    url: "/events",
    method: "POST",
    data: payload
  });
}

module.exports = {
  fetchTodayQuestion,
  fetchTencentAsrSession,
  createPracticeAttempt,
  trackPracticeEvent
};
