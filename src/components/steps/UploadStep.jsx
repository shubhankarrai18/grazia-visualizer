function UploadStep({ onContinue, onBack }) {
  return (
    <div className="step-view">
      <div className="step-container">
        <div className="step-header">
          <span className="step-label">Step 2 of 3</span>
          <h1>Upload Your Space</h1>
          <p className="step-description">
            Share a photo of your room or surface. Our spatial engine will
            prepare it for an immersive stone visualization.
          </p>
        </div>

        <div className="step-content">
          <div className="upload-zone">
            <svg
              className="upload-zone-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M12 16V4m0 0L8 8m4-4l4 4" />
              <path d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" />
            </svg>
            <p className="upload-zone-text">
              Drag &amp; drop your image here, or click to browse
            </p>
            <p className="upload-zone-hint">JPG, PNG · Max 10 MB</p>
          </div>
        </div>

        <div className="step-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary" onClick={onContinue}>
            Launch Visualizer
          </button>
        </div>
      </div>
    </div>
  )
}

export default UploadStep
