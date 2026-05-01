import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/common/Button';
import { DataTable, Column } from '@/components/data/DataTable';
import { cctnsApi } from '@/services/api';

type Tab = 'live' | 'synced';

// Helpers for date input and API format conversion
function todayIsoStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function thirtyDaysAgoIsoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoToApiDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

// —— Types ——
export const CCTNSPage = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('live');

  // Date range state in ISO format for native browser date picker
  const [timeFrom, setTimeFrom] = useState(thirtyDaysAgoIsoStr());
  const [timeTo, setTimeTo]     = useState(todayIsoStr());

  // Captured range for fetching (only updates when user clicks Fetch)
  const [appliedRange, setAppliedRange] = useState({
    from: isoToApiDate(timeFrom),
    to: isoToApiDate(timeTo),
  });

  // —— Complaints live query (enabled only when on live tab and user clicks Fetch) ——
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const liveQuery = useQuery({
    queryKey: ['cctns-live', appliedRange.from, appliedRange.to, fetchTrigger],
    queryFn: () => cctnsApi.complaintsLive(appliedRange.from, appliedRange.to),
    enabled: fetchTrigger > 0,
    retry: 1,
  });

  // —— Synced records from DB ——
  const syncedQuery = useQuery({
    queryKey: ['cctns-synced'],
    queryFn: () => cctnsApi.list(),
    enabled: activeTab === 'synced',
  });

  // —— Status ——
  const statusQuery = useQuery({
    queryKey: ['cctns-status'],
    queryFn: () => cctnsApi.status(),
  });

  // —— Sync to DB mutation ——
  const syncMutation = useMutation({
    mutationFn: () => cctnsApi.syncComplaints(appliedRange.from, appliedRange.to),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cctns-synced'] });
    },
  });

  const isConfigured = statusQuery.data?.data?.configured;

  // —— Live table columns ——
  const liveCols: Column<any>[] = [
    {
      key: 'COMPL_REG_NUM',
      label: 'Reg. No.',
      sortable: true,
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)' }}>
          {row.COMPL_REG_NUM || '—'}
        </span>
      ),
    },
    {
      key: 'COMPL_REG_DT',
      label: 'Reg. Date',
      sortable: true,
      render: (row) => <span>{row.COMPL_REG_DT || '—'}</span>,
    },
    {
      key: 'DISTRICT',
      label: 'District',
      sortable: true,
      render: (row) => <span>{row.DISTRICT || '—'}</span>,
    },
    {
      key: 'Address_PS',
      label: 'Police Station',
      sortable: true,
      render: (row) => <span>{row.Address_PS || '—'}</span>,
    },
    {
      key: 'Status_of_Complaint',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span style={{
          padding: '2px 10px',
          borderRadius: '12px',
          fontSize: '12px',
          background: row.Status_of_Complaint?.toLowerCase().includes('disposed') ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
          color: row.Status_of_Complaint?.toLowerCase().includes('disposed') ? '#22c55e' : '#94a3b8',
        }}>
          {row.Status_of_Complaint || 'Pending'}
        </span>
      ),
    },
  ];

  // —— Synced table columns ——
  const syncedCols: Column<any>[] = [
    { key: 'complRegNum', label: 'Reg. No.', sortable: true },
    {
      key: 'complRegDt',
      label: 'Reg. Date',
      sortable: true,
      render: (row) => {
        if (!row.complRegDt) return <span>—</span>;
        const d = new Date(row.complRegDt);
        return <span>{isNaN(d.getTime()) ? row.complRegDt : d.toLocaleDateString('en-IN')}</span>;
      },
    },
    { key: 'district', label: 'District', sortable: true },
    { key: 'addressPs', label: 'PS', sortable: true },
    { key: 'statusOfComplaint', label: 'Status', sortable: true },
    {
      key: 'disposalDate',
      label: 'Disposal Date',
      sortable: true,
      render: (row) => {
        if (!row.disposalDate) return <span>—</span>;
        const d = new Date(row.disposalDate);
        return <span>{isNaN(d.getTime()) ? row.disposalDate : d.toLocaleDateString('en-IN')}</span>;
      },
    },
  ];

  const liveData = liveQuery.data?.data?.records || [];
  const syncedData = syncedQuery.data?.data || [];

  return (
    <Layout>
      <div className="page-content">

        {/* —— Header —— */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>CCTNS Integration</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Unified Complaint Data from Haryana Police CCTNS API
          </p>
        </div>

        {/* —— Date Range + Controls —— */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, flexWrap: 'wrap', gap: 12,
          background: 'var(--card-bg)', borderRadius: 10, padding: '12px 16px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label className="form-label" style={{ marginBottom: 0, fontSize: 13, whiteSpace: 'nowrap' }}>From:</label>
              <input
                type="date"
                value={timeFrom}
                onChange={e => setTimeFrom(e.target.value)}
                className="form-input"
                style={{ width: 160 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label className="form-label" style={{ marginBottom: 0, fontSize: 13, whiteSpace: 'nowrap' }}>To:</label>
              <input
                type="date"
                value={timeTo}
                onChange={e => setTimeTo(e.target.value)}
                className="form-input"
                style={{ width: 160 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              disabled={!isConfigured || liveQuery.isFetching}
              onClick={() => {
                const from = isoToApiDate(timeFrom);
                const to = isoToApiDate(timeTo);
                setAppliedRange({ from, to });
                setActiveTab('live');
                setFetchTrigger(t => t + 1);
              }}
            >
              {liveQuery.isFetching ? 'Fetching...' : 'Fetch Live Data'}
            </Button>
            <Button
              variant="secondary"
              disabled={!isConfigured || syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? 'Saving...' : 'Sync to DB'}
            </Button>
          </div>
        </div>

        {/* —— Sync feedback —— */}
        {syncMutation.data && (
          <div
            className={syncMutation.data.success ? 'success-message' : 'error-message'}
            style={{ marginBottom: 12 }}
          >
            <strong>{syncMutation.data.message || syncMutation.data.error}</strong>
            {syncMutation.data.data && (
              <span style={{ marginLeft: 8 }}>
                Fetched: {syncMutation.data.data.fetched} &nbsp;|&nbsp;
                Unique: {syncMutation.data.data.uniqueComplaints} &nbsp;|&nbsp;
                Saved: {syncMutation.data.data.created + syncMutation.data.data.updated}
              </span>
            )}
          </div>
        )}

        {/* —— Tabs —— */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['live', 'synced'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '7px 20px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontWeight: activeTab === tab ? 700 : 400,
                fontSize: 13,
                background: activeTab === tab ? 'var(--accent)' : 'var(--card-bg)',
                color: activeTab === tab ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}
            >
              {tab === 'live' ? 'Live CCTNS Data' : 'Synced Records (DB)'}
              {tab === 'live' && liveData.length > 0 && (
                <span style={{
                  marginLeft: 8, background: 'rgba(255,255,255,0.25)',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11,
                }}>
                  {liveData.length}
                </span>
              )}
              {tab === 'synced' && syncedData.length > 0 && (
                <span style={{
                  marginLeft: 8, background: 'rgba(255,255,255,0.25)',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11,
                }}>
                  {syncedData.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* —— Not configured —— */}
        {!statusQuery.isLoading && !isConfigured && (
          <div className="empty-state">
            <p>CCTNS API not configured. Contact administrator.</p>
          </div>
        )}

        {/* —— Live Data Tab —— */}
        {isConfigured && activeTab === 'live' && (
          <>
            {fetchTrigger === 0 ? (
              <div className="empty-state">
                <p style={{ fontSize: 15, marginBottom: 8 }}>Set a date range and click <strong>Fetch Live Data</strong></p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Data is fetched directly from the PHQ Dashboard Complaint API.
                </p>
              </div>
            ) : liveQuery.isFetching ? (
              <div className="loading-spinner">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : liveQuery.isError ? (
              <div className="error-message">
                Failed to fetch: {String((liveQuery.error as Error)?.message || 'Unknown error')}
              </div>
            ) : liveData.length === 0 ? (
              <div className="empty-state">
                <p>No records found for this date range.</p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                  Showing <strong>{liveData.length}</strong> live records from CCTNS &nbsp;•&nbsp;
                  {appliedRange.from} to {appliedRange.to}
                </div>
                <DataTable
                  title="CCTNS Live Records"
                  data={liveData}
                  columns={liveCols}
                  maxHeight="calc(100vh - 320px)"
                />
              </>
            )}
          </>
        )}

        {/* —— Synced Records Tab —— */}
        {isConfigured && activeTab === 'synced' && (
          <>
            {syncedQuery.isLoading ? (
              <div className="loading-spinner">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : syncedData.length === 0 ? (
              <div className="empty-state">
                <p>No records in local DB. Use <strong>Sync to DB</strong> to save enquiry records.</p>
              </div>
            ) : (
              <DataTable
                title="CCTNS Synced Records (Local DB)"
                data={syncedData}
                columns={syncedCols}
                maxHeight="calc(100vh - 320px)"
              />
            )}
          </>
        )}

      </div>
    </Layout>
  );
};

export default CCTNSPage;
