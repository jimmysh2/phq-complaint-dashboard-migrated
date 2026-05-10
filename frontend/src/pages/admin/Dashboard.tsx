import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Layout } from '@/components/layout/Layout';
import { ChartCard } from '@/components/charts/ChartCard';
import { getDistrictBarOptions, getDurationLineOptions, getStackedBarOptions } from '@/components/charts/Charts';
import { DataTable, Column } from '@/components/data/DataTable';
import { dashboardApi } from '@/services/api';
import { useFilters } from '@/contexts/FilterContext';

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

const SortDropdown = ({ value, onChange, options }: { value: string, onChange: (val: string) => void, options: {label: string, value: string}[] }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button 
        onClick={() => setOpen(!open)}
        className="chart-expand-btn"
        title="Sort Options"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
          <line x1="10" y1="18" x2="14" y2="18"></line>
        </svg>
        Sort By
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          width: '200px',
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 9999,
          padding: '4px 0',
        }}>
          {options.map((opt: any) => (
            <div
              key={opt.value}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                color: value === opt.value ? '#60a5fa' : '#cbd5e1',
                fontWeight: value === opt.value ? 600 : 400,
                backgroundColor: value === opt.value ? 'rgba(51,65,85,0.5)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (value !== opt.value) e.currentTarget.style.backgroundColor = '#334155'; }}
              onMouseLeave={(e) => { if (value !== opt.value) e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ViewToggle = ({ value, onChange }: { value: 'graph' | 'table', onChange: (val: 'graph' | 'table') => void }) => (
  <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '4px', border: '1px solid #334155', overflow: 'hidden' }}>
    <button 
      onClick={() => onChange('graph')}
      style={{
        padding: '4px 8px', fontSize: '11px', fontWeight: value === 'graph' ? 600 : 400,
        backgroundColor: value === 'graph' ? '#334155' : 'transparent', color: value === 'graph' ? '#fff' : '#94a3b8'
      }}
    >
      Graph
    </button>
    <button 
      onClick={() => onChange('table')}
      style={{
        padding: '4px 8px', fontSize: '11px', fontWeight: value === 'table' ? 600 : 400,
        backgroundColor: value === 'table' ? '#334155' : 'transparent', color: value === 'table' ? '#fff' : '#94a3b8',
        borderLeft: '1px solid #334155'
      }}
    >
      Table
    </button>
  </div>
);

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { filters } = useFilters();

  // Build CCTNS navigation URL including all active global filters so the
  // gateway reproduces the exact same WHERE clause that produced the card count.
  const buildCctnsUrl = (statusGroup: string) => {
    const params = new URLSearchParams({ statusGroup });
    if (filters.districtIds)      params.set('districtIds',      filters.districtIds);
    if (filters.policeStationIds) params.set('policeStationIds', filters.policeStationIds);
    if (filters.officeIds)        params.set('officeIds',        filters.officeIds);
    if (filters.classOfIncident)  params.set('classOfIncident',  filters.classOfIncident);
    if (filters.fromDate)         params.set('fromDate',         filters.fromDate);
    if (filters.toDate)           params.set('toDate',           filters.toDate);
    return `/admin/cctns?${params.toString()}`;
  };
  
  // Clean empty filters before passing
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''));

  const { data: summaryData, isLoading: sl } = useQuery({
    queryKey: ['dashboard', 'summary', activeFilters],
    queryFn: () => dashboardApi.summary(activeFilters),
  });

  const { data: districtData } = useQuery({
    queryKey: ['dashboard', 'district', activeFilters],
    queryFn: () => dashboardApi.districtWise(activeFilters),
  });

  const { data: durationData } = useQuery({
    queryKey: ['dashboard', 'duration', activeFilters],
    queryFn: () => dashboardApi.durationWise(activeFilters),
  });

  const { data: matrixData, isLoading: ml } = useQuery({
    queryKey: ['dashboard', 'matrix', activeFilters],
    queryFn: () => dashboardApi.ageingMatrix(activeFilters),
  });

  const { data: categoryData } = useQuery({
    queryKey: ['dashboard', 'category', activeFilters],
    queryFn: () => dashboardApi.categoryWise(activeFilters),
  });

  const { data: disposalMatrixData, isLoading: dml } = useQuery({
    queryKey: ['dashboard', 'disposal-matrix', activeFilters],
    queryFn: () => dashboardApi.disposalMatrix(activeFilters),
  });

  const s = summaryData?.data;
  const districts = districtData?.data || [];
  const durations = durationData?.data || [];
  const matrix = matrixData?.data || [];
  const categories = categoryData?.data || [];
  const disposalMatrix = disposalMatrixData?.data?.rows || disposalMatrixData?.data || [];

  // Detect granularity from backend response (day vs month) for adaptive chart title
  const trendGranularity: 'day' | 'month' = durations.length > 0 && durations[0]?.granularity === 'day' ? 'day' : 'month';
  const trendChartTitle = trendGranularity === 'day' ? 'State-wide Trend (Daily)' : 'State-wide Trend (Monthly)';

  const [districtSort, setDistrictSort] = useState<string>('total');
  const [categorySort, setCategorySort] = useState<string>('total');
  const [districtViewType, setDistrictViewType] = useState<'graph' | 'table'>('graph');
  const [categoryViewType, setCategoryViewType] = useState<'graph' | 'table'>('graph');
  const [pendencyView, setPendencyView] = useState<'numbers' | 'pct'>('numbers');
  const [disposalView, setDisposalView] = useState<'numbers' | 'pct'>('numbers');

  const stateTotal = s?.totalReceived || 1;

  const sortData = (data: any[], sortKey: string) => {
    return [...data].sort((a: any, b: any) => {
      let aVal = 0;
      let bVal = 0;
      switch (sortKey) {
        case 'total':
          aVal = a.total; bVal = b.total; break;
        case 'pending':
          aVal = a.pending; bVal = b.pending; break;
        case 'disposed':
          aVal = a.disposed; bVal = b.disposed; break;
        case 'total_pct_state':
          aVal = a.total / stateTotal; bVal = b.total / stateTotal; break;
        case 'pending_pct':
          aVal = a.total > 0 ? a.pending / a.total : 0; bVal = b.total > 0 ? b.pending / b.total : 0; break;
        case 'disposed_pct':
          aVal = a.total > 0 ? a.disposed / a.total : 0; bVal = b.total > 0 ? b.disposed / b.total : 0; break;
        case 'az': {
          const la = String(a.district ?? a.category ?? '');
          const lb = String(b.district ?? b.category ?? '');
          return la.localeCompare(lb);
        }
        case 'za': {
          const la = String(a.district ?? a.category ?? '');
          const lb = String(b.district ?? b.category ?? '');
          return lb.localeCompare(la);
        }
      }
      return bVal - aVal;
    });
  };

  const sortedDistricts = sortData(districts, districtSort);
  const sortedCategories = sortData(categories, categorySort);

  const matrixWithTotal = matrix.map((row: any) => {
    // API now returns row.pending with the actual total from DB including those with missing dates
    const total = row.pending ?? ((row.u7 || 0) + (row.u15 || 0) + (row.u30 || 0) + (row.o30 || 0) + (row.o60 || 0));
    return { ...row, total };
  });

  const matrixWithPct = matrixWithTotal.map((row: any) => {
    const total = row.total || 1;
    return {
      ...row,
      pct_u7:  Math.round((row.u7 || 0)  * 100 / total),
      pct_u15: Math.round((row.u15 || 0) * 100 / total),
      pct_u30: Math.round((row.u30 || 0) * 100 / total),
      pct_o30: Math.round((row.o30 || 0) * 100 / total),
      pct_o60: Math.round((row.o60 || 0) * 100 / total),
      pct_total: 100,
    };
  });

  const matrixCols: Column<any>[] = [
    { key: 'district', label: 'District',      sortable: true },
    { key: 'total',    label: 'Total',         sortable: true, align: 'center' },
    { key: 'u7',       label: '<7 Days',        sortable: true, align: 'center' },
    { key: 'u15',      label: '7-15 Days',      sortable: true, align: 'center' },
    { key: 'u30',      label: '15-30 Days',     sortable: true, align: 'center' },
    { key: 'o30',      label: '1-2 Months',     sortable: true, align: 'center' },
    { key: 'o60',      label: 'Over 2 Months',  sortable: true, align: 'center' },
  ];

  const renderMatrixDays = (col: any, row: any) => {
    if (col.key === 'district') return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.district}</span>;
    if (col.key === 'total') return <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{row.total}</span>;
    if (col.key === 'u7')  return <span style={{ color: 'var(--text-muted)' }}>{row.u7}</span>;
    if (col.key === 'u15') return <span style={{ color: '#eab308' }}>{row.u15}</span>;
    if (col.key === 'u30') return <span style={{ color: '#fb923c', fontWeight: 500 }}>{row.u30}</span>;
    if (col.key === 'o30') return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{row.o30}</span>;
    if (col.key === 'o60') return <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>{row.o60 || 0}</span>;
    return row[col.key];
  };

  const matrixPctCols: Column<any>[] = [
    { key: 'district', label: 'District',      sortable: true },
    { key: 'pct_total',label: 'Total',         sortable: true, align: 'center' },
    { key: 'pct_u7',   label: '<7 Days',        sortable: true, align: 'center' },
    { key: 'pct_u15',  label: '7-15 Days',      sortable: true, align: 'center' },
    { key: 'pct_u30',  label: '15-30 Days',     sortable: true, align: 'center' },
    { key: 'pct_o30',  label: '1-2 Months',     sortable: true, align: 'center' },
    { key: 'pct_o60',  label: 'Over 2 Months',  sortable: true, align: 'center' },
  ];

  const renderMatrixPct = (col: any, row: any) => {
    if (col.key === 'district')  return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.district}</span>;
    if (col.key === 'pct_total') return <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{row.pct_total}%</span>;
    if (col.key === 'pct_u7')   return <span style={{ color: 'var(--text-muted)' }}>{row.pct_u7}%</span>;
    if (col.key === 'pct_u15')  return <span style={{ color: '#eab308' }}>{row.pct_u15}%</span>;
    if (col.key === 'pct_u30')  return <span style={{ color: '#fb923c', fontWeight: 500 }}>{row.pct_u30}%</span>;
    if (col.key === 'pct_o30')  return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{row.pct_o30}%</span>;
    if (col.key === 'pct_o60')  return <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>{row.pct_o60 || 0}%</span>;
    return row[col.key];
  };

  // Disposal Time Matrix — cumulative buckets (PR #4)
  const cumulativeDisposalMatrix = disposalMatrix.map((row: any) => {
    const total = row.disposed ?? ((row.u7 || 0) + (row.u15 || 0) + (row.u30 || 0) + (row.o30 || 0) + (row.o60 || 0));
    return {
      ...row,
      total,
      within7:  row.u7,
      within15: row.u7 + row.u15,
      within30: row.u7 + row.u15 + row.u30,
      above30:  row.o30 + (row.o60 || 0),
    };
  });

  const disposalMatrixWithPct = cumulativeDisposalMatrix.map((row: any) => {
    const total = row.total || 1;
    return {
      ...row,
      pct_within7:  Math.round(row.within7  * 100 / total),
      pct_within15: Math.round(row.within15 * 100 / total),
      pct_within30: Math.round(row.within30 * 100 / total),
      pct_above30:  Math.round(row.above30  * 100 / total),
      pct_total: 100,
    };
  });

  const disposalCols: Column<any>[] = [
    { key: 'district',  label: 'District',        sortable: true },
    { key: 'total',     label: 'Total',           sortable: true, align: 'center' },
    { key: 'within7',  label: 'Within 7 Days',   sortable: true, align: 'center' },
    { key: 'within15', label: 'Within 15 Days',  sortable: true, align: 'center' },
    { key: 'within30', label: 'Within 30 Days',  sortable: true, align: 'center' },
    { key: 'above30',  label: 'Above 30 Days',   sortable: true, align: 'center' },
  ];

  const renderDisposalDays = (col: any, row: any) => {
    if (col.key === 'district')  return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.district}</span>;
    if (col.key === 'total')    return <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{row.total}</span>;
    if (col.key === 'within7')  return <span style={{ color: '#4ade80' }}>{row.within7}</span>;
    if (col.key === 'within15') return <span style={{ color: '#a3e635' }}>{row.within15}</span>;
    if (col.key === 'within30') return <span style={{ color: '#eab308' }}>{row.within30}</span>;
    if (col.key === 'above30')  return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{row.above30}</span>;
    return row[col.key];
  };

  const disposalPctCols: Column<any>[] = [
    { key: 'district',      label: 'District',        sortable: true },
    { key: 'pct_total',     label: 'Total',           sortable: true, align: 'center' },
    { key: 'pct_within7',  label: 'Within 7 Days',   sortable: true, align: 'center' },
    { key: 'pct_within15', label: 'Within 15 Days',  sortable: true, align: 'center' },
    { key: 'pct_within30', label: 'Within 30 Days',  sortable: true, align: 'center' },
    { key: 'pct_above30',  label: 'Above 30 Days',   sortable: true, align: 'center' },
  ];

  const renderDisposalPct = (col: any, row: any) => {
    if (col.key === 'district')      return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.district}</span>;
    if (col.key === 'pct_total')    return <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{row.pct_total}%</span>;
    if (col.key === 'pct_within7')  return <span style={{ color: '#4ade80' }}>{row.pct_within7}%</span>;
    if (col.key === 'pct_within15') return <span style={{ color: '#a3e635' }}>{row.pct_within15}%</span>;
    if (col.key === 'pct_within30') return <span style={{ color: '#eab308' }}>{row.pct_within30}%</span>;
    if (col.key === 'pct_above30')  return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{row.pct_above30}%</span>;
    return row[col.key];
  };

  return (
    <Layout>
      <div className="page-content space-y-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '8px' }}>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Executive Overview</h1>
            <div className="text-sm text-slate-300 mt-2 flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/50 px-3 py-1.5 rounded-md shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span className="font-medium text-slate-200">Period:</span>
                <span>
                  {activeFilters.fromDate && activeFilters.toDate
                    ? `${new Date(activeFilters.fromDate).toLocaleDateString('en-IN')} to ${new Date(activeFilters.toDate).toLocaleDateString('en-IN')}`
                    : activeFilters.fromDate
                    ? `From ${new Date(activeFilters.fromDate).toLocaleDateString('en-IN')}`
                    : activeFilters.toDate
                    ? `Up to ${new Date(activeFilters.toDate).toLocaleDateString('en-IN')}`
                    : (s?.dbMinDate && s?.dbMaxDate)
                    ? `${new Date(s.dbMinDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} to ${new Date(s.dbMaxDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'All Time'}
                </span>
              </div>
              
              {s?.lastSyncTime && (
                <div title="Last time CCTNS data was successfully synced to this database" className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/50 px-3 py-1.5 rounded-md shadow-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <polyline points="23 20 23 14 17 14"></polyline>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                  </svg>
                  <span className="font-medium text-slate-200">Last Sync:</span>
                  <span>
                    {new Date(s.lastSyncTime).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
              )}
              
              {s?.dbMinDate && s?.dbMaxDate && (
                <div title="Time period of data available in the database" className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/50 px-3 py-1.5 rounded-md shadow-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <span className="font-medium text-slate-200">DB Data:</span>
                  <span>
                    {new Date(s.dbMinDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} to {new Date(s.dbMaxDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="btn-primary" 
              onClick={() => {
                const wb = XLSX.utils.book_new();
                
                // Sheet 1: Executive Summary
                const summaryDataSheet = [{
                  'Metric': 'Total Received', 'Value': s?.totalReceived || 0
                }, {
                  'Metric': 'Total Disposed', 'Value': s?.totalDisposed || 0
                }, {
                  'Metric': 'Total Pending', 'Value': s?.totalPending || 0
                }, {
                  'Metric': 'Clearance Rate', 'Value': `${Math.round(((s?.totalDisposed || 0) / (s?.totalReceived || 1)) * 100)}%`
                }, {
                  'Metric': 'Disposed Missing Date', 'Value': s?.disposedMissingDateCount || 0
                }, {
                  'Metric': 'Avg. Disposal Time (Days)', 'Value': s?.avgDisposalTime || 0
                }];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryDataSheet), 'Summary');

                // Sheet 2: District Totals
                const districtSummary = districts.map((d: any) => ({
                  'District': d.district,
                  'Total': d.total,
                  'Disposed': d.disposed,
                  'Pending': d.pending
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(districtSummary), 'District Totals');

                // Sheet 3: Category Totals
                const categorySummary = categories.map((c: any) => ({
                  'Category': c.category,
                  'Total': c.total,
                  'Disposed': c.disposed,
                  'Pending': c.pending
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categorySummary), 'Category Totals');

                // Sheet 4: Trend
                const trendSummary = durations.map((d: any) => ({
                  [trendGranularity === 'day' ? 'Date' : 'Month']: d.duration || d.month,
                  'Total': d.total,
                  'Disposed': d.disposed,
                  'Pending': d.pending
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendSummary), trendGranularity === 'day' ? 'Daily Trend' : 'Monthly Trend');

                // Sheet 5: Pendency Ageing Matrix
                const matrixSummary = matrix.map((d: any) => ({
                  'District': d.district,
                  '< 7 Days (Pending)': d.u7,
                  '7 - 15 Days (Pending)': d.u15,
                  '15 - 30 Days (Pending)': d.u30,
                  '> 30 Days (Pending)': d.o30
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matrixSummary), 'Pendency Ageing Matrix');

                // Sheet 6: Disposal Time Matrix (cumulative)
                const dispMatrix = cumulativeDisposalMatrix.map((d: any) => ({
                  'District': d.district,
                  'Within 7 Days (Disposed)': d.within7,
                  'Within 15 Days (Disposed)': d.within15,
                  'Within 30 Days (Disposed)': d.within30,
                  'Above 30 Days (Disposed)': d.above30,
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dispMatrix), 'Disposal Time Matrix');
                
                // Write as binary array and download via Blob to avoid corruption
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Statewide_Dashboard_Report.xlsx';
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

        {sl ? (
          <div className="loading-spinner"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
        ) : (
          <div className="stats-grid">
            <StatCard
              label="Total Received"
              value={(s?.totalReceived || 0).toLocaleString()}
              colorClass="blue"
              onClick={() => navigate(buildCctnsUrl('all'))}
            />
            <StatCard
              label="Total Disposed"
              value={(s?.totalDisposed || 0).toLocaleString()}
              subValue={`${Math.round(((s?.totalDisposed || 0) / (s?.totalReceived || 1)) * 100)}% of Total Received`}
              colorClass="green"
              onClick={() => navigate(buildCctnsUrl('disposed'))}
            />
            <StatCard
              label="Total Pending"
              value={(s?.totalPending || 0).toLocaleString()}
              subValue={`${Math.round(((s?.totalPending || 0) / (s?.totalReceived || 1)) * 100)}% of Total Received`}
              colorClass="red"
              onClick={() => navigate(buildCctnsUrl('pending'))}
            />
            <StatCard
              label="Status Not Found"
              value={(s?.totalUnknown || 0).toLocaleString()}
              subValue="Status was not found in the record"
              colorClass="yellow"
              onClick={() => navigate(buildCctnsUrl('unknown'))}
            />
            <StatCard
              label="Disposal Date Not Found"
              value={(s?.disposedMissingDateCount || 0).toLocaleString()}
              subValue="Marked disposed but date not found"
              colorClass="purple"
              onClick={() => navigate(buildCctnsUrl('disposed_missing_date'))}
            />
          </div>
        )}

        <div className="dashboard-charts-grid">
          <ChartCard
            title={trendChartTitle}
            option={getDurationLineOptions(durations)}
            fullOption={getDurationLineOptions(durations)}
            height="320px"
          />
          {districtViewType === 'graph' ? (
            <ChartCard
              title="Top District Pendency"
              actions={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ViewToggle value={districtViewType} onChange={setDistrictViewType} />
                  <SortDropdown 
                    value={districtSort}
                    onChange={setDistrictSort}
                    options={[
                      { value: 'total', label: 'Total Reg' },
                      { value: 'pending', label: 'Total Pending' },
                      { value: 'disposed', label: 'Total Disposed' },
                      { value: 'total_pct_state', label: 'Total % (from state total)' },
                      { value: 'pending_pct', label: 'Pending % (from district total)' },
                      { value: 'disposed_pct', label: 'Disposed % (from district total)' },
                      { value: 'az', label: 'A → Z' },
                      { value: 'za', label: 'Z → A' },
                    ]}
                  />
                </div>
              }
              option={getDistrictBarOptions(sortedDistricts.slice(0, 7).reverse())}
              fullOption={getDistrictBarOptions([...sortedDistricts].reverse())}
              height="320px"
            />
          ) : (
            <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="chart-card-header">
                <span className="chart-card-title">Top District Pendency</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ViewToggle value={districtViewType} onChange={setDistrictViewType} />
                  <SortDropdown 
                    value={districtSort}
                    onChange={setDistrictSort}
                    options={[
                      { value: 'total', label: 'Total Reg' },
                      { value: 'pending', label: 'Total Pending' },
                      { value: 'disposed', label: 'Total Disposed' },
                      { value: 'total_pct_state', label: 'Total % (from state total)' },
                      { value: 'pending_pct', label: 'Pending % (from district total)' },
                      { value: 'disposed_pct', label: 'Disposed % (from district total)' },
                      { value: 'az', label: 'A → Z' },
                      { value: 'za', label: 'Z → A' },
                    ]}
                  />
                </div>
              </div>
              <div className="chart-card-body" style={{ padding: '0 16px 16px', overflow: 'auto' }}>
                <DataTable
                  data={sortedDistricts}
                  columns={[
                    { key: 'district', label: 'District', sortable: true },
                    { key: 'total', label: 'Total Reg', sortable: true, align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.total}</span> },
                    { key: 'pending', label: 'Pending', sortable: true, align: 'center', render: (row) => <span style={{ color: '#ef4444' }}>{row.pending}</span> },
                    { key: 'disposed', label: 'Disposed', sortable: true, align: 'center', render: (row) => <span style={{ color: '#22c55e' }}>{row.disposed}</span> },
                  ]}
                  maxHeight="300px"
                  onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                />
              </div>
            </div>
          )}
          {categoryViewType === 'graph' ? (
            <ChartCard
              title="Top Classes of Incident"
              actions={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ViewToggle value={categoryViewType} onChange={setCategoryViewType} />
                  <SortDropdown 
                    value={categorySort}
                    onChange={setCategorySort}
                    options={[
                      { value: 'total', label: 'Total Reg' },
                      { value: 'pending', label: 'Total Pending' },
                      { value: 'disposed', label: 'Total Disposed' },
                      { value: 'total_pct_state', label: 'Total % (from state total)' },
                      { value: 'pending_pct', label: 'Pending % (from category total)' },
                      { value: 'disposed_pct', label: 'Disposed % (from category total)' },
                      { value: 'az', label: 'A → Z' },
                      { value: 'za', label: 'Z → A' },
                    ]}
                  />
                </div>
              }
              option={getStackedBarOptions(sortedCategories.slice(0, 5).reverse())}
              fullOption={getStackedBarOptions([...sortedCategories].reverse())}
              height="320px"
            />
          ) : (
            <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="chart-card-header">
                <span className="chart-card-title">Top Classes of Incident</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ViewToggle value={categoryViewType} onChange={setCategoryViewType} />
                  <SortDropdown 
                    value={categorySort}
                    onChange={setCategorySort}
                    options={[
                      { value: 'total', label: 'Total Reg' },
                      { value: 'pending', label: 'Total Pending' },
                      { value: 'disposed', label: 'Total Disposed' },
                      { value: 'total_pct_state', label: 'Total % (from state total)' },
                      { value: 'pending_pct', label: 'Pending % (from category total)' },
                      { value: 'disposed_pct', label: 'Disposed % (from category total)' },
                      { value: 'az', label: 'A → Z' },
                      { value: 'za', label: 'Z → A' },
                    ]}
                  />
                </div>
              </div>
              <div className="chart-card-body" style={{ padding: '0 16px 16px', overflow: 'auto' }}>
                <DataTable
                  data={sortedCategories}
                  columns={[
                    { key: 'category', label: 'Category', sortable: true },
                    { key: 'total', label: 'Total Reg', sortable: true, align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.total}</span> },
                    { key: 'pending', label: 'Pending', sortable: true, align: 'center', render: (row) => <span style={{ color: '#ef4444' }}>{row.pending}</span> },
                    { key: 'disposed', label: 'Disposed', sortable: true, align: 'center', render: (row) => <span style={{ color: '#22c55e' }}>{row.disposed}</span> },
                  ]}
                  maxHeight="300px"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Matrix cards: Pendency + Disposal side by side ─────────────────── */}
        <div className="dashboard-matrices-grid">

          {/* Pendency Ageing Matrix */}
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h2 className="text-lg font-bold text-slate-100">Pendency Ageing Matrix</h2>
              <div style={{ display: 'flex', gap: '4px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '3px', border: '1px solid #334155', flexShrink: 0 }}>
                {(['numbers', 'pct'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setPendencyView(v)}
                    style={{
                      padding: '4px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.18s',
                      backgroundColor: pendencyView === v ? '#3b82f6' : 'transparent',
                      color: pendencyView === v ? '#fff' : '#94a3b8',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v === 'numbers' ? '# Numbers' : '% Percent'}
                  </button>
                ))}
              </div>
            </div>
            {ml ? (
              <div className="text-slate-400">Loading matrix...</div>
            ) : pendencyView === 'numbers' ? (
              <DataTable
                title="Pendency Ageing Matrix"
                data={matrixWithTotal}
                columns={matrixCols.map(c => ({ ...c, render: (row) => renderMatrixDays(c, row) }))}
                onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                maxHeight="400px"
              />
            ) : (
              <DataTable
                title="Pendency Ageing Matrix (%)"
                data={matrixWithPct}
                columns={matrixPctCols.map(c => ({ ...c, render: (row) => renderMatrixPct(c, row) }))}
                onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                maxHeight="400px"
              />
            )}
          </div>

          {/* Disposal Time Matrix */}
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h2 className="text-lg font-bold text-slate-100">Disposal Time Matrix</h2>
              <div style={{ display: 'flex', gap: '4px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '3px', border: '1px solid #334155', flexShrink: 0 }}>
                {(['numbers', 'pct'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDisposalView(v)}
                    style={{
                      padding: '4px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.18s',
                      backgroundColor: disposalView === v ? '#10b981' : 'transparent',
                      color: disposalView === v ? '#fff' : '#94a3b8',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v === 'numbers' ? '# Numbers' : '% Percent'}
                  </button>
                ))}
              </div>
            </div>
            {dml ? (
              <div className="text-slate-400">Loading matrix...</div>
            ) : disposalView === 'numbers' ? (
              <DataTable
                title="Disposal Time Matrix"
                data={cumulativeDisposalMatrix}
                columns={disposalCols.map(c => ({ ...c, render: (row) => renderDisposalDays(c, row) }))}
                onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                maxHeight="400px"
              />
            ) : (
              <DataTable
                title="Disposal Time Matrix (%)"
                data={disposalMatrixWithPct}
                columns={disposalPctCols.map(c => ({ ...c, render: (row) => renderDisposalPct(c, row) }))}
                onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                maxHeight="400px"
              />
            )}
          </div>

        </div>
      </div>
    </Layout>
  );
};

export default DashboardPage;
