import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ChartCard } from '@/components/charts/ChartCard';
import { DataTable, Column } from '@/components/data/DataTable';
import { getPieOptions, getStackedBarOptions, getDistrictBarOptions } from '@/components/charts/Charts';
import { reportsApi } from '@/services/api';
import { useFilters } from '@/contexts/FilterContext';

const tabs = [
  { id: 'district', label: 'District' },
  { id: 'mode-receipt', label: 'Receipt Mode' },
  { id: 'complaint-source', label: 'Complaint Source' },
  { id: 'type-complaint', label: 'Class of Incident' },
  { id: 'type-against', label: 'Type Against' },
  { id: 'status', label: 'Status' },
  { id: 'branch-wise', label: 'Branch' },
  { id: 'oldest-pending', label: 'Oldest Pending' },
];

const apiFnMap: Record<string, (params?: Record<string, string>) => Promise<any>> = {
  'district':         (p) => reportsApi.district(p),
  'mode-receipt':     (p) => reportsApi.modeReceipt(p),
  'complaint-source': (p) => reportsApi.complaintsSource(p),
  'type-complaint':   (p) => reportsApi.typeComplaint(p),
  'type-against':     (p) => reportsApi.typeAgainst(p),
  'status':           (p) => reportsApi.status(p),
  'branch-wise':      (p) => reportsApi.branchWise(p),
  'oldest-pending':   (p) => reportsApi.oldestPending(p),
};

// ─── Reusable sort dropdown (local to this page) ─────────────────────────────
type SortOpt = { label: string; value: string };
const CHART_SORTS: SortOpt[] = [
  { label: 'By Total ↓',    value: 'total'    },
  { label: 'By Pending ↓',  value: 'pending'  },
  { label: 'By Disposed ↓', value: 'disposed' },
  { label: 'A → Z',         value: 'az'       },
  { label: 'Z → A',         value: 'za'       },
];

