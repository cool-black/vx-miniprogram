# 雅思口语微信小程序 v0 技术实现文档

## 1. 文档目标

这份文档服务于 v0 开发落地。

它不再讨论产品方向，而是锁定下面这些实现问题：

- 前后端怎么分工
- 接口怎么定义
- 页面有哪些状态
- 数据结构长什么样
- 哪些失败要兜底
- 第一版应该怎么测

这份文档默认以 [PRD.md](d:\chi\ai\test-gstack\PRD.md) 为上游输入。

## 2. v0 技术目标

v0 只跑通一个闭环：

`看题 -> 录音 -> 上传 -> 转写 -> 生成反馈 -> 展示反馈 -> 再答一次`

技术目标不是“系统完整”，而是：

- 链路稳定
- 返回结构稳定
- 失败时不静默
- 前后端边界清楚

## 3. 总体架构

### 3.1 模块划分

建议分成 4 个模块：

- `miniprogram/`
  - 微信小程序页面、状态管理、录音能力、接口请求
- `backend/`
  - API、业务编排、schema 校验、失败兜底
- `content/`
  - 题目种子数据
- `shared/` 或后端内部 schema 定义
  - question schema
  - feedback response schema

### 3.2 架构原则

- 前端不直接消费模型原始输出
- 后端拥有 API contract
- 题目数据有唯一 canonical schema
- 失败必须转换成用户可理解的状态

### 3.3 请求处理图

```text
+-------------+        +----------------+        +------------------+
| MiniProgram | -----> | Backend API    | -----> | Speech To Text   |
+-------------+        +----------------+        +------------------+
       |                       |
       |                       +-------------> +------------------+
       |                                      | Feedback Builder |
       |                                      +------------------+
       |
       <------------- normalized response -----------------------+
```

## 4. 目录建议

建议从一开始就按职责分开，不要把所有东西扔进一个目录。

```text
project-root/
  PRD.md
  TECH_SPEC.md
  miniprogram/
    app.js
    app.json
    app.wxss
    pages/
      home/
      recorder/
      feedback/
    services/
      api.ts
      recorder.ts
    utils/
      error.ts
      state.ts
  backend/
    src/
      app.ts
      routes/
        questions.ts
        practice-attempts.ts
      services/
        question-service.ts
        transcription-service.ts
        feedback-service.ts
        practice-service.ts
      schemas/
        question-schema.ts
        feedback-schema.ts
        api-schema.ts
      adapters/
        stt-adapter.ts
        llm-adapter.ts
      content/
        questions.json
```

如果你后面选的是云开发或其他框架，目录名可以变，但职责边界不要变。

## 5. 核心数据模型

### 5.1 Question

题目是内容源头，所有种子题必须遵循同一结构。

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

约束：

- `id` 全局唯一
- `part` 在 v0 固定为 `part1`
- `keywords` 数量建议 2 到 3 个
- `sampleAnswer` 不能太长，避免像书面范文

### 5.2 PracticeAttempt

一条用户口语尝试记录。

```ts
type PracticeAttempt = {
  id: string;
  userId: string;
  questionId: string;
  audioUrl: string;
  transcript: string | null;
  status: "uploaded" | "transcribed" | "feedback_ready" | "failed";
  isRetry: boolean;
  parentAttemptId: string | null;
  createdAt: string;
};
```

说明：

- `isRetry` 用于标识是否为第二次作答
- `parentAttemptId` 用于串联第一次和第二次作答
- 即使 v0 不做历史记录，也建议后端保留 attempt 记录，方便排查和验证数据

### 5.3 FeedbackPayload

前端最终消费的反馈对象。

```ts
type FeedbackPayload = {
  overall: string;
  relevance: string;
  length: string;
  naturalness: string;
};
```

要求：

- 每个字段都必须是短句
- 不允许返回数组、长段落、富文本
- 字段缺失时由后端兜底

### 5.4 PracticeAttemptResponse

`POST /practice-attempts` 成功时返回的标准结构。

```ts
type PracticeAttemptResponse = {
  attemptId: string;
  question: {
    id: string;
    topic: string;
    prompt: string;
    hint: string;
    keywords: string[];
  };
  transcript: string;
  feedback: FeedbackPayload;
  sampleAnswer: string;
  retryToken: string;
};
```

说明：

- `sampleAnswer` 从 question 派生
- `retryToken` 用于再答一次时复用题目上下文

