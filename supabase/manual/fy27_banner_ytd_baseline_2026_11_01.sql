-- FY27 Banner YTD baseline from the five account-detail exports supplied 2026-11-01.
--
-- This imports only requisition/PO invoice lines. Expense (EX) journal entries are
-- already represented by the Credit Card / Expense Claim workflow and are not
-- duplicated here. The net-zero June reclassification pairs are also retained in
-- Banner only because they have no net budget effect and no matching current PO.
-- EP023192 (Nametags) remains on legacy allocation math because the supplied file
-- includes only its 2AC230 allocation, not the second organization's $36 line.

begin;

create temporary table banner_baseline_pre_totals on commit drop as
select
  fiscal_year_name,
  round(sum(requested_total), 2) as requested,
  round(sum(enc_total), 2) as enc,
  round(sum(pending_cc_total), 2) as pending_cc,
  round(sum(posted_total), 2) as posted,
  round(sum(obligated_total), 2) as obligated
from app_theatre_budget.v_actuals_by_banner_code
where fiscal_year_name in ('FY26', 'FY27')
group by fiscal_year_name;

-- Normalize the 22 costume lines already seeded by the partial-payment migration
-- to the same duplicate keys produced by the live CSV parser.
update app_theatre_budget.purchase_invoice_transactions transaction
set source_line_key = mapping.canonical_key
from (values
  ('banner:I0547718:1', 'banner|2027|2AC230|U001|11305|A0|I0547718|10/20/2026 9:59:46 AM|10/20/2026 11:20:02 AM|INEC|-8.99|-|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:1', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|34.53|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:2', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|21.24|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:3', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|9.49|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:4', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|13.98|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:5', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|42.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:6', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|39.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:7', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|19.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:8', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|34.48|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:9', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:04 AM|INEI|9.59|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:10', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|34.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:11', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|19.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:12', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|8.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:13', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|9.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:14', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|18.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:15', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|18.49|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:16', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|35.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:17', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|26.97|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:18', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|9.99|+|AMAZON CAPITAL SERVICES|2'),
  ('banner:I0547893:19', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|14.99|+|AMAZON CAPITAL SERVICES|1'),
  ('banner:I0547893:20', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:05 AM|INEI|35.99|+|AMAZON CAPITAL SERVICES|2'),
  ('banner:I0547893:21', 'banner|2027|2AC230|U001|11305|A0|I0547893|10/26/2026 1:14:24 PM|10/27/2026 8:21:06 AM|INEI|23.99|+|AMAZON CAPITAL SERVICES|1')
) as mapping(old_key, canonical_key)
where transaction.source_line_key = mapping.old_key;

insert into app_theatre_budget.purchase_invoice_transactions (
  purchase_id,
  purchase_allocation_id,
  document_number,
  transaction_date,
  description,
  amount,
  source_line_key
)
values
  ('fe4813d2-c4ee-4296-8ecd-8b95bf4aae73','e000bb33-ecec-4a37-8812-181c8b5e8d79','J0180928',date '2026-06-22','Re-class I0543154',2805.00,'banner|2027|2AC230|U001|13220|A0|J0180928|06/22/2026 11:59:59 PM|07/23/2026 7:14:04 PM|JE15|2805.0|+|RE-CLASS I0543154|1'),
  ('1dfd5aba-ffce-4336-92f9-5d627013453e','660866e4-c32f-444e-a477-de0c54b277f1','I0546977',date '2026-09-30','Amazon Capital Services',27.98,'banner|2027|2AC230|U001|11305|A0|I0546977|09/30/2026 3:16:48 PM|10/01/2026 5:41:04 PM|INEI|27.98|+|AMAZON CAPITAL SERVICES|1'),
  ('1dfd5aba-ffce-4336-92f9-5d627013453e','660866e4-c32f-444e-a477-de0c54b277f1','I0546977',date '2026-09-30','Amazon Capital Services',12.70,'banner|2027|2AC230|U001|11305|A0|I0546977|09/30/2026 3:16:48 PM|10/01/2026 5:41:04 PM|INEI|12.7|+|AMAZON CAPITAL SERVICES|1'),
  ('71d5ad38-adb4-4155-87d3-f077a6ca7fe6','869fa73e-80cf-4b5d-9177-e40452423519','I0546978',date '2026-09-30','Amazon Capital Services',35.99,'banner|2027|2AC230|U001|11300|A0|I0546978|09/30/2026 3:17:40 PM|10/01/2026 5:41:04 PM|INEI|35.99|+|AMAZON CAPITAL SERVICES|1'),
  ('71d5ad38-adb4-4155-87d3-f077a6ca7fe6','869fa73e-80cf-4b5d-9177-e40452423519','I0546978',date '2026-09-30','Amazon Capital Services',9.99,'banner|2027|2AC230|U001|11300|A0|I0546978|09/30/2026 3:17:40 PM|10/01/2026 5:41:04 PM|INEI|9.99|+|AMAZON CAPITAL SERVICES|1'),
  ('71d5ad38-adb4-4155-87d3-f077a6ca7fe6','869fa73e-80cf-4b5d-9177-e40452423519','I0546978',date '2026-09-30','Amazon Capital Services',9.99,'banner|2027|2AC230|U001|11300|A0|I0546978|09/30/2026 3:17:40 PM|10/01/2026 5:41:04 PM|INEI|9.99|+|AMAZON CAPITAL SERVICES|2'),
  ('8408128a-45ab-4a88-9c3d-28eb30ea3f66','7c3804f7-9d97-4e14-843a-924450413d4b','I0547662',date '2026-10-19','Grainger',36.37,'banner|2027|2AC230|U001|11300|A0|I0547662|10/19/2026 1:38:17 PM|10/25/2026 7:13:04 PM|INEI|36.37|+|GRAINGER|1'),
  ('8408128a-45ab-4a88-9c3d-28eb30ea3f66','7c3804f7-9d97-4e14-843a-924450413d4b','I0547662',date '2026-10-19','Grainger',94.81,'banner|2027|2AC230|U001|11300|A0|I0547662|10/19/2026 1:38:17 PM|10/25/2026 7:13:04 PM|INEI|94.81|+|GRAINGER|1'),
  ('8408128a-45ab-4a88-9c3d-28eb30ea3f66','7c3804f7-9d97-4e14-843a-924450413d4b','I0547662',date '2026-10-19','Grainger',4.10,'banner|2027|2AC230|U001|11300|A0|I0547662|10/19/2026 1:38:17 PM|10/25/2026 7:13:04 PM|INEI|4.1|+|GRAINGER|1'),
  ('8408128a-45ab-4a88-9c3d-28eb30ea3f66','7c3804f7-9d97-4e14-843a-924450413d4b','I0547662',date '2026-10-19','Grainger',7.56,'banner|2027|2AC230|U001|11300|A0|I0547662|10/19/2026 1:38:17 PM|10/25/2026 7:13:04 PM|INEI|7.56|+|GRAINGER|1'),
  ('8408128a-45ab-4a88-9c3d-28eb30ea3f66','7c3804f7-9d97-4e14-843a-924450413d4b','I0547662',date '2026-10-19','Grainger',6.88,'banner|2027|2AC230|U001|11300|A0|I0547662|10/19/2026 1:38:17 PM|10/25/2026 7:13:05 PM|INEI|6.88|+|GRAINGER|1'),
  ('8408128a-45ab-4a88-9c3d-28eb30ea3f66','7c3804f7-9d97-4e14-843a-924450413d4b','I0547662',date '2026-10-19','Grainger',6.44,'banner|2027|2AC230|U001|11300|A0|I0547662|10/19/2026 1:38:17 PM|10/25/2026 7:13:05 PM|INEI|6.44|+|GRAINGER|1'),
  ('8408128a-45ab-4a88-9c3d-28eb30ea3f66','7c3804f7-9d97-4e14-843a-924450413d4b','I0547662',date '2026-10-19','Grainger',7.24,'banner|2027|2AC230|U001|11300|A0|I0547662|10/19/2026 1:38:17 PM|10/25/2026 7:13:05 PM|INEI|7.24|+|GRAINGER|1'),
  ('6de52152-b808-4152-9fec-308b7dd00169','64e1d6d5-b823-469e-856f-ba11b27d0253','I0547888',date '2026-10-26','Amazon Capital Services',28.98,'banner|2027|2AC230|U001|11300|A0|I0547888|10/26/2026 1:00:13 PM|10/27/2026 8:19:02 AM|INEI|28.98|+|AMAZON CAPITAL SERVICES|1'),
  ('6de52152-b808-4152-9fec-308b7dd00169','64e1d6d5-b823-469e-856f-ba11b27d0253','I0547888',date '2026-10-26','Amazon Capital Services',13.88,'banner|2027|2AC230|U001|11300|A0|I0547888|10/26/2026 1:00:13 PM|10/27/2026 8:19:03 AM|INEI|13.88|+|AMAZON CAPITAL SERVICES|1'),
  ('6de52152-b808-4152-9fec-308b7dd00169','64e1d6d5-b823-469e-856f-ba11b27d0253','I0547888',date '2026-10-26','Amazon Capital Services',45.00,'banner|2027|2AC230|U001|11300|A0|I0547888|10/26/2026 1:00:13 PM|10/27/2026 8:19:03 AM|INEI|45.0|+|AMAZON CAPITAL SERVICES|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',44.95,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:03 PM|INEI|44.95|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',209.40,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:03 PM|INEI|209.4|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',25.56,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:03 PM|INEI|25.56|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',223.25,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:03 PM|INEI|223.25|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',145.20,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:03 PM|INEI|145.2|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',24.67,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:03 PM|INEI|24.67|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',34.56,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:03 PM|INEI|34.56|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',169.23,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:04 PM|INEI|169.23|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',151.92,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:04 PM|INEI|151.92|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',25.00,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:04 PM|INEI|25.0|+|CURTIS LUMBER|1'),
  ('b3fa5fef-7f4e-47c9-ab94-97ef8b171240','4bf4587e-a470-4acb-99c1-0eae8ad37e02','I0547509',date '2026-10-14','Curtis Lumber',126.72,'banner|2027|2AC230|U001|11300|A0|I0547509|10/14/2026 3:04:09 PM|10/18/2026 2:48:04 PM|INEI|126.72|+|CURTIS LUMBER|1'),
  ('646ef20e-0423-4dcd-8d4b-fdc0a6e4d325','e15318ef-30ab-4f6e-b9d2-c053108448c4','I0547171',date '2026-10-07','B&H Photo-Video',21.65,'banner|2027|2AC230|U001|11308|A0|I0547171|10/07/2026 1:27:51 PM|10/08/2026 1:07:03 PM|INEI|21.65|+|B&H PHOTO-VIDEO|1'),
  ('646ef20e-0423-4dcd-8d4b-fdc0a6e4d325','e15318ef-30ab-4f6e-b9d2-c053108448c4','I0547171',date '2026-10-07','B&H Photo-Video',50.32,'banner|2027|2AC230|U001|11308|A0|I0547171|10/07/2026 1:27:51 PM|10/08/2026 1:07:03 PM|INEI|50.32|+|B&H PHOTO-VIDEO|1'),
  ('18a9cc31-39a9-4ada-abb0-83f400099a1a','a5ae1b20-cc39-422c-a288-6bce032d10a5','I0547173',date '2026-10-07','B&H Photo-Video',22.60,'banner|2027|2AC230|U001|11308|A0|I0547173|10/07/2026 1:30:01 PM|10/08/2026 1:08:03 PM|INEI|22.6|+|B&H PHOTO-VIDEO|1'),
  ('18a9cc31-39a9-4ada-abb0-83f400099a1a','a5ae1b20-cc39-422c-a288-6bce032d10a5','I0547173',date '2026-10-07','B&H Photo-Video',732.56,'banner|2027|2AC230|U001|11308|A0|I0547173|10/07/2026 1:30:01 PM|10/08/2026 1:08:03 PM|INEI|732.56|+|B&H PHOTO-VIDEO|1'),
  ('18a9cc31-39a9-4ada-abb0-83f400099a1a','a5ae1b20-cc39-422c-a288-6bce032d10a5','I0547173',date '2026-10-07','B&H Photo-Video',74.52,'banner|2027|2AC230|U001|11308|A0|I0547173|10/07/2026 1:30:01 PM|10/08/2026 1:08:03 PM|INEI|74.52|+|B&H PHOTO-VIDEO|1'),
  ('18a9cc31-39a9-4ada-abb0-83f400099a1a','a5ae1b20-cc39-422c-a288-6bce032d10a5','I0547173',date '2026-10-07','B&H Photo-Video',216.50,'banner|2027|2AC230|U001|11308|A0|I0547173|10/07/2026 1:30:01 PM|10/08/2026 1:08:03 PM|INEI|216.5|+|B&H PHOTO-VIDEO|1'),
  ('960cc159-bbee-417d-9aef-4aac333b829c','1ba4033f-0fc7-4f3b-a094-7998714031ac','I0547842',date '2026-10-23','Amazon Capital Services',158.40,'banner|2027|2AC230|U001|11308|A0|I0547842|10/23/2026 3:23:28 PM|10/25/2026 6:54:05 PM|INEI|158.4|+|AMAZON CAPITAL SERVICES|1'),
  ('18a9cc31-39a9-4ada-abb0-83f400099a1a','a5ae1b20-cc39-422c-a288-6bce032d10a5','I0547173',date '2026-10-07','B&H Photo-Video',86.60,'banner|2027|2AC230|U001|11308|A0|I0547173|10/07/2026 1:30:01 PM|10/08/2026 1:08:03 PM|INEI|86.6|+|B&H PHOTO-VIDEO|1'),
  ('18a9cc31-39a9-4ada-abb0-83f400099a1a','a5ae1b20-cc39-422c-a288-6bce032d10a5','I0547173',date '2026-10-07','B&H Photo-Video',216.50,'banner|2027|2AC230|U001|11308|A0|I0547173|10/07/2026 1:30:01 PM|10/08/2026 1:08:03 PM|INEI|216.5|+|B&H PHOTO-VIDEO|2')
on conflict (purchase_id, source_line_key) where source_line_key is not null do nothing;

do $$
declare
  v_mismatch_count integer;
  v_fy26_before banner_baseline_pre_totals%rowtype;
  v_fy26_after banner_baseline_pre_totals%rowtype;
  v_fy27_before banner_baseline_pre_totals%rowtype;
  v_fy27_after banner_baseline_pre_totals%rowtype;
begin
  select count(*) into v_mismatch_count
  from (values
    ('11300', 1487.69::numeric),
    ('11301', 0.00::numeric),
    ('11305', 674.43::numeric),
    ('11308', 1699.65::numeric),
    ('13220', 2805.00::numeric)
  ) expected(account_code, ytd)
  left join (
    select banner_account_code, round(sum(posted_total), 2) as ytd
    from app_theatre_budget.v_actuals_by_banner_code
    where fiscal_year_name = 'FY27' and org_code = '2AC230'
    group by banner_account_code
  ) actual on actual.banner_account_code = expected.account_code
  where actual.ytd is distinct from expected.ytd;

  if v_mismatch_count <> 0 then
    raise exception 'Banner baseline account validation failed for % account(s).', v_mismatch_count;
  end if;

  select * into v_fy26_before from banner_baseline_pre_totals where fiscal_year_name = 'FY26';
  select
    fiscal_year_name,
    round(sum(requested_total), 2), round(sum(enc_total), 2), round(sum(pending_cc_total), 2),
    round(sum(posted_total), 2), round(sum(obligated_total), 2)
  into v_fy26_after
  from app_theatre_budget.v_actuals_by_banner_code
  where fiscal_year_name = 'FY26'
  group by fiscal_year_name;

  if v_fy26_after is distinct from v_fy26_before then
    raise exception 'FY26 totals changed during the FY27 baseline load.';
  end if;

  select * into v_fy27_before from banner_baseline_pre_totals where fiscal_year_name = 'FY27';
  select
    fiscal_year_name,
    round(sum(requested_total), 2), round(sum(enc_total), 2), round(sum(pending_cc_total), 2),
    round(sum(posted_total), 2), round(sum(obligated_total), 2)
  into v_fy27_after
  from app_theatre_budget.v_actuals_by_banner_code
  where fiscal_year_name = 'FY27'
  group by fiscal_year_name;

  if v_fy27_after.requested is distinct from v_fy27_before.requested
     or v_fy27_after.pending_cc is distinct from v_fy27_before.pending_cc
     or v_fy27_after.obligated is distinct from v_fy27_before.obligated
     or v_fy27_after.posted is distinct from v_fy27_before.posted + 1180.46
     or v_fy27_after.enc is distinct from v_fy27_before.enc - 1180.46 then
    raise exception 'FY27 totals did not move from ENC to YTD exactly as expected.';
  end if;
end;
$$;

commit;

select
  fiscal_year_name,
  round(sum(requested_total), 2) as requested,
  round(sum(enc_total), 2) as enc,
  round(sum(pending_cc_total), 2) as pending_cc,
  round(sum(posted_total), 2) as posted,
  round(sum(obligated_total), 2) as obligated
from app_theatre_budget.v_actuals_by_banner_code
where fiscal_year_name in ('FY26', 'FY27')
group by fiscal_year_name
order by fiscal_year_name;
