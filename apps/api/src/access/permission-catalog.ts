/**
 * 权限目录：系统里所有权限键的唯一清单。
 *
 * ## 为什么在 API 而不是 domain-model
 *
 * 这是**鉴权的基础数据，只有服务端用得到**——web 一处都没引用过。
 *
 * 它此前是 domain-model 唯一的运行时值。共享包里只要有一个值，
 * API 的生产产物就必须在运行时加载那个包，而它的 exports 指向 .ts 源文件，
 * 于是要靠 Node 的 type stripping 实验特性才能跑起来（不支持 enum 等语法，
 * 将来加一个就炸）。移到这里之后 domain-model 成为纯类型包，
 * 编译后运行时零加载。
 */

export const permissionCatalog = [
  "dashboard.view",
  "events.view",
  "events.create",
  "events.assign",
  "tasks.view",
  "tasks.manage",
  "documents.view",
  "documents.manage",
  "ledger.view",
  "ledger.post",
  // 银行账户、流水导入/同步、对账确认自成一档：这些是出纳的本职工作，
  // 而 ledger.post 是记账权（出纳不持有）。此前整组 banking 写路由挂 ledger.post，
  // 等于把出纳挡在自己的活儿外面；再往回降到 ledger.view 又会让只读账号也能导流水。
  "banking.manage",
  "tax.view",
  "tax.manage",
  "rnd.view",
  "rnd.manage",
  "risk.view",
  "risk.manage",
  "contracts.view",
  "contracts.manage",
  "payroll.view",
  "payroll.manage",
  "audit.view",
  "workflow.view",
  "workflow.manage",
  // V13 费控。预算与费用标准分开授权：预算额度是管理层的决策数据（部门经理
  // 该看得到自己部门的预算执行），而费用标准是行政/HR 维护的制度配置，
  // 两者的持有人在多数公司里不是同一批人。
  "budget.view",
  "budget.manage",
  "expense.view",
  // 提交费用类单据（申请/借款/报销）。**与 expense.view 分开**：只读角色
  // 与审计要看得到费用标准和别人的单据，但不该能提单——V13-B 的权限护栏
  // 正是抓到「role-viewer 能建申请单」才拆出这个键。
  "expense.submit",
  "expense.manage",
  "knowledge.view",
  "knowledge.manage",
  "settings.manage"
] as const;

export type PermissionKey = (typeof permissionCatalog)[number];
