"""
DepthWizard - Metric Scale Calibration Module
Converts scale-agnostic monocular relative depth/height into Absolute Digital Surface Models (DSM)
in real-world meters using Low-Resolution Reference DEMs (SRTM 30m / Copernicus DEM 30m),
Ground Control Points (GCPs), and Scene-Level Statistical Priors.
"""

import logging
import numpy as np
from scipy.ndimage import gaussian_filter, zoom
from scipy.optimize import minimize

logger = logging.getLogger("DepthWizard.Calibrator")

class ScaleCalibrator:
    """
    Calibrates monocular relative depth maps to absolute metric elevations (meters).
    """

    @staticmethod
    def calibrate_with_dem(
        rdsm: np.ndarray,
        coarse_dem: np.ndarray,
        spatial_resolution_m: float = 0.6,
        alpha_high_freq: float = 1.0,
        dem_nodata: float = -9999.0
    ) -> dict:
        """
        Calibrates rDSM using a lower-resolution DEM (e.g. SRTM 30m or Copernicus DEM 30m).
        Uses Frequency-Split Hybrid Fusion to anchor macro-topography to the reference DEM
        while preserving crisp high-frequency structural building/canopy heights.
        """
        h_target, w_target = rdsm.shape
        h_coarse, w_coarse = coarse_dem.shape

        # Step 1: Resample coarse DEM to match the optical image grid
        if (h_coarse, w_coarse) != (h_target, w_target):
            zoom_y = h_target / h_coarse
            zoom_x = w_target / w_coarse
            resampled_dem = zoom(coarse_dem, (zoom_y, zoom_x), order=1)
        else:
            resampled_dem = coarse_dem.copy()

        valid_mask = (resampled_dem != dem_nodata) & np.isfinite(resampled_dem)
        if not np.any(valid_mask):
            raise ValueError("Reference DEM contains no valid elevation pixels.")

        # Step 2: Robust Least Squares regression for global scale and translation
        rdsm_valid = rdsm[valid_mask]
        dem_valid = resampled_dem[valid_mask]

        # Use 10th and 90th percentiles to avoid outliers (e.g. cloud shadows or sensor noise)
        p10_r, p90_r = np.percentile(rdsm_valid, 10), np.percentile(rdsm_valid, 90)
        p10_d, p90_d = np.percentile(dem_valid, 10), np.percentile(dem_valid, 90)

        delta_r = p90_r - p10_r
        delta_d = p90_d - p10_d

        if delta_r > 1e-5:
            init_scale = float(delta_d / delta_r)
        else:
            init_scale = 30.0  # sensible default

        init_offset = float(np.median(dem_valid) - init_scale * np.median(rdsm_valid))

        # Huber loss robust refinement
        def huber_objective(params):
            s, t = params
            pred = s * rdsm_valid + t
            diff = pred - dem_valid
            delta = 3.0  # meters threshold
            abs_diff = np.abs(diff)
            loss = np.where(abs_diff <= delta, 0.5 * diff**2, delta * (abs_diff - 0.5 * delta))
            return np.mean(loss)

        opt_res = minimize(huber_objective, [init_scale, init_offset], method='Nelder-Mead')
        opt_scale, opt_offset = opt_res.x

        # Step 3: Frequency-Split Fusion
        # High-pass filter on monocular depth: extracts fine architectural edges & tree canopies
        # Low-pass filter on coarse DEM: provides stable geodetic ground surface
        sigma_pixels = int(30.0 / max(spatial_resolution_m, 0.1))  # 30m equivalent filter radius
        
        rdsm_low = gaussian_filter(rdsm, sigma=sigma_pixels)
        rdsm_high = rdsm - rdsm_low

        dem_low = gaussian_filter(resampled_dem, sigma=sigma_pixels)

        # Reconstructed Absolute DSM:
        # Ground base from coarse DEM low-pass + Calibrated high-frequency structures
        calibrated_dsm = dem_low + (opt_scale * alpha_high_freq) * rdsm_high

        # Ensure values stay within physically plausible bounds of the region
        dem_min = float(np.min(dem_valid))
        dem_max = float(np.max(dem_valid))
        buffer = max(50.0, (dem_max - dem_min) * 0.3)
        calibrated_dsm = np.clip(calibrated_dsm, dem_min - 20.0, dem_max + buffer)

        logger.info(f"DEM Calibration: Scale={opt_scale:.2f}, Offset={opt_offset:.2f}m, Output Range=[{calibrated_dsm.min():.1f}m, {calibrated_dsm.max():.1f}m]")

        return {
            "dsm": calibrated_dsm.astype(np.float32),
            "resampled_ref_dem": resampled_dem.astype(np.float32),
            "scale": float(opt_scale),
            "offset": float(opt_offset),
            "method": "Reference_DEM_Frequency_Split",
            "min_elevation": float(np.min(calibrated_dsm)),
            "max_elevation": float(np.max(calibrated_dsm)),
            "mean_elevation": float(np.mean(calibrated_dsm))
        }

    @staticmethod
    def calibrate_with_gcps(
        rdsm: np.ndarray,
        gcps: list[dict],
        plane_tilt: bool = True
    ) -> dict:
        """
        Calibrates rDSM using sparse Ground Control Points (GCPs).
        Each GCP is a dict: {'x': pixel_col, 'y': pixel_row, 'z': metric_elevation_meters}
        """
        if len(gcps) == 0:
            raise ValueError("At least 1 Ground Control Point is required.")

        h, w = rdsm.shape
        x_pts = np.array([g['x'] for g in gcps], dtype=np.float32)
        y_pts = np.array([g['y'] for g in gcps], dtype=np.float32)
        z_pts = np.array([g['z'] for g in gcps], dtype=np.float32)

        # Sample rDSM values at GCP pixel locations
        col_indices = np.clip(np.round(x_pts).astype(int), 0, w - 1)
        row_indices = np.clip(np.round(y_pts).astype(int), 0, h - 1)
        r_pts = rdsm[row_indices, col_indices]

        n_pts = len(gcps)

        if n_pts == 1:
            # Single anchor GCP: estimate offset assuming default height variance
            scale = 40.0
            offset = float(z_pts[0] - scale * r_pts[0])
            calibrated_dsm = scale * rdsm + offset
            tilt_params = [0.0, 0.0]
        elif n_pts == 2 or not plane_tilt:
            # 1D linear fit: Z = scale * r + offset
            poly = np.polyfit(r_pts, z_pts, deg=1)
            scale = float(poly[0])
            offset = float(poly[1])
            calibrated_dsm = scale * rdsm + offset
            tilt_params = [0.0, 0.0]
        else:
            # 3D planar fit: Z = scale * r + ax * x + ay * y + offset
            # A * params = z_pts
            A = np.column_stack([r_pts, x_pts, y_pts, np.ones(n_pts)])
            params, residuals, rank, s = np.linalg.lstsq(A, z_pts, rcond=None)
            scale = float(params[0])
            ax, ay = float(params[1]), float(params[2])
            offset = float(params[3])

            grid_y, grid_x = np.indices((h, w), dtype=np.float32)
            calibrated_dsm = scale * rdsm + ax * grid_x + ay * grid_y + offset
            tilt_params = [ax, ay]

        # Calculate residual errors at GCPs
        pred_z = calibrated_dsm[row_indices, col_indices]
        gcp_errors = pred_z - z_pts
        gcp_rmse = float(np.sqrt(np.mean(gcp_errors**2)))

        return {
            "dsm": calibrated_dsm.astype(np.float32),
            "scale": scale,
            "offset": offset,
            "tilt_slopes": tilt_params,
            "gcp_rmse": gcp_rmse,
            "method": f"GCP_Anchored_{n_pts}pts",
            "min_elevation": float(np.min(calibrated_dsm)),
            "max_elevation": float(np.max(calibrated_dsm)),
            "mean_elevation": float(np.mean(calibrated_dsm))
        }

    @staticmethod
    def calibrate_with_scene_priors(
        rdsm: np.ndarray,
        landscape_type: str = "urban",
        base_elevation_m: float = 120.0,
        elevation_relief_m: float = 45.0
    ) -> dict:
        """
        Calibrates non-georeferenced images (PNG/JPG) using semantic scene priors.
        """
        priors = {
            "urban": {"relief": 50.0, "base": 150.0},
            "sparse": {"relief": 15.0, "base": 220.0},
            "hilly": {"relief": 350.0, "base": 600.0},
            "forested": {"relief": 80.0, "base": 300.0},
        }

        cfg = priors.get(landscape_type.lower(), {"relief": elevation_relief_m, "base": base_elevation_m})
        relief = elevation_relief_m if elevation_relief_m > 0 else cfg["relief"]
        base = base_elevation_m if base_elevation_m > 0 else cfg["base"]

        calibrated_dsm = base + rdsm * relief

        return {
            "dsm": calibrated_dsm.astype(np.float32),
            "scale": float(relief),
            "offset": float(base),
            "method": f"Scene_Prior_{landscape_type.capitalize()}",
            "min_elevation": float(np.min(calibrated_dsm)),
            "max_elevation": float(np.max(calibrated_dsm)),
            "mean_elevation": float(np.mean(calibrated_dsm))
        }
