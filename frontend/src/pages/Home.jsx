/**
 * Home — main layout with sidebar (upload + docs) and chat window.
 */

import { useState, useEffect, useCallback } from 'react'
import ChatWindow from '../components/ChatWindow'
import UploadPanel from '../components/UploadPanel'
import DocumentList from '../components/DocumentList'
import { listDocuments, checkHealth } from '../services/api'

// Nallas logo SVG inline
const NallasLogo = () => (
  <div className="flex items-center gap-2.5">
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="18" height="18" fill="#181817"/>
      <rect x="28" y="2" width="18" height="18" fill="#F5C546"/>
      <rect x="2" y="28" width="18" height="18" fill="#7BCBD9"/>
      <rect x="28" y="28" width="18" height="18" fill="#E55455"/>
    </svg>
    <div>
      <p className="text-base font-medium text-heading-dark dark:text-heading-light leading-tight tracking-tight">
        nallas
      </p>
      <p className="text-[9px] font-normal text-para-dark dark:text-para-light leading-tight tracking-widest uppercase">
        AI Assistant
      </p>
    </div>
  </div>
)

export default function Home() {
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [backendStatus, setBackendStatus] = useState('checking') // checking | online | offline
  const [darkMode, setDarkMode] = useState(() => {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Dark mode effect
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.body.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Check backend health
  useEffect(() => {
    checkHealth()
      .then(() => setBackendStatus('online'))
      .catch(() => setBackendStatus('offline'))
  }, [])

  // Load documents
  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await listDocuments()
      setDocuments(docs)
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => {
    refreshDocuments()

    // Poll for status updates on processing docs
    const interval = setInterval(() => {
      if (documents.some((d) => d.status === 'processing')) {
        refreshDocuments()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [refreshDocuments, documents.length])

  const handleDocumentDeleted = (id) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }

  const hasReadyDocuments = documents.some((d) => d.status === 'ready')

  return (
    <div className={`flex h-screen overflow-hidden bg-surface-light-2 dark:bg-surface-dark font-sans`}>
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside
        className={`
          flex flex-col border-r border-border-light dark:border-border-dark
          bg-white dark:bg-surface-dark-2 transition-all duration-300
          ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}
        `}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
          <NallasLogo />
          <div className="flex items-center gap-1">
            {/* Backend status indicator */}
            <div
              className={`w-2 h-2 rounded-full ${
                backendStatus === 'online' ? 'bg-green-500' :
                backendStatus === 'offline' ? 'bg-nallas-red' :
                'bg-nallas-yellow animate-pulse'
              }`}
              title={`Backend: ${backendStatus}`}
            />
          </div>
        </div>

        {/* Sidebar scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 space-y-6">
          <UploadPanel onUploadComplete={refreshDocuments} />

          {/* Divider */}
          <div className="h-px bg-border-light dark:bg-border-dark" />

          <DocumentList
            documents={documents}
            onDelete={handleDocumentDeleted}
            loading={loadingDocs}
          />
        </div>

        {/* Sidebar footer */}
        <div className="px-4 py-3 border-t border-border-light dark:border-border-dark">
          <p className="text-[10px] text-para-dark dark:text-para-light text-center">
            Nallas Corporation · AI Document Intelligence
          </p>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-border-light dark:border-border-dark bg-white dark:bg-surface-dark-2">
          <div className="flex items-center gap-3">
            {/* Toggle sidebar */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-light-2 dark:hover:bg-surface-dark-3 text-para-dark dark:text-para-light transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-heading-dark dark:text-heading-light">Chat</span>
              {documents.length > 0 && (
                <>
                  <span className="text-para-dark dark:text-para-light">/</span>
                  <span className="text-para-dark dark:text-para-light">
                    {documents.length} document{documents.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Backend status */}
            <div className={`
              flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border font-medium
              ${backendStatus === 'online'
                ? 'border-green-200 dark:border-green-900 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950'
                : backendStatus === 'offline'
                ? 'border-red-200 dark:border-red-900 text-nallas-red bg-red-50 dark:bg-red-950'
                : 'border-yellow-200 dark:border-yellow-900 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950'
              }
            `}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                backendStatus === 'online' ? 'bg-green-500' :
                backendStatus === 'offline' ? 'bg-nallas-red' :
                'bg-yellow-500 animate-pulse'
              }`} />
              {backendStatus === 'online' ? 'Connected' : backendStatus === 'offline' ? 'Offline' : 'Connecting'}
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode((v) => !v)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-light-2 dark:hover:bg-surface-dark-3 text-para-dark dark:text-para-light transition-colors"
            >
              {darkMode ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
                  <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Chat window fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <ChatWindow hasDocuments={hasReadyDocuments} darkMode={darkMode} />
        </div>
      </div>
    </div>
  )
}
