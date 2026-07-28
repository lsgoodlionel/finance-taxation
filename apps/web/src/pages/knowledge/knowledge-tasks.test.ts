import {
  buildKnowledgeTasks,
  countPendingParsedItems,
  DEFAULT_KNOWLEDGE_TASK,
  isKnowledgeTaskKey,
  readKnowledgeTask,
  writeKnowledgeTask
} from "./knowledge-tasks";
import type { FileParseState } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** 造一个解析状态；只关心 status / result 两个字段，file 用最小占位。 */
function parseState(status: FileParseState["status"], hasResult: boolean): FileParseState {
  const file = { name: "x.pdf", size: 1 } as File;
  if (!hasResult) {
    return { file, status };
  }
  return {
    file,
    status,
    result: { fileName: "x.pdf", title: "t", category: "policy", content: "c", tags: [] }
  };
}

// ── URL 同步：?task= 决定当前在做哪件事 ──────────────────────────────────────
{
  assert(readKnowledgeTask(new URLSearchParams()) === DEFAULT_KNOWLEDGE_TASK, "缺省应落在「查阅已有条目」");
  assert(readKnowledgeTask(new URLSearchParams("task=import")) === "import", "URL 指定的合法任务应生效");
  assert(readKnowledgeTask(new URLSearchParams("task=create")) === "create", "URL 指定的合法任务应生效");
  assert(
    readKnowledgeTask(new URLSearchParams("task=nope")) === DEFAULT_KNOWLEDGE_TASK,
    "非法任务名应回落到默认，而不是渲染空工作区"
  );

  // 写任务不能顺手丢掉别的查询参数（分类筛选、关键词等还得留在链接里）。
  const written = writeKnowledgeTask(new URLSearchParams("category=policy&q=差旅"), "create");
  assert(written.get("task") === "create", "写入后 task 应为 create");
  assert(written.get("category") === "policy", "写入任务不得丢掉既有筛选参数");
  assert(written.get("q") === "差旅", "写入任务不得丢掉既有关键词");

  // 纯函数不得就地改调用方的 params。
  const original = new URLSearchParams("task=browse");
  writeKnowledgeTask(original, "import");
  assert(original.get("task") === "browse", "writeKnowledgeTask 必须返回新对象，不改入参");
}

// ── 任务划分：三件事、顺序固定 ──────────────────────────────────────────────
{
  const tasks = buildKnowledgeTasks({ parseStates: [] });
  assert(tasks.length === 3, `expected 3 knowledge tasks, got ${tasks.length}`);
  assert(
    tasks.map((task) => task.key).join(",") === "browse,create,import",
    "任务顺序固定按「查 → 录 → 导」，不按角标重排"
  );
  assert(tasks.every((task) => Boolean(task.description)), "每件事都要有一句说明");
  assert(tasks.every((task) => task.badge === undefined), "没有待入库结果时不挂角标");
}

// ── 角标：只数「解析成功但还没入库」的条目 ─────────────────────────────────
{
  const states: FileParseState[] = [
    parseState("parsing", false),
    parseState("done", true),
    parseState("done", true),
    parseState("error", true)
  ];
  assert(countPendingParsedItems(states) === 2, "解析中和解析失败的都不算待办");

  const tasks = buildKnowledgeTasks({ parseStates: states });
  const importTask = tasks.find((task) => task.key === "import");
  assert(importTask?.badge === 2, "「从文件导入制度」的角标应为待入库条目数");
  assert(
    tasks.filter((task) => task.badge !== undefined).length === 1,
    "条目总数不是待办，只有导入这件事可以挂角标"
  );
}

// ── 任务 key 守卫 ───────────────────────────────────────────────────────────
{
  assert(isKnowledgeTaskKey("browse"), "browse 是合法任务");
  assert(!isKnowledgeTaskKey("list"), "list 不是合法任务");
  assert(!isKnowledgeTaskKey(null), "null 不是合法任务");
}

console.log("knowledge-tasks-ok");
