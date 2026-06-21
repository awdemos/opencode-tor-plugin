import type { Plugin } from '@opencode-ai/plugin'
import { loadConfig } from './config.js'
import { createCommandHandler } from './commands.js'
import { installTorFetch } from './proxy.js'

export const TorPlugin: Plugin = async ({ project }) => {
  const { config, save } = loadConfig(project)

  installTorFetch(config)

  console.log(`[opencode-tor-plugin] loaded (tor ${config.enabled ? 'enabled' : 'disabled'} via ${config.proxy})`)

  return {
    event: createCommandHandler(config, save),
  }
}

export default TorPlugin
