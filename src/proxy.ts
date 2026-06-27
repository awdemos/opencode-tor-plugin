import { isProxyReachable, type TorConfig } from './config.js'

interface BunRequestInit extends RequestInit {
  /** Bun-specific fetch option for SOCKS5/HTTP proxy routing. */
  proxy?: string
}

function extractUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return input
    if (typeof input === 'string') return new URL(input)
    if (input instanceof Request) return new URL(input.url)
    return null
  } catch {
    return null
  }
}

function parseIpv4(address: string): [number, number, number, number] | null {
  const match = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match || match.length !== 5) return null
  return match.slice(1).map(Number) as [number, number, number, number]
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  let lower = hostname.toLowerCase()
  if (lower.startsWith('[') && lower.endsWith(']')) {
    lower = lower.slice(1, -1)
  }

  if (lower === 'localhost' || lower === '::1') return true

  const octets = parseIpv4(lower)
  if (octets) {
    const [a, b] = octets
    if (a === 127) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    return false
  }

  if (lower.includes(':')) {
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true
    if (lower.startsWith('fe80:')) return true
  }

  return false
}

export function shouldRouteThroughProxy(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return !isPrivateOrLocalHostname(url.hostname)
}

export function createTorFetch(
  config: TorConfig,
  originalFetch: typeof fetch,
  options: { checkProxy?: (proxy: string) => Promise<boolean> } = {},
): typeof fetch {
  const checkProxy = options.checkProxy ?? isProxyReachable
  let proxyReachable: boolean | undefined
  let warned = false

  return async function torFetch(input, init?) {
    if (!config.enabled) {
      return originalFetch(input, init)
    }

    const url = extractUrl(input)
    if (url === null || !shouldRouteThroughProxy(url)) {
      return originalFetch(input, init)
    }

    const desiredProxy = (init as BunRequestInit | undefined)?.proxy ?? config.proxy

    if (proxyReachable === undefined) {
      proxyReachable = await checkProxy(desiredProxy)
    }

    if (!proxyReachable) {
      if (!warned) {
        console.warn(`[tor] proxy ${desiredProxy} is unreachable; falling back to direct routing`)
        warned = true
      }
      return originalFetch(input, init)
    }

    const bunInit: BunRequestInit = { ...init, proxy: desiredProxy }
    return originalFetch(input, bunInit)
  }
}

export function installTorFetch(config: TorConfig): () => void {
  const originalFetch = globalThis.fetch
  globalThis.fetch = createTorFetch(config, originalFetch)

  return () => {
    globalThis.fetch = originalFetch
  }
}
