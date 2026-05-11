import { useState, useRef, useEffect, useMemo } from 'react';
import { useFilters } from '../../contexts/FilterContext';
import { useQuery } from '@tanstack/react-query';
import { referenceApi } from '../../services/api';

type Option = {
  id: string;
  label: string;
};

const parseCsv = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const MultiSelectDropdown = ({
  isOpen,
  toggle,
  allLabel,
  selectedIds,
  items,
  onAllClick,
  onToggleItem,
  disabled,
  disabledHint,
}: {
  isOpen: boolean;
  toggle: () => void;
  allLabel: string;
  selectedIds: string[];
  items: Option[];
  onAllClick: () => void;
  onToggleItem: (id: string) => void;
  disabled?: boolean;
  disabledHint?: string;
}) => {
  const [searchText, setSearchText] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when dropdown opens; reset search when it closes
  useEffect(() => {
    if (isOpen) {
      setSearchText('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return q ? items.filter(item => item.label.toLowerCase().includes(q)) : items;
  }, [items, searchText]);

  const selectedLabels = items
    .filter((item) => selectedIds.includes(item.id))
    .map((item) => item.label);

  const displayText = disabled
    ? (disabledHint ?? allLabel)
    : selectedIds.length === 0
      ? allLabel
      : selectedIds.length === 1
        ? selectedLabels[0] || `${selectedIds.length} Selected`
        : `${selectedIds.length} Selected`;

  return (
    <>
      <select
        className="filter-input"
        value="__custom__"
        onClick={(e) => {
          if (disabled) return;
          e.preventDefault();
          toggle();
        }}
        onMouseDown={(e) => e.preventDefault()}
        onChange={() => {}}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          minWidth: '100px',
          opacity: disabled ? 0.5 : 1,
        }}
        title={disabled ? (disabledHint ?? '') : ''}
      >
        <option value="__custom__">{displayText}</option>
      </select>

      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '2px',
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 9999,
            minWidth: '220px',
          }}
        >
          {/* ── Sticky search box ── */}
          <div style={{
            padding: '6px 8px',
            borderBottom: '1px solid #1e293b',
            position: 'sticky',
            top: 0,
            backgroundColor: '#0f172a',
            zIndex: 1,
          }}>
            <input
              ref={searchRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search..."
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '4px',
                color: '#e2e8f0',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* ── Scrollable list ── */}
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {/* "All" option — only visible when no search is active */}
            {!searchText && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#e2e8f0',
                  borderBottom: '1px solid #1e293b',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <input type="checkbox" checked={selectedIds.length === 0} onChange={onAllClick} style={{ accentColor: '#3b82f6' }} />
                {allLabel}
              </label>
            )}

            {filteredItems.length === 0 ? (
              <div style={{ padding: '10px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
                No results for &ldquo;{searchText}&rdquo;
              </div>
            ) : (
              filteredItems.map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#e2e8f0',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => onToggleItem(item.id)}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  {item.label}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
};

export const GlobalFilterBar = () => {
  const { filters, setFilter, resetFilters } = useFilters();
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  const [stationDropdownOpen,  setStationDropdownOpen]  = useState(false);
  const [officeDropdownOpen,   setOfficeDropdownOpen]   = useState(false);
  const [classDropdownOpen,    setClassDropdownOpen]    = useState(false);

  const districtRef = useRef<HTMLDivElement>(null);
  const stationRef  = useRef<HTMLDivElement>(null);
  const officeRef   = useRef<HTMLDivElement>(null);
  const classRef    = useRef<HTMLDivElement>(null);

  // Close all dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (districtRef.current && !districtRef.current.contains(event.target as Node)) setDistrictDropdownOpen(false);
      if (stationRef.current  && !stationRef.current.contains(event.target as Node))  setStationDropdownOpen(false);
      if (officeRef.current   && !officeRef.current.contains(event.target as Node))   setOfficeDropdownOpen(false);
      if (classRef.current    && !classRef.current.contains(event.target as Node))    setClassDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedDistrictIds = parseCsv(filters.districtIds);
  const selectedStationIds  = parseCsv(filters.policeStationIds);
  const selectedOfficeIds   = parseCsv(filters.officeIds);
  const selectedClassValues = parseCsv(filters.classOfIncident);

  const toggleCsvValue = (selected: string[], value: string) =>
    selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];

  // ── Reference data queries (hierarchically cascaded) ──────────────────────

  const { data: districts } = useQuery({
    queryKey: ['filter-districts'],
    queryFn: () => referenceApi.districts(),
    staleTime: 10 * 60 * 1000,
  });

  // Police stations: only load PS from selected districts (if any)
  const { data: policeStations, isFetching: psFetching } = useQuery({
    queryKey: ['filter-police-stations', filters.districtIds],
    queryFn: () => referenceApi.policeStations(filters.districtIds || undefined),
    staleTime: 5 * 60 * 1000,
  });

  // Offices: derive from complaint data scoped to selected district + PS
  // Falls back to all offices when no district/PS is selected
  const { data: offices, isFetching: officeFetching } = useQuery({
    queryKey: ['filter-offices', filters.districtIds, filters.policeStationIds],
    queryFn: () =>
      referenceApi.offices({
        districtIds:      filters.districtIds      || undefined,
        policeStationIds: filters.policeStationIds || undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: classes } = useQuery({
    queryKey: ['filter-class-of-incident'],
    queryFn: () => referenceApi.crimeCategory(),
    staleTime: 10 * 60 * 1000,
  });

  // ── Option lists ───────────────────────────────────────────────────────────

  const districtOptions = useMemo<Option[]>(
    () => (districts?.data || []).map((d: any) => ({ id: String(d.id), label: String(d.name) })),
    [districts]
  );

  const stationOptions = useMemo<Option[]>(
    () => (policeStations?.data || []).map((ps: any) => ({ id: String(ps.id), label: String(ps.name) })),
    [policeStations]
  );

  const officeOptions = useMemo<Option[]>(
    () => (offices?.data || []).map((o: any) => ({ id: String(o.id), label: String(o.name) })),
    [offices]
  );

  const classOptions = useMemo<Option[]>(
    () => (classes?.data || []).filter(Boolean).map((value: string) => ({ id: value, label: value })),
    [classes]
  );

  // ── Cascade cleanup: prune selections that are no longer valid ─────────────

  // When district changes → prune any PS not in the new station list
  useEffect(() => {
    if (selectedStationIds.length === 0) return;
    const valid = new Set(stationOptions.map((item) => item.id));
    const pruned = selectedStationIds.filter((id) => valid.has(id));
    if (pruned.length !== selectedStationIds.length) {
      setFilter('policeStationIds', pruned.join(','));
    }
  }, [filters.districtIds, stationOptions]);   // eslint-disable-line react-hooks/exhaustive-deps

  // When district or PS changes → prune offices not in the new office list
  useEffect(() => {
    if (selectedOfficeIds.length === 0) return;
    const valid = new Set(officeOptions.map((item) => item.id));
    const pruned = selectedOfficeIds.filter((id) => valid.has(id));
    if (pruned.length !== selectedOfficeIds.length) {
      setFilter('officeIds', pruned.join(','));
    }
  }, [filters.districtIds, filters.policeStationIds, officeOptions]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────
  const closeAll = () => {
    setDistrictDropdownOpen(false);
    setStationDropdownOpen(false);
    setOfficeDropdownOpen(false);
    setClassDropdownOpen(false);
  };

  return (
    <div className="global-filter-bar">

      {/* Date Range */}
      <div className="filter-group">
        <label>Date Range</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => setFilter('fromDate', e.target.value)}
            onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()}
            className="filter-input"
            style={{ cursor: 'pointer' }}
          />
          <span style={{ color: '#94a3b8' }}>-</span>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => setFilter('toDate', e.target.value)}
            onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()}
            className="filter-input"
            style={{ cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* District (always fully loaded) */}
      <div className="filter-group" ref={districtRef} style={{ position: 'relative' }}>
        <label>District</label>
        <MultiSelectDropdown
          isOpen={districtDropdownOpen}
          toggle={() => { closeAll(); setDistrictDropdownOpen((v) => !v); }}
          allLabel="All Districts"
          selectedIds={selectedDistrictIds}
          items={districtOptions}
          onAllClick={() => {
            setFilter('districtIds', '');
            // Clearing district cascades down: clear PS + Office too
            setFilter('policeStationIds', '');
            setFilter('officeIds', '');
          }}
          onToggleItem={(id) => setFilter('districtIds', toggleCsvValue(selectedDistrictIds, id).join(','))}
        />
      </div>

      {/* Police Station (scoped to selected district) */}
      <div className="filter-group" ref={stationRef} style={{ position: 'relative' }}>
        <label>
          Police Station
          {psFetching && <span style={{ marginLeft: 4, color: '#64748b', fontSize: 10 }}>↻</span>}
        </label>
        <MultiSelectDropdown
          isOpen={stationDropdownOpen}
          toggle={() => { closeAll(); setStationDropdownOpen((v) => !v); }}
          allLabel={selectedDistrictIds.length === 0 ? 'All Stations' : 'All Stations in District'}
          selectedIds={selectedStationIds}
          items={stationOptions}
          onAllClick={() => {
            setFilter('policeStationIds', '');
            setFilter('officeIds', '');   // cascade clear offices too
          }}
          onToggleItem={(id) => setFilter('policeStationIds', toggleCsvValue(selectedStationIds, id).join(','))}
        />
      </div>

      {/* Office (scoped to selected district + PS, derived from complaint data) */}
      <div className="filter-group" ref={officeRef} style={{ position: 'relative' }}>
        <label>
          Office
          {officeFetching && <span style={{ marginLeft: 4, color: '#64748b', fontSize: 10 }}>↻</span>}
        </label>
        <MultiSelectDropdown
          isOpen={officeDropdownOpen}
          toggle={() => { closeAll(); setOfficeDropdownOpen((v) => !v); }}
          allLabel={
            selectedDistrictIds.length > 0 || selectedStationIds.length > 0
              ? 'All Offices in Selection'
              : 'All Offices'
          }
          selectedIds={selectedOfficeIds}
          items={officeOptions}
          onAllClick={() => setFilter('officeIds', '')}
          onToggleItem={(id) => setFilter('officeIds', toggleCsvValue(selectedOfficeIds, id).join(','))}
        />
      </div>

      {/* Class of Incident */}
      <div className="filter-group" ref={classRef} style={{ position: 'relative' }}>
        <label>Class of Incident</label>
        <MultiSelectDropdown
          isOpen={classDropdownOpen}
          toggle={() => { closeAll(); setClassDropdownOpen((v) => !v); }}
          allLabel="All Classes"
          selectedIds={selectedClassValues}
          items={classOptions}
          onAllClick={() => setFilter('classOfIncident', '')}
          onToggleItem={(value) => setFilter('classOfIncident', toggleCsvValue(selectedClassValues, value).join(','))}
        />
      </div>

      <div className="filter-actions">
        <button className="btn-reset" onClick={resetFilters}>Reset</button>
      </div>
    </div>
  );
};
