const API_URL = 'http://localhost:3001/api';
const USERNAME = 'admin';
const PASSWORD = 'admin123';

async function testFetch() {
  try {
    console.log('Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD })
    });
    const loginData = await loginRes.json();
    if (!loginData.success) throw new Error(loginData.message);
    const token = loginData.data.token;
    console.log('Token obtained.');

    const timeFrom = '01/01/2024';
    const timeTo = '01/02/2024';
    
    console.log(`Fetching live complaints from ${timeFrom} to ${timeTo}...`);
    const res = await fetch(`${API_URL}/cctns/complaints-live?timeFrom=${encodeURIComponent(timeFrom)}&timeTo=${encodeURIComponent(timeTo)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    console.log('Success!');
    console.log('Total records:', data.data.total);
    if (data.data.records.length > 0) {
      console.log('First record keys:', Object.keys(data.data.records[0]));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testFetch();
