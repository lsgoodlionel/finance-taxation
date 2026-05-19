-- Migration: 015_startup_year1_simulation
-- 某科技有限公司第一年（2026-01 至 2026-05）完整模拟数据
-- 涵盖 28 个业务场景，含凭证、账目、税务、合同、员工、风险等

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. 公司基本信息更新
-- ─────────────────────────────────────────────────────────────────────────────
update companies set
  credit_code          = '91310000MA1KTECH01',
  legal_representative = '陈创始',
  bank_name            = '招商银行上海浦东新区支行',
  bank_account         = '110012345678901',
  registered_address   = '上海市浦东新区张江高科技园区科技路88号',
  contact_email        = 'finance@moukejiyouxian.com',
  contact_phone        = '021-58880001',
  updated_at           = now()
where id = 'cmp-tech-001';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 纳税人资格
-- ─────────────────────────────────────────────────────────────────────────────
insert into taxpayer_profiles (id, company_id, taxpayer_type, effective_from, status, notes) values
  ('tp-001', 'cmp-tech-001', 'general', '2026-01-01', 'active', '成立初期即办理一般纳税人资格认定')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 部门扩充：技术部、销售部
-- ─────────────────────────────────────────────────────────────────────────────
insert into departments (id, company_id, parent_department_id, name, leader_user_id) values
  ('dept-tech-001',  'cmp-tech-001', null, '技术部', 'usr-chairman-001'),
  ('dept-sales-001', 'cmp-tech-001', null, '销售部', 'usr-fin-001')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 员工档案
-- ─────────────────────────────────────────────────────────────────────────────
insert into employees (id, company_id, department_id, name, id_card, position, hire_date, base_salary, status) values
  ('emp-001', 'cmp-tech-001', 'dept-tech-001',  '张伟', '310112199001011234', '技术总监',   '2026-01-15', 25000.00, 'active'),
  ('emp-002', 'cmp-tech-001', 'dept-sales-001', '李芳', '310112199202024567', '销售经理',   '2026-01-15', 15000.00, 'active'),
  ('emp-003', 'cmp-tech-001', 'dept-tech-001',  '王明', '310112199403037890', '前端工程师', '2026-02-01', 18000.00, 'active'),
  ('emp-004', 'cmp-tech-001', 'dept-tech-001',  '陈欣', '310112199504041122', '产品经理',   '2026-02-01', 20000.00, 'active'),
  ('emp-005', 'cmp-tech-001', 'dept-finance',   '赵兰', '310112199805053344', '行政助理',   '2026-01-15',  8000.00, 'active')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 工资政策（2026年上海标准参考）
-- ─────────────────────────────────────────────────────────────────────────────
insert into payroll_policy (id, company_id,
  social_security_base_min, social_security_base_max,
  pension_employee_rate, pension_employer_rate,
  medical_employee_rate, medical_employer_rate,
  unemployment_employee_rate, unemployment_employer_rate,
  housing_fund_employee_rate, housing_fund_employer_rate,
  iit_threshold) values
  ('pp-001', 'cmp-tech-001',
   4000.00, 28026.00,
   0.08, 0.16,
   0.02, 0.08,
   0.005, 0.005,
   0.12, 0.12,
   5000.00)
on conflict (company_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 合同
-- ─────────────────────────────────────────────────────────────────────────────
insert into contracts (id, company_id, contract_no, contract_type, title, counterparty_name, counterparty_type,
  amount, currency, signed_date, start_date, end_date, status, notes, created_by_user_id, created_by_name) values
  ('ct-001', 'cmp-tech-001', 'HT-2026-001', 'lease',    '办公场地租赁合同',             '某物业管理有限公司', 'external',  240000.00, 'CNY', '2026-01-05', '2026-02-01', '2027-01-31', 'active',    '上海市浦东新区办公室，月租20000元，押金60000元', 'usr-fin-001', '财务负责人'),
  ('ct-002', 'cmp-tech-001', 'HT-2026-002', 'service',  '代理记账服务合同',             '某会计师事务所',     'external',   24000.00, 'CNY', '2026-01-10', '2026-02-01', '2027-01-31', 'active',    '月服务费2000元，含月报季报年报及税务申报',       'usr-fin-001', '财务负责人'),
  ('ct-003', 'cmp-tech-001', 'HT-2026-003', 'sale',     '客户A技术开发服务合同',        '客户A科技公司',      'external',  800000.00, 'CNY', '2026-03-15', '2026-03-15', '2026-12-31', 'active',    '分期付款，首付20万，交付后付尾款',               'usr-chairman-001', '创始人董事长'),
  ('ct-004', 'cmp-tech-001', 'HT-2026-004', 'purchase', '委外研发合同-核心功能模块开发', '乙方技术有限公司',   'external',  300000.00, 'CNY', '2026-03-01', '2026-03-01', '2026-08-31', 'active',    '核心算法模块委外开发，按里程碑付款',             'usr-chairman-001', '创始人董事长'),
  ('ct-005', 'cmp-tech-001', 'HT-2026-005', 'loan',     '流动资金借款合同',             '招商银行',           'external', 1000000.00, 'CNY', '2026-04-01', '2026-04-01', '2027-03-31', 'active',    '一年期流动资金贷款，年利率3.85%',               'usr-chairman-001', '创始人董事长'),
  ('ct-006', 'cmp-tech-001', 'HT-2026-006', 'sale',     '客户B SaaS平台授权合同',       '客户B集团有限公司',  'external',  150000.00, 'CNY', '2026-04-20', '2026-05-01', '2027-04-30', 'active',    'SaaS平台年度授权使用费',                         'usr-chairman-001', '创始人董事长')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 业务事件（28个场景）
-- ─────────────────────────────────────────────────────────────────────────────

-- 场景01: 设立与开办费用
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-001', 'cmp-tech-001', 'general', '公司设立登记及开办费用', '工商注册登记、刻章、银行开户等开办费用合计', '财务部', 'usr-fin-001', '2026-01-10', 15800.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景02: 股东出资
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-002', 'cmp-tech-001', 'financing', '股东货币出资到账', '注册资本500万元，首期实缴出资50万元到账', '财务部', 'usr-fin-001', '2026-01-15', 500000.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景03: 办公室租赁押金+租金
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source, contract_id) values
  ('evt-003', 'cmp-tech-001', 'expense', '办公室租赁押金及首月租金', '支付办公室押金40000元及2月份租金20000元', '财务部', 'usr-fin-001', '2026-01-28', 60000.00, 'CNY', 'confirmed', 'manual', 'ct-001')
