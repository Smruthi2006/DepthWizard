"""
DepthWizard - FastAPI Backend Server
Unified Geospatial Elevation Estimation, Metric Scale Calibration,
and 3D Terrain Analysis REST API.
"""

import os
import io
import time
import json
import logging
import numpy as np
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.model_backbone import MonocularDepthBackbone
from backend.scale_calibrator import ScaleCalibrator
from backend.dem_processor import DEMProcessor
from backend.validation_metrics import AccuracyEvaluator
from backend.sample_generator import SampleDatasetGenerator
from backend.export_service import ExportService

logger = logging.getLogger("DepthWizard.Server")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="DepthWizard - Single-View Height Estimation & 3D Flythrough",
    description="End-to-End Elevation Mapping & 3D Visualization Pipeline",
    version="1.0.0"
)

# Enable CORS for local Vite dev server and standalone deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Workspace directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
SAMPLES_DIR = os.path.join(DATA_DIR, "samples")
OUTPUTS_DIR = os.path.join(DATA_DIR, "outputs")
os.makedirs(SAMPLES_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)

# Mount outputs directory for direct browser texture loading
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

# Mount built frontend dist for standalone zero-config deployment
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

@app.get("/")
def serve_index():
    if os.path.exists(os.path.join(FRONTEND_DIST, "index.html")):
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
    return {"message": "DepthWizard API online. Frontend build not found."}

# Lazy-loaded model instance
_backbone = None

def get_backbone() -> MonocularDepthBackbone:
    global _backbone
    if _backbone is None:
        logger.info("Initializing Depth Anything V2 monocular backbone...")
        _backbone = MonocularDepthBackbone()
    return _backbone

# In-memory session cache for fast interactive inspection
SESSION_CACHE = {}

@app.on_event("startup")
async def startup_event():
    """Ensure benchmark datasets are generated on startup."""
    manifest_file = os.path.join(SAMPLES_DIR, "manifest.json")
    if not os.path.exists(manifest_file):
        logger.info("Generating initial benchmark datasets...")
        SampleDatasetGenerator.generate_all_samples(SAMPLES_DIR)
    logger.info("DepthWizard backend ready.")

@app.get("/api/status")
def get_status():
    return {
        "status": "ONLINE",
        "service": "DepthWizard",
        "model_backbone": "Depth Anything V2 (Quantized Transformer)",
        "capabilities": [
            "Non-Georeferenced rDSM Generation",
            "Georeferenced Metric DSM Calibration",
            "SRTM / Copernicus DEM Frequency Split Calibration",
            "GCP Planar/Linear Anchoring",
            "nDSM Building Height Separation",
            "Slope & Hazard Analysis",
            "LiDAR Benchmark Accuracy Validation (RMSE/MAE/R²/LE90)",
            "3D Flythrough Mesh & Texture Synthesis",
            "GeoTIFF, OBJ, PLY, STL Export"
        ]
    }

@app.get("/api/samples")
def list_samples():
    manifest_file = os.path.join(SAMPLES_DIR, "manifest.json")
    if not os.path.exists(manifest_file):
        SampleDatasetGenerator.generate_all_samples(SAMPLES_DIR)
    with open(manifest_file, "r") as f:
        manifest = json.load(f)
    return {"samples": manifest}

