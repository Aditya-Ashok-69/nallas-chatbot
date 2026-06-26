/**
 * DocumentList — shows all uploaded documents with status and delete action.
 */

import { useState } from 'react'
import { deleteDocument } from '../services/api'

const StatusBadge = ({ status }) => {
  const config = {
    ready: { label: 'Ready', bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' },
    processing: { label: 'Processing', bg: 'bg-nallas-yellow/10', text: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-nallas-yellow animate-pulse' },
    error: { label: 'Error', bg: 'bg-nallas-red/10', text: 'text-nallas-red', dot: 'bg-nallas-red' },
  }
  const c = config[status] || config.processing

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

const DocIcon = ({ filename }) => {
  const ext = filename.split('.').pop().toLowerCase()
  const colors = {
    pdf: { bg: 'bg-nallas-red/10', text: 'text-nallas-red' },
    docx: { bg: 'bg-nallas-cyan/10', text: 'text-nallas-cyan' },
    txt: { bg: 'bg-nallas-yellow/10', text: 'text-nallas-yellow' },
  }
  const c = colors[ext] || { bg: 'bg-surface-light-2 dark:bg-surface-dark-3', text: 'text-para-dark' }

  return (
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.bg}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={c.text}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

export default function DocumentList({ documents, onDelete, loading }) {
  const [deletingId, setDeletingId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  const handleDeleteClick = (id) => {
    setConfirmId(id)
  }

  const handleConfirmDelete = async (id) => {
    setDeletingId(id)
    setConfirmId(null)
    try {
      await deleteDocument(id)
      if (onDelete) onDelete(id)
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-heading-dark dark:text-heading-light">
          Uploaded Documents
        </h3>
        {documents.length > 0 && (
          <span className="text-[11px] text-para-dark dark:text-para-light">
            {documents.filter((d) => d.status === 'ready').length}/{documents.length} ready
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-surface-light-2 dark:bg-surface-dark-3 animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="py-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-light-2 dark:bg-surface-dark-3 flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-para-dark dark:text-para-light">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="text-sm text-para-dark dark:text-para-light">No documents yet</p>
          <p className="text-xs text-para-dark dark:text-para-light opacity-60 mt-0.5">Upload files above to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-surface-dark-2 border border-border-light dark:border-border-dark hover:border-nallas-red/30 transition-all animate-fade-in"
            >
              <DocIcon filename={doc.filename} />

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-heading-dark dark:text-heading-light truncate leading-tight">
                  {doc.filename}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={doc.status} />
                  {doc.chunks > 0 && (
                    <span className="text-[10px] text-para-dark dark:text-para-light">
                      {doc.chunks} chunks
                    </span>
                  )}
                  {doc.size && (
                    <span className="text-[10px] text-para-dark dark:text-para-light">
                      {formatSize(doc.size)}
                    </span>
                  )}
                </div>
                {doc.error && (
                  <p className="text-[10px] text-nallas-red mt-0.5 truncate">{doc.error}</p>
                )}
              </div>

              {/* Delete button */}
              <div className="flex-shrink-0">
                {deletingId === doc.id ? (
                  <div className="w-6 h-6 border-2 border-nallas-red border-t-transparent rounded-full animate-spin" />
                ) : confirmId === doc.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleConfirmDelete(doc.id)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-nallas-red text-white font-medium"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-surface-light-2 dark:bg-surface-dark-3 text-para-dark dark:text-para-light font-medium"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleDeleteClick(doc.id)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-nallas-red/10 text-para-dark dark:text-para-light hover:text-nallas-red transition-all"
                    title="Delete document"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
