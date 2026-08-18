-- V13 残留 8：职级与城市等级，让费用标准的三维匹配真正生效。
--
-- ## 现状：匹配逻辑齐备，但两个维度永远是 null
--
-- `expense-standards/match.ts` 的三维匹配（费用类型 × 职级 × 城市等级）在
-- V13-A 就完整实现并测试过了。但运行时 `audit-service.ts` 只能传 `null`——
-- 因为这两个维度在库里根本没有落点。
--
-- 于是「M2 职级去一线城市住宿 600/晚」这类标准配了也不生效，只有通配标准
-- 起作用。这是「有能力、没数据」的又一种形态：不是没入口，是**没有承载字段**。
--
-- ## 两个维度的归属不同，所以落在两张表上
--
-- - **职级是人的属性** → `users.grade_code`
-- - **城市等级是目的地属性** → `reimbursement_lines.city_tier`
--
-- 把城市等级也放到用户档案上是个诱人的错误：那会变成「这个人的城市等级」，
-- 而同一个人去上海和去县城适用的标准本就不同。城市等级属于**这一笔费用**，
-- 不属于花钱的人。

-- ── 职级 ────────────────────────────────────────────────────────────
--
-- 自由文本而不是枚举：职级体系各家差异极大（M1/M2、P5/P6、总监/经理），
-- 枚举化只会逼用户在「其他」里写真名。约束靠费用标准那边的匹配——
-- 标准里写什么，这里就填什么，对不上就只命中通配标准，不会出错，
-- 只是不够精细。
alter table users add column if not exists grade_code text;

comment on column users.grade_code is
  'V13：职级编码，供费用标准按职级匹配。自由文本不枚举——各家职级体系差异极大。'
  '与 expense_standards.grade_code 对齐；对不上则只命中通配标准，不会出错。';

-- ── 城市等级 ────────────────────────────────────────────────────────
--
-- 落在报销明细行上而不是报销单头：一次出差可能跨城市（上海开会、再去
-- 苏州验收），住宿两晚适用的标准不同。挂单头就表达不了这种差别，
-- 而那与「一单多部门分摊」是同一类问题。
alter table reimbursement_lines
  add column if not exists city_tier text
  check (city_tier is null or city_tier in ('tier1', 'tier2', 'tier3'));

comment on column reimbursement_lines.city_tier is
  'V13：费用发生地的城市等级，供费用标准按城市匹配。**落在行上而不是单头**——'
  '一次出差可能跨城市，住宿两晚适用的标准不同。null 表示未指定，'
  '此时只匹配不限城市的标准。';

-- 申请单上也加一个：出差申请时就该知道去哪，预检超标才有意义。
alter table requests
  add column if not exists city_tier text
  check (city_tier is null or city_tier in ('tier1', 'tier2', 'tier3'));

comment on column requests.city_tier is
  'V13：目的地城市等级。出差申请时填，用于事前的超标预检——'
  '批之前就知道会不会超标，比报销时才发现有用得多。';
