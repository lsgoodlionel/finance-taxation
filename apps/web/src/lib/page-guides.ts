/**
 * 页面指南的兼容入口。
 *
 * 实现拆到了 `lib/guides/`（按导航分组分四个文件）——内容写细到字段级之后，
 * 一个文件会超过 800 行。这里保留原路径的再导出，让既有 import 不用全改。
 */

export {
  PAGE_GUIDES,
  findPageGuide,
  guideAnchorId,
  guideTitleOf,
  type GuideField,
  type GuidePitfall,
  type PageGuide
} from "./guides";
