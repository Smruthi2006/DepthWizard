import React, { useState } from 'react';
import { Download, X, FileBox, FileSpreadsheet, MapPin, CheckCircle } from 'lucide-react';

export default function ExportModal({ isOpen, onClose, currentSession }) {
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState(null);

  if (!isOpen || !currentSession) return null;

  const sessionId = currentSession.session_id;

  const handleExportMesh = async (format) => {
    setDownloading(true);
    setMessage(null);
    try {
      const res = await fetch('http://localhost:8000/api/export/mesh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, format: format, vertical_scale: 1.0 })
      });
      const data = await res.json();
      if (format === 'obj') {
        window.open(`http://localhost:8000${data.obj_url}`, '_blank');
      } else {
        window.open(`http://localhost:8000${data.download_url}`, '_blank');
      }
      setMessage(`Successfully exported ${format.toUpperCase()} mesh!`);
    } catch (e) {
      setMessage(`Export failed: ${e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadGeoTIFF = () => {
    if (currentSession.geotiff_download) {
      window.open(`http://localhost:8000${currentSession.geotiff_download}`, '_blank');
    }
  };

  const handleDownloadReport = () => {
    const reportData = {
      project: "DepthWizard (ISRO SAC SIH 26175)",
      metadata: currentSession.metadata,
      calibration: currentSession.calibration,
      accuracy_metrics: currentSession.metrics,
      exported_at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DepthWizard_Validation_Report_${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={22} color="var(--accent-saffron)" />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem' }}>
              Export Deliverables & Assets
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 1. GeoTIFF DSM */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FileSpreadsheet size={24} color="var(--accent-cyan)" />
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>Calibrated Metric DSM (GeoTIFF)</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  32-bit floating point, georeferenced raster (0.6m GSD)
                </div>
              </div>
            </div>
            <button className="dock-btn" onClick={handleDownloadGeoTIFF}>
              Download .TIF
            </button>
          </div>

          {/* 2. Wavefront OBJ 3D Mesh */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FileBox size={24} color="var(--accent-saffron)" />
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>3D Textured Terrain Mesh (.OBJ)</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  Complete with MTL file and projected optical texture
                </div>
              </div>
            </div>
            <button className="dock-btn" onClick={() => handleExportMesh('obj')} disabled={downloading}>
              Export .OBJ
            </button>
          </div>

          {/* 3. Stanford PLY Colored Point Cloud */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <MapPin size={24} color="var(--accent-green)" />
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>Colored 3D Point Cloud (.PLY)</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  Vertex coordinates and optical RGB colors
                </div>
              </div>
            </div>
            <button className="dock-btn" onClick={() => handleExportMesh('ply')} disabled={downloading}>
              Export .PLY
            </button>
          </div>

          {/* 4. Accuracy & Validation Certificate JSON */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle size={24} color="var(--accent-purple)" />
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>ISRO Validation Certificate (JSON)</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  Complete RMSE, MAE, R², LE90 & calibration metadata
                </div>
              </div>
            </div>
            <button className="dock-btn" onClick={handleDownloadReport}>
              Download JSON
            </button>
          </div>
        </div>

        {message && (
          <div style={{ marginTop: '14px', fontSize: '0.78rem', color: 'var(--accent-green)', textAlign: 'center' }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
