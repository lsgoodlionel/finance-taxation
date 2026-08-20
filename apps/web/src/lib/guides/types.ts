/**
 * 页面指南的结构（V15 扩展）。
 *
 * ## 为什么加这几个字段
 *
 * 第一版只有「这一页干什么、按什么顺序点」。用户反馈**不足以支撑实际操作**——
 * 真正卡住人的是另外四类东西：
 *
 * | 字段 | 回答的问题 |
 * |---|---|
 * | `prerequisites` | 「为什么这个按钮是灰的 / 为什么提交被拒」 |
 * | `fields` | 「这一栏该填什么、填错会怎样」 |
 * | `pitfalls` | 「我按步骤做了，但结果不对」 |
 * | `related` | 「做完这一步该去哪」 |
 *
 * 前三类在单页指南里最有用（当场就要），`related` 支撑页面与手册之间的来回跳转。
 */

export interface GuideField {
  /** 字段在界面上的名字。**照抄界面文案**——写成别的名字用户对不上。 */
  name: string;
  /** 这一栏是什么意思。 */
  meaning: string;
  /** 填错会怎样。没有真实后果就留空，不要凑「请如实填写」。 */
  note?: string;
}

export interface GuidePitfall {
  /** 用户看到的现象。**从症状写起**——他不知道原因，只知道看到了什么。 */
  symptom: string;
  cause: string;
  fix: string;
}

export interface PageGuide {
  /** 路由。与 `nav-filter.ts` 的 key、后端菜单的 route 是同一套。 */
  route: string;
  title: string;
  /** 谁会用这一页。写角色，不写「所有人」。 */
  audience: string;
  /** 需要什么权限才能进。与后端 `ROLE_PERMISSIONS` 的键对应。 */
  permission?: string;
  /** 这一页回答什么问题。 */
  purpose: string;
  /** 用这一页之前必须先做完的事。**做不了多半是这里没满足**。 */
  prerequisites?: readonly string[];
  /** 按顺序做的事。 */
  steps: readonly string[];
  /** 关键字段怎么填。 */
  fields?: readonly GuideField[];
  /** 做错了会怎样。 */
  caution?: readonly string[];
  /** 这一页特有的「按步骤做了但结果不对」。 */
  pitfalls?: readonly GuidePitfall[];
  /** 上下游：数据从哪来、做完去哪。 */
  flow?: string;
  /** 相关页面的路由。支撑指南与手册之间的来回跳转。 */
  related?: readonly string[];
}
