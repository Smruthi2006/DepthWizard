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
  CloudSun
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

  // Modals
  const [showUpload, setShowUpload] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showManual, setShowManual] = useState(false);

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
          // Process default 'urban' scene
          processScene('urban', 'dem');
        }
      })
      .catch((err) => console.error('Samples fetch failed:', err));
  }, []);

  const processScene = async (sampleId, calibMethod = 'dem') => {
    setLoading(true);
    setActiveSampleId(sampleId);
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
      // Format texture URLs with API_BASE
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
    // Request elevation transect profile
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
        onUploadClick={() => setShowUpload(true)}
        onExportClick={() => setShowExport(true)}
        onHelpClick={() => setShowManual(true)}
      />

      <div className="workspace-area">
        {/* Left Sidebar: Benchmark Selection & Rendering Controls */}
        <aside className="left-sidebar">
          {/* ISRO Benchmark Landscapes */}
          <div className="sidebar-section">
            <div className="section-title">
              <Layers size={14} color="var(--accent-cyan)" />
              <span>ISRO 4-Landscape Benchmarks</span>
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
                  <div className="landscape-type">0.6m Cartosat-2S</div>
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

        {/* Center 3D Interactive Viewport */}
        <main className="viewport-container">
          {/* Top Layer Switcher Dock */}
          <div className="floating-overlay-top">
            <button
              className={`overlay-btn ${activeLayer === 'optical' ? 'active' : ''}`}
              onClick={() => setActiveLayer('optical')}
            >
              <span>Optical Satellite RGB</span>
            </button>
            <button
              className={`overlay-btn ${activeLayer === 'dsm' ? 'active' : ''}`}
              onClick={() => setActiveLayer('dsm')}
            >
              <span>Metric DSM Heightmap</span>
            </button>
            <button
              className={`overlay-btn ${activeLayer === 'ndsm' ? 'active' : ''}`}
              onClick={() => setActiveLayer('ndsm')}
            >
              <span>nDSM (Structures/Buildings)</span>
            </button>
            <button
              className={`overlay-btn ${activeLayer === 'slope' ? 'active' : ''}`}
              onClick={() => setActiveLayer('slope')}
            >
              <span>Slope & Hazard Map</span>
            </button>
            {currentSession?.metrics && (
              <button
                className={`overlay-btn ${activeLayer === 'residual' ? 'active' : ''}`}
                onClick={() => setActiveLayer('residual')}
              >
                <span>LiDAR Error Residual</span>
              </button>
            )}
          </div>

          {/* Telemetry HUD */}
          {currentSession?.metadata && (
            <div className="hud-telemetry">
              <div className="hud-item">
                <span>SCENE:</span>
                <span className="hud-val">{currentSession.sample_id?.toUpperCase() || 'CUSTOM'}</span>
              </div>
              <div className="hud-item">
                <span>GSD:</span>
                <span className="hud-val">{currentSession.metadata.gsd_m}m / pixel</span>
              </div>
              <div className="hud-item">
                <span>CRS:</span>
                <span className="hud-val">{currentSession.metadata.crs}</span>
              </div>
              <div className="hud-item">
                <span>ELEV RANGE:</span>
                <span className="hud-val">{currentSession.metadata.elevation_min}m - {currentSession.metadata.elevation_max}m</span>
              </div>
              <div className="hud-item">
                <span>MAX STRUCTURE:</span>
                <span className="hud-val" style={{ color: 'var(--accent-saffron)' }}>{currentSession.metadata.max_structure_height_m}m</span>
              </div>
              <div className="hud-item">
                <span>INFERENCE:</span>
                <span className="hud-val">{currentSession.metadata.inference_time_s}s</span>
              </div>
            </div>
          )}

          {/* Point Inspection Card (when user clicks on terrain) */}
          {inspectedPoint && (
            <div style={{
              position: 'absolute',
              top: '16px',
              right: '400px',
              background: 'rgba(11, 16, 29, 0.85)',
              backdropFilter: 'blur(12px)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-glow)',
              zIndex: 15,
              fontSize: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              boxShadow: 'var(--shadow-panel)'
            }}>
              <div style={{ fontWeight: '700', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} />
                <span>Surface Point Telemetry</span>
              </div>
              <div>Elevation: <strong style={{ color: '#fff' }}>{inspectedPoint.elevation_m} meters</strong></div>
              <div>Above-Ground Height: <strong style={{ color: 'var(--accent-saffron)' }}>{inspectedPoint.structure_height_m} meters</strong></div>
              <div>Slope: <strong>{inspectedPoint.slope_deg}°</strong> | Aspect: <strong>{inspectedPoint.aspect_deg}°</strong></div>
              {inspectedPoint.geo_coordinates && (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                  UTM: E {inspectedPoint.geo_coordinates.easting_or_lon.toFixed(1)}, N {inspectedPoint.geo_coordinates.northing_or_lat.toFixed(1)}
                </div>
              )}
            </div>
          )}

          {/* 3D Measurement Results Banner */}
          {measurementResult && (
            <div style={{
              position: 'absolute',
              top: '74px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(11, 16, 29, 0.9)',
              backdropFilter: 'blur(12px)',
              padding: '10px 18px',
              borderRadius: '24px',
              border: '1px solid var(--accent-saffron)',
              zIndex: 15,
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              fontSize: '0.78rem'
            }}>
              <div>📏 3D Distance: <strong>{measurementResult.dist_3d_m}m</strong></div>
              <div>↔️ Horizontal: <strong>{measurementResult.horiz_dist_m}m</strong></div>
              <div>↕️ Height Diff: <strong style={{ color: 'var(--accent-saffron)' }}>{measurementResult.height_diff_m}m</strong></div>
              <div>📐 Slope: <strong>{measurementResult.slope_deg}°</strong></div>
              {profileData && (
                <button
                  className="dock-btn"
                  onClick={() => setProfileData({ ...profileData })}
                  style={{ padding: '4px 10px', fontSize: '0.72rem', background: 'var(--accent-cyan)', color: '#000' }}
                >
                  <TrendingUp size={12} />
                  <span>View Cross-Section</span>
                </button>
              )}
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

          {/* Elevation Colorbar Legend */}
          {currentSession?.metadata && activeLayer !== 'optical' && (
            <div className="elevation-legend">
              <span style={{ fontWeight: '600' }}>
                {activeLayer === 'dsm' && 'Elevation (Meters)'}
                {activeLayer === 'ndsm' && 'Structural Height (Meters)'}
                {activeLayer === 'slope' && 'Slope Steepness (Degrees)'}
                {activeLayer === 'residual' && 'LiDAR Residual Error (Meters)'}
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

          {/* Bottom Flythrough Camera Modes Dock */}
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
              title="Automated Aerial Flyover Loop (For presentations & demonstrations)"
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

        {/* Right Analytics & ISRO Validation Drawer */}
        <aside className="right-drawer">
          <div className="sidebar-section">
            <div className="section-title">
              <TrendingUp size={14} color="var(--accent-green)" />
              <span>ISRO Accuracy & LiDAR Validation</span>
            </div>
            <ValidationDashboard
              metrics={currentSession?.metrics}
              metadata={currentSession?.metadata}
              calibration={currentSession?.calibration}
            />
          </div>
        </aside>
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onUploadSuccess={(data) => {
          const fullTextures = {};
          Object.keys(data.textures).forEach((k) => {
            fullTextures[k] = `${API_BASE}${data.textures[k]}`;
          });
          data.textures = fullTextures;
          setCurrentSession(data);
          setActiveSampleId('custom');
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
