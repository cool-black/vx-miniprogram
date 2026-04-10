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
    async recognize() {
      return {
        transcript: "",
        source: "manual"
      };
    }
  };
}

function createTencentProvider({ fetchTencentSession }) {
  return {
    mode: "tencent",
    isAvailable() {
      return typeof wx.connectSocket === "function";
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
                transcript: Array.from(transcriptByIndex.entries())
                  .sort(([left], [right]) => left - right)
                  .map(([, item]) => item)
                  .join("")
                  .trim(),
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
              transcript: Array.from(transcriptByIndex.entries())
                .sort(([left], [right]) => left - right)
                .map(([, item]) => item)
                .join("")
                .trim(),
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
