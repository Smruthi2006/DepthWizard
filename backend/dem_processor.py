"""
DepthWizard - Digital Elevation Model (DEM/DSM) Processing Module
Handles GeoTIFF metadata, spatial georeferencing (CRS/Affine), nDSM structure separation,
slope & aspect calculations, topographic cross-section profiling, and colormapping.
"""

import os
import logging
import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import from_origin
from rasterio.crs import CRS
from scipy.ndimage import grey_opening, gaussian_filter
import matplotlib.cm as cm

logger = logging.getLogger("DepthWizard.Processor")

class DEMProcessor:
    """
    Advanced geospatial processing for Digital Surface Models (DSM) and remote sensing rasters.
    """

    @staticmethod
    def read_geotiff(file_path: str) -> dict:
        """
        Reads a GeoTIFF file, extracting image data and complete geospatial metadata.
        """
        with rasterio.open(file_path) as src:
            bounds = src.bounds
            crs = src.crs.to_string() if src.crs else "EPSG:4326"
            transform = list(src.transform)
            count = src.count
            width = src.width
            height = src.height
            nodata = src.nodata

            # Read RGB or grayscale
            if count >= 3:
                rgb_arr = src.read([1, 2, 3])  # (3, H, W)
                rgb_arr = np.transpose(rgb_arr, (1, 2, 0))  # (H, W, 3)
            else:
                band1 = src.read(1)
                rgb_arr = np.stack([band1, band1, band1], axis=-1)

            # Estimate GSD (pixel resolution in meters)
            res_x = abs(transform[0])
            res_y = abs(transform[4])
            # If coordinates are in degrees (WGS84), convert roughly to meters at scene center
            if "4326" in crs or res_x < 0.01:
                mid_lat = (bounds.bottom + bounds.top) / 2.0
                meters_per_deg_lon = 111320.0 * np.cos(np.radians(mid_lat))
                meters_per_deg_lat = 110540.0
                gsd_m = float(np.mean([res_x * meters_per_deg_lon, res_y * meters_per_deg_lat]))
            else:
                gsd_m = float(np.mean([res_x, res_y]))

            # Normalize rgb to uint8 for visualization
            if rgb_arr.dtype != np.uint8:
                r_min, r_max = np.percentile(rgb_arr, 1), np.percentile(rgb_arr, 99)
                if r_max > r_min:
                    rgb_norm = np.clip((rgb_arr - r_min) / (r_max - r_min) * 255.0, 0, 255).astype(np.uint8)
                else:
                    rgb_norm = np.zeros_like(rgb_arr, dtype=np.uint8)
            else:
                rgb_norm = rgb_arr

        return {
            "image": rgb_norm,
            "width": width,
            "height": height,
            "crs": crs,
            "transform": transform,
            "bounds": {
                "left": bounds.left,
                "bottom": bounds.bottom,
                "right": bounds.right,
                "top": bounds.top
            },
            "gsd": gsd_m,
            "nodata": nodata
        }

    @staticmethod
    def write_geotiff(
        dsm: np.ndarray,
        output_path: str,
        crs_str: str = "EPSG:32643",
        bounds: dict = None,
        gsd: float = 0.6
    ):
        """
        Writes a single-band float32 DSM into an industry-standard GeoTIFF file.
        """
        h, w = dsm.shape
        if bounds:
            transform = from_origin(bounds["left"], bounds["top"], gsd, gsd)
        else:
            # Default georeferenced bounding box (e.g. Ahmedabad / SAC ISRO region)
            origin_x = 265000.0
            origin_y = 2548000.0
            transform = from_origin(origin_x, origin_y, gsd, gsd)

        try:
            crs = CRS.from_string(crs_str)
        except Exception:
            crs = CRS.from_string("EPSG:32643")

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

        with rasterio.open(
            output_path,
            'w',
            driver='GTiff',
            height=h,
            width=w,
            count=1,
            dtype=np.float32,
            crs=crs,
            transform=transform,
            compress='deflate',
            nodata=-9999.0
        ) as dst:
            dst.write(dsm.astype(np.float32), 1)

        logger.info(f"Exported GeoTIFF DSM: {output_path} ({w}x{h}, GSD={gsd:.2f}m)")

    @staticmethod
    def extract_ndsm_and_dtm(dsm: np.ndarray, gsd: float = 0.6) -> tuple[np.ndarray, np.ndarray]:
        """
        Separates bare-earth Digital Terrain Model (DTM) and
        normalized Digital Surface Model (nDSM = structural heights above ground).
        Uses morphological opening with progressive structuring element.
        """
        # Window size corresponding to ~30-40 meters (larger than typical building footprint)
        window_size = max(5, int(35.0 / max(gsd, 0.1)))
        if window_size % 2 == 0:
            window_size += 1

        # Morphological opening removes objects smaller than window size (buildings, trees)
        structuring_element = np.ones((window_size, window_size), dtype=bool)
        dtm_raw = grey_opening(dsm, footprint=structuring_element)

        # Smooth terrain base
        dtm = gaussian_filter(dtm_raw, sigma=2.0)
        # Ensure DTM does not exceed DSM
        dtm = np.minimum(dtm, dsm)

        # nDSM = above-ground structure elevation (buildings, towers, tree canopies)
        ndsm = np.maximum(0.0, dsm - dtm)

        return dtm.astype(np.float32), ndsm.astype(np.float32)

    @staticmethod
    def compute_slope_and_aspect(dsm: np.ndarray, gsd: float = 0.6) -> tuple[np.ndarray, np.ndarray]:
        """
        Calculates Slope (degrees 0-90) and Aspect (compass degrees 0-360) from metric DSM.
        """
        # Central difference gradients
        dy, dx = np.gradient(dsm, gsd, gsd)

        # Slope in degrees
        rise_run = np.sqrt(dx**2 + dy**2)
        slope_deg = np.degrees(np.arctan(rise_run))

        # Aspect: compass direction of downhill slope (0 = North, 90 = East, 180 = South, 270 = West)
        # Using cartographic convention: atan2(-dy, dx) adjusted to clockwise from North
        aspect_rad = np.arctan2(dy, -dx)
        aspect_deg = np.degrees(aspect_rad)
        aspect_deg = 90.0 - aspect_deg
        aspect_deg = np.where(aspect_deg < 0, aspect_deg + 360.0, aspect_deg)

        return slope_deg.astype(np.float32), aspect_deg.astype(np.float32)

    @staticmethod
    def sample_elevation_profile(dsm: np.ndarray, p1: tuple[int, int], p2: tuple[int, int], num_points: int = 100, gsd: float = 0.6) -> dict:
        """
        Samples an elevation profile cross-section along a line from p1(x, y) to p2(x, y).
        Returns distances along line (meters) and elevation array (meters).
        """
        h, w = dsm.shape
        x1, y1 = p1
        x2, y2 = p2

        xs = np.linspace(x1, x2, num_points)
        ys = np.linspace(y1, y2, num_points)

        # Bilinear interpolation
        x0 = np.clip(np.floor(xs).astype(int), 0, w - 2)
        x1_idx = x0 + 1
        y0 = np.clip(np.floor(ys).astype(int), 0, h - 2)
        y1_idx = y0 + 1

        wa = (x1_idx - xs) * (y1_idx - ys)
        wb = (xs - x0) * (y1_idx - ys)
        wc = (x1_idx - xs) * (ys - y0)
        wd = (xs - x0) * (ys - y0)

        elevations = (wa * dsm[y0, x0] +
                      wb * dsm[y0, x1_idx] +
                      wc * dsm[y1_idx, x0] +
                      wd * dsm[y1_idx, x1_idx])

        # Physical distance along transect
        pixel_dist = np.sqrt((xs - xs[0])**2 + (ys - ys[0])**2)
        metric_dist = pixel_dist * gsd

        return {
            "distances": metric_dist.tolist(),
            "elevations": elevations.tolist(),
            "total_distance_m": float(metric_dist[-1]),
            "min_elevation_m": float(np.min(elevations)),
            "max_elevation_m": float(np.max(elevations)),
            "elevation_gain_m": float(np.max(elevations) - np.min(elevations))
        }

    @staticmethod
    def generate_colormap_image(array_2d: np.ndarray, colormap_name: str = "turbo") -> Image.Image:
        """
        Renders a 2D float array into a color-mapped RGB PIL Image for web visualization.
        """
        vmin, vmax = np.percentile(array_2d, 1), np.percentile(array_2d, 99)
        if vmax > vmin:
            norm = np.clip((array_2d - vmin) / (vmax - vmin), 0.0, 1.0)
        else:
            norm = np.zeros_like(array_2d)

        cmap = getattr(cm, colormap_name, cm.turbo)
        colored = (cmap(norm)[:, :, :3] * 255.0).astype(np.uint8)
        return Image.fromarray(colored)
