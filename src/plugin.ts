import type { Plugin } from '@opencode-ai/plugin'
import { loadConfig } from './config.js'
import { createCommandHandler } from './commands.js'
import { installTorFetch } from './proxy.js'

export const TorPlugin: Plugin = async ({ project, client }) => {
  const { config, save } = loadConfig(project)

  installTorFetch(config)

  const logMessage = `loaded (tor ${config.enabled ? 'enabled' : 'disabled'} via ${config.proxy})`
  if (client?.app?.log) {
    await client.app.log({
      body: {
        service: 'opencode-tor-plugin',
        level: 'info',
        message: logMessage,
      },
    })
  } else {
    console.log(`[opencode-tor-plugin] ${logMessage}`)
  }

  return {
    event: createCommandHandler(config, save),
  }
}

export default TorPlugin