on conflict (id) do nothing;

-- 场景04: 云服务器SaaS订阅
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-004', 'cmp-tech-001', 'rnd', '阿里云服务器及SaaS工具订阅费', '云服务器ECS、数据库RDS、腾讯企业邮箱等年度订阅', '技术部', 'usr-chairman-001', '2026-02-01', 36000.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景05: 电脑显示器设备采购
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-005', 'cmp-tech-001', 'procurement', '办公设备采购-电脑及显示器', '采购笔记本电脑5台及显示器5块，用于研发人员', '技术部', 'usr-chairman-001', '2026-02-10', 85000.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景06: 软件著作权申请
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-006', 'cmp-tech-001', 'expense', '软件著作权申请费', '智能财税管理系统V1.0软件著作权申请官费及代理费', '技术部', 'usr-chairman-001', '2026-02-20', 3500.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景07: 员工工资（2026年3月）
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-007', 'cmp-tech-001', 'payroll', '2026年3月份工资发放', '全员3月工资计提及发放，税前合计86000元', '财务部', 'usr-fin-001', '2026-03-31', 86000.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景08: 社保公积金（2026年3月）
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-008', 'cmp-tech-001', 'payroll', '2026年3月社保及公积金申报缴纳', '企业及个人部分社保公积金缴纳，企业部分合计约48160元', '财务部', 'usr-fin-001', '2026-03-31', 48160.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景09: 委外研发付款
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source, contract_id) values
  ('evt-009', 'cmp-tech-001', 'rnd', '委外研发首期款支付', '支付乙方技术公司委外研发首期款120000元（合同总额300000元）', '技术部', 'usr-chairman-001', '2026-04-05', 120000.00, 'CNY', 'confirmed', 'manual', 'ct-004')
on conflict (id) do nothing;

-- 场景10: 客户A签约首付
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source, contract_id) values
  ('evt-010', 'cmp-tech-001', 'sales', '客户A合同首付款到账', '客户A科技公司签约首付200000元到账', '销售部', 'usr-fin-001', '2026-04-08', 200000.00, 'CNY', 'confirmed', 'manual', 'ct-003')
on conflict (id) do nothing;

-- 场景11: 客户A开票收入确认
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-011', 'cmp-tech-001', 'sales', '客户A开票收入确认', '开具增值税专用发票，含税金额212000元，税率6%，不含税收入200000元', '财务部', 'usr-fin-001', '2026-04-10', 212000.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景12: 客户B退款
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-012', 'cmp-tech-001', 'sales', '客户B小额退款', '客户B因合同变更要求退还测试阶段预付款10000元', '销售部', 'usr-fin-001', '2026-04-15', 10000.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景13: 应收逾期催收
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-013', 'cmp-tech-001', 'sales', '应收账款逾期催收', '某演示客户历史应收30000元逾期未收，启动催收程序', '财务部', 'usr-fin-001', '2026-04-20', 30000.00, 'CNY', 'pending', 'manual')
on conflict (id) do nothing;

-- 场景14: 差旅报销
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-014', 'cmp-tech-001', 'expense', '销售团队差旅费报销', '销售经理李芳赴北京拜访客户差旅费报销：机票+酒店+餐饮合计6800元', '销售部', 'usr-fin-001', '2026-04-18', 6800.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景15: 业务招待
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-015', 'cmp-tech-001', 'expense', '业务招待费', '招待客户A高管商务餐及会议室租用，合计4200元', '销售部', 'usr-chairman-001', '2026-04-12', 4200.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景16: 银行贷款
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source, contract_id) values
  ('evt-016', 'cmp-tech-001', 'financing', '招商银行流动资金贷款到账', '1000000元一年期流动资金贷款到账，年利率3.85%', '财务部', 'usr-fin-001', '2026-04-02', 1000000.00, 'CNY', 'confirmed', 'manual', 'ct-005')
on conflict (id) do nothing;

-- 场景17: 贷款利息
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-017', 'cmp-tech-001', 'expense', '银行贷款4月份利息计提', '招商银行100万贷款2026年4月利息：1000000*3.85%/12≈3208元', '财务部', 'usr-fin-001', '2026-04-30', 3208.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景18: 政府补助
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-018', 'cmp-tech-001', 'general', '浦东新区科技型中小企业创业补贴', '浦东新区科委拨付科技型中小企业创业扶持补贴100000元', '财务部', 'usr-fin-001', '2026-04-25', 100000.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景19: 增值税月报
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-019', 'cmp-tech-001', 'tax', '2026年4月增值税月报申报', '申报一般纳税人增值税，销项税额11320元，进项抵扣约3000元，应纳增值税约8320元', '财务部', 'usr-fin-001', '2026-05-10', 8320.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景20: 个税扣缴
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-020', 'cmp-tech-001', 'tax', '2026年4月个人所得税扣缴申报', '代扣代缴全员4月份个人所得税合计', '财务部', 'usr-fin-001', '2026-05-15', 3850.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景21: 印花税
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-021', 'cmp-tech-001', 'tax', '合同印花税申报缴纳', '对签订的技术服务合同和贷款合同申报印花税：技术服务合同0.3‰，借款合同0.05‰', '财务部', 'usr-fin-001', '2026-04-30', 1040.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景22: 折旧摊销
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-022', 'cmp-tech-001', 'general', '4月份固定资产折旧及费用摊销', '电脑设备按3年折旧：85000/(3*12)≈2361元；开办费一次性摊销', '财务部', 'usr-fin-001', '2026-04-30', 2361.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景23: 月末结账准备
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-023', 'cmp-tech-001', 'general', '2026年4月月末结账', '核对各账户余额、确认收入成本费用完整性、编制月度报表', '财务部', 'usr-fin-001', '2026-04-30', 0.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景24: 企业所得税预缴
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-024', 'cmp-tech-001', 'tax', '2026年第一季度企业所得税预缴', 'Q1利润约30000元，按25%税率预缴企业所得税7500元（小微优惠后）', '财务部', 'usr-fin-001', '2026-04-25', 7500.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景25: 研发加计扣除
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-025', 'cmp-tech-001', 'rnd', '研发费用加计扣除资料整理', '整理研发费用加计扣除相关资料，2026年研发费用预计可享受100%加计扣除', '技术部', 'usr-chairman-001', '2026-04-30', 0.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景26: 年度归档年报
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-026', 'cmp-tech-001', 'general', '工商年度报告准备（2025年度）', '准备并提交工商局年度报告，含财务报表摘要、股东信息等', '财务部', 'usr-fin-001', '2026-05-01', 0.00, 'CNY', 'pending', 'manual')
on conflict (id) do nothing;

