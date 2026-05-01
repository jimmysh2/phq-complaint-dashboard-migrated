"""
Compare CCTNS API field schemas - with UTF-8 output fix
"""
import urllib.request
import json
import sys
import io

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SECRET_KEY = "UserHryDashboard"
TOKEN_API = "http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ReqToken"
COMPLAINT_API = "http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ComplaintData"
ENQUIRY_API = "http://api.haryanapolice.gov.in/cmdashboard/api/HomeDashboard/ComplaintEnquiryData"

# Get token
print("=== Getting Token ===")
token_url = f"{TOKEN_API}?SecretKey={SECRET_KEY}"
req = urllib.request.Request(token_url, headers={"Accept": "application/json, text/plain, */*"})
with urllib.request.urlopen(req, timeout=15) as r:
    raw = r.read().decode('utf-8')
    token = json.loads(raw) if raw.startswith('"') else raw
    if isinstance(token, str):
        token = token.strip('"')
    print(f"Token: {token[:30]}...")

# DD/MM/YYYY format works
TF, TT = "25/04/2026", "26/04/2026"

# --- ComplaintData ---
print(f"\n{'='*60}")
print(f"=== ComplaintData API ({TF} to {TT}) ===")
print(f"{'='*60}")
url = f"{COMPLAINT_API}?TimeFrom={TF}&TimeTo={TT}"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode('utf-8'))
        records = data if isinstance(data, list) else []
        print(f"Records: {len(records)}")
        if records:
            rec = records[0]
            print(f"\nALL FIELDS ({len(rec.keys())}):")
            for key in sorted(rec.keys()):
                val = rec[key]
                # Truncate for display, ASCII safe
                val_str = repr(val)[:80] if val else repr(val)
                print(f"  {key:35s} = {val_str}")
            
            # Show 3 sample records with key data
            print(f"\n--- Sample Records ---")
            for i, rec in enumerate(records[:3]):
                print(f"\n  Record #{i+1}:")
                for key in sorted(rec.keys()):
                    val = rec[key]
                    if val:
                        val_safe = str(val).encode('ascii', errors='replace').decode('ascii')[:50]
                        print(f"    {key:35s} = {val_safe}")
except Exception as e:
    print(f"ERROR: {e}")

# --- ComplaintEnquiryData ---
print(f"\n{'='*60}")
print(f"=== ComplaintEnquiryData API ({TF} to {TT}) ===")
print(f"{'='*60}")
url = f"{ENQUIRY_API}?TimeFrom={TF}&TimeTo={TT}"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode('utf-8'))
        records = data if isinstance(data, list) else []
        print(f"Records: {len(records)}")
        if records:
            rec = records[0]
            print(f"\nALL FIELDS ({len(rec.keys())}):")
            for key in sorted(rec.keys()):
                val = rec[key]
                val_str = repr(val)[:80] if val else repr(val)
                print(f"  {key:35s} = {val_str}")
            
            print(f"\n--- Sample Records ---")
            for i, rec in enumerate(records[:3]):
                print(f"\n  Record #{i+1}:")
                for key in sorted(rec.keys()):
                    val = rec[key]
                    if val:
                        val_safe = str(val).encode('ascii', errors='replace').decode('ascii')[:50]
                        print(f"    {key:35s} = {val_safe}")
except Exception as e:
    print(f"ERROR: {e}")

print(f"\n{'='*60}")
print("=== DONE ===")
