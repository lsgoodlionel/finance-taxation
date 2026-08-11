# 多车道并行开发的测试隔离

## 症状先行

V12 批次 B 里两条车道**各自独立**报告了同一类失败，都一度以为是自己写的代码有 bug：

```
error: relation "companies" does not exist
error: deadlock detected
error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"
```

重跑就好了，安静窗口下 86/86 全绿。

## 根因

集成测试的每个用例开头都调 `resetTestDatabase()`，它做的是：

```sql
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
```

而所有车道默认连的是**同一个库** `finance_taxation_v4_test`。车道 A 正在跑测试时，车道 B 把整个 schema 删了重建——A 的下一条查询自然找不到表。

这类失败最危险的地方不是它会红，而是**它会随机绿**。重跑一次就过，人就学会了忽略红灯；等到某天是真 bug 红的，也会被当成"又是那个并发问题"。

可复现的对照实验（2026-08-11 实测）：

| 场景 | 结果 |
|---|---|
| 同一个 `finance_taxation_v4_test` 上并发 3 次 `reset-test-db` | 1 成功，2 失败，报 `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 两个车道库上并发 2 次 `reset-test-db` | 全部成功 |

## 解法

`V4_TEST_DATABASE_URL` 这个环境变量已经是所有测试入口的唯一数据库来源（`reset-test-db.ts`、`seed-acceptance-data.ts`、各集成测试）。默认值指向共享库，所以**单人开发和 CI 单跑的行为完全不变**。

隔离要做的只是：让每条车道指向不同的库名。

```bash
# 车道开工时，一次性执行
export V4_TEST_DATABASE_URL=$(node tools/v4/lane-db.mjs create batch-c-fixed-assets)
npm run v4:test:db:reset
npm run v4:test:seed

# 之后照常
npm run test:api:integration
npm run test:db
```

`create` 是幂等的：库已存在就直接返回 URL，不会重建。stdout 只输出 URL，说明文字走 stderr，所以可以直接 `$(...)` 取用。

收工后清理（可选，库很小，留着下次复用更快）：

```bash
node tools/v4/lane-db.mjs drop batch-c-fixed-assets
node tools/v4/lane-db.mjs list   # 看看有哪些残留
```

## 隔离覆盖不到的地方

**E2E 测试仍然共用一套栈。** `npm run test:e2e` 打的是 docker 测试栈（55173/55433），栈里的 API 容器连的是固定库名，不读车道的 `V4_TEST_DATABASE_URL`。

也就是说：车道隔离解决的是 **API 集成测试 + tools 的 db 测试**的争用；**E2E 必须串行**，由集成方（master）在合并后统一跑一次，车道自己不要并行跑 E2E。

要让 E2E 也隔离，得给每条车道起独立的 docker project + 端口，成本远高于收益——批次 C 的规模不值得。

## 给车道提示词的固定段落

在多车道任务书里直接贴这段，不要靠车道自己想起来：

> 开工第一步，为你这条车道分配独立测试库：
> ```bash
> export V4_TEST_DATABASE_URL=$(node tools/v4/lane-db.mjs create <你的车道名>)
> npm run v4:test:db:reset && npm run v4:test:seed
> ```
> 这条 export 只在当前 shell 生效，**每开一个新终端都要重新执行**（`create` 幂等，重复执行安全）。
> 不要运行 `npm run test:e2e`——E2E 共用一套 docker 栈，由集成方在合并后统一跑。

## 安全边界

`assertSafeTestDatabase()` 拒绝重置库名不含 `test` 的库。车道库名一律是 `finance_taxation_v4_test_lane_<车道名>`，天然满足这个前缀检查——但也意味着**不要**给车道库起不含 `test` 的名字，`reset` 会直接拒绝。
