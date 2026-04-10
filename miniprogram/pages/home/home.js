const { fetchTodayQuestion, trackPracticeEvent } = require("../../services/api");

function sendPageEvent(name, extra = {}) {
  const app = getApp();
  return trackPracticeEvent({
    name,
    sessionId: app.globalData.analyticsSessionId,
    source: "home_page",
    ...extra
  }).catch(() => {});
}

Page({
  data: {
    status: "idle",
    question: null,
    errorMessage: ""
  },

  onLoad() {
    this.loadQuestion();
  },

  async loadQuestion() {
    this.setData({
      status: "loading_question",
      errorMessage: ""
    });

    try {
      const response = await fetchTodayQuestion();
      const app = getApp();
      app.globalData.currentQuestion = response.question;

      this.setData({
        status: "ready",
        question: response.question
      });

      sendPageEvent("home_viewed", {
        questionId: response.question?.id || ""
      });
    } catch (error) {
      this.setData({
        status: "load_failed",
        errorMessage: error.message || "题目加载失败，请稍后重试。"
      });
    }
  },

  goToRecorder() {
    if (!this.data.question) return;
    wx.navigateTo({
      url: `/pages/recorder/recorder?questionId=${this.data.question.id}`
    });
  }
});
