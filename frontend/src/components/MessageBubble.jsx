/**
 * MessageBubble — renders a single chat message (user or bot).
 * Supports markdown rendering, source citations, and streaming.
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Nallas logo mark (inline SVG dots)
const NallasIcon = () => (
  <div className="w-8 h-8 rounded-lg bg-nallas-dark dark:bg-surface-dark-3 flex items-center justify-center flex-shrink-0 overflow-hidden">
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="18" height="18" fill="#181817"/>
      <rect x="28" y="2" width="18" height="18" fill="#F5C546"/>
      <rect x="2" y="28" width="18" height="18" fill="#7BCBD9"/>
      <rect x="28" y="28" width="18" height="18" fill="#E55455"/>
    </svg>
  </div>
)

const UserIcon = () => (
  <div className="w-8 h-8 rounded-lg bg-nallas-red flex items-center justify-center flex-shrink-0">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="7" r="4" stroke="#fff" strokeWidth="2"/>
    </svg>
  </div>
)

const TypingIndicator = () => (
  <div className="flex items-center gap-1 py-1">
    <span className="typing-dot text-nallas-red" />
    <span className="typing-dot text-nallas-cyan" />
    <span className="typing-dot text-nallas-yellow" />
  </div>
)

const SourceBadge = ({ source, index }) => (
  <div className="flex items-center gap-2 py-1.5 px-3 bg-surface-light-2 dark:bg-surface-dark-3 rounded-lg border border-border-light dark:border-border-dark group">
    <div className="w-5 h-5 rounded flex items-center justify-center bg-nallas-red/10 flex-shrink-0">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#E55455" strokeWidth="2" strokeLinecap="round"/>
        <polyline points="14,2 14,8 20,8" stroke="#E55455" strokeWidth="2" strokeLinecap="round"/>
        <line x1="16" y1="13" x2="8" y2="13" stroke="#E55455" strokeWidth="2" strokeLinecap="round"/>
        <line x1="16" y1="17" x2="8" y2="17" stroke="#E55455" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-heading-dark dark:text-heading-light truncate leading-tight">
        {source.filename}
      </p>
      {source.page_number > 0 && (
        <p className="text-[10px] text-para-dark dark:text-para-light leading-tight">
          Page {source.page_number}
        </p>
      )}
    </div>
  </div>
)

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const isTyping = message.isTyping
  const isStreaming = message.isStreaming

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {isUser ? <UserIcon /> : <NallasIcon />}

      {/* Bubble */}
      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Role label */}
        <span className="text-[11px] font-medium text-para-dark dark:text-para-light px-1">
          {isUser ? 'You' : 'Nallas AI'}
        </span>

        {/* Message content */}
        <div
          className={`
            rounded-2xl px-4 py-3 text-sm leading-relaxed
            ${isUser
              ? 'bg-nallas-dark dark:bg-nallas-red text-white rounded-tr-sm'
              : 'bg-white dark:bg-surface-dark-2 text-heading-dark dark:text-heading-light border border-border-light dark:border-border-dark rounded-tl-sm shadow-sm'
            }
          `}
        >
          {isTyping ? (
            <TypingIndicator />
          ) : isUser ? (
            <p className="text-white font-normal m-0 leading-relaxed">{message.content}</p>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => (
                    <p className="text-heading-dark dark:text-heading-light font-normal text-sm leading-relaxed mb-2 last:mb-0">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-heading-dark dark:text-heading-light text-sm">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-medium text-heading-dark dark:text-heading-light">{children}</strong>
                  ),
                  code: ({ children }) => (
                    <code className="bg-surface-light-2 dark:bg-surface-dark-3 px-1.5 py-0.5 rounded text-xs font-mono text-nallas-red">
                      {children}
                    </code>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {/* Streaming cursor */}
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-nallas-red animate-pulse ml-0.5" />
              )}
            </div>
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && !isStreaming && (
          <div className="w-full">
            <p className="text-[11px] font-medium text-para-dark dark:text-para-light mb-1.5 px-1">
              Sources
            </p>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((source, idx) => (
                <SourceBadge key={idx} source={source} index={idx} />
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        {message.timestamp && (
          <span className="text-[10px] text-para-dark dark:text-para-light px-1 opacity-60">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}
