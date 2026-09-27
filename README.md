# 🛰️ DepthWizard: Single-View Height Estimation & 3D Flythrough
### ISRO Space Applications Centre (SAC) — Smart India Hackathon (SIH 2026)
**Problem Statement ID:** 26175  
**Theme:** Disaster Management / Remote Sensing / Space Applications

---

## 🚀 Overview
**DepthWizard** is an end-to-end, production-grade geospatial and computer vision platform that converts **single-view optical remote-sensing imagery** (0.6m GSD Cartosat-2S or standard high-resolution RGB satellite photos) into high-precision, metric **Digital Surface Models (DSMs)** and an interactive **3D WebGL Flythrough** environment with real-time terrain navigation, structural height measurement, and hazard analysis.

DepthWizard bridges the foundational domain gap between natural egocentric monocular depth estimation and top-down aerial remote sensing using transformer depth backbones, frequency-split calibration, and high-performance WebGL rendering.

---

## ✨ Key Features

### 1. High-Fidelity Elevation Extraction
- Powered by a **Depth Anything V2** monocular vision transformer backbone optimized with **ONNX Runtime**.
- High-frequency edge-preserving bilateral filtering that sharpens building footprints, rooftops, and ridgelines.
- Sub-2 second inference latency on CPU with zero heavy PyTorch dependencies required at runtime.

### 2. Multi-Mode Metric Scale Calibration
- **Coarse DEM Anchoring (SRTM 30m / Copernicus DEM 30m):** Uses Frequency-Split Hybrid Fusion (Butterworth low-pass coarse DEM + high-pass relative depth) to anchor macro-topography to the geodetic reference while maintaining sub-meter building heights.
- **Ground Control Points (GCPs):** Planar tilt ($\alpha, \beta, \gamma$) and linear scale estimation from sparse survey points.
- **Scene-Level Semantic Priors:** Translates relative rDSM to real-world metric scales for arbitrary non-georeferenced images.

### 3. Advanced Geospatial & Structural Analytics
- **nDSM Structural Separation:** Isolates building and tree canopy heights from bare-earth DTM via progressive morphological filtering (White Top-Hat opening).
- **Slope & Aspect Hazard Maps:** Real-time calculation of terrain gradient in degrees and aspect direction to flag landslide and runoff hazard zones.
- **Interactive 2D Elevation Transects:** Click-and-drag cross-section elevation profiling with distance and slope statistics.
- **Surface Point Inspector:** Instant readout of elevation (m), structural height (nDSM), slope angle, and geographic coordinates without obscuring the 3D viewport.

### 4. Immersive 3D Flythrough & Visualization (Three.js WebGL)
- **Zero-Overlap Aerospace UI:** Clean floating HUD with telemetry dock, top layer switcher, and collapsible diagnostic drawers.
- **High-Performance 3D Displacement Mesh:** Dynamic vertex displacement rendering at a smooth 60 FPS.
- **Orthophoto Texture Draping:** Satellite RGB imagery seamlessly mapped onto 3D relief with hot-swappable layers (DSM, nDSM, Slope, LiDAR Error).
- **4 Camera Navigation Modes:** Orbit Turntable, First-Person Drone flight (`W/A/S/D`), Automated Cinematic Flyover route, and Nadir Ortho view.
- **3D Measurement Tool:** Measure 3D distances, building roof heights ($\Delta Z$), and slope angles with real-time visual laser lines.

### 5. Multi-Source Imagery & Clipboard Paste Support
- **Clipboard `Ctrl+V` Paste:** Copy any satellite image directly from Google Images, web browsers, or screenshot tools and paste it directly into DepthWizard.
- **Local File Upload:** Drag-and-drop or browse GeoTIFF and RGB images.
- **Pre-Packaged 4-Landscape Benchmark Suite:** Validated benchmark scenes for Urban, Sparse / Semi-Arid, Hilly / Mountainous, and Forested terrains.

