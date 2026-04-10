# 雅思口语微信小程序 v0 开发拆解

## 1. 文档目标

这份文档继续承接 [PRD.md](d:\chi\ai\test-gstack\PRD.md) 和 [TECH_SPEC.md](d:\chi\ai\test-gstack\TECH_SPEC.md)。

它只做三件事：

- 把接口拆成更细的字段表
- 把页面状态拆成可实现的状态表
- 把开发工作拆成按顺序可执行的 checklist

这份文档默认目标是：让我们下一步开工时，不需要再自己补脑接口和状态流转。

## 2. API 细表

### 2.1 `GET /questions/today`

用途：
返回首页展示题目。

#### 请求

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | string | 否 | v0 可选，用于后续支持按用户分题 |

#### 成功响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question.id` | string | 是 | 题目唯一 ID |
| `question.topic` | string | 是 | 题目主题 |
| `question.prompt` | string | 是 | 题目正文 |
| `question.hint` | string | 是 | 回答骨架 |
| `question.keywords` | string[] | 是 | 关键词列表 |

#### 成功响应示例

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

#### 失败响应

| 场景 | HTTP | code | 前端提示 |
|------|------|------|----------|
| 服务异常 | 500 | `question_load_failed` | 题目加载失败，请稍后重试 |
| 无可用题目 | 503 | `question_unavailable` | 现在没有可用题目，请稍后再试 |

### 2.2 `POST /practice-attempts`

用途：
提交音频并获取反馈。

#### 请求方式

- `multipart/form-data`

#### 请求字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `audio` | file | 是 | 用户录音文件 |
| `questionId` | string | 是 | 当前题目 ID |
| `retryToken` | string | 否 | 再答一次时传入 |
| `parentAttemptId` | string | 否 | 第二次作答时指向第一次作答 |
| `userId` | string | 否 | v0 可选，方便后端关联 |

#### 服务端处理步骤

1. 校验 `questionId`
2. 校验文件是否存在且可读
3. 存储音频
4. 调用转写服务
5. 调用反馈生成服务
6. 对反馈结果做 schema 校验
7. 生成 `retryToken`
8. 返回标准结构

#### 成功响应字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `attemptId` | string | 是 | 当前作答唯一 ID |
| `question.id` | string | 是 | 题目 ID |
| `question.topic` | string | 是 | 题目主题 |
| `question.prompt` | string | 是 | 题目正文 |
| `question.hint` | string | 是 | 回答骨架 |
| `question.keywords` | string[] | 是 | 关键词 |
| `transcript` | string | 是 | 转写文本 |
| `feedback.overall` | string | 是 | 总评 |
| `feedback.relevance` | string | 是 | 切题反馈 |
| `feedback.length` | string | 是 | 长度反馈 |
| `feedback.naturalness` | string | 是 | 自然度反馈 |
| `sampleAnswer` | string | 是 | 参考答案 |
| `retryToken` | string | 是 | 再答一次令牌 |

