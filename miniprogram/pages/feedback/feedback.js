const { fetchNextQuestion, trackPracticeEvent } = require("../../services/api");

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
    errorMessage: "",
    isLoadingNextQuestion: false
  },

  isPageActive: false,

  onShow() {
    this.isPageActive = true;
    const attempt = getApp().globalData.latestAttempt;

    if (!attempt || !attempt.feedback) {
      this.setData({
        status: "failed",
        errorMessage: "反馈结果丢失了，请返回首页再试一次。",
        isLoadingNextQuestion: false
      });
      return;
    }

    this.setData({
      attempt,
      status: "ready",
      errorMessage: "",
      isLoadingNextQuestion: false
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

  onHide() {
    this.isPageActive = false;
  },

  onUnload() {
    this.isPageActive = false;
  },

  async nextQuestion() {
    const attempt = this.data.attempt;

    if (!attempt || this.data.isLoadingNextQuestion) {
      return;
    }

    this.setData({
      isLoadingNextQuestion: true,
      errorMessage: ""
    });

    try {
      const response = await fetchNextQuestion(attempt.question?.id || "");
      const app = getApp();
      app.globalData.currentQuestion = response.question;

      if (!this.isPageActive) {
        return;
      }

      wx.redirectTo({
        url: "/pages/recorder/recorder"
      });
    } catch (error) {
      this.setData({
        isLoadingNextQuestion: false,
        errorMessage: error.message || "切换下一题失败，请稍后再试。"
      });
    }
  },

  backHome() {
    wx.reLaunch({
      url: "/pages/home/home"
    });
  }
});
