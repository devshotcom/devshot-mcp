# DevShot MCP Server

This package exposes the existing DevShot HTTP API as a local stdio MCP server so AI clients can call DevShot tools directly.

Standalone repository: https://github.com/devshotcom/devshot-mcp

## Configuration

- `DEVSHOT_API_KEY`: required DevShot API key (`ds_...`)
- `DEVSHOT_API_URL`: optional DevShot console origin, defaults to `https://console.devshot.com`

## Run

From this app directory:

```bash
DEVSHOT_API_KEY=ds_your_key_here node server.js
```

From the DevShot monorepo root:

```bash
DEVSHOT_API_KEY=ds_your_key_here npm run mcp:devshot
```

## Example MCP client config

```json
{
  "mcpServers": {
    "devshot": {
      "command": "node",
      "args": ["/path/to/devshot-mcp/server.js"],
      "env": {
        "DEVSHOT_API_KEY": "ds_your_key_here",
        "DEVSHOT_API_URL": "https://console.devshot.com"
      }
    }
  }
}
```

## Tools

### API catalog and generic API access

- `list_api_endpoints`: returns the `/api/*` endpoints exposed by the current DevShot release and the HTTP methods each endpoint supports.
- `api_call`: calls any `/api/*` endpoint with the configured API key. Use `list_api_endpoints` first when the exact path is unknown.

`api_call` accepts:

```json
{
  "method": "GET",
  "path": "/api/servers"
}
```

For non-GET requests, pass a JSON body:

```json
{
  "method": "POST",
  "path": "/api/servers/<server_id>/pool/base-image",
  "body": {
    "templateName": "desktop"
  }
}
```

The endpoint catalog is generated from the console API during the release sync workflow before this standalone package is pushed, so every release updates the README/package API surface from the monorepo source.

### Direct convenience tools

- `list_servers`
- `get_server`
- `create_server`
- `update_server`
- `delete_server`
- `list_vms`
- `claim_vm`
- `exec_vm`
- `destroy_vm`
- `get_firewall_status`
- `get_security_status`
- `list_security_events`
- `computer_use` — drive a DevShot desktop VM (mouse, keyboard, screenshot). Schema matches Anthropic `computer_20250124`.
- `desktop_screenshot` — capture a PNG of a DevShot desktop VM and return it as base64.

The direct tools cover the common server, VM, firewall, and security workflows. The generic `api_call` tool covers newer and specialized release functionality such as image bakery, pool base image selection, per-VM forwards, storage providers, workspaces, notes, files, secrets, tickets, audit logs, tunnel status, vnets, and terminal sessions.