@app.post("/api/process/sample")
def process_sample(payload: dict):
    """
    Runs end-to-end pipeline on one of the 4 benchmark datasets:
    urban, sparse, hilly, or forested.
    """
    sample_id = payload.get("sample_id", "urban").lower()
    calib_method = payload.get("calibration_method", "dem") # 'dem', 'gcps', 'scene_prior'
    refine_edges = payload.get("refine_edges", True)
    sample_dir = os.path.join(SAMPLES_DIR, sample_id)

    if not os.path.exists(sample_dir):
        raise HTTPException(status_code=404, detail=f"Sample '{sample_id}' not found.")

    rgb_png = os.path.join(sample_dir, "optical_rgb.png")
    ref_dsm_path = os.path.join(sample_dir, "reference_dsm_lidar.tif")
    coarse_dem_path = os.path.join(sample_dir, "coarse_dem_srtm30m.tif")
    gcps_path = os.path.join(sample_dir, "gcps.json")

    # 1. Load optical image
    pil_img = Image.open(rgb_png).convert("RGB")
    rgb_arr = np.array(pil_img)
    h, w, _ = rgb_arr.shape

    # 2. Extract Relative Depth with Monocular Backbone
    backbone = get_backbone()
    pred_res = backbone.predict(pil_img, target_size=518, refine_edges=refine_edges)
    rdsm = pred_res["rdsm"]

    # 3. Read reference data
    import rasterio
    with rasterio.open(ref_dsm_path) as src:
        true_dsm = src.read(1)
        gsd = abs(src.transform[0])
        crs_str = src.crs.to_string() if src.crs else "EPSG:32643"
        bounds = {"left": src.bounds.left, "top": src.bounds.top, "right": src.bounds.right, "bottom": src.bounds.bottom}

    with rasterio.open(coarse_dem_path) as src:
        coarse_dem = src.read(1)

    with open(gcps_path, "r") as f:
        gcps = json.load(f)

    # 4. Perform Metric Scale Calibration
    if calib_method == "gcps" and gcps:
        calib_res = ScaleCalibrator.calibrate_with_gcps(rdsm, gcps)
    elif calib_method == "scene_prior":
        calib_res = ScaleCalibrator.calibrate_with_scene_priors(rdsm, landscape_type=sample_id)
    else: # Default: 'dem' (SRTM/Copernicus 30m)
        calib_res = ScaleCalibrator.calibrate_with_dem(rdsm, coarse_dem, spatial_resolution_m=gsd)

    calibrated_dsm = calib_res["dsm"]

    # 5. Extract bare-earth DTM and structural heights nDSM
    dtm, ndsm = DEMProcessor.extract_ndsm_and_dtm(calibrated_dsm, gsd=gsd)

    # 6. Calculate Slope and Aspect
    slope_deg, aspect_deg = DEMProcessor.compute_slope_and_aspect(calibrated_dsm, gsd=gsd)

    # 7. Evaluate Accuracy against Ground Truth LiDAR
    eval_metrics = AccuracyEvaluator.evaluate(calibrated_dsm, true_dsm)

    # 8. Save visualization textures
    session_id = f"{sample_id}_{int(time.time())}"
    session_out_dir = os.path.join(OUTPUTS_DIR, session_id)
    os.makedirs(session_out_dir, exist_ok=True)

    # Save optical texture
    tex_path = os.path.join(session_out_dir, "texture_optical.jpg")
    pil_img.save(tex_path, "JPEG", quality=92)

    # Save DSM colormap image (turbo)
    dsm_col_img = DEMProcessor.generate_colormap_image(calibrated_dsm, "turbo")
    dsm_col_path = os.path.join(session_out_dir, "texture_dsm.jpg")
    dsm_col_img.save(dsm_col_path, "JPEG", quality=90)

    # Save nDSM colormap image (magma)
    ndsm_col_img = DEMProcessor.generate_colormap_image(ndsm, "magma")
    ndsm_col_path = os.path.join(session_out_dir, "texture_ndsm.jpg")
    ndsm_col_img.save(ndsm_col_path, "JPEG", quality=90)

    # Save Slope colormap image (viridis)
    slope_col_img = DEMProcessor.generate_colormap_image(slope_deg, "viridis")
    slope_col_path = os.path.join(session_out_dir, "texture_slope.jpg")
    slope_col_img.save(slope_col_path, "JPEG", quality=90)

    # Save Residual Error colormap image (seismic/coolwarm)
    residual_col_img = DEMProcessor.generate_colormap_image(eval_metrics["residual_map"], "coolwarm")
    res_col_path = os.path.join(session_out_dir, "texture_residual.jpg")
    residual_col_img.save(res_col_path, "JPEG", quality=90)

    # Save calibrated GeoTIFF
    geotiff_out_path = os.path.join(session_out_dir, f"{sample_id}_calibrated_dsm.tif")
    DEMProcessor.write_geotiff(calibrated_dsm, geotiff_out_path, crs_str=crs_str, bounds=bounds, gsd=gsd)

    # Downsampled elevation matrix for Three.js terrain mesh (e.g. 128x128 for 60fps WebGL)
    mesh_res = 128
    from scipy.ndimage import zoom as scipy_zoom
    downsample_factor = h / mesh_res
    elevation_matrix = scipy_zoom(calibrated_dsm, (mesh_res / h, mesh_res / w), order=1)

    # Cache session
    SESSION_CACHE[session_id] = {
        "calibrated_dsm": calibrated_dsm,
        "true_dsm": true_dsm,
        "dtm": dtm,
        "ndsm": ndsm,
        "slope": slope_deg,
        "aspect": aspect_deg,
        "rgb_arr": rgb_arr,
        "gsd": gsd,
        "crs": crs_str,
        "bounds": bounds,
        "session_dir": session_out_dir
    }

    return {
        "session_id": session_id,
        "sample_id": sample_id,
        "metadata": {
            "width": w,
            "height": h,
            "gsd_m": round(gsd, 2),
            "crs": crs_str,
            "bounds": bounds,
            "elevation_min": round(float(np.min(calibrated_dsm)), 2),
            "elevation_max": round(float(np.max(calibrated_dsm)), 2),
            "elevation_mean": round(float(np.mean(calibrated_dsm)), 2),
            "max_structure_height_m": round(float(np.max(ndsm)), 2),
            "max_slope_deg": round(float(np.max(slope_deg)), 1),
            "inference_time_s": round(pred_res["inference_time"], 3)
        },
        "calibration": {
            "method": calib_res.get("method"),
            "scale": round(calib_res.get("scale", 1.0), 3),
            "offset": round(calib_res.get("offset", 0.0), 2)
        },
        "metrics": {
            "rmse_m": eval_metrics.get("rmse_m"),
            "mae_m": eval_metrics.get("mae_m"),
            "mbe_m": eval_metrics.get("mbe_m"),
            "pearson_r": eval_metrics.get("pearson_r"),
            "r2_score": eval_metrics.get("r2_score"),
            "le90_m": eval_metrics.get("le90_m"),
            "pct_within_1m": eval_metrics.get("pct_within_1m"),
            "pct_within_2m": eval_metrics.get("pct_within_2m"),
            "pct_within_5m": eval_metrics.get("pct_within_5m"),
            "histogram": eval_metrics.get("histogram")
        },
        "textures": {
            "optical": f"/outputs/{session_id}/texture_optical.jpg",
            "dsm": f"/outputs/{session_id}/texture_dsm.jpg",
            "ndsm": f"/outputs/{session_id}/texture_ndsm.jpg",
            "slope": f"/outputs/{session_id}/texture_slope.jpg",
            "residual": f"/outputs/{session_id}/texture_residual.jpg"
        },
        "mesh_data": {
            "grid_size": mesh_res,
            "elevations": elevation_matrix.flatten().tolist(),
            "min_elevation": float(np.min(elevation_matrix)),
            "max_elevation": float(np.max(elevation_matrix))
        },
        "geotiff_download": f"/outputs/{session_id}/{sample_id}_calibrated_dsm.tif"
    }

