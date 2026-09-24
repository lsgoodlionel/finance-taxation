-- 企业所得税优惠资格与城建税所在地档位（V17 阶段三批次 A）
--
-- 缺口：企业所得税此前写死 25%，高新（15%）与小型微利（实际 5%）都被按
-- 一般税率算——一家小微企业按 25% 预缴，多交五倍。而判定资格所需的信息
-- 在系统里根本不存在：companies 表没有从业人数、资产总额、高新资质。
--
-- 与 V17 阶段一同一个结论：缺的不是公式，是判定所需的信息本身。
--
-- 全部可空。null 与 0 语义不同：null 是「没登记」，要报「资格待确认」；
-- 0 是一个有效的判定输入。不给默认值就是为了保住这个区别。

alter table companies
  -- 从业人数。小型微利的认定条件之一（≤ 300 人）。
  add column if not exists employee_count integer,
  -- 资产总额（分）。小型微利的认定条件之一（≤ 5000 万）。
  add column if not exists total_assets_cents bigint,
  -- 是否属于国家限制或禁止行业。
  --
  -- 这是**用户的声明值，不是系统判定的**：对应的产业目录逐条落进系统
  -- 是独立工程。列名不叫 industry_code 就是为了不让人误以为系统认得行业。
  add column if not exists is_restricted_industry boolean not null default false,
  -- 高新技术企业资质的有效期止日。null = 没有资质。
  -- 存止日而不是布尔值：资质会过期，过期后仍按 15% 算等于把补税和
  -- 滞纳金推给以后。
  add column if not exists high_tech_certificate_expires_on date,
  -- 城建税所在地档位：市区 7% / 县城、镇 5% / 其他 1%。
  -- 取值 'city' | 'county' | 'other'，null = 没登记。
  add column if not exists urban_construction_tax_zone text;
