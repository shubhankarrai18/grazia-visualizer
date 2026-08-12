function CartDrawer({ isOpen, items, onClose, onRemoveItem }) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.pricePerSqFt * (item.quantity ?? 1),
    0,
  )

  return (
    <>
      <div
        className={`cart-drawer-backdrop${isOpen ? ' cart-drawer-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <aside
        className={`cart-drawer${isOpen ? ' cart-drawer--open' : ''}`}
        aria-hidden={!isOpen}
        aria-label="Shopping cart"
      >
        <div className="cart-drawer-header">
          <h2 className="cart-drawer-title">Your Selection</h2>
          <button
            type="button"
            className="cart-drawer-close"
            onClick={onClose}
            aria-label="Close cart"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="cart-drawer-body">
          {items.length === 0 ? (
            <p className="cart-drawer-empty">No materials selected yet.</p>
          ) : (
            <ul className="cart-drawer-list">
              {items.map((item) => (
                <li key={item.cartId} className="cart-drawer-item">
                  <img
                    src={item.image}
                    alt=""
                    className="cart-drawer-item-thumb"
                  />
                  <div className="cart-drawer-item-details">
                    <span className="cart-drawer-item-name">{item.name}</span>
                    <span className="cart-drawer-item-meta">
                      {item.finish} · {item.origin}
                    </span>
                    <span className="cart-drawer-item-price">
                      ${item.pricePerSqFt.toFixed(2)} / sq. ft.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="cart-drawer-item-remove"
                    onClick={() => onRemoveItem(item.cartId)}
                    aria-label={`Remove ${item.name}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-drawer-footer">
            <div className="cart-drawer-summary">
              <span className="cart-drawer-summary-label">Estimated from</span>
              <span className="cart-drawer-summary-value">
                ${subtotal.toFixed(2)} / sq. ft.
              </span>
            </div>
            <button type="button" className="btn btn-primary cart-drawer-cta">
              Request Official B2B Quote
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

export default CartDrawer
