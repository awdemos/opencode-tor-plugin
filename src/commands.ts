import { isProxyReachable, type TorConfig } from './config.js'

interface ChatMessageEventData {
  message?: {
    content?: string
    role?: string
  }
}

export function createCommandHandler(
  config: TorConfig,
  save: () => Promise<void>,
  options: { checkProxy?: (proxy: string) => Promise<boolean> } = {},
): (input: { event: { type: string; data?: unknown } }) => Promise<void> {
  const checkProxy = options.checkProxy ?? isProxyReachable

  return async function handleTorCommand(input: { event: { type: string; data?: unknown } }) {
    if (input.event.type !== 'chat.message') return

    const data = input.event.data as ChatMessageEventData | undefined
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
      default: {
        console.log('[tor] usage: @tor on | off | status | test | proxy <socks5-url>')
        console.log('[tor] example: @tor proxy socks5h://127.0.0.1:9050')
      }
    }
  }
}