## 6. API 设计

### 6.1 `GET /questions/today`

用途：
返回当前给前端展示的题目。

v0 可以简单实现为：

- 先从 10 到 20 道种子题中按固定规则取题
- 甚至可以临时固定返回 1 道题

响应示例：

```json
{
  "question": {
    "id": "part1_hometown_001",
    "topic": "hometown",
    "prompt": "Do you like your hometown?",
    "hint": "Yes, I do. The main reason is... Also...",
    "keywords": ["comfortable", "familiar", "food"]
  }
}
```

### 6.2 `POST /practice-attempts`

用途：
提交音频并返回标准化反馈。

请求形式建议：

- `multipart/form-data`
- 字段包含：
  - `audio`
  - `questionId`
  - `retryToken`，首次为空

处理流程：

1. 校验 `questionId`
2. 存储音频
3. 调用转写服务
4. 调用反馈生成服务
5. 校验并规范化反馈结构
6. 返回统一 response schema

成功响应示例：

```json
{
  "attemptId": "attempt_001",
  "question": {
    "id": "part1_hometown_001",
    "topic": "hometown",
    "prompt": "Do you like your hometown?",
    "hint": "Yes, I do. The main reason is... Also...",
    "keywords": ["comfortable", "familiar", "food"]
  },
  "transcript": "Yes, I do. I really like my hometown because...",
  "feedback": {
    "overall": "你已经开口并回答了核心问题，下一次可以说得更完整一些。",
    "relevance": "你基本围绕题目在回答，没有明显跑题。",
    "length": "答案偏短，可以多补一个原因或例子。",
    "naturalness": "表达能听懂，但有些句子有点像中文直译。"
  },
  "sampleAnswer": "Yes, I do. I really like my hometown because it is comfortable and familiar to me.",
  "retryToken": "retry_abc123"
}
```

### 6.3 `POST /practice-attempts/retry`

可选方案。

如果不想单独建 retry 接口，也可以继续复用 `POST /practice-attempts`，只是在请求中带上：

- `retryToken`
- `parentAttemptId`

v0 推荐做法：

- 只保留一个 `POST /practice-attempts`
- 通过 `retryToken` 和 `parentAttemptId` 区分首次与重答

这样接口更少，流程更直。

## 7. 前端页面状态

### 7.1 首页状态

首页只需要这几个状态：

```text
idle -> loading_question -> ready -> load_failed
```

状态说明：

- `idle`：页面初始化
- `loading_question`：请求题目中
- `ready`：题目可展示，允许开始录音
- `load_failed`：题目获取失败，展示重试按钮

### 7.2 录音页状态

```text
idle -> permission_check -> recording -> recorded -> uploading -> failed
```

状态说明：

- `permission_check`：检查并请求麦克风权限
- `recording`：用户正在录音
- `recorded`：本地录音完成，等待提交
- `uploading`：上传并等待后端处理
- `failed`：权限、上传或接口失败

### 7.3 反馈页状态

```text
loading_feedback -> ready -> retrying -> failed
```

状态说明：

- `loading_feedback`：等待后端分析
- `ready`：展示 transcript、feedback、sample answer
- `retrying`：发起第二次录音
- `failed`：反馈无法展示，提示用户重试

## 8. 服务端处理流程

### 8.1 单次作答处理流水线

```text
receive request
  -> validate input
  -> resolve question
  -> save audio
  -> transcribe audio
  -> build feedback prompt context
  -> call LLM
  -> validate response schema
  -> normalize fallback fields if needed
  -> persist attempt
  -> return response
```

### 8.2 反馈生成输入

反馈服务至少要拿到：

- 题目 prompt
- 题目 hint
- 题目 keywords
- 题目 sampleAnswer
- 用户 transcript

这样模型才知道：

- 用户本来在答什么
- 用户有没有围绕题目
- 应该往什么风格纠偏

### 8.3 反馈生成输出约束

模型原始输出必须被约束成固定 JSON。

建议内部目标结构：

```json
{
  "overall": "string",
  "relevance": "string",
  "length": "string",
  "naturalness": "string"
}
```

后端校验规则：

- 4 个字段必须都存在
- 值必须是字符串
- 每个字段长度限制在合理范围，例如 10 到 80 个字
- 超出长度或缺失时触发 fallback

## 9. 失败处理

### 9.1 错误分类

建议统一分成 4 类：

- `permission_denied`
- `upload_failed`
- `transcription_failed`
- `feedback_failed`

