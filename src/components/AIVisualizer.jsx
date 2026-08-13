import React, { useCallback, useEffect, useRef, useState } from 'react'
import { pipeline, env } from '@huggingface/transformers'
import sampleBaseRoom from '../assets/bathroom-mask.png'
import sampleMaskRoom from '../assets/bathroom-perfect-mask.png'
import { TEXTURE_OPTIONS } from '../data/textures'

env.allowLocalModels = false

const MARBLE_TEXTURES = TEXTURE_OPTIONS.map((t) => t.image)
const SAMPLE_LUXURY_ROOM = { base: sampleBaseRoom, mask: sampleMaskRoom }
const MODAL_API_URL = "https://shubhankarrai18--grazia-segmentation-api-process-segmentation.modal.run"

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

// Convert library raw mask to a small canvas with alpha channel
function maskToCanvas(rawMask) {
  if (!rawMask) return null
  const src = rawMask.toCanvas()
  if (!src) return null

  // If alpha already present, trust it
  try {
    const sctx = src.getContext && src.getContext('2d')
    if (sctx) {
      const sample = sctx.getImageData(Math.floor(src.width / 2), Math.floor(src.height / 2), 1, 1).data[3]
      if (sample && sample !== 255 && sample !== 0) return src
    }
  } catch (e) {}

  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const octx = out.getContext('2d')
  if (!octx) return src

  octx.drawImage(src, 0, 0)
  try {
    const imageData = octx.getImageData(0, 0, out.width, out.height)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const lum = (r + g + b) / 3
      const alpha = lum > 128 ? 255 : 0
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = alpha
    }
    octx.putImageData(imageData, 0, 0)
    return out
  } catch (e) {
    console.warn('maskToCanvas conversion failed', e)
    return src
  }
}

function drawMaskLayer(ctx, rawMask, width, height, mode) {
  if (!rawMask || !ctx) return
  const src = maskToCanvas(rawMask)
  if (!src) return
  const prev = ctx.globalCompositeOperation
  if (mode === 'include') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(src, 0, 0, width, height)
  } else if (mode === 'exclude') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(src, 0, 0, width, height)
  }
  ctx.globalCompositeOperation = prev
}

function createFallbackWallMask(width, height) {
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const ctx = maskCanvas.getContext('2d')
  if (!ctx) return maskCanvas
  ctx.fillStyle = 'rgba(255,255,255,1)'
  const marginX = width * 0.08
  const top = height * 0.06
  const wallWidth = width - marginX * 2
  const wallHeight = height * 0.62
  ctx.fillRect(marginX, top, wallWidth, wallHeight)
  return maskCanvas
}

function buildBinaryWallMask(segmentationOutput, width, height) {
  const wallSegments = segmentationOutput.filter((item) => isWallOrTileSegment(item))
  const exclusionItems = segmentationOutput.filter((item) => labelMatches(item.label, EXCLUSION_KEYWORDS))

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return createFallbackWallMask(width, height)

  ctx.clearRect(0, 0, width, height)

  if (wallSegments.length === 0) {
    if (segmentationOutput.length > 0) {
      drawMaskLayer(ctx, segmentationOutput[0].mask, width, height, 'include')
    } else {
      return createFallbackWallMask(width, height)
    }
  } else {
    for (const item of wallSegments) drawMaskLayer(ctx, item.mask, width, height, 'include')
  }

  // apply exclusions conservatively
  const countAlphaPixels = (context, w, h) => {
    try {
      const data = context.getImageData(0, 0, w, h).data
      let cnt = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) cnt++
      return cnt
    } catch (e) {
      return 0
    }
  }

  let includedCount = countAlphaPixels(ctx, width, height)
  if (!includedCount) return createFallbackWallMask(width, height)

  const EXCLUSION_REMOVE_THRESHOLD = 0.25
  for (const item of exclusionItems) {
    try {
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
      if (removedFraction > EXCLUSION_REMOVE_THRESHOLD) continue

      ctx.globalCompositeOperation = 'destination-out'
      ctx.drawImage(exclTemp, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    } catch (e) {
      console.warn('exclusion processing failed', e)
    }
  }

  try {
    if (typeof window !== 'undefined') window.__DEBUG_MASK_CANVAS__ = maskCanvas
  } catch (e) {}

  return maskCanvas
}

