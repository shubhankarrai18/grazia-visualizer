import { useCallback, useState } from 'react'
import CategorySelector from './components/CategorySelector'
import UploadZone from './components/UploadZone'
import VisualizerStudio from './components/VisualizerStudio'
import CartDrawer from './components/CartDrawer'

export const STEPS = {
  CATEGORIES: 'CATEGORIES',
  UPLOAD: 'UPLOAD',
  VISUALIZER: 'VISUALIZER',
}

const STEP_ORDER = [STEPS.CATEGORIES, STEPS.UPLOAD, STEPS.VISUALIZER]

function StepProgress({ currentStep }) {
  const currentIndex = STEP_ORDER.indexOf(currentStep)

  return (
    <nav className="step-progress" aria-label="Progress">
      {STEP_ORDER.map((step, index) => (
        <div key={step} className="step-progress-item">
          <span
            className={[
              'step-progress-dot',
              index === currentIndex && 'active',
              index < currentIndex && 'completed',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-current={index === currentIndex ? 'step' : undefined}
          />
          {index < STEP_ORDER.length - 1 && (
            <span
              className={[
                'step-progress-line',
                index < currentIndex && 'completed',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          )}
        </div>
      ))}
    </nav>
  )
}

function App() {
  const [currentStep, setCurrentStep] = useState(STEPS.CATEGORIES)
  const [cartItems, setCartItems] = useState([])
  const [isCartOpen, setIsCartOpen] = useState(false)

  const cartCount = cartItems.length

  const handleAddToCart = useCallback((texture) => {
    setCartItems((prev) => [
      ...prev,
      { ...texture, cartId: `${texture.id}-${Date.now()}` },
    ])
    setIsCartOpen(true)
  }, [])

  const handleRemoveFromCart = useCallback((cartId) => {
    setCartItems((prev) => prev.filter((item) => item.cartId !== cartId))
  }, [])

  const renderStep = () => {
    switch (currentStep) {
      case STEPS.CATEGORIES:
        return (
          <div className="step-view">
            <div className="step-container">
              <div className="step-header">
                <span className="step-label">Step 1 of 3</span>
                <h1>Select Your Collection</h1>
                <p className="step-description">
                  Choose a product category to begin your bespoke stone
                  visualization journey.
                </p>
              </div>
              <CategorySelector
                onSelectMarble={() => setCurrentStep(STEPS.UPLOAD)}
              />
            </div>
          </div>
        )
      case STEPS.UPLOAD:
        return (
          <div className="step-view">
            <div className="step-container">
              <div className="step-header">
                <span className="step-label">Step 2 of 3</span>
                <h1>Upload Your Space</h1>
                <p className="step-description">
                  Share a photo of your room or explore our curated sample
                  environment for an instant preview.
                </p>
              </div>
              <UploadZone
                onComplete={() => setCurrentStep(STEPS.VISUALIZER)}
              />
              <div className="step-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCurrentStep(STEPS.CATEGORIES)}
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )
      case STEPS.VISUALIZER:
        return (
          <div className="step-view step-view--studio">
            <VisualizerStudio onAddToCart={handleAddToCart} />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <button
          type="button"
          className="brand"
          onClick={() => setCurrentStep(STEPS.CATEGORIES)}
          aria-label="Grazia Stones home"
        >
          <span className="brand-name">Grazia Stones</span>
          <span className="brand-tagline">
            Fine Statement Walls &amp; Spatial Visualizer
          </span>
        </button>

        <div className="header-actions">
          <span className="beta-badge">
            <span className="beta-badge-dot" aria-hidden="true" />
            Spatial AR Visualizer (Beta)
          </span>

          <button
            type="button"
            className="cart-button"
            aria-label={`Shopping cart${cartCount > 0 ? `, ${cartCount} items` : ''}`}
            onClick={() => setIsCartOpen(true)}
          >
            <svg
              className="cart-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M6 6h15l-1.5 9H7.5L6 6z" />
              <path d="M6 6L5 3H2" />
              <circle cx="9" cy="20" r="1" />
              <circle cx="18" cy="20" r="1" />
            </svg>
            {cartCount > 0 && (
              <span className="cart-count" aria-hidden="true">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="app-main">
        <StepProgress currentStep={currentStep} />
        {renderStep()}
      </main>

      <CartDrawer
        isOpen={isCartOpen}
        items={cartItems}
        onClose={() => setIsCartOpen(false)}
        onRemoveItem={handleRemoveFromCart}
      />
    </div>
  )
}

export default App
