"""
DepthWizard - Realistic Remote Sensing Benchmark Sample Generator
Synthesizes photorealistic, geometrically sound remote-sensing datasets
matching ISRO Cartosat-2S (0.6m GSD) optical characteristics, paired with
true LiDAR-grade reference DSMs, coarse reference DEMs (SRTM 30m), and GCPs
for the 4 benchmark landscapes: Urban, Sparse, Hilly, and Forested.
"""

import os
import json
import logging
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter
import rasterio
from rasterio.transform import from_origin
from rasterio.crs import CRS

logger = logging.getLogger("DepthWizard.SampleGen")

class SampleDatasetGenerator:
    """
    Generates realistic 0.6m resolution optical imagery and corresponding reference DSMs.
    """

    @staticmethod
    def generate_all_samples(base_dir: str = "data/samples"):
        os.makedirs(base_dir, exist_ok=True)
        samples = [
            ("urban", SampleDatasetGenerator.generate_urban_sample),
            ("sparse", SampleDatasetGenerator.generate_sparse_sample),
            ("hilly", SampleDatasetGenerator.generate_hilly_sample),
            ("forested", SampleDatasetGenerator.generate_forested_sample),
        ]
        manifest = []
        for name, gen_fn in samples:
            sample_folder = os.path.join(base_dir, name)
            meta = gen_fn(sample_folder)
            manifest.append(meta)
        
        manifest_path = os.path.join(base_dir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        logger.info(f"Generated all 4 benchmark datasets. Manifest: {manifest_path}")
        return manifest

    @staticmethod
    def _save_geotiff(path: str, data: np.ndarray, transform, crs: str = "EPSG:32643"):
        with rasterio.open(
            path, 'w', driver='GTiff',
            height=data.shape[0], width=data.shape[1],
            count=1, dtype=np.float32,
            crs=CRS.from_string(crs),
            transform=transform, compress='deflate', nodata=-9999.0
        ) as dst:
            dst.write(data.astype(np.float32), 1)

    @staticmethod
    def _save_rgb_geotiff(path: str, rgb: np.ndarray, transform, crs: str = "EPSG:32643"):
        # rgb is (H, W, 3) uint8
        with rasterio.open(
            path, 'w', driver='GTiff',
            height=rgb.shape[0], width=rgb.shape[1],
            count=3, dtype=np.uint8,
            crs=CRS.from_string(crs),
            transform=transform, compress='deflate'
        ) as dst:
            for i in range(3):
                dst.write(rgb[:, :, i], i + 1)

    @staticmethod
    def generate_urban_sample(output_dir: str, size: int = 512) -> dict:
        """
        Generates Urban scene: Street grid, commercial towers, residential blocks, parking lots.
        Base elevation: ~55m. Building heights: 8m to 42m.
        """
        os.makedirs(output_dir, exist_ok=True)
        np.random.seed(42)

        # 1. Base terrain (gentle urban topography)
        y, x = np.mgrid[0:size, 0:size]
        base_terrain = 55.0 + 3.0 * np.sin(x / 80.0) + 2.5 * np.cos(y / 90.0)

        # 2. Structural elevation (buildings) & RGB image synthesis
        true_dsm = base_terrain.copy()
        rgb_img = Image.new("RGB", (size, size), (165, 168, 172)) # Asphalt ground
        draw = ImageDraw.Draw(rgb_img)

        # Draw road network
        road_color = (65, 68, 72)
        for r_x in range(40, size, 110):
            draw.rectangle([r_x - 12, 0, r_x + 12, size], fill=road_color)
        for r_y in range(40, size, 110):
            draw.rectangle([0, r_y - 12, size, r_y + 12], fill=road_color)

        gcps = []
        # Place buildings in blocks
        block_step = 110
        for bx in range(40, size - 80, block_step):
            for by in range(40, size - 80, block_step):
                # Subdivide block into 2-4 buildings
                for sub_i in range(2):
                    for sub_j in range(2):
                        w_b = np.random.randint(28, 42)
                        h_b = np.random.randint(28, 42)
                        pos_x = bx + 22 + sub_i * 42
                        pos_y = by + 22 + sub_j * 42
                        if pos_x + w_b >= size or pos_y + h_b >= size:
                            continue

                        b_height = float(np.random.choice([12.0, 18.0, 24.0, 32.0, 42.0]))
                        true_dsm[pos_y:pos_y+h_b, pos_x:pos_x+w_b] += b_height

                        # Rooftop colors (concrete, terracotta tile, white reflective, solar blue)
                        roof_type = np.random.randint(0, 4)
                        if roof_type == 0:
                            roof_col = (210, 215, 220)
                        elif roof_type == 1:
                            roof_col = (195, 110, 85) # Terracotta
                        elif roof_type == 2:
                            roof_col = (140, 148, 155) # Industrial grey
                        else:
                            roof_col = (70, 95, 130) # Solar panel blue

                        draw.rectangle([pos_x, pos_y, pos_x + w_b, pos_y + h_b], fill=roof_col, outline=(40, 42, 45))
                        
                        # Add rooftop mechanical equipment / penthouse
                        if b_height > 20:
                            pw_w, pw_h = w_b // 3, h_b // 3
                            draw.rectangle([pos_x + 6, pos_y + 6, pos_x + 6 + pw_w, pos_y + 6 + pw_h], fill=(120, 120, 120))
                            true_dsm[pos_y+6:pos_y+6+pw_h, pos_x+6:pos_x+6+pw_w] += 3.5

        # Add tree clusters in courtyards
        for _ in range(30):
            tx, ty = np.random.randint(20, size-20), np.random.randint(20, size-20)
            if true_dsm[ty, tx] == base_terrain[ty, tx]: # Only on open ground
                r = np.random.randint(5, 10)
                draw.ellipse([tx - r, ty - r, tx + r, ty + r], fill=(45, 115, 55))
                true_dsm[max(0, ty-r):min(size, ty+r), max(0, tx-r):min(size, tx+r)] += np.random.uniform(5.0, 11.0)

        # Add 6 high-precision Ground Control Points (GCPs) at open road intersections
        gcp_locs = [(40, 40), (260, 40), (480, 40), (40, 260), (260, 260), (480, 480)]
        for i, (gx, gy) in enumerate(gcp_locs):
            gcps.append({
                "id": f"GCP_{i+1}",
                "x": gx, "y": gy,
                "z": round(float(true_dsm[gy, gx]), 2),
                "type": "Road_Intersection"
            })

        # Coarse Reference DEM (SRTM 30m equivalent, smoothed 30m filter)
        coarse_dem = gaussian_filter(base_terrain, sigma=25)

        # Geospatial parameters (Cartosat-2S 0.6m GSD, Ahmedabad SAC region)
        gsd = 0.6
        origin_x, origin_y = 267500.0, 2551000.0
        transform = from_origin(origin_x, origin_y, gsd, gsd)

        # File paths
        rgb_png_path = os.path.join(output_dir, "optical_rgb.png")
        rgb_tif_path = os.path.join(output_dir, "optical_rgb.tif")
        ref_dsm_path = os.path.join(output_dir, "reference_dsm_lidar.tif")
        coarse_dem_path = os.path.join(output_dir, "coarse_dem_srtm30m.tif")
        gcps_path = os.path.join(output_dir, "gcps.json")

        rgb_img.save(rgb_png_path)
        SampleDatasetGenerator._save_rgb_geotiff(rgb_tif_path, np.array(rgb_img), transform)
        SampleDatasetGenerator._save_geotiff(ref_dsm_path, true_dsm, transform)
        SampleDatasetGenerator._save_geotiff(coarse_dem_path, coarse_dem, transform)
        with open(gcps_path, "w") as f:
            json.dump(gcps, f, indent=2)

        return {
            "id": "urban",
            "title": "Urban Built-up Environment (ISRO SAC Simulation)",
            "landscape": "Urban",
            "resolution_m": gsd,
            "crs": "EPSG:32643",
            "bounds": {"left": origin_x, "top": origin_y, "right": origin_x + size * gsd, "bottom": origin_y - size * gsd},
            "elevation_range": [round(float(true_dsm.min()), 1), round(float(true_dsm.max()), 1)],
            "mean_elevation": round(float(true_dsm.mean()), 1),
            "rgb_png": rgb_png_path,
            "rgb_tif": rgb_tif_path,
            "ref_dsm": ref_dsm_path,
            "coarse_dem": coarse_dem_path,
            "gcps": gcps
        }

    @staticmethod
    def generate_hilly_sample(output_dir: str, size: int = 512) -> dict:
        """
        Generates Mountainous/Hilly landscape: Steep ridgeline, valley spur, slopes up to 45 degrees.
        Elevation range: ~480m to ~860m.
        """
        os.makedirs(output_dir, exist_ok=True)
        np.random.seed(101)

        y, x = np.mgrid[0:size, 0:size]
        # Multi-scale fractal terrain
        ridge = np.exp(-((x - 0.45 * y - 100)**2) / (2.0 * 95**2)) * 290.0
        peak1 = np.exp(-((x - 180)**2 + (y - 190)**2) / (2.0 * 85**2)) * 180.0
        peak2 = np.exp(-((x - 390)**2 + (y - 340)**2) / (2.0 * 110**2)) * 220.0
        undulation = 40.0 * np.sin(x / 65.0) * np.cos(y / 70.0) + 15.0 * np.sin(x / 25.0)

        true_dsm = 480.0 + ridge + peak1 + peak2 + undulation
        true_dsm = gaussian_filter(true_dsm, sigma=1.8)

        # Synthetic hillshaded optical texture
        dy, dx = np.gradient(true_dsm, 0.6, 0.6)
        slope = np.sqrt(dx**2 + dy**2)
        azimuth = np.radians(315.0)
        altitude = np.radians(45.0)
        shaded = np.sin(altitude) - np.cos(altitude) * (dx * np.sin(azimuth) + dy * np.cos(azimuth)) / np.maximum(1.0, np.sqrt(1 + slope**2))
        shaded_norm = np.clip((shaded - shaded.min()) / (shaded.max() - shaded.min()), 0.0, 1.0)

        # Natural mountain palette (rocky crests, grassy slopes, forest ravines)
        r = (shaded_norm * 145 + 50).astype(np.uint8)
        g = (shaded_norm * 165 + 65).astype(np.uint8)
        b = (shaded_norm * 105 + 40).astype(np.uint8)
        rgb_arr = np.stack([r, g, b], axis=-1)
        rgb_img = Image.fromarray(rgb_arr)

        coarse_dem = gaussian_filter(true_dsm, sigma=28)
        gsd = 0.6
        origin_x, origin_y = 712000.0, 3421000.0
        transform = from_origin(origin_x, origin_y, gsd, gsd)

        rgb_png_path = os.path.join(output_dir, "optical_rgb.png")
        rgb_tif_path = os.path.join(output_dir, "optical_rgb.tif")
        ref_dsm_path = os.path.join(output_dir, "reference_dsm_lidar.tif")
        coarse_dem_path = os.path.join(output_dir, "coarse_dem_srtm30m.tif")
        gcps_path = os.path.join(output_dir, "gcps.json")

        gcps = [
            {"id": "GCP_1", "x": 60, "y": 60, "z": round(float(true_dsm[60, 60]), 2), "type": "Valley_Base"},
            {"id": "GCP_2", "x": 180, "y": 190, "z": round(float(true_dsm[190, 180]), 2), "type": "Mountain_Peak_A"},
            {"id": "GCP_3", "x": 390, "y": 340, "z": round(float(true_dsm[340, 390]), 2), "type": "Mountain_Peak_B"},
            {"id": "GCP_4", "x": 450, "y": 90, "z": round(float(true_dsm[90, 450]), 2), "type": "Eastern_Ridge"}
        ]

        rgb_img.save(rgb_png_path)
        SampleDatasetGenerator._save_rgb_geotiff(rgb_tif_path, rgb_arr, transform)
        SampleDatasetGenerator._save_geotiff(ref_dsm_path, true_dsm, transform)
        SampleDatasetGenerator._save_geotiff(coarse_dem_path, coarse_dem, transform)
        with open(gcps_path, "w") as f:
            json.dump(gcps, f, indent=2)

        return {
            "id": "hilly",
            "title": "Rugged Mountainous Ridge & Valley (High Relief)",
            "landscape": "Hilly",
            "resolution_m": gsd,
            "crs": "EPSG:32643",
            "bounds": {"left": origin_x, "top": origin_y, "right": origin_x + size * gsd, "bottom": origin_y - size * gsd},
            "elevation_range": [round(float(true_dsm.min()), 1), round(float(true_dsm.max()), 1)],
            "mean_elevation": round(float(true_dsm.mean()), 1),
            "rgb_png": rgb_png_path,
            "rgb_tif": rgb_tif_path,
            "ref_dsm": ref_dsm_path,
            "coarse_dem": coarse_dem_path,
            "gcps": gcps
        }

    @staticmethod
    def generate_sparse_sample(output_dir: str, size: int = 512) -> dict:
        """
        Generates Sparse / Semi-Arid landscape: Open desert plateau, low shrub clusters, isolated agricultural silos.
        Elevation range: ~210m to ~228m (Low Relief).
        """
        os.makedirs(output_dir, exist_ok=True)
        np.random.seed(202)

        y, x = np.mgrid[0:size, 0:size]
        base_terrain = 210.0 + 4.0 * np.sin(x / 140.0) + 3.0 * np.cos(y / 160.0) + 1.5 * np.sin((x + y) / 100.0)
        true_dsm = base_terrain.copy()

        rgb_img = Image.new("RGB", (size, size), (220, 202, 172)) # Arid soil
        draw = ImageDraw.Draw(rgb_img)

        # Add isolated structures (farm homestead, storage shed, tower)
        draw.rectangle([210, 210, 255, 260], fill=(160, 160, 165), outline=(90, 90, 95))
        true_dsm[210:260, 210:255] += 8.5 # Shed

        draw.rectangle([280, 220, 315, 250], fill=(185, 120, 95), outline=(90, 90, 95))
        true_dsm[220:250, 280:315] += 6.0 # House

        # Telecom / Wind mast
        draw.ellipse([348, 348, 356, 356], fill=(230, 60, 60))
        true_dsm[348:356, 348:356] += 26.0

        # Sparse shrubs
        for _ in range(75):
            sx, sy = np.random.randint(10, size - 10), np.random.randint(10, size - 10)
            r = np.random.randint(3, 7)
            draw.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(135, 140, 95))
            true_dsm[max(0, sy-r):min(size, sy+r), max(0, sx-r):min(size, sx+r)] += np.random.uniform(1.2, 3.5)

        coarse_dem = gaussian_filter(base_terrain, sigma=25)
        gsd = 0.6
        origin_x, origin_y = 195000.0, 2890000.0
        transform = from_origin(origin_x, origin_y, gsd, gsd)

        rgb_png_path = os.path.join(output_dir, "optical_rgb.png")
        rgb_tif_path = os.path.join(output_dir, "optical_rgb.tif")
        ref_dsm_path = os.path.join(output_dir, "reference_dsm_lidar.tif")
        coarse_dem_path = os.path.join(output_dir, "coarse_dem_srtm30m.tif")
        gcps_path = os.path.join(output_dir, "gcps.json")

        gcps = [
            {"id": "GCP_1", "x": 50, "y": 50, "z": round(float(true_dsm[50, 50]), 2), "type": "Plateau_Northwest"},
            {"id": "GCP_2", "x": 210, "y": 210, "z": round(float(true_dsm[210, 210]), 2), "type": "Homestead_Base"},
            {"id": "GCP_3", "x": 460, "y": 460, "z": round(float(true_dsm[460, 460]), 2), "type": "Plateau_Southeast"}
        ]

        rgb_img.save(rgb_png_path)
        SampleDatasetGenerator._save_rgb_geotiff(rgb_tif_path, np.array(rgb_img), transform)
        SampleDatasetGenerator._save_geotiff(ref_dsm_path, true_dsm, transform)
        SampleDatasetGenerator._save_geotiff(coarse_dem_path, coarse_dem, transform)
        with open(gcps_path, "w") as f:
            json.dump(gcps, f, indent=2)

        return {
            "id": "sparse",
            "title": "Sparse Semi-Arid Plateau & Outcrops (Low Relief)",
            "landscape": "Sparse",
            "resolution_m": gsd,
            "crs": "EPSG:32643",
            "bounds": {"left": origin_x, "top": origin_y, "right": origin_x + size * gsd, "bottom": origin_y - size * gsd},
            "elevation_range": [round(float(true_dsm.min()), 1), round(float(true_dsm.max()), 1)],
            "mean_elevation": round(float(true_dsm.mean()), 1),
            "rgb_png": rgb_png_path,
            "rgb_tif": rgb_tif_path,
            "ref_dsm": ref_dsm_path,
            "coarse_dem": coarse_dem_path,
            "gcps": gcps
        }

    @staticmethod
    def generate_forested_sample(output_dir: str, size: int = 512) -> dict:
        """
        Generates Forested landscape: Continuous tree canopy, undulating mountain slope, clearing, canopy heights 12-28m.
        Elevation range: ~310m to ~390m.
        """
        os.makedirs(output_dir, exist_ok=True)
        np.random.seed(303)

        y, x = np.mgrid[0:size, 0:size]
        base_terrain = 310.0 + 35.0 * (x + y) / (2.0 * size) + 8.0 * np.sin(x / 75.0)
        true_dsm = base_terrain.copy()

        # Generate organic forest texture and canopy elevation
        noise = np.random.normal(0, 1, (size, size))
        canopy_noise = gaussian_filter(noise, sigma=3.0)
        canopy_heights = 18.0 + 8.0 * canopy_noise # 10m - 26m canopy

        # Forest clearing in center
        clearing_mask = np.exp(-((x - 250)**2 + (y - 270)**2) / (2.0 * 55**2))
        canopy_heights = canopy_heights * (1.0 - clearing_mask)

        true_dsm += canopy_heights

        # Forest canopy RGB
        g_channel = np.clip(60 + canopy_noise * 30 + (1.0 - clearing_mask) * 20, 30, 130).astype(np.uint8)
        r_channel = np.clip(35 + canopy_noise * 18 + clearing_mask * 80, 20, 160).astype(np.uint8)
        b_channel = np.clip(25 + canopy_noise * 15 + clearing_mask * 40, 15, 90).astype(np.uint8)
        rgb_arr = np.stack([r_channel, g_channel, b_channel], axis=-1)
        rgb_img = Image.fromarray(rgb_arr)

        coarse_dem = gaussian_filter(base_terrain, sigma=25)
        gsd = 0.6
        origin_x, origin_y = 640000.0, 1285000.0
        transform = from_origin(origin_x, origin_y, gsd, gsd)

        rgb_png_path = os.path.join(output_dir, "optical_rgb.png")
        rgb_tif_path = os.path.join(output_dir, "optical_rgb.tif")
        ref_dsm_path = os.path.join(output_dir, "reference_dsm_lidar.tif")
        coarse_dem_path = os.path.join(output_dir, "coarse_dem_srtm30m.tif")
        gcps_path = os.path.join(output_dir, "gcps.json")

        gcps = [
            {"id": "GCP_1", "x": 80, "y": 80, "z": round(float(true_dsm[80, 80]), 2), "type": "Canopy_Tower_North"},
            {"id": "GCP_2", "x": 250, "y": 270, "z": round(float(true_dsm[270, 250]), 2), "type": "Forest_Clearing_Ground"},
            {"id": "GCP_3", "x": 440, "y": 420, "z": round(float(true_dsm[420, 440]), 2), "type": "Canopy_Ridge_South"}
        ]

        rgb_img.save(rgb_png_path)
        SampleDatasetGenerator._save_rgb_geotiff(rgb_tif_path, rgb_arr, transform)
        SampleDatasetGenerator._save_geotiff(ref_dsm_path, true_dsm, transform)
        SampleDatasetGenerator._save_geotiff(coarse_dem_path, coarse_dem, transform)
        with open(gcps_path, "w") as f:
            json.dump(gcps, f, indent=2)

        return {
            "id": "forested",
            "title": "Dense Forest Canopy & Undulating Slope (Biomass Relief)",
            "landscape": "Forested",
            "resolution_m": gsd,
            "crs": "EPSG:32643",
            "bounds": {"left": origin_x, "top": origin_y, "right": origin_x + size * gsd, "bottom": origin_y - size * gsd},
            "elevation_range": [round(float(true_dsm.min()), 1), round(float(true_dsm.max()), 1)],
            "mean_elevation": round(float(true_dsm.mean()), 1),
            "rgb_png": rgb_png_path,
            "rgb_tif": rgb_tif_path,
            "ref_dsm": ref_dsm_path,
            "coarse_dem": coarse_dem_path,
            "gcps": gcps
        }
