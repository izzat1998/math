import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import api from '../api/client'
import LoadingSpinner from './LoadingSpinner'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  url: string
}

export default function PdfViewer({ url }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfBlob, setPdfBlob] = useState<string | null>(null)
  const [zoom, setZoom] = useState(700)
  const blobRef = useRef<string | null>(null)

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

  if (!pdfBlob) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <LoadingSpinner label="PDF yuklanmoqda..." />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            aria-label="Oldingi sahifa"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-sm text-slate-600 font-medium min-w-[80px] text-center">
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            aria-label="Keyingi sahifa"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(400, z - 100))}
            disabled={zoom <= 400}
            className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 transition-colors"
            aria-label="Kichiklashtirish"
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
            aria-label="Kattalashtirish"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div className="flex-1 overflow-auto flex justify-center p-4 bg-slate-100">
        <Document
          file={pdfBlob}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<LoadingSpinner label="Yuklanmoqda..." />}
        >
          <Page pageNumber={pageNumber} width={zoom} />
        </Document>
      </div>
    </div>
  )
}
