# DevShot MCP Server

This package exposes the existing DevShot HTTP API as a local stdio MCP server so AI clients can call DevShot tools directly.

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
