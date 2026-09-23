import assert from "node:assert/strict";
import test from "node:test";
import { resolveReleaseVersion } from "./release-version.js";

/**
 * 发布版本号（部署可观测性）。
 *
 * `/health` 此前返回 db 延迟、uptime、时间戳，**唯独没有版本**——
 * 部署完成后没有任何办法确认线上跑的是哪个 Release，
 * 而排查线上问题时第一个要回答的就是「这是哪个版本」。
 */

test("显式传入的版本号优先", () => {
  assert.equal(resolveReleaseVersion({ APP_VERSION: "1.4.2" }), "1.4.2");
});

test("没有注入版本号时返回 dev，不编一个假版本", () => {
  // **不回退到 package.json 的版本**：那个数字在开发机上永远是上一次发布的
  // 版本，会让本地跑的代码自称是某个正式 Release——排查时最误导人的
  // 就是一个看着合理的错版本号。
  assert.equal(resolveReleaseVersion({}), "dev");
  assert.equal(resolveReleaseVersion({ APP_VERSION: "" }), "dev");
  assert.equal(resolveReleaseVersion({ APP_VERSION: "   " }), "dev");
});

test("去掉 tag 前缀的 v：Release 标签是 v1.4.2，版本号是 1.4.2", () => {
  // CI 把 git tag 直接传进来，而 tag 习惯带 v 前缀。不统一的话前端显示
  // "1.4.2"、后端显示 "v1.4.2"，比对逻辑会把同一次发布误报成漂移。
  assert.equal(resolveReleaseVersion({ APP_VERSION: "v1.4.2" }), "1.4.2");
  assert.equal(resolveReleaseVersion({ APP_VERSION: "V1.4.2" }), "1.4.2");
});
