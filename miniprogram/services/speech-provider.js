const { readFileAsArrayBuffer } = require("../utils/file");

function sliceArrayBuffer(buffer, chunkSize) {
  const chunks = [];
  let offset = 0;

  while (offset < buffer.byteLength) {
    chunks.push(buffer.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }

  return chunks;
}

function buildAudioChunks(buffer, durationMs) {
  const safeDurationMs = Math.max(Number(durationMs) || 1000, 1000);
  const expectedChunkCount = Math.max(Math.ceil(safeDurationMs / 200), 1);
  const chunkSize = Math.max(Math.ceil(buffer.byteLength / expectedChunkCount), 1024);
  return sliceArrayBuffer(buffer, chunkSize);
}

function createManualProvider() {
  return {
    mode: "manual",
    isAvailable() {
      return true;
    },
    supportsLiveRecognition() {
      return false;
    },
    async recognize() {
      return {
        transcript: "",
        source: "manual"
      };
    }
  };
}

function createTencentProvider({ fetchTencentSession }) {
  const LIVE_END_SETTLE_MS = 450;

  function collectTranscript(transcriptByIndex) {
    return Array.from(transcriptByIndex.entries())
      .sort(([left], [right]) => left - right)
      .map(([, item]) => item)
      .join("")
      .trim();
  }

  async function createLiveRecognitionSession({
    onStatus,
    onPartialTranscript,
    onFailure
  }) {
    const session = await fetchTencentSession();
    const transcriptByIndex = new Map();
    const pendingFrames = [];
    const socketTask = wx.connectSocket({
      url: session.wsUrl,
      timeout: 20000
    });

    let socketOpen = false;
    let stopped = false;
    let completed = false;
    let endSignalSent = false;
    let stopTimer = null;
    let lastFrameAt = Date.now();

    let resolveFinalResult = null;
    let rejectFinalResult = null;

    const finalResultPromise = new Promise((resolve, reject) => {
      resolveFinalResult = resolve;
      rejectFinalResult = reject;
    });

    const finish = (payload) => {
      if (completed) return;
      completed = true;
      clearTimeout(stopTimer);
      stopTimer = null;
      try {
        socketTask.close({});
      } catch {}

      if (payload instanceof Error) {
        if (typeof onFailure === "function") {
          onFailure(payload);
        }
        rejectFinalResult(payload);
        return;
      }

      resolveFinalResult(payload);
    };

    const scheduleEndSignal = () => {
      clearTimeout(stopTimer);

      if (!stopped || completed || endSignalSent) {
        return;
      }

      stopTimer = setTimeout(() => {
        sendEndSignalIfNeeded();
      }, LIVE_END_SETTLE_MS);
    };

    const sendEndSignalIfNeeded = () => {
      if (!socketOpen || completed || !stopped || endSignalSent || pendingFrames.length > 0) {
        return;
      }

      const quietForMs = Date.now() - lastFrameAt;
      if (quietForMs < LIVE_END_SETTLE_MS) {
        scheduleEndSignal();
        return;
      }

      endSignalSent = true;
      socketTask.send({
        data: JSON.stringify({ type: "end" }),
        fail: () => finish(new Error("实时识别结束信号发送失败。"))
      });
    };

    const flushPendingFrames = () => {
      if (!socketOpen || completed) return;

      while (pendingFrames.length > 0) {
        const frame = pendingFrames.shift();
        socketTask.send({
          data: frame,
          success: () => {
            lastFrameAt = Date.now();
            if (stopped) {
              scheduleEndSignal();
            }
          },
          fail: () => finish(new Error("实时音频分片发送失败。"))
        });
      }

      if (stopped) {
        scheduleEndSignal();
      }
    };

    socketTask.onOpen(() => {
      socketOpen = true;
      if (typeof onStatus === "function") {
        onStatus("实时识别已连接，边说边转文字...");
      }
      flushPendingFrames();
    });

    socketTask.onMessage((event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.code && payload.code !== 0) {
          finish(new Error(payload.message || "腾讯云实时识别失败。"));
          return;
        }

        const result = payload?.result;
        const text = result?.voice_text_str || "";

        if (text) {
          const resultIndex = Number.isInteger(result?.index)
            ? result.index
            : transcriptByIndex.size;
          transcriptByIndex.set(resultIndex, text);

          const mergedTranscript = collectTranscript(transcriptByIndex);
          if (typeof onPartialTranscript === "function") {
            onPartialTranscript(mergedTranscript);
          }
          if (typeof onStatus === "function") {
            onStatus("正在实时识别，你可以边说边看文字。");
          }
        }

        if (Number(payload.final) === 1) {
          finish({
            transcript: collectTranscript(transcriptByIndex),
            source: "tencent-live"
          });
        }
      } catch {
        finish(new Error("实时识别结果解析失败。"));
      }
    });

    socketTask.onError(() => {
      finish(new Error("腾讯云实时识别连接失败。"));
    });

    socketTask.onClose(() => {
      if (!completed && transcriptByIndex.size > 0) {
        finish({
          transcript: collectTranscript(transcriptByIndex),
          source: "tencent-live"
        });
      } else if (!completed && stopped) {
        finish(new Error("腾讯云实时识别过早关闭。"));
      }
    });

    return {
      appendAudioFrame(frameBuffer) {
        if (completed || !frameBuffer) return;
        lastFrameAt = Date.now();
        pendingFrames.push(frameBuffer);
        flushPendingFrames();
      },
      stop() {
        if (completed) {
          return Promise.resolve({
            transcript: collectTranscript(transcriptByIndex),
            source: "tencent-live"
          });
        }

        stopped = true;
        flushPendingFrames();
        scheduleEndSignal();
        return finalResultPromise;
      }
    };
  }

  return {
    mode: "tencent",
    isAvailable() {
      return typeof wx.connectSocket === "function";
    },
    supportsLiveRecognition() {
      return true;
    },
    async startLiveRecognition(options = {}) {
      return createLiveRecognitionSession(options);
    },
    async recognize({ filePath, durationMs, onStatus }) {
      const session = await fetchTencentSession();
      const audioBuffer = await readFileAsArrayBuffer(filePath);
      const chunks = buildAudioChunks(audioBuffer, durationMs);

      return new Promise((resolve, reject) => {
        const transcriptByIndex = new Map();
        const socketTask = wx.connectSocket({
          url: session.wsUrl,
          timeout: 20000
        });

        let index = 0;
        let completed = false;

        const finish = (payload) => {
          if (completed) return;
          completed = true;
          try {
            socketTask.close({});
          } catch {}
          if (payload instanceof Error) {
            reject(payload);
            return;
          }
          resolve(payload);
        };

        const sendNext = () => {
          if (index >= chunks.length) {
            socketTask.send({
              data: JSON.stringify({ type: "end" })
            });
            return;
          }

          socketTask.send({
            data: chunks[index],
            success: () => {
              index += 1;
              setTimeout(sendNext, 200);
            },
            fail: () => finish(new Error("音频分片发送失败。"))
          });
        };

        socketTask.onOpen(() => {
          if (typeof onStatus === "function") {
            onStatus("腾讯云识别连接成功，正在发送音频...");
          }
          sendNext();
        });

        socketTask.onMessage((event) => {
          try {
            const payload = JSON.parse(event.data);

            if (payload.code && payload.code !== 0) {
              finish(new Error(payload.message || "腾讯云识别失败。"));
              return;
            }

            const result = payload?.result;
            const text = result?.voice_text_str || "";
            if (text) {
              const resultIndex = Number.isInteger(result?.index) ? result.index : transcriptByIndex.size;
              transcriptByIndex.set(resultIndex, text);
              if (typeof onStatus === "function") {
                onStatus("识别中，文本已更新。");
              }
            }

            if (Number(payload.final) === 1) {
              finish({
                transcript: collectTranscript(transcriptByIndex),
                source: "tencent"
              });
            }
          } catch {
            finish(new Error("识别结果解析失败。"));
          }
        });

        socketTask.onError(() => {
          finish(new Error("腾讯云识别连接失败。"));
        });

        socketTask.onClose(() => {
          if (!completed && transcriptByIndex.size > 0) {
            finish({
              transcript: collectTranscript(transcriptByIndex),
              source: "tencent"
            });
          }
        });
      });
    }
  };
}

function createSpeechProvider({ mode, fetchTencentSession }) {
  if (mode === "tencent") {
    return createTencentProvider({ fetchTencentSession });
  }

  return createManualProvider();
}

module.exports = {
  createSpeechProvider
};
