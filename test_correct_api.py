"""
Test the correct CCTNS API endpoint
"""
import urllib.request
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SECRET_KEY = "UserHryDashboard"
TOKEN_API = "http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ReqToken"
COMPLAINT_API = "http://api.haryanapolice.gov.in/phqdashboard/api/PHQDashboard/ComplaintData"

# Get token
print("=== Getting Token ===")
token_url = f"{TOKEN_API}?SecretKey={SECRET_KEY}"
req = urllib.request.Request(token_url, headers={"Accept": "application/json, text/plain, */*"})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        raw = r.read().decode('utf-8')
        token = json.loads(raw) if raw.startswith('"') else raw
        if isinstance(token, str):
            token = token.strip('"')
        print(f"Token: {token[:30]}...")
except Exception as e:
    print(f"TOKEN ERROR: {e}")
    sys.exit(1)

# Test correct ComplaintData endpoint
TF, TT = "25/04/2026", "26/04/2026"
print(f"\n{'='*60}")
print(f"=== PHQDashboard ComplaintData ({TF} to {TT}) ===")
print(f"{'='*60}")
url = f"{COMPLAINT_API}?TimeFrom={TF}&TimeTo={TT}"
print(f"URL: {url}")
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        raw_text = r.read().decode('utf-8')
        print(f"Response: {len(raw_text)} chars")
        data = json.loads(raw_text)
        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            print(f"Response is dict with keys: {list(data.keys())}")
            records = data.get('data') or data.get('complaints') or []
            if not records and isinstance(data, dict):
                records = [data]  # single record?
        else:
            records = []
        
        print(f"Records: {len(records)}")
        if records:
            rec = records[0]
            print(f"\nALL FIELDS ({len(rec.keys())}):")
            for key in sorted(rec.keys()):
                val = rec[key]
                val_str = repr(val)[:80] if val else repr(val)
                print(f"  {key:40s} = {val_str}")
            
            # Show 2 more sample records
            for i in range(1, min(3, len(records))):
                print(f"\n--- Record #{i+1} (non-empty fields) ---")
                for key in sorted(records[i].keys()):
                    val = records[i][key]
                    if val:
                        val_safe = str(val).encode('ascii', errors='replace').decode('ascii')[:60]
                        print(f"  {key:40s} = {val_safe}")
except urllib.error.HTTPError as e:
    body = ""
    try:
        body = e.read().decode('utf-8')[:500]
    except:
        pass
    print(f"HTTP {e.code}: {body}")
except Exception as e:
    print(f"ERROR: {e}")

print(f"\n{'='*60}")
print("=== DONE ===")