@app.post("/api/upload")
async def handle_upload(
    file: UploadFile = File(...),
    calibration_method: str = Form("scene_prior"),
    landscape_type: str = Form("urban"),
    ref_dem_file: UploadFile = File(None)
):
    """
    Accepts arbitrary user-uploaded imagery:
    - Non-georeferenced RGB (PNG, JPG) -> produces rDSM / prior calibrated DSM
    - Georeferenced GeoTIFF (TIFF, TIF) -> extracts CRS/transform & produces metric DSM
    """
    contents = await file.read()
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()

    session_id = f"upload_{int(time.time())}"
    session_out_dir = os.path.join(OUTPUTS_DIR, session_id)
    os.makedirs(session_out_dir, exist_ok=True)

    input_file_path = os.path.join(session_out_dir, filename)
    with open(input_file_path, "wb") as f:
        f.write(contents)

    is_geotiff = ext in [".tif", ".tiff"]
    gsd = 0.6
    crs_str = "NON_GEOREFERENCED"
    bounds = None

    if is_geotiff:
        try:
            geo_info = DEMProcessor.read_geotiff(input_file_path)
            pil_img = Image.fromarray(geo_info["image"])
            rgb_arr = geo_info["image"]
            gsd = geo_info["gsd"]
            crs_str = geo_info["crs"]
            bounds = geo_info["bounds"]
        except Exception as e:
            logger.warning(f"Could not parse as GeoTIFF, falling back to PIL: {e}")
            pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
            rgb_arr = np.array(pil_img)
            is_geotiff = False
    else:
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
        rgb_arr = np.array(pil_img)

    h, w, _ = rgb_arr.shape

    # Monocular relative depth inference
    backbone = get_backbone()
    pred_res = backbone.predict(pil_img, target_size=518, refine_edges=True)
    rdsm = pred_res["rdsm"]

    # Scale calibration
    if ref_dem_file is not None and is_geotiff:
        ref_contents = await ref_dem_file.read()
        ref_dem_path = os.path.join(session_out_dir, "uploaded_ref_dem.tif")
        with open(ref_dem_path, "wb") as f:
            f.write(ref_contents)
        import rasterio
        with rasterio.open(ref_dem_path) as src:
            coarse_dem = src.read(1)
        calib_res = ScaleCalibrator.calibrate_with_dem(rdsm, coarse_dem, spatial_resolution_m=gsd)
    else:
        # Default scene prior calibration
        calib_res = ScaleCalibrator.calibrate_with_scene_priors(rdsm, landscape_type=landscape_type)

    calibrated_dsm = calib_res["dsm"]

    # nDSM and Slope
    dtm, ndsm = DEMProcessor.extract_ndsm_and_dtm(calibrated_dsm, gsd=gsd)
    slope_deg, aspect_deg = DEMProcessor.compute_slope_and_aspect(calibrated_dsm, gsd=gsd)

    # Save textures
    tex_path = os.path.join(session_out_dir, "texture_optical.jpg")
    pil_img.save(tex_path, "JPEG", quality=92)

    dsm_col_img = DEMProcessor.generate_colormap_image(calibrated_dsm, "turbo")
    dsm_col_path = os.path.join(session_out_dir, "texture_dsm.jpg")
    dsm_col_img.save(dsm_col_path, "JPEG", quality=90)

    ndsm_col_img = DEMProcessor.generate_colormap_image(ndsm, "magma")
    ndsm_col_path = os.path.join(session_out_dir, "texture_ndsm.jpg")
    ndsm_col_img.save(ndsm_col_path, "JPEG", quality=90)

    slope_col_img = DEMProcessor.generate_colormap_image(slope_deg, "viridis")
    slope_col_path = os.path.join(session_out_dir, "texture_slope.jpg")
    slope_col_img.save(slope_col_path, "JPEG", quality=90)

    geotiff_out_path = os.path.join(session_out_dir, "calibrated_dsm.tif")
    DEMProcessor.write_geotiff(calibrated_dsm, geotiff_out_path, crs_str=crs_str if is_geotiff else "EPSG:32643", bounds=bounds, gsd=gsd)

    # Downsampled mesh
    mesh_res = 128
    from scipy.ndimage import zoom as scipy_zoom
    elevation_matrix = scipy_zoom(calibrated_dsm, (mesh_res / h, mesh_res / w), order=1)

    SESSION_CACHE[session_id] = {
        "calibrated_dsm": calibrated_dsm,
        "dtm": dtm,
        "ndsm": ndsm,
        "slope": slope_deg,
        "aspect": aspect_deg,
        "rgb_arr": rgb_arr,
        "gsd": gsd,
        "crs": crs_str,
        "bounds": bounds,
        "session_dir": session_out_dir
    }

    return {
        "session_id": session_id,
        "filename": filename,
        "is_georeferenced": is_geotiff,
        "metadata": {
            "width": w,
            "height": h,
            "gsd_m": round(gsd, 2),
            "crs": crs_str,
            "bounds": bounds,
            "elevation_min": round(float(np.min(calibrated_dsm)), 2),
            "elevation_max": round(float(np.max(calibrated_dsm)), 2),
            "elevation_mean": round(float(np.mean(calibrated_dsm)), 2),
            "max_structure_height_m": round(float(np.max(ndsm)), 2),
            "max_slope_deg": round(float(np.max(slope_deg)), 1),
            "inference_time_s": round(pred_res["inference_time"], 3)
        },
        "calibration": {
            "method": calib_res.get("method"),
            "scale": round(calib_res.get("scale", 1.0), 3),
            "offset": round(calib_res.get("offset", 0.0), 2)
        },
        "textures": {
            "optical": f"/outputs/{session_id}/texture_optical.jpg",
            "dsm": f"/outputs/{session_id}/texture_dsm.jpg",
            "ndsm": f"/outputs/{session_id}/texture_ndsm.jpg",
            "slope": f"/outputs/{session_id}/texture_slope.jpg"
        },
        "mesh_data": {
            "grid_size": mesh_res,
            "elevations": elevation_matrix.flatten().tolist(),
            "min_elevation": float(np.min(elevation_matrix)),
            "max_elevation": float(np.max(elevation_matrix))
        },
        "geotiff_download": f"/outputs/{session_id}/calibrated_dsm.tif"
    }

