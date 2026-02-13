from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

BASE = Path('/Users/mikelounello/theatre-budget-app/source-sheets')
UNIMARKET = BASE / 'Unimarket Export.csv'
BANNER = BASE / 'YTD Banner Lines.csv'
SUPABASE = BASE / 'SupabaseBudgetExport.csv'

OUT_REQ = BASE / 'requisitions_grouped.csv'
OUT_BANNER = BASE / 'banner_docs_grouped.csv'
OUT_RECON = BASE / 'requisition_banner_reconciled.csv'
OUT_REVIEW = BASE / 'review_needed.csv'

TWOPL = Decimal('0.01')


def read_dict_rows(path: Path):
    last_err = None
    for enc in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            with path.open(newline='', encoding=enc) as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                fields = reader.fieldnames or []
            return fields, rows
        except UnicodeDecodeError as e:
            last_err = e
            continue
    raise last_err if last_err else RuntimeError(f'Unable to read {path}')


def money(v: str | None) -> Decimal:
    if v is None:
        return Decimal('0')
    s = str(v).strip().replace('$', '').replace(',', '')
    if s == '':
        return Decimal('0')
    try:
        return Decimal(s)
    except InvalidOperation:
        return Decimal('0')


def q2(v: Decimal) -> str:
    return str(v.quantize(TWOPL, rounding=ROUND_HALF_UP))


def norm(v: str | None) -> str:
    return (v or '').strip()


@dataclass
class ReqAgg:
    requisition_number: str
    order_numbers: set[str]
    total: Decimal
    acctpart4: set[str]
    line_count: int


@dataclass
class BannerAgg:
    doc_code: str
    total: Decimal
    acct_codes: set[str]
    line_count: int


req_map: dict[str, ReqAgg] = {}
fields, rows = read_dict_rows(UNIMARKET)
required = ['RequisitionNumber', 'OrderNumber', 'OrderLineAmount', 'AcctPart4']
for col in required:
    if col not in fields:
        raise SystemExit(f'Missing required column in Unimarket Export.csv: {col}')

for row in rows:
    req = norm(row.get('RequisitionNumber'))
    if not req:
        continue
    order_no = norm(row.get('OrderNumber'))
    amt = money(row.get('OrderLineAmount'))
    acct = norm(row.get('AcctPart4'))

    agg = req_map.get(req)
    if agg is None:
        agg = ReqAgg(req, set(), Decimal('0'), set(), 0)
        req_map[req] = agg
    if order_no:
        agg.order_numbers.add(order_no)
    if acct:
        agg.acctpart4.add(acct)
    agg.total += amt
    agg.line_count += 1

banner_map: dict[str, BannerAgg] = {}
fields, rows = read_dict_rows(BANNER)
required = ['DOC_CODE', 'TRANS_AMT', 'DR_CR_IND', 'ACCT_CODE']
for col in required:
    if col not in fields:
        raise SystemExit(f'Missing required column in YTD Banner Lines.csv: {col}')

for row in rows:
    doc = norm(row.get('DOC_CODE'))
    if not doc:
        continue
    amt = money(row.get('TRANS_AMT'))
    drcr = norm(row.get('DR_CR_IND'))
    if drcr == '-':
        amt = -amt
    acct = norm(row.get('ACCT_CODE'))

    agg = banner_map.get(doc)
    if agg is None:
        agg = BannerAgg(doc, Decimal('0'), set(), 0)
        banner_map[doc] = agg
    agg.total += amt
    if acct:
        agg.acct_codes.add(acct)
    agg.line_count += 1

supa_by_req: dict[str, list[dict[str, str]]] = defaultdict(list)
supa_by_po: dict[str, list[dict[str, str]]] = defaultdict(list)
_, rows = read_dict_rows(SUPABASE)
for row in rows:
    req = norm(row.get('requisition_number'))
    po = norm(row.get('po_number'))
    if req:
        supa_by_req[req].append(row)
    if po:
        supa_by_po[po].append(row)

with OUT_REQ.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow([
        'requisition_number',
        'unimarket_order_numbers',
        'order_value_total',
        'acctpart4_codes',
        'line_count',
        'review_needed',
        'review_reason',
    ])
    for req in sorted(req_map):
        agg = req_map[req]
        reasons = []
        if len(agg.acctpart4) != 1:
            reasons.append('multiple_or_missing_acctpart4')
        if len(agg.order_numbers) != 1:
            reasons.append('multiple_or_missing_order_numbers')
        w.writerow([
            req,
            ';'.join(sorted(agg.order_numbers)),
            q2(agg.total),
            ';'.join(sorted(agg.acctpart4)),
            agg.line_count,
            'yes' if reasons else 'no',
            ';'.join(reasons),
        ])

with OUT_BANNER.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow([
        'doc_code',
        'banner_total',
        'acct_codes',
        'line_count',
        'review_needed',
        'review_reason',
    ])
    for doc in sorted(banner_map):
        agg = banner_map[doc]
        reasons = []
        if len(agg.acct_codes) != 1:
            reasons.append('multiple_or_missing_acct_codes')
        w.writerow([
            doc,
            q2(agg.total),
            ';'.join(sorted(agg.acct_codes)),
            agg.line_count,
            'yes' if reasons else 'no',
            ';'.join(reasons),
        ])

