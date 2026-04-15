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
    isLoadingNextQuestion: false,
    recommendedAnswerText: "",
    canPlayRecordedAnswer: false,
    isPlayingRecordedAnswer: false,
    playbackStatus: "",
    playbackError: ""
  },

  answerAudioContext: null,
  isPageActive: false,

  ensureAnswerAudioContext() {
    if (this.answerAudioContext) {
      return this.answerAudioContext;
    }

    const audioContext = wx.createInnerAudioContext();

    audioContext.onPlay(() => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecordedAnswer: true,
        playbackError: "",
        playbackStatus: "正在播放你的回答。"
      });
    });

    audioContext.onEnded(() => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecordedAnswer: false,
        playbackStatus: "播放结束了，可以再听一遍。"
      });
    });

    audioContext.onStop(() => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecordedAnswer: false
      });
    });

    audioContext.onError((error) => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecordedAnswer: false,
        playbackError: error?.errMsg || "录音回放失败了。"
      });
    });

    this.answerAudioContext = audioContext;
    return audioContext;
  },

  playRecordedAnswer() {
    const filePath = this.data.attempt?.localAudioFilePath || "";

    if (!filePath) {
      this.setData({
        playbackError: "当前没有可回放的录音文件。"
      });
      return;
    }

    const audioContext = this.ensureAnswerAudioContext();
    audioContext.stop();
    audioContext.src = filePath;
    audioContext.play();
  },

  toggleRecordedAnswerPlayback() {
    if (this.data.isPlayingRecordedAnswer) {
      this.stopRecordedAnswerPlayback();
      return;
    }

    this.playRecordedAnswer();
  },

  stopRecordedAnswerPlayback() {
    if (!this.answerAudioContext) {
      return;
    }

    this.answerAudioContext.stop();
    this.setData({
      isPlayingRecordedAnswer: false
    });
  },

  destroyAnswerAudioContext() {
    if (!this.answerAudioContext) {
      return;
    }

    this.answerAudioContext.destroy();
    this.answerAudioContext = null;
  },

  onShow() {
    this.isPageActive = true;
    const attempt = getApp().globalData.latestAttempt;

    if (!attempt || !attempt.feedback) {
      this.stopRecordedAnswerPlayback();
      this.setData({
        status: "failed",
        errorMessage: "反馈结果丢失了，请返回首页再试一次。",
        isLoadingNextQuestion: false,
        recommendedAnswerText: "",
        canPlayRecordedAnswer: false,
        playbackStatus: "",
        playbackError: ""
      });
      return;
    }

    this.setData({
      attempt,
      status: "ready",
      errorMessage: "",
      isLoadingNextQuestion: false,
      recommendedAnswerText: attempt.recommendedAnswer || attempt.sampleAnswer || "",
      canPlayRecordedAnswer: Boolean(attempt.localAudioFilePath),
      isPlayingRecordedAnswer: false,
      playbackStatus: attempt.localAudioFilePath ? "可以试听这次回答。" : "",
      playbackError: ""
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
    this.stopRecordedAnswerPlayback();

    sendFeedbackEvent("retry_clicked", {
      attemptId: attempt.attemptId || "",
      questionId: attempt.question?.id || "",
      isRetry: true
    });

    wx.redirectTo({
      url: "/pages/recorder/recorder?retry=1"
    });
  },

  async nextQuestion() {
    const attempt = this.data.attempt;

    if (!attempt || this.data.isLoadingNextQuestion) {
      return;
    }

    this.stopRecordedAnswerPlayback();
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
    this.stopRecordedAnswerPlayback();
    wx.reLaunch({
      url: "/pages/home/home"
    });
  },

  onHide() {
    this.isPageActive = false;
    this.stopRecordedAnswerPlayback();
  },

  onUnload() {
    this.isPageActive = false;
    this.stopRecordedAnswerPlayback();
    this.destroyAnswerAudioContext();
  }
});
