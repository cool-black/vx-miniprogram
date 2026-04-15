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

function pickAudioUrl(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const value = candidate.trim();
    if (value.length > 0) {
      return value;
    }
  }

  return "";
}

function resolveAudioUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return "";
  }

  if (/^https?:\/\//.test(rawUrl)) {
    return rawUrl;
  }

  const baseUrl = getApp().globalData.apiBaseUrl || "";
  return `${baseUrl}${rawUrl}`;
}

function configureAudioContext(audioContext) {
  audioContext.obeyMuteSwitch = false;
  audioContext.volume = 1;
  return audioContext;
}

Page({
  data: {
    attempt: null,
    status: "loading_feedback",
    errorMessage: "",
    isLoadingNextQuestion: false,
    recommendedAnswerText: "",
    recommendedAnswerAudioUrl: "",
    canPlayRecordedAnswer: false,
    isPlayingRecordedAnswer: false,
    playbackStatus: "",
    playbackError: "",
    isPlayingRecommendedAnswer: false,
    isLoadingRecommendedAnswer: false,
    recommendedPlaybackStatus: "",
    recommendedPlaybackError: ""
  },

  recordedAnswerAudioContext: null,
  recommendedAnswerAudioContext: null,
  isPageActive: false,

  ensureRecordedAnswerAudioContext() {
    if (this.recordedAnswerAudioContext) {
      return this.recordedAnswerAudioContext;
    }

    const audioContext = configureAudioContext(wx.createInnerAudioContext());

    audioContext.onPlay(() => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecordedAnswer: true,
        playbackError: "",
        playbackStatus: "正在播放你的回答。"
      });
    });

    audioContext.onWaiting(() => {
      if (!this.isPageActive) return;
      this.setData({
        playbackStatus: "你的回答正在加载。"
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
        isPlayingRecordedAnswer: false,
        playbackStatus: "播放已停止。"
      });
    });

    audioContext.onError((error) => {
      if (!this.isPageActive) return;
      this.setData({
        isPlayingRecordedAnswer: false,
        playbackError: error?.errMsg || "录音回放失败了。"
      });
    });

    this.recordedAnswerAudioContext = audioContext;
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

    this.stopRecommendedAnswerPlayback();

    const audioContext = this.ensureRecordedAnswerAudioContext();
    this.setData({
      playbackError: "",
      playbackStatus: "正在准备播放你的回答。"
    });

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
    if (!this.recordedAnswerAudioContext) {
      return;
    }

    this.recordedAnswerAudioContext.stop();
    this.setData({
      isPlayingRecordedAnswer: false,
      playbackStatus: "播放已停止。"
    });
  },

  ensureRecommendedAnswerAudioContext() {
    if (this.recommendedAnswerAudioContext) {
      return this.recommendedAnswerAudioContext;
    }

    const audioContext = configureAudioContext(wx.createInnerAudioContext());

    audioContext.onPlay(() => {
      if (!this.isPageActive) return;
      this.setData({
        isLoadingRecommendedAnswer: false,
        isPlayingRecommendedAnswer: true,
        recommendedPlaybackError: "",
        recommendedPlaybackStatus: "正在播放推荐回答。"
      });
    });

    audioContext.onWaiting(() => {
      if (!this.isPageActive) return;
      this.setData({
        isLoadingRecommendedAnswer: true,
        recommendedPlaybackStatus: "推荐回答正在加载。"
      });
    });

    audioContext.onEnded(() => {
      if (!this.isPageActive) return;
      this.setData({
        isLoadingRecommendedAnswer: false,
        isPlayingRecommendedAnswer: false,
        recommendedPlaybackStatus: "播放结束了，可以再听一遍。"
      });
    });

    audioContext.onStop(() => {
      if (!this.isPageActive) return;
      this.setData({
        isLoadingRecommendedAnswer: false,
        isPlayingRecommendedAnswer: false,
        recommendedPlaybackStatus: "播放已停止。"
      });
    });

    audioContext.onError((error) => {
      if (!this.isPageActive) return;
      this.setData({
        isLoadingRecommendedAnswer: false,
        isPlayingRecommendedAnswer: false,
        recommendedPlaybackError: error?.errMsg || "推荐回答播放失败了。"
      });
    });

    this.recommendedAnswerAudioContext = audioContext;
    return audioContext;
  },

  playRecommendedAnswer() {
    const audioUrl = this.data.recommendedAnswerAudioUrl || "";

    if (!audioUrl) {
      this.setData({
        recommendedPlaybackError: "当前没有可用的推荐回答音频。"
      });
      return;
    }

    this.stopRecordedAnswerPlayback();

    const audioContext = this.ensureRecommendedAnswerAudioContext();
    this.setData({
      isLoadingRecommendedAnswer: true,
      isPlayingRecommendedAnswer: false,
      recommendedPlaybackError: "",
      recommendedPlaybackStatus: "正在准备播放推荐回答。"
    });

    audioContext.stop();
    audioContext.src = audioUrl;
    audioContext.play();
  },

  toggleRecommendedAnswerPlayback() {
    if (this.data.isPlayingRecommendedAnswer || this.data.isLoadingRecommendedAnswer) {
      this.stopRecommendedAnswerPlayback();
      return;
    }

    this.playRecommendedAnswer();
  },

  stopRecommendedAnswerPlayback() {
    if (!this.recommendedAnswerAudioContext) {
      return;
    }

    this.recommendedAnswerAudioContext.stop();
    this.setData({
      isLoadingRecommendedAnswer: false,
      isPlayingRecommendedAnswer: false,
      recommendedPlaybackStatus: "播放已停止。"
    });
  },

  destroyRecordedAnswerAudioContext() {
    if (!this.recordedAnswerAudioContext) {
      return;
    }

    this.recordedAnswerAudioContext.destroy();
    this.recordedAnswerAudioContext = null;
  },

  destroyRecommendedAnswerAudioContext() {
    if (!this.recommendedAnswerAudioContext) {
      return;
    }

    this.recommendedAnswerAudioContext.destroy();
    this.recommendedAnswerAudioContext = null;
  },

  stopAllPlayback() {
    this.stopRecordedAnswerPlayback();
    this.stopRecommendedAnswerPlayback();
  },

  onShow() {
    this.isPageActive = true;
    const attempt = getApp().globalData.latestAttempt;

    if (!attempt || !attempt.feedback) {
      this.stopAllPlayback();
      this.setData({
        status: "failed",
        errorMessage: "反馈结果丢失了，请返回首页再试一次。",
        isLoadingNextQuestion: false,
        recommendedAnswerText: "",
        recommendedAnswerAudioUrl: "",
        canPlayRecordedAnswer: false,
        isPlayingRecordedAnswer: false,
        playbackStatus: "",
        playbackError: "",
        isPlayingRecommendedAnswer: false,
        isLoadingRecommendedAnswer: false,
        recommendedPlaybackStatus: "",
        recommendedPlaybackError: ""
      });
      return;
    }

    const recommendedAnswerAudioUrl = resolveAudioUrl(pickAudioUrl(
      attempt.audio?.recommendedAnswerAudioUrl,
      attempt.recommendedAnswerAudioUrl,
      attempt.question?.audio?.recommendedAnswerAudioUrl,
      attempt.question?.recommendedAnswerAudioUrl,
      attempt.feedback?.recommendedAnswerAudioUrl,
      attempt.audioUrl
    ));

    this.setData({
      attempt,
      status: "ready",
      errorMessage: "",
      isLoadingNextQuestion: false,
      recommendedAnswerText: attempt.recommendedAnswer || attempt.sampleAnswer || "",
      recommendedAnswerAudioUrl,
      canPlayRecordedAnswer: Boolean(attempt.localAudioFilePath),
      isPlayingRecordedAnswer: false,
      playbackStatus: attempt.localAudioFilePath ? "可以试听这次回答。" : "",
      playbackError: "",
      isPlayingRecommendedAnswer: false,
      isLoadingRecommendedAnswer: false,
      recommendedPlaybackStatus: recommendedAnswerAudioUrl
        ? "可以播放推荐回答。"
        : "推荐回答音频暂时不可用，你可以先参考下面这段文本。",
      recommendedPlaybackError: ""
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
    this.stopAllPlayback();

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

    this.stopAllPlayback();
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
        url: "/pages/home/home"
      });
    } catch (error) {
      this.setData({
        isLoadingNextQuestion: false,
        errorMessage: error.message || "切换下一题失败，请稍后再试。"
      });
    }
  },

  backHome() {
    this.stopAllPlayback();
    wx.reLaunch({
      url: "/pages/home/home"
    });
  },

  onHide() {
    this.isPageActive = false;
    this.stopAllPlayback();
  },

  onUnload() {
    this.isPageActive = false;
    this.stopAllPlayback();
    this.destroyRecordedAnswerAudioContext();
    this.destroyRecommendedAnswerAudioContext();
  }
});
