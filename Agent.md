# DepthWizard: Single-View Height Estimation & 3D Flythrough
### ISRO Space Applications Centre (SAC) — Problem Statement ID: 26175

---

## 1. Executive Summary & Problem Formulation
Accurate **Digital Elevation Models (DEMs)** and **Digital Surface Models (DSMs)** are foundational to disaster management, urban planning, hydrological runoff simulation, and defense reconnaissance. Traditionally, elevation acquisition depends on stereo-imaging pairs (e.g. Cartosat stereo), airborne LiDAR, or Interferometric Synthetic Aperture Radar (InSAR). These methodologies present substantial operational friction: they are cost-prohibitive, sensor-dependent, and computationally burdensome.

**DepthWizard** resolves these challenges by introducing an end-to-end, production-grade software pipeline that converts **single-view optical remote-sensing imagery** (0.6m GSD Cartosat-2S or standard RGB) into high-precision, metric elevation models, coupled with an immersive, interactive 3D WebGL flythrough environment.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DepthWizard Architecture                        │
└────────────────────────────────────────────────────────────────────────┘
          ┌──────────────────────────────────────────────┐
          │  Single-View Satellite Optical Image (RGB)   │
          │  (GeoTIFF Cartosat-2S / Non-Georeferenced)   │
          └──────────────────────┬───────────────────────┘
                                 │
                                 ▼
          ┌──────────────────────────────────────────────┐
          │  Monocular Depth Backbone (Depth Anything V2)│
          │  Quantized ONNX Runtime Transformer          │
          └──────────────────────┬───────────────────────┘
                                 │  Relative Depth (rDSM)
                                 ▼
          ┌──────────────────────────────────────────────┐
          │       Metric Scale Calibration Engine        │
          │  • SRTM 30m / Copernicus DEM Frequency Split │
          │  • Ground Control Points (GCPs) Planar Tilt  │
          │  • Semantic Scene Priors (Urban/Hilly/...)   │
          └──────────────────────┬───────────────────────┘
                                 │  Calibrated Absolute Metric DSM
                    ┌────────────┴────────────┐
                    ▼                         ▼
  ┌────────────────────────────────┐ ┌────────────────────────────────┐
  │  Geospatial Processing Layer   │ │   Validation & Accuracy Suite  │
  │  • nDSM Structural Separation  │ │   • RMSE, MAE, Pearson (r)     │
  │  • DTM Bare-Earth Filtering    │ │   • R² Score, LE90 (NSSDA)     │
  │  • Slope & Aspect Hazard Map   │ │   • Residual Error Heatmaps    │
  │  • 2D Elevation Profile        │ │   • Multi-Landscape Benchmarks │
  └────────────────┬───────────────┘ └────────────────┬───────────────┘
                   │                                  │
                   └─────────────────┬────────────────┘
                                     ▼
          ┌──────────────────────────────────────────────┐
          │   3D WebGL Flythrough & Analysis Platform    │
          │   (Three.js + React + Telemetry HUD)         │
          │   • Orthophoto & Colormap Texture Projection │
          │   • Orbit, Drone FPV, Cinematic Flight Modes │
          │   • Interactive 2-Point Building Measurement │
          │   • Multi-Format Export: GeoTIFF, OBJ, PLY   │
          └──────────────────────────────────────────────┘
