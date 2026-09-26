"""
DepthWizard - Validation and Accuracy Evaluation Module
Evaluates estimated DSM against Ground Truth LiDAR or reference elevation models according to
ISRO SAC criteria: RMSE, MAE, Pearson Correlation, R², LE90, and residual error distributions
across Urban, Sparse, Hilly, and Forested terrains.
"""

import logging
import numpy as np
from scipy.stats import pearsonr

logger = logging.getLogger("DepthWizard.Metrics")

class AccuracyEvaluator:
    """
    Computes rigorous geospatial elevation validation metrics.
    """

    @staticmethod
    def evaluate(
        estimated_dsm: np.ndarray,
        reference_dsm: np.ndarray,
        nodata_val: float = -9999.0
    ) -> dict:
        """
        Calculates complete accuracy metrics between estimated DSM and reference ground truth.
        """
        valid_mask = (reference_dsm != nodata_val) & np.isfinite(reference_dsm) & np.isfinite(estimated_dsm)
        
        if not np.any(valid_mask):
            return {
                "error": "No overlapping valid pixels found between estimated DSM and reference dataset."
            }

        est_valid = estimated_dsm[valid_mask].astype(np.float64)
        ref_valid = reference_dsm[valid_mask].astype(np.float64)

        # Residuals: Error = Estimated - Reference
        residuals = est_valid - ref_valid
        abs_residuals = np.abs(residuals)

        # 1. RMSE (Root Mean Square Error)
        rmse = float(np.sqrt(np.mean(residuals**2)))

        # 2. MAE (Mean Absolute Error)
        mae = float(np.mean(abs_residuals))

        # 3. Mean Bias Error (MBE)
        mbe = float(np.mean(residuals))

        # 4. Pearson Correlation (r) & R-squared (R²)
        if len(est_valid) > 2 and np.std(est_valid) > 1e-5 and np.std(ref_valid) > 1e-5:
            r_corr, _ = pearsonr(est_valid, ref_valid)
            r_corr = float(r_corr)
            ss_tot = np.sum((ref_valid - np.mean(ref_valid))**2)
            ss_res = np.sum(residuals**2)
            r2 = float(1.0 - (ss_res / ss_tot)) if ss_tot > 0 else 0.0
        else:
            r_corr = 0.0
            r2 = 0.0

        # 5. LE90 (Linear Error at 90% confidence, NSSDA standard)
        le90 = float(np.percentile(abs_residuals, 90))

        # 6. Error distribution bins
        pct_within_1m = float(np.mean(abs_residuals <= 1.0) * 100.0)
        pct_within_2m = float(np.mean(abs_residuals <= 2.0) * 100.0)
        pct_within_5m = float(np.mean(abs_residuals <= 5.0) * 100.0)

        # Histogram data for UI visualization (20 bins)
        hist, bin_edges = np.histogram(residuals, bins=21, range=(-10.0, 10.0))
        hist_bins = [round(float((bin_edges[i] + bin_edges[i+1])/2.0), 2) for i in range(len(hist))]
        hist_counts = hist.tolist()

        # Spatial residual map (for heatmap overlay)
        full_residual_map = np.zeros_like(estimated_dsm, dtype=np.float32)
        full_residual_map[valid_mask] = (estimated_dsm[valid_mask] - reference_dsm[valid_mask]).astype(np.float32)

        return {
            "rmse_m": round(rmse, 3),
            "mae_m": round(mae, 3),
            "mbe_m": round(mbe, 3),
            "pearson_r": round(r_corr, 4),
            "r2_score": round(max(-1.0, min(1.0, r2)), 4),
            "le90_m": round(le90, 3),
            "pct_within_1m": round(pct_within_1m, 1),
            "pct_within_2m": round(pct_within_2m, 1),
            "pct_within_5m": round(pct_within_5m, 1),
            "histogram": {
                "bin_centers": hist_bins,
                "counts": hist_counts
            },
            "valid_pixels": int(np.sum(valid_mask)),
            "residual_map": full_residual_map
        }

    @staticmethod
    def evaluate_by_landscape(
        estimated_dsm: np.ndarray,
        reference_dsm: np.ndarray,
        landscape_mask: dict[str, np.ndarray] = None
    ) -> dict:
        """
        Evaluates accuracy across the 4 key ISRO landscapes:
        Urban, Sparse, Hilly, and Forested.
        """
        results = {}
        if landscape_mask is None:
            # If explicit mask is not provided, evaluate overall
            results["overall"] = AccuracyEvaluator.evaluate(estimated_dsm, reference_dsm)
            return results

        for category, mask in landscape_mask.items():
            if np.any(mask):
                est_sub = np.where(mask, estimated_dsm, -9999.0)
                ref_sub = np.where(mask, reference_dsm, -9999.0)
                results[category] = AccuracyEvaluator.evaluate(est_sub, ref_sub, nodata_val=-9999.0)

        return results
