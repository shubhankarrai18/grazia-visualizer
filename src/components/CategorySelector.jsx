import { useEffect, useState } from 'react'

const CATEGORIES = [
  {
    id: 'marbles',
    label: 'Marbles & Natural Stone',
    active: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M4 20h16M6 20V8l6-4 6 4v12" />
        <path d="M9 12h6M9 16h6" />
      </svg>
    ),
  },
  {
    id: 'tiles',
    label: 'Tiles & Cladding',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" />
        <rect x="13" y="3" width="8" height="8" />
        <rect x="3" y="13" width="8" height="8" />
        <rect x="13" y="13" width="8" height="8" />
      </svg>
    ),
  },
  {
    id: 'sanitaryware',
    label: 'Sanitaryware & Taps',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M6 20h12M8 20V10a4 4 0 018 0v10" />
        <path d="M12 6V4M9 4h6" />
      </svg>
    ),
  },
  {
    id: 'carvings',
    label: 'Custom Carvings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M12 3l2 4 4 .5-3 3 1 4.5L12 13l-4 2 1-4.5-3-3 4-.5z" />
        <path d="M8 21h8" />
      </svg>
    ),
  },
]

function CategorySelector({ onSelectMarble }) {
  const [toastVisible, setToastVisible] = useState(false)

  useEffect(() => {
    if (!toastVisible) return undefined

    const timer = setTimeout(() => setToastVisible(false), 3500)
    return () => clearTimeout(timer)
  }, [toastVisible])

  const handleCardClick = (category) => {
    if (category.id === 'marbles') {
      onSelectMarble()
      return
    }
    setToastVisible(true)
  }

  return (
    <div className="category-selector category-selector--wide">
      {toastVisible && (
        <div className="toast-banner" role="status" aria-live="polite">
          This collection is coming soon in Phase 2
        </div>
      )}

      <div className="category-grid">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            className={[
              'category-card',
              category.active && 'category-card--active',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleCardClick(category)}
          >
            {category.active && (
              <span className="category-card-badge">Active</span>
            )}
            <span className="category-card-icon">{category.icon}</span>
            <span className="category-card-label">{category.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default CategorySelector
