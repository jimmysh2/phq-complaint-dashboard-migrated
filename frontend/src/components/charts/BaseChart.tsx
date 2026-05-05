import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export const BaseChart = ({ option, height = '400px', width = '100%' }: { option: EChartsOption; height?: string; width?: string }) => {
  return <ReactECharts option={option} notMerge={true} style={{ height, width }} opts={{ renderer: 'canvas' }} />;
};
