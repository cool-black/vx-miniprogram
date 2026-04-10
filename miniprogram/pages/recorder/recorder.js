const {
  createPracticeAttempt,
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
    isRetry: false,
    retryToken: "",
    parentAttemptId: "",
    canRetrySubmit: false,
    submissionTimedOut: false
  },

  timer: null,
  processingHintTimer: null,
  processingTimeoutTimer: null,
  recorder: null,
  tempFilePath: "",
  recordingDurationMs: 0,
  isPageActive: false,
  speechProvider: null,
  activeSubmissionToken: 0,

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
      isRetry,
      retryToken: isRetry ? latestAttempt?.retryToken || "" : "",
      parentAttemptId: isRetry ? latestAttempt?.attemptId || "" : ""
    });
  },

  onTranscriptInput(event) {
    this.setData({
      transcriptText: event.detail.value
    });
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

    recorderEventsBound = true;
  },

  handleRecorderStop(result) {
    if (!this.isPageActive) return;
    this.tempFilePath = result.tempFilePath || "";
    this.recordingDurationMs = result.duration || Math.max((45 - this.data.seconds) * 1000, 1000);
    clearInterval(this.timer);
    this.setData({
      status: "recorded",
      countdownLabel: "录音完成",
      canRetrySubmit: false,
      submissionTimedOut: false
    });
    this.handleRecognitionAfterRecording();
  },

  handleRecorderError() {
    if (!this.isPageActive) return;
    clearInterval(this.timer);
    this.setData({
      status: "submit_failed",
      uploadStatusMessage: "",
      errorMessage: "录音失败了，请重新试一次。",
      canRetrySubmit: false
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
      this.tempFilePath = "";
      this.recordingDurationMs = 0;
      await authorizeRecordScope();
      this.setData({
        status: "recording",
        permissionDenied: false,
        errorMessage: "",
        uploadStatusMessage: "",
        recognitionStatus: "",
        transcriptText: "",
        seconds: 45,
        countdownLabel: "45s",
        canRetrySubmit: false,
        submissionTimedOut: false
      });
      this.startCountdown();
      this.recorder.start({
        duration: 45000,
        format: "mp3"
      });
    } catch {
      this.setData({
        status: "permission_failed",
        permissionDenied: true,
        uploadStatusMessage: "",
        errorMessage: "录音权限被拒绝了，请打开权限设置后再试一次。",
        canRetrySubmit: false
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
    if (!this.speechProvider || this.speechProvider.mode === "manual") {
      this.setData({
        status: "recognized",
        recognitionStatus: "当前是手动转写模式，请检查或填写识别文本后再提交。"
      });
      return;
    }

    this.setData({
      status: "recognizing",
      recognitionStatus: "正在调用腾讯云识别..."
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

      getApp().globalData.latestAttempt = response;
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

  onUnload() {
    this.isPageActive = false;
    clearInterval(this.timer);
    this.clearProcessingTimers();
    if (activeRecorderPage === this) {
      activeRecorderPage = null;
    }
  },

  onHide() {
    this.isPageActive = false;
    if (activeRecorderPage === this) {
      activeRecorderPage = null;
    }
  },

  onShow() {
    this.isPageActive = true;
    activeRecorderPage = this;
  }
});
