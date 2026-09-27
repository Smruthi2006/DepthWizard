import React, { useState, useEffect } from 'react';
import NavigationHeader from './components/NavigationHeader';
import TerrainViewer3D from './components/TerrainViewer3D';
import ValidationDashboard from './components/ValidationDashboard';
import ElevationProfileModal from './components/ElevationProfileModal';
import UploadModal from './components/UploadModal';
import ExportModal from './components/ExportModal';
import ManualModal from './components/ManualModal';
import {
  Layers,
  Compass,
  Sun,
  Eye,
  Ruler,
  TrendingUp,
  RotateCw,
  Video,
  Plane,
  Grid,
  MapPin,
  Maximize2,
  Building2,
  Mountain,
  Trees,
  CloudSun,
  X,
  Activity,
  ShieldCheck,
  ClipboardPaste
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

export default function App() {
  const [samples, setSamples] = useState([]);
  const [activeSampleId, setActiveSampleId] = useState('urban');
  const [currentSession, setCurrentSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState(null);

  // Viewport Settings
  const [activeLayer, setActiveLayer] = useState('optical'); // 'optical', 'dsm', 'ndsm', 'slope', 'residual'
  const [verticalScale, setVerticalScale] = useState(1.4);
  const [wireframe, setWireframe] = useState(false);
  const [flythroughMode, setFlythroughMode] = useState('orbit'); // 'orbit', 'drone', 'cinematic', 'ortho'
  const [sunAngle, setSunAngle] = useState(50);
  const [sunAzimuth, setSunAzimuth] = useState(140);

  // Analytical Tools State
  const [measureMode, setMeasureMode] = useState(false);
  const [measurementResult, setMeasurementResult] = useState(null);
  const [inspectedPoint, setInspectedPoint] = useState(null);
  const [profileData, setProfileData] = useState(null);

  // Modals & Clipboard State
  const [showUpload, setShowUpload] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [pastedInitialFile, setPastedInitialFile] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Global Ctrl+V Clipboard paste listener
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        return;
      }
      if (e.clipboardData && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              setPastedInitialFile(file);
              setShowUpload(true);
              showToast('Image pasted from clipboard! Ready to process.');
              break;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch status and sample manifest
  useEffect(() => {
    fetch(`${API_BASE}/api/status`)
      .then((r) => r.json())
      .then(setBackendStatus)
      .catch((err) => console.error('Status fetch failed:', err));

    fetch(`${API_BASE}/api/samples`)
      .then((r) => r.json())
      .then((data) => {
        if (data.samples) {
          setSamples(data.samples);
          processScene('urban', 'dem');
        }
      })
      .catch((err) => console.error('Samples fetch failed:', err));
  }, []);

  const processScene = async (sampleId, calibMethod = 'dem') => {
    setLoading(true);
    setActiveSampleId(sampleId);
    setActiveLayer('optical');
    setMeasurementResult(null);
    setInspectedPoint(null);
    try {
      const res = await fetch(`${API_BASE}/api/process/sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_id: sampleId,
          calibration_method: calibMethod,
          refine_edges: true
        })
      });
      const data = await res.json();
      const fullTextures = {};
      Object.keys(data.textures).forEach((k) => {
        fullTextures[k] = `${API_BASE}${data.textures[k]}`;
      });
      data.textures = fullTextures;
      setCurrentSession(data);
    } catch (e) {
      console.error('Failed to process scene:', e);
    } finally {
      setLoading(false);
    }
  };

  // Point Query Handler
  const handlePointClick = async ({ x, y }) => {
    if (!currentSession) return;
    try {
      const res = await fetch(`${API_BASE}/api/analyze/point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSession.session_id,
          x: x,
          y: y
        })
      });
      const ptInfo = await res.json();
      setInspectedPoint(ptInfo);
    } catch (e) {
      console.error('Point analysis failed:', e);
    }
  };

  // 2-Point Measure Completion
  const handleMeasureComplete = async (meas) => {
    setMeasurementResult(meas);
    if (!currentSession) return;
    try {
      const res = await fetch(`${API_BASE}/api/analyze/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSession.session_id,
          p1: [meas.p1_pixel.x, meas.p1_pixel.y],
          p2: [meas.p2_pixel.x, meas.p2_pixel.y]
        })
      });
      const prof = await res.json();
      setProfileData(prof);
    } catch (e) {
      console.error('Profile extraction failed:', e);
    }
  };

  const getLandscapeIcon = (id) => {
    switch (id) {
      case 'urban':
        return <Building2 size={18} color="var(--accent-cyan)" />;
      case 'sparse':
        return <CloudSun size={18} color="var(--accent-saffron)" />;
      case 'hilly':
        return <Mountain size={18} color="var(--accent-green)" />;
      case 'forested':
        return <Trees size={18} color="#22c55e" />;
      default:
        return <Layers size={18} />;
    }
  };

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <NavigationHeader
        backendStatus={backendStatus}
        onUploadClick={() => { setPastedInitialFile(null); setShowUpload(true); }}
        onExportClick={() => setShowExport(true)}
        onHelpClick={() => setShowManual(true)}
      />

      <div className="workspace-area">
        {/* Left Sidebar */}
        <aside className="left-sidebar">
          {/* Current Scene Telemetry (Cleanly docked in sidebar, zero viewport overlap) */}
          {currentSession?.metadata && (
            <div className="sidebar-section" style={{ background: 'rgba(0, 229, 255, 0.02)' }}>
              <div className="section-title">
                <Activity size={14} color="var(--accent-cyan)" />
                <span>Active Scene Telemetry</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>SCENE:</span>
                  <span style={{ color: 'var(--accent-cyan)', fontWeight: '700' }}>
                    {currentSession.sample_id?.toUpperCase() || 'CUSTOM'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>GSD:</span>
                  <span style={{ color: '#fff' }}>{currentSession.metadata.gsd_m}m / px</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>ELEV RANGE:</span>
                  <span style={{ color: '#fff' }}>{currentSession.metadata.elevation_min}m - {currentSession.metadata.elevation_max}m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>MAX STRUCTURE:</span>
                  <span style={{ color: 'var(--accent-saffron)', fontWeight: '700' }}>{currentSession.metadata.max_structure_height_m}m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>INFERENCE:</span>
                  <span style={{ color: 'var(--accent-green)' }}>{currentSession.metadata.inference_time_s}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Benchmark Landscapes */}
          <div className="sidebar-section">
            <div className="section-title">
              <Layers size={14} color="var(--accent-cyan)" />
              <span>Benchmark Landscapes</span>
            </div>
            <div className="landscape-grid">
              {samples.map((s) => (
                <div
                  key={s.id}
                  className={`landscape-card ${activeSampleId === s.id ? 'active' : ''}`}
                  onClick={() => processScene(s.id, 'dem')}
                >
                  <div className="landscape-icon">{getLandscapeIcon(s.id)}</div>
                  <div className="landscape-name">{s.landscape}</div>
                  <div className="landscape-type">0.6m Resolution</div>
                </div>
              ))}
            </div>
          </div>

          {/* Scale Calibration Strategy */}
          <div className="sidebar-section">
            <div className="section-title">
              <Compass size={14} color="var(--accent-saffron)" />
              <span>Metric Calibration Strategy</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className={`btn-secondary ${currentSession?.calibration?.method?.includes('Reference_DEM') ? 'active' : ''}`}
                onClick={() => processScene(activeSampleId, 'dem')}
                style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: '0.78rem' }}
              >
                <span>🛰️ Coarse DEM (SRTM 30m / Copernicus)</span>
              </button>
              <button
                className={`btn-secondary ${currentSession?.calibration?.method?.includes('GCP') ? 'active' : ''}`}
                onClick={() => processScene(activeSampleId, 'gcps')}
                style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: '0.78rem' }}
              >
                <span>📍 Ground Control Points (GCPs)</span>
              </button>
              <button
                className={`btn-secondary ${currentSession?.calibration?.method?.includes('Scene_Prior') ? 'active' : ''}`}
                onClick={() => processScene(activeSampleId, 'scene_prior')}
                style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: '0.78rem' }}
              >
                <span>📐 Scene Statistical Priors</span>
              </button>
            </div>
          </div>

          {/* 3D Visualization & Shader Controls */}
          <div className="sidebar-section">
            <div className="section-title">
              <Eye size={14} color="var(--accent-cyan)" />
              <span>3D Geometry & Sun Lighting</span>
            </div>

            {/* Vertical Exaggeration */}
            <div className="slider-group">
              <div className="slider-header">
                <span>Vertical Relief Exaggeration</span>
                <span style={{ color: 'var(--accent-cyan)' }}>{verticalScale.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="4.0"
                step="0.1"
                value={verticalScale}
                onChange={(e) => setVerticalScale(parseFloat(e.target.value))}
              />
            </div>

            {/* Sun Azimuth */}
            <div className="slider-group">
              <div className="slider-header">
                <span>Sun Azimuth Angle</span>
                <span style={{ color: 'var(--accent-saffron)' }}>{sunAzimuth}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={sunAzimuth}
                onChange={(e) => setSunAzimuth(parseInt(e.target.value))}
              />
            </div>

            {/* Sun Altitude */}
            <div className="slider-group">
              <div className="slider-header">
                <span>Sun Elevation Altitude</span>
                <span style={{ color: 'var(--accent-saffron)' }}>{sunAngle}°</span>
              </div>
              <input
                type="range"
                min="10"
                max="85"
                step="5"
                value={sunAngle}
                onChange={(e) => setSunAngle(parseInt(e.target.value))}
              />
            </div>

            {/* Wireframe toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Show 3D Wireframe Grid</span>
              <button
                className={`dock-btn ${wireframe ? 'active' : ''}`}
                onClick={() => setWireframe(!wireframe)}
                style={{ padding: '4px 10px', fontSize: '0.72rem' }}
              >
                <Grid size={13} />
                <span>{wireframe ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Center 3D Interactive Viewport (Zero Overlaps) */}
        <main className="viewport-container">
          {/* Loading Hologram Overlay */}
          {loading && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(6, 8, 14, 0.75)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 40,
              gap: '14px'
            }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                border: '3px solid rgba(0, 229, 255, 0.15)',
                borderTopColor: 'var(--accent-cyan)',
                animation: 'spin 0.8s linear infinite'
              }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', fontSize: '1rem', color: '#fff' }}>
                  Estimating Elevation & Generating 3D Mesh
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: '4px', letterSpacing: '0.04em' }}>
                  {activeSampleId.toUpperCase()} • 0.6m High-Precision Relief
                </div>
              </div>
            </div>
          )}

          {/* Top Layer Switcher Dock (Clean, centered, zero obstruction) */}
          <div className="floating-overlay-top">
            <button
              className={`overlay-btn ${activeLayer === 'optical' ? 'active' : ''}`}
              onClick={() => setActiveLayer('optical')}
            >
              <Eye size={13} />
              <span>Optical Satellite RGB</span>
            </button>
            <button
              className={`overlay-btn ${activeLayer === 'dsm' ? 'active' : ''}`}
              onClick={() => setActiveLayer('dsm')}
            >
              <Layers size={13} />
              <span>Metric DSM Heightmap</span>
            </button>
            <button
              className={`overlay-btn ${activeLayer === 'ndsm' ? 'active' : ''}`}
              onClick={() => setActiveLayer('ndsm')}
            >
              <Building2 size={13} />
              <span>nDSM (Structures/Buildings)</span>
            </button>
            <button
              className={`overlay-btn ${activeLayer === 'slope' ? 'active' : ''}`}
              onClick={() => setActiveLayer('slope')}
            >
              <TrendingUp size={13} />
              <span>Slope & Hazard Map</span>
            </button>
            {currentSession?.metrics && (
              <button
                className={`overlay-btn ${activeLayer === 'residual' ? 'active' : ''}`}
                onClick={() => setActiveLayer('residual')}
              >
                <ShieldCheck size={13} />
                <span>LiDAR Error Residual</span>
              </button>
            )}
          </div>

          {/* 3D Measurement Results Banner (Docked safely right above bottom dock, zero top collision) */}
          {measurementResult && (
            <div className="measurement-banner">
              <div>📏 3D Dist: <strong>{measurementResult.dist_3d_m}m</strong></div>
              <div>↔️ Horiz: <strong>{measurementResult.horiz_dist_m}m</strong></div>
              <div>↕️ Height Diff: <strong style={{ color: 'var(--accent-saffron)' }}>{measurementResult.height_diff_m}m</strong></div>
              <div>📐 Slope: <strong>{measurementResult.slope_deg}°</strong></div>
              {profileData && (
                <button
                  className="dock-btn"
                  onClick={() => setProfileData({ ...profileData })}
                  style={{ padding: '4px 10px', fontSize: '0.72rem', background: 'var(--accent-cyan)', color: '#000' }}
                >
                  <TrendingUp size={12} />
                  <span>Cross-Section</span>
                </button>
              )}
              <button
                onClick={() => setMeasurementResult(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', marginLeft: '4px' }}
                title="Dismiss measurement"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Three.js 3D Canvas */}
          <TerrainViewer3D
            meshData={currentSession?.mesh_data}
            textures={currentSession?.textures}
            activeLayer={activeLayer}
            verticalScale={verticalScale}
            wireframe={wireframe}
            flythroughMode={flythroughMode}
            sunAngle={sunAngle}
            sunAzimuth={sunAzimuth}
            measureMode={measureMode}
            onPointClicked={handlePointClick}
            onMeasureComplete={handleMeasureComplete}
          />

          {/* Elevation Colorbar Legend (Docked bottom-right with safe margins) */}
          {currentSession?.metadata && activeLayer !== 'optical' && (
            <div className="elevation-legend">
              <span style={{ fontWeight: '600' }}>
                {activeLayer === 'dsm' && 'Elevation (Meters)'}
                {activeLayer === 'ndsm' && 'Structural Height (Meters)'}
                {activeLayer === 'slope' && 'Slope Steepness (Degrees)'}
                {activeLayer === 'residual' && 'LiDAR Error (Meters)'}
              </span>
              <div
                className="legend-bar"
                style={{
                  background:
                    activeLayer === 'dsm'
                      ? 'linear-gradient(to right, #30123b, #1ae4b6, #e7f722, #b81702)'
                      : activeLayer === 'ndsm'
                      ? 'linear-gradient(to right, #000004, #721f81, #f1605d, #fcfdbf)'
                      : activeLayer === 'slope'
                      ? 'linear-gradient(to right, #440154, #21908d, #fde725)'
                      : 'linear-gradient(to right, #3b4cc0, #8cb2e9, #f2f2f2, #f49a7b, #b40426)'
                }}
              />
              <div className="legend-labels">
                <span>
                  {activeLayer === 'dsm' && `${currentSession.metadata.elevation_min}m`}
                  {activeLayer === 'ndsm' && '0.0m'}
                  {activeLayer === 'slope' && '0°'}
                  {activeLayer === 'residual' && '-5m'}
                </span>
                <span>
                  {activeLayer === 'dsm' && `${currentSession.metadata.elevation_max}m`}
                  {activeLayer === 'ndsm' && `${currentSession.metadata.max_structure_height_m}m`}
                  {activeLayer === 'slope' && `${currentSession.metadata.max_slope_deg}°`}
                  {activeLayer === 'residual' && '+5m'}
                </span>
              </div>
            </div>
          )}

          {/* Bottom Flythrough Camera Modes Dock (Centered bottom) */}
          <div className="flythrough-dock">
            <button
              className={`dock-btn ${flythroughMode === 'orbit' && !measureMode ? 'active' : ''}`}
              onClick={() => { setFlythroughMode('orbit'); setMeasureMode(false); }}
              title="Turntable 360° Inspection (Left click + drag, wheel to zoom)"
            >
              <RotateCw size={14} />
              <span>Orbit</span>
            </button>
            <button
              className={`dock-btn ${flythroughMode === 'drone' ? 'active' : ''}`}
              onClick={() => { setFlythroughMode('drone'); setMeasureMode(false); }}
              title="First-Person Drone Flight (W/A/S/D keys, Q/E altitude, Mouse look)"
            >
              <Plane size={14} />
              <span>Drone FPV</span>
            </button>
            <button
              className={`dock-btn ${flythroughMode === 'cinematic' ? 'active' : ''}`}
              onClick={() => { setFlythroughMode('cinematic'); setMeasureMode(false); }}
              title="Automated Aerial Flyover Loop"
            >
              <Video size={14} />
              <span>Cinematic Route</span>
            </button>
            <button
              className={`dock-btn ${flythroughMode === 'ortho' ? 'active' : ''}`}
              onClick={() => { setFlythroughMode('ortho'); setMeasureMode(false); }}
              title="Nadir 90° Overhead Ortho View"
            >
              <Maximize2 size={14} />
              <span>Top-Down Ortho</span>
            </button>
            <button
              className={`dock-btn ${measureMode ? 'active' : ''}`}
              onClick={() => { setMeasureMode(!measureMode); }}
              style={{ borderColor: measureMode ? 'var(--accent-saffron)' : undefined }}
              title="Click 2 points on terrain to measure distance, building height, and slope"
            >
              <Ruler size={14} color="var(--accent-saffron)" />
              <span>Measure 2-Points</span>
            </button>
          </div>
        </main>

        {/* Right Analytics Drawer */}
        <aside className="right-drawer">
          {/* Surface Point Telemetry (Docked cleanly in Right Drawer, IMPOSSIBLE to overlap canvas options!) */}
          {inspectedPoint ? (
            <div className="sidebar-section" style={{
              background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.08), rgba(124, 77, 255, 0.05))',
              borderBottom: '1px solid var(--border-glow)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: '700', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                  <MapPin size={15} />
                  <span>Inspected Surface Point</span>
                </div>
                <button
                  onClick={() => setInspectedPoint(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Close point probe"
                >
                  <X size={15} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Elevation (Z):</span>
                  <strong style={{ color: '#fff' }}>{inspectedPoint.elevation_m} meters</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Structure Height:</span>
                  <strong style={{ color: 'var(--accent-saffron)' }}>{inspectedPoint.structure_height_m} meters</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Slope / Aspect:</span>
                  <span><strong>{inspectedPoint.slope_deg}°</strong> ({inspectedPoint.aspect_deg}°)</span>
                </div>
                {inspectedPoint.geo_coordinates && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px', background: 'rgba(0,0,0,0.3)', padding: '5px 8px', borderRadius: '4px' }}>
                    UTM: E {inspectedPoint.geo_coordinates.easting_or_lon.toFixed(1)}, N {inspectedPoint.geo_coordinates.northing_or_lat.toFixed(1)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={14} color="var(--accent-cyan)" />
              <span>Click anywhere on 3D terrain to probe height & coordinates</span>
            </div>
          )}

          {/* Validation Metrics */}
          <div className="sidebar-section">
            <div className="section-title">
              <TrendingUp size={14} color="var(--accent-green)" />
              <span>Topographic Accuracy & Validation</span>
            </div>
            <ValidationDashboard
              metrics={currentSession?.metrics}
              metadata={currentSession?.metadata}
              calibration={currentSession?.calibration}
            />
          </div>
        </aside>
      </div>

      {/* Floating Clipboard Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'rgba(11, 16, 29, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--accent-cyan)',
          padding: '12px 20px',
          borderRadius: '30px',
          color: '#fff',
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 1000,
          boxShadow: '0 8px 30px rgba(0,0,0,0.8), 0 0 20px rgba(0, 229, 255, 0.3)'
        }}>
          <ClipboardPaste size={18} color="var(--accent-cyan)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <UploadModal
        isOpen={showUpload}
        initialFile={pastedInitialFile}
        onClose={() => { setShowUpload(false); setPastedInitialFile(null); }}
        onUploadSuccess={(data) => {
          const fullTextures = {};
          Object.keys(data.textures).forEach((k) => {
            fullTextures[k] = `${API_BASE}${data.textures[k]}`;
          });
          data.textures = fullTextures;
          setCurrentSession(data);
          setActiveSampleId('custom');
          showToast('3D Terrain Reconstruction Complete!');
        }}
      />

      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        currentSession={currentSession}
      />

      <ElevationProfileModal
        profileData={profileData}
        onClose={() => setProfileData(null)}
      />

      <ManualModal
        isOpen={showManual}
        onClose={() => setShowManual(false)}
      />
    </div>
  );
}
