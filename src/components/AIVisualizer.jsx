import { useCallback, useEffect, useRef, useState } from 'react'
import { pipeline, env } from '@huggingface/transformers'
import { TEXTURE_OPTIONS } from '../data/textures'

env.allowLocalModels = false

const MARBLE_TEXTURES = TEXTURE_OPTIONS.map((t) => t.image)
const SAMPLE_LUXURY_ROOM =
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1600&auto=format&fit=crop'

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
]

function labelMatches(label, keywords) {
  if (!label) return false
  const lower = label.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword))
}

function isWallOrTileSegment(item) {
  if (!item?.label) return false
  const label = item.label.toLowerCase()
  return label.includes('wall') || label.includes('tile') || label.includes('partition')
}

// Return the library-produced canvas for the mask without manual pixel fiddling.
function maskToCanvas(rawMask) {
  if (!rawMask) return null
  return rawMask.toCanvas()
}

// Draw a scaled, clean alpha mask using canvas compositing rather than pixel loops.
// - Draw the grayscale mask onto a temporary canvas scaled to `width`/`height`.
// - Fill that temp canvas with white, set `destination-in`, then draw the grayscale
//   mask so white is kept only where the mask is non‑zero (black becomes transparent).
// - Use that temp canvas for `include` (draw normally) and `exclude` (destination-out).
function drawMaskLayer(ctx, rawMask, width, height, mode) {
  if (!rawMask || !ctx) return

  const src = rawMask.toCanvas()
  if (!src) return

  const temp = document.createElement('canvas')
  temp.width = width
  temp.height = height
  const tctx = temp.getContext('2d')
  if (!tctx) return

  // Step 1: make a solid white base (this will become the visible mask shape)
  tctx.fillStyle = 'white'
  tctx.fillRect(0, 0, width, height)

  // Step 2: use destination-in to keep only the areas where the grayscale mask has coverage
  tctx.globalCompositeOperation = 'destination-in'
  tctx.drawImage(src, 0, 0, width, height)

  // Reset composite mode on temp context
  tctx.globalCompositeOperation = 'source-over'

  // Diagnostic sampling to verify alpha channel after compositing
  try {
    const cx = Math.floor(width / 2)
    const cy = Math.floor(height / 2)
    const s = tctx.getImageData(cx, cy, 1, 1).data[3]
    const ss = src.getContext && src.getContext('2d')
      ? src.getContext('2d').getImageData(Math.floor(src.width/2), Math.floor(src.height/2), 1, 1).data[3]
      : null
    console.log('drawMaskLayer: src size', src.width, src.height, 'temp size', width, height, 'src center alpha', ss, 'temp center alpha', s)
  } catch (e) {
    console.warn('drawMaskLayer diagnostic failed:', e)
  }

  // Apply the cleaned, scaled mask to the destination context
  const prev = ctx.globalCompositeOperation
  if (mode === 'include') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(temp, 0, 0, width, height)
  } else if (mode === 'exclude') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(temp, 0, 0, width, height)
  }
  // restore
  ctx.globalCompositeOperation = prev
}

function createFallbackWallMask(width, height) {
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const ctx = maskCanvas.getContext('2d')
  if (!ctx) return maskCanvas

  ctx.fillStyle = 'rgba(255, 255, 255, 1)'
  const marginX = width * 0.08
  const top = height * 0.06
  const wallWidth = width - marginX * 2
  const wallHeight = height * 0.62
  ctx.fillRect(marginX, top, wallWidth, wallHeight)

  return maskCanvas
}

