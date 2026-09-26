"""
DepthWizard - Monocular Depth Estimation Backbone Module
Supports Depth Anything V2 (Small/Base) via ONNX Runtime for ultra-fast,
dependency-light CPU/GPU inference on top-down remote sensing imagery.
"""

import os
import time
import logging
import numpy as np
from PIL import Image
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from scipy.ndimage import gaussian_filter

logger = logging.getLogger("DepthWizard.Backbone")
logging.basicConfig(level=logging.INFO)

# Default HF repo for Depth-Anything-V2 ONNX
DEFAULT_HF_REPO = "onnx-community/depth-anything-v2-small"
DEFAULT_MODEL_FILE = "onnx/model_quantized.onnx"

class MonocularDepthBackbone:
    """
    Monocular depth estimation engine tailored for satellite & aerial optical imagery.
    Predicts relative height / depth representations and applies structural edge sharpening.
    """
    def __init__(self, model_path: str = None, execution_provider: str = "CPUExecutionProvider"):
        self.session = None
        self.model_path = model_path
        self.execution_provider = execution_provider
        self.input_name = None
        self.output_name = None
        self.input_shape = None
        self._init_session()

    def _init_session(self):
        """Initializes or downloads the ONNX runtime inference session."""
        if not self.model_path or not os.path.exists(self.model_path):
            logger.info("Locating or downloading Depth Anything V2 ONNX backbone...")
            try:
                self.model_path = hf_hub_download(
                    repo_id=DEFAULT_HF_REPO,
                    filename=DEFAULT_MODEL_FILE
                )
                logger.info(f"Loaded ONNX model from cache: {self.model_path}")
            except Exception as e:
                logger.error(f"Failed to download model from HF Hub: {e}")
                raise RuntimeError(f"Unable to load Depth Anything V2 model: {e}")

        # Set ONNXRuntime Session Options for maximum throughput
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.intra_op_num_threads = min(8, os.cpu_count() or 4)

        available_providers = ort.get_available_providers()
        providers = [self.execution_provider] if self.execution_provider in available_providers else ["CPUExecutionProvider"]
        
        self.session = ort.InferenceSession(self.model_path, sess_options, providers=providers)
        inputs = self.session.get_inputs()
        outputs = self.session.get_outputs()
        self.input_name = inputs[0].name
        self.output_name = outputs[0].name
        logger.info(f"Depth backbone initialized successfully. Input: {self.input_name}, Output: {self.output_name}")

    def preprocess(self, img_rgb: Image.Image, target_size: int = 518) -> tuple[np.ndarray, tuple[int, int]]:
        """
        Preprocesses an RGB image for Depth Anything V2:
        - Ensures multiple of 14 dimensions
        - Normalizes with ImageNet mean and std
        - Converts to NCHW float32
        """
        orig_w, orig_h = img_rgb.size
        
        # Calculate optimal size keeping aspect ratio with multiple of 14
        scale = target_size / max(orig_w, orig_h)
        new_w = int(round((orig_w * scale) / 14.0)) * 14
        new_h = int(round((orig_h * scale) / 14.0)) * 14
        new_w = max(14, new_w)
        new_h = max(14, new_h)

        resized_img = img_rgb.resize((new_w, new_h), Image.Resampling.BILINEAR)
        img_arr = np.array(resized_img, dtype=np.float32) / 255.0

        # ImageNet mean & standard deviation
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        norm_img = (img_arr - mean) / std

        # HWC to CHW then add batch dimension -> NCHW
        chw_img = np.transpose(norm_img, (2, 0, 1))
        batch_input = np.expand_dims(chw_img, axis=0).astype(np.float32)
        
        return batch_input, (orig_w, orig_h)

    def postprocess(self, raw_pred: np.ndarray, orig_size: tuple[int, int], refine_edges: bool = True) -> np.ndarray:
        """
        Post-processes raw relative depth into an aerial relative height map (rDSM):
        - Interpolates back to original image dimensions
        - Inverts so that elevated structures (closer to sensor) have higher elevation values
        - Normalizes to [0.0, 1.0]
        - Optionally applies edge-preserving guided refinement
        """
        orig_w, orig_h = orig_size
        pred = raw_pred.squeeze() # (H, W)

        # Depth-to-Height convention for remote sensing:
        # Depth Anything predicts depth/disparity where larger values correspond to closer objects (high elevation)
        # We ensure min is 0 and max is 1
        p_min = np.percentile(pred, 0.5)
        p_max = np.percentile(pred, 99.5)
        if p_max > p_min:
            norm_height = (pred - p_min) / (p_max - p_min)
            norm_height = np.clip(norm_height, 0.0, 1.0)
        else:
            norm_height = np.zeros_like(pred, dtype=np.float32)

        # Resize to original resolution
        h_img = Image.fromarray((norm_height * 65535.0).astype(np.uint16))
        h_resized = h_img.resize((orig_w, orig_h), Image.Resampling.BICUBIC)
        full_res_height = np.array(h_resized, dtype=np.float32) / 65535.0

        if refine_edges:
            # Edge-preserving high-frequency boost for rooftop & ridgeline sharpness
            low_freq = gaussian_filter(full_res_height, sigma=1.2)
            high_freq = full_res_height - low_freq
            full_res_height = np.clip(full_res_height + 0.35 * high_freq, 0.0, 1.0)

        return full_res_height

    def predict(self, image_input, target_size: int = 518, refine_edges: bool = True) -> dict:
        """
        End-to-end inference on an image file path, PIL Image, or NumPy array.
        Returns dictionary containing:
        - 'rdsm': 2D float32 array in [0, 1] (Relative Digital Surface Model)
        - 'inference_time': Execution latency in seconds
        - 'original_size': (width, height)
        """
        t0 = time.time()
        if isinstance(image_input, str):
            img = Image.open(image_input).convert("RGB")
        elif isinstance(image_input, np.ndarray):
            if image_input.dtype != np.uint8:
                image_input = (np.clip(image_input, 0, 1) * 255).astype(np.uint8)
            img = Image.fromarray(image_input).convert("RGB")
        elif isinstance(image_input, Image.Image):
            img = image_input.convert("RGB")
        else:
            raise ValueError("Unsupported image input type.")

        batch_input, orig_size = self.preprocess(img, target_size=target_size)
        
        # Run ONNX inference
        outputs = self.session.run([self.output_name], {self.input_name: batch_input})
        raw_pred = outputs[0]

        rdsm = self.postprocess(raw_pred, orig_size, refine_edges=refine_edges)
        latency = time.time() - t0

        logger.info(f"Elevation extraction complete: {orig_size[0]}x{orig_size[1]} in {latency:.3f}s")
        return {
            "rdsm": rdsm,
            "inference_time": latency,
            "original_size": orig_size
        }
