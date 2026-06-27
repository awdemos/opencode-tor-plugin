# opencode-tor-plugin

> **⚠️ Experimental** — This plugin is functional and tested but has not been widely used in production. Patching `globalThis.fetch` may interact unexpectedly with other plugins or future opencode versions. Use at your own risk.

Routes OpenCode's outbound HTTP(S) requests through the Tor SOCKS5 proxy.

## Requirements

- OpenCode running on a recent version of Bun with native SOCKS5 proxy support.
- A Tor daemon listening on a SOCKS5 port (default `127.0.0.1:9050`).

## Install

Add the plugin to your OpenCode config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-tor-plugin"]
}
```

For local development, use a file URL:

```jsonc
{
  "plugin": ["file:///var/home/a/code/opencode-tor-plugin"]
}
```

## Usage

The plugin starts enabled by default. Use chat commands to control it:

- `@tor on` — route outbound HTTP(S) requests through Tor
- `@tor off` — disable Tor routing
- `@tor status` — show current state and proxy URL
- `@tor test` — check whether the configured SOCKS5 proxy is reachable
- `@tor proxy <url>` — set a custom SOCKS5 proxy URL

## How it works

When enabled, the plugin wraps `globalThis.fetch` and injects Bun's `proxy` option so matching HTTP(S) requests are tunneled through the configured SOCKS5 proxy.

Before routing a request through the proxy, the plugin checks that the SOCKS5 port is reachable. If Tor is not running or the proxy is otherwise unreachable, it falls back to direct routing and prints a warning so OpenCode keeps working instead of failing silently.

Local addresses are always passed through directly so OpenCode's own server and local services keep working:

- `localhost`, `127.0.0.1`, `::1`
- Private IPv4 ranges (`10/8`, `172.16/12`, `192.168/16`, `169.254/16`)
- IPv6 unique-local and link-local addresses

## Configuration

Settings are stored in your project's OpenCode config under the `tor` key:

```jsonc
{
  "tor": {
    "enabled": true,
    "proxy": "socks5h://127.0.0.1:9050"
  }
}
```

- `enabled` — whether Tor routing is active (default `true`)
- `proxy` — SOCKS5 proxy URL. Use `socks5h://` for remote DNS resolution through Tor.

## License

MIT
