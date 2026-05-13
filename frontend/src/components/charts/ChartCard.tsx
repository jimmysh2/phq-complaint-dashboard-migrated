import React, { useState } from 'react';
import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';

interface ChartCardProps {
  title: string;
  subtitle?: React.ReactNode;
  option?: EChartsOption;
  fullOption?: EChartsOption;
  height?: string;
  expandedHeight?: string;
  actions?: React.ReactNode;
  chartActions?: React.ReactNode;
  children?: React.ReactNode;
  noExpand?: boolean;
  viewMode?: 'chart' | 'table';
  onViewModeChange?: (mode: 'chart' | 'table') => void;
}

export const ChartCard = ({ 
  title, 
  subtitle, 
  option, 
  fullOption, 
  height = '280px', 
  expandedHeight = 'calc(100vh - 120px)', 
  actions, 
  chartActions,
  children, 
  noExpand,
  viewMode,
  onViewModeChange
}: ChartCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const childWithExpandedProp = children && typeof children === 'object' && 'props' in children
    ? React.cloneElement(children as React.ReactElement<any>, { isCardExpanded: expanded })
    : children;

  if (expanded) {
    return (
      <div className="chart-overlay" style={{ zIndex: 400 }}>
        <div className="chart-overlay-header" style={{ padding: '16px 24px', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="chart-overlay-title" style={{ fontSize: '18px', fontWeight: 600 }}>{title}</span>
              {viewMode && onViewModeChange && (
                <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '6px', padding: '2px' }}>
                  <button
                    onClick={() => onViewModeChange('chart')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      backgroundColor: viewMode === 'chart' ? '#3b82f6' : 'transparent',
                      color: viewMode === 'chart' ? '#fff' : '#94a3b8',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    Chart
                  </button>
                  <button
                    onClick={() => onViewModeChange('table')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      backgroundColor: viewMode === 'table' ? '#3b82f6' : 'transparent',
                      color: viewMode === 'table' ? '#fff' : '#94a3b8',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    Table
                  </button>
                </div>
              )}
            </div>
            {subtitle && <span style={{ fontSize: '12px', color: '#94a3b8' }}>{subtitle}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {viewMode === 'chart' && chartActions}
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
            : <BaseChart option={viewMode === 'chart' ? (fullOption || option || {}) : {}} height={expandedHeight} />
          }
        </div>
      </div>
    );
  }

  const showHeader = title || subtitle || actions || chartActions || viewMode;

  return (
    <div className="chart-card">
      {showHeader && (
        <div className="chart-card-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {title && <span className="chart-card-title">{title}</span>}
            {subtitle && <span className="chart-card-subtitle">{subtitle}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {viewMode && onViewModeChange && (
              <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '6px', padding: '2px' }}>
                <button
                  onClick={() => onViewModeChange('chart')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    backgroundColor: viewMode === 'chart' ? '#3b82f6' : 'transparent',
                    color: viewMode === 'chart' ? '#fff' : '#94a3b8',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Chart
                </button>
                <button
                  onClick={() => onViewModeChange('table')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    backgroundColor: viewMode === 'table' ? '#3b82f6' : 'transparent',
                    color: viewMode === 'table' ? '#fff' : '#94a3b8',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Table
                </button>
              </div>
            )}
            {viewMode === 'chart' && chartActions}
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
      )}
      <div className="chart-card-body">
        {children && typeof children !== 'boolean' ? (
          children
        ) : (
          option ? <BaseChart option={option} height={height} /> : null
        )}
      </div>
    </div>
  );
};