### 9.2 前端错误展示原则

- 错误提示要说人话
- 提示用户下一步动作
- 不展示原始异常栈

示例：

- 录音权限失败：请允许麦克风权限后再试一次
- 上传失败：网络不太稳定，请重新提交这次回答
- 转写失败：这次没有成功识别到你的回答，可以再试一次
- 反馈失败：回答已收到，但分析失败了，请重新生成反馈

### 9.3 后端兜底原则

任何时候都不要把不完整结构直接交给前端。

如果 LLM 返回结构不合法，可以采用以下顺序处理：

1. 尝试二次解析和字段补齐
2. 不行则返回明确失败状态
3. 必要时返回一个安全默认反馈结构

安全默认结构示例：

```json
{
  "overall": "你已经完成了一次回答，可以再试一次让答案更完整。",
  "relevance": "系统暂时无法稳定分析切题情况，请重新提交一次。",
  "length": "系统暂时无法稳定分析长度表现，请重新提交一次。",
  "naturalness": "系统暂时无法稳定分析表达自然度，请重新提交一次。"
}
```

## 10. 性能预算

### 10.1 用户可感知预算

- 目标：提交后 5 秒内看到反馈
- 8 秒后：显示处理中提示
- 15 秒后：提示失败并给重试入口

### 10.2 分阶段耗时建议

粗略预算如下：

- 上传音频：1 到 2 秒
- 语音转写：1 到 3 秒
- 反馈生成：1 到 3 秒

这不是死指标，但如果总耗时长期超过 8 秒，体验会明显变差。

## 11. 页面与接口映射

```text
Home Page
  -> GET /questions/today

Recorder Page
  -> use current question
  -> local audio capture
  -> POST /practice-attempts

Feedback Page
  -> render PracticeAttemptResponse
  -> retry using question.id + retryToken + parentAttemptId
```

## 12. 最小测试计划

### 12.1 后端测试

至少覆盖：

- question schema 解析成功
- 非法 questionId 返回错误
- feedback schema 校验成功
- feedback schema 缺字段时触发 fallback
- transcription 失败时返回可识别错误码
- retry 请求保留同一 questionId

### 12.2 前端测试

至少覆盖：

- 首页成功拉到题目
- 用户拒绝录音权限后的提示
- 上传过程中 loading 状态正确显示
- 反馈返回后页面能正常渲染
- 错误态下用户能点击重试

### 12.3 手工冒烟测试

最少跑这 5 条：

1. 首次打开，小程序成功显示题目
2. 正常录音并看到反馈
3. 拒绝麦克风权限后能得到明确提示
4. 模拟后端返回错误时，前端不白屏
5. 再答一次后仍然是同一道题

## 13. 实现顺序

### 13.1 推荐顺序

1. 先定 `Question` schema 和 10 到 20 道种子题
2. 搭后端 `GET /questions/today`
3. 搭前端首页和录音页空壳
4. 跑通本地录音和上传
5. 接通转写
6. 接通反馈生成
7. 加 schema 校验与失败兜底
8. 做反馈页与 retry
9. 做最小测试和手工验证

### 13.2 不建议的顺序

不要先做：

- UI polish
- 分享页
- 用户系统扩展
- 内容后台

这些都不会帮助验证核心闭环。

## 14. 并行开发建议

如果要并行做，按下面拆最合理。

### Lane A，内容与契约

- Question schema
- 题目种子数据
- Feedback response schema

### Lane B，小程序前端

- 首页
- 录音页
- 反馈页基础渲染
- 错误态展示

### Lane C，后端流程

- questions 接口
- practice-attempts 接口
- 转写适配
- feedback 适配
- schema 校验

执行顺序：

- 先 A
- A 稳定后，B 和 C 并行
- 最后联调 retry

## 15. 明确不做

这份技术方案不覆盖以下内容：

- 生产级监控体系
- 大规模用户鉴权设计
- 完整数据库设计
- 运营后台
- A/B 实验系统
- 分享裂变系统

这些不是 v0 现在该承担的复杂度。

## 16. 开工前最终确认

开始搭项目之前，只需要最后确认这几件事：

- 小程序技术栈选什么
- 后端技术栈选什么
- 语音转写服务选什么
- 反馈生成模型选什么
- 音频文件临时存储怎么做

如果这些没有特别限制，可以先选实现最快的组合，优先把闭环做出来。
