const CATEGORIES = [
  { id: 'marble', label: 'Marble' },
  { id: 'granite', label: 'Granite' },
  { id: 'quartzite', label: 'Quartzite' },
  { id: 'onyx', label: 'Onyx' },
  { id: 'travertine', label: 'Travertine' },
  { id: 'slate', label: 'Slate' },
]

function CategoriesStep({ onContinue }) {
  return (
    <div className="step-view">
      <div className="step-container">
        <div className="step-header">
          <span className="step-label">Step 1 of 3</span>
          <h1>Select Your Stone</h1>
          <p className="step-description">
            Browse our curated collection of premium natural stones and choose
            the category that best suits your space.
          </p>
        </div>

        <div className="step-content">
          <div className="placeholder-grid">
            {CATEGORIES.map(({ id, label }) => (
              <button key={id} type="button" className="placeholder-card">
                <svg
                  className="placeholder-card-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="1" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
                <span className="placeholder-card-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="step-actions">
          <button type="button" className="btn btn-primary" onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export default CategoriesStep
