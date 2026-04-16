# OpusMax Local Proxy Gateway

A lightweight local proxy that lets you use **OpusMax** as the backend for Claude integrations in Microsoft Office (Word, Excel, PowerPoint) and any other Claude-compatible tool — without needing an official Anthropic API subscription.

## How It Works

```
Claude Add-in (Word/Excel/PowerPoint)
    → localhost:8080  (this proxy)
    → OpusMax API     (your OpusMax account)
```

The proxy translates standard Claude API requests into OpusMax format with proper authentication — no code changes needed on the Office side.

## Why Use This?

- **No Anthropic subscription needed** — Use your existing OpusMax account
- **Office Claude Add-ins** — Works with any add-in that supports custom API endpoints
- **Stream responses** — Real-time streaming for a native chat experience
- **Multi-model support** — Switch between Opus 4.6, Sonnet 4.5, and Haiku 4.5
- **Local testing** — Develop and test Claude integrations without touching production APIs

## Use Case: Claude in Microsoft Office Without a Copilot License

Microsoft 365 Copilot requires a **$30/user/month** license. But if you have an OpusMax account (which costs a fraction of that), you can get similar AI assistance in Word, Excel, and PowerPoint using third-party Claude add-ins.

With this proxy:

1. You write a document in Word or build a spreadsheet in Excel
2. A Claude add-in sends your request to `http://localhost:8080`
3. The proxy forwards it to OpusMax using your account
4. You get Claude's AI capabilities directly in your Office documents

This is ideal for:
- Writers who want AI drafting and editing in Word
- Analysts who want AI-powered formulas and insights in Excel
- Presenters who want AI-generated slides in PowerPoint
- Anyone with an OpusMax account who wants Claude in Office without paying for Copilot

## Install

```bash
npm install -g opusmax-proxy
```

That's it — no cloning, no manual config files.

## Setup

On first run, the CLI will prompt you for your OpusMax credentials:

```bash
opusmax-proxy
```

```
OpusMax Base URL [https://api.opusmax.pro]:
OpusMax API Key: your-api-key-here
Local Port [8080]:

Config saved to: ~/.opusmax-proxy/config.json
```

Your credentials are stored locally in `~/.opusmax-proxy/config.json` and never shared.

## Usage

```bash
opusmax-proxy           # Start proxy (uses saved config)
opusmax-proxy -c       # Reconfigure (change API key or URL)
opusmax-proxy --port N  # Override port
opusmax-proxy -h       # Show help
```

## Configure Your Office Add-in

Each Claude add-in for Office has settings to point to a custom API. Configure it to use:

- **Gateway URL:** `http://localhost:8080`
- **Token/Key:** Leave blank (auth is handled server-side)
- **API Format:** `anthropic` (for Claude Messages API)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/` | GET | Service info |
| `/v1/models` | GET | List available models |
| `/v1/models/info` | GET | Model details by tier |
| `/v1/messages` | POST | Anthropic format (streaming supported) |
| `/v1/chat/completions` | POST | OpenAI format (streaming supported) |

## Health Check

```bash
curl http://localhost:8080/health
```

## Stop

```bash
Ctrl+C
```

## Requirements

- Node.js 18+
- OpusMax account with API access
- Claude add-in for Office that supports custom endpoints

## Notes

- Your API key is stored locally in `~/.opusmax-proxy/config.json` and never shared
- The proxy runs entirely on your machine
- Streaming must be enabled in your add-in settings for real-time responses
