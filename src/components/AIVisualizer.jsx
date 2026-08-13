import { useCallback, useEffect, useRef, useState } from 'react'
import { pipeline, env } from '@huggingface/transformers'
import { TEXTURE_OPTIONS } from '../data/textures'

env.allowLocalModels = false

const MARBLE_TEXTURES = TEXTURE_OPTIONS.map((t) => t.image)
const MAX_RENDER_DIMENSION = 1280

function resizeMaskToImage(maskCanvas, targetWidth, targetHeight) {
  if (
    maskCanvas.width === targetWidth &&
    maskCanvas.height === targetHeight
  ) {
    return maskCanvas
  }

  const resized = document.createElement('canvas')
  resized.width = targetWidth
  resized.height = targetHeight
  const ctx = resized.getContext('2d')
  ctx.drawImage(maskCanvas, 0, 0, targetWidth, targetHeight)
  return resized
}

function maskToCanvas(rawMask) {
  if (typeof rawMask.toCanvas === 'function') {
    return rawMask.toCanvas()
  }

  const canvas = document.createElement('canvas')
  canvas.width = rawMask.width
  canvas.height = rawMask.height
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(rawMask.width, rawMask.height)

  for (let i = 0; i < rawMask.data.length; i++) {
    const value = rawMask.data[i]
    imageData.data[i * 4] = value
    imageData.data[i * 4 + 1] = value
    imageData.data[i * 4 + 2] = value
    imageData.data[i * 4 + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function getRenderDimensions(width, height) {
  const longest = Math.max(width, height)
  if (longest <= MAX_RENDER_DIMENSION) {
    return { width, height }
  }

  const scale = MAX_RENDER_DIMENSION / longest
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

function revokeBlobUrl(url) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function AIVisualizer({ onAddToCart }) {
  const [uploadedImage, setUploadedImage] = useState(null)
  const [aiMaskCanvas, setAiMaskCanvas] = useState(null)
  const [selectedTexture, setSelectedTexture] = useState(MARBLE_TEXTURES[0])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)

  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const photoRef = useRef(null)
  const segmenterRef = useRef(null)
  const imageCacheRef = useRef(new Map())
  const cameraStreamRef = useRef(null)

  const activeOption =
    TEXTURE_OPTIONS.find((item) => item.image === selectedTexture) ??
    TEXTURE_OPTIONS[0]

  const loadImageElement = useCallback((src) => {
    if (imageCacheRef.current.has(src)) {
      return Promise.resolve(imageCacheRef.current.get(src))
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        imageCacheRef.current.set(src, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
  }, [])

  const runSegmentation = useCallback(
    async (imageSrc) => {
      setIsProcessing(true)
      setError(null)
      setAiMaskCanvas(null)

      try {
        const photo = await loadImageElement(imageSrc)
        photoRef.current = photo

        if (!segmenterRef.current) {
          segmenterRef.current = await pipeline(
            'image-segmentation',
            'Xenova/segformer-b0-finetuned-ade-512-512',
          )
        }

        const output = await segmenterRef.current(imageSrc)
        const wallData = output.find((item) =>
          item.label.toLowerCase().includes('wall'),
        )

        if (!wallData?.mask) {
          throw new Error(
            'Could not detect wall surfaces in this photo. Try a clearer bathroom image.',
          )
        }

        const rawMaskCanvas = maskToCanvas(wallData.mask)
        const { width, height } = getRenderDimensions(photo.width, photo.height)
        const alignedMask = resizeMaskToImage(rawMaskCanvas, width, height)
        setAiMaskCanvas(alignedMask)
      } catch (segmentError) {
        console.error(segmentError)
        setError(
          segmentError instanceof Error
            ? segmentError.message
            : 'AI segmentation failed. Please try another photo.',
        )
      } finally {
        setIsProcessing(false)
      }
    },
    [loadImageElement],
  )

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current
    stream?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraStream(null)
    setIsCameraOpen(false)

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const openCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert(
        'Camera capture is not supported in this browser. Please upload from your gallery instead.',
      )
      return
    }

    try {
      stopCamera()

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })

      cameraStreamRef.current = stream
      setCameraStream(stream)
      setIsCameraOpen(true)
    } catch (cameraError) {
      console.error(cameraError)
      alert(
        'Camera access was denied or unavailable. Please enable camera permissions in your browser settings, or upload from gallery.',
      )
      stopCamera()
    }
  }, [stopCamera])

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return

    const captureCanvas = document.createElement('canvas')
    captureCanvas.width = video.videoWidth
    captureCanvas.height = video.videoHeight

    const ctx = captureCanvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height)
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.92)

    revokeBlobUrl(uploadedImage)
    setUploadedImage(dataUrl)
    stopCamera()
    await runSegmentation(dataUrl)
  }, [runSegmentation, stopCamera, uploadedImage])

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      if (!file) return

      revokeBlobUrl(uploadedImage)

      const objectUrl = URL.createObjectURL(file)
      setUploadedImage(objectUrl)
      await runSegmentation(objectUrl)

      event.target.value = ''
    },
    [runSegmentation, uploadedImage],
  )

  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current
    const mask = aiMaskCanvas
    const photo = photoRef.current

    if (!canvas || !mask || !photo) return

    try {
      const texture = await loadImageElement(selectedTexture)
      const { width, height } = getRenderDimensions(photo.width, photo.height)

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, width, height)

      ctx.drawImage(mask, 0, 0, width, height)

      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(texture, 0, 0, width, height)

      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(photo, 0, 0, width, height)

      ctx.globalCompositeOperation = 'source-over'
    } catch (renderError) {
      console.error(renderError)
    }
  }, [aiMaskCanvas, loadImageElement, selectedTexture])

  useEffect(() => {
    renderCanvas()
  }, [renderCanvas])

  useEffect(() => {
    MARBLE_TEXTURES.forEach((src) => {
      loadImageElement(src).catch(() => {})
    })
  }, [loadImageElement])

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream
    }
  }, [cameraStream, isCameraOpen])

  useEffect(() => {
    return () => {
      revokeBlobUrl(uploadedImage)
    }
  }, [uploadedImage])

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isCameraOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        stopCamera()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isCameraOpen, stopCamera])

  const handleAddToCart = () => {
    onAddToCart(activeOption)
  }

  return (
    <div className="ai-visualizer">
      <aside className="ai-visualizer-panel">
        <div className="ai-visualizer-header">
          <span className="step-label">Step 3 of 3</span>
          <h2 className="ai-visualizer-title">AI Spatial Stone Visualizer</h2>
          <p className="ai-visualizer-subtitle">
            Upload or capture your bathroom photo. Our on-device AI segments wall
            surfaces and composites Grazia marble in real time.
          </p>
        </div>

        <div className="ai-upload-block">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="upload-zone-input"
            onChange={handleFileChange}
            disabled={isProcessing || isCameraOpen}
          />
          <div className="ai-upload-actions">
            <button
              type="button"
              className="btn btn-ghost ai-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || isCameraOpen}
            >
              Upload from Gallery
            </button>
            <button
              type="button"
              className="btn btn-primary ai-upload-btn"
              onClick={openCamera}
              disabled={isProcessing || isCameraOpen}
            >
              Take Photo
            </button>
          </div>
        </div>

        {error && (
          <p className="ai-visualizer-error" role="alert">
            {error}
          </p>
        )}

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
            <dt>Selected Stone</dt>
            <dd>{activeOption.name}</dd>
          </div>
        </dl>

        <button
          type="button"
          className="btn btn-primary visualizer-add-btn"
          onClick={handleAddToCart}
          disabled={!aiMaskCanvas}
        >
          Add Selected Material to Cart
        </button>
      </aside>

      <div className="ai-visualizer-stage">
        <div className="ai-canvas-frame">
          {!uploadedImage && !isProcessing && (
            <div className="ai-canvas-placeholder">
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
              </svg>
              <p>Upload or take a bathroom photo to begin AI wall segmentation</p>
            </div>
          )}

          {isProcessing && (
            <div className="ai-processing-overlay">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="ai-processing-text">
                AI Engine Segmenting Room Surfaces...
              </p>
            </div>
          )}

          <canvas
            ref={canvasRef}
            className="ai-render-canvas"
            aria-label="AI marble visualization preview"
          />
        </div>

        <div className="ai-texture-strip">
          <span className="texture-carousel-label">Instant Texture Swap</span>
          <div className="texture-grid ai-texture-grid">
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
                disabled={!aiMaskCanvas || isProcessing}
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
          <p className="texture-active-label" aria-live="polite">
            {activeOption.name}
          </p>
        </div>
      </div>

      {isCameraOpen && (
        <div className="camera-modal" role="dialog" aria-modal="true" aria-label="Camera capture">
          <div className="camera-modal-backdrop" aria-hidden="true" />

          <button
            type="button"
            className="camera-cancel-btn"
            onClick={stopCamera}
          >
            Cancel
          </button>

          <div className="camera-modal-body">
            <video
              ref={videoRef}
              className="camera-modal-video"
              autoPlay
              playsInline
              muted
            />
          </div>

          <div className="camera-modal-controls">
            <button
              type="button"
              className="camera-shutter-btn"
              onClick={capturePhoto}
              aria-label="Capture photo"
            >
              <span className="camera-shutter-inner" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AIVisualizer
