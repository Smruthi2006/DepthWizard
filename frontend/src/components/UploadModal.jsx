import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, Clipboard, CheckCircle2, AlertCircle, Satellite, Image as ImageIcon } from 'lucide-react';

export default function UploadModal({ isOpen, onClose, onUploadSuccess, initialFile = null }) {
  const [selectedFile, setSelectedFile] = useState(initialFile);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [refDemFile, setRefDemFile] = useState(null);
  const [landscapeType, setLandscapeType] = useState('hilly');
  const [calibMethod, setCalibMethod] = useState('scene_prior');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Set initial file if passed from global Ctrl+V paste
  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
    }
  }, [initialFile]);

  // Handle global paste event when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePasteEvent = (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              setFile(file);
              setErrorMsg(null);
              break;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePasteEvent);
    return () => window.removeEventListener('paste', handlePasteEvent);
  }, [isOpen]);

  const setFile = (f) => {
    setSelectedFile(f);
    const isGeo = f.name.toLowerCase().endsWith('.tif') || f.name.toLowerCase().endsWith('.tiff');
    if (isGeo) {
      setCalibMethod('dem');
    } else {
      setCalibMethod('scene_prior');
    }
    // Create preview
    if (f.type.startsWith('image/') || f.name.match(/\.(png|jpg|jpeg|webp)$/i)) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Explicit Clipboard read button
  const handlePasteButton = async () => {
    setErrorMsg(null);
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setErrorMsg('Clipboard API not available in this browser. Please press Ctrl+V on your keyboard.');
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      let foundImage = false;
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `clipboard_image_${Date.now()}.${type.split('/')[1] || 'png'}`, { type });
            setFile(file);
            foundImage = true;
            break;
          }
        }
        if (foundImage) break;
      }
      if (!foundImage) {
        setErrorMsg('No image found in clipboard. Copy an image first (Right Click -> Copy Image or Win+Shift+S), then try again.');
      }
    } catch (err) {
      setErrorMsg('Clipboard permission denied. Please press Ctrl+V directly to paste.');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select or paste an image file to process.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('calibration_method', calibMethod);
    formData.append('landscape_type', landscapeType);
    if (refDemFile) {
      formData.append('ref_dem_file', refDemFile);
    }

    try {
      const res = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload and processing failed.');
      }

      const data = await res.json();
      onUploadSuccess(data);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Error communicating with backend.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const isGeo = selectedFile?.name.toLowerCase().endsWith('.tif') || selectedFile?.name.toLowerCase().endsWith('.tiff');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ width: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Satellite size={22} color="var(--accent-cyan)" />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.22rem' }}>
              Upload or Paste Satellite Imagery
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* File Dropzone & Paste Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragging ? 'var(--accent-cyan)' : 'var(--border-glow)'}`,
              borderRadius: '12px',
              padding: '24px 18px',
              textAlign: 'center',
              background: isDragging ? 'rgba(0, 229, 255, 0.08)' : 'rgba(0, 229, 255, 0.02)',
              transition: 'all 0.2s ease',
              position: 'relative'
            }}
          >
            <input
              type="file"
              id="imagery-upload"
              accept=".png,.jpg,.jpeg,.tif,.tiff,.webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {previewUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{
                    maxHeight: '130px',
                    maxWidth: '100%',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    objectFit: 'contain'
                  }}
                />
                <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label htmlFor="imagery-upload" className="dock-btn" style={{ cursor: 'pointer', padding: '5px 12px', fontSize: '0.74rem' }}>
                    Replace Image
                  </label>
                  <button
                    type="button"
                    className="dock-btn"
                    onClick={handlePasteButton}
                    style={{ padding: '5px 12px', fontSize: '0.74rem', color: 'var(--accent-saffron)' }}
                  >
                    <Clipboard size={13} />
                    <span>Paste Again (Ctrl+V)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Upload size={28} color="var(--accent-cyan)" />
                  <span style={{ color: 'var(--text-dim)' }}>or</span>
                  <Clipboard size={28} color="var(--accent-saffron)" />
                </div>
                <div style={{ fontWeight: '600', fontSize: '0.92rem' }}>
                  Drag & Drop, Browse, or <span style={{ color: 'var(--accent-saffron)' }}>Paste (Ctrl+V)</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', maxWidth: '380px' }}>
                  Copy any satellite, aerial, or mountain photo (like Mount Everest) from Google and press <strong>Ctrl+V</strong> right here!
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <label htmlFor="imagery-upload" className="dock-btn" style={{ cursor: 'pointer', padding: '6px 14px' }}>
                    <Upload size={14} />
                    <span>Browse Files</span>
                  </label>
                  <button
                    type="button"
                    className="dock-btn"
                    onClick={handlePasteButton}
                    style={{ padding: '6px 14px', borderColor: 'var(--accent-saffron)' }}
                  >
                    <Clipboard size={14} color="var(--accent-saffron)" />
                    <span>Paste from Clipboard</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Format Detection Badge */}
          {selectedFile && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 14px',
              borderRadius: '8px',
              background: isGeo ? 'rgba(0, 230, 118, 0.08)' : 'rgba(0, 229, 255, 0.08)',
              border: `1px solid ${isGeo ? 'rgba(0, 230, 118, 0.3)' : 'rgba(0, 229, 255, 0.3)'}`,
              fontSize: '0.76rem'
            }}>
              <span>Format: <strong>{isGeo ? 'Georeferenced GeoTIFF' : 'Optical RGB (PNG/JPG/WebP)'}</strong></span>
              <span style={{ color: isGeo ? 'var(--accent-green)' : 'var(--accent-cyan)', fontWeight: '600' }}>
                {isGeo ? 'Metric GeoTIFF Calibration' : 'Monocular Depth Pipeline Ready'}
              </span>
            </div>
          )}

          {/* Landscape Semantic Selection */}
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Landscape Context (Elevation Scale Prior):
            </label>
            <select
              value={landscapeType}
              onChange={(e) => setLandscapeType(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                outline: 'none',
                fontSize: '0.84rem'
              }}
            >
              <option value="hilly">Mountainous / Hilly (Steep Slopes, Ridges, Peaks, Everest, High Relief)</option>
              <option value="urban">Urban (Buildings, Infrastructure, Rooftops, Street Grid)</option>
              <option value="sparse">Sparse / Semi-Arid (Plains, Outcrops, Low Relief)</option>
              <option value="forested">Forested (Dense Canopy, Biomass Relief)</option>
            </select>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-red)', fontSize: '0.78rem' }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn-primary"
            disabled={isProcessing || !selectedFile}
            style={{ opacity: isProcessing ? 0.7 : 1, padding: '12px' }}
          >
            {isProcessing ? 'Estimating Metric Elevation & Generating 3D Mesh...' : 'Reconstruct 3D Terrain & Start Flythrough'}
          </button>
        </form>
      </div>
    </div>
  );
}
