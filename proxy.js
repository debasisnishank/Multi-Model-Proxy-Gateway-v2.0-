/**
 * OpusMax Multi-Model Local Proxy Gateway v2.0
 *
 * Supports all Claude models with streaming and non-streaming modes.
 * Configure once, use across all Claude-compatible tools.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();

// ============================================================
// CONFIGURATION — Set in .env file
// ============================================================

const OPUSMAX_API_KEY = process.env.OPUSMAX_API_KEY;
const OPUSMAX_BASE = process.env.OPUSMAX_BASE || 'https://api.opusmax.pro';
const PORT = parseInt(process.env.PORT, 10) || 8080;

// Validate required config
if (!OPUSMAX_API_KEY) {
  console.error('❌ OPUSMAX_API_KEY is required. Set it in your .env file.');
  process.exit(1);
}

// Default model when none specified
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241014';

// All available Claude models
const AVAILABLE_MODELS = [
  // Opus 4.6 — Most capable, for complex reasoning
  { id: 'opus-4-6', name: 'Claude Opus 4.6', tier: 'opus', description: 'Most intelligent, slow thinking' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (alt)', tier: 'opus', description: 'Most intelligent, slow thinking' },

  // Sonnet 4.5 — Balanced, best for most tasks
  { id: 'claude-3-5-sonnet-20241014', name: 'Claude Sonnet 4.5', tier: 'sonnet', description: 'Balanced, best for most tasks' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (alias)', tier: 'sonnet', description: 'Balanced, best for most tasks' },
  { id: 'sonnet-4.5', name: 'Claude Sonnet 4.5 (short)', tier: 'sonnet', description: 'Balanced, best for most tasks' },

  // Haiku 4.5 — Fastest, for quick tasks
  { id: 'claude-3-5-haiku-20241007', name: 'Claude Haiku 3.5', tier: 'haiku', description: 'Fastest, for quick tasks' },
  { id: 'haiku-4.5', name: 'Claude Haiku 4.5', tier: 'haiku', description: 'Fastest, newest model' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (alt)', tier: 'haiku', description: 'Fastest, newest model' },
];

// Model alias mapping — normalize any model ID to actual API model
const MODEL_ALIAS_MAP = {
  'opus-4-6': 'opus-4-6',
  'claude-opus-4-6': 'opus-4-6',
  'claude-3-5-sonnet-20241014': 'claude-3-5-sonnet-20241014',
  'claude-sonnet-4-5': 'claude-3-5-sonnet-20241014',
  'sonnet-4.5': 'claude-3-5-sonnet-20241014',
  'claude-3-5-haiku-20241007': 'claude-3-5-haiku-20241007',
  'haiku-4.5': 'haiku-4.5',
  'claude-haiku-4-5': 'haiku-4.5',
};

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================================
// LOGGING
// ============================================================
let requestCount = 0;
function log(type, msg, data) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 8);
  const icon = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'in' ? '📥' : type === 'out' ? '📤' : '✅';
  console.log(`${icon} [${ts}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`);
}

// ============================================================
// UTILITIES
// ============================================================
function resolveModel(inputModel) {
  if (!inputModel) return DEFAULT_MODEL;
  const normalized = MODEL_ALIAS_MAP[inputModel];
  return normalized || inputModel;
}

function isModelAvailable(modelId) {
  return AVAILABLE_MODELS.some(m => m.id === modelId);
}

// ============================================================
// HEALTH + INFO
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'OpusMax Multi-Model Proxy v2.0',
    version: '2.0.0',
    target: OPUSMAX_BASE,
    uptime: process.uptime(),
    requests: requestCount,
    models: AVAILABLE_MODELS.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'OpusMax Multi-Model Proxy v2.0',
    version: '2.0.0',
    target: OPUSMAX_BASE,
    endpoints: {
      health: 'GET /health',
      messages: 'POST /v1/messages',
      completions: 'POST /v1/chat/completions',
      models: 'GET /v1/models',
      modelsInfo: 'GET /v1/models/info'
    },
    models: AVAILABLE_MODELS,
    defaultModel: DEFAULT_MODEL
  });
});

// ============================================================
// MODEL LIST (for tool dropdowns)
// ============================================================
app.get('/v1/models', (req, res) => {
  const data = AVAILABLE_MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1733650800,
    owned_by: 'OpusMax/Anthropic',
    description: m.description
  }));

  // Also include raw API response models
  const rawModels = [
    'opus-4-6', 'claude-opus-4-6',
    'claude-3-5-sonnet-20241014', 'claude-sonnet-4-5', 'sonnet-4.5',
    'claude-3-5-haiku-20241007', 'haiku-4.5', 'claude-haiku-4-5',
  ].filter(id => !data.find(m => m.id === id)).map(id => ({
    id,
    object: 'model',
    created: 1733650800,
    owned_by: 'OpusMax/Anthropic'
  }));

  res.json({ object: 'list', data: [...data, ...rawModels] });
});

app.get('/v1/models/info', (req, res) => {
  res.json({
    default: DEFAULT_MODEL,
    available: AVAILABLE_MODELS,
    byTier: {
      opus: AVAILABLE_MODELS.filter(m => m.tier === 'opus'),
      sonnet: AVAILABLE_MODELS.filter(m => m.tier === 'sonnet'),
      haiku: AVAILABLE_MODELS.filter(m => m.tier === 'haiku'),
    }
  });
});

// ============================================================
// MAIN: POST /v1/messages (Anthropic format — with STREAMING)
// ============================================================
app.post('/v1/messages', async (req, res) => {
  requestCount++;
  const requestBody = req.body;
  const model = resolveModel(requestBody.model);
  const isStreaming = requestBody.stream === true;

  log('in', 'POST /v1/messages', {
    model,
    stream: isStreaming,
    messages: requestBody.messages?.length || 0
  });

  // Validate
  if (!requestBody || !requestBody.messages) {
    return res.status(400).json({
      error: { type: 'invalid_request_error', message: 'Missing required field: messages' }
    });
  }

  // Build OpusMax request
  const opusmaxBody = {
    model: model,
    messages: requestBody.messages,
    max_tokens: requestBody.max_tokens || 4096,
    stream: isStreaming,
    temperature: requestBody.temperature,
    top_p: requestBody.top_p,
    top_k: requestBody.top_k,
    system: requestBody.system,
    stop_sequences: requestBody.stop_sequences,
    tools: requestBody.tools,
    tool_choice: requestBody.tool_choice,
  };

  // Remove undefined
  Object.keys(opusmaxBody).forEach(k =>
    opusmaxBody[k] === undefined && delete opusmaxBody[k]
  );

  // ============================================================
  // STREAMING MODE
  // ============================================================
  if (isStreaming) {
    try {
      const response = await fetch(`${OPUSMAX_BASE}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': OPUSMAX_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(opusmaxBody)
      });

      if (!response.ok) {
        const err = await response.json();
        log('error', 'OpusMax streaming error', { status: response.status });
        return res.status(response.status).json(err);
      }

      // Stream OpusMax response directly to client
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.flushHeaders();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Send chunks as they arrive
        res.write(buffer);
        buffer = '';
      }

      res.end();
      log('out', 'Streaming complete', { model });
      return;
    } catch (error) {
      log('error', 'Streaming failed', { message: error.message });
      if (!res.headersSent) {
        return res.status(502).json({ error: { type: 'proxy_error', message: error.message } });
      }
      return;
    }
  }

  // ============================================================
  // NON-STREAMING MODE
  // ============================================================
  try {
    const startTime = Date.now();

    const response = await fetch(`${OPUSMAX_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': OPUSMAX_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(opusmaxBody)
    });

    const data = await response.json();
    const latency = Date.now() - startTime;

    if (!response.ok) {
      log('error', 'OpusMax error', { status: response.status, data });
      return res.status(response.status).json(data);
    }

    log('out', 'Response ready', {
      model: data.model,
      latency: `${latency}ms`,
      tokens: data.usage?.output_tokens || '?',
      stopReason: data.stop_reason
    });

    return res.status(200).json(data);
  } catch (error) {
    log('error', 'Request failed', { message: error.message });
    return res.status(502).json({
      error: { type: 'proxy_error', message: `Failed to reach OpusMax: ${error.message}` }
    });
  }
});

// ============================================================
// POST /v1/chat/completions (OpenAI format)
// ============================================================
app.post('/v1/chat/completions', async (req, res) => {
  requestCount++;
  const requestBody = req.body;
  const model = resolveModel(requestBody.model);
  const isStreaming = requestBody.stream === true;

  log('in', 'POST /v1/chat/completions', { model, stream: isStreaming });

  if (!requestBody || !requestBody.messages) {
    return res.status(400).json({ error: { message: 'Missing required field: messages' } });
  }

  // Convert OpenAI → Anthropic format
  let systemPrompt = '';
  const anthropicMessages = [];

  for (const msg of requestBody.messages) {
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
    } else {
      anthropicMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : msg.role,
        content: msg.content
      });
    }
  }

  const opusmaxBody = {
    model: model,
    messages: anthropicMessages,
    max_tokens: requestBody.max_tokens || 4096,
    stream: isStreaming,
    temperature: requestBody.temperature,
    top_p: requestBody.top_p,
    system: systemPrompt || undefined,
  };

  Object.keys(opusmaxBody).forEach(k =>
    opusmaxBody[k] === undefined && delete opusmaxBody[k]
  );

  // ============================================================
  // STREAMING
  // ============================================================
  if (isStreaming) {
    try {
      const response = await fetch(`${OPUSMAX_BASE}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': OPUSMAX_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(opusmaxBody)
      });

      if (!response.ok) {
        const err = await response.json();
        return res.status(response.status).json(err);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // Convert Anthropic SSE → OpenAI chat completions format
        // Anthropic sends: data: {"type":"content_block_delta","..."}
        // We convert to: data: {"choices":[{"delta":{"content":"..."}}]}
        if (chunk.trim()) {
          try {
            // Parse the Anthropic event
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr === '[DONE]') {
                  res.write('data: [DONE]\n\n');
                  continue;
                }
                const event = JSON.parse(jsonStr);

                if (event.type === 'content_block_delta') {
                  if (event.delta?.type === 'text_delta') {
                    const openAIChunk = JSON.stringify({
                      id: event.id || 'chatcmpl',
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: model,
                      choices: [{
                        index: 0,
                        delta: { content: event.delta.text },
                        finish_reason: null
                      }]
                    });
                    res.write(`data: ${openAIChunk}\n\n`);
                  }
                }
              }
            }
          } catch (e) {
            // Non-JSON chunk — forward as-is
            res.write(chunk);
          }
        }
      }

      // Send final chunk
      const finalChunk = JSON.stringify({
        id: 'chatcmpl-finish',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      });
      res.write(`data: ${finalChunk}\n\n`);
      res.end();
      return;
    } catch (error) {
      if (!res.headersSent) {
        return res.status(502).json({ error: { message: error.message } });
      }
      return;
    }
  }

  // ============================================================
  // NON-STREAMING
  // ============================================================
  try {
    const response = await fetch(`${OPUSMAX_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': OPUSMAX_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(opusmaxBody)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Convert Anthropic → OpenAI format
    const textContent = data.content?.find(c => c.type === 'text')?.text || '';
    const openAIResponse = {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: textContent },
        finish_reason: data.stop_reason === 'end_turn' ? 'stop' : data.stop_reason
      }],
      usage: data.usage
    };

    log('out', 'OpenAI format response', { latency: 'ok' });
    return res.status(200).json(openAIResponse);
  } catch (error) {
    log('error', 'Request failed', { message: error.message });
    return res.status(502).json({ error: { message: error.message } });
  }
});

// ============================================================
// MODEL INFO
// ============================================================
app.post('/v1/models/info', async (req, res) => {
  // Some tools POST to /v1/models/info
  return res.json({
    default: DEFAULT_MODEL,
    available: AVAILABLE_MODELS
  });
});

// ============================================================
// CATCH-ALL
// ============================================================
app.all('/v1/:path(*)', (req, res) => {
  const path = req.params.path;
  log('warn', `Unhandled: ${req.method} /v1/${path}`);
  res.status(501).json({
    error: { type: 'proxy_error', message: `Endpoint /v1/${path} not implemented` }
  });
});

// ============================================================
// START
// ============================================================
console.clear();
console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║       OpusMax Multi-Model Proxy Gateway v2.0         ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log(`║  Local:    http://localhost:${PORT}                          ║`);
console.log(`║  Target:   ${OPUSMAX_BASE}                      ║`);
console.log('╠══════════════════════════════════════════════════════════╣');
console.log('║  Available Models:                                     ║');
console.log('║    🤖 Opus 4.6   — Most capable, complex reasoning       ║');
console.log('║    ⚡ Sonnet 4.5 — Balanced, best for most tasks        ║');
console.log('║    🚀 Haiku 4.5  — Fastest, quick responses            ║');
console.log('║  Default:         claud-3-5-sonnet-20241014              ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log('║  Endpoints:                                             ║');
console.log('║    GET  /health           — Health check               ║');
console.log('║    GET  /v1/models        — Model list                ║');
console.log('║    POST /v1/messages      — Anthropic (with streaming)  ║');
console.log('║    POST /v1/chat/completions — OpenAI (with streaming) ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log('║  Claude for Office settings:                            ║');
console.log(`║    Gateway URL:   http://localhost:${PORT}                    ║`);
console.log('║    Token:        (leave blank)                        ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

const server = app.listen(PORT, () => {
  console.log('🚀 Proxy ready. Configure Claude for Office to use:');
  console.log(`   http://localhost:${PORT}`);
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  server.close(() => { process.exit(0); });
});
