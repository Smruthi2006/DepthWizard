import React from 'react';
import { Satellite, Upload, Download, HelpCircle, Sparkles } from 'lucide-react';

export default function NavigationHeader({ onUploadClick, onExportClick, onHelpClick, backendStatus }) {
  return (
    <header className="header-bar">
      <div className="brand-section">
        <div className="telemetry-badge">
          <Satellite size={14} color="var(--accent-cyan)" />
          <span>v1.0 • Metric DSM</span>
        </div>
        <div>
          <h1 className="brand-title">DepthWizard</h1>
          <div className="brand-subtitle">Single-View Height Estimation & 3D Flythrough Platform</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Backend Status Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(0, 230, 118, 0.08)',
          border: '1px solid rgba(0, 230, 118, 0.25)',
          padding: '5px 12px',
          borderRadius: '16px',
          fontSize: '0.72rem',
          color: '#00e676',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em'
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: '#00e676',
            display: 'inline-block',
            boxShadow: '0 0 8px #00e676'
          }} />
          <span>{backendStatus?.status === 'ONLINE' ? 'ONLINE • 0.6m Metric Ready' : 'CONNECTING...'}</span>
        </div>

        {/* Upload Button */}
        <button className="dock-btn upload-nav-btn" onClick={onUploadClick} title="Upload Custom Satellite Imagery (PNG, JPG, GeoTIFF)">
          <Upload size={14} color="var(--accent-cyan)" />
          <span>Upload Image</span>
        </button>

        {/* Export Button */}
        <button className="dock-btn export-nav-btn" onClick={onExportClick} title="Export Calibrated GeoTIFF & 3D Mesh">
          <Download size={14} color="var(--accent-saffron)" />
          <span>Export 3D/DSM</span>
        </button>

        {/* Documentation / Guide */}
        <button
          className="dock-btn help-nav-btn"
          onClick={onHelpClick}
          style={{ padding: '8px 10px' }}
          title="Architecture & Verification Manual"
        >
          <HelpCircle size={15} />
        </button>
      </div>
    </header>
  );
}
