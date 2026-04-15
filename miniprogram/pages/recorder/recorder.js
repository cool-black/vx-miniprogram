const {
  createPracticeAttempt,
  fetchNextQuestion,
  fetchTencentAsrSession,
  trackPracticeEvent
} = require("../../services/api");
const { getRecorderManager } = require("../../services/recorder");
const { readFileAsBase64 } = require("../../utils/file");
const { createSpeechProvider } = require("../../services/speech-provider");

let activeRecorderPage = null;
let recorderEventsBound = false;

function authorizeRecordScope() {
  return new Promise((resolve, reject) => {
    wx.authorize({
      scope: "scope.record",
      success: resolve,
      fail: reject
    });
  });
}

function sendRecorderEvent(name, extra = {}) {
  const app = getApp();
  return trackPracticeEvent({
    name,
    sessionId: app.globalData.analyticsSessionId,
    source: "recorder_page",
    ...extra
  }).catch(() => {});
}

function configureAudioContext(audioContext) {
  audioContext.obeyMuteSwitch = false;
  audioContext.volume = 1;
  return audioContext;
}

const LIVE_HINT_IDLE_MS = 5000;
const LIVE_HINT_CHECK_MS = 1000;

Page({
  data: {
    status: "idle",
    question: null,
    permissionDenied: false,
    seconds: 45,
    countdownLabel: "45s",
    uploadStatusMessage: "",
    errorMessage: "",
    transcriptText: "",
    transcriptMode: "manual",
    recognitionStatus: "",
    liveRecognitionEnabled: false,
    isRetry: false,
    retryToken: "",
    parentAttemptId: "",
    canRetrySubmit: false,
    submissionTimedOut: false,
    canPlayRecording: false,
    isPlayingRecording: false,
    playbackStatus: "",
    isLoadingNextQuestion: false
  },

  timer: null,
  processingHintTimer: null,
  processingTimeoutTimer: null,
  liveHintTimer: null,
  recorder: null,
  answerAudioContext: null,
  tempFilePath: "",
  recordingDurationMs: 0,
  isPageActive: false,
  speechProvider: null,
  activeSubmissionToken: 0,
  liveRecognitionSession: null,
  liveRecognitionFailed: false,
  lastTranscriptUpdateAt: 0,
  lastLiveHintAt: 0,

  onLoad(options) {
    const app = getApp();
    const question = app.globalData.currentQuestion;
    const latestAttempt = app.globalData.latestAttempt;
    const isRetry = options.retry === "1";

    this.recorder = getRecorderManager();
    this.speechProvider = createSpeechProvider({
      mode: app.globalData.speechMode || "manual",
      fetchTencentSession: fetchTencentAsrSession
    });
    this.bindRecorderEvents();
    activeRecorderPage = this;
    this.isPageActive = true;

    this.setData({
      question,
      transcriptMode: this.speechProvider.mode,
      liveRecognitionEnabled:
        Boolean(this.speechProvider?.supportsLiveRecognition && this.speechProvider.supportsLiveRecognition()),
      isRetry,
      retryToken: isRetry ? latestAttempt?.retryToken || "" : "",
      parentAttemptId: isRetry ? latestAttempt?.attemptId || "" : ""
    });
  },

  ensureAnswerAudioContext() {
    if (this.answerAudioContext) {
      return this.answerAudioContext;
    }

    const audioContext = configureAudioContext(wx.createInnerAudioContext());

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
        playbackStatus:
          error?.errMsg || "录音回放失败了，这次可以先继续看文本。"
      });
    });

    this.answerAudioContext = audioContext;
    return this.answerAudioContext;
  },

  playRecordedAnswer() {
    if (!this.tempFilePath) {
      this.setData({
        playbackStatus: "当前没有可回放的录音文件。"
      });
      return;
    }

    const audioContext = this.ensureAnswerAudioContext();
    audioContext.stop();
    audioContext.src = this.tempFilePath;
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

  onTranscriptInput(event) {
    this.setData({
      transcriptText: event.detail.value
    });
  },

  startLiveHintMonitor() {
    this.stopLiveHintMonitor();
    this.lastTranscriptUpdateAt = Date.now();
    this.lastLiveHintAt = 0;

    this.liveHintTimer = setInterval(() => {
      if (!this.isPageActive || this.data.status !== "recording") {
        return;
      }

      if (!this.data.liveRecognitionEnabled || this.liveRecognitionFailed) {
        return;
      }

      const idleForMs = Date.now() - this.lastTranscriptUpdateAt;
      const hintedRecently = Date.now() - this.lastLiveHintAt < LIVE_HINT_IDLE_MS;

      if (idleForMs >= LIVE_HINT_IDLE_MS && !hintedRecently) {
        this.lastLiveHintAt = Date.now();
        this.setData({
          recognitionStatus: this.data.transcriptText
            ? "如果你在思考，可以继续说下一句，实时识别会更稳定。"
            : "如果你暂时停顿了，可以继续开口，实时识别会更稳定。"
        });
      }
    }, LIVE_HINT_CHECK_MS);
  },

  stopLiveHintMonitor() {
    clearInterval(this.liveHintTimer);
    this.liveHintTimer = null;
  },

  bindRecorderEvents() {
    if (recorderEventsBound) {
      return;
    }

    this.recorder.onStop((result) => {
      if (!activeRecorderPage) return;
      activeRecorderPage.handleRecorderStop(result);
    });

    this.recorder.onError(() => {
      if (!activeRecorderPage) return;
      activeRecorderPage.handleRecorderError();
    });

    if (typeof this.recorder.onFrameRecorded === "function") {
      this.recorder.onFrameRecorded((frame) => {
        if (!activeRecorderPage) return;
        activeRecorderPage.handleRecorderFrame(frame);
      });
    }

    recorderEventsBound = true;
  },

  handleRecorderFrame(frame) {
    if (!this.isPageActive || !this.liveRecognitionSession) return;

    try {
      this.liveRecognitionSession.appendAudioFrame(frame.frameBuffer);
    } catch {
      this.liveRecognitionFailed = true;
      this.liveRecognitionSession = null;
      this.setData({
        recognitionStatus: "实时识别中断了，录音仍会保留，结束后可手动补全文字。"
      });
    }
  },

  handleRecorderStop(result) {
    if (!this.isPageActive) return;
    this.tempFilePath = result.tempFilePath || "";
    this.recordingDurationMs = result.duration || Math.max((45 - this.data.seconds) * 1000, 1000);
    clearInterval(this.timer);
    this.stopLiveHintMonitor();
    this.setData({
      status: "recorded",
      countdownLabel: "录音完成",
      canRetrySubmit: false,
      submissionTimedOut: false,
      canPlayRecording: Boolean(this.tempFilePath),
      isPlayingRecording: false,
      playbackStatus: this.tempFilePath ? "录音已保存，可以先试听。" : ""
    });
    this.handleRecognitionAfterRecording(result);
  },

  handleRecorderError() {
    if (!this.isPageActive) return;
    clearInterval(this.timer);
    this.stopLiveHintMonitor();
    this.setData({
      status: "submit_failed",
      uploadStatusMessage: "",
      errorMessage: "录音失败了，请重新试一次。",
      canRetrySubmit: false,
      canPlayRecording: false,
      isPlayingRecording: false,
      playbackStatus: ""
    });
  },

  async startRecording() {
    const { question, isRetry } = this.data;
    sendRecorderEvent("recording_started", {
      questionId: question?.id || "",
      isRetry
    });

    try {
      this.activeSubmissionToken += 1;
      this.stopRecordedAnswerPlayback();
      this.tempFilePath = "";
      this.recordingDurationMs = 0;
      this.liveRecognitionFailed = false;
      this.liveRecognitionSession = null;
      this.lastTranscriptUpdateAt = Date.now();
      this.lastLiveHintAt = 0;
      await authorizeRecordScope();

      if (
        this.speechProvider &&
        this.speechProvider.supportsLiveRecognition &&
        this.speechProvider.supportsLiveRecognition()
      ) {
        try {
          this.liveRecognitionSession = await this.speechProvider.startLiveRecognition({
            onStatus: (message) => {
              if (!this.isPageActive) return;
              this.setData({
                recognitionStatus: message
              });
            },
            onPartialTranscript: (transcript) => {
              if (!this.isPageActive) return;
              this.lastTranscriptUpdateAt = Date.now();
              this.setData({
                transcriptText: transcript,
                recognitionStatus: transcript
                  ? "实时识别中，你可以边说边看到文字。"
                  : "实时识别已连接，正在等待语音..."
              });
            },
            onFailure: (error) => {
              if (!this.isPageActive) return;
              this.liveRecognitionFailed = true;
              this.liveRecognitionSession = null;
              this.stopLiveHintMonitor();
              this.setData({
                recognitionStatus:
                  error?.message || "实时识别中断了，停止录音后会自动补做完整识别。"
              });
            }
          });
        } catch (error) {
          this.liveRecognitionFailed = true;
          this.liveRecognitionSession = null;
          this.setData({
            recognitionStatus: error.message || "实时识别暂时不可用，会在录音后再试一次。"
          });
        }
      }

      this.setData({
        status: "recording",
        permissionDenied: false,
        errorMessage: "",
        uploadStatusMessage: "",
        transcriptText: "",
        seconds: 45,
        countdownLabel: "45s",
        canRetrySubmit: false,
        submissionTimedOut: false,
        canPlayRecording: false,
        isPlayingRecording: false,
        playbackStatus: "",
        isLoadingNextQuestion: false
      });
      this.startCountdown();
      this.startLiveHintMonitor();
      this.recorder.start({
        duration: 45000,
        format: "mp3",
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 32000,
        frameSize: 4
      });
    } catch {
      this.stopLiveHintMonitor();
      this.setData({
        status: "permission_failed",
        permissionDenied: true,
        uploadStatusMessage: "",
        errorMessage: "录音权限被拒绝了，请打开权限设置后再试一次。",
        canRetrySubmit: false,
        canPlayRecording: false,
        isPlayingRecording: false,
        playbackStatus: ""
      });
    }
  },

  openPermissionSettings() {
    wx.openSetting({
      success: () => {
        this.setData({
          errorMessage: "",
          permissionDenied: false
        });
      }
    });
  },

  async handleRecognitionAfterRecording() {
    this.stopLiveHintMonitor();

    if (!this.speechProvider || this.speechProvider.mode === "manual") {
      this.setData({
        status: "recognized",
        recognitionStatus: "当前是手动转写模式，请检查或填写识别文本后再提交。"
      });
      return;
    }

    if (this.liveRecognitionSession && !this.liveRecognitionFailed) {
      this.setData({
        status: "recognizing",
        recognitionStatus: "正在整理实时识别结果..."
      });

      try {
        const result = await this.liveRecognitionSession.stop();
        this.liveRecognitionSession = null;

        this.setData({
          status: "recognized",
          transcriptText: result.transcript || this.data.transcriptText || "",
          recognitionStatus: result.transcript
            ? "实时识别完成，你可以先检查文本再提交。"
            : "实时识别没有返回完整文本，你可以手动补充后再提交。"
        });
        return;
      } catch (error) {
        this.liveRecognitionSession = null;
        this.liveRecognitionFailed = true;
        this.setData({
          recognitionStatus:
            error.message || "实时识别失败了，会切回录音后识别。"
        });
      }
    }

    this.setData({
      status: "recognizing",
      recognitionStatus: this.liveRecognitionFailed
        ? "实时识别失败了，正在改用录音后识别..."
        : "正在调用腾讯云识别..."
    });

    try {
      const result = await this.speechProvider.recognize({
        filePath: this.tempFilePath,
        durationMs: this.recordingDurationMs,
        onStatus: (message) => {
          if (!this.isPageActive) return;
          this.setData({
            recognitionStatus: message
          });
        }
      });

      this.setData({
        status: "recognized",
        transcriptText: result.transcript || "",
        recognitionStatus: result.transcript
          ? "腾讯云识别完成，你可以先检查文本再提交。"
          : "腾讯云没有返回文本，你可以手动补充后再提交。"
      });
    } catch (error) {
      this.setData({
        status: "recognized",
        recognitionStatus:
          error.message || "腾讯云识别失败了，你仍然可以手动输入文本后继续。"
      });
    }
  },

  stopRecording() {
    if (this.data.status !== "recording") return;
    this.recorder.stop();
  },

  startCountdown() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const next = this.data.seconds - 1;
      if (next <= 0) {
        clearInterval(this.timer);
        this.setData({
          seconds: 0,
          countdownLabel: "0s"
        });
        return;
      }

      this.setData({
        seconds: next,
        countdownLabel: `${next}s`
      });
    }, 1000);
  },

  async submitAttempt() {
    const { question, retryToken, parentAttemptId, isRetry } = this.data;

    if (this.data.status === "uploading") {
      return;
    }

    if (!question) {
      this.setData({
        status: "submit_failed",
        errorMessage: "题目上下文丢失了，请返回首页重试。",
        canRetrySubmit: false
      });
      return;
    }

    const submissionToken = this.activeSubmissionToken + 1;
    this.activeSubmissionToken = submissionToken;

    this.setData({
      status: "uploading",
      errorMessage: "",
      uploadStatusMessage: "正在分析你的回答...",
      canRetrySubmit: false,
      submissionTimedOut: false
    });

    this.startProcessingTimers(submissionToken);

    try {
      this.stopRecordedAnswerPlayback();
      const audioBase64 = this.tempFilePath ? await readFileAsBase64(this.tempFilePath) : "";

      const response = await createPracticeAttempt({
        questionId: question.id,
        retryToken: isRetry ? retryToken : "",
        parentAttemptId: isRetry ? parentAttemptId : "",
        analyticsSessionId: getApp().globalData.analyticsSessionId,
        audioBase64,
        audioMimeType: "audio/mpeg",
        audioFilename: this.tempFilePath ? this.tempFilePath.split("/").pop() : "",
        transcript: this.data.transcriptText.trim(),
        mockTranscript: ""
      });

      getApp().globalData.latestAttempt = {
        ...response,
        localAudioFilePath: this.tempFilePath || "",
        localAudioDurationMs: this.recordingDurationMs
      };
      this.clearProcessingTimers();

      if (!this.isPageActive || submissionToken !== this.activeSubmissionToken || this.data.submissionTimedOut) {
        return;
      }

      wx.redirectTo({
        url: "/pages/feedback/feedback"
      });
    } catch (error) {
      this.clearProcessingTimers();
      this.setData({
        status: "submit_failed",
        uploadStatusMessage: "",
        errorMessage: error.message || "提交失败了，请重新试一次。",
        canRetrySubmit: Boolean(this.tempFilePath || this.data.transcriptText.trim())
      });
    }
  },

  submitRecognizedTranscript() {
    this.submitAttempt();
  },

  async skipToNextQuestion() {
    const { question, isLoadingNextQuestion } = this.data;

    if (!question || isLoadingNextQuestion) {
      return;
    }

    this.stopRecordedAnswerPlayback();
    this.setData({
      isLoadingNextQuestion: true,
      errorMessage: ""
    });

    try {
      const response = await fetchNextQuestion(question.id);
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
        errorMessage: error.message || "切换下一题失败，请稍后重试。"
      });
    }
  },

  startProcessingTimers(submissionToken) {
    this.clearProcessingTimers();

    this.processingHintTimer = setTimeout(() => {
      if (this.data.status === "uploading" && submissionToken === this.activeSubmissionToken) {
        this.setData({
          uploadStatusMessage: "还在分析你的回答，再等一下..."
        });
      }
    }, 8000);

    this.processingTimeoutTimer = setTimeout(() => {
      if (this.data.status === "uploading" && submissionToken === this.activeSubmissionToken) {
        this.setData({
          status: "submit_failed",
          uploadStatusMessage: "",
          errorMessage: "处理时间有点长，这次先失败了，请重新试一次。",
          canRetrySubmit: Boolean(this.tempFilePath || this.data.transcriptText.trim()),
          submissionTimedOut: true
        });
      }
    }, 15000);
  },

  retrySubmitAttempt() {
    this.submitAttempt();
  },

  clearProcessingTimers() {
    clearTimeout(this.processingHintTimer);
    clearTimeout(this.processingTimeoutTimer);
    this.processingHintTimer = null;
    this.processingTimeoutTimer = null;
  },

  destroyAnswerAudioContext() {
    if (!this.answerAudioContext) {
      return;
    }

    this.answerAudioContext.stop();
    this.answerAudioContext.destroy();
    this.answerAudioContext = null;
  },

  onUnload() {
    this.isPageActive = false;
    clearInterval(this.timer);
    this.stopLiveHintMonitor();
    this.clearProcessingTimers();
    this.destroyAnswerAudioContext();
    this.liveRecognitionSession = null;
    if (activeRecorderPage === this) {
      activeRecorderPage = null;
    }
  },

  onHide() {
    this.isPageActive = false;
    this.stopLiveHintMonitor();
    this.stopRecordedAnswerPlayback();
    this.destroyAnswerAudioContext();
    this.liveRecognitionSession = null;
    if (activeRecorderPage === this) {
      activeRecorderPage = null;
    }
  },

  onShow() {
    this.isPageActive = true;
    activeRecorderPage = this;
    this.setData({
      isLoadingNextQuestion: false
    });
  }
});
