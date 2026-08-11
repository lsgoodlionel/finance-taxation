/**
 * V12 批次 C 四个新页面的端到端冒烟。
 *
 * ## 为什么值得单开一个 spec
 *
 * 这四个页面的后端各有十几条路径级断言，前端也有类型检查与术语护栏，但**都不经
 * nginx**。开发时正是在浏览器里才发现路由 `/assets` 与 Vite 打包产物目录
 * `/assets/` 撞名——nginx 为后者单开了静态资源规则，页面被 301 掉，
 * 而所有单测都是绿的。
 *
 * 所以这里断言的重点不是业务逻辑（那些已有覆盖），而是**这些页面在真实
 * 部署形态下打得开、渲染得出、深链进得去**。
 */
import { test, expect } from "../fixtures/auth";

test.describe("V12 批次 C 页面可达性", () => {
  test("资产与往来三件事都能打开并渲染各自的主体", async ({ page, loginAsRole }) => {
    await loginAsRole("accountant");

    // 路径必须是 /asset-center 而不是 /assets：后者会被 nginx 的静态资源
    // 规则 301 掉。这条断言就是那个 bug 的回归防线。
    await page.goto("/asset-center");
    await expect(page.getByRole("heading", { name: "固定资产台账", exact: true })).toBeVisible();

    // 默认页签是固定资产，且折旧区块在没预览时给出的是操作指引而不是空白
    await expect(page.getByRole("button", { name: "预览本期折旧" })).toBeVisible();
    await expect(page.getByRole("button", { name: "新增资产" })).toBeVisible();

    await page.getByRole("tab", { name: "往来账龄" }).click();
    await expect(page.getByRole("heading", { name: "往来账龄与核销", exact: true })).toBeVisible();
    // 账龄与逾期是两个口径，两个统计块都要在
    await expect(page.getByText("应收余额合计")).toBeVisible();
    await expect(page.getByText("其中已超信用账期")).toBeVisible();

    await page.getByRole("tab", { name: "定期凭证" }).click();
    await expect(page.getByRole("heading", { name: "定期凭证模板", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "生成本期草稿" })).toBeVisible();
  });

  test("当前页签写在 URL 上，深链可直达", async ({ page, loginAsRole }) => {
    await loginAsRole("accountant");

    await page.goto("/asset-center?tab=aging");
    await expect(page.getByRole("heading", { name: "往来账龄与核销", exact: true })).toBeVisible();

    await page.goto("/asset-center?tab=recurring");
    await expect(page.getByRole("heading", { name: "定期凭证模板", exact: true })).toBeVisible();
  });

  test("银行余额调节表可深链进入，且对账单余额是必填", async ({ page, loginAsRole }) => {
    await loginAsRole("accountant");

    // 这一页不在侧栏里（由月结向导跳转进入），只能靠深链打开——
    // 正因如此更需要一条端到端断言：它坏了没人会在侧栏点到。
    await page.goto("/banking/reconciliation");
    await expect(
      page.getByRole("heading", { name: "银行存款余额调节表", exact: true })
    ).toBeVisible();

    // 对账单余额是外部事实，系统推算不出来，必须由用户从对账单抄入
    await expect(page.getByText("对账单余额")).toBeVisible();
    await expect(page.getByRole("button", { name: "生成调节表" })).toBeVisible();
  });

  test("侧栏出现资产与往来入口，点击可进入", async ({ page, loginAsRole }) => {
    await loginAsRole("accountant");
    await page.goto("/");

    // 窄视口下导航收在抽屉里，得先展开。点完必须**等抽屉真的打开**再点菜单项 ——
    // 只做 click 不等待，在全量并行跑（机器更忙、动画更慢）时会点在还没展开的
    // 抽屉上，单跑却总是绿的。这类"重跑就好了"的用例比没有用例更糟：
    // 它会教人忽略红灯。
    const drawerTrigger = page.getByRole("button", { name: "打开导航菜单" });
    if (await drawerTrigger.isVisible().catch(() => false)) {
      await drawerTrigger.click();
      await expect(page.getByLabel("导航抽屉")).toBeVisible();
    }

    const entry = page.getByRole("menuitem", { name: "资产与往来" });
    await expect(entry).toBeVisible();
    await entry.click();

    await expect(page).toHaveURL(/\/asset-center/);
    await expect(page.getByRole("heading", { name: "固定资产台账", exact: true })).toBeVisible();
  });
});
