/**
 * 新手快速开始 checklist（K4 场景引导 v3）
 * 按工作区模式分内容：
 * - pro：沿用 /api/setup/status 的专业配置清单（科目/期初等由后端定义），行为不变；
 * - guided：白话三件事（完善公司信息 → 传第一张票据 → 问 AI 一个问题），
 *   done 判定优先复用 setup 字段，无对应字段的项用 localStorage 标记。
 */
import type { SetupItem } from "./api";
import type { WorkspaceMode } from "./workspace-mode";

export interface OnboardingChecklistItem {
  key: string;
  label: string;
  hint: string;
  actionPath: string;
  done: boolean;
}

export interface OnboardingChecklist {
  items: OnboardingChecklistItem[];
  doneCount: number;
  total: number;
  ready: boolean;
}

export interface SetupStatus {
  items: SetupItem[];
  doneCount: number;
  total: number;
  ready: boolean;
}

/** guided 本地完成标记的 localStorage key 前缀。 */
export const GUIDED_CHECKLIST_STORAGE_PREFIX = "ft.guided-checklist.";

export type GuidedLocalKey = "first-bill" | "ask-ai";

export interface GuidedLocalFlags {
  firstBill: boolean;
  askAi: boolean;
}

function readLocalFlag(key: GuidedLocalKey): boolean {
  try {
    return window.localStorage.getItem(`${GUIDED_CHECKLIST_STORAGE_PREFIX}${key}`) === "1";
  } catch {
    return false;
  }
}

/** 读取 guided 清单的本地完成标记（localStorage 不可用时全部视为未完成）。 */
export function readGuidedLocalFlags(): GuidedLocalFlags {
  return {
    firstBill: readLocalFlag("first-bill"),
    askAi: readLocalFlag("ask-ai"),
  };
}

/** 标记 guided 清单某项已完成（写 localStorage，隐私模式等失败时静默降级）。 */
export function markGuidedChecklistDone(key: GuidedLocalKey): void {
  try {
    window.localStorage.setItem(`${GUIDED_CHECKLIST_STORAGE_PREFIX}${key}`, "1");
  } catch {
    // localStorage 不可用时忽略，本次会话内不影响使用
  }
}

function withCounts(items: OnboardingChecklistItem[]): OnboardingChecklist {
  const doneCount = items.filter((item) => item.done).length;
  return { items, doneCount, total: items.length, ready: doneCount === items.length };
}

function buildGuidedChecklist(
  setup: SetupStatus | null,
  localFlags: GuidedLocalFlags
): OnboardingChecklist {
  const companyDone = setup?.items.find((item) => item.key === "company")?.done ?? false;
  return withCounts([
    {
      key: "company",
      label: "完善公司信息",
      hint: "填好公司名称和税号，后面开票、报税都用得上",
      actionPath: "/settings",
      done: companyDone,
    },
    {
      key: "first-bill",
      label: "传第一张票据",
      hint: "拍照上传一张发票或收据，体验财务自动帮您处理",
      actionPath: "/bills",
      done: localFlags.firstBill,
    },
    {
      key: "ask-ai",
      label: "问 AI 一个问题",
      hint: "比如「这个月要交多少税」，用大白话问就行",
      actionPath: "/assistant",
      done: localFlags.askAi,
    },
  ]);
}

/**
 * 按模式生成快速开始 checklist：
 * - pro：直接映射后端 setup 清单（无 setup 数据时返回 null，与现有行为一致）；
 * - guided：白话三件事，即使 setup 未加载也可展示。
 */
export function buildOnboardingChecklist(
  setup: SetupStatus | null,
  mode: WorkspaceMode,
  localFlags: GuidedLocalFlags = readGuidedLocalFlags()
): OnboardingChecklist | null {
  if (mode === "guided") return buildGuidedChecklist(setup, localFlags);
  if (!setup) return null;
  return {
    items: setup.items.map((item) => ({ ...item })),
    doneCount: setup.doneCount,
    total: setup.total,
    ready: setup.ready,
  };
}
