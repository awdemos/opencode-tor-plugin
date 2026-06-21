import type { TorConfig } from './config.js'

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
  // Strip IPv6 brackets: new URL('http://[::1]:4096/api').hostname returns '[::1]'
  if (lower.startsWith('[') && lower.endsWith(']')) {
    lower = lower.slice(1, -1)
  }

  if (lower === 'localhost' || lower === '::1') return true

  // Only treat actual IPv4 literals as local/private; domain names that happen
  // to start with the same digits (e.g. "10.example.com") must route normally.
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

  // Only treat actual IPv6 literals as local/private; hostnames cannot contain ':'.
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
): typeof fetch {
  return async function torFetch(input, init?) {
    if (!config.enabled) {
      return originalFetch(input, init)
    }

    const url = extractUrl(input)
    if (url === null || !shouldRouteThroughProxy(url)) {
      return originalFetch(input, init)
    }

    const bunInit: BunRequestInit = { ...init, proxy: (init as BunRequestInit | undefined)?.proxy ?? config.proxy }
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
