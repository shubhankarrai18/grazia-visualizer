import { useEffect, useRef } from 'react'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=2075&auto=format&fit=crop'

const EXCELLENCE_ITEMS = [
  {
    id: 'craft',
    image:
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1200&auto=format&fit=crop',
    title: 'Hand-Selected Quarries',
    text: 'Every slab is sourced from the world\'s most revered quarries — Carrara, Makrana, and beyond — chosen for character, veining, and permanence.',
    layout: 'image-left',
  },
  {
    id: 'precision',
    image:
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=1200&auto=format&fit=crop',
    title: 'Precision Fabrication',
    text: 'CNC-guided cutting and artisan finishing ensure each surface meets the exacting standards of five-star hospitality and private estate commissions.',
    layout: 'image-right',
  },
  {
    id: 'vision',
    image:
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?q=80&w=1200&auto=format&fit=crop',
    title: 'Spatial Vision',
    text: 'From statement walls to immersive bathrooms, Grazia Stones transforms architectural intent into tactile luxury — experienced before a single slab is installed.',
    layout: 'image-wide',
  },
]

function FadeInBlock({ children, className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('is-visible')
          observer.unobserve(node)
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`fade-in-block ${className}`.trim()}>
      {children}
    </div>
  )
}

function LandingPage({ onLaunchVisualizer }) {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <img
          src={HERO_IMAGE}
          alt=""
          className="landing-hero-bg"
          aria-hidden="true"
        />
        <div className="landing-hero-overlay" aria-hidden="true" />

        <div className="landing-hero-content">
          <p className="landing-hero-eyebrow">Grazia Stones</p>
          <h1 className="landing-hero-title">Art That Transforms Spaces.</h1>
          <p className="landing-hero-subtitle">
            Bespoke stone &amp; natural marble for the world&apos;s most
            luxurious interiors.
          </p>
          <button
            type="button"
            className="btn btn-primary landing-hero-cta"
            onClick={onLaunchVisualizer}
          >
            Launch AR Visualizer
          </button>
        </div>
      </section>

      <section className="landing-excellence">
        <div className="landing-excellence-inner">
          <FadeInBlock className="landing-excellence-header">
            <span className="landing-section-label">Our Philosophy</span>
            <h2 className="landing-excellence-title">The Grazia Excellence</h2>
            <p className="landing-excellence-intro">
              Three decades of stone mastery, distilled into surfaces that define
              the world&apos;s most extraordinary spaces.
            </p>
          </FadeInBlock>

          <div className="landing-excellence-grid">
            {EXCELLENCE_ITEMS.map((item) => (
              <FadeInBlock
                key={item.id}
                className={`excellence-item excellence-item--${item.layout}`}
              >
                <div className="excellence-item-image-wrap">
                  <img
                    src={item.image}
                    alt=""
                    className="excellence-item-image"
                    loading="lazy"
                  />
                </div>
                <div className="excellence-item-copy">
                  <h3 className="excellence-item-title">{item.title}</h3>
                  <p className="excellence-item-text">{item.text}</p>
                </div>
              </FadeInBlock>
            ))}
          </div>

          <FadeInBlock className="landing-excellence-footer">
            <button
              type="button"
              className="btn btn-primary landing-secondary-cta"
              onClick={onLaunchVisualizer}
            >
              Begin Your Visualization
            </button>
          </FadeInBlock>
        </div>
      </section>
    </div>
  )
}

export default LandingPage