@app.post("/api/analyze/profile")
def analyze_elevation_profile(payload: dict):
    """
    Extracts elevation profile cross-section along a line from p1(x, y) to p2(x, y).
    """
    session_id = payload.get("session_id")
    p1 = payload.get("p1", [0, 0])
    p2 = payload.get("p2", [511, 511])

    if session_id not in SESSION_CACHE:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    dsm = SESSION_CACHE[session_id]["calibrated_dsm"]
    gsd = SESSION_CACHE[session_id]["gsd"]

    profile = DEMProcessor.sample_elevation_profile(dsm, tuple(p1), tuple(p2), num_points=120, gsd=gsd)
    return profile

@app.post("/api/analyze/point")
def analyze_point(payload: dict):
    """
    Point inspection: returns elevation, structure height, slope, and aspect at (pixel_x, pixel_y).
    """
    session_id = payload.get("session_id")
    px = int(payload.get("x", 0))
    py = int(payload.get("y", 0))

    if session_id not in SESSION_CACHE:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    session = SESSION_CACHE[session_id]
    dsm = session["calibrated_dsm"]
    ndsm = session["ndsm"]
    slope = session["slope"]
    aspect = session["aspect"]
    h, w = dsm.shape

    px = max(0, min(w - 1, px))
    py = max(0, min(h - 1, py))

    # Geographic coordinate conversion if georeferenced
    geo_x, geo_y = None, None
    if session.get("bounds"):
        b = session["bounds"]
        geo_x = b["left"] + px * session["gsd"]
        geo_y = b["top"] - py * session["gsd"]

    return {
        "pixel": [px, py],
        "elevation_m": round(float(dsm[py, px]), 2),
        "structure_height_m": round(float(ndsm[py, px]), 2),
        "slope_deg": round(float(slope[py, px]), 1),
        "aspect_deg": round(float(aspect[py, px]), 1),
        "geo_coordinates": {"easting_or_lon": geo_x, "northing_or_lat": geo_y} if geo_x else None
    }

