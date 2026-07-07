# V4.0 执行索引

> 基线：`origin/main@91e906c`
> 总规格：`docs/superpowers/specs/2026-06-22-v4-production-acceptance-design.md`

## 1. 执行原则

- 每条工作流使用独立 worktree 和 `codex/v4-*` 分支。
- 所有业务切片必须从最新 `main` 创建，不从历史 P0/P1/P2/P3/V3 分支继续累积。
- 每条切片必须同时通过功能、权限、数据、性能、恢复和审计门禁。
- 页面问题先使用 Product Design `audit` 形成截图证据；涉及结构重构时使用 `ideate` 生成三套视觉方向并由用户选择。
- 流程图、资料包封面、培训资产和管理汇报使用 Creative Production；准确文字、数字、表格和法律信息必须由确定性模板生成。
- 高风险动作保留最终授权，不得因自动化目标绕过。

## 2. 实施顺序

| 阶段 | 分支 | 计划 | 前置 |
| --- | --- | --- | --- |
| V4-0 | `codex/v4-baseline-and-e2e` | `docs/superpowers/plans/2026-06-22-v4-baseline-and-e2e.md` | 已批准总规格 |
| V4-1A | `codex/v4-workflow-runtime` | 独立计划，V4-0 完成后编写 | V4-0 |
| V4-1B | `codex/v4-expense-purchase-slice` | 独立规格与计划 | V4-0；与 runtime 对齐接口 |
| V4-2 | `codex/v4-travel-expense-slice` | 独立规格与计划 | 采购报销通用能力完成 |
| V4-3 | `codex/v4-contract-revenue-slice` | 独立规格与计划 | V4-0 + workflow runtime |
| V4-4 | `codex/v4-job-and-connectors` | 独立规格与计划 | V4-0；由切片驱动接口 |
| V4-5 | `codex/v4-security-operations` | 独立规格与计划 | 三条切片稳定 |

## 3. 并行边界

V4-0 必须串行完成。之后允许两组并行：

- 组一：`workflow-runtime` 与 `expense-purchase-slice`
- 组二：`job-and-connectors` 可与业务切片并行，但只能实现切片已经定义的接口

以下文件属于共享高冲突区，只能由集成负责人修改：

- `apps/api/src/app.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/AppLayout.tsx`
- `apps/web/src/styles/global.css`
- `apps/web/src/lib/api.ts`
- `package.json`
- `.github/workflows/ci.yml`
- `docs/v4-progress-board.md`

业务分支应优先在领域目录中新增文件，通过小型注册接口接入共享文件。

## 4. 每个分支的完成定义

1. 计划中的复选框全部完成。
2. 单元、数据库集成、API 合约和浏览器 E2E 均有证据。
3. Product Design 审计无未解决 P0/P1；涉及视觉目标时，design QA 无未解决 P0/P1/P2。
4. 对应业务单据可打印，字段来源与版本可追溯。
5. 重复执行不会产生重复凭证、付款、申报或归档。
6. 所有高风险动作具备最终授权记录。
7. 验收证据写入 `artifacts/v4/<slice>/`，缺陷同步进入系统反馈模块。
8. 进度板和运行手册更新。

## 5. 验收产物目录

```text
artifacts/v4/
  baseline/
    browser/
    api/
    database/
    visual-audit/
    creative-directions/
    reports/
  expense-purchase/
  travel-expense/
  contract-revenue/
```

产物目录默认不提交大体积截图、视频和 trace；提交清单、报告、哈希和必要的小型基准图。CI 上传完整 artifact。

## 6. 发布门禁

```bash
npm ci
npm run typecheck:v2
npm run test:api
npm run test:web
npm run test:db
npm run test:e2e
npm run verify:v4
```

生产认证阶段额外执行：

```bash
npm run v4:ops:init-sources
npm run v4:ops
npm run test:load
npm run test:backup-restore
npm run test:connectors
npm run test:ai-evals
```

说明：

- `test:db` 当前对应 `tools/v4/workflow-runtime-db.test.ts`，覆盖 workflow tables 与 runtime route/db 合同。
- `verify:v4` 会串联类型检查、单元、DB、V4 工具测试、验收报告生成、产物校验和进度板校验。
- `v4:ops:init-sources` 会先生成 `artifacts/v4/baseline/ops-sources/*.json` 模板；`v4:ops` 再生成 `artifacts/v4/baseline/ops/*.json`；随后 `test:load / test:backup-restore / test:connectors / test:ai-evals` 直接按这些证据做机器判定。
- `v4:ops:record` 可将外部 JSON 直接回填到标准来源文件，例如：
  - `npm run v4:ops:record -- connectors --input docs/v4/examples/ops-source-samples/connector-certification.json`
  - `npm run v4:ops:record -- backup-restore --input docs/v4/examples/ops-source-samples/backup-drill.json`
  - `npm run v4:ops:record -- ai-evals --input docs/v4/examples/ops-source-samples/ai-evals.json`
- `v4:ops` 当前通过 `bash tools/v4/run-production-gates-generation.sh` 采集本地健康探针样本，再交给 `tools/v4/run-production-gates-generation.mjs` 归并证据；如运行环境禁止回环探针，可显式传入 `--health-probe-latencies <csv>` 完成 `load` 证据归档。
