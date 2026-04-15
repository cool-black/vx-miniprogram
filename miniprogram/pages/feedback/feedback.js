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
    errorMessage: "",
    isPlayingRecording: false,
    playbackStatus: ""
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
        isPlayingRecording: true,
        playbackStatus: "正在播放你的回答。"
      });
    });

    audioContext.onEnded(() => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecording: false,
        playbackStatus: "播放结束了，可以再听一遍。"
      });
    });

    audioContext.onStop(() => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecording: false
      });
    });

    audioContext.onError((error) => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecording: false,
        playbackStatus: error?.errMsg || "录音回放失败了。"
      });
    });

    this.answerAudioContext = audioContext;
    return audioContext;
  },

  playRecordedAnswer() {
    const filePath = this.data.attempt?.localAudioFilePath;

    if (!filePath) {
      this.setData({
        playbackStatus: "当前没有可回放的录音文件。"
      });
      return;
    }

    const audioContext = this.ensureAnswerAudioContext();
    audioContext.stop();
    audioContext.src = filePath;
    audioContext.play();
  },

  toggleRecordedAnswerPlayback() {
    if (this.data.isPlayingRecording) {
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
      isPlayingRecording: false
    });
  },

  onShow() {
    this.isPageActive = true;
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
      errorMessage: "",
      playbackStatus: attempt.localAudioFilePath ? "可以试听这次回答。" : ""
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
  },

  onHide() {
    this.isPageActive = false;
    this.stopRecordedAnswerPlayback();
  },

  onUnload() {
    this.isPageActive = false;
    this.stopRecordedAnswerPlayback();
    if (this.answerAudioContext) {
      this.answerAudioContext.destroy();
      this.answerAudioContext = null;
    }
  }
});