function buildBinaryWallMask(segmentationOutput, width, height) {
  const wallSegments = segmentationOutput.filter((item) =>
    isWallOrTileSegment(item),
  )
  const exclusionItems = segmentationOutput.filter((item) =>
    labelMatches(item.label, EXCLUSION_KEYWORDS),
  )

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  // we will read back pixels frequently for diagnostics and overlap checks
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return createFallbackWallMask(width, height)

  ctx.clearRect(0, 0, width, height)

  // helper: count non-zero alpha pixels in a canvas context
  function countAlphaPixels(context, w, h) {
    try {
      const data = context.getImageData(0, 0, w, h).data
      let cnt = 0
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 128) cnt++
      }
      return cnt
    } catch (e) {
      console.warn('countAlphaPixels failed', e)
      return 0
    }
  }

  let includedCount = 0

  if (wallSegments.length === 0) {
    console.warn('No exact wall/tile segments detected — using fallback wall mask.')
    if (segmentationOutput.length > 0) {
      console.log('buildBinaryWallMask: using first segmentation item as include:', segmentationOutput[0].label)
      drawMaskLayer(ctx, segmentationOutput[0].mask, width, height, 'include')
      try {
        const c = ctx.getImageData(Math.floor(width/2), Math.floor(height/2), 1, 1).data[3]
        console.log('buildBinaryWallMask: mask alpha after include (center):', c)
      } catch (e) {
        console.warn('buildBinaryWallMask: sample after include failed', e)
      }
    } else {
      return createFallbackWallMask(width, height)
    }
  } else {
    console.log('buildBinaryWallMask: wallSegments labels:', wallSegments.map(w=>w.label))
    for (const item of wallSegments) {
      drawMaskLayer(ctx, item.mask, width, height, 'include')
      try {
        const c = ctx.getImageData(Math.floor(width/2), Math.floor(height/2), 1, 1).data[3]
        console.log('buildBinaryWallMask: mask alpha after include', item.label, c)
      } catch (e) {
        console.warn('buildBinaryWallMask: sample after include failed', e)
      }
    }

  // count included pixels after composing all wall includes
  includedCount = countAlphaPixels(ctx, width, height)
  console.log('buildBinaryWallMask: included pixel count', includedCount)
  }

  if (!includedCount || includedCount === 0) {
    console.warn('buildBinaryWallMask: includedCount is not defined or zero — using geometric fallback mask')
    return createFallbackWallMask(width, height)
  }

  // For each exclusion, estimate how many included pixels it would remove.
  // If an exclusion removes more than `EXCLUSION_REMOVE_THRESHOLD` fraction
  // of the included mask, skip it as likely to be overbroad.
  const EXCLUSION_REMOVE_THRESHOLD = 0.25

  for (const item of exclusionItems) {
    console.log('buildBinaryWallMask: considering exclusion label:', item.label)

    // Build the exclusion mask into a temp canvas (same technique as drawMaskLayer)
    const exclusionSrc = item.mask.toCanvas()
    const exclTemp = document.createElement('canvas')
    exclTemp.width = width
    exclTemp.height = height
    const exclCtx = exclTemp.getContext('2d')
    if (!exclCtx) continue
    exclCtx.fillStyle = 'white'
    exclCtx.fillRect(0, 0, width, height)
    exclCtx.globalCompositeOperation = 'destination-in'
    exclCtx.drawImage(exclusionSrc, 0, 0, width, height)
    exclCtx.globalCompositeOperation = 'source-over'

    // Create a test canvas copying current mask, then simulate destination-out
    const testCanvas = document.createElement('canvas')
    testCanvas.width = width
    testCanvas.height = height
    const testCtx = testCanvas.getContext('2d')
    if (!testCtx) continue
    testCtx.drawImage(maskCanvas, 0, 0)
    testCtx.globalCompositeOperation = 'destination-out'
    testCtx.drawImage(exclTemp, 0, 0)

    const remaining = countAlphaPixels(testCtx, width, height)
    const removed = Math.max(0, includedCount - remaining)
    const removedFraction = includedCount > 0 ? removed / includedCount : 0
    console.log('buildBinaryWallMask: exclusion', item.label, 'removedFraction', removedFraction)

    if (removedFraction > EXCLUSION_REMOVE_THRESHOLD) {
      console.log('buildBinaryWallMask: skipping exclusion (overbroad):', item.label)
      continue
    }

    // Apply the exclusion to the real mask
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(exclTemp, 0, 0)
    ctx.globalCompositeOperation = 'source-over'

    try {
      const c = ctx.getImageData(Math.floor(width/2), Math.floor(height/2), 1, 1).data[3]
      console.log('buildBinaryWallMask: mask alpha after exclude', item.label, c)
    } catch (e) {
      console.warn('buildBinaryWallMask: sample after exclude failed', e)
    }
  }

  ctx.globalCompositeOperation = 'source-over'

  // Expose final mask for debugging in the page context
  try {
    // attach to window so you can inspect or draw it in the console
    if (typeof window !== 'undefined') window.__DEBUG_MASK_CANVAS__ = maskCanvas
  } catch (e) {
    /* ignore */
  }

  try {
    const c = ctx.getImageData(Math.floor(width/2), Math.floor(height/2), 1, 1).data[3]
    console.log('buildBinaryWallMask: final mask alpha (center):', c)
  } catch (e) {
    console.warn('buildBinaryWallMask: final sample failed', e)
  }

  return maskCanvas 
}

