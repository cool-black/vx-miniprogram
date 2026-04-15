# 雅思口语微信小程序 v0.5 练习增强版技术方案

## 1. 目标

这份技术文档服务于 v0.5 练习增强版，覆盖 4 个需求：

1. 下一题
2. 音频播放能力
3. 推荐完整回答升级
4. 实时识别

目标是在尽量复用当前代码结构的前提下，用最小扩展把这些能力补齐，并为后续 `git worktree` 并行开发提供明确拆分。

## 2. What already exists

- `backend/src/services/question-service.js`
  - 已支持 `getTodayQuestion()`
  - 已支持 `getQuestionById(questionId)`
- `backend/src/content/questions.json`
  - 已有 15 道题和 `sampleAnswer`
- `miniprogram/pages/home`
  - 已有取题和进入录音流程
- `miniprogram/pages/recorder`
  - 已有录音、提交、识别文本编辑
- `miniprogram/services/speech-provider.js`
  - 已有腾讯 ASR websocket 会话基础
- `miniprogram/pages/feedback`
  - 已有反馈结果和“再答一次”

结论：

这次不是重做架构，而是在已有链路上做 4 条增量扩展。

## 3. 总体方案

### 3.1 模块增量

```text
Home
  -> today question
  -> next question
  -> optional prompt audio

Recorder
  -> live recognition
  -> local answer playback
  -> submit attempt

Feedback
  -> feedback
  -> recommended answer
  -> optional recommended answer audio
  -> next question
  -> replay own answer
```

### 3.2 设计原则

- 优先复用现有页面，不新增复杂导航层
- 录音播放优先用本地文件回放
- TTS 抽象成独立能力层，不把第三方调用直接塞进页面
- 实时识别逻辑封装在 `speech-provider` 层

## 4. 产品拆分对应的技术解法

## 4.1 下一题

### 方案

后端新增下一题选择能力，前端在首页和反馈页暴露入口。

### 建议接口

```text
GET /questions/next?after=<questionId>
```

### 响应

```json
{
  "question": {
    "id": "part1_music_001",
    "topic": "music",
    "prompt": "Do you like listening to music?",
    "hint": "Yes, I do. I usually listen to... when...",
    "keywords": ["relax", "pop", "commute"],
    "recommendedAnswer": "Yes, I do. I usually listen to music when I want to relax or when I am on the way to school.",
    "audio": {
      "promptAudioUrl": null,
      "recommendedAnswerAudioUrl": null
    }
  }
}
```

### 实现建议

- `question-service` 增加 `getNextQuestion(afterQuestionId)`
- 规则可先做简单循环，不引入推荐系统
- 首页增加“换一题”
- 反馈页增加“下一题”

## 4.2 听自己的回答

### 方案

优先使用录音产生的本地临时文件进行回放。

### 原因

- 不依赖后端二次下载
- 实现快
- 真机体验直观

### 前端实现

- 录音页保留 `tempFilePath`
- 提交成功后，把 `localAudioFilePath` 挂到 `latestAttempt`
- 反馈页使用 `wx.createInnerAudioContext()` 回放

### 风险

- 如果用户离开当前会话太久，本地临时文件可能失效
- 这版先接受这个限制，不扩展为永久存储播放

## 4.3 推荐完整回答

### 方案

把当前 `sampleAnswer` 升级为正式字段：

```ts
recommendedAnswer: string
```

### 改动

- question schema 里保留兼容，但统一前端显示为“推荐完整回答”
- `POST /practice-attempts` 响应中返回 `recommendedAnswer`
- 反馈页显式展示这一块

### 注意

不要继续在 UI 上叫“参考答案”，因为这会弱化它的指导性。

## 4.4 题目音频 / 推荐回答音频

### 现实判断

当前仓库没有 TTS 能力。

因此需要先抽象，再决定实现方式。

### 建议抽象

新增音频能力层：

```ts
type QuestionAudioPayload = {
  promptAudioUrl: string | null;
  recommendedAnswerAudioUrl: string | null;
};
```

### 可选实现路径

#### 路径 A，预生成音频

- 在内容侧为每道题生成音频文件
- 后端直接返回音频 URL

优点：
- 播放稳定
- 成本和延迟更可控

缺点：
- 内容改动时要重新生成音频

#### 路径 B，动态 TTS

- 后端接入 TTS 服务
- 首次请求时生成并缓存

优点：
- 灵活

缺点：
- 依赖外部服务
- 更容易引入慢请求和失败路径

### 推荐

第一轮推荐走：

`先预留 schema -> 再决定是否引入预生成音频`

不要在当前代码里硬接一个未验证的 TTS 服务。

## 4.5 实时识别

### 当前状态

当前是：

```text
record audio -> stop -> read file -> send chunks -> receive transcript
```

### 目标状态

改为：

```text
start recording
  -> open ASR session
  -> stream recorded frames while user speaks
  -> receive partial transcript
  -> update textarea incrementally
stop recording
  -> finalize ASR session
  -> submit transcript + audio
```

### 模块改造点

- `miniprogram/services/speech-provider.js`
  - 从“录后识别”升级为“流式会话管理”
- `miniprogram/services/recorder.js`
  - 增加录音帧事件支持
- `miniprogram/pages/recorder/recorder.js`
  - 增加录音中 partial transcript 更新
  - 增加实时识别失败回退逻辑

