process.env.VERCEL = '1';

const run = async () => {
  const { buildApp, app } = await import('../src/index.js');
  await buildApp();

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: { username: 'admin', password: 'admin123' },
  });
  const loginPayload = loginRes.json();
  const token = loginPayload?.data?.token;
  if (!token) throw new Error(`Login failed: ${loginRes.statusCode} ${loginRes.body}`);

  const headers = { authorization: `Bearer ${token}` };

  const districtsSync = await app.inject({ method: 'GET', url: '/api/gov/districts?refresh=1', headers });
  console.log('gov/districts refresh', districtsSync.statusCode);

  const districtsPayload = districtsSync.json();
  const districts = Array.isArray(districtsPayload?.data) ? districtsPayload.data : [];

  let stationSyncFailures = 0;
  for (const district of districts) {
    const districtId = String(district.id);
    const stationRes = await app.inject({
      method: 'GET',
      url: `/api/gov/police-stations?districtId=${encodeURIComponent(districtId)}&refresh=1`,
      headers,
    });
    if (stationRes.statusCode !== 200) {
      stationSyncFailures++;
    }
  }
  console.log('gov/police-stations refresh failures', stationSyncFailures);

  const officesSync = await app.inject({ method: 'GET', url: '/api/gov/offices?refresh=1', headers });
  console.log('gov/offices refresh', officesSync.statusCode);

  const syncComplaints = await app.inject({
    method: 'POST',
    url: '/api/cctns/sync-complaints',
    headers: { ...headers, 'content-type': 'application/json' },
    payload: { timeFrom: '02/04/2026', timeTo: '01/05/2026' },
  });
  console.log('cctns/sync-complaints', syncComplaints.statusCode, syncComplaints.body);

  const remap = await app.inject({ method: 'POST', url: '/api/cctns/remap-masters', headers });
  console.log('cctns/remap-masters', remap.statusCode, remap.body);

  const summary = await app.inject({ method: 'GET', url: '/api/dashboard/summary', headers });
  console.log('dashboard/summary', summary.statusCode, summary.body);

  const districtWise = await app.inject({ method: 'GET', url: '/api/dashboard/district-wise', headers });
  console.log('dashboard/district-wise', districtWise.statusCode, districtWise.body.slice(0, 300));

  const categoryWise = await app.inject({ method: 'GET', url: '/api/dashboard/category-wise', headers });
  console.log('dashboard/category-wise', categoryWise.statusCode, categoryWise.body.slice(0, 300));

  const masterDistricts = await app.inject({ method: 'GET', url: '/api/districts', headers });
  console.log('districts', masterDistricts.statusCode, masterDistricts.body.slice(0, 300));

  await app.close();
};

run().catch(async (error) => {
  console.error('bootstrap script failed', error);
  process.exit(1);
});
