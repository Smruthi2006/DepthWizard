import React, { useState } from 'react';
import { Upload, X, FileCheck, Layers, AlertCircle, Satellite } from 'lucide-react';

export default function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [refDemFile, setRefDemFile] = useState(null);
  const [landscapeType, setLandscapeType] = useState('urban');
  const [calibMethod, setCalibMethod] = useState('scene_prior');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setSelectedFile(f);
      const isGeo = f.name.toLowerCase().endsWith('.tif') || f.name.toLowerCase().endsWith('.tiff');
      if (isGeo) {
        setCalibMethod('dem');
      } else {
        setCalibMethod('scene_prior');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select an image file to process.');
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

  const isGeo = selectedFile?.name.toLowerCase().endsWith('.tif') || selectedFile?.name.toLowerCase().endsWith('.tiff');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Satellite size={22} color="var(--accent-cyan)" />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem' }}>
              Upload Satellite Optical Imagery
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* File Dropzone */}
          <div style={{
            border: '2px dashed var(--border-glow)',
            borderRadius: '10px',
            padding: '24px',
            textAlign: 'center',
            background: 'rgba(0, 229, 255, 0.02)',
            cursor: 'pointer'
          }}>
            <input
              type="file"
              id="imagery-upload"
              accept=".png,.jpg,.jpeg,.tif,.tiff"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <label htmlFor="imagery-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Upload size={32} color="var(--accent-cyan)" />
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                {selectedFile ? selectedFile.name : 'Select Single-View Optical Image'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Supports Non-Georeferenced (PNG, JPG) or Georeferenced (GeoTIFF)
              </div>
            </label>
          </div>

          {/* Format Detection Badge */}
          {selectedFile && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: '6px',
              background: isGeo ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 145, 0, 0.1)',
              border: `1px solid ${isGeo ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 145, 0, 0.3)'}`,
              fontSize: '0.75rem'
            }}>
              <span>Format Detected: <strong>{isGeo ? 'Georeferenced GeoTIFF' : 'Standard Optical RGB (PNG/JPG)'}</strong></span>
              <span style={{ color: isGeo ? 'var(--accent-green)' : 'var(--accent-saffron)' }}>
                {isGeo ? 'Metric Calibration Available' : 'Relative rDSM Pipeline'}
              </span>
            </div>
          )}

          {/* Landscape Semantic Selection */}
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Landscape Context (ISRO Target Prior):
            </label>
            <select
              value={landscapeType}
              onChange={(e) => setLandscapeType(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                outline: 'none',
                fontSize: '0.85rem'
              }}
            >
              <option value="urban">Urban (Buildings, Infrastructure, Street Grid)</option>
              <option value="sparse">Sparse / Semi-Arid (Plains, Outcrops, Low Relief)</option>
              <option value="hilly">Hilly / Mountainous (Steep Slopes, Ridges, Valleys)</option>
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
            style={{ opacity: isProcessing ? 0.7 : 1 }}
          >
            {isProcessing ? 'Estimating Elevations & Building 3D Mesh...' : 'Process Image & Generate 3D Flythrough'}
          </button>
        </form>
      </div>
    </div>
  );
}