-- 场景27: 固定资产出售
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-027', 'cmp-tech-001', 'asset', '旧路由器及办公桌椅处置', '处置自用旧路由器2台及旧办公椅5把，出售价值2000元', '财务部', 'usr-fin-001', '2026-05-05', 2000.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- 场景28: 罚款捐赠
insert into business_events (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source) values
  ('evt-028', 'cmp-tech-001', 'general', '交通违章罚款及公益捐赠', '公务车辆违章罚款200元（税前不得扣除）；向社区公益基金捐款1000元', '财务部', 'usr-fin-001', '2026-05-08', 1200.00, 'CNY', 'confirmed', 'manual')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 事件凭证草稿（mapping_id 基础）：event_voucher_drafts
-- ─────────────────────────────────────────────────────────────────────────────
insert into event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary) values
  ('evd-002', 'cmp-tech-001', 'evt-002', 'receipt',  'approved', '股东货币出资到账'),
  ('evd-003', 'cmp-tech-001', 'evt-003', 'payment',  'approved', '支付办公室押金及首月租金'),
  ('evd-005', 'cmp-tech-001', 'evt-005', 'payment',  'approved', '采购办公设备电脑及显示器'),
  ('evd-007', 'cmp-tech-001', 'evt-007', 'transfer', 'approved', '2026年4月工资计提发放'),
  ('evd-009', 'cmp-tech-001', 'evt-009', 'payment',  'approved', '支付委外研发首期款'),
  ('evd-010', 'cmp-tech-001', 'evt-010', 'receipt',  'approved', '客户A首付款到账'),
  ('evd-016', 'cmp-tech-001', 'evt-016', 'receipt',  'approved', '招商银行流动资金贷款到账'),
  ('evd-018', 'cmp-tech-001', 'evt-018', 'receipt',  'approved', '政府补助到账')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. 凭证（vouchers）
-- ─────────────────────────────────────────────────────────────────────────────
insert into vouchers (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, source, approved_at, posted_at) values
  ('vch-002', 'cmp-tech-001', 'evt-002', 'evd-002', 'receipt',  '股东货币出资500000元到账',      'posted', 'manual', '2026-01-15 10:00:00+08', '2026-01-15 10:30:00+08'),
  ('vch-003', 'cmp-tech-001', 'evt-003', 'evd-003', 'payment',  '支付办公室押金40000及租金20000', 'posted', 'manual', '2026-01-28 14:00:00+08', '2026-01-28 14:30:00+08'),
  ('vch-005', 'cmp-tech-001', 'evt-005', 'evd-005', 'payment',  '采购办公设备85000元',            'posted', 'manual', '2026-02-10 10:00:00+08', '2026-02-10 10:30:00+08'),
  ('vch-007', 'cmp-tech-001', 'evt-007', 'evd-007', 'transfer', '2026年4月工资计提86000元',       'posted', 'manual', '2026-04-30 16:00:00+08', '2026-04-30 16:30:00+08'),
  ('vch-009', 'cmp-tech-001', 'evt-009', 'evd-009', 'payment',  '支付委外研发首期款120000元',     'posted', 'manual', '2026-04-05 11:00:00+08', '2026-04-05 11:30:00+08'),
  ('vch-010', 'cmp-tech-001', 'evt-010', 'evd-010', 'receipt',  '客户A首付款200000元到账',        'posted', 'manual', '2026-04-08 09:00:00+08', '2026-04-08 09:30:00+08'),
  ('vch-016', 'cmp-tech-001', 'evt-016', 'evd-016', 'receipt',  '招商银行贷款1000000元到账',      'posted', 'manual', '2026-04-02 14:00:00+08', '2026-04-02 14:30:00+08'),
  ('vch-018', 'cmp-tech-001', 'evt-018', 'evd-018', 'receipt',  '政府补助100000元到账',           'posted', 'manual', '2026-04-25 15:00:00+08', '2026-04-25 15:30:00+08')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. 凭证行（voucher_lines）
-- 注：voucher_lines 无 company_id 列
-- ─────────────────────────────────────────────────────────────────────────────

-- vch-002: 股东出资 500000
-- DR 银行存款 / CR 实收资本
insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order) values
  ('vl-002-1', 'vch-002', '股东货币出资到账', '1002', '银行存款',   500000.00,      0.00, 1),
  ('vl-002-2', 'vch-002', '股东货币出资到账', '4001', '实收资本',        0.00, 500000.00, 2)
on conflict (id) do nothing;

-- vch-003: 押金 40000 + 首月租金 20000
-- DR 其他应收款（押金）+ DR 管理费用-租金 / CR 银行存款
insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order) values
  ('vl-003-1', 'vch-003', '支付办公室押金',   '1231', '其他应收款',        40000.00,     0.00, 1),
  ('vl-003-2', 'vch-003', '支付首月租金',     '6602', '管理费用-租金',     20000.00,     0.00, 2),
  ('vl-003-3', 'vch-003', '支付押金及租金',   '1002', '银行存款',              0.00, 60000.00, 3)
on conflict (id) do nothing;

-- vch-005: 设备采购 85000
-- DR 固定资产 / CR 银行存款
insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order) values
  ('vl-005-1', 'vch-005', '采购办公设备',     '1601', '固定资产',      85000.00,     0.00, 1),
  ('vl-005-2', 'vch-005', '采购办公设备付款', '1002', '银行存款',          0.00, 85000.00, 2)
