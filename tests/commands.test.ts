import { describe, it, expect, vi } from 'vitest'
import { createCommandHandler } from '../src/commands.js'
import type { TorConfig } from '../src/config.js'

function makeConfig(overrides: Partial<TorConfig> = {}): TorConfig {
  return {
    enabled: false,
    proxy: 'socks5h://127.0.0.1:9050',
    ...overrides,
  }
}

function makeEvent(content: string): { event: { type: string; data?: unknown } } {
  return {
    event: {
      type: 'chat.message',
      data: { message: { content, role: 'user' } },
    },
  }
}

describe('createCommandHandler', () => {
  it('ignores non-chat events', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const handler = createCommandHandler(config, save)

    await handler({ event: { type: 'other.event' } })

    expect(save).not.toHaveBeenCalled()
  })

  it('ignores chat messages without @tor prefix', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const handler = createCommandHandler(config, save)

    await handler(makeEvent('hello world'))

    expect(save).not.toHaveBeenCalled()
  })

  it('does not treat @torch or @torrent as @tor commands', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const handler = createCommandHandler(config, save)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler(makeEvent('@torch search'))
    await handler(makeEvent('@torrent download'))

    expect(save).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('handles @tor on', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const handler = createCommandHandler(config, save)

    await handler(makeEvent('@tor on'))

    expect(config.enabled).toBe(true)
    expect(save).toHaveBeenCalledOnce()
  })

  it('handles @tor off', async () => {
    const config = makeConfig({ enabled: true })
    const save = vi.fn()
    const handler = createCommandHandler(config, save)

    await handler(makeEvent('@tor off'))

    expect(config.enabled).toBe(false)
    expect(save).toHaveBeenCalledOnce()
  })

  it('shows usage for unknown subcommands', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const handler = createCommandHandler(config, save)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler(makeEvent('@tor unknown'))

    expect(save).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()

    logSpy.mockRestore()
  })
})
