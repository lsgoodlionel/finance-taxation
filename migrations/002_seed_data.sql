-- Migration: 002_seed_data
-- 初始种子数据：公司、角色、权限、演示用户

-- ─── Company ───────────────────────────────────────────────────────────────
insert into companies (id, name, status) values
  ('cmp-tech-001', '某科技有限公司', 'active')
on conflict (id) do nothing;

-- ─── Departments ───────────────────────────────────────────────────────────
insert into departments (id, company_id, parent_department_id, name, leader_user_id) values
  ('dept-board',   'cmp-tech-001', null, '董事会', 'usr-chairman-001'),
  ('dept-finance', 'cmp-tech-001', null, '财务部', 'usr-fin-001')
on conflict (id) do nothing;

-- ─── Users ─────────────────────────────────────────────────────────────────
insert into users (id, company_id, department_id, username, display_name, email, phone, status) values
  ('usr-chairman-001', 'cmp-tech-001', 'dept-board',   'chairman', '创始人董事长', 'chairman@example.com', '13800000000', 'active'),
  ('usr-fin-001',      'cmp-tech-001', 'dept-finance', 'finance',  '财务负责人',   'finance@example.com',  '13900000000', 'active')
on conflict (id) do nothing;

-- ─── User Passwords (DEMO ONLY — 明文仅用于开发演示，生产须替换为 bcrypt 哈希) ──
insert into user_passwords (user_id, password_hash) values
  ('usr-chairman-001', '123456'),
  ('usr-fin-001',      '123456')
on conflict (user_id) do nothing;

-- ─── Roles ─────────────────────────────────────────────────────────────────
insert into roles (id, company_id, code, name, description) values
  ('role-chairman',         'cmp-tech-001', 'role-chairman',         '创始人董事长', '全权限角色'),
  ('role-finance-director', 'cmp-tech-001', 'role-finance-director', '财务负责人',   '财务全权限，无系统设置权'),
  ('role-accountant',       'cmp-tech-001', 'role-accountant',       '会计',         '账务处理权限'),
  ('role-viewer',           'cmp-tech-001', 'role-viewer',           '查看者',       '全模块只读权限')
on conflict (id) do nothing;

-- ─── Role Permissions ──────────────────────────────────────────────────────
insert into role_permissions (id, role_id, permission_key, scope) values
  -- chairman（全量 17 权）
  ('rp-chr-01', 'role-chairman', 'dashboard.view',   'company'),
  ('rp-chr-02', 'role-chairman', 'events.view',      'company'),
  ('rp-chr-03', 'role-chairman', 'events.create',    'company'),
  ('rp-chr-04', 'role-chairman', 'events.assign',    'company'),
  ('rp-chr-05', 'role-chairman', 'tasks.view',       'company'),
  ('rp-chr-06', 'role-chairman', 'tasks.manage',     'company'),
  ('rp-chr-07', 'role-chairman', 'documents.view',   'company'),
  ('rp-chr-08', 'role-chairman', 'documents.manage', 'company'),
  ('rp-chr-09', 'role-chairman', 'ledger.view',      'company'),
  ('rp-chr-10', 'role-chairman', 'ledger.post',      'company'),
  ('rp-chr-11', 'role-chairman', 'tax.view',         'company'),
  ('rp-chr-12', 'role-chairman', 'tax.manage',       'company'),
  ('rp-chr-13', 'role-chairman', 'rnd.view',         'company'),
  ('rp-chr-14', 'role-chairman', 'rnd.manage',       'company'),
  ('rp-chr-15', 'role-chairman', 'risk.view',        'company'),
  ('rp-chr-16', 'role-chairman', 'risk.manage',      'company'),
  ('rp-chr-17', 'role-chairman', 'settings.manage',  'company'),
  -- finance-director（16 权，无 settings.manage）
  ('rp-fd-01', 'role-finance-director', 'dashboard.view',   'company'),
  ('rp-fd-02', 'role-finance-director', 'events.view',      'company'),
  ('rp-fd-03', 'role-finance-director', 'events.create',    'company'),
  ('rp-fd-04', 'role-finance-director', 'events.assign',    'company'),
  ('rp-fd-05', 'role-finance-director', 'tasks.view',       'company'),
  ('rp-fd-06', 'role-finance-director', 'tasks.manage',     'company'),
  ('rp-fd-07', 'role-finance-director', 'documents.view',   'company'),
  ('rp-fd-08', 'role-finance-director', 'documents.manage', 'company'),
  ('rp-fd-09', 'role-finance-director', 'ledger.view',      'company'),
  ('rp-fd-10', 'role-finance-director', 'ledger.post',      'company'),
  ('rp-fd-11', 'role-finance-director', 'tax.view',         'company'),
  ('rp-fd-12', 'role-finance-director', 'tax.manage',       'company'),
  ('rp-fd-13', 'role-finance-director', 'rnd.view',         'company'),
  ('rp-fd-14', 'role-finance-director', 'rnd.manage',       'company'),
  ('rp-fd-15', 'role-finance-director', 'risk.view',        'company'),
  ('rp-fd-16', 'role-finance-director', 'risk.manage',      'company'),
  -- accountant（9 权）
  ('rp-acc-01', 'role-accountant', 'dashboard.view',   'company'),
  ('rp-acc-02', 'role-accountant', 'events.view',      'company'),
  ('rp-acc-03', 'role-accountant', 'tasks.view',       'company'),
  ('rp-acc-04', 'role-accountant', 'documents.view',   'company'),
  ('rp-acc-05', 'role-accountant', 'documents.manage', 'company'),
  ('rp-acc-06', 'role-accountant', 'ledger.view',      'company'),
  ('rp-acc-07', 'role-accountant', 'ledger.post',      'company'),
  ('rp-acc-08', 'role-accountant', 'tax.view',         'company'),
  ('rp-acc-09', 'role-accountant', 'tax.manage',       'company'),
  -- viewer（6 权，纯只读）
  ('rp-vw-01', 'role-viewer', 'dashboard.view', 'company'),
  ('rp-vw-02', 'role-viewer', 'events.view',    'company'),
  ('rp-vw-03', 'role-viewer', 'tasks.view',     'company'),
  ('rp-vw-04', 'role-viewer', 'documents.view', 'company'),
  ('rp-vw-05', 'role-viewer', 'ledger.view',    'company'),
  ('rp-vw-06', 'role-viewer', 'tax.view',       'company')
on conflict (id) do nothing;

-- ─── User Roles ─────────────────────────────────────────────────────────────
insert into user_roles (user_id, role_id) values
  ('usr-chairman-001', 'role-chairman'),
  ('usr-fin-001',      'role-finance-director')
on conflict (user_id, role_id) do nothing;
