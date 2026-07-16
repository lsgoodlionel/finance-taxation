import { randomUUID } from "node:crypto";

/**
 * 生成带前缀的唯一 id：`<prefix>-<毫秒时间戳>-<8位随机hex>`。
 *
 * 时间戳段保留旧 `<prefix>-<Date.now()>` 形态的可排序性与数据兼容；随机段
 * 保证同毫秒并发请求（如 Playwright 多 project 并行创建）不再撞主键。
 */
export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
