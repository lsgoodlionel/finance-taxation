/**
 * 发布版本号：部署后回答「线上跑的是哪个 Release」。
 *
 * 由构建时注入（`APP_VERSION`，来自 Release 的 git tag），`/health` 报出来。
 *
 * **不从 package.json 读**：那里的版本要手工维护，与实际发布的 tag 很容易
 * 对不上，而一个看着合理的错版本号比没有版本号更误导排查。
 *
 * ## 为什么不放在共享包里
 *
 * 放进 `domain-model` 会让它多一个**运行时值**，于是 API 的编译产物必须
 * 在运行时加载那个包——而它的 exports 指向 .ts 源文件，要靠 Node 的
 * type stripping 实验特性才能跑。前端的比对逻辑自带一份（见
 * `apps/web/src/lib/release-version.ts`）：真正需要一致的是「什么算漂移」，
 * 而那个判断只发生在前端，后端只负责如实报出自己的版本。
 */

/** 没有注入版本号时的取值。表示「这不是一个正式发布的产物」。 */
export const DEV_VERSION = "dev";

/**
 * 从环境变量解析发布版本号。
 *
 * Release 的 git tag 习惯带 `v` 前缀（`v1.4.2`），这里统一剥掉——
 * 否则前端显示 `1.4.2`、后端显示 `v1.4.2`，比对会误报不一致。
 */
export function resolveReleaseVersion(source: Record<string, string | undefined>): string {
  const raw = (source.APP_VERSION ?? "").trim();
  if (!raw) return DEV_VERSION;
  return raw.replace(/^v/i, "");
}