@app.post("/api/export/mesh")
def export_3d_mesh(payload: dict):
    """
    Exports 3D mesh in OBJ or PLY format.
    """
    session_id = payload.get("session_id")
    mesh_format = payload.get("format", "obj").lower()
    vertical_scale = float(payload.get("vertical_scale", 1.0))

    if session_id not in SESSION_CACHE:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    session = SESSION_CACHE[session_id]
    dsm = session["calibrated_dsm"]
    rgb_arr = session["rgb_arr"]
    session_dir = session["session_dir"]
    tex_img = Image.fromarray(rgb_arr)

    if mesh_format == "ply":
        ply_path = os.path.join(session_dir, "terrain_mesh.ply")
        ExportService.export_ply_mesh(dsm, rgb_arr, ply_path, downsample_factor=2, gsd=session["gsd"])
        return {"download_url": f"/outputs/{session_id}/terrain_mesh.ply"}
    else: # Default OBJ
        obj_path = os.path.join(session_dir, "terrain_mesh.obj")
        ExportService.export_obj_mesh(dsm, tex_img, obj_path, downsample_factor=2, vertical_scale=vertical_scale, gsd=session["gsd"])
        return {
            "obj_url": f"/outputs/{session_id}/terrain_mesh.obj",
            "mtl_url": f"/outputs/{session_id}/terrain_mesh.mtl",
            "texture_url": f"/outputs/{session_id}/terrain_mesh_texture.jpg"
        }
