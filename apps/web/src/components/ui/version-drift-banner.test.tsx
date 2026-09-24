import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionDriftBanner } from "./VersionDriftBanner";

/**
 * 前后端版本漂移的提示条。
 *
 * ## 为什么必须让用户看见
 *
 * 前端是静态产物、后端是独立容器，可以各自发布。只升了一侧时，
 * 页面读一个后端旧版不返回的字段（如这个仓库刚加的 `surtax`），
 * 报出来的错与真正的原因毫无关系——用户会去查数据、查权限，
 * 而问题在部署上。
 *
 * 版本号做了、健康检查报了、比对逻辑写了，但**不显示出来等于没做**：
 * 符号存在不等于用户看得到（V16 红冲按钮的教训）。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(VersionDriftBanner, props as never)
  );
}

// ── 版本一致时不出现 ────────────────────────────────────────────────────
{
  const html = render({ webVersion: "1.4.2", apiVersion: "1.4.2" });
  assert(html === "", "版本一致时不该占用任何屏幕空间");
}

// ── 开发态不出现 ────────────────────────────────────────────────────────
{
  // 本地开发时前端跑 vite、后端跑 tsx，天天不一致。
  // 报出来只会让人学会无视它——**天天误报的告警等于没有告警**。
  assert(render({ webVersion: "dev", apiVersion: "1.4.2" }) === "", "本地前端对线上后端不报");
  assert(render({ webVersion: "1.4.2", apiVersion: "dev" }) === "", "反过来也不报");
  assert(render({ webVersion: "dev", apiVersion: "dev" }) === "", "都是开发态不报");
  assert(render({ webVersion: "1.4.2", apiVersion: null }) === "", "后端没报版本时不猜");
}

// ── 漂移时说清楚两个版本与该做什么 ──────────────────────────────────────
{
  const html = render({ webVersion: "1.4.2", apiVersion: "1.5.0" });
  assert(html !== "", "版本漂移必须显示出来");
  assert(html.includes("1.4.2") && html.includes("1.5.0"), "两个版本号都要写出来");
  assert(
    html.includes("刷新"),
    "要给出第一个动作——只说「版本不一致」用户不知道该做什么"
  );
  assert(
    html.includes("一侧") || html.includes("部署"),
    "刷新之后仍不一致的话，要点明这是「只部署了一侧」，把排查引向部署而不是数据"
  );
}

console.log("version-drift-banner: ok");
