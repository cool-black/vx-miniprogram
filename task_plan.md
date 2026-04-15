# Task Plan

## Goal

在不直接进入编码的前提下，先用现有技能框架审查用户提出的 4 个需求，把它们收敛成可执行的产品文档和技术文档，并为后续使用 `git worktree` 并行开发做好拆分。

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | complete | 读取现有技能说明与项目文档，确认评审路径 |
| 2 | complete | 基于 CEO/Eng review 框架审查需求，明确范围、风险、取舍 |
| 3 | complete | 产出产品文档，定义用户价值、范围、成功标准、非目标 |
| 4 | complete | 产出技术文档，定义架构改动、接口、状态机、并行开发方案 |
| 5 | in_progress | 形成编码前的实施建议，等待用户确认后再开始开发 |

## Key Decisions

- 使用 `planning-with-files` 的落盘方式管理本轮规划。
- 使用 `plan-ceo-review` 和 `plan-eng-review` 的评审框架，但不进入 Plan mode 的逐节问答流程。
- 本轮只做文档与方案，不改功能代码。
- 后续编码时优先使用 `git worktree` 按模块并行推进。

## Expected Deliverables

- `task_plan.md`
- `findings.md`
- `progress.md`
- `PHASE2_PRD.md`
- `PHASE2_TECH_SPEC.md`

## Risks

- 用户需求里“题目音频 / 推荐回答音频”依赖 TTS 能力，仓库目前没有现成实现。
- “实时识别”会显著改变录音与识别链路，需要在技术方案里明确回退策略。
- 当前已有 PRD 是 v0 验证版，新需求会把产品从“最小闭环”推向“带强化练习能力的 v0.5”。
- 当前 Git 环境存在 `dubious ownership`，后续真正执行 `git worktree` 前需要先处理 `safe.directory`。