used_banner_docs: set[str] = set()
recon_rows: list[dict[str, str]] = []

for req in sorted(req_map):
    agg = req_map[req]
    matched_docs = sorted([d for d in agg.order_numbers if d in banner_map])
    for d in matched_docs:
        used_banner_docs.add(d)

    banner_total = sum((banner_map[d].total for d in matched_docs), Decimal('0'))
    banner_codes = sorted({c for d in matched_docs for c in banner_map[d].acct_codes})

    supa_candidates = list(supa_by_req.get(req, []))
    for d in matched_docs:
        supa_candidates.extend(supa_by_po.get(d, []))

    supa_banner_codes = sorted({norm(r.get('banner_account_code')) for r in supa_candidates if norm(r.get('banner_account_code'))})
    supa_categories = sorted({norm(r.get('production_category')) for r in supa_candidates if norm(r.get('production_category'))})

    diff = banner_total - agg.total
    reasons = []
    if len(agg.order_numbers) != 1:
        reasons.append('multiple_or_missing_order_numbers')
    if len(agg.acctpart4) != 1:
        reasons.append('multiple_or_missing_unimarket_acctpart4')
    if len(matched_docs) == 0:
        reasons.append('no_banner_doc_match_from_order_number')
    if len(matched_docs) > 1:
        reasons.append('multiple_banner_docs_for_requisition')
    if abs(diff) > Decimal('0.01'):
        reasons.append('amount_mismatch_over_0.01')
    if len(banner_codes) != 1:
        reasons.append('multiple_or_missing_banner_acct_codes')
    if len(supa_categories) != 1:
        reasons.append('missing_or_multiple_supabase_categories')

    uni_code = sorted(agg.acctpart4)[0] if len(agg.acctpart4) == 1 else ''
    ban_code = banner_codes[0] if len(banner_codes) == 1 else ''
    if uni_code and ban_code and uni_code != ban_code:
        reasons.append('unimarket_vs_banner_acct_code_mismatch')

    status = 'exact_match' if not reasons else 'review'

    recon_rows.append(
        {
            'requisition_number': req,
            'unimarket_order_numbers': ';'.join(sorted(agg.order_numbers)),
            'unimarket_order_value_total': q2(agg.total),
            'unimarket_acctpart4_codes': ';'.join(sorted(agg.acctpart4)),
            'banner_doc_codes': ';'.join(matched_docs),
            'banner_total': q2(banner_total),
            'difference_banner_minus_unimarket': q2(diff),
            'banner_acct_codes': ';'.join(banner_codes),
            'supabase_banner_account_codes': ';'.join(supa_banner_codes),
            'supabase_production_categories': ';'.join(supa_categories),
            'match_status': status,
            'review_reason': ';'.join(reasons),
        }
    )

for doc in sorted(set(banner_map.keys()) - used_banner_docs):
    bagg = banner_map[doc]
    supa_candidates = supa_by_po.get(doc, [])
    supa_banner_codes = sorted({norm(r.get('banner_account_code')) for r in supa_candidates if norm(r.get('banner_account_code'))})
    supa_categories = sorted({norm(r.get('production_category')) for r in supa_candidates if norm(r.get('production_category'))})

    recon_rows.append(
        {
            'requisition_number': '',
            'unimarket_order_numbers': '',
            'unimarket_order_value_total': q2(Decimal('0')),
            'unimarket_acctpart4_codes': '',
            'banner_doc_codes': doc,
            'banner_total': q2(bagg.total),
            'difference_banner_minus_unimarket': q2(bagg.total),
            'banner_acct_codes': ';'.join(sorted(bagg.acct_codes)),
            'supabase_banner_account_codes': ';'.join(supa_banner_codes),
            'supabase_production_categories': ';'.join(supa_categories),
            'match_status': 'review',
            'review_reason': 'banner_doc_not_linked_to_unimarket_ordernumber',
        }
    )

fieldnames = [
    'requisition_number',
    'unimarket_order_numbers',
    'unimarket_order_value_total',
    'unimarket_acctpart4_codes',
    'banner_doc_codes',
    'banner_total',
    'difference_banner_minus_unimarket',
    'banner_acct_codes',
    'supabase_banner_account_codes',
    'supabase_production_categories',
    'match_status',
    'review_reason',
]

with OUT_RECON.open('w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    for row in recon_rows:
        w.writerow(row)

with OUT_REVIEW.open('w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    for row in recon_rows:
        if row['match_status'] != 'exact_match':
            w.writerow(row)

exact = sum(1 for r in recon_rows if r['match_status'] == 'exact_match')
review = len(recon_rows) - exact
print(f'requisitions: {len(req_map)}')
print(f'banner_docs: {len(banner_map)}')
print(f'recon_rows: {len(recon_rows)}')
print(f'exact_match: {exact}')
print(f'review: {review}')
print(f'output: {OUT_REQ}')
print(f'output: {OUT_BANNER}')
print(f'output: {OUT_RECON}')
print(f'output: {OUT_REVIEW}')
