import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/common/Button';
import { DataTable, Column } from '@/components/data/DataTable';
import { cctnsApi } from '@/services/api';

type Tab = 'live' | 'synced' | 'history';

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
function formatDateTime(d: string | Date | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CCTNSPage = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Read ?statusGroup and global filters from URL (set by dashboard card clicks)
  const urlStatusGroup    = searchParams.get('statusGroup')      || '';
  const urlDistrictIds    = searchParams.get('districtIds')      || '';
  const urlPsIds          = searchParams.get('policeStationIds') || '';
  const urlOfficeIds      = searchParams.get('officeIds')        || '';
  const urlClassOfInc     = searchParams.get('classOfIncident')  || '';
  const urlFromDate       = searchParams.get('fromDate')         || '';
  const urlToDate         = searchParams.get('toDate')           || '';

  // Derived: any global filter is active
  const hasGlobalFilters = !!(urlDistrictIds || urlPsIds || urlOfficeIds || urlClassOfInc || urlFromDate || urlToDate);

  // Map special values: 'all' -> no status filter, 'disposed_missing_date' -> handled separately
  const resolvedInitialStatus = urlStatusGroup === 'all' ? '' :
    urlStatusGroup === 'disposed_missing_date' ? 'disposed' : urlStatusGroup;

  const [activeTab, setActiveTab] = useState<Tab>(() => urlStatusGroup ? 'synced' : 'live');

  // Date range state in ISO format for native browser date picker
  const [timeFrom, setTimeFrom] = useState(thirtyDaysAgoIsoStr());
  const [timeTo, setTimeTo] = useState(todayIsoStr());

  // Sync job state (persist in localStorage so navigation doesn't kill it)
  const [activeJobId, setActiveJobId] = useState<string | null>(() => localStorage.getItem('cctnsActiveJobId'));
  const [jobStatus, setJobStatus] = useState<string>(() => localStorage.getItem('cctnsActiveJobId') ? 'pending' : '');
  
  useEffect(() => {
    if (activeJobId) {
      localStorage.setItem('cctnsActiveJobId', activeJobId);
    } else {
      localStorage.removeItem('cctnsActiveJobId');
    }
  }, [activeJobId]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synced records filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterStatus, setFilterStatus] = useState(resolvedInitialStatus);
  const [filterMissingDateOnly, setFilterMissingDateOnly] = useState(urlStatusGroup === 'disposed_missing_date');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Status
  const statusQuery = useQuery({
    queryKey: ['cctns-status'],
    queryFn: () => cctnsApi.status(),
  });

  const isConfigured = statusQuery.data?.data?.configured;

  // —— Fetch & Sync mutation ——
  const fetchMutation = useMutation({
    mutationFn: (range: { from: string; to: string }) =>
      cctnsApi.fetchAndSync(range.from, range.to),
    onSuccess: (data) => {
      if (data?.data?.jobId) {
        setActiveJobId(data.data.jobId);
        setJobStatus('pending');
      }
    },
  });

  // —— Poll job status ——
  const jobQuery = useQuery({
    queryKey: ['cctns-fetch-job', activeJobId],
    queryFn: () => {
      if (!activeJobId) throw new Error('No active job');
      return cctnsApi.fetchStatus(activeJobId);
    },
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status === 'success' || status === 'error') return false;
      return 2000; // Poll every 2 seconds
    },
    retry: 1, // Don't retry too many times if it's a 404
  });

  useEffect(() => {
    if (jobQuery.data?.data) {
      const data = jobQuery.data.data;
      setJobStatus(data.status);
      if (data.status === 'success' || data.status === 'error') {
        // Invalidate synced records to refresh
        queryClient.invalidateQueries({ queryKey: ['cctns-synced'] });
        // Clear active job after a delay so user sees final state
        if (pollRef.current) clearTimeout(pollRef.current);
        pollRef.current = setTimeout(() => {
          setActiveJobId(null);
          setJobStatus('');
        }, 5000);
      }
    } else if (jobQuery.isError) {
      const error: any = jobQuery.error;
      // If the backend restarted and the job is gone, clear it
      if (error?.response?.status === 404) {
        setActiveJobId(null);
        setJobStatus('');
      } else {
        setJobStatus('error');
      }
    }
  }, [jobQuery.data, jobQuery.isError, jobQuery.error, queryClient]);

  // —— Sync filter state when URL ?statusGroup or ?search param changes ——
  // This handles the case where the component is reused (not remounted) when
  // navigating from dashboard card clicks multiple times (same route, different query string).
  useEffect(() => {
    const sg = searchParams.get('statusGroup');
    const searchVal = searchParams.get('search');
    
    if (sg || searchVal) {
      setActiveTab('synced');
      setPage(1);
      
      if (sg) {
        const resolved = sg === 'all' ? '' : sg === 'disposed_missing_date' ? 'disposed' : sg;
        setFilterStatus(resolved);
        setFilterMissingDateOnly(sg === 'disposed_missing_date');
        setFilterDistrict('');
        setFilterDateFrom('');
        setFilterDateTo('');
      }
      
      if (searchVal) {
        setSearchQuery(searchVal);
      } else if (sg) {
        setSearchQuery('');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // —— Synced records from DB (paginated gateway) ——
  const syncedQuery = useQuery({
    queryKey: [
      'cctns-synced',
      activeTab,
      page,
      limit,
      searchQuery,
      filterDistrict,
      filterStatus,
      filterMissingDateOnly,
      filterDateFrom,
      filterDateTo,
      sortBy,
      sortOrder,
      // Global filters come from URL directly — include in key so query re-runs on navigation
      urlDistrictIds, urlPsIds, urlOfficeIds, urlClassOfInc, urlFromDate, urlToDate,
    ],
    queryFn: () =>
      cctnsApi.listPaginated({
        page,
        limit,
        search: searchQuery || undefined,
        district: filterDistrict || undefined,
        statusGroup: filterStatus || undefined,
        isDisposedMissingDate: filterMissingDateOnly ? 'true' : undefined,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
        sortBy,
        sortOrder,
        // Forward global dashboard filters unchanged — backend applies them via buildPrismaWhereClause
        districtIds:      urlDistrictIds || undefined,
        policeStationIds: urlPsIds       || undefined,
        officeIds:        urlOfficeIds   || undefined,
        classOfIncident:  urlClassOfInc  || undefined,
        fromDate:         urlFromDate    || undefined,
        toDate:           urlToDate      || undefined,
      }),
    enabled: activeTab === 'synced',
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // —— Live tab: recent synced records with auto-refresh ——
  const liveQuery = useQuery({
    queryKey: ['cctns-live-recent'],
    queryFn: () =>
      cctnsApi.listPaginated({
        page: 1,
        limit: 50,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    enabled: activeTab === 'live',
    refetchInterval: false,  // No auto-refresh — background sync runs every 4h
    staleTime: 5 * 60 * 1000, // Cache for 5 min
  });

  // —— Sync run history ——
  const historyQuery = useQuery({
    queryKey: ['cctns-history'],
    queryFn: () => cctnsApi.syncRuns(1, 50),
    enabled: activeTab === 'history',
  });

  // Handle response structure: response.data = { success, data: { data: [...], pagination: {...} }, message }
  const syncedData = syncedQuery.data?.data?.data || [];
  const syncedPagination = syncedQuery.data?.data?.pagination;
  const liveData = liveQuery.data?.data?.data || [];
  const historyData = historyQuery.data?.data?.data || [];

  // Debug logging for data loading issues
  useEffect(() => {
    console.log('🔍 CCTNS Debug:', {
      activeTab,
      syncedQueryState: {
        isLoading: syncedQuery.isLoading,
        isError: syncedQuery.isError,
        error: syncedQuery.error,
        rawData: syncedQuery.data,
        syncedDataLength: syncedData.length,
        syncedPagination,
      },
      liveQueryState: {
        isLoading: liveQuery.isLoading,
        isError: liveQuery.isError,
        error: liveQuery.error,
        rawData: liveQuery.data,
        liveDataLength: liveData.length,
      },
    });
  }, [activeTab, syncedQuery.isLoading, syncedQuery.isError, syncedQuery.data, liveQuery.isLoading, liveQuery.isError, liveQuery.data]);

  const isFetching = fetchMutation.isPending || !!activeJobId;

  // —— Export: fetch all records (no pagination limit) for Excel/PDF export ——
  const fetchAllCctnsForExport = useCallback(async () => {
    const allData = await cctnsApi.listPaginated({
      page: 1,
      limit: syncedPagination?.total || 9999,
      search: searchQuery || undefined,
      district: filterDistrict || undefined,
      statusGroup: filterStatus || undefined,
      isDisposedMissingDate: filterMissingDateOnly ? 'true' : undefined,
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo || undefined,
      sortBy,
      sortOrder,
    });
    return (allData.data?.data || []) as Record<string, unknown>[];
  }, [searchQuery, filterDistrict, filterStatus, filterMissingDateOnly, filterDateFrom, filterDateTo, sortBy, sortOrder, syncedPagination?.total]);

  const cctnsActiveFilters = {
    ...(searchQuery ? { search: searchQuery } : {}),
    ...(filterDistrict ? { district: filterDistrict } : {}),
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(filterDateFrom ? { from: filterDateFrom } : {}),
    ...(filterDateTo ? { to: filterDateTo } : {}),
    ...(filterMissingDateOnly ? { missingDate: 'yes' } : {}),
  };


  // —— Table columns — ALL complaint fields ——
  const fmtDate = (val: any) => {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-IN');
  };

  const recordCols: Column<any>[] = [
    // Identity
    { key: 'id', label: 'DB ID', sortable: true },
    {
      key: 'complRegNum',
      label: 'Reg. No.',
      sortable: true,
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)' }}>
          {row.complRegNum || '—'}
        </span>
      ),
    },
    { key: 'complSrno', label: 'Sr. No.', sortable: false },
    {
      key: 'complRegDt',
      label: 'Reg. Date',
      sortable: true,
      render: (row) => <span>{fmtDate(row.complRegDt)}</span>,
    },

    // Complainant
    { key: 'firstName', label: 'First Name', sortable: true },
    { key: 'lastName', label: 'Last Name', sortable: true },
    { key: 'gender', label: 'Gender', sortable: false },
    { key: 'age', label: 'Age', sortable: false },
    { key: 'mobile', label: 'Mobile', sortable: false },
    { key: 'email', label: 'Email', sortable: false },
    { key: 'complainantType', label: 'Complainant Type', sortable: false },

    // Address
    { key: 'addressLine1', label: 'Address Line 1', sortable: false },
    { key: 'addressLine2', label: 'Address Line 2', sortable: false },
    { key: 'addressLine3', label: 'Address Line 3', sortable: false },
    { key: 'village', label: 'Village', sortable: false },
    { key: 'tehsil', label: 'Tehsil', sortable: false },
    { key: 'addressDistrict', label: 'Address District', sortable: true },
    { key: 'addressPs', label: 'Police Station', sortable: true },

    // Location / Registration
    { key: 'districtName', label: 'District (Master)', sortable: true },
    {
      key: 'districtMasterId',
      label: 'District ID',
      sortable: false,
      render: (row) => <span>{row.districtMasterId != null ? String(row.districtMasterId) : '—'}</span>,
    },
    {
      key: 'policeStationMasterId',
      label: 'PS ID',
      sortable: false,
      render: (row) => <span>{row.policeStationMasterId != null ? String(row.policeStationMasterId) : '—'}</span>,
    },
    {
      key: 'officeMasterId',
      label: 'Office ID',
      sortable: false,
      render: (row) => <span>{row.officeMasterId != null ? String(row.officeMasterId) : '—'}</span>,
    },
    { key: 'submitPsCd', label: 'Submit PS Code', sortable: false },
    { key: 'submitOfficeCd', label: 'Submit Office Code', sortable: false },
    { key: 'receptionMode', label: 'Reception Mode', sortable: false },
    { key: 'branch', label: 'Branch', sortable: false },

    // Complaint Details
    {
      key: 'complDesc',
      label: 'Description',
      sortable: false,
      render: (row) => (
        <div style={{ maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
          {row.complDesc || '—'}
        </div>
      ),
    },
    { key: 'complaintSource', label: 'Complaint Source', sortable: false },
    { key: 'typeOfComplaint', label: 'Type of Complaint', sortable: false },
    { key: 'complaintPurpose', label: 'Complaint Purpose', sortable: false },
    { key: 'classOfIncident', label: 'Class of Incident', sortable: false },
    { key: 'incidentType', label: 'Incident Type', sortable: false },
    { key: 'incidentPlc', label: 'Incident Place', sortable: false },
    {
      key: 'incidentFromDt',
      label: 'Incident From',
      sortable: false,
      render: (row) => <span>{fmtDate(row.incidentFromDt)}</span>,
    },
    {
      key: 'incidentToDt',
      label: 'Incident To',
      sortable: false,
      render: (row) => <span>{fmtDate(row.incidentToDt)}</span>,
    },
    { key: 'crimeCategory', label: 'Crime Category', sortable: false },
    { key: 'respondentCategories', label: 'Respondent Categories', sortable: false },

    // Status
    {
      key: 'statusOfComplaint',
      label: 'Status (Raw)',
      sortable: true,
      render: (row) => (
        <span
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            background:
              row.statusGroup === 'disposed'
                ? 'rgba(34,197,94,0.15)'
                : row.statusGroup === 'pending'
                ? 'rgba(239,68,68,0.15)'
                : 'rgba(234,179,8,0.15)',
            color:
              row.statusGroup === 'disposed'
                ? '#22c55e'
                : row.statusGroup === 'pending'
                ? '#ef4444'
                : '#eab308',
          }}
        >
          {row.statusOfComplaint || '—'}
        </span>
      ),
    },
    { key: 'statusRaw', label: 'Status (API Raw)', sortable: false },
    {
      key: 'statusGroup',
      label: 'Status Group',
      sortable: true,
      render: (row) => (
        <span style={{
          padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          background: row.statusGroup === 'disposed' ? 'rgba(34,197,94,0.2)' : row.statusGroup === 'pending' ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)',
          color: row.statusGroup === 'disposed' ? '#22c55e' : row.statusGroup === 'pending' ? '#ef4444' : '#eab308',
        }}>{row.statusGroup}</span>
      ),
    },
    {
      key: 'disposalDate',
      label: 'Disposal Date',
      sortable: true,
      render: (row) => <span>{fmtDate(row.disposalDate)}</span>,
    },
    {
      key: 'isDisposedMissingDate',
      label: 'Missing Disposal Date',
      sortable: false,
      render: (row) => (
        <span style={{ color: row.isDisposedMissingDate ? '#f87171' : 'var(--text-muted)' }}>
          {row.isDisposedMissingDate ? 'Yes' : 'No'}
        </span>
      ),
    },

    // Transfer / Action
    { key: 'transferDistrictCd', label: 'Transfer District Code', sortable: false },
    { key: 'transferOfficeCd', label: 'Transfer Office Code', sortable: false },
    { key: 'transferPsCd', label: 'Transfer PS Code', sortable: false },
    { key: 'firNumber', label: 'FIR Number', sortable: false },
    { key: 'actionTaken', label: 'Action Taken', sortable: false },
    { key: 'ioDetails', label: 'IO Details', sortable: false },

    // Timestamps
    {
      key: 'createdAt',
      label: 'Created At',
      sortable: true,
      render: (row) => <span>{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'updatedAt',
      label: 'Last Synced',
      sortable: true,
      render: (row) => <span>{formatDateTime(row.updatedAt)}</span>,
    },
  ];

  const historyCols: Column<any>[] = [
    {
      key: 'startedAt',
      label: 'Started',
      sortable: true,
      render: (row) => <span>{formatDateTime(row.startedAt)}</span>,
    },
    { key: 'kind', label: 'Type', sortable: true },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            background:
              row.status === 'success'
                ? 'rgba(34,197,94,0.15)'
                : row.status === 'partial'
                ? 'rgba(234,179,8,0.15)'
                : 'rgba(239,68,68,0.15)',
            color:
              row.status === 'success'
                ? '#22c55e'
                : row.status === 'partial'
                ? '#eab308'
                : '#ef4444',
          }}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: 'fetchedCount',
      label: 'Fetched',
      sortable: true,
      align: 'right',
    },
    {
      key: 'upsertedCount',
      label: 'Upserted',
      sortable: true,
      align: 'right',
    },
    {
      key: 'errorCount',
      label: 'Errors',
      sortable: true,
      align: 'right',
    },
    {
      key: 'endedAt',
      label: 'Completed',
      sortable: true,
      render: (row) => <span>{formatDateTime(row.endedAt)}</span>,
    },
    {
      key: 'message',
      label: 'Details',
      sortable: false,
      render: (row) => (
        <div style={{ maxHeight: '100px', overflowY: 'auto' }}>
          {row.message || '—'}
        </div>
      ),
    },
  ];

  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleFetch = () => {
    const from = isoToApiDate(timeFrom);
    const to = isoToApiDate(timeTo);

    // Validate date format
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      setFetchError('Invalid date format. Please select valid dates.');
      return;
    }

    // Validate date range
    const fromDate = new Date(from.split('/').reverse().join('-'));
    const toDate = new Date(to.split('/').reverse().join('-'));
    if (fromDate > toDate) {
      setFetchError('From date cannot be after To date.');
      return;
    }

    setFetchError(null);
    setActiveTab('live');
    fetchMutation.mutate({ from, to });
  };

  // Handle mutation errors
  useEffect(() => {
    if (fetchMutation.isError) {
      const error = fetchMutation.error as any;
      setFetchError(error?.response?.data?.message || error?.message || 'Failed to start sync job');
    }
  }, [fetchMutation.isError, fetchMutation.error]);

  const resetFilters = () => {
    setSearchQuery('');
    setFilterDistrict('');
    setFilterStatus('');
    setFilterMissingDateOnly(false);
    setFilterDateFrom('');
    setFilterDateTo('');
    setSortBy('id');
    setSortOrder('desc');
    setPage(1);
  };

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

        {/* —— Tabs at the top —— */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {([
            { key: 'live' as Tab, label: 'Latest Records' },
            { key: 'synced' as Tab, label: 'Database Gateway' },
            { key: 'history' as Tab, label: 'Sync History' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '7px 20px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontWeight: activeTab === tab.key ? 700 : 400,
                fontSize: 13,
                background: activeTab === tab.key ? 'var(--accent)' : 'var(--card-bg)',
                color: activeTab === tab.key ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
              {tab.key === 'live' && liveData.length > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: 'rgba(255,255,255,0.25)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                  }}
                >
                  {liveData.length}
                </span>
              )}
              {tab.key === 'synced' && syncedPagination?.total > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: 'rgba(255,255,255,0.25)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                  }}
                >
                  {syncedPagination.total}
                </span>
              )}
              {tab.key === 'history' && historyData.length > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: 'rgba(255,255,255,0.25)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                  }}
                >
                  {historyData.length}
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

        {/* —— Global Job Status / Progress Bar —— */}
        {activeJobId && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 8,
              background:
                jobStatus === 'success'
                  ? 'rgba(34,197,94,0.1)'
                  : jobStatus === 'error'
                  ? 'rgba(239,68,68,0.1)'
                  : 'rgba(59,130,246,0.1)',
              border: `1px solid ${
                jobStatus === 'success'
                  ? 'rgba(34,197,94,0.3)'
                  : jobStatus === 'error'
                  ? 'rgba(239,68,68,0.3)'
                  : 'rgba(59,130,246,0.3)'
              }`,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>
                {(!jobStatus || jobStatus === 'pending') && 'Starting sync job...'}
                {jobStatus === 'running' &&
                  `Syncing: ${jobQuery.data?.data?.progress || 'Processing...'}`}
                {jobStatus === 'success' && 'Sync completed successfully'}
                {jobStatus === 'error' && `Sync failed: ${jobQuery.data?.data?.error || (jobQuery.error as any)?.message || 'Unknown error'}`}
              </strong>
              {jobQuery.data?.data?.result && (
                <span style={{ color: 'var(--text-muted)' }}>
                  Fetched: {jobQuery.data.data.result.fetched} | Unique:{' '}
                  {jobQuery.data.data.result.uniqueComplaints} | Saved:{' '}
                  {jobQuery.data.data.result.created + jobQuery.data.data.result.updated} | Errors:{' '}
                  {jobQuery.data.data.result.errors}
                </span>
              )}
            </div>
            
            {/* Progress Bar */}
            {(!jobStatus || jobStatus === 'pending' || jobStatus === 'running') && (
              <div style={{ width: '100%', background: 'rgba(0,0,0,0.1)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    background: '#3b82f6', 
                    width: `${jobQuery.data?.data?.progressPercentage || (jobStatus === 'running' ? 5 : 0)}%`,
                    transition: 'width 0.3s ease-in-out'
                  }} 
                />
              </div>
            )}
            {jobStatus === 'success' && (
              <div style={{ width: '100%', background: 'rgba(0,0,0,0.1)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#22c55e', width: '100%' }} />
              </div>
            )}
          </div>
        )}

        {/* —— Live Tab: Date Range + Fetch Button + Latest Records —— */}
        {isConfigured && activeTab === 'live' && (
          <>
            {/* Date Range + Controls - ONLY on Live tab */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                flexWrap: 'wrap',
                gap: 12,
                background: 'var(--card-bg)',
                borderRadius: 10,
                padding: '12px 16px',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0, fontSize: 13, whiteSpace: 'nowrap' }}>
                    From:
                  </label>
                  <input
                    type="date"
                    value={timeFrom}
                    onChange={(e) => setTimeFrom(e.target.value)}
                    className="form-input"
                    style={{ width: 160 }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0, fontSize: 13, whiteSpace: 'nowrap' }}>
                    To:
                  </label>
                  <input
                    type="date"
                    value={timeTo}
                    onChange={(e) => setTimeTo(e.target.value)}
                    className="form-input"
                    style={{ width: 160 }}
                  />
                </div>
              </div>

              <Button variant="primary" disabled={!isConfigured || isFetching} onClick={handleFetch}>
                {isFetching ? 'Syncing...' : 'Fetch & Sync to DB'}
              </Button>
            </div>

            {/* —— Error feedback —— */}
            {fetchError && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  fontSize: 13,
                  color: '#ef4444',
                }}
              >
                <strong>Error:</strong> {fetchError}
                <button
                  onClick={() => setFetchError(null)}
                  style={{
                    marginLeft: 10,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#ef4444',
                    textDecoration: 'underline',
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Live Records Table */}
            {liveQuery.isLoading ? (
              <div className="loading-spinner">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : liveQuery.isError ? (
              <div className="error-message">
                Failed to load: {String((liveQuery.error as Error)?.message || 'Unknown error')}
              </div>
            ) : liveData.length === 0 ? (
              <div className="empty-state">
                <p style={{ fontSize: 15, marginBottom: 8 }}>
                  No records yet. Click <strong>Fetch & Sync to DB</strong> to pull data from CCTNS.
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  This tab shows the latest synced records. Background sync runs every 4 hours.
                </p>
              </div>
            ) : (
              <>
                <div
                  style={{
                    marginBottom: 10,
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <span>
                    Showing <strong>{liveData.length}</strong> most recently synced records
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Sync interval: <strong>4h</strong> | Last updated:{' '}
                    <strong>
                      {liveData.length > 0
                        ? new Date(liveData[0].updatedAt).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                          })
                        : new Date().toLocaleTimeString('en-IN')}
                    </strong>
                  </span>
                </div>
                <DataTable title="Latest CCTNS Records" data={liveData} columns={recordCols} maxHeight="calc(100vh - 320px)" />
              </>
            )}
          </>
        )}

        {/* —— Synced Records Tab: Full DB Gateway —— */}
        {isConfigured && activeTab === 'synced' && (
          <>
            {/* Active filter banner when coming from dashboard */}
            {urlStatusGroup && (
              <div style={{
                marginBottom: 10,
                padding: '8px 14px',
                borderRadius: 8,
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.3)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>
                    <strong>📊 Dashboard Filter Active:</strong>{' '}
                    {urlStatusGroup === 'all'                   && 'Showing all complaints'}
                    {urlStatusGroup === 'pending'               && 'Showing pending complaints only'}
                    {urlStatusGroup === 'disposed'              && 'Showing disposed complaints only'}
                    {urlStatusGroup === 'unknown'               && 'Showing complaints with unknown/missing status'}
                    {urlStatusGroup === 'disposed_missing_date' && 'Showing disposed complaints with no disposal date'}
                  </span>
                  {hasGlobalFilters && (
                    <span style={{ fontSize: 12, opacity: 0.8 }}>
                      Global filters applied:{' '}
                      {[
                        urlDistrictIds    && `District IDs: ${urlDistrictIds}`,
                        urlPsIds          && `PS IDs: ${urlPsIds}`,
                        urlOfficeIds      && `Office IDs: ${urlOfficeIds}`,
                        urlClassOfInc     && `Class: ${urlClassOfInc}`,
                        urlFromDate       && `From: ${urlFromDate}`,
                        urlToDate         && `To: ${urlToDate}`,
                      ].filter(Boolean).join(' | ')}
                    </span>
                  )}
                </span>
                <button
                  onClick={resetFilters}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#60a5fa', fontSize: 12, textDecoration: 'underline', whiteSpace: 'nowrap' }}
                >
                  Clear Filter
                </button>
              </div>
            )}

            {/* Filters */}
            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 12,
                padding: '10px 12px',
                background: 'var(--card-bg)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="form-input"
                style={{ width: 200, fontSize: 13 }}
              />
              <input
                type="text"
                placeholder="Filter district..."
                value={filterDistrict}
                onChange={(e) => { setFilterDistrict(e.target.value); setPage(1); }}
                className="form-input"
                style={{ width: 150, fontSize: 13 }}
              />
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                className="form-input"
                style={{ width: 140, fontSize: 13 }}
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="disposed">Disposed</option>
                <option value="unknown">Unknown</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filterMissingDateOnly}
                  onChange={(e) => { setFilterMissingDateOnly(e.target.checked); setPage(1); }}
                  style={{ cursor: 'pointer' }}
                />
                Missing Disposal Date
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                className="form-input"
                style={{ width: 150, fontSize: 13 }}
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                className="form-input"
                style={{ width: 150, fontSize: 13 }}
              />
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split(':');
                  setSortBy(field);
                  setSortOrder(order as 'asc' | 'desc');
                  setPage(1);
                }}
                className="form-input"
                style={{ width: 160, fontSize: 13 }}
              >
                <option value="id:desc">Newest First</option>
                <option value="id:asc">Oldest First</option>
                <option value="complRegDt:desc">Reg. Date ↓</option>
                <option value="complRegDt:asc">Reg. Date ↑</option>
                <option value="districtName:asc">District A-Z</option>
                <option value="statusOfComplaint:asc">Status A-Z</option>
              </select>
              <Button variant="secondary" onClick={resetFilters}>
                Reset
              </Button>
            </div>

            {syncedQuery.isLoading ? (
              <div className="loading-spinner">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : syncedQuery.isError ? (
              <div className="error-message">
                Failed to load records: {String((syncedQuery.error as Error)?.message || 'Unknown error')}
              </div>
            ) : syncedData.length === 0 ? (
              <div className="empty-state">
                <p>{syncedPagination?.total === 0 ? 'No records in database. Use "Fetch & Sync to DB" to import data.' : 'No records match your filters.'}</p>
              </div>
            ) : (
              <>
                  <DataTable
                    title="CCTNS Database Gateway"
                    data={syncedData}
                    columns={recordCols}
                    maxHeight="calc(100vh - 400px)"
                    activeFilters={cctnsActiveFilters}
                    onFetchAllForExport={fetchAllCctnsForExport}
                    pagination={syncedPagination ? {
                      page: syncedPagination.page,
                      limit,
                      total: syncedPagination.total,
                      totalPages: syncedPagination.totalPages,
                      onPageChange: setPage,
                      onLimitChange: (l) => { setLimit(l); setPage(1); }
                    } : undefined}
                  />
              </>
            )}
          </>
        )}

        {/* —— Sync History Tab —— */}
        {isConfigured && activeTab === 'history' && (
          <>
            {historyQuery.isLoading ? (
              <div className="loading-spinner">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : historyData.length === 0 ? (
              <div className="empty-state">
                <p>No sync history available.</p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                  Showing <strong>{historyData.length}</strong> recent sync runs
                </div>
                <DataTable
                  title="CCTNS Sync History"
                  data={historyData}
                  columns={historyCols}
                  maxHeight="calc(100vh - 320px)"
                />
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default CCTNSPage;
