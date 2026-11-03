#!/usr/bin/env python3
# Hoopster S7 TL Corner sync: builds the TL fee data from three Google Sheet reads and encrypts it.
# Usage: python3 tl_sync.py tl_sync.json expenses.json overview.json out.json
# No password needed: data is sealed with the public key; only the TL password (in the browser) opens it.
import sys, json, os, re, base64, datetime
try:
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    os.system(sys.executable + ' -m pip install -q --break-system-packages cryptography')
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
PUB = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAre8ffOpiUuxsl3wab7GYlmKdYOzIKppB3ajRalcCGvEFdPft/yCSr2D9mWKjywOoXA7fip99MHgucHFmIa95UO6Jsyr/SDaI0bqp7RA3FiAGArWhC+XeNw/mplL8FLNf5ltn9iUOQx+6S2jT9BV61ePN6kyzdbAt5iXDoCJEIa5LFa1LFUWfVPJF1Ge0zUYlKm//wabIQHEvIIDTtoFTUPP9H9ojEX3hQO5iLLtVqjorCbjD2r3AliNatXOX8Yeq8xzT/6MwnmzZt5rMnhvLd8TEsh1tqP3wjX30Pw5SkwoZnHG8sfrT0elulQgRwiItajprsMY10Y2rMm993qpy2QIDAQAB'
LOCK = {'kdf': 'PBKDF2-SHA256', 'iter': 250000, 'salt': 'O/KQNflSeRSZbflACmVKmg==', 'iv_k': 'dLVTmhSHmiO1Bx3e', 'priv': '5XpjWy3OjgdlpevcOTF4O52gX/bVXlaqvBYj12y3Vk5Uv2cmoUFOrdsvGV23dNcqHV4zEAiN6FLyWzV6lDmbBlOxrmV4o0SfeopfF2VgkrRucdY7mJh785tF6G+M5BTXj6UTxu/estBdu+j0BN155wQtlHjAwsok/fYLFmaWDX4m4V0iQrmsq4HsZ+7qwFVbZiVSOc9f91TdTUqmHkAJ1+gIrCDRbnIQGXRLhybLRao7sd8hJSDgxrAVH4VzpSB2zA3G4K41DlnjCPDX2dkkWOadl+UpvcP+pJkx7Ag16STtCc2JjeqvaRwRse+olPd7wqh4cyxx96QiZBzebBneO2Ga7L7MHaK1oImyIbMeFs3FCUHffkH9jdWG+XMFTbU81RhVBYHVxq+ogPgAEGyt2XvwYYbhV4L/Ww8P609NMEa0mXwzj48QF1y3dqovWtg0FY0D9inP+zs48tFNu9dTuoBejPp5EyBJy1nVuFF7GX1TgejUiKVUxZV1WKHGO51rf2/L4fPxrAQMS60DclMppEJcJcl8XdZ+uAD/ZNJWn7lxqqnV1FFUyOjOPo2XxreuyMZjcttITjZtGN3f8oKm3EWzJek8tHRYPJHm4LNTB3+4d94vmCVk0Jt1Ra6A7yCMT/9hPbnq4L6OIW8Qm0jIcIPsNTZp4VV527QibohcnR87+SAPikn7ymBY7xCgXhNZHxYV6Ec9ZeWFxGLpHbQzMF3cDs6lNaCWA5f/dBN4Qq26e0faa5HCn1S74gdZaHP3gO6DOY0u0c7v6NKmhNvSWAWLXGpMqis7B6ZLoq1XrwU9QQYxjKvHal5dR2t2uWLqCJo178JED6h5rMekS28Nu3+fKbBGUbuKCrW/0x/vs59hcNqFOt9X2q+DFtf99xz6g/lK8z4SfcY8lN1iJ+fBlO+VSzGfsmGBMNy9LeLdrlQkCbqclp3hgpwv8ypjP1ZpN3xL7e29gaRJicjZFR5PxOz51xJla6i+ELVwdoF/2aSSxeSzdcwEHjZARIRSnDCbjQ9CPw/fVFcJyqRiwdoHku8cBKtbMc40WFKGUYDc9G07s1z9Sum9u+mO6Y6NBmYUzoXAizHwv2u+PWq/zw0Jo1Rl06Y2htdM8oneNkJdbvSjeMqYAyAKpXlS6ZFbfwLuVCOqWd4iDP+toerThsVrw1Ev5ZZmN7JQscZHr4YxCnS+jDJSb1op+kGHrL5byrcuhR/RBCmDuZucWtL0eHcC4JNPn0GS8muuFsR+i5UJaT2YkNtOd7+qYlApyTWJ7EGN+4SC8/AoTiowdNB0itTMeZIemzdr0gP6OWopNr4wV0krnxbR8BrIwfeBLOdU7RKNcov1C5NQnPIP5iMNbX6uRxghgaC456GvMpxEdn+Txx2/mYWdTo0TWdVRkfYmbbxHaPwl1qlXLaVyeyRhooTefFr0nhs1d8Fy0SS0R1oF0FPj8CW2tDhHBPw0v3PKz9Nto3x+vgK4GBVAbCFVupjdruQnPntmzU0RdRhB0NzixDt93FrBKRtwS2jT/XPvQ6Z7zvE+4VFLIjegDXvZRt64ZlODPQGRIOE/jixOhiiTCma1mFrnXNdP67mFuZSWOaB2PXmlUtne/3v2W/I6s0J834ymvVGg8UtkLGaauyWKcVAP'}
FEE = 375
def vals(p):
    a = json.load(open(p))
    if isinstance(a, dict) and 'content' in a and 'values' not in a:
        a = json.loads(next(c['text'] for c in a['content'] if c.get('type') == 'text'))
    return a['values']