function revokeBlobUrl(url) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = src
  })
}

function AIVisualizer({ onAddToCart }) {
  const [uploadedImage, setUploadedImage] = useState(null)
  const [selectedTexture, setSelectedTexture] = useState(MARBLE_TEXTURES[0])
  const [maskDataUrl, setMaskDataUrl] = useState(null) 
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
    setMaskDataUrl(null)
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

  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current

    if (!canvas || !uploadedImage || !maskDataUrl || !selectedTexture) {
      return
    }

    try {
      const [baseImg, textureImg, maskImg] = await Promise.all([
        loadImage(uploadedImage),
        loadImage(selectedTexture),
        loadImage(maskDataUrl)
      ])

      const width = baseImg.naturalWidth
      const height = baseImg.naturalHeight

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Diagnostic: inspect mask image to ensure it has expected alpha/coverage
      try {
        const sampleCanvas = document.createElement('canvas')
        sampleCanvas.width = maskImg.naturalWidth || width
        sampleCanvas.height = maskImg.naturalHeight || height
        const sctx = sampleCanvas.getContext('2d')
        if (sctx) {
          sctx.clearRect(0, 0, sampleCanvas.width, sampleCanvas.height)
          sctx.drawImage(maskImg, 0, 0, sampleCanvas.width, sampleCanvas.height)
          const imgd = sctx.getImageData(
            Math.floor(sampleCanvas.width / 2),
            Math.floor(sampleCanvas.height / 2),
            1,
            1,
          )
          const alpha = imgd.data[3]
          console.log('Mask sample alpha (center pixel):', alpha)
        }
      } catch (diagErr) {
        console.warn('Mask diagnostic failed:', diagErr)
      }

      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, width, height)

      // Step 1 — draw binary wall mask
      ctx.drawImage(maskImg, 0, 0, width, height)

      // Step 2 — marble clipped strictly to wall shape
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(textureImg, 0, 0, width, height)

      // Step 3 — relight with original photo shadows and environment
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(baseImg, 0, 0, width, height)

      // Step 4 — reset composite mode
      ctx.globalCompositeOperation = 'source-over'
    } catch (paintError) {
      console.error('Canvas compositing failed:', paintError)
    }
  }, [uploadedImage, selectedTexture, maskDataUrl])

  useEffect(() => {
    if (!uploadedImage) {
      setMaskDataUrl(null)
      return undefined
    }

    let cancelled = false

    async function runSegmentation() {
      setIsProcessing(true)
      setError(null)
      setMaskDataUrl(null)

      try {
        const photo = await loadImage(uploadedImage)
        if (cancelled) return

        const width = photo.naturalWidth
        const height = photo.naturalHeight

        if (!segmenterRef.current) {
          segmenterRef.current = await pipeline(
            'image-segmentation',
            'Xenova/segformer-b0-finetuned-ade-512-512',
          )
        }

        if (cancelled) return

        const output = await segmenterRef.current(uploadedImage)
        console.log('AI Output Labels Detected:', output.map(o => o.label))

        if (cancelled) return

        const maskCanvas = buildBinaryWallMask(output, width, height)
        setMaskDataUrl(maskCanvas.toDataURL('image/png'))
      } catch (segmentError) {
        console.error(segmentError)
        if (!cancelled) {
          setMaskDataUrl(null)
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

  useEffect(() => {
    if (maskDataUrl) {
      renderCanvas()
    }
  }, [renderCanvas, maskDataUrl, selectedTexture])

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
          disabled={!maskDataUrl}
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
            style={{ width: '100%', height: 'auto', display: 'block' }}
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
                disabled={!maskDataUrl || isProcessing}
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