on conflict (id) do nothing;

-- vch-007: 工资计提 86000
-- 研发人员(张伟25000+王明18000+陈欣20000=63000) 归研发费用，行政(赵兰8000)+销售(李芳15000)=23000 归管理/销售费用
-- DR 研发费用-人工 63000 / DR 管理费用-工资 15000 / DR 销售费用-工资 8000 / CR 应付职工薪酬 86000
insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order) values
  ('vl-007-1', 'vch-007', '计提4月研发人员工资',   '6401', '研发费用-人工',        63000.00,     0.00, 1),
  ('vl-007-2', 'vch-007', '计提4月销售人员工资',   '6601', '销售费用-工资',        15000.00,     0.00, 2),
  ('vl-007-3', 'vch-007', '计提4月行政人员工资',   '6602', '管理费用-工资',         8000.00,     0.00, 3),
  ('vl-007-4', 'vch-007', '应付4月工资合计',       '2211', '应付职工薪酬',              0.00, 86000.00, 4)
on conflict (id) do nothing;

-- vch-009: 委外研发 120000
-- DR 研发费用-外包 / CR 银行存款
insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order) values
  ('vl-009-1', 'vch-009', '支付委外研发首期款', '6401', '研发费用-外包', 120000.00,     0.00, 1),
  ('vl-009-2', 'vch-009', '支付委外研发首期款', '1002', '银行存款',           0.00, 120000.00, 2)
on conflict (id) do nothing;

-- vch-010: 客户A收款 200000（含税212000，但收款200000作为预收/收入确认）
-- 实际收款200000，含税确认：不含税收入≈188679，增值税销项≈11321
-- DR 银行存款 200000 / CR 主营业务收入 188679 / CR 应交税费-增值税销项 11321
insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order) values
  ('vl-010-1', 'vch-010', '客户A首付款到账',       '1002', '银行存款',               200000.00,      0.00, 1),
  ('vl-010-2', 'vch-010', '确认主营业务收入',       '5001', '主营业务收入',                0.00, 188679.00, 2),
  ('vl-010-3', 'vch-010', '确认增值税销项税额',     '2203', '应交税费-增值税销项',         0.00,  11321.00, 3)
on conflict (id) do nothing;

-- vch-016: 银行贷款 1000000
-- DR 银行存款 / CR 短期借款
insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order) values
  ('vl-016-1', 'vch-016', '招商银行流动资金贷款到账', '1002', '银行存款',    1000000.00,       0.00, 1),
  ('vl-016-2', 'vch-016', '招商银行流动资金贷款到账', '2001', '短期借款',          0.00, 1000000.00, 2)
on conflict (id) do nothing;

-- vch-018: 政府补助 100000
-- DR 银行存款 / CR 其他收益
insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order) values
  ('vl-018-1', 'vch-018', '政府补助到账', '1002', '银行存款', 100000.00,      0.00, 1),
  ('vl-018-2', 'vch-018', '政府补助收入', '5051', '其他收益',      0.00, 100000.00, 2)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. 总账分录（ledger_entries）— 仅对已过账凭证生成
-- ─────────────────────────────────────────────────────────────────────────────

-- vch-002 股东出资
insert into ledger_entries (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at) values
  ('le-002-1', 'cmp-tech-001', 'vch-002', 'evt-002', '2026-01-15', '股东货币出资到账', '1002', '银行存款', 500000.00,      0.00, 'voucher_posting', '2026-01-15 10:30:00+08'),
  ('le-002-2', 'cmp-tech-001', 'vch-002', 'evt-002', '2026-01-15', '股东货币出资到账', '4001', '实收资本',      0.00, 500000.00, 'voucher_posting', '2026-01-15 10:30:00+08')
on conflict (id) do nothing;

-- vch-003 押金+租金
insert into ledger_entries (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at) values
  ('le-003-1', 'cmp-tech-001', 'vch-003', 'evt-003', '2026-01-28', '支付办公室押金',  '1231', '其他应收款',    40000.00,     0.00, 'voucher_posting', '2026-01-28 14:30:00+08'),
  ('le-003-2', 'cmp-tech-001', 'vch-003', 'evt-003', '2026-01-28', '支付首月租金',    '6602', '管理费用-租金', 20000.00,     0.00, 'voucher_posting', '2026-01-28 14:30:00+08'),
  ('le-003-3', 'cmp-tech-001', 'vch-003', 'evt-003', '2026-01-28', '支付押金及租金',  '1002', '银行存款',          0.00, 60000.00, 'voucher_posting', '2026-01-28 14:30:00+08')
on conflict (id) do nothing;

-- vch-005 设备采购
insert into ledger_entries (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at) values
  ('le-005-1', 'cmp-tech-001', 'vch-005', 'evt-005', '2026-02-10', '采购办公设备',     '1601', '固定资产', 85000.00,     0.00, 'voucher_posting', '2026-02-10 10:30:00+08'),
  ('le-005-2', 'cmp-tech-001', 'vch-005', 'evt-005', '2026-02-10', '采购办公设备付款', '1002', '银行存款',     0.00, 85000.00, 'voucher_posting', '2026-02-10 10:30:00+08')
on conflict (id) do nothing;

-- vch-007 工资计提
insert into ledger_entries (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at) values
  ('le-007-1', 'cmp-tech-001', 'vch-007', 'evt-007', '2026-04-30', '计提4月研发人员工资', '6401', '研发费用-人工',   63000.00,     0.00, 'voucher_posting', '2026-04-30 16:30:00+08'),
  ('le-007-2', 'cmp-tech-001', 'vch-007', 'evt-007', '2026-04-30', '计提4月销售人员工资', '6601', '销售费用-工资',   15000.00,     0.00, 'voucher_posting', '2026-04-30 16:30:00+08'),
  ('le-007-3', 'cmp-tech-001', 'vch-007', 'evt-007', '2026-04-30', '计提4月行政人员工资', '6602', '管理费用-工资',    8000.00,     0.00, 'voucher_posting', '2026-04-30 16:30:00+08'),
  ('le-007-4', 'cmp-tech-001', 'vch-007', 'evt-007', '2026-04-30', '应付4月工资合计',     '2211', '应付职工薪酬',        0.00, 86000.00, 'voucher_posting', '2026-04-30 16:30:00+08')
