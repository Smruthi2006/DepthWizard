import React from 'react';
import { Satellite, Upload, Download, Activity, HelpCircle, Layers } from 'lucide-react';

export default function NavigationHeader({ onUploadClick, onExportClick, onHelpClick, backendStatus }) {
  return (
    <header className="header-bar">
      <div className="brand-section">
        <div className="isro-badge">
          <span>ISRO SAC</span>
          <span>•</span>
          <span>SIH 26175</span>
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
          background: 'rgba(0, 230, 118, 0.1)',
          border: '1px solid rgba(0, 230, 118, 0.3)',
          padding: '4px 12px',
          borderRadius: '16px',
          fontSize: '0.75rem',
          color: '#00e676',
          fontFamily: 'var(--font-mono)'
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e676', display: 'inline-block', boxShadow: '0 0 8px #00e676' }} />
          <span>{backendStatus?.status === 'ONLINE' ? 'ONLINE (0.6m Cartosat-2S Ready)' : 'CONNECTING...'}</span>
        </div>

        {/* Upload Button */}
        <button className="dock-btn" onClick={onUploadClick} title="Upload Custom Imagery (PNG, JPG, GeoTIFF)">
          <Upload size={15} color="var(--accent-cyan)" />
          <span>Upload Image</span>
        </button>

        {/* Export Button */}
        <button className="dock-btn" onClick={onExportClick} title="Export Calibrated GeoTIFF & 3D Mesh">
          <Download size={15} color="var(--accent-saffron)" />
          <span>Export 3D/DSM</span>
        </button>

        {/* Documentation / Guide */}
        <button
          className="dock-btn"
          onClick={onHelpClick}
          style={{ padding: '8px 10px' }}
          title="Architecture & ISRO Verification Manual"
        >
          <HelpCircle size={16} />
        </button>
      </div>
    </header>
  );
}
