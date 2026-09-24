/**
 * 路由表分组：经营事项 / 任务 / 工作流运行时。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { deleteEventCollaborator, getEventCollaborators, postEventCollaborator } from "../../modules/events/collaborator.routes.js";
import { analyzeEvent, createEvent, getEventDetail, listEvents, updateEvent } from "../../modules/events/routes.js";
import { runEventRiskCheck } from "../../modules/risk/routes.js";
import { getTaskRuntimeSummaryRoute } from "../../modules/runtime/routes.js";
import { listTasks, remindTask, updateTask } from "../../modules/tasks/routes.js";
import { cancelWorkflowCommandRoute, createWorkflowCompensationRoute, getWorkflowCommandDetailRoute, getWorkflowRunDetailRoute, listWorkflowCommandsRoute, listWorkflowRunsRoute, retryWorkflowCommandRoute } from "../../modules/workflows/routes.js";

export const eventsTasksRoutes: RouteDef[] = [
  // events (specific sub-paths before the /:id catch-all)
  { method: "GET", path: "/api/events", auth: true, permission: "events.view", handler: listEvents },
  { method: "POST", path: "/api/events", auth: true, permission: "events.create", handler: createEvent },
  {
    method: "POST",
    path: "/api/events/:id/analyze",
    auth: true,
    // **分析产出的是凭证草稿，这是记账动作，不是登记动作。**
    //
    // 此前它和「建事项」共用 events.create，后果是会计——这套系统里唯一
    // 做账的人——跑不了分析（`role-accountant` 没有 events.create，
    // 因为做账的人不该自己造业务）。V16 角色实验里会计被这条挡死，
    // 而前台还照常显示按钮，点了只弹一个英文 Forbidden。
    //
    // 改成 anyOf：会计凭记账权可以分析，业务发起人凭建单权也能对自己的事项
    // 触发一次——两条路都通，而「谁能做账」的边界没有被放宽。
    permission: { anyOf: ["ledger.post", "events.create"] },
    handler: (req, res, p) => analyzeEvent(req, res, p.id!)
  },
  // 协作人：可见性收敛到「owner + 显式协作人」之后的加人入口。
  // 读用 events.view（看得见事项才看得到名单，handler 里还有一层），
  // 写不给 events.create——能建事项不等于能往别人的事项里塞人。
  {
    method: "GET",
    path: "/api/events/:id/collaborators",
    auth: true,
    permission: "events.view",
    handler: (req, res, p) => getEventCollaborators(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/events/:id/collaborators",
    auth: true,
    permission: { anyOf: ["events.assign", "events.create"] },
    handler: (req, res, p) => postEventCollaborator(req, res, p.id!)
  },
  {
    method: "DELETE",
    path: "/api/events/:id/collaborators/:userId",
    auth: true,
    permission: { anyOf: ["events.assign", "events.create"] },
    handler: (req, res, p) => deleteEventCollaborator(req, res, p.id!, p.userId!)
  },
  {
    method: "POST",
    path: "/api/events/:id/risk-check",
    auth: true,
    permission: { anyOf: ["risk.manage", "tax.manage", "events.create"] },
    handler: (req, res, p) => runEventRiskCheck(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/events/:id",
    auth: true,
    permission: "events.view",
    handler: (req, res, p) => getEventDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/events/:id",
    auth: true,
    permission: "events.create",
    handler: (req, res, p) => updateEvent(req, res, p.id!)
  },

  // tasks
  { method: "GET", path: "/api/tasks", auth: true, permission: "tasks.view", handler: listTasks },
  { method: "GET", path: "/api/runtime/tasks", auth: true, permission: "tasks.view", handler: getTaskRuntimeSummaryRoute },
  // 催办与状态变更是两层守护：权限键管「谁能进这个门」，handler 的 canMutateTask
  // 管「进来后能碰谁的任务」。
  // 不能只挂 tasks.view —— 它连纯只读的 role-viewer 都持有，等于任何登录用户都能
  // 改任意任务；也不能只挂 tasks.manage —— 它只有董事长和财务负责人持有，
  // 会计/员工/出纳/税务专员会连自己名下的任务都改不了。
  {
    method: "POST",
    path: "/api/tasks/:id/remind",
    auth: true,
    permission: { anyOf: ["tasks.view", "tasks.manage"] },
    handler: (req, res, p) => remindTask(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/tasks/:id",
    auth: true,
    permission: { anyOf: ["tasks.view", "tasks.manage"] },
    handler: (req, res, p) => updateTask(req, res, p.id!)
  },

  // workflow runtime
  { method: "GET", path: "/api/workflows/runs", auth: true, permission: "workflow.view", handler: listWorkflowRunsRoute },
  {
    method: "GET",
    path: "/api/workflows/runs/:id",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => getWorkflowRunDetailRoute(req, res, p.id!)
  },
  { method: "GET", path: "/api/workflows/commands", auth: true, permission: "workflow.view", handler: listWorkflowCommandsRoute },
  {
    method: "GET",
    path: "/api/workflows/commands/:id",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => getWorkflowCommandDetailRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/workflows/commands/:id/retry",
    auth: true,
    permission: "workflow.manage",
    handler: (req, res, p) => retryWorkflowCommandRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/workflows/commands/:id/cancel",
    auth: true,
    permission: "workflow.manage",
    handler: (req, res, p) => cancelWorkflowCommandRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/workflows/commands/:id/compensations",
    auth: true,
    permission: "workflow.manage",
    handler: (req, res, p) => createWorkflowCompensationRoute(req, res, p.id!)
  },
];