on conflict (id) do nothing;

-- vch-009 委外研发
insert into ledger_entries (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at) values
  ('le-009-1', 'cmp-tech-001', 'vch-009', 'evt-009', '2026-04-05', '支付委外研发首期款', '6401', '研发费用-外包', 120000.00,     0.00, 'voucher_posting', '2026-04-05 11:30:00+08'),
  ('le-009-2', 'cmp-tech-001', 'vch-009', 'evt-009', '2026-04-05', '支付委外研发首期款', '1002', '银行存款',           0.00, 120000.00, 'voucher_posting', '2026-04-05 11:30:00+08')
on conflict (id) do nothing;

-- vch-010 客户A收款
insert into ledger_entries (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at) values
  ('le-010-1', 'cmp-tech-001', 'vch-010', 'evt-010', '2026-04-08', '客户A首付款到账',     '1002', '银行存款',            200000.00,      0.00, 'voucher_posting', '2026-04-08 09:30:00+08'),
  ('le-010-2', 'cmp-tech-001', 'vch-010', 'evt-010', '2026-04-08', '确认主营业务收入',    '5001', '主营业务收入',              0.00, 188679.00, 'voucher_posting', '2026-04-08 09:30:00+08'),
  ('le-010-3', 'cmp-tech-001', 'vch-010', 'evt-010', '2026-04-08', '确认增值税销项税额',  '2203', '应交税费-增值税销项',       0.00,  11321.00, 'voucher_posting', '2026-04-08 09:30:00+08')
on conflict (id) do nothing;

-- vch-016 银行贷款
insert into ledger_entries (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at) values
  ('le-016-1', 'cmp-tech-001', 'vch-016', 'evt-016', '2026-04-02', '招商银行流动资金贷款到账', '1002', '银行存款',  1000000.00,       0.00, 'voucher_posting', '2026-04-02 14:30:00+08'),
  ('le-016-2', 'cmp-tech-001', 'vch-016', 'evt-016', '2026-04-02', '招商银行流动资金贷款到账', '2001', '短期借款',       0.00, 1000000.00, 'voucher_posting', '2026-04-02 14:30:00+08')
on conflict (id) do nothing;

-- vch-018 政府补助
insert into ledger_entries (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at) values
  ('le-018-1', 'cmp-tech-001', 'vch-018', 'evt-018', '2026-04-25', '政府补助到账', '1002', '银行存款', 100000.00,      0.00, 'voucher_posting', '2026-04-25 15:30:00+08'),
  ('le-018-2', 'cmp-tech-001', 'vch-018', 'evt-018', '2026-04-25', '政府补助收入', '5051', '其他收益',      0.00, 100000.00, 'voucher_posting', '2026-04-25 15:30:00+08')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. 账期过账批次（ledger_posting_batches）
-- ─────────────────────────────────────────────────────────────────────────────
insert into ledger_posting_batches (id, company_id, voucher_id, business_event_id, posted_at) values
  ('lpb-002', 'cmp-tech-001', 'vch-002', 'evt-002', '2026-01-15 10:30:00+08'),
  ('lpb-003', 'cmp-tech-001', 'vch-003', 'evt-003', '2026-01-28 14:30:00+08'),
  ('lpb-005', 'cmp-tech-001', 'vch-005', 'evt-005', '2026-02-10 10:30:00+08'),
  ('lpb-007', 'cmp-tech-001', 'vch-007', 'evt-007', '2026-04-30 16:30:00+08'),
  ('lpb-009', 'cmp-tech-001', 'vch-009', 'evt-009', '2026-04-05 11:30:00+08'),
  ('lpb-010', 'cmp-tech-001', 'vch-010', 'evt-010', '2026-04-08 09:30:00+08'),
  ('lpb-016', 'cmp-tech-001', 'vch-016', 'evt-016', '2026-04-02 14:30:00+08'),
  ('lpb-018', 'cmp-tech-001', 'vch-018', 'evt-018', '2026-04-25 15:30:00+08')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. 4月份工资记录
-- 工资计算说明（上海2026年参考基数）：
--   社保（养老8%+医疗2%+失业0.5%=10.5% 个人；养老16%+医疗8%+失业0.5%=24.5% 单位）
--   公积金（个人12%+单位12%）
--   个税起征点5000元，应税额=(税前-社保个人-公积金个人-5000)，适用累进税率
-- 张伟 25000: 社保个人=2625, 公积金个人=3000, 应税=25000-2625-3000-5000=14375, 税=1012.5+14375*10%-2520=2032.5 → 含速算扣除(0-36000适用3%，3%-10%分段)
--   0~3000: 3%=90; 3000~12000: 10%=900; 12000~14375: 10%=237.5 → IIT=90+900+237.5-... 按累进：14375*10%-210=1227.5
-- ─────────────────────────────────────────────────────────────────────────────

-- 张伟 25000: 社保个人=25000*(8%+2%+0.5%)=2625, 公积金=3000, 应税所得=14375, IIT=14375*10%-210=1227.50
insert into payroll_records (id, company_id, period, employee_id, employee_name,
  gross_salary, social_security_employee, social_security_employer,
  housing_fund_employee, housing_fund_employer,
  iit_withheld, net_pay, status, confirmed_at, confirmed_by_user_id, confirmed_by_name) values
  ('pr-2604-001', 'cmp-tech-001', '2026-04', 'emp-001', '张伟',
   25000.00, 2625.00, 6125.00, 3000.00, 3000.00, 1227.50, 18147.50,
   'confirmed', '2026-04-30 17:00:00+08', 'usr-fin-001', '财务负责人')
on conflict (id) do nothing;

-- 李芳 15000: 社保个人=15000*10.5%=1575, 公积金=1800, 应税=15000-1575-1800-5000=6625, IIT=6625*10%-210=452.50
insert into payroll_records (id, company_id, period, employee_id, employee_name,
  gross_salary, social_security_employee, social_security_employer,
  housing_fund_employee, housing_fund_employer,
  iit_withheld, net_pay, status, confirmed_at, confirmed_by_user_id, confirmed_by_name) values
  ('pr-2604-002', 'cmp-tech-001', '2026-04', 'emp-002', '李芳',
   15000.00, 1575.00, 3675.00, 1800.00, 1800.00, 452.50, 11172.50,
   'confirmed', '2026-04-30 17:00:00+08', 'usr-fin-001', '财务负责人')
