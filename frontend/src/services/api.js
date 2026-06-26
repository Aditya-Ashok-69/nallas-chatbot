/**
 * Nallas RAG Chatbot - API Service
 * Handles all communication with the FastAPI backend.
 */

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000, // 60s for LLM responses
})

// ─── Request/Response Interceptors ──────────────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred'
    return Promise.reject(new Error(message))
  }
)

// ─── Health ──────────────────────────────────────────────────────────────────

export const checkHealth = async () => {
  const { data } = await api.get('/health')
  return data
}

// ─── Documents ───────────────────────────────────────────────────────────────

/**
 * Upload one or more documents to the backend.
 * @param {File[]} files - Array of File objects
 * @param {Function} onProgress - Progress callback (0-100)
 */
export const uploadDocuments = async (files, onProgress) => {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  const { data } = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded * 100) / event.total))
      }
    },
  })
  return data
}

/**
 * List all uploaded documents.
 */
export const listDocuments = async () => {
  const { data } = await api.get('/documents')
  return data.documents || []
}

/**
 * Delete a document by ID.
 * @param {string} docId - Document UUID
 */
export const deleteDocument = async (docId) => {
  const { data } = await api.delete(`/document/${docId}`)
  return data
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

/**
 * Send a chat message and get a full response.
 * @param {string} question - User's question
 * @param {Array} conversationHistory - Previous messages
 */
export const sendMessage = async (question, conversationHistory = []) => {
  const { data } = await api.post('/chat', {
    question,
    conversation_history: conversationHistory,
    stream: false,
  })
  return data // { answer, sources }
}

/**
 * Stream a chat response using Server-Sent Events.
 * @param {string} question
 * @param {Array} conversationHistory
 * @param {Function} onToken - Called with each token string
 * @param {Function} onSources - Called with sources array when complete
 * @param {Function} onError - Called on error
 */
export const streamMessage = async (
  question,
  conversationHistory = [],
  onToken,
  onSources,
  onError
) => {
  try {
    const response = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        conversation_history: conversationHistory,
        stream: true,
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.detail || 'Stream request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') return

          try {
            const event = JSON.parse(raw)
            if (event.type === 'token' && onToken) {
              onToken(event.content)
            } else if (event.type === 'sources' && onSources) {
              onSources(event.sources)
            } else if (event.type === 'answer' && onToken) {
              onToken(event.content)
              if (onSources) onSources(event.sources || [])
            }
          } catch (_) {
            // Skip malformed events
          }
        }
      }
    }
  } catch (err) {
    if (onError) onError(err.message || 'Streaming error')
  }
}

export default api