num = lambda s: float(str(s).replace(',', '').replace('AED', '').strip() or 0)
tl, ex, ov = vals(sys.argv[1]), vals(sys.argv[2]), vals(sys.argv[3])
rows = []
for r in tl[1:]:
    r = (r + [''] * 7)[:7]
    if not str(r[2]).strip(): continue
    paid, bal = num(r[4]), num(r[6])
    rows.append({'team_no': int(num(r[0])), 'team': r[1], 'player': r[2].strip(), 'role': r[3], 'paid': int(paid) if paid == int(paid) else paid,
                 'status': r[5], 'balance': int(bal) if bal == int(bal) else bal})
payouts, charges, budget_left = [], 0.0, None
for r in ex[1:]:
    r = (r + [''] * 10)[:10]
    if str(r[1]).strip() == 'Still to pay (budget)': budget_left = num(r[4])
    if not re.fullmatch(r'\d+', str(r[0]).strip()): continue
    paid = num(r[9])
    if paid <= 0: continue
    if str(r[1]).lower().startswith('bank charge'): charges += paid; continue
    m = re.search(r'Paid\s+(\d{1,2}\s+\w{3})', r[8]); p = re.search(r'\bto\s+(.+?)\s+[–-]', r[8])
    item = r[1] + (' – ' + r[5] + ' paid' if r[5] and r[5] != '100%' else '')
    payouts.append({'date': m.group(1) if m else '', 'payee': p.group(1) if p else '', 'item': item, 'amount': paid, 'later': num(r[7])})
find = lambda label, col: next((r[col] for r in ov if r and str(r[0]).strip().startswith(label) and len(r) > col), None)
fees = num(find('= Collected', 3)); addons = num(find('Jersey add-ons', 3))
bank_row = next((r for r in ov if len(r) > 8 and str(r[5]).startswith('Bank balance')), None)
diff_row = next((r for r in ov if len(r) > 8 and str(r[5]).startswith('Difference')), None)
bank = num(bank_row[8]) if bank_row else None
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=4)))
data = {'as_of': now.strftime('%-d %b %Y, %H:%M') + ' (Dubai)', 'synced_at': now.isoformat(timespec='seconds'), 'fee': FEE, 'rows': rows,
        'money': {'received': fees + addons, 'received_fees': fees, 'received_addons': addons, 'oneday_net': 0, 'payouts': payouts,
                  'charges': round(charges, 2), 'bank': bank, 'bank_label': bank_row[5] if bank_row else '', 'budget_left': budget_left,
                  'bank_confirmed': bool(diff_row and abs(num(diff_row[8])) < 0.005),
                  'source': 'League Google Sheet: team tabs (via TL Sync), League Expenses and Overview',
                  'refunds': [{'player': r['player'], 'team': r['team'], 'paid': r['paid'], 'refund': r['paid'] - FEE} for r in rows if r['paid'] > FEE]}}
warn = []
if abs(sum(r['paid'] for r in rows) - fees) > 0.5: warn.append('team tabs total %s vs Overview net %s' % (sum(r['paid'] for r in rows), fees))
if bank is None: warn.append('bank balance not found on Overview')
if budget_left is None: warn.append('Still to pay (budget) not found on League Expenses')
if len(rows) < 90: warn.append('only %d players found' % len(rows))
pub = serialization.load_der_public_key(base64.b64decode(PUB))
ck = os.urandom(32); iv = os.urandom(12)
ct = AESGCM(ck).encrypt(iv, json.dumps(data, ensure_ascii=False).encode(), None)
wrap = pub.encrypt(ck, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
b = lambda x: base64.b64encode(x).decode()
json.dump([{'v': 2, **LOCK, 'wrap': b(wrap), 'iv': b(iv), 'ct': b(ct), 'synced_at': data['synced_at']}], open(sys.argv[4], 'w'))
print(json.dumps({'players': len(rows), 'collected': sum(r['paid'] for r in rows), 'outstanding': sum(r['balance'] for r in rows), 'bank': bank,
                  'paid_out': sum(x['amount'] for x in payouts), 'charges': round(charges, 2), 'budget_left': budget_left, 'warnings': warn}))
