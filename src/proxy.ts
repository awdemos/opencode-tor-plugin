import { fetch as socksFetch } from 'netbun'
import { isProxyReachable, type TorConfig } from './config.js'

interface UserSocksRequestInit extends RequestInit {
  /** User-provided SOCKS5 proxy URL (e.g. socks5h://127.0.0.1:9050). */
  proxy?: string
}

interface NetbunSocksRequestInit extends RequestInit {
  /** netbun proxy option: URL string or object with remote-DNS flag. */
  proxy?: string | { url: string; resolveDnsLocally?: boolean }
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

function normalizeSocks5Proxy(proxy: string): { url: string; resolveDnsLocally: boolean } {
  const url = proxy.replace(/^socks5h:\/\//, 'socks5://')
  return { url, resolveDnsLocally: false }
}

function getDesiredProxy(init: UserSocksRequestInit | undefined, config: TorConfig): string {
  return init?.proxy ?? config.proxy
}

export interface TorFetchOptions {
  checkProxy?: (proxy: string) => Promise<boolean>
  socksFetch?: typeof fetch
}

export function createTorFetch(
  config: TorConfig,
  originalFetch: typeof fetch,
  options: TorFetchOptions = {},
): typeof fetch {
  const checkProxy = options.checkProxy ?? isProxyReachable
  const proxyFetch = options.socksFetch ?? socksFetch
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

    const desiredProxy = getDesiredProxy(init as UserSocksRequestInit | undefined, config)

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

    const socksInit: NetbunSocksRequestInit = { ...init, proxy: normalizeSocks5Proxy(desiredProxy) }
    return proxyFetch(input, socksInit)
  }
}

export function installTorFetch(config: TorConfig): () => void {
  const originalFetch = globalThis.fetch
  globalThis.fetch = createTorFetch(config, originalFetch)

  return () => {
    globalThis.fetch = originalFetch
  }
}
