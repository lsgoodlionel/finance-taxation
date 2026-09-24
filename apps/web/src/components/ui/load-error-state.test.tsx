import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadErrorState, describeLoadFailure } from "./LoadErrorState";

/**
 * 「加载失败」与「没有数据」必须分开说。
 *
 * ## 缺陷
 *
 * 多个列表页的写法是 `catch { toast.error(...) }`，然后表格照常显示
 * 「暂无往来单位」「暂无账单」。**toast 会消失，空态不会**——
 * 用户看一眼列表就以为真的没有数据，而实际上是这个账号读不到。
 *
 * V16 角色实验里税务专员被研发页那句「还没有研发项目」误导过：
 * 他的本职工作就是归集加计扣除，看到这句话会去问业务部门为什么不立项，
 * 而真正的问题在权限上。研发页与风险页已修，这次清其余的。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 说清这不是「没有数据」 ──────────────────────────────────────────────
{
  const html = renderToStaticMarkup(
    createElement(LoadErrorState, { subject: "往来单位", error: "读取失败" })
  );
  assert(html.includes("往来单位"), "要说清是什么没加载出来");
  assert(
    html.includes("不是") && (html.includes("没有") || html.includes("暂无")),
    "**必须明说这不是「没有数据」**——否则用户会按当前画面下判断"
  );
}

// ── 403 要指明缺哪个权限 ────────────────────────────────────────────────
{
  const html = renderToStaticMarkup(
    createElement(LoadErrorState, {
      subject: "账单",
      error: "Forbidden: missing permission billing.view"
    })
  );
  assert(
    html.includes("billing.view"),
    "权限不足时要指明缺哪一项，用户才知道去找谁开——「无权访问」四个字帮不上忙"
  );
}

// ── 权限错误与其他错误的措辞不同 ────────────────────────────────────────
{
  // 这两种情况用户该做的事完全不同：一个去找管理员开权限，
  // 一个是重试或报障。给同一句话等于让用户自己猜。
  const forbidden = describeLoadFailure("Forbidden: missing permission tax.view");
  assert(forbidden.kind === "forbidden", "403 要识别出来");
  assert(
    forbidden.advice.includes("管理员") || forbidden.advice.includes("权限"),
    "权限问题要指路到管理员"
  );

  const network = describeLoadFailure("Failed to fetch");
  assert(network.kind === "other", "网络错误不是权限问题");
  assert(
    !network.advice.includes("管理员"),
    "网络故障让用户去找管理员开权限是把人指向错误的方向"
  );
}

// ── 各种 403 的说法都要认出来 ───────────────────────────────────────────
{
  // 后端的 403 文案不止一种写法，认漏了就退化成通用错误，
  // 用户又回到「不知道该找谁」的状态。
  for (const message of [
    "Forbidden",
    "403 Forbidden",
    "missing permission rnd.view",
    "权限不足",
    "无权访问该资源"
  ]) {
    assert(
      describeLoadFailure(message).kind === "forbidden",
      `这条应当被识别为权限问题：${message}`
    );
  }
}

console.log("load-error-state: ok");
