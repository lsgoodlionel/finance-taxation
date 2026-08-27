-- 税项的计税依据与政策依据分家（V16 角色实验发现的阻断缺陷）
--
-- ## 问题
--
-- `tax_items.basis` 一个字段承担了两件事，而两件事的类型根本不同：
--
--   - 生成侧写进去的是**政策依据散文**：「需结合交付、验收或约定开票条件确认
--     纳税义务发生时点。」
--   - 消费侧（增值税底稿）把它当**计税依据金额**：`Number(item.basis)`
--
-- 于是 `Number("需结合交付…")` → `NaN`，一路流进底稿、申报向导、申报 XML：
--
--   GET /api/tax/vat-working-paper → {"outputTaxAmount":"NaN","payableVatAmount":"NaN"}
--   导出的 XML 里 <本期销项税额>NaN</本期销项税额>
--
-- **那是报给税务局的数字。**
--
-- ## 为什么此前没被发现
--
-- 底稿模块自己的单元测试用 `basis: "1000"` 构造输入——干净的数字字符串。
-- 而生产环境里写进这个字段的从来都是散文。
-- **测试喂的输入不是系统真实产生的输入**，所以测试一直是绿的。
--
-- ## 这次的做法
--
-- 加一列专门存金额，`basis` 回归它实际承担的角色（政策依据文字）。
-- 不改 `basis` 的列名：它有大量既有引用，而且从内容看它一直就是文字，
-- 错的是**读它的那一方**，不是它自己。

alter table tax_items add column if not exists taxable_amount_cents bigint null;

comment on column tax_items.taxable_amount_cents is
  '计税依据，整数分。null = 这条税项还没有确定计税依据（例如印花税待复核合同性质），'
  '**不是 0** —— 消费方必须把它排除在合计之外并显式列出，绝不能当成零参与计算。';

comment on column tax_items.basis is
  '政策依据，**文字**。不要拿它去算数——历史上增值税底稿把它 Number() 成 NaN，'
  '一路流进了申报 XML。金额在 taxable_amount_cents。';

-- 存量回填：从事项金额取。
-- 取不到的（事项无金额、或事项已不存在）保持 null——如实记「不知道」，
-- 而不是填 0 让它悄悄参与合计。
update tax_items t
set taxable_amount_cents = round(e.amount * 100)::bigint
from business_events e
where e.id = t.business_event_id
  and t.taxable_amount_cents is null
  and e.amount is not null;
