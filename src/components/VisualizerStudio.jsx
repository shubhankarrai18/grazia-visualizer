import { useEffect, useState } from 'react'
import { TEXTURES } from '../data/textures'

function VisualizerStudio({ onAddToCart }) {
  const [selectedTexture, setSelectedTexture] = useState(TEXTURES[0])
  const [textureOpacity, setTextureOpacity] = useState(1)

  useEffect(() => {
    setTextureOpacity(0)
    const timer = setTimeout(() => setTextureOpacity(1), 400)
    return () => clearTimeout(timer)
  }, [selectedTexture.id])

  const handleAddToCart = () => {
    onAddToCart(selectedTexture)
  }

  const handleSelectTexture = (texture) => {
    if (texture.id !== selectedTexture.id) {
      setSelectedTexture(texture)
    }
  }

  return (
    <div className="visualizer-studio">
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
            {TEXTURES.map((texture) => (
              <button
                key={texture.id}
                type="button"
                className={[
                  'texture-option',
                  selectedTexture.id === texture.id && 'texture-option--selected',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleSelectTexture(texture)}
                aria-pressed={selectedTexture.id === texture.id}
                aria-label={texture.name}
              >
                <img
                  src={texture.image}
                  alt=""
                  className="texture-option-image"
                />
                <span className="texture-option-name">{texture.name}</span>
              </button>
            ))}
          </div>
        </div>

        <dl className="material-specs">
          <div className="material-spec">
            <dt>Finish</dt>
            <dd>{selectedTexture.finish}</dd>
          </div>
          <div className="material-spec">
            <dt>Origin</dt>
            <dd>{selectedTexture.origin}</dd>
          </div>
          <div className="material-spec">
            <dt>Slabs Available</dt>
            <dd>{selectedTexture.slabsAvailable} in stock</dd>
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
        <div className="preview-canvas">
          <img
            src={selectedTexture.image}
            alt={`${selectedTexture.name} applied to room surfaces`}
            className="preview-texture-layer"
            style={{ opacity: textureOpacity }}
          />
          <img
            src="/bathroom-mask.png"
            alt=""
            className="preview-mask-layer"
            aria-hidden="true"
          />
          <div className="preview-mode-pill">
            <span className="preview-mode-dot" aria-hidden="true" />
            Live AR Simulation Mode [Active]
          </div>
        </div>
      </div>
    </div>
  )
}

export default VisualizerStudio
