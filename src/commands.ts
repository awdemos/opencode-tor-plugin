import { isProxyReachable, type TorConfig } from './config.js'

interface ChatMessageEventData {
  message?: {
    content?: string
    role?: string
  }
}

export interface ChatMessageInput {
  sessionID: string
  agent?: string
  model?: {
    providerID: string
    modelID: string
  }
  messageID?: string
  variant?: string
}

export interface UserMessage {
  role: 'user'
  id: string
  sessionID: string
  time: { created: number }
  summary?: { title?: string; body?: string; diffs: unknown[] }
  agent: string
  model: { providerID: string; modelID: string }
  system?: string
  tools?: Record<string, boolean>
}

export interface TextPart {
  id: string
  sessionID: string
  messageID: string
  type: 'text'
  text: string
  synthetic?: boolean
  ignored?: boolean
  time?: { start: number; end?: number }
  metadata?: Record<string, unknown>
}

export interface ChatMessageOutput {
  message: UserMessage
  parts: Array<{ type: string; text?: string; ignored?: boolean } & Record<string, unknown>>
}

const IP_ECHO_URL = 'https://icanhazip.com'

async function fetchIp(
  fetcher: typeof fetch,
  timeoutMs = 10000,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetcher(IP_ECHO_URL, { signal: controller.signal })
    if (!response.ok) return null
    const text = (await response.text()).trim()
    return text || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface EventPayload {
  event: {
    type: string
    data?: unknown
  }
}

function isTorCommand(content: string): boolean {
  return /^@tor(?:\s+|$)/.test(content)
}

async function executeTorCommand(
  config: TorConfig,
  save: () => Promise<void>,
  content: string,
  options: { checkProxy?: (proxy: string) => Promise<boolean>; originalFetch?: typeof fetch } = {},
): Promise<void> {
  const checkProxy = options.checkProxy ?? isProxyReachable
  const originalFetch = options.originalFetch ?? globalThis.fetch

  const parts = content.split(/\s+/)
  const subcommand = parts[1]

  switch (subcommand) {
    case 'on': {
      config.enabled = true
      await save()
      console.log(`[tor] enabled. routing outbound HTTP(S) through ${config.proxy}`)
      break
    }
    case 'off': {
      config.enabled = false
      await save()
      console.log('[tor] disabled. outbound requests use direct routing')
      break
    }
    case 'status': {
      console.log(`[tor] ${config.enabled ? 'ENABLED' : 'disabled'} via ${config.proxy}`)
      break
    }
    case 'proxy': {
      if (parts[2]) {
        config.proxy = parts[2]
        await save()
        console.log(`[tor] proxy set to ${config.proxy}`)
      } else {
        console.log(`[tor] current proxy: ${config.proxy}`)
      }
      break
    }
    case 'test': {
      const reachable = await checkProxy(config.proxy)
      if (reachable) {
        console.log(`[tor] proxy ${config.proxy} is reachable`)
      } else {
        console.log(`[tor] proxy ${config.proxy} is unreachable — outbound requests will fall back to direct routing`)
      }
      break
    }
    case 'verify': {
      const directIp = await fetchIp(originalFetch)
      const proxiedIp = await fetchIp(globalThis.fetch)

      if (!directIp && !proxiedIp) {
        console.log('[tor] verify failed: could not determine either IP address')
        break
      }

      console.log(`[tor] direct IP: ${directIp ?? 'unknown'}`)
      console.log(`[tor]  proxied IP: ${proxiedIp ?? 'unknown'}`)

      if (proxiedIp && proxiedIp !== directIp) {
        console.log('[tor] verify OK: traffic is routing through the proxy')
      } else if (proxiedIp) {
        console.log('[tor] verify warning: proxied IP matches direct IP — traffic may not be going through Tor')
      } else {
        console.log('[tor] verify warning: could not fetch IP through proxy')
      }
      break
    }
    default: {
      console.log('[tor] usage: @tor on | off | status | test | verify | proxy <socks5-url>')
      console.log('[tor] example: @tor proxy socks5h://127.0.0.1:9050')
    }
  }
}

export interface CommandHandlerOptions {
  checkProxy?: (proxy: string) => Promise<boolean>
  originalFetch?: typeof fetch
}

export function createCommandHandler(
  config: TorConfig,
  save: () => Promise<void>,
  options: CommandHandlerOptions = {},
): (payload: EventPayload) => Promise<void> {
  return async function handleTorCommand(payload: EventPayload) {
    const { event } = payload
    if (event.type !== 'chat.message') return

    const data = event.data as ChatMessageEventData | undefined
    const content = (data?.message?.content ?? '').trim()
    if (!isTorCommand(content)) return

    await executeTorCommand(config, save, content, options)
  }
}

function extractTextFromParts(parts: ChatMessageOutput['parts']): string {
  let text = ''
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      text += part.text
    }
  }
  return text.trim()
}

export function createChatMessageHandler(
  config: TorConfig,
  save: () => Promise<void>,
  options: CommandHandlerOptions = {},
): (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void> {
  return async function handleChatMessage(input: ChatMessageInput, output: ChatMessageOutput) {
    const content = extractTextFromParts(output.parts)
    if (!isTorCommand(content)) return

    await executeTorCommand(config, save, content, options)

    // Ignore the message parts so OpenCode skips normal prompt/command dispatch.
    for (const part of output.parts) {
      part.ignored = true
    }
  }
}
