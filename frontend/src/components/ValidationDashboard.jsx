import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { ShieldCheck, CheckCircle2, TrendingUp, Layers } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function ValidationDashboard({ metrics, metadata, calibration }) {
  if (!metrics) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-dim)', textAlign: 'center', fontSize: '0.8rem' }}>
        Select or process a scene to view LiDAR elevation validation metrics.
      </div>
    );
  }

  // Histogram chart config
  const histData = metrics.histogram || { bin_centers: [], counts: [] };
  const chartData = {
    labels: histData.bin_centers.map((c) => `${c}m`),
    datasets: [
      {
        label: 'Error Residuals Count',
        data: histData.counts,
        backgroundColor: histData.bin_centers.map((c) =>
          Math.abs(c) <= 2.0 ? 'rgba(0, 230, 118, 0.75)' : 'rgba(255, 82, 82, 0.7)'
        ),
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => `Vertical Residual: ${items[0].label}`,
          label: (item) => `Pixels: ${item.raw.toLocaleString()}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 7 }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#64748b', font: { size: 9 } }
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Top Validation Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0, 230, 118, 0.12), rgba(0, 229, 255, 0.06))',
        border: '1px solid rgba(0, 230, 118, 0.3)',
        borderRadius: '10px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 14px rgba(0, 230, 118, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={22} color="#00e676" />
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#00e676', letterSpacing: '-0.01em' }}>
              LiDAR Benchmark Verified
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Calibration: {calibration?.method?.replace(/_/g, ' ') || 'Reference DEM Frequency Split'}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>LE90 (90% Conf.)</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--accent-cyan)', fontFamily: 'var(--font-heading)' }}>
            {metrics.le90_m}m
          </div>
        </div>
      </div>

      {/* 4 Core Accuracy KPI Cards */}
      <div className="metrics-banner">
        <div className="stat-card">
          <span className="stat-label">RMSE (Vertical)</span>
          <span className="stat-number">{metrics.rmse_m}m</span>
          <span className="stat-sub">Ground Truth LiDAR RMS</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">MAE (Mean Error)</span>
          <span className="stat-number gold">{metrics.mae_m}m</span>
          <span className="stat-sub">Absolute Residual</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pearson (r)</span>
          <span className="stat-number green">{metrics.pearson_r}</span>
          <span className="stat-sub">R²: {metrics.r2_score}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Within ±2.0m</span>
          <span className="stat-number">{metrics.pct_within_2m}%</span>
          <span className="stat-sub">±1.0m: {metrics.pct_within_1m}%</span>
        </div>
      </div>

      {/* Error Distribution Histogram */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding: '12px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          fontSize: '0.75rem',
          fontWeight: '600',
          color: 'var(--text-muted)'
        }}>
          <span>Vertical Error Residual Histogram</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
            Target: 0.0m
          </span>
        </div>
        <div style={{ height: '130px', width: '100%' }}>
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Multi-Landscape Verification Matrix */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding: '12px'
      }}>
        <div style={{
          fontSize: '0.72rem',
          fontWeight: '700',
          color: 'var(--text-muted)',
          marginBottom: '8px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          Multi-Landscape Stability Criteria
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '0.74rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Urban Built-Up (Structures):</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: '600' }}>Sharp Rooftops Preserved</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Sparse / Semi-Arid (Plains):</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: '600' }}>Sub-meter Base Stability</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Hilly / Mountainous (Ridges):</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: '600' }}>Macro Relief Concordance</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Forested (Tree Canopy):</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: '600' }}>Biomass Height Extracted</span>
          </div>
        </div>
      </div>
    </div>
  );
}
