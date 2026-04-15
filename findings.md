# Findings

## Existing Product / Code Reality

### What already exists

- 首页只有“今日一题”入口，没有“下一题”或“换一题”机制。
- 录音页支持录音、识别文本编辑、提交反馈，但没有录音回放。
- 反馈页展示了 `sampleAnswer`，但它被命名和呈现为“参考答案”，不够像“推荐完整回答”。
- 后端题目服务只有：
  - `GET /questions/today`
  - `getQuestionById(questionId)`
- 当前识别模式：
  - `manual`
  - `tencent`
- 当前腾讯识别是“录音结束后整段上传识别”，不是录音中流式识别。
- 当前仓库没有 TTS 服务，也没有题目音频和推荐回答音频资产。

### Requirement Review Summary

1. `现在无法抽取下一题`
- 属于真实产品缺口。
- 可以轻量实现，不需要上完整题库系统。

2. `无法听到题目音频以及我自己回答的语音`
- “自己回答的语音”可以直接用本地录音回放完成。
- “题目音频”需要 TTS 或预录音频，不是现有代码里顺手能开出来的功能。

3. `没有推荐的完整回答以及对应音频内容`
- 文字层面已有 `sampleAnswer` 雏形，但定位不够明确。
- 音频层面同样依赖 TTS 或预生成音频。

4. `音频识别太慢，可不可以实时识别`
- 当前架构下是“后识别”，不是“实时识别”。
- 这是可做但风险最高的一项，需要修改录音流与识别会话管理。

## CEO Review Conclusions

### Scope Position

建议进入一个 `v0.5 练习增强版`，而不是直接扩成完整题库或完整课程产品。

### Accepted Scope

- 支持切换到下一题
- 支持用户回放自己的回答
- 把“参考答案”升级为“推荐完整回答”
- 预留“题目音频 / 推荐回答音频”能力，但先明确依赖 TTS
- 把识别链路升级为“尽量实时”的体验，而不是继续纯录后识别

### Not in Scope

- 历史记录
- 题库检索/分类页
- 用户账户体系
- AI 口语长文详批
- 发音逐词分析
- 分享、打卡、成长体系

### Product Risk

- 如果现在把“下一题”做成完整题库浏览，会把验证器带离核心任务。
- 如果强行承诺题目音频和标准答案音频，但没有 TTS 方案，只会制造空按钮和坏体验。

## Eng Review Conclusions

### Architecture Direction

- “下一题”应作为题目服务的扩展，而不是前端本地写死循环。
- “自己回答的语音回放”应优先基于本地临时录音文件实现。
- “题目音频 / 推荐回答音频”要抽象成独立音频能力层，避免把 TTS 逻辑塞进页面。
- “实时识别”要在 `speech-provider` 层解决，不要把 socket 状态机散落在页面里。

### Critical Technical Gaps

- 当前 question schema 没有为音频能力预留字段。
- 当前后端 response schema 没有区分：
  - `recommendedAnswer`
  - `questionAudio`
  - `recommendedAnswerAudio`
- 当前录音页状态机没有“录音中识别中”的状态。
- 当前测试文档没有覆盖新的音频播放与下一题链路。

## Worktree Parallelization Insight

后续最适合的并行拆分：

- Lane A: question navigation / next-question service
- Lane B: answer playback + feedback UI upgrade
- Lane C: TTS capability abstraction and audio delivery
- Lane D: live recognition pipeline
- Lane E: docs / QA / smoke checklist update
