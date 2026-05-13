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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faSyncAlt, faDatabase } from '@fortawesome/free-solid-svg-icons';

const StatCard = ({ label, value, subValue, detail, colorClass, onClick }: { label: string; value: string | number; subValue?: string; detail?: React.ReactNode; colorClass: string; onClick?: () => void }) => (
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
    {subValue && <div className="stat-card-sub">{subValue}</div>}
    {detail && <div className="stat-card-detail">{detail}</div>}
{onClick && (
      <div className="stat-card-click">
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseLeave = () => {
    if (isMobile) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 200);
  };

  const handleMouseEnter = () => {
    if (isMobile) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(prev => !prev);
  };

  return (
    <div 
      style={{ position: 'relative' }} 
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button 
        className="chart-expand-btn"
        title="Sort Options"
        onClick={handleClick}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
          <line x1="10" y1="18" x2="14" y2="18"></line>
        </svg>
      </button>
      {open && (
        <div 
          style={{
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
          }}
          onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          onMouseLeave={() => { }}
        >
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
  <div className="view-toggle-container">
    <button 
      className={`view-toggle-btn ${value === 'graph' ? 'active' : ''}`}
      onClick={() => onChange('graph')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
      Graph
    </button>
    <button 
      className={`view-toggle-btn ${value === 'table' ? 'active' : ''}`}
      onClick={() => onChange('table')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
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

  // Build URL for class of incident navigation to Database Gateway
  const buildCategoryCctnsUrl = (category: string, statusGroupFilter?: string) => {
    const params = new URLSearchParams();
    // Only set statusGroup if specifically provided (for filtering by specific status)
    if (statusGroupFilter) {
      params.set('statusGroup', statusGroupFilter);
      console.log('[Dashboard] Building URL with statusGroup:', statusGroupFilter, 'for category:', category);
    } else {
      console.log('[Dashboard] Building URL WITHOUT statusGroup for category:', category);
    }
    if (filters.districtIds)      params.set('districtIds',      filters.districtIds);
    if (filters.policeStationIds) params.set('policeStationIds', filters.policeStationIds);
    if (filters.officeIds)        params.set('officeIds',        filters.officeIds);
    if (filters.fromDate)         params.set('fromDate',         filters.fromDate);
    if (filters.toDate)           params.set('toDate',           filters.toDate);
    // Set class of incident filter - handle 'Unmapped' specially
    const classValue = category === 'Unmapped' ? 'Unmapped' : category;
    params.set('classOfIncident', classValue);
    const url = `/admin/cctns?${params.toString()}`;
    console.log('[Dashboard] Generated URL:', url);
    return url;
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
  const [districtTableSort, setDistrictTableSort] = useState<{ key: string; dir: 'asc' | 'desc' | null } | null>(null);
  const [categoryTableSort, setCategoryTableSort] = useState<{ key: string; dir: 'asc' | 'desc' | null } | null>(null);
  const [pendencyMatrixSort, setPendencyMatrixSort] = useState<{ key: string; dir: 'asc' | 'desc' | null } | null>(null);
  const [disposalMatrixSort, setDisposalMatrixSort] = useState<{ key: string; dir: 'asc' | 'desc' | null } | null>(null);

  const handleDistrictViewChange = (newType: 'graph' | 'table') => {
    if (newType === 'graph') {
      setDistrictTableSort(null);
    }
    setDistrictViewType(newType);
  };

  const handleCategoryViewChange = (newType: 'graph' | 'table') => {
    if (newType === 'graph') {
      setCategoryTableSort(null);
    }
    setCategoryViewType(newType);
  };

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

  const districtSortOptions = [
    { value: 'total', label: 'By Total' },
    { value: 'pending', label: 'By Pending' },
    { value: 'disposed', label: 'By Disposed' },
    { value: 'total_pct_state', label: 'By Total %' },
    { value: 'pending_pct', label: 'By Pending %' },
    { value: 'disposed_pct', label: 'By Disposed %' },
    { value: 'az', label: 'A → Z' },
    { value: 'za', label: 'Z → A' },
  ];
  const districtSortLabel = districtSortOptions.find(o => o.value === districtSort)?.label || 'By Total';

  const categorySortOptions = [
    { value: 'total', label: 'By Total' },
    { value: 'pending', label: 'By Pending' },
    { value: 'disposed', label: 'By Disposed' },
    { value: 'total_pct_state', label: 'By Total %' },
    { value: 'pending_pct', label: 'By Pending %' },
    { value: 'disposed_pct', label: 'By Disposed %' },
    { value: 'az', label: 'A → Z' },
    { value: 'za', label: 'Z → A' },
  ];
  const categorySortLabel = categorySortOptions.find(o => o.value === categorySort)?.label || 'By Total';

  const districtColumns = [
    { key: 'district', label: 'District' },
    { key: 'total', label: 'Total Reg' },
    { key: 'pending', label: 'Pending' },
    { key: 'pending_pct', label: 'Pending %' },
    { key: 'disposed', label: 'Disposed' },
    { key: 'disposed_pct', label: 'Disposed %' },
    { key: 'unknown', label: 'Status NF' },
    { key: 'unknown_pct', label: 'Status NF %' },
  ];

  const categoryColumns = [
    { key: 'category', label: 'Class of Incident' },
    { key: 'total', label: 'Total Reg' },
    { key: 'pending', label: 'Pending' },
    { key: 'pending_pct', label: 'Pending %' },
    { key: 'disposed', label: 'Disposed' },
    { key: 'disposed_pct', label: 'Disposed %' },
  ];

  const getDistrictSubtitle = () => {
    if (districtViewType === 'table' && districtTableSort && districtTableSort.key) {
      const col = districtColumns.find(c => c.key === districtTableSort.key);
      const dirArrow = districtTableSort.dir === 'asc' ? '↑' : districtTableSort.dir === 'desc' ? '↓' : '';
      return `sorted by ${col?.label || districtTableSort.key} ${dirArrow}`;
    }
    return `sorted by ${districtSortLabel} ↓`;
  };

  const getCategorySubtitle = () => {
    if (categoryViewType === 'table' && categoryTableSort && categoryTableSort.key) {
      const col = categoryColumns.find(c => c.key === categoryTableSort.key);
      const dirArrow = categoryTableSort.dir === 'asc' ? '↑' : categoryTableSort.dir === 'desc' ? '↓' : '';
      return `sorted by ${col?.label || categoryTableSort.key} ${dirArrow}`;
    }
    return `sorted by ${categorySortLabel} ↓`;
  };

  const getPendencyMatrixSubtitle = () => {
    if (pendencyMatrixSort && pendencyMatrixSort.key) {
      const col = matrixCols.find(c => c.key === pendencyMatrixSort.key);
      const dirArrow = pendencyMatrixSort.dir === 'asc' ? '↑' : pendencyMatrixSort.dir === 'desc' ? '↓' : '';
      return `sorted by ${col?.label || pendencyMatrixSort.key} ${dirArrow}`;
    }
    return 'sorted by default';
  };

  const getDisposalMatrixSubtitle = () => {
    if (disposalMatrixSort && disposalMatrixSort.key) {
      const col = matrixCols.find(c => c.key === disposalMatrixSort.key);
      const dirArrow = disposalMatrixSort.dir === 'asc' ? '↑' : disposalMatrixSort.dir === 'desc' ? '↓' : '';
      return `sorted by ${col?.label || disposalMatrixSort.key} ${dirArrow}`;
    }
    return 'sorted by default';
  };

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

  const disposalMatrixWithPct = disposalMatrix.map((row: any) => {
    const withDate    = row.total || 0;
    const withoutDate = row.missingDates || 0;
    const totalDisposed = withDate + withoutDate;
    return {
      ...row,
      total: withDate,
      pct_total:   totalDisposed > 0 ? Math.round(withDate    * 100 / totalDisposed) : 0,
      pct_missing: totalDisposed > 0 ? Math.round(withoutDate * 100 / totalDisposed) : 0,
      pct_u7:  withDate > 0 ? Math.round((row.u7  || 0) * 100 / withDate) : 0,
      pct_u15: withDate > 0 ? Math.round((row.u15 || 0) * 100 / withDate) : 0,
      pct_u30: withDate > 0 ? Math.round((row.u30 || 0) * 100 / withDate) : 0,
      pct_o30: withDate > 0 ? Math.round((row.o30 || 0) * 100 / withDate) : 0,
      pct_o60: withDate > 0 ? Math.round((row.o60 || 0) * 100 / withDate) : 0,
    };
  });

  const disposalCols: Column<any>[] = [
    { key: 'district',  label: 'District',          sortable: true },
    { key: 'total',     label: 'With Date',         sortable: true, align: 'center' },
    { key: 'missingDates', label: 'Date Not Found', sortable: true, align: 'center' },
    { key: 'u7',        label: '<7 Days',           sortable: true, align: 'center' },
    { key: 'u15',       label: '7-15 Days',         sortable: true, align: 'center' },
    { key: 'u30',       label: '15-30 Days',        sortable: true, align: 'center' },
    { key: 'o30',       label: '1-2 Months',        sortable: true, align: 'center' },
    { key: 'o60',       label: 'Over 2 Months',     sortable: true, align: 'center' },
  ];

  const renderDisposalDays = (col: any, row: any) => {
    if (col.key === 'district')    return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.district}</span>;
    if (col.key === 'total')       return <span style={{ fontWeight: 600, color: '#4ade80' }}>{row.total}</span>;
    if (col.key === 'missingDates') return <span style={{ fontWeight: 600, color: '#fbbf24' }}>{row.missingDates || 0}</span>;
    if (col.key === 'u7')  return <span style={{ color: '#4ade80' }}>{row.u7}</span>;
    if (col.key === 'u15') return <span style={{ color: '#a3e635' }}>{row.u15}</span>;
    if (col.key === 'u30') return <span style={{ color: '#eab308' }}>{row.u30}</span>;
    if (col.key === 'o30') return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{row.o30}</span>;
    if (col.key === 'o60') return <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>{row.o60 || 0}</span>;
    return row[col.key];
  };

  const disposalPctCols: Column<any>[] = [
    { key: 'district',    label: 'District',          sortable: true },
    { key: 'pct_total',   label: 'With Date',        sortable: true, align: 'center' },
    { key: 'pct_missing', label: 'Date Not Found',   sortable: true, align: 'center' },
    { key: 'pct_u7',      label: '<7 Days',         sortable: true, align: 'center' },
    { key: 'pct_u15',     label: '7-15 Days',       sortable: true, align: 'center' },
    { key: 'pct_u30',     label: '15-30 Days',       sortable: true, align: 'center' },
    { key: 'pct_o30',     label: '1-2 Months',        sortable: true, align: 'center' },
    { key: 'pct_o60',     label: 'Over 2 Months',    sortable: true, align: 'center' },
  ];

  const renderDisposalPct = (col: any, row: any) => {
    if (col.key === 'district')    return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{row.district}</span>;
    if (col.key === 'pct_total')   return <span style={{ fontWeight: 600, color: '#4ade80' }}>{row.pct_total}%</span>;
    if (col.key === 'pct_missing') return <span style={{ fontWeight: 600, color: '#fbbf24' }}>{row.pct_missing || 0}%</span>;
    if (col.key === 'pct_u7')  return <span style={{ color: '#4ade80' }}>{row.pct_u7}%</span>;
    if (col.key === 'pct_u15') return <span style={{ color: '#a3e635' }}>{row.pct_u15}%</span>;
    if (col.key === 'pct_u30') return <span style={{ color: '#eab308' }}>{row.pct_u30}%</span>;
    if (col.key === 'pct_o30') return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{row.pct_o30}%</span>;
    if (col.key === 'pct_o60') return <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>{row.pct_o60 || 0}%</span>;
    return row[col.key];
  };

  return (
    <Layout>
      <div className="page-content space-y-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '8px' }}>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Executive Overview</h1>
            <div className="text-sm text-slate-300 mt-2 dashboard-info-items">
              <div className="info-item">
                <FontAwesomeIcon icon={faCalendarAlt} className="info-icon text-blue-400" />
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
                <div className="info-item">
                  <FontAwesomeIcon icon={faSyncAlt} className={`info-icon ${s.failedSyncCount > 0 ? 'text-yellow-400' : 'text-green-400'}`} />
                  <span className="font-medium text-slate-200">Last Successful Sync:</span>
                  <span title="Last time data was successfully synced from CCTNS to database">
                    {new Date(s.lastSyncTime).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                  {s.failedSyncCount > 0 && (
                    <span className="text-red-400 text-xs ml-1" title={`${s.failedSyncCount} sync attempts failed in the last 7 days`}>
                      ({s.failedSyncCount} failed)
                    </span>
                  )}
                </div>
              )}

              {s?.lastFailedSyncTime && !s?.lastSyncTime && (
                <div className="info-item">
                  <FontAwesomeIcon icon={faSyncAlt} className="info-icon text-red-400" />
                  <span className="font-medium text-slate-200">Last Sync Attempt:</span>
                  <span className="text-red-400" title="Last sync attempt failed">
                    {new Date(s.lastFailedSyncTime).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })} - Failed
                  </span>
                </div>
              )}
              
              {s?.dbMinDate && s?.dbMaxDate && (
                <div className="info-item">
                  <FontAwesomeIcon icon={faDatabase} className="info-icon text-purple-400" />
                  <span className="font-medium text-slate-200">DB Data:</span>
                  <span title="Complaint registration dates in database">
                    {new Date(s.dbMinDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} to {new Date(s.dbMaxDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {s.lastSyncTime && new Date(s.dbMaxDate) > new Date(s.lastSyncTime) && (
                    <span className="text-yellow-400 ml-1" title="Data extends beyond last successful sync - may include complaints registered before last sync that were imported later">
                      ⚠
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="dashboard-export-buttons">
            <button 
              className="btn-primary dashboard-export-btn" 
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

                // Sheet 6: Disposal Time Matrix
                const dispMatrix = disposalMatrix.map((d: any) => ({
                  'District': d.district,
                  'With Date': d.total || 0,
                  'Date Not Found': d.missingDates || 0,
                  '< 7 Days': d.u7,
                  '7-15 Days': d.u15,
                  '15-30 Days': d.u30,
                  '1-2 Months': d.o30,
                  'Over 2 Months': d.o60,
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
              className="btn-primary dashboard-export-btn" 
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
              subValue={`${Math.round(((s?.totalDisposed || 0) / (s?.totalReceived || 1)) * 100)}% of Total`}
              detail={
                <>
                  <span className="with-date">{((s?.totalDisposed || 0) - (s?.disposedMissingDateCount || 0)).toLocaleString()} with date</span>
                  <span style={{ color: '#000000' }}>|</span>
                  <span className="without-date">{(s?.disposedMissingDateCount || 0).toLocaleString()} without date</span>
                </>
              }
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
              subValue={`${Math.round(((s?.disposedMissingDateCount || 0) / (s?.totalReceived || 1)) * 100)}% of Total Received`}
              colorClass="purple"
              onClick={() => navigate(buildCctnsUrl('disposed_missing_date'))}
            />
            <StatCard
              label="Avg. Disposal Time"
              value={`${s?.avgDisposalTime || 0} Days`}
              subValue="Only for records where date was found"
              colorClass="teal"
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
              subtitle={getDistrictSubtitle()}
              option={getDistrictBarOptions(sortedDistricts.slice(0, 7).reverse())}
              fullOption={getDistrictBarOptions([...sortedDistricts].reverse())}
              height="320px"
              actions={
                <div className="chart-actions">
                  <ViewToggle value={districtViewType} onChange={handleDistrictViewChange} />
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
            />
          ) : (
            <ChartCard
              title="Top District Pendency"
              subtitle={getDistrictSubtitle()}
              actions={
                <div className="chart-actions">
                  <ViewToggle value={districtViewType} onChange={handleDistrictViewChange} />
                </div>
              }
            >
              <DataTable
                data={sortedDistricts}
                columns={[
                  { key: 'district', label: 'District', sortable: true },
                  { key: 'total', label: 'Total Reg', sortable: true, align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.total}</span> },
                  { key: 'pending', label: 'Pending', sortable: true, align: 'center', render: (row) => <span style={{ color: '#ef4444' }}>{row.pending}</span> },
                  { key: 'pending_pct', label: 'Pending %', sortable: true, align: 'center', render: (row) => <span style={{ color: '#dc2626', fontWeight: 600, display: 'inline-block', minWidth: '45px' }}>{row.pending_pct?.toFixed(1)}%</span> },
                  { key: 'disposed', label: 'Disposed', sortable: true, align: 'center', render: (row) => <span style={{ color: '#16a34a' }}>{row.disposed}</span> },
                  { key: 'disposed_pct', label: 'Disposed %', sortable: true, align: 'center', render: (row) => <span style={{ color: '#16a34a', fontWeight: 600, display: 'inline-block', minWidth: '45px' }}>{row.disposed_pct?.toFixed(1)}%</span> },
                  { key: 'unknown', label: 'Status NF', sortable: true, align: 'center', render: (row) => <span style={{ color: '#64748b' }}>{row.unknown || 0}</span> },
                  { key: 'unknown_pct', label: 'Status NF %', sortable: true, align: 'center', render: (row) => <span style={{ color: '#64748b', fontWeight: 600, display: 'inline-block', minWidth: '45px' }}>{row.unknown_pct?.toFixed(1)}%</span> },
                ]}
                maxHeight="300px"
                onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                noExpand={true}
                hideTitleBar={true}
                onSort={(key, dir) => key ? setDistrictTableSort({ key, dir }) : setDistrictTableSort(null)}
                showTotalRow={true}
                getTotalRow={(data) => {
                  const totals = data.reduce((acc, r) => ({
                    total: acc.total + Number(r.total || 0),
                    pending: acc.pending + Number(r.pending || 0),
                    disposed: acc.disposed + Number(r.disposed || 0),
                    unknown: acc.unknown + Number(r.unknown || 0),
                  }), { total: 0, pending: 0, disposed: 0, unknown: 0 });
                  const grandTotal = totals.total || 1;
                  return {
                    district: '',
                    total: totals.total.toLocaleString(),
                    pending: totals.pending.toLocaleString(),
                    pending_pct: ((totals.pending / grandTotal) * 100).toFixed(1) + '%',
                    disposed: totals.disposed.toLocaleString(),
                    disposed_pct: ((totals.disposed / grandTotal) * 100).toFixed(1) + '%',
                    unknown: totals.unknown.toLocaleString(),
                    unknown_pct: ((totals.unknown / grandTotal) * 100).toFixed(1) + '%',
                  };
                }}
              />
            </ChartCard>
          )}
          {categoryViewType === 'graph' ? (
            <ChartCard
              title="Top Classes of Incident"
              subtitle={getCategorySubtitle()}
              actions={
                <div className="chart-actions">
                  <ViewToggle value={categoryViewType} onChange={handleCategoryViewChange} />
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
            <ChartCard
              title="Top Classes of Incident"
              subtitle={getCategorySubtitle()}
              actions={
                <div className="chart-actions">
                  <ViewToggle value={categoryViewType} onChange={handleCategoryViewChange} />
                </div>
              }
            >
              <DataTable
                data={sortedCategories}
                columns={[
                  { key: 'category', label: 'Class of Incident', sortable: true },
                  { 
                    key: 'total', 
                    label: 'Total Reg', 
                    sortable: true, 
                    align: 'center', 
                    render: (row) => {
                      const url = buildCategoryCctnsUrl(row.category);
                      return <span style={{ fontWeight: 600, cursor: 'pointer', color: '#60a5fa' }} onClick={(e) => { e.stopPropagation(); navigate(url); }}>{row.total}</span>;
                    }
                  },
                  { 
                    key: 'pending', 
                    label: 'Pending', 
                    sortable: true, 
                    align: 'center', 
                    render: (row) => {
                      const url = buildCategoryCctnsUrl(row.category, 'pending');
                      return <span style={{ cursor: 'pointer', color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); navigate(url); }}>{row.pending}</span>;
                    }
                  },
                  { key: 'pending_pct', label: 'Pending %', sortable: true, align: 'center', render: (row) => <span style={{ color: '#dc2626', fontWeight: 600, display: 'inline-block', minWidth: '45px' }}>{row.pending_pct?.toFixed(1)}%</span> },
                  { 
                    key: 'disposed', 
                    label: 'Disposed', 
                    sortable: true, 
                    align: 'center', 
                    render: (row) => {
                      const url = buildCategoryCctnsUrl(row.category, 'disposed');
                      return <span style={{ cursor: 'pointer', color: '#16a34a' }} onClick={(e) => { e.stopPropagation(); navigate(url); }}>{row.disposed}</span>;
                    }
                  },
                  { key: 'disposed_pct', label: 'Disposed %', sortable: true, align: 'center', render: (row) => <span style={{ color: '#16a34a', fontWeight: 600, display: 'inline-block', minWidth: '45px' }}>{row.disposed_pct?.toFixed(1)}%</span> },
                  { 
                    key: 'unknown', 
                    label: 'Status NF', 
                    sortable: true, 
                    align: 'center', 
                    render: (row) => {
                      const url = buildCategoryCctnsUrl(row.category, 'unknown');
                      return <span style={{ cursor: 'pointer', color: '#64748b' }} onClick={(e) => { e.stopPropagation(); navigate(url); }}>{row.unknown || 0}</span>;
                    }
                  },
                  { key: 'unknown_pct', label: 'Status NF %', sortable: true, align: 'center', render: (row) => <span style={{ color: '#64748b', fontWeight: 600, display: 'inline-block', minWidth: '45px' }}>{row.unknown_pct?.toFixed(1)}%</span> },
                ]}
                maxHeight="300px"
                onRowClick={(row) => navigate(buildCategoryCctnsUrl(row.category))}
                noExpand={true}
                hideTitleBar={true}
                onSort={(key, dir) => key ? setCategoryTableSort({ key, dir }) : setCategoryTableSort(null)}
                showTotalRow={true}
                getTotalRow={(data) => {
                  const totals = data.reduce((acc, r) => ({
                    total: acc.total + Number(r.total || 0),
                    pending: acc.pending + Number(r.pending || 0),
                    disposed: acc.disposed + Number(r.disposed || 0),
                    unknown: acc.unknown + Number(r.unknown || 0),
                  }), { total: 0, pending: 0, disposed: 0, unknown: 0 });
                  const grandTotal = totals.total || 1;
                  return {
                    category: '',
                    total: totals.total.toLocaleString(),
                    pending: totals.pending.toLocaleString(),
                    pending_pct: ((totals.pending / grandTotal) * 100).toFixed(1) + '%',
                    disposed: totals.disposed.toLocaleString(),
                    disposed_pct: ((totals.disposed / grandTotal) * 100).toFixed(1) + '%',
                    unknown: totals.unknown.toLocaleString(),
                    unknown_pct: ((totals.unknown / grandTotal) * 100).toFixed(1) + '%',
                  };
                }}
              />
            </ChartCard>
          )}
        </div>

        {/* ── Matrix cards: Pendency + Disposal side by side ─────────────────── */}
        <div className="dashboard-matrices-grid">

          {/* Pendency Ageing Matrix */}
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Pendency Ageing Matrix</h2>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{getPendencyMatrixSubtitle()}</span>
              </div>
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
                onSort={(key, dir) => key ? setPendencyMatrixSort({ key, dir }) : setPendencyMatrixSort(null)}
                showTotalRow={true}
                getTotalRow={(data) => {
                  const totals = data.reduce<Record<string, number>>((acc, r) => ({
                    total: acc.total + Number(r.total || 0),
                    u7: acc.u7 + Number(r.u7 || 0),
                    u15: acc.u15 + Number(r.u15 || 0),
                    u30: acc.u30 + Number(r.u30 || 0),
                    o30: acc.o30 + Number(r.o30 || 0),
                    o60: acc.o60 + Number(r.o60 || 0),
                  }), { total: 0, u7: 0, u15: 0, u30: 0, o30: 0, o60: 0 });
                  return {
                    district: '',
                    total: totals.total.toLocaleString(),
                    u7: totals.u7.toLocaleString(),
                    u15: totals.u15.toLocaleString(),
                    u30: totals.u30.toLocaleString(),
                    o30: totals.o30.toLocaleString(),
                    o60: totals.o60.toLocaleString(),
                  };
                }}
              />
            ) : (
              <DataTable
                title="Pendency Ageing Matrix (%)"
                data={matrixWithPct}
                columns={matrixPctCols.map(c => ({ ...c, render: (row) => renderMatrixPct(c, row) }))}
                onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                maxHeight="400px"
                onSort={(key, dir) => key ? setPendencyMatrixSort({ key, dir }) : setPendencyMatrixSort(null)}
                showTotalRow={true}
                getTotalRow={(data) => {
                  const totals = data.reduce<Record<string, number>>((acc, r) => ({
                    pct_total: acc.pct_total + Number(r.pct_total || 0),
                    pct_u7: acc.pct_u7 + Number(r.pct_u7 || 0),
                    pct_u15: acc.pct_u15 + Number(r.pct_u15 || 0),
                    pct_u30: acc.pct_u30 + Number(r.pct_u30 || 0),
                    pct_o30: acc.pct_o30 + Number(r.pct_o30 || 0),
                    pct_o60: acc.pct_o60 + Number(r.pct_o60 || 0),
                  }), { pct_total: 0, pct_u7: 0, pct_u15: 0, pct_u30: 0, pct_o30: 0, pct_o60: 0 });
                  const count = data.length || 1;
                  return {
                    district: '',
                    pct_total: (totals.pct_total / count).toFixed(1) + '%',
                    pct_u7: (totals.pct_u7 / count).toFixed(1) + '%',
                    pct_u15: (totals.pct_u15 / count).toFixed(1) + '%',
                    pct_u30: (totals.pct_u30 / count).toFixed(1) + '%',
                    pct_o30: (totals.pct_o30 / count).toFixed(1) + '%',
                    pct_o60: (totals.pct_o60 / count).toFixed(1) + '%',
                  };
                }}
              />
            )}
          </div>

          {/* Disposal Time Matrix */}
          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Disposal Time Matrix</h2>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{getDisposalMatrixSubtitle()}</span>
              </div>
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
                data={disposalMatrixWithPct}
                columns={disposalCols.map(c => ({ ...c, render: (row) => renderDisposalDays(c, row) }))}
                onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                maxHeight="400px"
                onSort={(key, dir) => key ? setDisposalMatrixSort({ key, dir }) : setDisposalMatrixSort(null)}
                showTotalRow={true}
                getTotalRow={(data) => {
                  const totals = data.reduce<Record<string, number>>((acc, r) => ({
                    total: acc.total + Number(r.total || 0),
                    missingDates: acc.missingDates + Number(r.missingDates || 0),
                    u7: acc.u7 + Number(r.u7 || 0),
                    u15: acc.u15 + Number(r.u15 || 0),
                    u30: acc.u30 + Number(r.u30 || 0),
                    o30: acc.o30 + Number(r.o30 || 0),
                    o60: acc.o60 + Number(r.o60 || 0),
                  }), { total: 0, missingDates: 0, u7: 0, u15: 0, u30: 0, o30: 0, o60: 0 });
                  return {
                    district: '',
                    total: totals.total.toLocaleString(),
                    missingDates: totals.missingDates.toLocaleString(),
                    u7: totals.u7.toLocaleString(),
                    u15: totals.u15.toLocaleString(),
                    u30: totals.u30.toLocaleString(),
                    o30: totals.o30.toLocaleString(),
                    o60: totals.o60.toLocaleString(),
                  };
                }}
              />
            ) : (
              <DataTable
                title="Disposal Time Matrix (%)"
                data={disposalMatrixWithPct}
                columns={disposalPctCols.map(c => ({ ...c, render: (row) => renderDisposalPct(c, row) }))}
                onRowClick={(row) => navigate(`/admin/district/${encodeURIComponent(String(row.district))}`)}
                maxHeight="400px"
                onSort={(key, dir) => key ? setDisposalMatrixSort({ key, dir }) : setDisposalMatrixSort(null)}
                showTotalRow={true}
                getTotalRow={(data) => {
                  const totals = data.reduce<Record<string, number>>((acc, r) => ({
                    pct_total: acc.pct_total + Number(r.pct_total || 0),
                    pct_missing: acc.pct_missing + Number(r.pct_missing || 0),
                    pct_u7: acc.pct_u7 + Number(r.pct_u7 || 0),
                    pct_u15: acc.pct_u15 + Number(r.pct_u15 || 0),
                    pct_u30: acc.pct_u30 + Number(r.pct_u30 || 0),
                    pct_o30: acc.pct_o30 + Number(r.pct_o30 || 0),
                    pct_o60: acc.pct_o60 + Number(r.pct_o60 || 0),
                  }), { pct_total: 0, pct_missing: 0, pct_u7: 0, pct_u15: 0, pct_u30: 0, pct_o30: 0, pct_o60: 0 });
                  const count = data.length || 1;
                  return {
                    district: '',
                    pct_total: (totals.pct_total / count).toFixed(1) + '%',
                    pct_missing: (totals.pct_missing / count).toFixed(1) + '%',
                    pct_u7: (totals.pct_u7 / count).toFixed(1) + '%',
                    pct_u15: (totals.pct_u15 / count).toFixed(1) + '%',
                    pct_u30: (totals.pct_u30 / count).toFixed(1) + '%',
                    pct_o30: (totals.pct_o30 / count).toFixed(1) + '%',
                    pct_o60: (totals.pct_o60 / count).toFixed(1) + '%',
                  };
                }}
              />
            )}
          </div>

        </div>
      </div>
    </Layout>
  );
};

export default DashboardPage;