### 状态机

```text
idle
  -> recording
  -> live_recognizing
  -> recorded
  -> recognized
  -> uploading
  -> ready / failed
```

### 失败回退

- 腾讯流式识别失败
  -> 保留已录音频
  -> 允许用户手动编辑 transcript
  -> 仍可提交反馈

### 性能目标

- 录音中 1 到 2 秒内开始出现 partial transcript
- 停止录音后 2 秒内完成最终文本整理

## 5. API / Schema 变更

## 5.1 Question schema

建议从：

```ts
type Question = {
  id: string;
  part: "part1";
  topic: string;
  prompt: string;
  hint: string;
  keywords: string[];
  sampleAnswer: string;
};
```

升级为：

```ts
type Question = {
  id: string;
  part: "part1";
  topic: string;
  prompt: string;
  hint: string;
  keywords: string[];
  recommendedAnswer: string;
  audio?: {
    promptAudioUrl: string | null;
    recommendedAnswerAudioUrl: string | null;
  };
};
```

### 兼容策略

- 后端读取时兼容旧字段 `sampleAnswer`
- 响应层统一输出 `recommendedAnswer`

## 5.2 PracticeAttemptResponse

建议升级为：

```ts
type PracticeAttemptResponse = {
  attemptId: string;
  question: {
    id: string;
    topic: string;
    prompt: string;
    hint: string;
    keywords: string[];
    audio?: {
      promptAudioUrl: string | null;
      recommendedAnswerAudioUrl: string | null;
    };
  };
  transcript: string;
  feedback: {
    overall: string;
    relevance: string;
    length: string;
    naturalness: string;
  };
  recommendedAnswer: string;
  localAudioFilePath?: string;
  retryToken: string;
};
```

## 6. Failure Modes

| New codepath | Failure mode | Test needed | Error handling | User-visible |
|-------------|--------------|-------------|----------------|--------------|
| next question API | current question id invalid | yes | yes | yes |
| own answer replay | local temp file expired | yes | yes | yes |
| question audio | audio url empty | yes | yes | yes |
| recommended answer audio | TTS missing / asset missing | yes | yes | yes |
| live recognition | socket open fails | yes | yes | yes |
| live recognition | partial transcript disorder | yes | partial | yes |
| live recognition | stop recording before final packet | yes | yes | yes |

### Critical gaps

- 如果直接做“音频播放按钮”但不校验音频 URL，会形成静默失败
- 如果实时识别没有回退到手动 transcript，会在腾讯链路失败时直接堵死主流程

## 7. Test Plan

## 7.1 功能测试

- 首页点击“换一题”后，题目切换成功
- 反馈页点击“下一题”后，新的题目上下文生效
- 录音页可回放自己的回答
- 反馈页可回放自己的回答
- 推荐完整回答正确显示

## 7.2 音频相关测试

- 音频按钮无 URL 时不崩
- 本地录音文件回放正常
- 真机环境下回放正常

## 7.3 实时识别测试

- 录音开始后出现 partial transcript
- 录音停止后 transcript 最终定稿
- 腾讯识别失败时可切回手动编辑
- 弱网下仍可提交录音和文本

## 8. NOT in Scope

- 永久保存录音并长期回放
- 完整题库浏览器
- 历史练习播放列表
- TTS 供应商抽象到多厂商切换
- 发音评分和逐词纠错

## 9. Worktree Parallelization Strategy

### Dependency table

| Step | Modules touched | Depends on |
|------|----------------|------------|
| next question flow | `backend/src/services`, `backend/src/server`, `miniprogram/pages/home`, `miniprogram/pages/feedback`, `miniprogram/services` | — |
| answer playback | `miniprogram/pages/recorder`, `miniprogram/pages/feedback`, `miniprogram/services` | — |
| recommended answer upgrade | `backend/src/content`, `backend/src/services`, `miniprogram/pages/feedback` | — |
| audio schema / TTS abstraction | `backend/src/schemas`, `backend/src/services`, `miniprogram/pages/home`, `miniprogram/pages/feedback` | recommended answer upgrade |
| live recognition | `miniprogram/services/speech-provider`, `miniprogram/services/recorder`, `miniprogram/pages/recorder` | — |
| docs / QA sync | repo root docs | all feature lanes |

### Parallel lanes

- Lane A: next question flow
- Lane B: answer playback + feedback UI upgrade
- Lane C: live recognition
- Lane D: audio schema / TTS abstraction
- Lane E: docs / QA sync

### Execution order

- 先启动 A + B + C 并行
- A/B/C 合并后再做 D
- 最后做 E 收口

### Conflict flags

- Lane B 和 Lane C 都会碰 `miniprogram/pages/recorder`
- Lane A 和 Lane D 都会碰 `miniprogram/pages/feedback`
- Lane D 和内容字段升级会碰 `backend/src/services`

建议：

- A/B/C 用 worktree 并行，但提前约定文件所有权
- D 放在第二批，避免一开始就和多个 lane 冲突

## 10. 实施建议

建议分两步：

### 第一批先做

- 下一题
- 听自己的回答
- 推荐完整回答强化
- 实时识别

### 第二批再做

- 题目音频
- 推荐回答音频

原因很简单：

第一批能直接提升练习体验，而且依赖现有基础能力。

第二批依赖 TTS 决策，不适合在没有技术选型确认前直接下代码。
