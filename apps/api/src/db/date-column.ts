import pg from "pg";

/**
 * PG `date` 列的 OID（`select oid from pg_type where typname = 'date'`）。
 * 硬编码是 node-postgres 官方推荐做法：内置类型 OID 属于 Postgres 稳定 ABI。
 */
export const PG_DATE_OID = 1082;

/**
 * PG `date` 是「无时区的日历日期」，但 node-postgres 默认把它解析成
 * **运行时本地时区的午夜 Date**。于是任何 `new Date(x).toISOString().slice(0, 10)`
 * 往返，在 UTC+ 时区都会把日期整整前移一天：
 *
 *   库内 2026-07-01 --(pg 默认解析, TZ=Asia/Shanghai)--> 2026-07-01T00:00:00+08:00
 *                   --(.toISOString())--> "2026-06-30T16:00:00Z" --> "2026-06-30"
 *
 * 后果是每月 1 号的分录被算进上一个会计期间，报表与驾驶舱一起错。当前容器
 * `TZ=UTC` 恰好掩盖了它，但只要部署时区一变（或开发者本机直接跑）就会静默算错。
 *
 * 根治办法是让 `date` 根本不经过 JS `Date`：原样返回 `YYYY-MM-DD` 文本。
 * 这也让全站既有的 `row.xxx_date: string` 类型声明第一次名副其实。
 *
 * 注意：`timestamptz` / `timestamp` 保持 node-postgres 默认行为不变——它们确实
 * 表示时间点，继续按 Date/ISO 时间戳处理。
 */
export function parsePgDate(raw: string | null): string | null {
  return raw;
}

let isRegistered = false;

/**
 * 全局注册 `date` 类型解析器。幂等：pg 的 type parser 注册表是模块级全局的，
 * 重复调用无害，但用标志位避免无谓写入。
 */
export function registerPgDateParsers(): void {
  if (isRegistered) return;
  pg.types.setTypeParser(PG_DATE_OID, parsePgDate);
  isRegistered = true;
}

/**
 * 把一个「日期列」的值规范成 `YYYY-MM-DD`，结果与进程时区无关。
 *
 * - 字符串（注册解析器后的正常路径）：直接截取前 10 位，零时区风险。
 * - `Date` 兜底路径：仅当某条连接绕过了 {@link registerPgDateParsers} 时才会走到。
 *   此时该 Date 是 node-postgres 用「本地时区午夜」构造的，因此必须用本地
 *   getter 才能还原出原本的日历日期（用 UTC getter 反而会重现前移一天的 bug）。
 */
export function toDateOnly(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (Number.isNaN(value.getTime())) return null;
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
