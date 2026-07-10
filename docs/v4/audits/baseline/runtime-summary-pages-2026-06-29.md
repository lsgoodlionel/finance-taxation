# Runtime Summary Pages Audit

日期：2026-06-29  
范围：`/tasks`、`/tax`、`/vouchers`、`/payroll`、`/payroll/transfer`

## 验证方式

1. 使用本地 V4 test stack：`http://127.0.0.1:55173` + `http://127.0.0.1:33100`
2. 按页面角色登录：
   - 任务中心 / 凭证中心 / 工资管理：`v4_accountant`
   - 税务中心：`v4_tax`
   - 工资代发与社保：`v4_manager`
3. 运行 Playwright smoke：`tests/e2e/smoke/runtime-summary-pages.spec.ts`
4. 对工资管理页补充检查：不得再出现“加载失败，请检查后端连接。”

## 结果

- 5/5 页面均通过 runtime 摘要 smoke。
- 五个页面均可见：
  - 运行态标题
  - 授权态标题
  - 对应 runtime 面板标题
- 2026-06-29 补充验证：5/5 页面均已确认真实请求对应的 `/api/runtime/*` 接口，并收到 `200` 响应，不再只是依赖本地 fallback 呈现面板。
- 工资管理页已从“后端连接失败”误报收口为“参数未配置”的业务空态处理。

## 发现

### 已修复

1. `PayrollPage`
   - 问题：`/api/payroll/policy` 未配置时，整页 bootstrap 失败，顶部误报为后端连接异常。
   - 处理：拆开 `employees / periods / policy` 加载；把 `Payroll policy not configured` 作为业务空态处理。
   - 当前行为：员工与期间仍可加载，参数设置页签显示“尚未配置工资参数口径”。

2. `TaxPage`
   - 问题：runtime 摘要原先嵌在“税务工作台摘要”内部，首屏优先级弱于日历和统计块。
   - 处理：已把“税务运行态与授权态”独立拆出，并上提到税务日历之后、工作台摘要之前。
   - 当前行为：进入税务页后，先看到税务日历，再看到当前能否推进的 runtime 信息，之后才是统计摘要与批次上下文。

### 仍建议后续优化

1. `TasksPage`
   - runtime 摘要和异常横幅并列时信息量较密，首屏纵向占用偏高。
   - 后续建议：将异常横幅收束为可折叠提醒，把 runtime 保持为稳定第二层。

2. `VouchersPage`
   - runtime 摘要已可见，但与流程阶段卡并列时信息有轻微重复。
   - 后续建议：把 runtime 的“下一步动作”压缩到更短文案，减少与流程说明重复。

## 当前结论

- V4-1A 前端 runtime 摘要层已真实落地到目标 5 页。
- 页面可用性门槛已达成：状态可见、授权可见、工资页空态不再误导。
- 2026-06-29 后续补充：五页 runtime 摘要已开始切到后端统一 API，并保留本地 fallback，避免接口波动导致首屏状态区缺失。
- 2026-06-29 二次补充：`PayrollPage` 在未选中工资期间时，现会按 `selectedPeriod -> 最新期间 -> customPeriod` 顺序请求 runtime 接口，避免只显示面板而未触发后端请求。
- 下一批适合转向：
  1. 税务页首屏层级优化
  2. runtime API / 重试 / 补偿的更深路由合约与浏览器回归
  3. 把该 smoke 纳入更大的 V4 验收回归集
