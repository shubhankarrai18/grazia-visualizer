function VisualizerStep({ onBack }) {
  return (
    <div className="step-view">
      <div className="step-container">
        <div className="step-header">
          <span className="step-label">Step 3 of 3</span>
          <h1>Spatial AR Visualizer</h1>
          <p className="step-description">
            Preview your selected stone in your space with real-time spatial
            mapping and photorealistic rendering.
          </p>
        </div>

        <div className="step-content">
          <div className="visualizer-canvas">
            <svg
              className="visualizer-placeholder-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <p className="visualizer-status">Visualizer canvas loading…</p>
          </div>
        </div>

        <div className="step-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary">
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}

export default VisualizerStep
