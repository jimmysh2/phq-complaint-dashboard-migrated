import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface DashboardFilters {
  districtIds: string;
  policeStationIds: string;
  officeIds: string;
  classOfIncident: string;
  fromDate: string;
  toDate: string;
}

interface FilterContextType {
  filters: DashboardFilters;
  setFilter: (key: keyof DashboardFilters, value: string) => void;
  resetFilters: () => void;
}

const defaultFilters: DashboardFilters = {
  districtIds: '',
  policeStationIds: '',
  officeIds: '',
  classOfIncident: '',
  fromDate: '',
  toDate: '',
};

const STORAGE_KEY = 'phq-dashboard-filters';

const loadFiltersFromStorage = (): DashboardFilters => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaultFilters, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load filters from localStorage:', e);
  }
  return defaultFilters;
};

const FilterContext = createContext<FilterContextType>({
  filters: defaultFilters,
  setFilter: () => {},
  resetFilters: () => {},
});

export const FilterProvider = ({ children }: { children: ReactNode }) => {
  const [filters, setFilters] = useState<DashboardFilters>(loadFiltersFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch (e) {
      console.warn('Failed to save filters to localStorage:', e);
    }
  }, [filters]);

  const setFilter = (key: keyof DashboardFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(defaultFilters);

  return (
    <FilterContext.Provider value={{ filters, setFilter, resetFilters }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilters = () => useContext(FilterContext);