```

---

## 2. Key Modules & Technical Innovations

### 2.1 Elevation Extraction Module
- **Backbone**: Vision Transformer backbone (`Depth Anything V2`) exported to ONNX Runtime.
- **Inference Latency**: ~2.1 seconds on CPU with zero PyTorch build dependencies.
- **Edge Sharpening**: Bilateral & high-frequency guided spatial filters sharpen building boundaries, roof planes, and tree canopy contours.

### 2.2 Metric Scale Calibration Engine
Single-view monocular depth is scale-agnostic and subject to projective ambiguity. DepthWizard introduces **Frequency-Split Hybrid Fusion**:
1. **Low-Frequency Anchoring**: The coarse reference DEM (SRTM 30m or Copernicus DEM GLO-30) is filtered with a spatial Gaussian kernel ($\sigma \approx 30\text{m}$) to isolate the macroscopic geodetic datum:
   $$\text{DEM}_{\text{low}}(x, y) = \mathcal{G}_{\sigma} * \text{DEM}_{\text{coarse}}(x, y)$$
2. **High-Frequency Detail Transfer**: The monocular relative depth is decomposed into macro-trend and high-frequency structural relief:
   $$d_{\text{high}}(x, y) = d_{\text{rel}}(x, y) - \mathcal{G}_{\sigma} * d_{\text{rel}}(x, y)$$
3. **Calibrated Absolute Metric DSM**:
   $$\text{DSM}_{\text{metric}}(x, y) = \text{DEM}_{\text{low}}(x, y) + s \cdot d_{\text{high}}(x, y)$$
   where $s$ is estimated via Huber-loss robust regression against the reference DEM.
4. **GCP Anchoring**: When Ground Control Points $(x_k, y_k, Z_k)$ are provided, solves a planar tilt and scale regression:
   $$Z(x, y) = s \cdot d_{\text{rel}}(x, y) + a_x \cdot x + a_y \cdot y + Z_0$$

### 2.3 nDSM & Hazard Assessment Module
- **DTM Extraction**: Progressive morphological opening (white top-hat filtering) isolates bare earth elevation.
- **nDSM (Normalized DSM)**: $\text{nDSM} = \text{DSM} - \text{DTM}$ reveals exact vertical heights of buildings and trees above ground level.
- **Slope & Aspect**:
  $$\text{Slope} = \arctan\left(\sqrt{\left(\frac{\partial Z}{\partial x}\right)^2 + \left(\frac{\partial Z}{\partial y}\right)^2}\right) \times \frac{180}{\pi}$$
  High slopes ($>30^\circ$) are classified for landslide risk assessment in disaster management.

### 2.4 Interactive 3D Flythrough Engine (Three.js)
- **High-Performance 3D Displacement Mesh**: Real-time vertex elevation displacement at 60 FPS.
- **Orthophoto Texture Projection**: Satellite RGB seamlessly draped onto the 3D relief.
- **Navigation Modes**:
  1. **Orbit Mode**: 360° turntable inspection, pan, and zoom.
  2. **Drone FPV Mode**: First-person drone flight using `W/A/S/D` and mouse look.
  3. **Cinematic Aerial Flight**: Automated Bezier aerial flyover loop for presentations.
  4. **Nadir Ortho View**: Instant top-down 90° overhead projection.
- **Analytical Measurement Tool**: Interactive raycasting permits measuring 3D distances, building roof heights ($\Delta Z$), and slope angles directly on the 3D surface.

---

## 3. Evaluation Benchmark Suite (Cartosat-2S ~0.6m GSD)
DepthWizard includes pre-packaged, validated benchmarks representing the 4 ISRO landscapes:

| Landscape Category | GSD (m) | Coordinate Reference System | Relief Range | Features |
|:---|:---:|:---:|:---:|:---|
| **Urban** | 0.60m | EPSG:32643 (UTM 43N) | 50m – 110m | Street grid, multi-story buildings, rooftops, courtyards |
| **Sparse / Semi-Arid**| 0.60m | EPSG:32643 (UTM 43N) | 204m – 238m | Flat desert plains, isolated homesteads, wind masts |
| **Hilly / Mountainous**| 0.60m | EPSG:32643 (UTM 43N) | 469m – 977m | Steep ridge crests, valleys, slopes up to 45° |
| **Forested** | 0.60m | EPSG:32643 (UTM 43N) | 325m – 369m | Organic canopy biomass heights (12m–28m), clearings |

### Validation Metrics Computed:
- **RMSE (Root Mean Square Error)**: Measures overall metric accuracy against reference LiDAR.
- **MAE (Mean Absolute Error)**: Average absolute vertical deviation.
- **Pearson ($r$) & $R^2$**: Structural elevation correlation.
- **LE90 (Linear Error at 90% Confidence)**: Standard NSSDA geospatial accuracy metric.
- **Residual Error Heatmap**: Spatially distributed error matrix rendered in real time.

---

## 4. Multi-Format Deliverables & Export
- **Calibrated GeoTIFF**: Standard 32-bit floating point raster with valid CRS, GeoTransform, and NoData tags.
- **Wavefront OBJ**: 3D terrain geometry + MTL file + projected optical texture for Blender, Unity, or GIS software.
- **Stanford PLY**: 3D colored point cloud with RGB vertex attributes.
- **ISRO Validation Certificate**: Structured JSON metadata including all accuracy metrics and calibration coefficients.

---

## 5. Verification & Quickstart Guide

### One-Click Launch
```powershell
python run_depthwizard.py
```
This automatically launches the FastAPI backend and opens the interactive 3D WebGL platform at `http://localhost:8000`.

### Manual Service Execution
```powershell
# Terminal 1: Backend Server
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000

# Terminal 2: Frontend Dev Server (Optional, if editing React components)
cd frontend
npm run dev
```

### API Endpoints
- `GET  /api/status` : System and backbone readiness.
- `GET  /api/samples`: List all 4 benchmark datasets.
- `POST /api/process/sample`: Run inference, calibration, and accuracy metrics.
- `POST /api/upload`: Process custom user-uploaded GeoTIFF or PNG/JPG image.
- `POST /api/analyze/point`: Point query for elevation, building height, and slope.
- `POST /api/analyze/profile`: Extract 2D elevation transect profile along a line.
- `POST /api/export/mesh`: Export 3D OBJ or PLY mesh.