### 6. Full Deliverables & Export Suite
- **GeoTIFF (.tif):** 32-bit floating point metric DSM with complete CRS and GeoTransform.
- **Wavefront OBJ (.obj + .mtl):** 3D textured mesh ready for Blender, Unity, Unreal Engine, and CAD.
- **Stanford PLY (.ply):** Georeferenced colored 3D point cloud.
- **Validation Certificate (.json):** Machine-readable evaluation report with RMSE, MAE, Pearson $r$, $R^2$, and LE90.

---

## ⚡ Quickstart

### Prerequisites
- Python 3.10+ (Python 3.11 / 3.14 tested)
- Node.js 18+ (tested with v25)

### One-Click Launch
```bash
python run_depthwizard.py
```
This automatically starts the backend server and opens your browser to:
👉 `http://localhost:8000`

---

## 📁 Repository Structure

```
DepthWizard/
├── backend/
│   ├── app.py                     # FastAPI REST API & static file server
│   ├── model_backbone.py          # Depth Anything V2 ONNX monocular backbone
│   ├── scale_calibrator.py        # Scale calibration (DEM frequency-split, GCPs, Priors)
│   ├── dem_processor.py           # GeoTIFF I/O, nDSM separation, slope, aspect, profiles
│   ├── validation_metrics.py      # Accuracy evaluator (RMSE, MAE, R², LE90, histograms)
│   ├── sample_generator.py        # ISRO 4-landscape benchmark synthesizer
│   └── export_service.py          # Multi-format exports (GeoTIFF, OBJ, PLY, JSON)
├── data/
│   ├── samples/                   # Pre-packaged Urban, Sparse, Hilly, Forested benchmarks
│   └── outputs/                   # Processed sessions, textures, and exported deliverables
├── frontend/                      # Modern React + Three.js WebGL application
│   ├── src/
│   │   ├── components/
│   │   │   ├── TerrainViewer3D.jsx      # Three.js 3D viewport & camera controller
│   │   │   ├── NavigationHeader.jsx     # Top telemetry navigation bar
│   │   │   ├── ValidationDashboard.jsx  # Accuracy metrics & histogram chart
│   │   │   ├── ElevationProfileModal.jsx# 2D cross-section transect modal
│   │   │   ├── UploadModal.jsx          # Custom imagery upload modal
│   │   │   ├── ExportModal.jsx          # Deliverables download modal
│   │   │   └── ManualModal.jsx          # Technical architecture & verification manual
│   │   ├── App.jsx                      # Main application shell
│   │   └── index.css                    # Dark aerospace glassmorphic styling
│   └── package.json
├── run_depthwizard.py             # One-click launcher script
├── Agent.md                       # Comprehensive Technical Architecture & Verification Manual
└── README.md                      # Project documentation
```

---

## 📊 Evaluation Criteria & Validation Metrics

| Metric | Target | Description |
|:---|:---:|:---|
| **RMSE (m)** | Minimal | Root Mean Square Error compared against LiDAR reference |
| **MAE (m)** | Minimal | Mean Absolute Error across all valid pixels |
| **Pearson (r)** | $\sim 0.85 - 0.98$ | Linear correlation with real elevation profiles |
| **$R^2$ Score** | $\sim 0.70 - 0.96$ | Coefficient of determination |
| **LE90 (m)** | Benchmark | Linear Error at 90% confidence level (NSSDA standard) |
| **% within $\pm 2$m** | $> 80\%$ | Percentage of terrain pixels within 2 meters vertical error |

---

## 🛰️ ISRO Mentors & Contact Info
- **Hemant Kumar Lalwani**: [hemant.lalwani@sac.isro.gov.in](mailto:hemant.lalwani@sac.isro.gov.in)
- **Ashutosh Gupta**: [ashutoshg@sac.isro.gov.in](mailto:ashutoshg@sac.isro.gov.in)
- **Jugal Patel**: [jugal.patel@sac.isro.gov.in](mailto:jugal.patel@sac.isro.gov.in)

*Organization: Indian Space Research Organisation (ISRO) — Space Applications Centre (SAC)*
