/**
 * UploadPanel — drag-and-drop file uploader with status feedback.
 */

import { useState, useRef, useCallback } from 'react'
import { uploadDocuments } from '../services/api'

const ACCEPTED_TYPES = ['.pdf', '.docx', '.txt']
const ACCEPTED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

const FileIcon = ({ ext }) => {
  const colors = {
    pdf: '#E55455',
    docx: '#7BCBD9',
    txt: '#F5C546',
  }
  const color = colors[ext?.toLowerCase()] || '#676D71'

  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0"
      style={{ background: color }}
    >
      {ext?.toUpperCase() || 'FILE'}
    </div>
  )
}

export default function UploadPanel({ onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState([]) // Local upload status list
  const fileInputRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return ACCEPTED_TYPES.includes(ext)
    })
    if (files.length) processFiles(files)
  }, [])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length) processFiles(files)
    e.target.value = '' // Reset input
  }

  const processFiles = async (files) => {
    // Add pending entries
    const newUploads = files.map((f) => ({
      id: `upload-${Date.now()}-${Math.random()}`,
      name: f.name,
      size: f.size,
      ext: f.name.split('.').pop().toLowerCase(),
      status: 'uploading',
      progress: 0,
    }))

    setUploads((prev) => [...newUploads, ...prev])

    try {
      const result = await uploadDocuments(files, (progress) => {
        setUploads((prev) =>
          prev.map((u) =>
            newUploads.find((nu) => nu.id === u.id)
              ? { ...u, progress }
              : u
          )
        )
      })

      // Update status from response
      setUploads((prev) =>
        prev.map((u) => {
          const match = newUploads.find((nu) => nu.id === u.id)
          if (!match) return u

          const serverResult = result.uploaded?.find(
            (r) => r.filename === u.name
          )
          return {
            ...u,
            status: serverResult?.status === 'error' ? 'error' : 'processing',
            error: serverResult?.error,
            progress: 100,
          }
        })
      )

      // Notify parent to refresh document list
      if (onUploadComplete) onUploadComplete()

      // After a delay, mark processing → done (doc list will show real status)
      setTimeout(() => {
        setUploads((prev) =>
          prev.map((u) =>
            newUploads.find((nu) => nu.id === u.id) && u.status === 'processing'
              ? { ...u, status: 'done' }
              : u
          )
        )
        if (onUploadComplete) onUploadComplete()
      }, 3000)
    } catch (err) {
      setUploads((prev) =>
        prev.map((u) =>
          newUploads.find((nu) => nu.id === u.id)
            ? { ...u, status: 'error', error: err.message }
            : u
        )
      )
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const clearDone = () => {
    setUploads((prev) => prev.filter((u) => u.status !== 'done' && u.status !== 'error'))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Section title */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-heading-dark dark:text-heading-light">
          Upload Documents
        </h3>
        {uploads.some((u) => u.status === 'done' || u.status === 'error') && (
          <button
            onClick={clearDone}
            className="text-[11px] text-para-dark dark:text-para-light hover:text-nallas-red transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative rounded-xl border-2 border-dashed px-4 py-7 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-nallas-red bg-nallas-red/5 scale-[1.01]'
            : 'border-border-light dark:border-border-dark hover:border-nallas-red/40 hover:bg-surface-light-2 dark:hover:bg-surface-dark-3'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Upload icon */}
        <div className="flex justify-center mb-3">
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center transition-colors
            ${isDragging ? 'bg-nallas-red text-white' : 'bg-surface-light-2 dark:bg-surface-dark-3 text-para-dark dark:text-para-light'}
          `}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        <p className="text-sm font-medium text-heading-dark dark:text-heading-light">
          {isDragging ? 'Drop files here' : 'Drag files or click to upload'}
        </p>
        <p className="text-xs text-para-dark dark:text-para-light mt-1">
          PDF, DOCX, TXT supported
        </p>
      </div>

      {/* Upload progress list */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-surface-dark-2 border border-border-light dark:border-border-dark animate-fade-in"
            >
              <FileIcon ext={upload.ext} />

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-heading-dark dark:text-heading-light truncate leading-tight">
                  {upload.name}
                </p>
                <p className="text-[10px] text-para-dark dark:text-para-light leading-tight">
                  {formatSize(upload.size)}
                </p>

                {/* Progress bar for uploading */}
                {upload.status === 'uploading' && (
                  <div className="mt-1.5 h-1 bg-surface-light-2 dark:bg-surface-dark-3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-nallas-red rounded-full transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}

                {upload.error && (
                  <p className="text-[10px] text-nallas-red leading-tight mt-0.5">
                    {upload.error}
                  </p>
                )}
              </div>

              {/* Status indicator */}
              <div className="flex-shrink-0">
                {upload.status === 'uploading' && (
                  <div className="w-4 h-4 border-2 border-nallas-red border-t-transparent rounded-full animate-spin" />
                )}
                {upload.status === 'processing' && (
                  <div className="w-4 h-4 border-2 border-nallas-yellow border-t-transparent rounded-full animate-spin" />
                )}
                {upload.status === 'done' && (
                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                      <polyline points="20 6 9 17 4 12" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  </div>
                )}
                {upload.status === 'error' && (
                  <div className="w-4 h-4 rounded-full bg-nallas-red flex items-center justify-center">
                    <span className="text-white text-[8px] font-bold">!</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
