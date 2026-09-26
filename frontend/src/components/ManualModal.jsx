import React from 'react';
import { X, BookOpen, Layers, CheckCircle2, Cpu, BarChart2 } from 'lucide-react';

export default function ManualModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ width: '740px', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={22} color="var(--accent-cyan)" />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem' }}>
              DepthWizard Technical Manual & ISRO Verification
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.82rem', lineHeight: '1.6', color: 'var(--text-muted)' }}>
          {/* Section 1 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={16} color="var(--accent-cyan)" />
              1. Elevation Extraction Module (Monocular Backbone)
            </div>
            <p>
              Employs <strong>Depth Anything V2</strong> (Vision Transformer) with ONNX Runtime acceleration. 
              The backbone processes single-view optical satellite imagery (0.6m GSD Cartosat-2S or standard RGB) 
              to output relative disparity/depth representations with sharp architectural edge preservation.
            </p>
          </div>

          {/* Section 2 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={16} color="var(--accent-saffron)" />
              2. Metric Scale Calibration Engine
            </div>
            <p>
              To bridge the foundational monocular depth scale ambiguity in remote sensing:
            </p>
            <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
              <li><strong>Frequency-Split Fusion (SRTM 30m / Copernicus DEM):</strong> Decomposes coarse reference DEM into low-frequency geodetic terrain base, and scales high-frequency monocular depth to resolve fine rooftop structures.</li>
              <li><strong>GCP Polynomial/Planar Anchoring:</strong> Solves 3D planar tilt and scale factors using minimal Ground Control Points.</li>
              <li><strong>Scene Semantic Priors:</strong> Maps relative rDSM to architectural height scales for non-georeferenced images.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BarChart2 size={16} color="var(--accent-green)" />
              3. Accuracy Validation Criteria (ISRO SAC 50% Weightage)
            </div>
            <p>
              Evaluated against true LiDAR ground truth across 4 benchmark landscapes:
              <strong> Urban</strong>, <strong>Sparse</strong>, <strong>Hilly</strong>, and <strong>Forested</strong>:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: '700' }}>RMSE & MAE:</span> Quantifies vertical metric error across all terrain pixels.
              </div>
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--accent-saffron)', fontWeight: '700' }}>Pearson (r) & R²:</span> Measures structural correlation with real elevation.
              </div>
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--accent-green)', fontWeight: '700' }}>LE90 (NSSDA):</span> 90% confidence threshold for disaster & defense applications.
              </div>
            </div>
          </div>

          {/* Section 4 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: '6px' }}>
              4. 3D Flythrough Navigation Shortcuts
            </div>
            <p>
              • <strong>Orbit Mode:</strong> Left click + drag to rotate; Scroll wheel to zoom.<br />
              • <strong>Drone FPV Mode:</strong> <code>W/S</code> forward/backward, <code>A/D</code> strafe, <code>Q/E</code> altitude, Mouse look.<br />
              • <strong>Measure Tool:</strong> Click 'Measure 2-Points' in the bottom dock, then click Point A (building base) and Point B (roof) to measure height and slope!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
