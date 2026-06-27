import type { Plugin } from '@opencode-ai/plugin'

export interface TorConfig {
  /** Whether to route outbound HTTP(S) requests through the configured SOCKS5 proxy. */
  enabled: boolean
  /** SOCKS5 proxy URL. Default is the standard Tor daemon port. */
  proxy: string
}

export const DEFAULT_PROXY = 'socks5h://127.0.0.1:9050'

interface RuntimeProject {
  id: string
  config?: Record<string, unknown>
  saveConfig?: () => Promise<void>
}

type Project = Parameters<Plugin>[0]['project']

export function loadConfig(project: Project): { config: TorConfig; save: () => Promise<void> } {
  const runtimeProject = project as unknown as RuntimeProject
  const projectConfig = (runtimeProject.config ??= {})
  const torConfig = (projectConfig.tor ??= {}) as Record<string, unknown>

  if (typeof torConfig.enabled !== 'boolean') {
    torConfig.enabled = true
  }
  if (typeof torConfig.proxy !== 'string' || torConfig.proxy.length === 0) {
    torConfig.proxy = DEFAULT_PROXY
  }

  return {
    config: torConfig as unknown as TorConfig,
    save: async () => {
      await runtimeProject.saveConfig?.()
    },
  }
}

/**
 * Parses a SOCKS5 proxy URL and returns the host/port for reachability checks.
 * Returns null if the URL is malformed or uses an unsupported scheme.
 */
export function parseProxyUrl(proxy: string): { host: string; port: number } | null {
  try {
    const url = new URL(proxy)
    if (url.protocol !== 'socks5:' && url.protocol !== 'socks5h:') {
      return null
    }
    const port = Number(url.port)
    if (!url.hostname || Number.isNaN(port) || port <= 0 || port > 65535) {
      return null
    }
    return { host: url.hostname, port }
  } catch {
    return null
  }
}

/**
 * Quickly checks whether the SOCKS5 proxy port is reachable.
 * Resolves true on connection, false on error or timeout.
 */
export async function isProxyReachable(
  proxy: string,
  timeoutMs = 3000,
): Promise<boolean> {
  const parsed = parseProxyUrl(proxy)
  if (!parsed) return false

  const { host, port } = parsed
  const socket = await import('node:net')
    .then(({ default: net }) => net)
    .catch(() => null)
  if (!socket) return false

  return new Promise((resolve) => {
    const conn = socket.connect({ host, port })
    const timer = setTimeout(() => {
      conn.destroy()
      resolve(false)
    }, timeoutMs)

    conn.once('connect', () => {
      clearTimeout(timer)
      conn.destroy()
      resolve(true)
    })

    conn.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}
