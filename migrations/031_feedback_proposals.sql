-- Phase9 任务2：用户反馈 → 升级需求建议 → 决策者批准 → 开发
-- 成为系统持续优化升级的底层数据支撑

-- ── 用户反馈 ──────────────────────────────────────────────────────────────────
create table if not exists feedback (
  id          text primary key,
  company_id  text not null,
  user_id     text,
  user_name   text not null default '',
  category    text not null default 'suggestion',  -- bug | suggestion | question
  title       text not null,
  content     text not null default '',
  module      text not null default '',            -- 涉及模块/页面
  status      text not null default 'open',         -- open | triaged | merged | closed
  votes       int not null default 0,
  proposal_id text,                                 -- 已并入的升级需求
  created_at  timestamptz not null default now()
);
create index if not exists idx_feedback_company on feedback(company_id, status, created_at desc);

-- ── 升级需求建议（由反馈浓缩而成，走审批）──────────────────────────────────────
create table if not exists upgrade_proposals (
  id              text primary key,
  company_id      text not null,
  title           text not null,
  summary         text not null default '',
  priority        text not null default 'medium',   -- high | medium | low
  source_count    int not null default 0,           -- 来源反馈数
  source_ids      jsonb not null default '[]',
  status          text not null default 'draft',      -- draft | submitted | approved | rejected | in_development | done
  decided_by      text,
  decided_by_name text not null default '',
  decided_at      timestamptz,
  decision_note   text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_proposals_company on upgrade_proposals(company_id, status, created_at desc);
