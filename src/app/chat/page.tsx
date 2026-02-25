'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GatewayClient, type ChatMessage } from '@/lib/gateway-ws'

// ─── Config ─────────────────────────────────────────────
const GATEWAY_WS_URL = typeof window !== 'undefined'
  ? (localStorage.getItem('clawpanel-gateway-url') || 'wss://ip-172-26-4-204.tailf46d50.ts.net:8443')
  : ''
const GATEWAY_TOKEN = typeof window !== 'undefined'
  ? (localStorage.getItem('clawpanel-gateway-token') || '')
  : ''

// ─── Helpers ────────────────────────────────────────────
function extractText(msg: ChatMessage): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(c => c.type === 'text')
      .map(c => c.text ?? '')
      .join('')
  }
  return ''
}

function formatTime(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ─── Main Component ─────────────────────────────────────
export default function WebChatPage() {
  const [messages, setMessages] = useState<Array<{ role: string; text: string; ts?: number }>>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(!GATEWAY_TOKEN)
  const [wsUrl, setWsUrl] = useState(GATEWAY_WS_URL)
  const [token, setToken] = useState(GATEWAY_TOKEN)

  const clientRef = useRef<GatewayClient | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [])

  // Connect to gateway
  useEffect(() => {
    if (!wsUrl || !token || showSettings) return

    const client = new GatewayClient({
      url: wsUrl,
      token,
      onConnect: () => {
        setConnected(true)
        setError(null)
        // Load history
        client.getHistory().then(history => {
          const msgs = history.map(m => ({
            role: m.role,
            text: extractText(m),
            ts: m.timestamp,
          }))
          setMessages(msgs)
          scrollToBottom()
        }).catch(() => {})
      },
      onDisconnect: (reason) => {
        setConnected(false)
        if (reason) setError(`Disconnected: ${reason}`)
      },
      onDelta: (text) => {
        setStreaming(text)
        setIsStreaming(true)
        scrollToBottom()
      },
      onMessage: (msg) => {
        const text = extractText(msg)
        if (text && text !== 'NO_REPLY' && text !== 'HEARTBEAT_OK') {
          setMessages(prev => [...prev, { role: msg.role, text, ts: msg.timestamp }])
        }
        setStreaming('')
        setIsStreaming(false)
        scrollToBottom()
      },
      onFinal: () => {
        // If we were streaming, commit the stream as a message
        setStreaming(prev => {
          if (prev.trim() && prev.trim() !== 'NO_REPLY' && prev.trim() !== 'HEARTBEAT_OK') {
            setMessages(msgs => [...msgs, { role: 'assistant', text: prev, ts: Date.now() }])
          }
          return ''
        })
        setIsStreaming(false)
        scrollToBottom()
      },
      onError: (err) => {
        setError(err)
        setIsStreaming(false)
      },
    })

    client.connect()
    clientRef.current = client

    return () => {
      client.disconnect()
      clientRef.current = null
    }
  }, [wsUrl, token, showSettings, scrollToBottom])

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, streaming, scrollToBottom])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || !clientRef.current?.isConnected) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }])
    setStreaming('')
    setIsStreaming(true)

    try {
      await clientRef.current.sendMessage(text)
    } catch (e) {
      setError(`Send failed: ${e}`)
      setIsStreaming(false)
    }
  }, [input])

  const handleAbort = useCallback(() => {
    clientRef.current?.abort().catch(() => {})
    setIsStreaming(false)
  }, [])

  const saveSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('clawpanel-gateway-url', wsUrl)
      localStorage.setItem('clawpanel-gateway-token', token)
    }
    setShowSettings(false)
  }

  // ─── Settings Panel ───────────────────────────────────
  if (showSettings) {
    return (
      <div style={styles.container}>
        <div style={styles.settingsCard}>
          <h2 style={styles.settingsTitle}>Gateway Connection</h2>
          <p style={styles.settingsDesc}>
            Connect to your OpenClaw gateway to chat with Eve.
          </p>

          <label style={styles.label}>WebSocket URL</label>
          <input
            value={wsUrl}
            onChange={e => setWsUrl(e.target.value)}
            placeholder="wss://your-instance.ts.net:8443"
            style={styles.input}
          />

          <label style={styles.label}>Auth Token</label>
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Gateway auth token"
            type="password"
            style={styles.input}
          />

          <button onClick={saveSettings} style={styles.connectBtn}>
            Connect
          </button>
        </div>
      </div>
    )
  }

  // ─── Chat UI ──────────────────────────────────────────
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <a href="/" style={styles.backLink}>‹</a>
          <span style={styles.headerTitle}>Eve</span>
          <span style={{
            ...styles.statusDot,
            background: connected ? '#10b981' : '#ef4444',
            boxShadow: connected ? '0 0 6px rgba(16,185,129,0.4)' : '0 0 6px rgba(239,68,68,0.4)',
          }} />
        </div>
        <button onClick={() => setShowSettings(true)} style={styles.settingsBtn}>⚙</button>
      </div>

      {/* Error banner */}
      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={styles.errorDismiss}>×</button>
        </div>
      )}

      {/* Messages */}
      <div style={styles.messages}>
        {messages.length === 0 && !isStreaming && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>◆</div>
            <p style={styles.emptyText}>Connected to Eve</p>
            <p style={styles.emptyHint}>Send a message to start chatting</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={m.role === 'user' ? styles.userRow : styles.assistantRow}>
            {m.role !== 'user' && <div style={styles.avatar}>E</div>}
            <div style={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>
              <div style={styles.messageText}>{m.text}</div>
              {m.ts && <div style={styles.timestamp}>{formatTime(m.ts)}</div>}
            </div>
          </div>
        ))}

        {/* Streaming */}
        {isStreaming && (
          <div style={styles.assistantRow}>
            <div style={styles.avatar}>E</div>
            <div style={styles.assistantBubble}>
              <div style={styles.messageText}>
                {streaming || <span style={styles.typingDots}>●●●</span>}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <div style={styles.inputRow}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={connected ? 'Message Eve…' : 'Connecting…'}
            disabled={!connected}
            style={styles.input2}
          />
          {isStreaming ? (
            <button onClick={handleAbort} style={styles.stopBtn}>■</button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !connected}
              style={{
                ...styles.sendBtn,
                opacity: input.trim() && connected ? 1 : 0.3,
              }}
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    background: '#0a0a0a',
    color: '#e5e5e5',
    fontFamily: 'var(--font-jakarta, -apple-system, system-ui, sans-serif)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    height: 48,
    background: 'rgba(10,10,10,0.9)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  backLink: {
    color: '#60a5fa',
    textDecoration: 'none',
    fontSize: '1.1rem',
    padding: '4px 8px',
  },
  headerTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    fontFamily: 'var(--font-space-grotesk, monospace)',
    letterSpacing: '-0.02em',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
  },
  settingsBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  errorBanner: {
    padding: '8px 14px',
    background: 'rgba(239,68,68,0.1)',
    borderBottom: '1px solid rgba(239,68,68,0.2)',
    color: '#fca5a5',
    fontSize: '0.72rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  errorDismiss: {
    background: 'none',
    border: 'none',
    color: '#fca5a5',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0 4px',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  emptyState: {
    textAlign: 'center' as const,
    marginTop: 80,
  },
  emptyIcon: {
    fontSize: '2rem',
    color: '#60a5fa',
    marginBottom: 12,
    opacity: 0.6,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '0.88rem',
    fontWeight: 500,
    margin: '0 0 4px',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: '0.72rem',
    margin: 0,
  },
  userRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  assistantRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    background: 'rgba(96,165,250,0.12)',
    border: '1px solid rgba(96,165,250,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.66rem',
    fontWeight: 700,
    color: '#60a5fa',
    flexShrink: 0,
    marginTop: 2,
  },
  userBubble: {
    maxWidth: '80%',
    padding: '10px 14px',
    borderRadius: '18px 18px 4px 18px',
    background: '#2563eb',
    color: '#fff',
  },
  assistantBubble: {
    maxWidth: '85%',
    padding: '10px 14px',
    borderRadius: '4px 18px 18px 18px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  messageText: {
    fontSize: '0.82rem',
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  timestamp: {
    fontSize: '0.58rem',
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
    textAlign: 'right' as const,
  },
  typingDots: {
    color: 'rgba(255,255,255,0.3)',
    animation: 'pulse 1.5s ease-in-out infinite',
    letterSpacing: 2,
  },
  inputArea: {
    padding: '8px 12px',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    background: 'rgba(10,10,10,0.95)',
    backdropFilter: 'blur(20px)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: '4px 4px 4px 16px',
  },
  input2: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    fontSize: '0.84rem',
    color: '#e5e5e5',
    outline: 'none',
    fontFamily: 'var(--font-jakarta, -apple-system, system-ui, sans-serif)',
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    background: '#fff',
    color: '#000',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
  stopBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // Settings
  settingsCard: {
    margin: '60px auto',
    maxWidth: 380,
    padding: 24,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
  },
  settingsTitle: {
    fontFamily: 'var(--font-space-grotesk, monospace)',
    fontSize: '1.1rem',
    fontWeight: 700,
    margin: '0 0 8px',
    letterSpacing: '-0.02em',
  },
  settingsDesc: {
    fontSize: '0.76rem',
    color: 'rgba(255,255,255,0.5)',
    margin: '0 0 20px',
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#e5e5e5',
    fontSize: '0.82rem',
    outline: 'none',
    fontFamily: 'monospace',
    boxSizing: 'border-box' as const,
  },
  connectBtn: {
    marginTop: 20,
    width: '100%',
    padding: '12px',
    borderRadius: 12,
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '0.84rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-jakarta, -apple-system, system-ui, sans-serif)',
  },
}
