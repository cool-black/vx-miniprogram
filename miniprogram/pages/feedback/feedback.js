const { trackPracticeEvent } = require("../../services/api");

function sendFeedbackEvent(name, extra = {}) {
  const app = getApp();
  return trackPracticeEvent({
    name,
    sessionId: app.globalData.analyticsSessionId,
    source: "feedback_page",
    ...extra
  }).catch(() => {});
}

Page({
  data: {
    attempt: null,
    status: "loading_feedback",
    errorMessage: ""
  },

  onShow() {
    const attempt = getApp().globalData.latestAttempt;

    if (!attempt || !attempt.feedback) {
      this.setData({
        status: "failed",
        errorMessage: "反馈结果丢失了，请返回首页再试一次。"
      });
      return;
    }

    this.setData({
      attempt,
      status: "ready",
      errorMessage: ""
    });

    sendFeedbackEvent("feedback_viewed", {
      attemptId: attempt.attemptId || "",
      questionId: attempt.question?.id || "",
      isRetry: Boolean(attempt.isRetry)
    });
  },

  retryAttempt() {
    const attempt = this.data.attempt;
    const app = getApp();
    app.globalData.currentQuestion = attempt.question;

    sendFeedbackEvent("retry_clicked", {
      attemptId: attempt.attemptId || "",
      questionId: attempt.question?.id || "",
      isRetry: true
    });

    wx.redirectTo({
      url: "/pages/recorder/recorder?retry=1"
    });
  },

  backHome() {
    wx.reLaunch({
      url: "/pages/home/home"
    });
  }
});
