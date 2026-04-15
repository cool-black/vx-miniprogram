const {
  fetchTodayQuestion,
  fetchNextQuestion,
  trackPracticeEvent
} = require("../../services/api");

function getPromptAudioUrl(question) {
  const rawUrl = (
    question?.audio?.promptAudioUrl ||
    question?.promptAudioUrl ||
    ""
  );

  if (!rawUrl) {
    return "";
  }

  if (/^https?:\/\//.test(rawUrl)) {
    return rawUrl;
  }

  const baseUrl = getApp().globalData.apiBaseUrl || "";
  return `${baseUrl}${rawUrl}`;
}

function sendPageEvent(name, extra = {}) {
  const app = getApp();
  return trackPracticeEvent({
    name,
    sessionId: app.globalData.analyticsSessionId,
    source: "home_page",
    ...extra
  }).catch(() => {});
}

function configureAudioContext(audioContext) {
  audioContext.obeyMuteSwitch = false;
  audioContext.volume = 1;
  return audioContext;
}

Page({
  data: {
    status: "idle",
    question: null,
    promptAudioUrl: "",
    canPlayPromptAudio: false,
    isLoadingPromptAudio: false,
    isPlayingPromptAudio: false,
    promptAudioStatus: "",
    promptAudioError: "",
    errorMessage: "",
    isSwitchingQuestion: false
  },

  promptAudioContext: null,
  promptAudioLoadingTimer: null,
  isPageActive: false,
  shouldAnnouncePromptAudioStop: false,

  clearPromptAudioLoadingTimer() {
    if (!this.promptAudioLoadingTimer) {
      return;
    }

    clearTimeout(this.promptAudioLoadingTimer);
    this.promptAudioLoadingTimer = null;
  },

  resetPromptAudioState(extra = {}) {
    this.clearPromptAudioLoadingTimer();
    this.shouldAnnouncePromptAudioStop = false;
    this.setData({
      isLoadingPromptAudio: false,
      isPlayingPromptAudio: false,
      ...extra
    });
  },

  ensurePromptAudioContext() {
    if (this.promptAudioContext) {
      return this.promptAudioContext;
    }

    const audioContext = configureAudioContext(wx.createInnerAudioContext());

    audioContext.onPlay(() => {
      if (!this.isPageActive) return;
      this.clearPromptAudioLoadingTimer();
      this.setData({
        isLoadingPromptAudio: false,
        isPlayingPromptAudio: true,
        promptAudioError: "",
        promptAudioStatus: "正在播放题目音频。"
      });
    });

    audioContext.onWaiting(() => {
      if (!this.isPageActive) return;
      this.clearPromptAudioLoadingTimer();
      this.promptAudioLoadingTimer = setTimeout(() => {
        this.promptAudioLoadingTimer = null;

        if (!this.isPageActive) {
          return;
        }

        this.setData({
          isLoadingPromptAudio: true,
          isPlayingPromptAudio: false,
          promptAudioStatus: "题目音频正在加载。"
        });
      }, 120);
    });

    audioContext.onEnded(() => {
      if (!this.isPageActive) return;
      this.clearPromptAudioLoadingTimer();
      this.shouldAnnouncePromptAudioStop = false;
      this.setData({
        isLoadingPromptAudio: false,
        isPlayingPromptAudio: false,
        promptAudioStatus: "题目音频播放结束了。"
      });
    });

    audioContext.onStop(() => {
      if (!this.isPageActive) return;
      this.clearPromptAudioLoadingTimer();
      const promptAudioStatus = this.shouldAnnouncePromptAudioStop
        ? "题目音频已停止。"
        : this.data.promptAudioStatus;
      this.shouldAnnouncePromptAudioStop = false;
      this.setData({
        isLoadingPromptAudio: false,
        isPlayingPromptAudio: false,
        promptAudioStatus
      });
    });

    audioContext.onError((error) => {
      if (!this.isPageActive) return;
      this.clearPromptAudioLoadingTimer();
      this.shouldAnnouncePromptAudioStop = false;
      this.setData({
        isLoadingPromptAudio: false,
        isPlayingPromptAudio: false,
        promptAudioError: error?.errMsg || "题目音频播放失败了。"
      });
    });

    this.promptAudioContext = audioContext;
    return audioContext;
  },

  stopPromptAudioPlayback() {
    if (!this.promptAudioContext) {
      this.resetPromptAudioState({
        promptAudioStatus: "题目音频已停止。"
      });
      return;
    }

    this.clearPromptAudioLoadingTimer();
    this.shouldAnnouncePromptAudioStop = true;
    this.promptAudioContext.stop();
    this.setData({
      isLoadingPromptAudio: false,
      isPlayingPromptAudio: false,
      promptAudioStatus: "题目音频已停止。"
    });
  },

  destroyPromptAudioContext() {
    if (!this.promptAudioContext) {
      return;
    }

    this.clearPromptAudioLoadingTimer();
    this.shouldAnnouncePromptAudioStop = false;
    this.promptAudioContext.destroy();
    this.promptAudioContext = null;
  },

  resetPromptAudioPlayback() {
    this.destroyPromptAudioContext();
    this.resetPromptAudioState();
  },

  playPromptAudio() {
    const audioUrl = this.data.promptAudioUrl;

    if (!audioUrl) {
      this.setData({
        promptAudioError: "当前题目没有可播放的音频。"
      });
      return;
    }

    this.destroyPromptAudioContext();
    const audioContext = this.ensurePromptAudioContext();
    this.setData({
      promptAudioError: "",
      promptAudioStatus: "正在准备题目音频。"
    });
    this.shouldAnnouncePromptAudioStop = false;
    audioContext.src = audioUrl;
    audioContext.play();
  },

  togglePromptAudioPlayback() {
    if (this.data.isPlayingPromptAudio || this.data.isLoadingPromptAudio) {
      this.stopPromptAudioPlayback();
      return;
    }

    this.playPromptAudio();
  },

  onLoad() {
    this.isPageActive = true;
    this.loadQuestion();
  },

  onShow() {
    this.isPageActive = true;
  },

  onHide() {
    this.isPageActive = false;
    this.resetPromptAudioPlayback();
  },

  onUnload() {
    this.isPageActive = false;
    this.resetPromptAudioPlayback();
  },

  async loadQuestion() {
    this.resetPromptAudioPlayback();
    this.setData({
      status: "loading_question",
      errorMessage: "",
      isSwitchingQuestion: false,
      promptAudioUrl: "",
      canPlayPromptAudio: false,
      isLoadingPromptAudio: false,
      isPlayingPromptAudio: false,
      promptAudioStatus: "",
      promptAudioError: ""
    });

    try {
      const response = await fetchTodayQuestion();
      const app = getApp();
      app.globalData.currentQuestion = response.question;
      const promptAudioUrl = getPromptAudioUrl(response.question);

      this.setData({
        status: "ready",
        question: response.question,
        promptAudioUrl,
        canPlayPromptAudio: Boolean(promptAudioUrl),
        isLoadingPromptAudio: false,
        isPlayingPromptAudio: false,
        promptAudioStatus: promptAudioUrl ? "可以试听题目音频。" : "",
        promptAudioError: "",
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

    this.resetPromptAudioPlayback();
    this.setData({
      errorMessage: "",
      isSwitchingQuestion: true,
      promptAudioError: ""
    });

    try {
      const response = await fetchNextQuestion(question.id);
      const app = getApp();
      app.globalData.currentQuestion = response.question;
      const promptAudioUrl = getPromptAudioUrl(response.question);

      this.setData({
        question: response.question,
        promptAudioUrl,
        canPlayPromptAudio: Boolean(promptAudioUrl),
        isLoadingPromptAudio: false,
        isPlayingPromptAudio: false,
        promptAudioStatus: promptAudioUrl ? "可以试听题目音频。" : "",
        promptAudioError: "",
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
    this.resetPromptAudioPlayback();
    wx.navigateTo({
      url: `/pages/recorder/recorder?questionId=${this.data.question.id}`
    });
  }
});
