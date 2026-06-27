import type { Plugin } from '@opencode-ai/plugin'
import { loadConfig } from './config.js'
import { createChatMessageHandler, createCommandHandler } from './commands.js'
import { installTorFetch } from './proxy.js'

export const TorPlugin: Plugin = async ({ project, client }) => {
  const { config, save } = loadConfig(project)
  const originalFetch = globalThis.fetch

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

  const commandOptions = { originalFetch }

  return {
    event: createCommandHandler(config, save, commandOptions),
    'chat.message': createChatMessageHandler(config, save, commandOptions),
  }
}

export default TorPlugin
