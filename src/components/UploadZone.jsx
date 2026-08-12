import { useCallback, useEffect, useRef, useState } from 'react'

const PROCESSING_MESSAGES = [
  'Analyzing room dimensions...',
  'Mapping surface depth & geometry...',
  'Applying lighting & reflection layers...',
]

const PROCESSING_DURATION_MS = 3000
const MESSAGE_CYCLE_MS = 800

function UploadZone({ onComplete }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [messageIndex, setMessageIndex] = useState(0)

  const startProcessing = useCallback(() => {
    if (isProcessing) return
    setMessageIndex(0)
    setIsProcessing(true)
  }, [isProcessing])

  useEffect(() => {
    if (!isProcessing) return undefined

    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length)
    }, MESSAGE_CYCLE_MS)

    const completeTimeout = setTimeout(() => {
      onComplete()
    }, PROCESSING_DURATION_MS)

    return () => {
      clearInterval(messageInterval)
      clearTimeout(completeTimeout)
    }
  }, [isProcessing, onComplete])

  const handleDragOver = (event) => {
    if (isProcessing) return
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (event) => {
    if (isProcessing) return
    event.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (event) => {
    if (isProcessing) return
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files?.length) {
      startProcessing()
    }
  }

  const handleFileChange = (event) => {
    if (isProcessing) return
    if (event.target.files?.length) {
      startProcessing()
    }
  }

  const handleZoneClick = () => {
    if (isProcessing) return
    inputRef.current?.click()
  }

  const handleKeyDown = (event) => {
    if (isProcessing) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      inputRef.current?.click()
    }
  }

  return (
    <div className="upload-zone-wrapper">
      <div
        className={[
          'upload-zone',
          isDragging && 'upload-zone--dragover',
          isProcessing && 'upload-zone--processing',
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={isProcessing ? -1 : 0}
        aria-disabled={isProcessing}
        aria-label="Upload a photo of your bathroom or room space"
        onClick={handleZoneClick}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="upload-zone-input"
          disabled={isProcessing}
          onChange={handleFileChange}
          tabIndex={-1}
          aria-hidden="true"
        />

        {isProcessing ? (
          <div className="upload-processing">
            <div className="processing-spinner" aria-hidden="true" />
            <p className="processing-text" aria-live="polite">
              {PROCESSING_MESSAGES[messageIndex]}
            </p>
          </div>
        ) : (
          <>
            <svg
              className="upload-zone-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16" />
              <path d="M14 14l1-1a2 2 0 012.828 0L20 15" />
              <circle cx="9" cy="9" r="2" />
              <path d="M12 19H6a2 2 0 01-2-2V7a2 2 0 012-2h1" />
              <path d="M16 5h2a2 2 0 012 2v10" />
              <path d="M19 16v3M17.5 17.5L19 16l1.5 1.5" />
            </svg>
            <p className="upload-zone-text">
              Upload a photo of your bathroom or room space
            </p>
            <p className="upload-zone-hint">Drag &amp; drop or click to browse · JPG, PNG</p>
          </>
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost upload-sample-btn"
        disabled={isProcessing}
        onClick={startProcessing}
      >
        Or use our pre-mapped sample luxury room
      </button>
    </div>
  )
}

export default UploadZone
