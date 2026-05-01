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
}: {
  isOpen: boolean;
  toggle: () => void;
  allLabel: string;
  selectedIds: string[];
  items: Option[];
  onAllClick: () => void;
  onToggleItem: (id: string) => void;
}) => {
  const selectedLabels = items
    .filter((item) => selectedIds.includes(item.id))
    .map((item) => item.label);

  const displayText = selectedIds.length === 0
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
          e.preventDefault();
          toggle();
        }}
        onMouseDown={(e) => e.preventDefault()}
        onChange={() => {}}
        style={{ cursor: 'pointer', minWidth: '140px' }}
      >
        <option value="__custom__">{displayText}</option>
      </select>

      {isOpen && (
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
            maxHeight: '280px',
            overflowY: 'auto',
            minWidth: '180px',
          }}
        >
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

          {items.map((item) => (
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
          ))}
        </div>
      )}
    </>
  );
};

export const GlobalFilterBar = () => {
  const { filters, setFilter, resetFilters } = useFilters();
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  const [stationDropdownOpen, setStationDropdownOpen] = useState(false);
  const [officeDropdownOpen, setOfficeDropdownOpen] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);

  const districtRef = useRef<HTMLDivElement>(null);
  const stationRef = useRef<HTMLDivElement>(null);
  const officeRef = useRef<HTMLDivElement>(null);
  const classRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (districtRef.current && !districtRef.current.contains(event.target as Node)) setDistrictDropdownOpen(false);
      if (stationRef.current && !stationRef.current.contains(event.target as Node)) setStationDropdownOpen(false);
      if (officeRef.current && !officeRef.current.contains(event.target as Node)) setOfficeDropdownOpen(false);
      if (classRef.current && !classRef.current.contains(event.target as Node)) setClassDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedDistrictIds = parseCsv(filters.districtIds);
  const selectedStationIds = parseCsv(filters.policeStationIds);
  const selectedOfficeIds = parseCsv(filters.officeIds);
  const selectedClassValues = parseCsv(filters.classOfIncident);

  const toggleCsvValue = (selected: string[], value: string) =>
    selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];

  const { data: districts } = useQuery({
    queryKey: ['filter-districts'],
    queryFn: () => referenceApi.districts(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: policeStations } = useQuery({
    queryKey: ['filter-police-stations', filters.districtIds],
    queryFn: () => referenceApi.policeStations(filters.districtIds || undefined),
    staleTime: 5 * 60 * 1000,
  });

  const { data: offices } = useQuery({
    queryKey: ['filter-offices'],
    queryFn: () => referenceApi.offices(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: classes } = useQuery({
    queryKey: ['filter-class-of-incident'],
    queryFn: () => referenceApi.crimeCategory(),
    staleTime: 5 * 60 * 1000,
  });

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

  useEffect(() => {
    if (selectedStationIds.length === 0) return;
    const valid = new Set(stationOptions.map((item) => item.id));
    const pruned = selectedStationIds.filter((id) => valid.has(id));
    if (pruned.length !== selectedStationIds.length) {
      setFilter('policeStationIds', pruned.join(','));
    }
  }, [filters.districtIds, stationOptions]);

  return (
    <div className="global-filter-bar">
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

      <div className="filter-group" ref={districtRef} style={{ position: 'relative' }}>
        <label>District</label>
        <MultiSelectDropdown
          isOpen={districtDropdownOpen}
          toggle={() => {
            setDistrictDropdownOpen(!districtDropdownOpen);
            setStationDropdownOpen(false);
            setOfficeDropdownOpen(false);
            setClassDropdownOpen(false);
          }}
          allLabel="All Districts"
          selectedIds={selectedDistrictIds}
          items={districtOptions}
          onAllClick={() => setFilter('districtIds', '')}
          onToggleItem={(id) => setFilter('districtIds', toggleCsvValue(selectedDistrictIds, id).join(','))}
        />
      </div>

      <div className="filter-group" ref={stationRef} style={{ position: 'relative' }}>
        <label>Police Station</label>
        <MultiSelectDropdown
          isOpen={stationDropdownOpen}
          toggle={() => {
            setStationDropdownOpen(!stationDropdownOpen);
            setDistrictDropdownOpen(false);
            setOfficeDropdownOpen(false);
            setClassDropdownOpen(false);
          }}
          allLabel="All Police Stations"
          selectedIds={selectedStationIds}
          items={stationOptions}
          onAllClick={() => setFilter('policeStationIds', '')}
          onToggleItem={(id) => setFilter('policeStationIds', toggleCsvValue(selectedStationIds, id).join(','))}
        />
      </div>

      <div className="filter-group" ref={officeRef} style={{ position: 'relative' }}>
        <label>Office</label>
        <MultiSelectDropdown
          isOpen={officeDropdownOpen}
          toggle={() => {
            setOfficeDropdownOpen(!officeDropdownOpen);
            setDistrictDropdownOpen(false);
            setStationDropdownOpen(false);
            setClassDropdownOpen(false);
          }}
          allLabel="All Offices"
          selectedIds={selectedOfficeIds}
          items={officeOptions}
          onAllClick={() => setFilter('officeIds', '')}
          onToggleItem={(id) => setFilter('officeIds', toggleCsvValue(selectedOfficeIds, id).join(','))}
        />
      </div>

      <div className="filter-group" ref={classRef} style={{ position: 'relative' }}>
        <label>Class of Incident</label>
        <MultiSelectDropdown
          isOpen={classDropdownOpen}
          toggle={() => {
            setClassDropdownOpen(!classDropdownOpen);
            setDistrictDropdownOpen(false);
            setStationDropdownOpen(false);
            setOfficeDropdownOpen(false);
          }}
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
