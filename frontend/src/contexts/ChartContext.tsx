import { createContext, useContext } from 'react';

export const ChartContext = createContext<{ expanded: boolean; setExpanded: (v: boolean) => void }>({
  expanded: false,
  setExpanded: () => {},
});

export const useChartExpand = () => useContext(ChartContext);
