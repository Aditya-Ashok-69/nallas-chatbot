/**
 * ChatWindow — main chat interface with message list,
 * input bar, and streaming support.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble'
import { sendMessage, streamMessage } from '../services/api'

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content: `Hello! I'm **Nallas AI**, your company document assistant.

Upload your documents using the panel on the left, then ask me anything about them. I'll answer based solely on the content of your uploaded files.

**Try asking:**
- "What is the leave policy?"
- "Summarize the security guidelines"
- "What are the employee benefits?"`,
  sources: [],
  timestamp: new Date().toISOString(),
}

export default function ChatWindow({ hasDocuments, darkMode }) {
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [useStreaming, setUseStreaming] = useState(true)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(false)

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Build conversation history for context
  const getHistory = () =>
    messages
      .filter((m) => m.id !== 'welcome' && !m.isTyping)
      .slice(-10) // Last 10 messages
      .map((m) => ({ role: m.role, content: m.content }))

  const handleSend = async () => {
    const question = input.trim()
    if (!question || isLoading) return

    // Add user message
    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    abortRef.current = false

    if (useStreaming) {
      // Streaming mode
      const botMsgId = `bot-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: botMsgId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          sources: [],
          timestamp: new Date().toISOString(),
        },
      ])

      let fullContent = ''

      await streamMessage(
        question,
        getHistory(),
        // onToken
        (token) => {
          if (abortRef.current) return
          fullContent += token
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? { ...m, content: fullContent }
                : m
            )
          )
        },
        // onSources
        (sources) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? { ...m, sources, isStreaming: false }
                : m
            )
          )
          setIsLoading(false)
          inputRef.current?.focus()
        },
        // onError
        (err) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? {
                    ...m,
                    content: `Sorry, I encountered an error: ${err}`,
                    isStreaming: false,
                  }
                : m
            )
          )
          setIsLoading(false)
        }
      )

      // Fallback: mark streaming done if sources callback wasn't called
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId && m.isStreaming
            ? { ...m, isStreaming: false }
            : m
        )
      )
      setIsLoading(false)
    } else {
      // Non-streaming mode with typing indicator
      const typingId = `typing-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { id: typingId, role: 'assistant', content: '', isTyping: true },
      ])

      try {
        const response = await sendMessage(question, getHistory())

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== typingId),
          {
            id: `bot-${Date.now()}`,
            role: 'assistant',
            content: response.answer,
            sources: response.sources || [],
            timestamp: new Date().toISOString(),
          },
        ])
      } catch (err) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== typingId),
          {
            id: `bot-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error: ${err.message}`,
            sources: [],
            timestamp: new Date().toISOString(),
          },
        ])
      } finally {
        setIsLoading(false)
        inputRef.current?.focus()
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE])
    abortRef.current = true
    setIsLoading(false)
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-light dark:border-border-dark bg-white dark:bg-surface-dark-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-sm bg-nallas-dark dark:bg-white" />
            <div className="w-2 h-2 rounded-sm bg-nallas-yellow" />
            <div className="w-2 h-2 rounded-sm bg-nallas-cyan" />
            <div className="w-2 h-2 rounded-sm bg-nallas-red" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-heading-dark dark:text-heading-light leading-tight">
              Document Intelligence
            </h2>
            {hasDocuments ? (
              <p className="text-[11px] text-nallas-cyan leading-tight">Documents loaded · Ready to answer</p>
            ) : (
              <p className="text-[11px] text-para-dark dark:text-para-light leading-tight">Upload documents to get started</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stream toggle */}
          <button
            onClick={() => setUseStreaming((v) => !v)}
            className={`
              text-[11px] px-2.5 py-1 rounded-md border transition-colors font-medium
              ${useStreaming
                ? 'border-nallas-cyan text-nallas-cyan bg-nallas-cyan/5'
                : 'border-border-light dark:border-border-dark text-para-dark dark:text-para-light'
              }
            `}
            title="Toggle streaming responses"
          >
            {useStreaming ? 'Streaming ON' : 'Streaming OFF'}
          </button>

          {/* Clear chat */}
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-border-light dark:border-border-dark text-para-dark dark:text-para-light hover:border-nallas-red hover:text-nallas-red transition-colors font-medium"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Clear
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 custom-scrollbar bg-surface-light-2 dark:bg-surface-dark">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* No documents warning */}
      {!hasDocuments && (
        <div className="mx-5 mb-3 px-4 py-2.5 rounded-xl bg-nallas-yellow/10 border border-nallas-yellow/30 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-nallas-yellow flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="text-xs text-heading-dark dark:text-heading-light font-medium">
            No documents uploaded yet. Add documents to start asking questions.
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="px-5 pb-5 pt-3 bg-white dark:bg-surface-dark-2 border-t border-border-light dark:border-border-dark">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasDocuments ? "Ask a question about your documents…" : "Upload documents first…"}
              disabled={isLoading}
              rows={1}
              className={`
                w-full resize-none rounded-xl px-4 py-3 text-sm
                bg-surface-light-2 dark:bg-surface-dark-3
                border border-border-light dark:border-border-dark
                text-heading-dark dark:text-heading-light
                placeholder-para-dark dark:placeholder-para-light
                focus:outline-none focus:border-nallas-red dark:focus:border-nallas-red
                transition-colors leading-relaxed font-normal
                disabled:opacity-50 disabled:cursor-not-allowed
                max-h-32 overflow-y-auto custom-scrollbar
              `}
              style={{ minHeight: '46px' }}
              onInput={(e) => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
              }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`
              w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0
              transition-all duration-200
              ${input.trim() && !isLoading
                ? 'bg-nallas-red hover:bg-red-500 text-white shadow-sm hover:shadow-md'
                : 'bg-surface-light-2 dark:bg-surface-dark-3 text-para-dark dark:text-para-light cursor-not-allowed'
              }
            `}
          >
            {isLoading ? (
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="currentColor"/>
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-para-dark dark:text-para-light mt-2 text-center opacity-60">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
