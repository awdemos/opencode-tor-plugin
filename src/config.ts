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
    torConfig.enabled = false
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
