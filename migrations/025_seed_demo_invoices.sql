-- 演示数据：发票台账示例（进项 + 销项），便于体验验真与「一键生成凭证」
-- 幂等：ON CONFLICT DO NOTHING

insert into invoices
  (id, company_id, direction, invoice_type, invoice_code, invoice_no, invoice_date,
   seller_name, seller_tax_no, buyer_name, amount, tax_amount, total_amount, tax_rate,
   verify_status, source, notes, created_at, updated_at)
values
  ('inv-demo-001','cmp-tech-001','input','vat_special','3100194130','12345678','2026-04-08',
   '上海云服务器有限公司','91310101MA1FL0AA01','示例科技有限公司',10000,1300,11300,0.13,
   'verified','manual','服务器采购', now() - interval '25 days', now()),
  ('inv-demo-002','cmp-tech-001','input','vat_common','3100194130','22345678','2026-04-12',
   '北京办公用品商行','91110101MA1FL0BB02','示例科技有限公司',2000,120,2120,0.06,
   'pending','manual','办公用品', now() - interval '20 days', now()),
  ('inv-demo-003','cmp-tech-001','output','vat_special',null,'32345678','2026-04-20',
   '示例科技有限公司','91310101MA1FL4LC06','广州某某贸易有限公司',50000,6500,56500,0.13,
   'verified','manual','软件开发服务收入', now() - interval '12 days', now())
on conflict (id) do nothing;
