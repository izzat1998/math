import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import api from '../api/client'
import LoadingSpinner from './LoadingSpinner'
import { useMobileDetect } from '../hooks/useMobileDetect'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  url: string
}

export default function PdfViewer({ url }: PdfViewerProps) {
  const { isMobile } = useMobileDetect()
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfBlob, setPdfBlob] = useState<string | null>(null)
  const [zoom, setZoom] = useState(700)
  const [containerWidth, setContainerWidth] = useState(0)
  const blobRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Pinch-to-zoom state
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const pinchRef = useRef({ startDist: 0, startScale: 1 })
  const panRef = useRef({ startX: 0, startY: 0, startTx: 0, startTy: 0, isPanning: false })

  useEffect(() => {
    api.get(url, { responseType: 'blob' }).then(({ data }) => {
      const blobUrl = URL.createObjectURL(data)
      blobRef.current = blobUrl
      setPdfBlob(blobUrl)
    })
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
      }
    }
  }, [url])

  // Track container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Reset zoom/pan when page changes
  useEffect(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [pageNumber])

  // ── Pinch-to-zoom handlers (mobile) ──
  function getTouchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      // Pinch start
      pinchRef.current = {
        startDist: getTouchDist(e.touches),
        startScale: scale,
      }
    } else if (e.touches.length === 1 && scale > 1) {
      // Pan start (only when zoomed in)
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTx: translate.x,
        startTy: translate.y,
        isPanning: true,
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      // Pinch move
      const dist = getTouchDist(e.touches)
      const newScale = Math.min(
        3,
        Math.max(1, pinchRef.current.startScale * (dist / pinchRef.current.startDist))
      )
      setScale(newScale)

      // If zoomed back to 1, reset translate
      if (newScale <= 1) {
        setTranslate({ x: 0, y: 0 })
      }
    } else if (e.touches.length === 1 && panRef.current.isPanning && scale > 1) {
      // Pan move
      const dx = e.touches[0].clientX - panRef.current.startX
      const dy = e.touches[0].clientY - panRef.current.startY
      // Clamp panning so PDF doesn't fly off screen
      const maxPan = (scale - 1) * containerWidth * 0.5
      setTranslate({
        x: Math.max(-maxPan, Math.min(maxPan, panRef.current.startTx + dx)),
        y: Math.max(-maxPan, Math.min(maxPan, panRef.current.startTy + dy)),
      })
    }
  }

  function handleTouchEnd() {
    panRef.current.isPanning = false
    // Snap back to 1 if barely zoomed
    if (scale < 1.1) {
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    }
  }

  // Double-tap to toggle zoom
  const lastTapRef = useRef(0)
  function handleDoubleTap() {
    if (!isMobile) return
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      if (scale > 1) {
        setScale(1)
        setTranslate({ x: 0, y: 0 })
      } else {
        setScale(2)
      }
    }
    lastTapRef.current = now
  }

  if (!pdfBlob) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <LoadingSpinner label="PDF yuklanmoqda..." />
      </div>
    )
  }

  // On mobile: render at container width, use CSS transform for zoom
  // On desktop: use the zoom state directly
  const pageWidth = isMobile ? containerWidth || 350 : zoom

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors active:scale-95"
            aria-label="Oldingi sahifa"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-sm text-slate-600 font-medium min-w-[60px] text-center tabular-nums">
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors active:scale-95"
            aria-label="Keyingi sahifa"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* Zoom controls — desktop only */}
        {!isMobile && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(400, z - 100))}
              disabled={zoom <= 400}
              className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            </button>
            <span className="text-xs text-slate-500 font-medium min-w-[40px] text-center">
              {Math.round((zoom / 700) * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(1200, z + 100))}
              disabled={zoom >= 1200}
              className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        )}

        {/* Mobile: zoom indicator when zoomed */}
        {isMobile && scale > 1 && (
          <button
            onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }) }}
            className="text-xs font-medium text-accent-600 bg-accent-50 px-2.5 py-1 rounded-full active:scale-95"
          >
            {Math.round(scale * 100)}% ✕
          </button>
        )}
      </div>

      {/* PDF content */}
      <div
        ref={containerRef}
        className={`flex-1 bg-slate-100 overflow-hidden relative ${
          !isMobile ? 'overflow-auto flex justify-center p-4' : ''
        }`}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        onClick={handleDoubleTap}
        style={isMobile ? { touchAction: scale > 1 ? 'none' : 'pan-y' } : undefined}
      >
        <div
          style={isMobile ? {
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            transformOrigin: 'top center',
            willChange: scale > 1 ? 'transform' : 'auto',
          } : undefined}
        >
          <Document
            file={pdfBlob}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={<LoadingSpinner label="Yuklanmoqda..." />}
          >
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              className={isMobile ? '' : 'shadow-sm rounded-sm'}
            />
          </Document>
        </div>

        {/* Zoom hint — only shown initially */}
        {isMobile && scale === 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-slate-400 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full pointer-events-none">
            Kattalashtirish: ikki barmoq bilan
          </div>
        )}
      </div>
    </div>
  )
}
