# OpusMax Local Proxy Server

A lightweight local gateway that translates requests from Claude-compatible tools
and forwards them to OpusMax with the correct headers and body format.

## How it works

Claude for Office (or any Claude-compatible tool)
    → localhost:8080/v1/messages (this proxy)
    → OpusMax api.opusmax.pro/v1/messages (with correct auth)

## Setup

1. Install dependencies:
   npm install

2. Configure your OpusMax API key:
   - Edit proxy.js and replace OPUSMAX_API_KEY with your key
   - Or set environment variable: export OPUSMAX_API_KEY="sk-ant-opm-..."

3. Start the server:
   node proxy.js

4. The proxy runs at:
   http://localhost:8080/v1/messages

## Claude for Office Settings

Gateway URL:  http://localhost:8080
Token:        (leave blank, or any dummy value - auth is handled server-side)
Auth Header:  (leave blank)
API Format:   anthropic

## Health Check

curl http://localhost:8080/health

## Stop

Ctrl+C