on conflict (id) do nothing;

-- 王明 18000: 社保个人=18000*10.5%=1890, 公积金=2160, 应税=18000-1890-2160-5000=8950, IIT=8950*10%-210=685.00
insert into payroll_records (id, company_id, period, employee_id, employee_name,
  gross_salary, social_security_employee, social_security_employer,
  housing_fund_employee, housing_fund_employer,
  iit_withheld, net_pay, status, confirmed_at, confirmed_by_user_id, confirmed_by_name) values
  ('pr-2604-003', 'cmp-tech-001', '2026-04', 'emp-003', '王明',
   18000.00, 1890.00, 4410.00, 2160.00, 2160.00, 685.00, 13265.00,
   'confirmed', '2026-04-30 17:00:00+08', 'usr-fin-001', '财务负责人')
on conflict (id) do nothing;

-- 陈欣 20000: 社保个人=20000*10.5%=2100, 公积金=2400, 应税=20000-2100-2400-5000=10500, IIT=10500*10%-210=840.00
insert into payroll_records (id, company_id, period, employee_id, employee_name,
  gross_salary, social_security_employee, social_security_employer,
  housing_fund_employee, housing_fund_employer,
  iit_withheld, net_pay, status, confirmed_at, confirmed_by_user_id, confirmed_by_name) values
  ('pr-2604-004', 'cmp-tech-001', '2026-04', 'emp-004', '陈欣',
   20000.00, 2100.00, 4900.00, 2400.00, 2400.00, 840.00, 14660.00,
   'confirmed', '2026-04-30 17:00:00+08', 'usr-fin-001', '财务负责人')
on conflict (id) do nothing;

-- 赵兰 8000: 社保个人=8000*10.5%=840, 公积金=960, 应税=8000-840-960-5000=1200, IIT=1200*3%=36.00
insert into payroll_records (id, company_id, period, employee_id, employee_name,
  gross_salary, social_security_employee, social_security_employer,
  housing_fund_employee, housing_fund_employer,
  iit_withheld, net_pay, status, confirmed_at, confirmed_by_user_id, confirmed_by_name) values
  ('pr-2604-005', 'cmp-tech-001', '2026-04', 'emp-005', '赵兰',
   8000.00, 840.00, 1960.00, 960.00, 960.00, 36.00, 6164.00,
   'confirmed', '2026-04-30 17:00:00+08', 'usr-fin-001', '财务负责人')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. 事件税务映射（event_tax_mappings）
-- ─────────────────────────────────────────────────────────────────────────────
insert into event_tax_mappings (id, company_id, business_event_id, tax_type, treatment, status, basis, filing_period) values
  ('etm-001', 'cmp-tech-001', 'evt-019', '增值税',     '申报缴纳', 'filed', '销项税额11320元减进项税额约3000元', '2026-04'),
  ('etm-002', 'cmp-tech-001', 'evt-019', '增值税附加', '申报缴纳', 'filed', '城建税7%+教育附加3%+地方教育附加2%=12%', '2026-04'),
  ('etm-003', 'cmp-tech-001', 'evt-020', '个人所得税', '代扣代缴', 'filed', '全员4月份工资薪金个税合计3241元', '2026-04'),
  ('etm-004', 'cmp-tech-001', 'evt-021', '印花税',     '申报缴纳', 'filed', '技术服务合同800000*0.3‰=240元；借款合同1000000*0.05‰=50元；其他合同', '2026-04'),
  ('etm-005', 'cmp-tech-001', 'evt-024', '企业所得税', '季度预缴', 'filed', 'Q1利润30000元，适用小微企业优惠税率25%预缴', '2026-Q1')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. 税务项目（tax_items）
-- ─────────────────────────────────────────────────────────────────────────────
insert into tax_items (id, company_id, business_event_id, mapping_id, tax_type, treatment, basis, filing_period, status, source) values
  ('tax-001', 'cmp-tech-001', 'evt-019', 'etm-001', '增值税',     '申报缴纳', '销项税额11320元，进项抵扣约3000元，应纳8320元', '2026-04', 'filed', 'manual'),
  ('tax-002', 'cmp-tech-001', 'evt-019', 'etm-002', '增值税附加', '申报缴纳', '以增值税8320元为基础计算附加税费合计998元',     '2026-04', 'filed', 'manual'),
  ('tax-003', 'cmp-tech-001', 'evt-020', 'etm-003', '个人所得税', '代扣代缴', '全员4月工资薪金所得代扣代缴个税合计3241元',     '2026-04', 'filed', 'manual'),
  ('tax-004', 'cmp-tech-001', 'evt-021', 'etm-004', '印花税',     '申报缴纳', '应税合同印花税290元，其中技术服务合同240元',     '2026-04', 'filed', 'manual'),
  ('tax-005', 'cmp-tech-001', 'evt-024', 'etm-005', '企业所得税', '季度预缴', 'Q1应纳所得额30000元，预缴所得税7500元',          '2026-Q1', 'paid',  'manual')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. 税务申报批次
-- ─────────────────────────────────────────────────────────────────────────────
insert into tax_filing_batches (id, company_id, tax_type, filing_period, status) values
  ('tfb-001', 'cmp-tech-001', '增值税',   '2026-04', 'submitted'),
  ('tfb-002', 'cmp-tech-001', '企业所得税','2026-Q1', 'draft')
on conflict (id) do nothing;

insert into tax_filing_batch_items (batch_id, tax_item_id) values
  ('tfb-001', 'tax-001'),
  ('tfb-001', 'tax-002'),
  ('tfb-002', 'tax-005')
