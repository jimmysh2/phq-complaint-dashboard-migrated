import urllib.request, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = 'http://api.haryanapolice.gov.in/cmDashboard/api/HomeDashboard/ReqToken?SecretKey=UserHryDashboard'
req = urllib.request.Request(url)
with urllib.request.urlopen(req, context=ctx) as r:
    token = r.read().decode('utf-8').strip('\"').strip()

url2 = 'http://api.haryanapolice.gov.in/homedashboard/api/HomeDashboard/ComplaintData?TimeFrom=04/01/2026&TimeTo=04/01/2026'
req2 = urllib.request.Request(url2, headers={'Authorization': 'Bearer ' + token})
try:
    with urllib.request.urlopen(req2, context=ctx) as r:
        print(f'Status: {r.status}')
        print(r.read().decode('utf-8')[:200])
except Exception as e:
    print(f'Error: {e}')
