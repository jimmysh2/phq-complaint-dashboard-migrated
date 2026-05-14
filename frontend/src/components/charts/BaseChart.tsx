import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export const BaseChart = ({ option, height = '400px', width = '100%', onEvents }: { option: EChartsOption; height?: string; width?: string; onEvents?: Record<string, (params: any) => void> }) => {
  return <ReactECharts option={option} notMerge={true} style={{ height, width }} opts={{ renderer: 'canvas' }} onEvents={onEvents} />;
};
