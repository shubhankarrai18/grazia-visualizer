import { useCallback, useEffect, useRef, useState } from 'react'
import { pipeline, env } from '@huggingface/transformers'
import { TEXTURE_OPTIONS } from '../data/textures'

env.allowLocalModels = false

const MARBLE_TEXTURES = TEXTURE_OPTIONS.map((t) => t.image)
const SAMPLE_LUXURY_ROOM =
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1600&auto=format&fit=crop'
const MAX_RENDER_DIMENSION = 1280
const ALPHA_THRESHOLD = 160

const INCLUSION_KEYWORDS = ['wall', 'tile']
const EXCLUSION_KEYWORDS = [
  'toilet',
  'cabinet',
  'sink',
  'mirror',
  'countertop',
  'bathtub',
  'shower',
  'door',
  'window',
  'towel',
  'faucet',
  'floor',
  'ceiling',
]

function labelMatches(label, keywords) {
  const lower = label.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword))
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

function applyAlphaThreshold(canvas, threshold = ALPHA_THRESHOLD) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)

  for (let i = 0; i < imageData.data.length; i += 4) {
    const luminance = Math.max(
      imageData.data[i],
      imageData.data[i + 1],
      imageData.data[i + 2],
    )
    const alpha = imageData.data[i + 3]

    if (luminance > threshold || alpha > threshold) {
      imageData.data[i] = 255
      imageData.data[i + 1] = 255
      imageData.data[i + 2] = 255
      imageData.data[i + 3] = 255
    } else {
      imageData.data[i] = 0
      imageData.data[i + 1] = 0
      imageData.data[i + 2] = 0
      imageData.data[i + 3] = 0
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function drawMaskLayer(ctx, rawMask, width, height, mode) {
  if (!rawMask) return

  const maskCanvas = maskToCanvas(rawMask)
  const layer = document.createElement('canvas')
  layer.width = width
  layer.height = height
  const layerCtx = layer.getContext('2d')
  if (!layerCtx) return

  if (mode === 'include') {
    layerCtx.fillStyle = 'rgba(255, 255, 255, 1)'
    layerCtx.fillRect(0, 0, width, height)
    layerCtx.globalCompositeOperation = 'destination-in'
    layerCtx.drawImage(maskCanvas, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(layer, 0, 0)
    return
  }

  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(maskCanvas, 0, 0, width, height)
}

function buildBinaryWallMask(segmentationOutput, width, height) {
  const inclusionItems = segmentationOutput.filter((item) =>
    labelMatches(item.label, INCLUSION_KEYWORDS),
  )
  const exclusionItems = segmentationOutput.filter((item) =>
    labelMatches(item.label, EXCLUSION_KEYWORDS),
  )

  if (inclusionItems.length === 0) {
    return null
  }

  const wallCanvas = document.createElement('canvas')
  wallCanvas.width = width
  wallCanvas.height = height
  const ctx = wallCanvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, width, height)

  for (const item of inclusionItems) {
    drawMaskLayer(ctx, item.mask, width, height, 'include')
  }

  for (const item of exclusionItems) {
    drawMaskLayer(ctx, item.mask, width, height, 'exclude')
  }

  ctx.globalCompositeOperation = 'source-over'
  return applyAlphaThreshold(wallCanvas)
}

function revokeBlobUrl(url) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function AIVisualizer({ onAddToCart }) {
  const [uploadedImage, setUploadedImage] = useState(null)
  const [processedMask, setProcessedMask] = useState(null)
  const [selectedTexture, setSelectedTexture] = useState(MARBLE_TEXTURES[0])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const segmenterRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const uploadedImageRef = useRef(null)

  const activeOption =
    TEXTURE_OPTIONS.find((item) => item.image === selectedTexture) ??
    TEXTURE_OPTIONS[0]

  const processImageSource = useCallback((imageSrc) => {
    revokeBlobUrl(uploadedImageRef.current)
    uploadedImageRef.current = imageSrc.startsWith('blob:') ? imageSrc : null
    setUploadedImage(imageSrc)
  }, [])

  const handleFileSelect = useCallback(
    (event) => {
      const file = event.target.files?.[0]

      if (file) {
        processImageSource(URL.createObjectURL(file))
      }

      event.target.value = null
    },
    [processImageSource],
  )

  const openFilePicker = useCallback(() => {
    if (isProcessing || isCameraOpen) return
    fileInputRef.current?.click()
  }, [isCameraOpen, isProcessing])

  const handleDragOver = useCallback(
    (event) => {
      if (isProcessing || isCameraOpen) return
      event.preventDefault()
      setIsDragOver(true)
    },
    [isCameraOpen, isProcessing],
  )

  const handleDragLeave = useCallback((event) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (event) => {
      if (isProcessing || isCameraOpen) return
      event.preventDefault()
      setIsDragOver(false)

      const file = event.dataTransfer.files?.[0]
      if (file?.type.startsWith('image/')) {
        processImageSource(URL.createObjectURL(file))
      }
    },
    [isCameraOpen, isProcessing, processImageSource],
  )

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
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

  const handleUseSampleRoom = useCallback(() => {
    if (isProcessing || isCameraOpen) return
    processImageSource(SAMPLE_LUXURY_ROOM)
  }, [isCameraOpen, isProcessing, processImageSource])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    if (!video?.videoWidth || !video.videoHeight) return

    const captureCanvas = document.createElement('canvas')
    captureCanvas.width = video.videoWidth
    captureCanvas.height = video.videoHeight

    const ctx = captureCanvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height)
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.92)

    stopCamera()
    processImageSource(dataUrl)
  }, [processImageSource, stopCamera])

  // Hook 1 — AI processing (runs only when uploadedImage changes)
  useEffect(() => {
    if (!uploadedImage) {
      setProcessedMask(null)
      return undefined
    }

    let cancelled = false

    async function runSegmentation() {
      setIsProcessing(true)
      setError(null)
      setProcessedMask(null)

      try {
        const photo = await loadImage(uploadedImage)
        if (cancelled) return

        if (!segmenterRef.current) {
          segmenterRef.current = await pipeline(
            'image-segmentation',
            'Xenova/segformer-b0-finetuned-ade-512-512',
          )
        }

        if (cancelled) return

        const output = await segmenterRef.current(uploadedImage)
        if (cancelled) return

        const { width, height } = getRenderDimensions(photo.width, photo.height)
        const maskCanvas = buildBinaryWallMask(output, width, height)

        if (!maskCanvas) {
          throw new Error(
            'Could not detect wall or tile surfaces. Try a clearer bathroom photo.',
          )
        }

        setProcessedMask(maskCanvas)
      } catch (segmentError) {
        console.error(segmentError)
        if (!cancelled) {
          setProcessedMask(null)
          setError(
            segmentError instanceof Error
              ? segmentError.message
              : 'AI segmentation failed. Please try another photo.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsProcessing(false)
        }
      }
    }

    runSegmentation()

    return () => {
      cancelled = true
    }
  }, [uploadedImage])

  // Hook 2 — canvas compositing (runs when mask, texture, or photo changes)
  useEffect(() => {
    if (!processedMask || !uploadedImage) return undefined

    let cancelled = false

    async function compositeCanvas() {
      const canvas = canvasRef.current
      if (!canvas) return

      try {
        const [textureImg, photoImg] = await Promise.all([
          loadImage(selectedTexture),
          loadImage(uploadedImage),
        ])

        if (cancelled) return

        const { width, height } = getRenderDimensions(
          photoImg.width,
          photoImg.height,
        )

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Step A — clear and draw binary wall mask
        ctx.globalCompositeOperation = 'source-over'
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(processedMask, 0, 0, width, height)

        // Step B — marble clipped to wall pixels
        ctx.globalCompositeOperation = 'source-in'
        ctx.drawImage(textureImg, 0, 0, width, height)

        // Step C — relight with original bathroom photo
        ctx.globalCompositeOperation = 'multiply'
        ctx.drawImage(photoImg, 0, 0, width, height)

        ctx.globalCompositeOperation = 'source-over'
      } catch (paintError) {
        console.error(paintError)
      }
    }

    compositeCanvas()

    return () => {
      cancelled = true
    }
  }, [processedMask, selectedTexture, uploadedImage])

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream
    }
  }, [cameraStream, isCameraOpen])

  useEffect(() => {
    return () => {
      revokeBlobUrl(uploadedImageRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isCameraOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') stopCamera()
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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <aside className="ai-visualizer-panel">
        <div className="ai-visualizer-header">
          <span className="step-label">Step 2 of 2</span>
          <h2 className="ai-visualizer-title">AI Spatial Stone Visualizer</h2>
          <p className="ai-visualizer-subtitle">
            Upload, drag-and-drop, or capture your bathroom photo. On-device AI
            isolates wall surfaces and composites Grazia marble in real time.
          </p>
        </div>

        <div className="ai-upload-block">
          <div className="ai-upload-actions">
            <button
              type="button"
              className="btn btn-ghost ai-upload-btn"
              onClick={openFilePicker}
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
          <button
            type="button"
            className="btn btn-ghost upload-sample-btn"
            disabled={isProcessing || isCameraOpen}
            onClick={handleUseSampleRoom}
          >
            Or use our pre-mapped sample luxury room
          </button>
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
          disabled={!processedMask}
        >
          Add Selected Material to Cart
        </button>
      </aside>

      <div className="ai-visualizer-stage">
        <div
          className={[
            'ai-canvas-frame',
            'ai-canvas-frame--interactive',
            isDragOver && 'ai-canvas-frame--dragover',
            isProcessing && 'ai-canvas-frame--processing',
          ]
            .filter(Boolean)
            .join(' ')}
          role="button"
          tabIndex={isProcessing || isCameraOpen ? -1 : 0}
          aria-label="Upload bathroom photo by clicking or dragging an image"
          onClick={openFilePicker}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openFilePicker()
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
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
              <p>Click or drag a bathroom photo to begin AI wall segmentation</p>
            </div>
          )}

          {isProcessing && (
            <div className="ai-processing-overlay">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="ai-processing-text">
                AI Neural Engine Segmenting Surfaces...
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
                disabled={!processedMask || isProcessing}
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
        <div
          className="camera-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Camera capture"
        >
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