#### 成功响应示例

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
  "transcript": "Yes, I do. I really like my hometown because it is familiar to me.",
  "feedback": {
    "overall": "你已经回答了核心问题，下一次可以再说得更完整一些。",
    "relevance": "你基本围绕题目在回答，没有明显跑题。",
    "length": "答案偏短，可以再补一个原因。",
    "naturalness": "表达能听懂，但有些句子略像中文直译。"
  },
  "sampleAnswer": "Yes, I do. I really like my hometown because it is familiar, comfortable, and full of good memories.",
  "retryToken": "retry_abc123"
}
```

#### 失败响应

| 场景 | HTTP | code | 前端提示 |
|------|------|------|----------|
| 缺少音频文件 | 400 | `audio_required` | 请先完成录音再提交 |
| 题目 ID 非法 | 400 | `invalid_question_id` | 当前题目不可用，请返回首页重试 |
| 音频上传失败 | 502 | `audio_upload_failed` | 录音提交失败，请重新试一次 |
| 转写失败 | 502 | `transcription_failed` | 这次没有成功识别到你的回答，可以再试一次 |
| 反馈生成失败 | 502 | `feedback_failed` | 分析失败了，请重新生成反馈 |
| 反馈结构不合法 | 502 | `feedback_invalid_schema` | 反馈结果异常，请再试一次 |
| 服务超时 | 504 | `practice_timeout` | 处理时间有点长，请重新试一次 |

### 2.3 统一错误响应结构

所有失败响应统一使用以下结构：

```json
{
  "error": {
    "code": "transcription_failed",
    "message": "这次没有成功识别到你的回答，可以再试一次"
  }
}
```

约束：

- `code` 给程序判断
- `message` 给前端直接展示
- 不把原始异常暴露给用户

## 3. 页面状态表

### 3.1 首页状态表

| 状态 | 触发条件 | 页面表现 | 用户动作 | 下一状态 |
|------|----------|----------|----------|----------|
| `idle` | 页面初始化 | 骨架屏或空白容器 | 无 | `loading_question` |
| `loading_question` | 调用题目接口 | loading 文案或骨架屏 | 等待 | `ready` / `load_failed` |
| `ready` | 题目加载成功 | 展示题目、骨架、开始按钮 | 点击开始录音 | 跳转 `recorder` |
| `load_failed` | 题目加载失败 | 错误提示 + 重试按钮 | 点击重试 | `loading_question` |

### 3.2 录音页状态表

| 状态 | 触发条件 | 页面表现 | 用户动作 | 下一状态 |
|------|----------|----------|----------|----------|
| `idle` | 页面进入 | 展示题目和录音按钮 | 点击开始 | `permission_check` |
| `permission_check` | 请求麦克风权限 | 权限请求提示 | 同意或拒绝 | `recording` / `permission_failed` |
| `permission_failed` | 用户拒绝权限 | 错误提示 + 再试一次按钮 | 再试一次 | `permission_check` |
| `recording` | 权限通过且开始录音 | 计时中、录音中提示 | 点击结束或倒计时结束 | `recorded` |
| `recorded` | 录音结束 | 展示提交按钮或自动提交态 | 提交 | `uploading` |
| `uploading` | 上传并等待处理 | loading + 处理中提示 | 等待 | `success_redirect` / `submit_failed` |
| `submit_failed` | 上传、转写或反馈失败 | 错误提示 + 重新提交按钮 | 重试 | `uploading` |
| `success_redirect` | 后端返回成功 | 短暂 loading | 自动跳转 | `feedback.ready` |

### 3.3 反馈页状态表

| 状态 | 触发条件 | 页面表现 | 用户动作 | 下一状态 |
|------|----------|----------|----------|----------|
| `loading_feedback` | 等待路由数据或接口结果 | loading | 等待 | `ready` / `failed` |
| `ready` | 反馈数据完整 | 展示 transcript、反馈、参考答案、再答一次按钮 | 点击再答一次 | `retry_prepare` |
| `retry_prepare` | 用户点击再答一次 | 携带 questionId、retryToken、parentAttemptId 跳转录音页 | 无 | `recorder.idle` |
| `failed` | 数据缺失或结果异常 | 错误提示 + 重新练习按钮 | 返回首页或重试 | `home.loading_question` |

## 4. 页面数据依赖表

### 4.1 首页

| 数据 | 来源 | 用途 |
|------|------|------|
| `question.id` | `GET /questions/today` | 进入录音页时传参 |
| `question.prompt` | `GET /questions/today` | 展示题目 |
| `question.hint` | `GET /questions/today` | 展示回答骨架 |
| `question.keywords` | `GET /questions/today` | 展示关键词 |

### 4.2 录音页

| 数据 | 来源 | 用途 |
|------|------|------|
| `questionId` | 首页路由参数 | 提交作答 |
| `prompt` | 首页路由参数或本地缓存 | 页面展示 |
| `hint` | 首页路由参数或本地缓存 | 页面展示 |
| `retryToken` | 反馈页路由参数 | 再答一次时透传 |
| `parentAttemptId` | 反馈页路由参数 | 再答一次时透传 |

### 4.3 反馈页

| 数据 | 来源 | 用途 |
|------|------|------|
| `attemptId` | `POST /practice-attempts` | 标识本次结果 |
| `transcript` | `POST /practice-attempts` | 展示用户回答文本 |
| `feedback` | `POST /practice-attempts` | 展示三维反馈 |
| `sampleAnswer` | `POST /practice-attempts` | 展示参考答案 |
| `retryToken` | `POST /practice-attempts` | 再答一次 |
| `question` | `POST /practice-attempts` | 再答一次时复用题目上下文 |

## 5. 前端实现 checklist

### 5.1 基础工程

- [ ] 初始化小程序项目
- [ ] 配置 `pages/home`、`pages/recorder`、`pages/feedback`
- [ ] 建立 `services/api` 封装
- [ ] 建立 `services/recorder` 封装
- [ ] 建立统一错误提示工具

### 5.2 首页

- [ ] 首页加载时请求 `GET /questions/today`
- [ ] 实现 `idle`、`loading_question`、`ready`、`load_failed` 四种状态
- [ ] 展示题目、骨架、关键词
- [ ] 点击开始录音时跳转录音页并携带题目信息

### 5.3 录音页

- [ ] 请求麦克风权限
- [ ] 实现录音开始、结束、超时自动结束
- [ ] 录音结束后生成待上传文件
- [ ] 调用 `POST /practice-attempts`
- [ ] 区分首次作答和重答一次
- [ ] 处理上传中 loading
- [ ] 处理失败提示和重新提交
- [ ] 成功后跳转反馈页

### 5.4 反馈页

- [ ] 展示 transcript
- [ ] 展示 `overall`
- [ ] 展示 `relevance`
- [ ] 展示 `length`
- [ ] 展示 `naturalness`
- [ ] 展示 `sampleAnswer`
- [ ] 点击“再答一次”时携带 `retryToken` 和 `parentAttemptId`
- [ ] 处理反馈缺失时的错误状态

## 6. 后端实现 checklist

### 6.1 基础工程

- [ ] 初始化后端项目
- [ ] 配置基础路由
- [ ] 配置文件上传能力
- [ ] 配置环境变量管理
- [ ] 建立统一错误响应中间件

### 6.2 题目数据

- [ ] 定义 `Question` schema
- [ ] 建立 `questions.json` 种子数据文件
- [ ] 写入首批 10 到 20 道题
- [ ] 实现题目读取服务
- [ ] 实现 `GET /questions/today`

### 6.3 作答链路

- [ ] 实现 `POST /practice-attempts`
- [ ] 校验 `questionId`
- [ ] 存储音频文件
- [ ] 接入 STT 适配层
- [ ] 接入 LLM 反馈适配层
- [ ] 定义 `FeedbackPayload` schema
- [ ] 校验反馈结果并做 fallback
- [ ] 生成 `retryToken`
- [ ] 返回标准 response schema

### 6.4 失败处理

- [ ] 统一错误码
- [ ] 转写失败时返回可理解提示
- [ ] 反馈失败时返回可理解提示
- [ ] schema 非法时避免脏数据出现在前端
- [ ] 接口超时后返回统一超时错误

## 7. 联调 checklist

- [ ] 首页成功拉到题目
- [ ] 录音成功上传
- [ ] 转写结果可返回
- [ ] 反馈结构与前端预期一致
- [ ] 反馈页所有字段都能正常展示
- [ ] 再答一次时仍然是同一道题
- [ ] 再答一次时 `parentAttemptId` 正确传递
- [ ] 失败时前端不白屏

## 8. 测试 checklist

### 8.1 手工测试

- [ ] 正常流程可跑通
- [ ] 用户拒绝录音权限后可恢复
- [ ] 网络差时上传失败提示正常
- [ ] 转写失败时提示正常
- [ ] 反馈失败时提示正常
- [ ] 反馈结构缺字段时前端不崩
- [ ] 处理超过 8 秒时显示处理中提示
- [ ] 处理超过 15 秒时显示失败提示

### 8.2 后端测试

- [ ] `Question` schema 校验测试
- [ ] `GET /questions/today` 成功测试
- [ ] `POST /practice-attempts` 成功测试
- [ ] 非法 `questionId` 测试
- [ ] 空文件上传测试
- [ ] 转写失败测试
- [ ] 反馈 schema 缺字段 fallback 测试
- [ ] retry 参数透传测试

### 8.3 前端测试

- [ ] 首页状态切换测试
- [ ] 录音权限拒绝测试
- [ ] 录音结束后提交测试
- [ ] 反馈页渲染测试
- [ ] 错误态重试测试

## 9. 开发顺序建议

### 阶段一，锁定内容与契约

- [ ] 定 `Question` schema
- [ ] 定 `PracticeAttemptResponse` schema
- [ ] 定统一错误结构
- [ ] 准备首批题目

### 阶段二，跑通基础链路

- [ ] 首页取题
- [ ] 录音页录音
- [ ] 上传接口
- [ ] 返回伪造反馈

建议先允许后端返回 mock feedback，这样前端可以先跑通。

### 阶段三，接真实能力

- [ ] 接入真实 STT
- [ ] 接入真实反馈生成
- [ ] 加 schema 校验和 fallback

### 阶段四，补失败处理和 retry

- [ ] 权限失败提示
- [ ] 超时处理
- [ ] 重答一次流程
- [ ] 错误重试按钮

### 阶段五，冒烟测试

- [ ] 跑通完整 happy path
- [ ] 跑通 3 类核心失败
- [ ] 观察总耗时是否落在预算内

## 10. 阻塞项清单

开始写代码前，如果下面这些没定，开发会卡住：

- [ ] 小程序技术栈
- [ ] 后端技术栈
- [ ] STT 服务
- [ ] LLM 服务
- [ ] 音频临时存储方式
- [ ] 本地开发和联调方式

## 11. 最后的执行建议

如果要最快开工，建议按这个节奏：

1. 先把 schema 和接口文档钉死
2. 前端按 mock response 开页面
3. 后端独立接通上传、转写、反馈
4. 最后联调 retry 和失败处理

不要一开始就把“真实模型接入”和“前端页面细节”绑死在一起。那样最容易卡住整条链路。
