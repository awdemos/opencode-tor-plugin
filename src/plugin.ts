import type { Plugin } from '@opencode-ai/plugin'
import { loadConfig } from './config.js'
import { createCommandHandler } from './commands.js'
import { installTorFetch } from './proxy.js'

export const TorPlugin: Plugin = async ({ project, client }) => {
  const { config, save } = loadConfig(project)

  installTorFetch(config)

  await client.app.log({
    body: {
      service: 'opencode-tor-plugin',
      level: 'info',
      message: `loaded (tor ${config.enabled ? 'enabled' : 'disabled'} via ${config.proxy})`,
    },
  })

  return {
    event: createCommandHandler(config, save),
  }
}

export default TorPlugin
