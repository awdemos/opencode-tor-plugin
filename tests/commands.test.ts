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

  it('reports proxy as reachable for @tor test', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const handler = createCommandHandler(config, save, { checkProxy: async () => true })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler(makeEvent('@tor test'))

    expect(save).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0]?.[0]).toContain('reachable')

    logSpy.mockRestore()
  })

  it('reports proxy as unreachable for @tor test', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const handler = createCommandHandler(config, save, { checkProxy: async () => false })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler(makeEvent('@tor test'))

    expect(save).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0]?.[0]).toContain('unreachable')

    logSpy.mockRestore()
  })

  it('verifies Tor routing when direct and proxied IPs differ', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const proxy = (init as { proxy?: string } | undefined)?.proxy
        const body = proxy ? '1.2.3.4\n' : '9.8.7.6\n'
        return new Response(body)
      },
    )
    const handler = createCommandHandler(config, save, { fetcher })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler(makeEvent('@tor verify'))

    expect(save).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('proxy')
    expect((fetcher.mock.calls[1]?.[1] as { proxy?: string } | undefined)?.proxy).toBe(config.proxy)
    expect(logSpy.mock.calls.map((call) => call[0])).toContain('[tor] verify OK: traffic is routing through the proxy')

    logSpy.mockRestore()
  })

  it('warns when proxied IP matches direct IP', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const fetcher = vi.fn(async () => new Response('9.8.7.6\n'))
    const handler = createCommandHandler(config, save, { fetcher })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler(makeEvent('@tor verify'))

    expect(logSpy.mock.calls.map((call) => call[0])).toContain('[tor] verify warning: proxied IP matches direct IP — traffic may not be going through Tor')

    logSpy.mockRestore()
  })

  it('reports verify failure when both IP checks fail', async () => {
    const config = makeConfig()
    const save = vi.fn()
    const fetcher = vi.fn(async () => new Response('', { status: 500 }))
    const handler = createCommandHandler(config, save, { fetcher })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler(makeEvent('@tor verify'))

    expect(logSpy.mock.calls.map((call) => call[0])).toContain('[tor] verify failed: could not determine either IP address')

    logSpy.mockRestore()
  })
})
