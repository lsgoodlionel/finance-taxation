/**
 * V7 Stage M 双轨冒烟辅助：
 * - guided 登录：不预置 ft.workspace-mode，验证 chairman 默认走引导分流落 /home
 *   （与 fixtures/auth.ts 的 loginAs 相反，后者统一预置 pro 供既有基线使用）
 * - AI 草稿数据准备：每次运行新建独立费用事项（标题含时间戳+随机后缀，天然不冲突）
 *   再触发该属期草稿生成（后端幂等：已有草稿的事项自动跳过），可重复运行互不污染。
 *
 * 并发说明：desktop / tablet 两个 project 会并行跑同一套用例、共享同一数据库。
 * 因此（1）属期按 project 隔离（pickPeriodForProject），避免并发 generate 撞同一
 * 属期；（2）用例只操作自己创建的草稿（按唯一标题定位），不动共享队列里别人的数据。
 */
import { expect, type Page, type TestInfo } from "@playwright/test";
import type { TestApiClient } from "./api-client";

export const CHAIRMAN_CREDENTIALS = {
  username: "v4_chairman",
  password: "V4-test-123456"
} as const;

const LOGIN_MAX_ATTEMPTS = 3;
const LOGIN_BACKOFF_MS = 2_000;

/** guided 登录：清 token 与模式偏好 → 登录 → 断言默认分流到老板工作台 /home。 */
export async function loginGuidedChairman(page: Page): Promise<void> {
  for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.removeItem("finance-taxation-v2-token");
      window.localStorage.removeItem("finance-taxation-v2-refresh-token");
      window.localStorage.removeItem("ft.workspace-mode");
    });
    await page.goto("/");
    await page.getByLabel("用户名").fill(CHAIRMAN_CREDENTIALS.username);
    await page.getByLabel("密码").fill(CHAIRMAN_CREDENTIALS.password);
    await page.getByRole("button", { name: "登 录" }).click();

    try {
      await expect(page.getByRole("heading", { name: "今天" })).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/\/home(?:[?#]|$)/);
      return;
    } catch (error) {
      const loginError = page.getByText(/Request failed|登录失败|AUTH_REQUIRED|Too Many Requests/i);
      if (attempt === LOGIN_MAX_ATTEMPTS - 1 || !(await loginError.isVisible().catch(() => false))) {
        throw error;
      }
      // 速率限制类失败按指数退避后重试（与 loginAs 同款策略）
      await page.waitForTimeout((attempt + 1) * LOGIN_BACKOFF_MS);
    }
  }
}

/**
 * 属期按 project 隔离：desktop 与 tablet 并行执行时若共用属期，两边的
 * generate 会并发处理对方刚建的事项（草稿主键 close-draft-{eventId} 固定，
 * 并发插入会撞主键），也会让「本属期应新生成 ≥1 条」的断言互相干扰。
 */
export function pickPeriodForProject(
  testInfo: TestInfo,
  desktopPeriod: string,
  tabletPeriod: string
): string {
  return testInfo.project.name.includes("tablet") ? tabletPeriod : desktopPeriod;
}

interface CreatedEventResponse {
  id: string;
}

const CREATE_EVENT_MAX_ATTEMPTS = 3;
const CREATE_EVENT_RETRY_BASE_MS = 120;

/**
 * 创建事项带重试：后端以 `evt-${Date.now()}`（毫秒时间戳）作主键，desktop/tablet
 * 两个 worker 同毫秒并发创建会撞主键返回 500（产品级已知问题，见 MC 车道报告）。
 * 退避随机毫秒后重试即可错开时间戳。
 */
async function createEventWithRetry(
  apiClient: TestApiClient,
  token: string,
  payload: Record<string, unknown>
): Promise<CreatedEventResponse> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < CREATE_EVENT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await apiClient.post<CreatedEventResponse>("/api/events", token, payload);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("V4_API_500")) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, CREATE_EVENT_RETRY_BASE_MS * (attempt + 1) + Math.random() * 100)
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error("createEvent failed");
}

interface GenerateDraftsResponse {
  generated: number;
  skipped: number;
}

interface DraftListResponse {
  items: Array<{ id: string; status: string; summary: string }>;
  total: number;
}

export interface EnsuredDraft {
  /** 事项标题 = 草稿 summary，含时间戳+随机后缀，可作页面上的唯一定位锚点。 */
  eventTitle: string;
  draftId: string;
}

/**
 * 保证指定属期存在 1 条属于本用例的待批准 AI 草稿（chairman 公司口径）：
 * 1. 新建一条费用类经营事项（唯一标题，跨 worker/重复运行不冲突）
 * 2. POST /api/close/drafts/generate — 为该期未入账事项批量起草（幂等跳过已有草稿）
 * 3. 校验草稿队列中存在 summary 等于该标题的待批准草稿并返回其定位信息
 */
export async function ensureDraftForPeriod(
  apiClient: TestApiClient,
  period: string,
  titlePrefix: string
): Promise<EnsuredDraft> {
  const token = await apiClient.login(CHAIRMAN_CREDENTIALS.username, CHAIRMAN_CREDENTIALS.password);
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const eventTitle = `${titlePrefix} · E2E ${uniqueSuffix}`;

  const created = await createEventWithRetry(apiClient, token, {
    type: "expense",
    title: eventTitle,
    description: "V7 双轨冒烟数据准备（AI 草稿队列）",
    department: "综合",
    occurredOn: `${period}-05`,
    amount: "800",
    currency: "CNY",
    source: "manual"
  });
  expect(created.id, "数据准备：创建费用事项应返回 id").toBeTruthy();

  const generated = await apiClient.post<GenerateDraftsResponse>(
    "/api/close/drafts/generate",
    token,
    { period }
  );
  expect(
    generated.generated,
    `数据准备：${period} 至少应为新事项生成 1 条草稿`
  ).toBeGreaterThanOrEqual(1);

  const drafts = await apiClient.get<DraftListResponse>("/api/close/drafts?status=draft", token);
  const ours = drafts.items.find((item) => item.summary === eventTitle);
  expect(ours, `数据准备：待批准队列应包含「${eventTitle}」`).toBeTruthy();
  return { eventTitle, draftId: ours!.id };
}
