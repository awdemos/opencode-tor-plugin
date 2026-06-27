import { isProxyReachable, type TorConfig } from './config.js'

interface BunRequestInit extends RequestInit {
  /** Bun-specific fetch option for SOCKS5/HTTP proxy routing. */
  proxy?: string
}

interface ChatMessageEventData {
  message?: {
    content?: string
    role?: string
  }
}

const IP_ECHO_URL = 'https://icanhazip.com'

async function fetchIp(
  fetcher: typeof fetch,
  proxy: string | undefined,
  timeoutMs = 10000,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const init: BunRequestInit = { signal: controller.signal }
    if (proxy) init.proxy = proxy
    const response = await fetcher(IP_ECHO_URL, init)
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

export function createCommandHandler(
  config: TorConfig,
  save: () => Promise<void>,
  options: { checkProxy?: (proxy: string) => Promise<boolean>; fetcher?: typeof fetch } = {},
): (payload: EventPayload) => Promise<void> {
  const checkProxy = options.checkProxy ?? isProxyReachable
  const fetcher = options.fetcher ?? globalThis.fetch

  return async function handleTorCommand(payload: EventPayload) {
    const { event } = payload
    if (event.type !== 'chat.message') return

    const data = event.data as ChatMessageEventData | undefined
    const content = (data?.message?.content ?? '').trim()
    if (!/^@tor(?:\s+|$)/.test(content)) return

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
        const directIp = await fetchIp(fetcher, undefined)
        const proxiedIp = await fetchIp(fetcher, config.proxy)

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
}
