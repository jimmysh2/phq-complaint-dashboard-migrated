import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = 'http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ReqToken?SecretKey=UserHryDashboard'
req = urllib.request.Request(url)
with urllib.request.urlopen(req, context=ctx) as r:
    token = r.read().decode('utf-8').strip('\"').strip()

url2 = 'http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ComplaintData?TimeFrom=04/01/2026&TimeTo=04/01/2026'
req2 = urllib.request.Request(url2, headers={'Authorization': 'Bearer ' + token})
with urllib.request.urlopen(req2, context=ctx) as r:
    data = json.loads(r.read().decode('utf-8'))
    all_keys = set()
    for row in data:
        all_keys.update(row.keys())
    print('All unique keys across all records:')
    print(', '.join(all_keys))
