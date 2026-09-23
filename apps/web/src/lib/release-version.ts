/**
 * 前端的发布版本与前后端漂移提示。
 *
 * 版本由构建时注入（`VITE_APP_VERSION`，来自 Release 的 git tag），
 * **与后端镜像用的是同一个值**——同一次发布产出的两个产物带同一个版本号，
 * 这正是「统一到 Releases」要保障的事。
 *
 * ## 为什么比对放在前端
 *
 * 漂移的后果由前端承担：页面读 `surtax` 而后端是旧版不返回它，
 * 报出来的错与真正的原因（只部署了一侧）毫无关系，排查会从错误的方向开始。
 * 后端只负责在 `/health` 里如实报出自己的版本。
 */

/** 没有注入版本号时的取值。与后端 `config/release-version.ts` 保持同一个字面量。 */
const DEV_VERSION = "dev";

/**
 * 本次构建的版本号。
 *
 * 没有注入时是 `dev`——**不回退到 package.json 的版本**：
 * 那个数字在开发机上永远是上一次发布的版本，会让本地跑的代码自称是
 * 某个正式 Release，排查时最误导人的就是一个看着合理的错版本号。
 */
export const WEB_RELEASE_VERSION: string =
  (import.meta.env?.VITE_APP_VERSION as string | undefined)?.trim().replace(/^v/i, "") ||
  DEV_VERSION;

/**
 * 前端与后端版本是否漂移。
 *
 * 任一侧是 `dev`（或后端没报）时一律认为正常：本地开发时前端跑 vite、
 * 后端跑 tsx，报不一致只会让开发者学会忽略这个提示——
 * **一个天天误报的告警等于没有告警。**
 *
 * @returns 漂移时返回给用户看的一句话；正常或无法判断时返回 `null`。
 */
export function describeVersionDrift(
  webVersion: string,
  apiVersion: string | null | undefined
): string | null {
  const web = webVersion || DEV_VERSION;
  const api = (apiVersion ?? DEV_VERSION) || DEV_VERSION;

  if (web === DEV_VERSION || api === DEV_VERSION) return null;
  if (web === api) return null;

  return `前后端版本不一致：页面是 ${web}，接口是 ${api}。两边来自不同的发布，接口返回的字段可能与页面预期对不上。请刷新页面；仍不一致的话说明这次部署只更新了一侧，需要把另一侧也升到同一个版本。`;
}
