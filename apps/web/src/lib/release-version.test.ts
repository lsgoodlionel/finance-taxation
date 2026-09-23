import { WEB_RELEASE_VERSION, describeVersionDrift } from "./release-version";

/**
 * 前端的发布版本与前后端漂移提示。
 *
 * ## 为什么前端也要知道版本
 *
 * 前端是静态产物、后端是独立容器，可以各自发布。这个仓库刚改过
 * `CorporateIncomeTaxPreparation`、`StampAndSurtaxSummary` 等契约——
 * 前端新版读 `surtax` 而后端还是旧版，页面报的错与真正的原因
 * （只部署了一侧）毫无关系，排查会从错误的方向开始。
 *
 * 设置页此前把「系统版本」写死成 `V15（2026-08）`，那个文件的注释里
 * 自己记着上一次「过时了十几个版本」——手工维护的版本号必然过时。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 版本来自构建注入，不写死 ────────────────────────────────────────────
{
  assert(
    typeof WEB_RELEASE_VERSION === "string" && WEB_RELEASE_VERSION.length > 0,
    "前端要有一个版本号常量"
  );
  // 测试环境没有注入，应当是 dev——**不该是某个看着像正式版本的数字**。
  assert(
    WEB_RELEASE_VERSION === "dev",
    `没有注入时必须是 dev，实际 ${WEB_RELEASE_VERSION}——一个看着合理的错版本号比没有版本号更误导排查`
  );
}

// ── 与后端一致时不提示 ──────────────────────────────────────────────────
{
  assert(describeVersionDrift("1.4.2", "1.4.2") === null, "版本一致时不该提示任何东西");
}

// ── 不一致时给出可操作的提示 ────────────────────────────────────────────
{
  const drift = describeVersionDrift("1.4.2", "1.5.0");
  assert(drift !== null, "版本不一致必须提示");
  assert(drift!.includes("1.4.2") && drift!.includes("1.5.0"), "两个版本号都要写出来");
  assert(
    drift!.includes("刷新"),
    "要给出下一步动作——只说「版本不一致」用户不知道该做什么"
  );
}

// ── 开发态不误报 ────────────────────────────────────────────────────────
{
  // 本地开发时前端跑 vite、后端跑 tsx，两边都是 dev 或一边是 dev。
  // 报出来只会让开发者学会忽略这个提示——**天天误报的告警等于没有告警**。
  assert(describeVersionDrift("dev", "1.4.2") === null, "本地前端对线上后端不该报");
  assert(describeVersionDrift("1.4.2", "dev") === null, "线上前端对本地后端不该报");
  assert(describeVersionDrift("dev", "dev") === null, "两边都是开发态不该报");
  assert(describeVersionDrift("1.4.2", null) === null, "后端没报版本时不猜");
}

// ── v 前缀已在两侧各自剥掉，同一次发布不该被判成漂移 ────────────────────
{
  // Release 的 tag 是 v1.4.2：后端 APP_VERSION 收到 "v1.4.2"、前端
  // VITE_APP_VERSION 也收到 "v1.4.2"，两边都要剥成 "1.4.2"。
  // 少剥一边，同一次发布就会天天报漂移。
  assert(describeVersionDrift("1.4.2", "1.4.2") === null, "剥完前缀后应当一致");
}

console.log("web release-version: ok");
