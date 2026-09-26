import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { X, TrendingUp, ArrowRight } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function ElevationProfileModal({ profileData, onClose }) {
  if (!profileData) return null;

  const { distances, elevations, total_distance_m, min_elevation_m, max_elevation_m, elevation_gain_m } = profileData;

  const chartData = {
    labels: distances.map((d) => `${d.toFixed(0)}m`),
    datasets: [
      {
        label: 'Metric Elevation (DSM)',
        data: elevations,
        borderColor: '#00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.15)',
        borderWidth: 2,
        fill: true,
        tension: 0.25,
        pointRadius: 0
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
          title: (items) => `Transect Distance: ${items[0].label}`,
          label: (item) => `Elevation: ${item.raw.toFixed(2)} meters`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748b', font: { size: 10 } }
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ width: '680px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} color="var(--accent-cyan)" />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem' }}>
              Elevation Cross-Section Transect
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Transect Statistics Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
          marginBottom: '16px'
        }}>
          <div className="stat-card" style={{ padding: '8px 12px' }}>
            <span className="stat-label">Transect Length</span>
            <span className="stat-number" style={{ fontSize: '1.1rem' }}>{total_distance_m.toFixed(1)}m</span>
          </div>
          <div className="stat-card" style={{ padding: '8px 12px' }}>
            <span className="stat-label">Min Elevation</span>
            <span className="stat-number" style={{ fontSize: '1.1rem', color: 'var(--accent-green)' }}>
              {min_elevation_m.toFixed(1)}m
            </span>
          </div>
          <div className="stat-card" style={{ padding: '8px 12px' }}>
            <span className="stat-label">Max Elevation</span>
            <span className="stat-number" style={{ fontSize: '1.1rem', color: 'var(--accent-saffron)' }}>
              {max_elevation_m.toFixed(1)}m
            </span>
          </div>
          <div className="stat-card" style={{ padding: '8px 12px' }}>
            <span className="stat-label">Vertical Relief</span>
            <span className="stat-number" style={{ fontSize: '1.1rem' }}>{elevation_gain_m.toFixed(1)}m</span>
          </div>
        </div>

        {/* Chart View */}
        <div style={{ height: '260px', width: '100%', marginBottom: '14px' }}>
          <Line data={chartData} options={chartOptions} />
        </div>

        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'center' }}>
          Generated via Bilinear Interpolation on Calibrated 0.6m Digital Surface Model
        </div>
      </div>
    </div>
  );
}
