import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Layout } from '@/components/layout/Layout';
import { ChartCard } from '@/components/charts/ChartCard';
import { getStackedBarOptions } from '@/components/charts/Charts';
import { DataTable, Column } from '@/components/data/DataTable';
import { useFilters } from '@/contexts/FilterContext';

// ─── Mini sort dropdown ─────────────────────────────────────────────────────
const CAT_SORTS = [
  { label: 'By Pending ↓',  value: 'pending'  },
  { label: 'By Total ↓',    value: 'total'    },
  { label: 'By Disposed ↓', value: 'disposed' },
  { label: 'A → Z',         value: 'az'       },
  { label: 'Z → A',         value: 'za'       },
];
const CatSortDropdown = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const cur = CAT_SORTS.find(o => o.value === value)?.label ?? 'Sort';
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
          {CAT_SORTS.map(opt => (
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

const StatCard = ({ label, value, subValue, colorClass, onClick }: { label: string; value: string | number; subValue?: string; colorClass: string; onClick?: () => void }) => (
  <div
    className={`stat-card ${colorClass}`}
    onClick={onClick}
    style={{ cursor: onClick ? 'pointer' : undefined, transition: 'transform 0.15s, box-shadow 0.15s' }}
    onMouseEnter={(e) => { if (onClick) { (e.currentTarget as HTMLElement).style.transform = 'scale(1.025)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.35)'; } }}
    onMouseLeave={(e) => { if (onClick) { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; } }}
    title={onClick ? 'Click to view these complaints' : undefined}
  >
    <div className="stat-card-label">{label}</div>
    <div className="stat-card-value">{value}</div>
    {subValue && <div className="text-xs mt-1 opacity-80">{subValue}</div>}
    {onClick && (
      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 18l6-6-6-6"/>
        </svg>
        Click to view complaints
      </div>
    )}
  </div>
);

export const DistrictDetail = () => {
  const { district } = useParams<{ district: string }>();
  const navigate = useNavigate();
  const [catSort, setCatSort] = useState<string>('pending');
      const { filters } = useFilters();
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''));

  const { data, isLoading } = useQuery({
    queryKey: ['district-analysis', district, activeFilters],
    queryFn: async () => {
      const params = new URLSearchParams(activeFilters as Record<string, string>);
      const r = await fetch(`/api/dashboard/district-analysis/${district}?${params.toString()}`, { 
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } 
      });
      return r.json();
    },
    enabled: !!district
  });

  const policeStations = data?.data?.policeStations || [];
  const rawCategories  = data?.data?.categories || [];

  // Sort categories for the chart
  const categories = [...rawCategories].sort((a: any, b: any) => {
    if (catSort === 'az')       return String(a.category).localeCompare(String(b.category));
    if (catSort === 'za')       return String(b.category).localeCompare(String(a.category));
    if (catSort === 'total')    return b.total    - a.total;
    if (catSort === 'disposed') return b.disposed - a.disposed;
    return b.pending - a.pending; // default
  });
  
  // Aggregates — disposed = ALL records with statusGroup=disposed (with + without date)
  const totalReceived = policeStations.reduce((sum: number, ps: any) => sum + ps.total, 0);
  const totalPending  = policeStations.reduce((sum: number, ps: any) => sum + ps.pending, 0);
  const totalDisposed = policeStations.reduce((sum: number, ps: any) => sum + ps.disposed, 0);
  const totalMissingDates = policeStations.reduce((sum: number, ps: any) => sum + (ps.missingDates || 0), 0);
  const totalDisposedWithDate = totalDisposed - totalMissingDates;
  const totalUnknown  = policeStations.reduce((sum: number, ps: any) => sum + (ps.unknown || 0), 0);
  const totalDisposedDays = policeStations.reduce((sum: number, ps: any) => sum + (ps.avgDisposalDays * (ps.disposed - (ps.missingDates || 0))), 0);
  const avgDisposalTime = totalDisposedWithDate > 0 ? Math.round(totalDisposedDays / totalDisposedWithDate) : 0;

  // ── Police Station Summary Table ──────────────────────────────────────────
  const psCols: Column<any>[] = [
    { key: 'ps',              label: 'Police Station',       sortable: true },
    { key: 'total',           label: 'Total',                sortable: true, align: 'center' },
    { key: 'disposed',        label: 'Disposed',             sortable: true, align: 'center' },
    { key: 'missingDates',   label: 'Disposed but Date Not Found',     sortable: true, align: 'center' },
    { key: 'pending',         label: 'Pending',              sortable: true, align: 'center' },
    { key: 'unknown',         label: 'Status Not Found',     sortable: true, align: 'center' },
    { key: 'u7',              label: '< 7 Days',             sortable: true, align: 'center' },
    { key: 'u15',             label: '7 - 15 Days',          sortable: true, align: 'center' },
    { key: 'u30',             label: '15 - 30 Days',         sortable: true, align: 'center' },
    { key: 'o30',             label: '1-2 Months',           sortable: true, align: 'center' },
    { key: 'o60',             label: 'Over 2 Months',        sortable: true, align: 'center' },
    { key: 'avgDisposalDays', label: 'Avg. Disposal (Days)', sortable: true, align: 'center' },
  ];

  const buildCellUrl = (psName: string, psId: string | null | undefined, statusGroup: string, extraParams: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (filters.districtIds)      p.set('districtIds',      filters.districtIds);
    if (filters.policeStationIds) p.set('policeStationIds', filters.policeStationIds);
    if (filters.officeIds)        p.set('officeIds',        filters.officeIds);
    if (filters.classOfIncident)  p.set('classOfIncident',  filters.classOfIncident);
    if (filters.fromDate)         p.set('fromDate',         filters.fromDate);
    if (filters.toDate)           p.set('toDate',           filters.toDate);

    if (!filters.districtIds && district) {
      p.set('district', district);
    }

    if (psId) {
      p.set('policeStationIds', psId);
      if (psName && psName !== 'Unmapped') p.set('psName', psName);
    } else if (psName === 'Unmapped') {
      p.set('unmappedPs', 'true');
    } else if (psName) {
      p.set('psName', psName);
    }

    p.set('statusGroup', statusGroup);
    Object.entries(extraParams).forEach(([k, v]) => p.set(k, v));
    const url = `/admin/cctns?${p.toString()}`;
    return url;
  };

  const ClickableCell = ({ value, url, color, fw }: { value: any, url: string, color?: string, fw?: any }) => (
    (typeof value === 'number' && value > 0) || (typeof value === 'string' && value !== '0' && value !== '0%') ? (
      <span
        onClick={(e) => { e.stopPropagation(); navigate(url); }}
        className="hover:underline cursor-pointer"
        style={{ color, fontWeight: fw }}
      >
        {value}
      </span>
    ) : (
      <span style={{ color, fontWeight: fw }}>{value}</span>
    )
  );

  const renderPsCell = (col: Column<any>, row: any) => {
    if (col.key === 'ps')              return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.ps}</span>;
    if (col.key === 'total')           return <ClickableCell value={row.total} url={buildCellUrl(row.ps, row.psId, 'all')} color="#60a5fa" />;
if (col.key === 'disposed')      return <ClickableCell value={row.disposed} url={buildCellUrl(row.ps, row.psId, 'disposed')} color="#4ade80" />;
    if (col.key === 'missingDates')  return <ClickableCell value={row.missingDates ?? 0} url={buildCellUrl(row.ps, row.psId, 'disposed_missing_date')} color="#fbbf24" />;
    if (col.key === 'pending')      return <ClickableCell value={row.pending} url={buildCellUrl(row.ps, row.psId, 'pending')} color="#fbbf24" />;
    if (col.key === 'unknown')         return <ClickableCell value={row.unknown ?? 0} url={buildCellUrl(row.ps, row.psId, 'unknown')} color="#94a3b8" />;
    if (col.key === 'u7')              return <ClickableCell value={row.u7} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'u7' })} color="var(--text-muted)" />;
    if (col.key === 'u15')             return <ClickableCell value={row.u15} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'u15' })} color="#eab308" />;
    if (col.key === 'u30')             return <ClickableCell value={row.u30} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'u30' })} color="#fb923c" fw={500} />;
    if (col.key === 'o30')             return <ClickableCell value={row.o30} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'o30' })} color="#ef4444" fw="bold" />;
    if (col.key === 'o60')             return <ClickableCell value={row.o60 || 0} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'o60' })} color="#b91c1c" fw="bold" />;
    if (col.key === 'avgDisposalDays') return <span style={{ color: '#c084fc' }}>{row.avgDisposalDays}d</span>;
    return row[col.key];
  };

  // ── Pendency Ageing Matrix (Days) ─────────────────────────────────────────
  const pendencyCols: Column<any>[] = [
    { key: 'ps',   label: 'Police Station', sortable: true },
    { key: 'pending', label: 'Total',       sortable: true, align: 'center' },
    { key: 'u7',   label: '< 7 Days',       sortable: true, align: 'center' },
    { key: 'u15',  label: '7-15 Days',      sortable: true, align: 'center' },
    { key: 'u30',  label: '15-30 Days',     sortable: true, align: 'center' },
    { key: 'o30',  label: '1-2 Months',     sortable: true, align: 'center' },
    { key: 'o60',  label: 'Over 2 Months',  sortable: true, align: 'center' },
  ];

  const renderPendencyDays = (col: Column<any>, row: any) => {
    const total = row.pending || 1;
    if (col.key === 'ps')  return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.ps}</span>;
    if (col.key === 'pending') return <ClickableCell value={row.pending} url={buildCellUrl(row.ps, row.psId, 'pending')} color="#60a5fa" />;
    if (col.key === 'u7')  return <span style={{ color: 'var(--text-muted)' }}><ClickableCell value={row.u7} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'u7' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.u7 || 0) * 100 / total)}%)</span></span>;
    if (col.key === 'u15') return <span style={{ color: '#eab308' }}><ClickableCell value={row.u15} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'u15' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.u15 || 0) * 100 / total)}%)</span></span>;
    if (col.key === 'u30') return <span style={{ color: '#fb923c', fontWeight: 500 }}><ClickableCell value={row.u30} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'u30' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.u30 || 0) * 100 / total)}%)</span></span>;
    if (col.key === 'o30') return <span style={{ color: '#ef4444', fontWeight: 'bold' }}><ClickableCell value={row.o30} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'o30' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.o30 || 0) * 100 / total)}%)</span></span>;
    if (col.key === 'o60') return <span style={{ color: '#b91c1c', fontWeight: 'bold' }}><ClickableCell value={row.o60 || 0} url={buildCellUrl(row.ps, row.psId, 'pending', { pendencyAge: 'o60' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.o60 || 0) * 100 / total)}%)</span></span>;
    return row[col.key];
  };

  // ── Disposal Time Matrix (Days) ───────────────────────────────────────────
  const disposalCols: Column<any>[] = [
    { key: 'ps',              label: 'Police Station',         sortable: true },
    { key: 'disposed',        label: 'Total Disposed',          sortable: true, align: 'center' },
    { key: 'missingDates',    label: 'Date Not Found',          sortable: true, align: 'center' },
    { key: 'du7',             label: '< 7 Days',                sortable: true, align: 'center' },
    { key: 'du15',            label: '7-15 Days',               sortable: true, align: 'center' },
    { key: 'du30',            label: '15-30 Days',              sortable: true, align: 'center' },
    { key: 'do30',            label: '1-2 Months',              sortable: true, align: 'center' },
    { key: 'do60',            label: 'Over 2 Months',            sortable: true, align: 'center' },
  ];

  const renderDisposalDays = (col: Column<any>, row: any) => {
    const disposedWithDate = row.disposed || 0;
    const disposedNoDate   = row.missingDates || 0;
    const totalDisposed    = disposedWithDate + disposedNoDate;
    const denominator      = disposedWithDate || 1;
    if (col.key === 'ps')           return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.ps}</span>;
    if (col.key === 'disposed')     return <ClickableCell value={disposedWithDate} url={buildCellUrl(row.ps, row.psId, 'disposed')} color="#4ade80" />;
    if (col.key === 'missingDates') return <ClickableCell value={disposedNoDate} url={buildCellUrl(row.ps, row.psId, 'disposed_missing_date')} color="#fbbf24" />;
    if (col.key === 'du7')  return <span style={{ color: '#4ade80' }}><ClickableCell value={row.du7} url={buildCellUrl(row.ps, row.psId, 'disposed', { disposalAge: 'u7' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.du7 || 0) * 100 / denominator)}%)</span></span>;
    if (col.key === 'du15') return <span style={{ color: '#a3e635' }}><ClickableCell value={row.du15} url={buildCellUrl(row.ps, row.psId, 'disposed', { disposalAge: 'u15' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.du15 || 0) * 100 / denominator)}%)</span></span>;
    if (col.key === 'du30') return <span style={{ color: '#eab308' }}><ClickableCell value={row.du30} url={buildCellUrl(row.ps, row.psId, 'disposed', { disposalAge: 'u30' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.du30 || 0) * 100 / denominator)}%)</span></span>;
    if (col.key === 'do30') return <span style={{ color: '#ef4444', fontWeight: 'bold' }}><ClickableCell value={row.do30} url={buildCellUrl(row.ps, row.psId, 'disposed', { disposalAge: 'o30' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.do30 || 0) * 100 / denominator)}%)</span></span>;
    if (col.key === 'do60') return <span style={{ color: '#b91c1c', fontWeight: 'bold' }}><ClickableCell value={row.do60 || 0} url={buildCellUrl(row.ps, row.psId, 'disposed', { disposalAge: 'o60' })} color="inherit" /> <span style={{ fontSize: '11px', opacity: 0.6 }}>({Math.round((row.do60 || 0) * 100 / denominator)}%)</span></span>;
    return row[col.key];
  };

  const matrixCardStyle = { backgroundColor: '#1e293b', borderRadius: '8px', padding: '20px', border: '1px solid #334155', display: 'flex', flexDirection: 'column' as const };

  return (
    <Layout>
      <div className="page-content space-y-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '8px' }}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                border: '1px solid #475569',
                borderRadius: '999px',
                color: '#cbd5e1',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #475569 0%, #334155 100%)';
                (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#94a3b8';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #334155 0%, #1e293b 100%)';
                (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#475569';
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Back
            </button>
            <h1 className="text-2xl font-bold text-slate-100">{district} District Analysis</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="btn-primary" 
              onClick={() => {
                const wb = XLSX.utils.book_new();
                
                // Sheet 1: Executive Summary
                const execSummary = [{
                  'Metric': 'District', 'Value': district
                }, {
                  'Metric': 'Total Received', 'Value': totalReceived
                }, {
                  'Metric': 'Total Disposed', 'Value': totalDisposed
                }, {
                  'Metric': 'Disposed (Date Not Found)', 'Value': totalMissingDates
                }, {
                  'Metric': 'Total Pending', 'Value': totalPending
                }, {
                  'Metric': 'Status Not Found', 'Value': totalUnknown
                }, {
                  'Metric': 'Disposed (% of Total)', 'Value': `${Math.round((totalDisposed / (totalReceived || 1)) * 100)}%`
                }, {
                  'Metric': 'Pending (% of Total)',  'Value': `${Math.round((totalPending  / (totalReceived || 1)) * 100)}%`
                }, {
                  'Metric': 'Avg. Disposal Time (Days)', 'Value': avgDisposalTime
                }];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(execSummary), 'Overview');

                // Sheet 2: Police Station Summary
const psSummary = policeStations.map((ps: any) => ({
                  'Police Station':          ps.ps,
                  'Total':                   ps.total,
                  'Disposed (With Date)':    ps.disposed,
                  'Disposed (Date Not Found)': ps.missingDates ?? 0,
                  'Pending':                  ps.pending,
                  'Status Not Found':        ps.unknown ?? 0,
                  'Disposed %':              `${Math.round((ps.disposed / (ps.total || 1)) * 100)}%`,
                  'Pending %':               `${Math.round((ps.pending  / (ps.total || 1)) * 100)}%`,
                  'Status Not Found %':      `${Math.round(((ps.unknown || 0) / (ps.total || 1)) * 100)}%`,
                  '< 7 Days (Pending)':      ps.u7,
                  '7 - 15 Days (Pending)':   ps.u15,
                  '15 - 30 Days (Pending)':   ps.u30,
                  '> 30 Days (Pending)':      ps.o30,
                  'Avg Disposal (Days)':     ps.avgDisposalDays
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(psSummary), 'PS Summary');

                // Sheet 3: Category Breakdown
                const catSummary = categories.map((cat: any) => ({
                  'Category':          cat.category,
                  'Total':             cat.total,
                  'Disposed':          cat.disposed,
                  'Pending':           cat.pending,
                  'Status Not Found':  cat.unknown ?? 0,
                  'Disposed %':        `${Math.round((cat.disposed / (cat.total || 1)) * 100)}%`,
                  'Pending %':         `${Math.round((cat.pending  / (cat.total || 1)) * 100)}%`,
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catSummary), 'Category Breakdown');

                // Sheet 4: Disposal Time Matrix
                const psDisposal = policeStations.map((ps: any) => ({
                  'Police Station':           ps.ps,
                  'Disposed (With Date)':     ps.disposed,
                  'Disposed (Date Not Found)': ps.missingDates ?? 0,
                  '< 7 Days (Disposed)':      ps.du7,
                  '7 - 15 Days (Disposed)':   ps.du15,
                  '15 - 30 Days (Disposed)':  ps.du30,
                  '> 30 Days (Disposed)':     ps.do30
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(psDisposal), 'Disposal Matrix');
                
                // Write as binary array and download via Blob to avoid corruption
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${district}_District_Analysis.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              style={{ width: 'auto', margin: 0, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#10b981', borderColor: '#059669' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Export Excel
            </button>
            <button 
              className="btn-primary" 
              onClick={() => window.print()}
              style={{ width: 'auto', margin: 0, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export PDF
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="loading-spinner"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
        ) : (
          <>
            <div className="stats-grid">
              <StatCard label="Total Received" value={totalReceived.toLocaleString()} colorClass="blue" onClick={() => navigate(buildCellUrl('', null, 'all'))} />
              <StatCard
                label="Total Disposed"
                value={totalDisposed.toLocaleString()}
                subValue={`${Math.round((totalDisposed / (totalReceived || 1)) * 100)}% of Total | ${totalDisposedWithDate.toLocaleString()} with date | ${totalMissingDates.toLocaleString()} without date`}
                colorClass="green"
                onClick={() => navigate(buildCellUrl('', null, 'disposed'))}
              />
              <StatCard
                label="Total Pending"
                value={totalPending.toLocaleString()}
                subValue={`${Math.round((totalPending / (totalReceived || 1)) * 100)}% of Total Received`}
                colorClass="red"
                onClick={() => navigate(buildCellUrl('', null, 'pending'))}
              />
              <StatCard
                label="Disposed but Date Not Found"
                value={totalMissingDates.toLocaleString()}
                subValue={`${Math.round((totalMissingDates / (totalReceived || 1)) * 100)}% of Total Received`}
                colorClass="yellow"
                onClick={() => navigate(buildCellUrl('', null, 'disposed_missing_date'))}
              />
              <StatCard
                label="Status Not Found"
                value={totalUnknown.toLocaleString()}
                subValue={`${Math.round((totalUnknown / (totalReceived || 1)) * 100)}% of Total Received`}
                colorClass="yellow"
                onClick={() => navigate(buildCellUrl('', null, 'unknown'))}
              />
              <StatCard
                label="Avg. Disposal Time"
                value={`${avgDisposalTime} Days`}
                subValue="Only for records where date was found"
                colorClass="purple"
              />
            </div>

            {/* PS Summary + Category Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-800 rounded-lg p-5 border border-slate-700" style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 className="text-lg font-bold text-slate-100 mb-4">Police Station Breakdown &amp; Ageing</h2>
                <div style={{ flex: 1, position: 'relative' }}>
                  <DataTable
                    title="Police Station Breakdown & Ageing"
                    data={policeStations.sort((a: any, b: any) => b.o30 - a.o30 || b.pending - a.pending)}
                    columns={psCols.map(c => ({ ...c, render: (row) => renderPsCell(c, row) }))}
                    maxHeight="400px"
                  />
                </div>
              </div>
              <div className="lg:col-span-1">
                <ChartCard
                  title="Complaints by Class of Incident"
                  option={getStackedBarOptions(categories.slice(0, 12).reverse())}
                  fullOption={getStackedBarOptions([...categories].reverse())}
                  height="450px"
                  actions={
                    <CatSortDropdown
                      value={catSort}
                      onChange={v => setCatSort(v)}
                    />
                  }
                />
              </div>
            </div>

            {/* Pendency Ageing Matrix */}
            <div className="dashboard-matrices-grid">
              <div style={{ ...matrixCardStyle, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <h2 className="text-lg font-bold text-slate-100">Pendency Ageing Matrix</h2>
                </div>
                <DataTable
                  title="Pendency Ageing Matrix"
                  data={policeStations}
                  columns={pendencyCols.map(c => ({ ...c, render: (row) => renderPendencyDays(c, row) }))}
                  maxHeight="350px"
                />
              </div>

              {/* Disposal Time Matrix */}
              <div style={{ ...matrixCardStyle, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <h2 className="text-lg font-bold text-slate-100">Disposal Time Matrix</h2>
                </div>
                <DataTable
                  title="Disposal Time Matrix"
                  data={policeStations}
                  columns={disposalCols.map(c => ({ ...c, render: (row) => renderDisposalDays(c, row) }))}
                  maxHeight="350px"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default DistrictDetail;
