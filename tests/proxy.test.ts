import { describe, it, expect, vi } from 'vitest'
import { createTorFetch, shouldRouteThroughProxy } from '../src/proxy.js'
import { isProxyReachable, parseProxyUrl } from '../src/config.js'
import type { TorConfig } from '../src/config.js'

const PROXY = 'socks5h://127.0.0.1:9050'

function makeConfig(overrides: Partial<TorConfig> = {}): TorConfig {
  return {
    enabled: true,
    proxy: PROXY,
    ...overrides,
  }
}

function makeMockFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (_input, _init) => new Response('ok'))
}

describe('shouldRouteThroughProxy', () => {
  it.each([
    ['https://api.openai.com/v1/chat/completions', true],
    ['http://example.com', true],
    ['https://example.com', true],
    ['http://localhost:4096/api', false],
    ['http://127.0.0.1:4096/api', false],
    ['http://[::1]:4096/api', false],
    ['http://10.0.0.1/api', false],
    ['http://192.168.1.1/api', false],
    ['http://172.16.0.1/api', false],
    ['http://172.31.255.255/api', false],
    ['http://169.254.1.1/api', false],
    ['http://10.example.com/api', true],
    ['http://127.0.0.1.example.com/api', true],
    ['http://192.168.1.1.example.com/api', true],
    ['http://172.16.0.1.example.com/api', true],
    ['http://169.254.1.1.example.com/api', true],
    ['http://fc.example.com/api', true],
    ['http://fe80.example.com/api', true],
    ['ftp://example.com/file', false],
    ['file:///etc/passwd', false],
  ])('for %s returns %s', (url, expected) => {
    expect(shouldRouteThroughProxy(new URL(url))).toBe(expected)
  })
})

describe('createTorFetch', () => {
  it('passes through when disabled', async () => {
    const config = makeConfig({ enabled: false })
    const mockFetch = makeMockFetch()
    const torFetch = createTorFetch(config, mockFetch)

    await torFetch('https://example.com')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]?.[1]).toBeUndefined()
  })

  it('injects proxy for remote HTTP(S) requests when enabled and reachable', async () => {
    const config = makeConfig({ enabled: true })
    const mockFetch = makeMockFetch()
    const torFetch = createTorFetch(config, mockFetch, { checkProxy: async () => true })

    await torFetch('https://api.openai.com/v1/chat/completions')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const init = mockFetch.mock.calls[0]?.[1] as { proxy?: string } | undefined
    expect(init?.proxy).toBe(PROXY)
  })

  it('falls back to direct routing when proxy is unreachable', async () => {
    const config = makeConfig({ enabled: true })
    const mockFetch = makeMockFetch()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const torFetch = createTorFetch(config, mockFetch, { checkProxy: async () => false })

    await torFetch('https://example.com')
    await torFetch('https://api.openai.com/v1/chat/completions')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    for (const call of mockFetch.mock.calls) {
      const init = call[1] as { proxy?: string } | undefined
      expect(init?.proxy).toBeUndefined()
    }
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain('unreachable')

    warnSpy.mockRestore()
  })

  it('does not route ftp: or file: requests', async () => {
    const config = makeConfig({ enabled: true })
    const mockFetch = makeMockFetch()
    const torFetch = createTorFetch(config, mockFetch, { checkProxy: async () => true })

    await torFetch('ftp://example.com/file')
    await torFetch('file:///etc/passwd')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    for (const call of mockFetch.mock.calls) {
      const init = call[1] as { proxy?: string } | undefined
      expect(init?.proxy).toBeUndefined()
    }
  })

  it('does not inject proxy for localhost', async () => {
    const config = makeConfig({ enabled: true })
    const mockFetch = makeMockFetch()
    const torFetch = createTorFetch(config, mockFetch, { checkProxy: async () => true })

    await torFetch('http://localhost:4096/api')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const init = mockFetch.mock.calls[0]?.[1] as { proxy?: string } | undefined
    expect(init?.proxy).toBeUndefined()
  })

  it('preserves existing proxy in init', async () => {
    const config = makeConfig({ enabled: true, proxy: PROXY })
    const mockFetch = makeMockFetch()
    const torFetch = createTorFetch(config, mockFetch, { checkProxy: async () => true })

    await torFetch('https://example.com', { proxy: 'socks5h://127.0.0.1:9150' } as RequestInit)

    const init = mockFetch.mock.calls[0]?.[1] as { proxy?: string } | undefined
    expect(init?.proxy).toBe('socks5h://127.0.0.1:9150')
  })

  it('handles Request input objects', async () => {
    const config = makeConfig({ enabled: true })
    const mockFetch = makeMockFetch()
    const torFetch = createTorFetch(config, mockFetch, { checkProxy: async () => true })

    await torFetch(new Request('https://example.com'))

    const init = mockFetch.mock.calls[0]?.[1] as { proxy?: string } | undefined
    expect(init?.proxy).toBe(PROXY)
  })
})

describe('parseProxyUrl', () => {
  it.each([
    ['socks5h://127.0.0.1:9050', { host: '127.0.0.1', port: 9050 }],
    ['socks5://localhost:9150', { host: 'localhost', port: 9150 }],
    ['http://127.0.0.1:9050', null],
    ['not-a-url', null],
  ])('for %s returns %s', (input, expected) => {
    expect(parseProxyUrl(input)).toEqual(expected)
  })
})

describe('isProxyReachable', () => {
  it('returns false for malformed proxy URLs', async () => {
    expect(await isProxyReachable('not-a-proxy')).toBe(false)
    expect(await isProxyReachable('http://127.0.0.1:9050')).toBe(false)
  })

  it('returns false when port is not listening', async () => {
    expect(await isProxyReachable('socks5h://127.0.0.1:1', 100)).toBe(false)
  })
})