const ChartSortDropdown = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const cur = CHART_SORTS.find(o => o.value === value)?.label ?? 'Sort';
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} className="chart-expand-btn"
        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
        </svg>{cur}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 9999, minWidth: 180, padding: '4px 0' }}>
          {CHART_SORTS.map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: value === opt.value ? '#60a5fa' : '#cbd5e1', fontWeight: value === opt.value ? 600 : 400, backgroundColor: value === opt.value ? 'rgba(51,65,85,0.6)' : 'transparent' }}
              onMouseEnter={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.backgroundColor = '#334155'; }}
              onMouseLeave={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >{opt.label}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ReportsPage = () => {
  const [sp] = useSearchParams();
  const type = sp.get('type') || 'district';
  const [chartSort, setChartSort] = useState<string>('total');

  // Same pattern as Dashboard — read global filters, strip empty values
  const { filters } = useFilters();
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v !== '')
  ) as Record<string, string>;

  const [oldestDistrict, setOldestDistrict] = useState<{ id: string, name: string } | null>(null);

  // Reset drill-down when tab changes
  useEffect(() => {
    setOldestDistrict(null);
  }, [type]);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', type, activeFilters, oldestDistrict?.id],   // re-fetches on any filter change
    queryFn: () => {
      if (type === 'oldest-pending' && oldestDistrict) {
        return apiFnMap[type]({ ...activeFilters, districtMasterId: oldestDistrict.id });
      }
      return (apiFnMap[type] || apiFnMap['district'])(activeFilters);
    },
  });

  const rows = data?.data || [];
  const total   = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total   || r.count   || 0), 0);
  const pend    = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.pending || 0), 0);
  const disp    = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.disposed || 0), 0);
  const unk     = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.unknown || 0), 0);
  const missing = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.missingDates || 0), 0);

  const tableData = useMemo(() => {
    const mapped = rows.map((r: Record<string, unknown>, i: number) => {
      const tot = Number(r.total || r.count || 0);
      const p   = Number(r.pending  || 0);
      const d   = Number(r.disposed || 0);
      const u   = Number(r.unknown  || 0);
      const rawName = String(
        r.district || r.branch || r.mode || r.status ||
        r.natureOfIncident || r.typeAgainst || r.actionTaken ||
        r.complaintSource || r.typeOfComplaint || ''
      );
      const displayName =
        type === 'status' && (!rawName || rawName.trim() === '')
          ? 'Status Not Found'
          : rawName || `Item ${i + 1}`;
      return {
        name:     displayName,
        total:    tot,
        pending:  p,
        disposed: d,
        unknown:  u,
        pendPct:  tot > 0 ? Math.round((p / tot) * 100) + '%' : '0%',
        dispPct:  tot > 0 ? Math.round((d / tot) * 100) + '%' : '0%',
        unknPct:  tot > 0 ? Math.round((u / tot) * 100) + '%' : '0%',
      };
    });
    return [...mapped].sort((a, b) => {
      if (chartSort === 'az') return a.name.localeCompare(b.name);
      if (chartSort === 'za') return b.name.localeCompare(a.name);
      if (chartSort === 'pending')  return b.pending  - a.pending;
      if (chartSort === 'disposed') return b.disposed - a.disposed;
      return b.total - a.total; // default
    });
  }, [rows, type, chartSort]);

  const columns: Column<typeof tableData[0]>[] = [
    { key: 'name',     label: 'Name',                sortable: true },
    { key: 'total',    label: 'Total',               sortable: true, align: 'right' },
    { key: 'pending',  label: 'Pending',             sortable: true, align: 'right' },
    { key: 'disposed', label: 'Disposed',            sortable: true, align: 'right' },
    { key: 'unknown',  label: 'Status Not Found',    sortable: true, align: 'right' },
    { key: 'pendPct',  label: 'Pending %',           sortable: true, align: 'center' },
    { key: 'dispPct',  label: 'Disposed %',          sortable: true, align: 'center' },
    { key: 'unknPct',  label: 'Status Not Found %',  sortable: true, align: 'center' },
  ];

  // Chart preview: top 25 sorted rows reversed so highest appears at the top of horizontal bar
  const chartRows = tableData.slice(0, 25).reverse();

  const chartOption = useMemo(() => {
    if (type === 'district' || type === 'branch-wise')
      return getDistrictBarOptions(chartRows.map(d => ({ ...d, district: d.name })));
    if (type === 'mode-receipt' || type === 'status') {
      return getPieOptions(chartRows.map(d => ({
        name: type === 'status' && (!d.name || d.name.trim() === '') ? 'Unknown Status (No Value from API)' : d.name,
        value: d.total,
      })));
    }
    return getStackedBarOptions(chartRows.map(d => ({
      category: d.name,
      total:    d.total,
      pending:  d.pending,
      disposed: d.disposed,
      unknown:  d.unknown,
    })));
  }, [chartRows, type]);

  const fullChartOption = useMemo(() => {
    const allRowsRev = [...tableData].reverse();
    if (type === 'district' || type === 'branch-wise')
      return getDistrictBarOptions(allRowsRev.map(d => ({ ...d, district: d.name })));
    if (type === 'mode-receipt' || type === 'status') {
      return getPieOptions(allRowsRev.map(d => ({
        name: type === 'status' && (!d.name || d.name.trim() === '') ? 'Unknown Status (No Value from API)' : d.name,
        value: d.total,
      })));
    }
    return getStackedBarOptions(allRowsRev.map(d => ({
      category: d.name,
      total:    d.total,
      pending:  d.pending,
      disposed: d.disposed,
      unknown:  d.unknown,
    })));
  }, [tableData, type]);

  return (
    <Layout>
      <div className="page-content">
        <div className="tab-list">
          {tabs.map(t => (
            <Link key={t.id} to={`?type=${t.id}`} className={`tab-item ${type === t.id ? 'active' : ''}`}>{t.label}</Link>
          ))}
        </div>

        {isLoading ? (
          <div className="loading-spinner"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
        ) : type === 'oldest-pending' ? (
          <div>
            {oldestDistrict && (
              <button 
                onClick={() => setOldestDistrict(null)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#60a5fa', 
                  cursor: 'pointer', 
                  marginBottom: '16px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Districts
              </button>
            )}
            <DataTable
              title={oldestDistrict ? `PS wise Oldest Pending Complaints - ${oldestDistrict.name}` : "Oldest Pending Complaints - Districts"}
              data={rows.map((r: any) => ({
                id: r.id,
                name: r.name || 'Unmapped',
                oldestDate: r.oldestDate ? r.oldestDate.split('T')[0] : 'N/A',
                complaintNumber: r.complaintNumber || 'N/A'
              }))}
              columns={[
                { key: 'name', label: oldestDistrict ? 'Police Station' : 'District', sortable: true },
                { key: 'oldestDate', label: 'Oldest Complaint Date', sortable: true },
                { 
                  key: 'complaintNumber', 
                  label: 'Complaint Number', 
                  sortable: true,
                  render: (row: any) => row.complaintNumber && row.complaintNumber !== 'N/A' ? (
                    <Link
                      to={`/admin/cctns?tab=synced&search=${encodeURIComponent(row.complaintNumber)}`}
                      style={{ color: '#60a5fa', textDecoration: 'underline' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.complaintNumber}
                    </Link>
                  ) : (row.complaintNumber || 'N/A')
                }
              ]}
              maxHeight="calc(100vh - 160px)"
              onRowClick={!oldestDistrict ? (row: any) => { if (row.id) setOldestDistrict({ id: row.id, name: row.name }); } : undefined}
            />
          </div>
        ) : (
          <>
            <div className="summary-row">
              <div className="summary-item">
                <span className="summary-value">{total.toLocaleString()}</span>
                <span className="summary-label">Total Received</span>
              </div>
              <div className="summary-item pending">
                <span className="summary-value">{pend.toLocaleString()}</span>
                <span className="summary-label">Pending {total > 0 ? `(${(pend / total * 100).toFixed(1)}%)` : ''}</span>
              </div>
              <div className="summary-item disposed">
                <span className="summary-value">{disp.toLocaleString()}</span>
                <span className="summary-label">Disposed {total > 0 ? `(${(disp / total * 100).toFixed(1)}%)` : ''}</span>
              </div>
              <div className="summary-item" style={{ borderLeft: '3px solid #64748b' }}>
                <span className="summary-value">{unk.toLocaleString()}</span>
                <span className="summary-label">Status Not Found {total > 0 ? `(${(unk / total * 100).toFixed(1)}%)` : ''}</span>
              </div>
              <div className="summary-item" style={{ borderLeft: '3px solid #a855f7' }}>
                <span className="summary-value">{missing.toLocaleString()}</span>
                <span className="summary-label">Disposal Date Not Found</span>
              </div>
            </div>

            <ChartCard
              title={tabs.find(t => t.id === type)?.label || 'Report'}
              option={chartOption}
              fullOption={fullChartOption}
              height="280px"
              actions={
                <ChartSortDropdown
                  value={chartSort}
                  onChange={v => setChartSort(v)}
                />
              }
            />

            <DataTable
              title={tabs.find(t => t.id === type)?.label || 'Report'}
              data={tableData}
              columns={columns.map(c => ({
                ...c,
                render: (row) => {
                  if (c.key === 'name')     return <span style={{ fontWeight: 500 }}>{String(row.name)}</span>;
                  if (c.key === 'total')    return <span style={{ fontWeight: 600 }}>{String(row.total)}</span>;
                  if (c.key === 'pending')  return <span style={{ color: '#fbbf24' }}>{String(row.pending)}</span>;
                  if (c.key === 'disposed') return <span style={{ color: '#34d399' }}>{String(row.disposed)}</span>;
                  if (c.key === 'unknown')  return <span style={{ color: '#94a3b8' }}>{String(row.unknown)}</span>;
                  if (c.key === 'pendPct')  return <span style={{ color: '#fbbf24' }}>{String(row.pendPct)}</span>;
                  if (c.key === 'dispPct')  return <span style={{ color: '#34d399' }}>{String(row.dispPct)}</span>;
                  if (c.key === 'unknPct')  return <span style={{ color: '#94a3b8' }}>{String(row.unknPct)}</span>;
                  return String(row[c.key as keyof typeof row] ?? '-');
                },
              }))}
              maxHeight="calc(100vh - 440px)"
            />
          </>
        )}
      </div>
    </Layout>
  );
};

export default ReportsPage;