on conflict (batch_id, tax_item_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. 风险发现
-- ─────────────────────────────────────────────────────────────────────────────
insert into risk_findings (id, company_id, business_event_id, rule_code, severity, status, title, detail) values
  ('risk-001', 'cmp-tech-001', 'evt-013', 'AR-OVERDUE-60D', 'high', 'open',
   '应收账款逾期超60天未收回',
   '演示客户应收账款30000元已逾期超过60天，建议立即启动催收程序，评估坏账准备计提必要性。如逾期超180天，需计提坏账准备并关注增值税进项税额转出风险。'),
  ('risk-002', 'cmp-tech-001', 'evt-015', 'ENT-EXPENSE-LIMIT', 'medium', 'open',
   '业务招待费可能超过税前扣除限额',
   '当前4月业务招待费4200元，按年度收入0.5%计算扣除上限约为年收入*0.5%。需年末汇算前核对全年发生额是否超过发生额60%与年收入0.5%中较小值，超限部分需纳税调增。'),
  ('risk-003', 'cmp-tech-001', 'evt-009', 'RND-CONTRACT-DOC', 'medium', 'open',
   '委外研发合同资料不完整',
   '委外研发合同已签订但验收单、技术成果交付物等资料尚未完整归档。享受研发费用加计扣除须保存完整的合同、发票、验收文件及费用明细，建议在年末汇算前补充完善。')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. 研发项目
-- ─────────────────────────────────────────────────────────────────────────────
insert into rnd_projects (id, company_id, business_event_id, code, name, status, capitalization_policy, started_on, owner_id, notes) values
  ('rnd-001', 'cmp-tech-001', 'evt-025', 'RD-2026-001', '智能财税管理系统研发', 'active', 'expense', '2026-01-15', 'usr-chairman-001',
   '自主研发核心财税智能化功能模块，包含AI账务、税务合规检测、智能报表等。2023年起研发费用可享受100%加计扣除政策。')
on conflict (id) do nothing;

-- 研发费用明细（使用实际schema列名：cost_type, accounting_treatment, amount, occurred_on, notes）
insert into rnd_cost_lines (id, company_id, project_id, business_event_id, cost_type, accounting_treatment, amount, occurred_on, notes) values
  ('rcl-001', 'cmp-tech-001', 'rnd-001', 'evt-007', 'staff',     'expense', 50000.00, '2026-04-30', '研发人员4月人工成本（张伟+王明+陈欣部分工时）'),
  ('rcl-002', 'cmp-tech-001', 'rnd-001', 'evt-009', 'outsource', 'expense', 120000.00, '2026-04-05', '委外研发首期款-核心算法模块开发'),
  ('rcl-003', 'cmp-tech-001', 'rnd-001', 'evt-004', 'cloud',     'expense', 18000.00, '2026-04-01', '4月云服务器及SaaS工具费用分摊')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. 任务
-- ─────────────────────────────────────────────────────────────────────────────
insert into tasks (id, company_id, business_event_id, title, description, status, priority, owner_id, due_at, assignee_department, source) values
  ('task-001', 'cmp-tech-001', 'evt-019', '月度增值税申报',
   '完成2026年5月增值税一般纳税人月度申报：核对销项、进项发票，填报增值税申报表，通过电子税务局提交并完成缴税',
   'in_progress', 'high', 'usr-fin-001', '2026-05-15 17:00:00+08', 'dept-finance', 'manual'),
  ('task-002', 'cmp-tech-001', 'evt-020', '个税月报申报',
   '完成2026年5月个人所得税扣缴申报，核对各员工工资薪金个税计算，通过自然人电子税务局提交申报',
   'todo', 'high', 'usr-fin-001', '2026-05-15 17:00:00+08', 'dept-finance', 'manual'),
  ('task-003', 'cmp-tech-001', 'evt-008', '社保公积金5月申报',
   '核对在职员工社保公积金缴纳基数，完成5月社保公积金申报缴纳，确保及时足额缴纳',
   'todo', 'medium', 'usr-fin-001', '2026-05-25 17:00:00+08', 'dept-finance', 'manual'),
  ('task-004', 'cmp-tech-001', 'evt-024', '第一季度企业所得税预缴',
   '已完成2026年Q1企业所得税季度预缴申报，应纳税额7500元已缴清',
   'done', 'high', 'usr-fin-001', '2026-04-30 17:00:00+08', 'dept-finance', 'manual'),
  ('task-005', 'cmp-tech-001', 'evt-013', '客户A应收账款核查',
   '核查客户A首付200000元后的后续付款计划，跟进合同执行进度，评估应收账款回收风险',
   'in_progress', 'high', 'usr-fin-001', '2026-05-10 17:00:00+08', 'dept-finance', 'manual'),
  ('task-006', 'cmp-tech-001', 'evt-025', '研发费用加计扣除资料整理',
   '整理2026年上半年研发费用归集明细，包含人工、外包、云服务等，准备加计扣除辅助账及支撑材料',
   'todo', 'medium', 'usr-chairman-001', '2026-05-31 17:00:00+08', 'dept-tech-001', 'manual'),
  ('task-007', 'cmp-tech-001', 'evt-026', '工商年报准备',
   '准备2025年度工商年报（公司2026年1月设立，首次年报含设立当年信息），在国家企业信用信息公示系统完成年报公示',
   'todo', 'low', 'usr-fin-001', '2026-06-30 17:00:00+08', 'dept-finance', 'manual'),
  ('task-008', 'cmp-tech-001', 'evt-009', '委外研发验收单归档',
   '收集乙方技术公司委外研发首期里程碑验收单、交付物清单，完成文档归档以支持研发加计扣除资质',
   'todo', 'medium', 'usr-chairman-001', '2026-05-20 17:00:00+08', 'dept-tech-001', 'manual')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. 企业知识库（5条政策法规）
-- company_knowledge_items.company_id 为 text 类型
-- ─────────────────────────────────────────────────────────────────────────────
insert into company_knowledge_items (id, company_id, category, title, content, tags, is_active, created_by_user_id) values
  ('a1b2c3d4-0001-4000-8000-000000000001'::uuid,
   'cmp-tech-001',
   'regulation',
   '研发费用加计扣除政策（2023年起100%加计扣除）',
   '根据财政部、税务总局公告2023年第7号，自2023年1月1日起，企业开展研发活动中实际发生的研发费用，未形成无形资产计入当期损益的，在按规定据实扣除的基础上，再按照实际发生额的100%在税前加计扣除；形成无形资产的，按照无形资产成本的200%在税前摊销。适用于所有企业，不再区分制造业与其他行业。研发费用加计扣除须按照《研究开发费用税前加计扣除政策执行指引》归集，需保存完整的研发立项文件、研发费用辅助账及相关支撑凭证。',
   ARRAY['研发费用', '加计扣除', '企业所得税', '税收优惠'],
   true, 'usr-fin-001'),

  ('a1b2c3d4-0002-4000-8000-000000000002'::uuid,
   'cmp-tech-001',
   'regulation',
   '一般纳税人增值税计算方法（销项税减进项税）',
   '增值税一般纳税人采用购进扣税法计算应纳税额。计算公式：应纳增值税=当期销项税额-当期进项税额（含上期留抵税额）。销项税额=销售额×适用税率，技术服务适用税率为6%。进项税额可凭增值税专用发票、海关进口增值税专用缴款书、农产品收购发票等合规凭证抵扣。不得抵扣项目包括：用于简易计税方法、免征增值税项目、集体福利或个人消费等。月度申报期为次月1日至15日，逢节假日顺延。',
   ARRAY['增值税', '一般纳税人', '销项税', '进项税', '抵扣'],
   true, 'usr-fin-001'),

  ('a1b2c3d4-0003-4000-8000-000000000003'::uuid,
   'cmp-tech-001',
   'regulation',
   '业务招待费税前扣除限额（发生额60%且不超年收入0.5%）',
   '根据《企业所得税法实施条例》第四十三条，企业发生的与生产经营活动有关的业务招待费，按照发生额的60%扣除，但最高不得超过当年销售（营业）收入的5‰（即0.5%）。计算时取两者中的较小值。例如：若全年业务招待费发生额为50000元，销售收入为800000元，则：方式一=50000*60%=30000元；方式二=800000*0.5%=4000元；税前可扣除=min(30000,4000)=4000元，超出46000元需在年度汇算清缴时纳税调增。',
   ARRAY['业务招待费', '税前扣除', '纳税调增', '企业所得税'],
   true, 'usr-fin-001'),

  ('a1b2c3d4-0004-4000-8000-000000000004'::uuid,
   'cmp-tech-001',
   'regulation',
   '旅客运输及住宿增值税进项抵扣规定',
   '根据财税〔2019〕39号，自2019年4月1日起，纳税人购进国内旅客运输服务，其进项税额允许从销项税额中抵扣。凭取得的增值税电子普通发票抵扣：票面注明旅客身份信息且税额明确的，按票面金额抵扣；未注明税额的，适用税率9%（航空、火车）或3%（其他）计算进项税额=票面金额÷(1+适用税率)×适用税率。住宿费取得增值税专用发票的，按票面注明税率抵扣（一般为6%）。差旅费进项税额抵扣需留存相关凭证备查。',
   ARRAY['进项税', '差旅费', '旅客运输', '住宿', '增值税抵扣'],
   true, 'usr-fin-001'),

  ('a1b2c3d4-0005-4000-8000-000000000005'::uuid,
   'cmp-tech-001',
   'regulation',
   '印花税应税合同分类与税率',
   '根据《印花税法》（2022年7月1日施行），主要应税合同及税率如下：（1）买卖合同（包括供销合同）：0.03%；（2）加工承揽合同、建设工程合同、运输合同：0.03%；（3）技术合同（含技术开发、技术转让、技术咨询、技术服务合同）：0.03%；（4）借款合同（银行及其他金融机构与借款人签订的借款合同）：0.005%；（5）融资租赁合同：0.005%；（6）租赁合同：0.1%；（7）财产保险合同：0.1%。注：技术合同中，技术服务合同按0.03%税率计征；贷款合同按0.005%计征。',
   ARRAY['印花税', '税率', '技术合同', '借款合同', '应税合同'],
   true, 'usr-fin-001')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. 报告快照（2026年4月财务报表）
-- ─────────────────────────────────────────────────────────────────────────────
insert into report_snapshots (id, company_id, report_type, period_type, period_label, snapshot_date, payload) values
  ('rpt-2604-combined', 'cmp-tech-001', 'combined', 'month', '2026-04', '2026-04-30',
   '{
     "balance_sheet": {
       "snapshot_date": "2026-04-30",
       "currency": "CNY",
       "assets": {
         "current_assets": {
           "cash_and_bank": 1200000,
           "accounts_receivable": 350000,
           "prepaid_expenses": 42000,
           "other_current_assets": 45000,
           "total_current": 1637000
         },
         "non_current_assets": {
           "fixed_assets_gross": 85000,
           "accumulated_depreciation": -2361,
           "fixed_assets_net": 82639,
           "intangible_assets": 3500,
           "long_term_deposits": 40000,
           "total_non_current": 126139
         },
         "total_assets": 1763139
       },
       "liabilities": {
         "current_liabilities": {
           "short_term_loans": 1000000,
           "accounts_payable": 15000,
           "employee_payables": 86000,
           "taxes_payable": 20161,
           "other_payables": 8000,
           "total_current": 1129161
         },
         "total_liabilities": 1129161
       },
       "equity": {
         "paid_in_capital": 500000,
         "capital_reserve": 0,
         "retained_earnings": 133978,
         "total_equity": 633978
       },
       "total_liabilities_and_equity": 1763139
     },
     "profit_statement": {
       "period": "2026-04",
       "currency": "CNY",
       "revenue": {
         "main_business_revenue": 188679,
         "other_income": 100000,
         "total_revenue": 288679
       },
       "expenses": {
         "cost_of_sales": 0,
         "sales_expense": 26000,
         "admin_expense": 55208,
         "rnd_expense": 188000,
         "financial_expense": 3208,
         "total_expenses": 272416
       },
       "operating_profit": 16263,
       "non_operating_income": 0,
       "profit_before_tax": 16263,
       "income_tax": 4066,
       "net_profit": 12197
     },
     "key_metrics": {
       "employees_count": 5,
       "contracts_active": 6,
       "receivables_overdue_days": 65,
       "cash_burn_rate_monthly": 272416,
       "months_runway": 4.4,
       "rnd_expense_ratio": 0.651
     }
   }'::jsonb)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 完成
-- ─────────────────────────────────────────────────────────────────────────────
insert into schema_migrations (version) values ('015')
on conflict (version) do nothing;