function revokeBlobUrl(url) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = src
  })
}

// Convert simple black/white masks into proper alpha masks.
function preprocessMask(maskImg) {
  if (!maskImg) return maskImg
  const w = maskImg.width || maskImg.naturalWidth || 0
  const h = maskImg.height || maskImg.naturalHeight || 0
  if (!w || !h) return maskImg
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const tctx = tmp.getContext('2d')
  if (!tctx) return maskImg
  tctx.clearRect(0, 0, w, h)
  tctx.drawImage(maskImg, 0, 0, w, h)
  try {
    const id = tctx.getImageData(0, 0, w, h)
    const d = id.data
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      const lum = (r + g + b) / 3
      d[i + 3] = lum > 128 ? 255 : 0
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
    }
    tctx.putImageData(id, 0, 0)
    return tmp
  } catch (e) {
    console.warn('preprocessMask failed', e)
    return maskImg
  }
}

// Small ErrorBoundary so runtime exceptions are shown instead of a blank screen
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        React.createElement('div', { style: { padding: 24 } },
          React.createElement('h3', null, 'Visualizer Error'),
          React.createElement('pre', { style: { whiteSpace: 'pre-wrap', color: 'crimson' } }, String(this.state.error)),
          React.createElement('button', { onClick: () => window.location.reload(), style: { marginTop: 12 } }, 'Reload')
        )
      )
    }
    return this.props.children
  }
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
  const editCanvasRef = useRef(null)
  const originalMaskCanvasRef = useRef(null)
  const editLayerRef = useRef(typeof document !== 'undefined' ? document.createElement('canvas') : null)
  const fileInputRef = useRef(null)
  const [isEditingMask, setIsEditingMask] = useState(false)
  const [editTool, setEditTool] = useState('brush')
  const [brushSize, setBrushSize] = useState(40)
  const [isErasing, setIsErasing] = useState(false)
  const videoRef = useRef(null)
  const segmenterRef = useRef(null)
  const samRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const uploadedImageRef = useRef(null)

  const activeOption = TEXTURE_OPTIONS.find((item) => item.image === selectedTexture) ?? TEXTURE_OPTIONS[0]

  const processImageSource = useCallback((imageSrc) => {
    revokeBlobUrl(uploadedImageRef.current)
    uploadedImageRef.current = imageSrc.startsWith('blob:') ? imageSrc : null
    setMaskDataUrl(null)
    setUploadedImage(imageSrc)
  }, [])

  const handleFileSelect = useCallback((event) => {
    const file = event.target.files?.[0]
    if (file) processImageSource(URL.createObjectURL(file))
    event.target.value = null
  }, [processImageSource])

  const openFilePicker = useCallback(() => {
    if (isProcessing || isCameraOpen) return
    fileInputRef.current?.click()
  }, [isCameraOpen, isProcessing])

  const handleDragOver = useCallback((event) => {
    if (isProcessing || isCameraOpen) return
    event.preventDefault()
    setIsDragOver(true)
  }, [isCameraOpen, isProcessing])

  const handleDragLeave = useCallback((event) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((event) => {
    if (isProcessing || isCameraOpen) return
    event.preventDefault()
    setIsDragOver(false)
    const file = event.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) processImageSource(URL.createObjectURL(file))
  }, [isCameraOpen, isProcessing, processImageSource])

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraStream(null)
    setIsCameraOpen(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const openCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Camera capture is not supported in this browser. Please upload from your gallery instead.')
      return
    }
    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      cameraStreamRef.current = stream
      setCameraStream(stream)
      setIsCameraOpen(true)
    } catch (cameraError) {
      console.error(cameraError)
      alert('Camera access was denied or unavailable. Please enable camera permissions or upload an image.')
      stopCamera()
    }
  }, [stopCamera])

  const handleUseSampleRoom = useCallback(() => {
    if (isProcessing || isCameraOpen) return
    setUploadedImage(SAMPLE_LUXURY_ROOM.base)
    setMaskDataUrl(SAMPLE_LUXURY_ROOM.mask)
  }, [isCameraOpen, isProcessing])

  // Start mask edit: copy current mask and ensure edit layer
  const startMaskEdit = useCallback(async () => {
    if (!maskDataUrl) return
    try {
      const baseMaskImg = await loadImage(maskDataUrl)
      const width = baseMaskImg.naturalWidth
      const height = baseMaskImg.naturalHeight
      const orig = document.createElement('canvas')
      orig.width = width
      orig.height = height
      const octx = orig.getContext('2d')
      if (octx) {
        octx.clearRect(0, 0, width, height)
        octx.drawImage(baseMaskImg, 0, 0, width, height)
        originalMaskCanvasRef.current = orig
      }

      const editDom = editCanvasRef.current
      if (editDom) {
        editDom.width = width
        editDom.height = height
        const ectx = editDom.getContext('2d')
        if (ectx) ectx.clearRect(0, 0, width, height)
      }

      const off = editLayerRef.current || document.createElement('canvas')
      off.width = width
      off.height = height
      const offCtx = off.getContext('2d')
      if (offCtx) offCtx.clearRect(0, 0, off.width, off.height)
      editLayerRef.current = off

      // try to initialize SAM in background so first click is faster
      if (!samRef.current) {
        try {
          samRef.current = await pipeline('image-segmentation', 'Xenova/slimsam-77-uniform')
        } catch (e) {
          console.warn('SAM pipeline init failed (magic wand will attempt to init on demand):', e)
        }
      }

      setIsEditingMask(true)
    } catch (e) {
      console.warn('startMaskEdit failed', e)
    }
  }, [maskDataUrl])

  const stopMaskEdit = useCallback(() => setIsEditingMask(false), [])

  const applyMaskEdit = useCallback(() => {
    const orig = originalMaskCanvasRef.current
    const off = editLayerRef.current
    if (!orig || !off) return
    const octx = orig.getContext('2d')
    const offCtx = off.getContext('2d')
    if (!octx || !offCtx) return
    octx.globalCompositeOperation = 'source-over'
    octx.drawImage(off, 0, 0)
    try { setMaskDataUrl(orig.toDataURL('image/png')) } catch (e) { console.warn('applyMaskEdit failed', e) }
    try { offCtx.clearRect(0, 0, off.width, off.height) } catch (e) {}
    setIsEditingMask(false)
  }, [setMaskDataUrl])

  const resetMaskEdit = useCallback(() => {
    const orig = originalMaskCanvasRef.current
    if (!orig) return
    try { setMaskDataUrl(orig.toDataURL('image/png')) } catch (e) { console.warn('resetMaskEdit failed', e) }
    const off = editLayerRef.current
    if (off) {
      const offCtx = off.getContext('2d')
      if (offCtx) offCtx.clearRect(0, 0, off.width, off.height)
    }
    const editDom = editCanvasRef.current
    if (editDom) {
      const ed = editDom.getContext && editDom.getContext('2d')
      if (ed) ed.clearRect(0, 0, editDom.width, editDom.height)
    }
    setIsEditingMask(false)
  }, [setMaskDataUrl])

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

  // Drawing handlers (brush only)
  useEffect(() => {
    const edit = editCanvasRef.current
    const off = editLayerRef.current
    if (!edit || !off || !isEditingMask) return

    // if erase mode selected, skip manual strokes (we use SAM)
    if (editTool === 'erase') return

    let drawing = false
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    let last = null
    const getPos = (ev) => {
      const rect = edit.getBoundingClientRect()
      const scaleX = off.width / rect.width
      const scaleY = off.height / rect.height
      const x = (ev.clientX - rect.left) * scaleX
      const y = (ev.clientY - rect.top) * scaleY
      return { x, y }
    }
    const applyStyle = () => {
      offCtx.lineCap = 'round'
      offCtx.lineJoin = 'round'
      offCtx.lineWidth = brushSize
      offCtx.globalAlpha = 1
      offCtx.globalCompositeOperation = 'source-over'
      offCtx.fillStyle = 'rgba(255,255,255,1)'
      offCtx.strokeStyle = 'rgba(255,255,255,1)'
    }
    const pointerDown = (ev) => {
      drawing = true
      applyStyle()
      const p = getPos(ev)
      last = p
      offCtx.beginPath()
      offCtx.arc(p.x, p.y, Math.max(1, brushSize / 2), 0, Math.PI * 2)
      offCtx.fill()
      try { renderCanvas() } catch (e) {}
      try { edit.setPointerCapture && edit.setPointerCapture(ev.pointerId) } catch (e) {}
    }
    const pointerMove = (ev) => {
      if (!drawing) return
      const p = getPos(ev)
      applyStyle()
      if (last) {
        offCtx.beginPath()
        offCtx.moveTo(last.x, last.y)
        offCtx.lineTo(p.x, p.y)
        offCtx.stroke()
      }
      offCtx.beginPath()
      offCtx.arc(p.x, p.y, Math.max(1, brushSize / 2), 0, Math.PI * 2)
      offCtx.fill()
      last = p
      try { renderCanvas() } catch (e) {}
    }
    const pointerUp = (ev) => {
      drawing = false
      last = null
      try { edit.releasePointerCapture && edit.releasePointerCapture(ev.pointerId) } catch (e) {}
    }
    edit.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    return () => {
      edit.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
    }
  }, [isEditingMask, editTool, brushSize])

  // Click handler for SAM magic-wand erase
  const handleSamEraseClick = useCallback(async (ev) => {
    if (!isEditingMask || editTool !== 'erase' || isErasing) return
    ev.stopPropagation()
    const edit = editCanvasRef.current
    const off = editLayerRef.current
    if (!edit || !off) return

    // map to natural image coords
    const rect = edit.getBoundingClientRect()
    const scaleX = off.width / rect.width
    const scaleY = off.height / rect.height
    const x = Math.round((ev.clientX - rect.left) * scaleX)
    const y = Math.round((ev.clientY - rect.top) * scaleY)

    setIsErasing(true)
    try {
      // lazy init SAM
      if (!samRef.current) {
        try { samRef.current = await pipeline('image-segmentation', 'Xenova/slimsam-77-uniform') } catch (e) { console.warn('SAM init failed:', e) }
      }
      if (!samRef.current) { setIsErasing(false); return }

      // prepare photo canvas
      let baseImg = renderCanvas.baseImg
      if (!baseImg && uploadedImage) baseImg = await loadImage(uploadedImage)
      if (!baseImg) { setIsErasing(false); return }
      const photoCanvas = document.createElement('canvas')
      photoCanvas.width = baseImg.naturalWidth
      photoCanvas.height = baseImg.naturalHeight
      const pctx = photoCanvas.getContext('2d')
      if (!pctx) { setIsErasing(false); return }
      pctx.drawImage(baseImg, 0, 0, photoCanvas.width, photoCanvas.height)

      // call SAM
      let samResult = null
      try {
        samResult = await samRef.current(photoCanvas, { point_coords: [[x, y]], multimask: false })
      } catch (e) {
        try { samResult = await samRef.current(photoCanvas, { points: [[x, y]] }) } catch (ee) { console.warn('SAM call failed:', ee) }
      }

      // extract mask canvas
      let samMaskCanvas = null
      try {
        if (Array.isArray(samResult) && samResult.length && samResult[0]?.mask?.toCanvas) samMaskCanvas = samResult[0].mask.toCanvas()
        else if (samResult?.mask?.toCanvas) samMaskCanvas = samResult.mask.toCanvas()
        else if (samResult && samResult.length && samResult[0]?.masks && samResult[0].masks.length && samResult[0].masks[0]?.toCanvas) samMaskCanvas = samResult[0].masks[0].toCanvas()
      } catch (e) { console.warn('Failed to extract SAM mask canvas:', e) }
      if (!samMaskCanvas) { setIsErasing(false); return }

      // scale samMaskCanvas to mask size if necessary
      const offW = off.width
      const offH = off.height
      const tmp = document.createElement('canvas')
      tmp.width = offW
      tmp.height = offH
      const tctx = tmp.getContext('2d')
      if (!tctx) { setIsErasing(false); return }
      tctx.clearRect(0, 0, offW, offH)
      tctx.drawImage(samMaskCanvas, 0, 0, offW, offH)

      // safety simulation: compose orig mask + edits then destination-out tmp to ensure not wiping everything
      const sim = document.createElement('canvas')
      sim.width = offW
      sim.height = offH
      const sctx = sim.getContext('2d')
      if (sctx) {
        const orig = originalMaskCanvasRef.current
        if (orig) sctx.drawImage(orig, 0, 0, offW, offH)
        sctx.drawImage(off, 0, 0, offW, offH)
        sctx.save(); sctx.globalCompositeOperation = 'destination-out'; sctx.drawImage(tmp, 0, 0, offW, offH); sctx.restore()
        try {
          const md = sctx.getImageData(0, 0, offW, offH).data
          let remain = 0
          for (let i = 3; i < md.length; i += 4) if (md[i] > 128) remain++
          let origCount = 0
          if (originalMaskCanvasRef.current) {
            const oc = document.createElement('canvas').getContext('2d')
            oc.canvas.width = originalMaskCanvasRef.current.width
            oc.canvas.height = originalMaskCanvasRef.current.height
            oc.drawImage(originalMaskCanvasRef.current, 0, 0)
            const od = oc.getImageData(0, 0, oc.canvas.width, oc.canvas.height).data
            for (let i = 3; i < od.length; i += 4) if (od[i] > 128) origCount++
          }
          if (origCount > 0 && remain / origCount < 0.05) {
            console.warn('SAM erase aborted: would remove too much of mask', { origCount, remain })
            setIsErasing(false)
            return
          }
        } catch (e) { console.warn('SAM simulation count failed', e) }
      }

      // apply erase onto original mask canvas
      const origCtx = originalMaskCanvasRef.current?.getContext('2d')
      if (origCtx) {
        origCtx.save()
        origCtx.globalCompositeOperation = 'destination-out'
        origCtx.drawImage(tmp, 0, 0, offW, offH)
        origCtx.restore()
        try { setMaskDataUrl(originalMaskCanvasRef.current.toDataURL('image/png')) } catch (e) { console.warn('setMaskDataUrl failed after SAM apply', e) }
      }

      // also draw onto offscreen edit layer to keep visual parity
      const offCtx = off.getContext('2d')
      if (offCtx) {
        offCtx.save()
        offCtx.globalCompositeOperation = 'destination-out'
        offCtx.drawImage(tmp, 0, 0, offW, offH)
        offCtx.restore()
      }

      try { renderCanvas() } catch (e) {}
    } finally { setIsErasing(false) }
  }, [isEditingMask, editTool, isErasing, uploadedImage])

  // when editing starts, size DOM edit canvas
  useEffect(() => {
    if (!isEditingMask) return
    const edit = editCanvasRef.current
    const orig = originalMaskCanvasRef.current
    if (!edit || !orig) return
    edit.width = orig.width
    edit.height = orig.height
    const ctx = edit.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, edit.width, edit.height)
  }, [isEditingMask])

  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !uploadedImage || !maskDataUrl || !selectedTexture) return
    try {
      if (!renderCanvas.baseImg || renderCanvas.baseImg.src !== uploadedImage) renderCanvas.baseImg = await loadImage(uploadedImage)
      if (!renderCanvas.textureImg || renderCanvas.textureImg.src !== selectedTexture) renderCanvas.textureImg = await loadImage(selectedTexture)
      if (!renderCanvas.maskImg || renderCanvas.maskImg.src !== maskDataUrl) renderCanvas.maskImg = await loadImage(maskDataUrl)
      const baseImg = renderCanvas.baseImg
      const textureImg = renderCanvas.textureImg
      const maskImg = renderCanvas.maskImg
      const width = baseImg.naturalWidth
      const height = baseImg.naturalHeight
      canvas.width = width
      canvas.height = height
      const editLayer = editLayerRef.current
      if (editLayer) {
        if (editLayer.width !== width || editLayer.height !== height) {
          try {
            const tmp = document.createElement('canvas')
            tmp.width = width
            tmp.height = height
            const tctx = tmp.getContext('2d')
            const elctx = editLayer.getContext('2d')
            if (tctx && elctx) { tctx.clearRect(0, 0, width, height); tctx.drawImage(editLayer, 0, 0, width, height); editLayer.width = width; editLayer.height = height; const newCtx = editLayer.getContext('2d'); if (newCtx) newCtx.drawImage(tmp, 0, 0) } else { editLayer.width = width; editLayer.height = height }
          } catch (e) { try { editLayer.width = width; editLayer.height = height } catch (er) {} }
        }
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, width, height)
      // disable smoothing so upscaled binary mask stays sharp (no bleed)
      ctx.imageSmoothingEnabled = false
      // process mask at target size onto an offscreen canvas so black/white masks become proper alpha masks
      const maskCanvasProc = document.createElement('canvas')
      maskCanvasProc.width = width
      maskCanvasProc.height = height
      const mctx = maskCanvasProc.getContext('2d')
      if (mctx) {
        mctx.clearRect(0, 0, width, height)
        mctx.drawImage(maskImg, 0, 0, width, height)
        try {
          const id = mctx.getImageData(0, 0, width, height)
          const d = id.data
          for (let i = 0; i < d.length; i += 4) {
            const luminance = (d[i] + d[i + 1] + d[i + 2]) / 3
            d[i] = 255
            d[i + 1] = 255
            d[i + 2] = 255
            d[i + 3] = luminance
          }
          mctx.putImageData(id, 0, 0)
        } catch (e) {
          console.warn('mask processing failed', e)
        }
      }
      ctx.drawImage(maskCanvasProc, 0, 0, width, height)
      if (editLayer && editLayer.width && editLayer.height) ctx.drawImage(editLayer, 0, 0, width, height)
      // restore smoothing for photo/texture rendering
      ctx.imageSmoothingEnabled = true
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(textureImg, 0, 0, width, height)
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(baseImg, 0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
    } catch (paintError) { console.error('Canvas compositing failed:', paintError) }
  }, [uploadedImage, selectedTexture, maskDataUrl])

  // segmentation effect: generate initial mask with segformer and set maskDataUrl
  useEffect(() => {
    if (!uploadedImage) { setMaskDataUrl(null); return undefined }
    // If using the curated sample room, skip automatic segmentation to preserve the perfect mask
    if (uploadedImage === SAMPLE_LUXURY_ROOM.base) {
      setIsProcessing(false)
      return undefined
    }
    let cancelled = false
    async function runSegmentation() {
      setIsProcessing(true); setError(null); setMaskDataUrl(null)
      try {
        const photo = await loadImage(uploadedImage)
        if (cancelled) return
        const width = photo.naturalWidth; const height = photo.naturalHeight

        // Convert uploadedImage to a data URL (base64). If it's already a data URL, reuse it.
        async function toDataURL(src) {
          if (!src) throw new Error('No image source')
          if (src.startsWith('data:')) return src
          const resp = await fetch(src)
          if (!resp.ok) throw new Error('Failed to fetch image for upload')
          const blob = await resp.blob()
          return await new Promise((resolve, reject) => {
            const fr = new FileReader()
            fr.onloadend = () => resolve(fr.result)
            fr.onerror = reject
            fr.readAsDataURL(blob)
          })
        }

        let base64Image = null
        try {
          base64Image = await toDataURL(uploadedImage)
        } catch (e) {
          throw new Error('Failed to read uploaded image: ' + (e?.message || e))
        }
        if (cancelled) return

        // POST to Modal GPU backend
        let resp
        try {
          resp = await fetch(MODAL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image })
          })
        } catch (networkErr) {
          throw new Error('Network error contacting segmentation API: ' + (networkErr?.message || networkErr))
        }

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '')
          throw new Error('Segmentation API error: ' + resp.status + ' ' + txt)
        }

        const json = await resp.json().catch(() => null)
        if (cancelled) return
        if (!json || !json.mask) throw new Error('Segmentation API returned no mask')

        setMaskDataUrl(json.mask)

        // Init SAM in background for subsequent editing (non-blocking)
        if (!samRef.current) pipeline('image-segmentation', 'Xenova/slimsam-77-uniform').then((p) => { samRef.current = p }).catch(() => {})

      } catch (segmentError) {
        console.error(segmentError)
        if (!cancelled) {
          setMaskDataUrl(null)
          setError(segmentError instanceof Error ? segmentError.message : 'Segmentation failed')
        }
      } finally {
        if (!cancelled) setIsProcessing(false)
      }
    }
    runSegmentation()
    return () => { cancelled = true }
  }, [uploadedImage])

  useEffect(() => { if (maskDataUrl) renderCanvas() }, [maskDataUrl, selectedTexture, renderCanvas])

  useEffect(() => { if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream }, [cameraStream, isCameraOpen])

  useEffect(() => { return () => { revokeBlobUrl(uploadedImageRef.current) } }, [])

  useEffect(() => { return () => { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); cameraStreamRef.current = null } }, [])

  useEffect(() => {
    if (!isCameraOpen) return undefined
    const handleKeyDown = (event) => { if (event.key === 'Escape') stopCamera() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleKeyDown) }
  }, [isCameraOpen, stopCamera])

  const handleAddToCart = () => onAddToCart(activeOption)

  return (
    React.createElement(ErrorBoundary, null,
      React.createElement('div', { className: 'ai-visualizer' },
        React.createElement('input', { ref: fileInputRef, type: 'file', accept: 'image/*', onChange: handleFileSelect, style: { display: 'none' } }),

        React.createElement('aside', { className: 'ai-visualizer-panel' },
          React.createElement('div', { className: 'ai-visualizer-header' },
            React.createElement('span', { className: 'step-label' }, 'Step 2 of 2'),
            React.createElement('h2', { className: 'ai-visualizer-title' }, 'AI Spatial Stone Visualizer'),
            React.createElement('p', { className: 'ai-visualizer-subtitle' }, 'Upload, drag-and-drop, or capture your bathroom photo. On-device AI isolates wall surfaces and composites Grazia marble in real time.')
          ),

          React.createElement('div', { className: 'ai-upload-block' },
            React.createElement('div', { className: 'ai-upload-actions' },
              React.createElement('button', { type: 'button', className: 'btn btn-ghost ai-upload-btn', onClick: openFilePicker, disabled: isProcessing || isCameraOpen }, 'Upload from Gallery'),
              React.createElement('button', { type: 'button', className: 'btn btn-primary ai-upload-btn', onClick: openCamera, disabled: isProcessing || isCameraOpen }, 'Take Photo')
            ),
            React.createElement('button', { type: 'button', className: 'btn btn-ghost upload-sample-btn', disabled: isProcessing || isCameraOpen, onClick: handleUseSampleRoom }, 'Or use our pre-mapped sample luxury room')
          ),

          error && React.createElement('p', { className: 'ai-visualizer-error', role: 'alert' }, error),

          React.createElement('dl', { className: 'material-specs' },
            React.createElement('div', { className: 'material-spec' }, React.createElement('dt', null, 'Finish'), React.createElement('dd', null, activeOption.finish)),
            React.createElement('div', { className: 'material-spec' }, React.createElement('dt', null, 'Origin'), React.createElement('dd', null, activeOption.origin)),
            React.createElement('div', { className: 'material-spec' }, React.createElement('dt', null, 'Selected Stone'), React.createElement('dd', null, activeOption.name))
          ),

          React.createElement('div', { className: 'ai-panel-actions', style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            React.createElement('button', { type: 'button', onClick: () => { if (!isEditingMask) startMaskEdit(); else applyMaskEdit() }, disabled: !maskDataUrl || isProcessing, className: isEditingMask ? 'btn btn-secondary btn-active' : 'btn btn-secondary', style: { width: '100%', fontWeight: 700 }, 'aria-pressed': isEditingMask }, isEditingMask ? 'SAVE MASK' : 'EDIT MASK'),

            isEditingMask && React.createElement('div', { className: 'mask-edit-toolbar', style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
              React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, React.createElement('input', { type: 'radio', name: 'editTool', value: 'brush', checked: editTool === 'brush', onChange: () => setEditTool('brush') }), 'Brush'),
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, React.createElement('input', { type: 'radio', name: 'editTool', value: 'erase', checked: editTool === 'erase', onChange: () => setEditTool('erase') }), 'Erase')
              ),

              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 } },
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, 'Size', React.createElement('input', { type: 'range', min: '4', max: '200', value: brushSize, onChange: (e) => setBrushSize(Number(e.target.value)) }))
              ),

              React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
                React.createElement('button', { type: 'button', className: 'btn', onClick: resetMaskEdit, style: { height: 36, minWidth: 88 } }, 'Reset'),
                React.createElement('button', { type: 'button', className: 'btn btn-ghost', onClick: stopMaskEdit, style: { height: 36, minWidth: 88 } }, 'Cancel')
              ),

              isErasing && React.createElement('div', { style: { marginTop: 8, color: 'var(--accent)', fontWeight: 700 } }, 'Erasing...')
            ),

            React.createElement('button', { type: 'button', className: 'btn btn-primary visualizer-add-btn', onClick: handleAddToCart, disabled: !maskDataUrl, style: { width: '100%' } }, 'Add Selected Material to Cart')
          )
        ),

        React.createElement('div', { className: 'ai-visualizer-stage' },
          React.createElement('div', {
            className: ['ai-canvas-frame', !uploadedImage && 'ai-canvas-frame--interactive', isDragOver && 'ai-canvas-frame--dragover', isProcessing && 'ai-canvas-frame--processing'].filter(Boolean).join(' '),
            role: !uploadedImage ? 'button' : undefined,
            tabIndex: !uploadedImage && !isProcessing && !isCameraOpen ? 0 : -1,
            'aria-label': !uploadedImage ? 'Upload bathroom photo by clicking or dragging an image' : 'AI marble visualization preview',
            style: { position: 'relative' },
            onClick: (e) => { if (!uploadedImage) openFilePicker() },
            onKeyDown: (event) => { if (uploadedImage) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFilePicker() } },
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop
          },

            !uploadedImage && !isProcessing && React.createElement('div', { className: 'ai-canvas-placeholder' }, React.createElement('svg', { className: 'upload-zone-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', 'aria-hidden': 'true' }, React.createElement('path', { d: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16' }), React.createElement('path', { d: 'M14 14l1-1a2 2 0 012.828 0L20 15' }), React.createElement('circle', { cx: '9', cy: '9', r: '2' }), React.createElement('path', { d: 'M12 19H6a2 2 0 01-2-2V7a2 2 0 012-2h1' })), React.createElement('p', null, 'Click or drag a bathroom photo to begin AI wall segmentation')),

            isProcessing && React.createElement('div', { className: 'ai-processing-overlay' }, React.createElement('div', { className: 'processing-spinner', 'aria-hidden': 'true' }), React.createElement('p', { className: 'ai-processing-text' }, 'AI Neural Engine Segmenting Surfaces...')),

            React.createElement('canvas', { ref: canvasRef, className: 'ai-render-canvas', style: { width: '100%', height: 'auto', display: 'block' }, 'aria-label': 'AI marble visualization preview' }),

            isEditingMask && React.createElement('canvas', { ref: editCanvasRef, className: 'ai-edit-canvas', style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'auto' }, 'aria-label': 'Mask edit canvas', onPointerDown: (e) => e.stopPropagation(), onClick: (e) => { e.stopPropagation(); if (editTool === 'erase') handleSamEraseClick(e) } })
          ),

          React.createElement('div', { className: 'ai-texture-strip' },
            React.createElement('span', { className: 'texture-carousel-label' }, 'Instant Texture Swap'),
            React.createElement('div', { className: 'texture-grid ai-texture-grid' },
              TEXTURE_OPTIONS.map((item) => React.createElement('button', {
                key: item.image,
                type: 'button',
                className: ['texture-option', selectedTexture === item.image && 'texture-option--selected'].filter(Boolean).join(' '),
                onClick: () => { setSelectedTexture(item.image); setTimeout(() => { try { renderCanvas() } catch (e) {} }, 0) },
                disabled: !maskDataUrl || isProcessing,
                'aria-pressed': selectedTexture === item.image,
                'aria-label': item.name
              }, React.createElement('img', { src: item.image, alt: '', className: 'texture-option-image' }), React.createElement('span', { className: 'texture-option-name' }, item.name)))
            ),
            React.createElement('p', { className: 'texture-active-label', 'aria-live': 'polite' }, activeOption.name)
          )
        )
      )
    )
  )
}

export default AIVisualizer