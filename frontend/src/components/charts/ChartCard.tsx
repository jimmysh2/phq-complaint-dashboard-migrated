import React, { useState } from 'react';
import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';

interface ChartCardProps {
  title: string;
  option?: EChartsOption;
  fullOption?: EChartsOption;
  height?: string;
  expandedHeight?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  noExpand?: boolean;
}

export const ChartCard = ({ title, option, fullOption, height = '280px', expandedHeight = 'calc(100vh - 120px)', actions, children, noExpand }: ChartCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const childWithExpandedProp = children && typeof children === 'object' && 'props' in children
    ? React.cloneElement(children as React.ReactElement<any>, { isCardExpanded: expanded })
    : children;

  if (expanded) {
    return (
      <div className="chart-overlay" style={{ zIndex: 400 }}>
        <div className="chart-overlay-header" style={{ padding: '16px 24px', gap: '16px' }}>
          <span className="chart-overlay-title" style={{ fontSize: '18px', fontWeight: 600 }}>{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {actions && <div>{actions}</div>}
            <button className="chart-overlay-close" onClick={() => setExpanded(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Close
            </button>
          </div>
        </div>
        <div className="chart-overlay-body" style={{ 
          overflowY: 'auto', 
          overflowX: 'auto',
          padding: '20px', 
          width: '100%',
          maxWidth: '100%',
          margin: 0,
          flex: 1,
          alignItems: 'flex-start',
          justifyContent: 'flex-start'
        }}>
          {childWithExpandedProp
            ? <div style={{ width: '100%', minWidth: '100%' }}>{childWithExpandedProp}</div>
            : <BaseChart option={fullOption || option || {}} height={expandedHeight} />
          }
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <span className="chart-card-title">{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {actions && <div>{actions}</div>}
          {!noExpand && (
            <button className="chart-expand-btn" onClick={() => setExpanded(true)} title="Expand">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="chart-card-body">
        {children ?? (option ? <BaseChart option={option} height={height} /> : null)}
      </div>
    </div>
  );
};