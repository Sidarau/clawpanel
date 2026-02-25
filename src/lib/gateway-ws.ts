/**
 * OpenClaw Gateway WebSocket client for ClawPanel
 * Protocol: JSON frames — req/res/event pattern
 */

export interface GatewayOpts {
  url: string
  token?: string
  sessionKey?: string
  onMessage?: (msg: ChatMessage) => void
  onDelta?: (text: string) => void
  onFinal?: () => void
  onError?: (err: string) => void
  onConnect?: () => void
  onDisconnect?: (reason: string) => void
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: Array<{ type: string; text?: string }> | string
  timestamp?: number
}

type PendingReq = {
  resolve: (val: any) => void
  reject: (err: Error) => void
}

let reqId = 0
function nextId(): string {
  return `cp-${++reqId}-${Date.now().toString(36)}`
}

export class GatewayClient {
  private ws: WebSocket | null = null
  private opts: GatewayOpts
  private pending = new Map<string, PendingReq>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoffMs = 1000
  private closed = false
  private connected = false

  constructor(opts: GatewayOpts) {
    this.opts = opts
  }

  connect() {
    if (this.ws) return
    this.closed = false

    try {
      this.ws = new WebSocket(this.opts.url)
    } catch (e) {
      this.opts.onError?.(`WebSocket creation failed: ${e}`)
      return
    }

    this.ws.addEventListener('open', () => {
      // Send connect frame after a brief delay (protocol requires it)
      setTimeout(() => this.sendConnect(), 200)
    })

    this.ws.addEventListener('message', (e) => {
      this.handleMessage(String(e.data ?? ''))
    })

    this.ws.addEventListener('close', (e) => {
      this.ws = null
      this.connected = false
      this.flushPending(new Error(`closed (${e.code}): ${e.reason}`))
      this.opts.onDisconnect?.(e.reason || `code ${e.code}`)
      if (!this.closed) this.scheduleReconnect()
    })

    this.ws.addEventListener('error', () => {
      // close event will fire after this
    })
  }

  disconnect() {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close(1000, 'client disconnect')
      this.ws = null
    }
    this.connected = false
  }

  get isConnected() {
    return this.connected
  }

  private sendConnect() {
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'clawpanel',
        version: '0.3',
        platform: 'web',
        mode: 'webchat',
      },
      role: 'operator',
      scopes: ['operator.admin'],
      caps: [],
      auth: this.opts.token ? { token: this.opts.token } : undefined,
    }

    this.request('connect', params)
      .then(() => {
        this.connected = true
        this.backoffMs = 1000
        this.opts.onConnect?.()
      })
      .catch((err) => {
        this.opts.onError?.(`Connect failed: ${err.message}`)
        this.ws?.close(4000, 'connect failed')
      })
  }

  private request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('not connected'))
      }
      const id = nextId()
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }))

      // Timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('request timeout'))
        }
      }, 30000)
    })
  }

  private handleMessage(raw: string) {
    let msg: any
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (msg.type === 'res') {
      const req = this.pending.get(msg.id)
      if (req) {
        this.pending.delete(msg.id)
        if (msg.ok !== false && !msg.error) {
          req.resolve(msg.payload ?? msg)
        } else {
          req.reject(new Error(msg.error?.message ?? 'request failed'))
        }
      }
      return
    }

    if (msg.type === 'event') {
      if (msg.event === 'connect.challenge') {
        // Re-send connect with nonce if challenged
        this.sendConnect()
        return
      }

      if (msg.event === 'chat') {
        this.handleChatEvent(msg.payload)
        return
      }
    }
  }

  private handleChatEvent(payload: any) {
    if (!payload) return

    if (payload.state === 'delta') {
      // Streaming text
      const text = this.extractText(payload.message)
      if (text) this.opts.onDelta?.(text)
    } else if (payload.state === 'final') {
      // Complete message
      if (payload.message) {
        this.opts.onMessage?.({
          role: 'assistant',
          content: payload.message.content ?? payload.message,
          timestamp: Date.now(),
        })
      }
      this.opts.onFinal?.()
    } else if (payload.state === 'aborted') {
      this.opts.onFinal?.()
    } else if (payload.state === 'error') {
      this.opts.onError?.(payload.errorMessage ?? 'chat error')
      this.opts.onFinal?.()
    }
  }

  private extractText(message: any): string {
    if (!message) return ''
    if (typeof message === 'string') return message
    if (typeof message.content === 'string') return message.content
    if (Array.isArray(message.content)) {
      return message.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text ?? '')
        .join('')
    }
    return ''
  }

  private flushPending(err: Error) {
    this.pending.forEach((req) => {
      req.reject(err)
    })
    this.pending.clear()
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.backoffMs)
    this.backoffMs = Math.min(this.backoffMs * 1.5, 30000)
  }

  // ── Public API ──

  async getHistory(sessionKey?: string): Promise<ChatMessage[]> {
    const res = await this.request('chat.history', {
      sessionKey: sessionKey ?? this.opts.sessionKey,
      limit: 100,
    })
    return Array.isArray(res?.messages) ? res.messages : []
  }

  async sendMessage(text: string, sessionKey?: string): Promise<string | null> {
    const res = await this.request('chat.send', {
      sessionKey: sessionKey ?? this.opts.sessionKey,
      message: text,
      deliver: false,
    })
    return res?.runId ?? null
  }

  async abort(sessionKey?: string): Promise<void> {
    await this.request('chat.abort', {
      sessionKey: sessionKey ?? this.opts.sessionKey,
    }).catch(() => {})
  }
}
