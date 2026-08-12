import { useMemo, useState } from 'react'
import { TEXTURE_OPTIONS } from '../data/textures'

function VisualizerStudio({ onAddToCart }) {
  const [selectedTexture, setSelectedTexture] = useState(TEXTURE_OPTIONS[0].image)

  const activeOption = useMemo(
    () =>
      TEXTURE_OPTIONS.find((item) => item.image === selectedTexture) ??
      TEXTURE_OPTIONS[0],
    [selectedTexture],
  )

  const handleAddToCart = () => {
    onAddToCart(activeOption)
  }

  return (
    <div className="visualizer-studio visualizer-studio--wide">
      <aside className="visualizer-sidebar">
        <div className="visualizer-sidebar-header">
          <span className="step-label">Step 3 of 3</span>
          <h2 className="visualizer-sidebar-title">
            Selected Collection: Italian &amp; Onyx Marbles
          </h2>
        </div>

        <div className="texture-carousel">
          <span className="texture-carousel-label">Texture Selector</span>
          <div className="texture-grid">
            {TEXTURE_OPTIONS.map((item) => (
              <button
                key={item.image}
                type="button"
                className={[
                  'texture-option',
                  selectedTexture === item.image && 'texture-option--selected',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelectedTexture(item.image)}
                aria-pressed={selectedTexture === item.image}
                aria-label={item.name}
              >
                <img
                  src={item.image}
                  alt=""
                  className="texture-option-image"
                />
                <span className="texture-option-name">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        <dl className="material-specs">
          <div className="material-spec">
            <dt>Finish</dt>
            <dd>{activeOption.finish}</dd>
          </div>
          <div className="material-spec">
            <dt>Origin</dt>
            <dd>{activeOption.origin}</dd>
          </div>
          <div className="material-spec">
            <dt>Slabs Available</dt>
            <dd>{activeOption.slabsAvailable} in stock</dd>
          </div>
        </dl>

        <button
          type="button"
          className="btn btn-primary visualizer-add-btn"
          onClick={handleAddToCart}
        >
          Add Selected Material to Cart
        </button>
      </aside>

      <div className="visualizer-preview">
        <div className="preview-frame">
          <div className="preview-canvas">
            <img
              src={selectedTexture}
              alt={`${activeOption.name} applied to room surfaces`}
              className="preview-texture-layer"
            />
            <img
              src="/bathroom-mask.png"
              alt=""
              className="preview-mask-layer"
              aria-hidden="true"
            />
            <div className="preview-mode-pill">
              <span className="preview-mode-dot" aria-hidden="true" />
              Live AR Simulation · Active
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VisualizerStudio
