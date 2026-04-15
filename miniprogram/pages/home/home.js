const {
  fetchTodayQuestion,
  fetchNextQuestion,
  trackPracticeEvent
} = require("../../services/api");

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
    errorMessage: "",
    isSwitchingQuestion: false
  },

  onLoad() {
    this.loadQuestion();
  },

  async loadQuestion() {
    this.setData({
      status: "loading_question",
      errorMessage: "",
      isSwitchingQuestion: false
    });

    try {
      const response = await fetchTodayQuestion();
      const app = getApp();
      app.globalData.currentQuestion = response.question;

      this.setData({
        status: "ready",
        question: response.question,
        isSwitchingQuestion: false
      });

      sendPageEvent("home_viewed", {
        questionId: response.question?.id || ""
      });
    } catch (error) {
      this.setData({
        status: "load_failed",
        errorMessage: error.message || "题目加载失败，请稍后重试。",
        isSwitchingQuestion: false
      });
    }
  },

  async loadNextQuestion() {
    const question = this.data.question;

    if (!question || this.data.isSwitchingQuestion) {
      return;
    }

    this.setData({
      errorMessage: "",
      isSwitchingQuestion: true
    });

    try {
      const response = await fetchNextQuestion(question.id);
      const app = getApp();
      app.globalData.currentQuestion = response.question;

      this.setData({
        question: response.question,
        isSwitchingQuestion: false
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "切换下一题失败，请稍后重试。",
        isSwitchingQuestion: false
      });
    }
  },

  goToRecorder() {
    if (!this.data.question || this.data.isSwitchingQuestion) return;
    wx.navigateTo({
      url: `/pages/recorder/recorder?questionId=${this.data.question.id}`
    });
  }
});
