# DevShot MCP Server

This package exposes the existing DevShot HTTP API as a local stdio MCP server so AI clients can call DevShot tools directly.

Standalone repository: https://github.com/devshotcom/devshot-mcp

## Connect one Studio project (recommended)

A project key (`dsp_...`) opens exactly one DevShot Studio project. Studio
fills it into Share → Connect an AI client. It works until it is revoked and
expires after 7 days without use; when the Studio session has ended, the next
call that needs the VM opens a new one (using one session pass). Its tools take
no VM name: DevShot resolves the project's current VM on every call, starts it
when needed, and never reaches other projects, other VMs or account settings.

Besides `exec`, `read_file` and `write_file`, the project tools upload local
files without passing them through the model (`request_upload` + `curl -T`),
download and unpack archives, list and search files, run background jobs,
take screenshots of the app with console errors and broken images, send HTTP
requests to it, back the workspace up, and — for Shopware — run `bin/console`,
mint Admin API tokens and run Studio's own `shopware_check`. Clients that
accept `text/event-stream` see `exec` output while it runs.

No local install is needed — the console hosts the MCP endpoint:

```bash
claude mcp add --transport http devshot https://console.devshot.com/api/mcp --header "Authorization: Bearer dsp_your_project_key"
```

This stdio server also accepts a project key in `DEVSHOT_API_KEY` and then
exposes exactly the tools the hosted endpoint lists for that project (it
forwards `tools/list` and `tools/call`).

## Configuration

- `DEVSHOT_API_KEY`: required DevShot API key — an account key (`ds_...`) for the full API below, or a project key (`dsp_...`) for one Studio project
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
