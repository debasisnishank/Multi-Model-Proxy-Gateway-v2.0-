#!/usr/bin/env node
/**
 * OpusMax Proxy CLI
 *
 * Interactive setup and launch of the OpusMax proxy.
 * First run: prompts for base URL and API key, saves to ~/.opusmax-proxy/config.json
 * Subsequent runs: uses saved config or prompts to update
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.opusmax-proxy');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_BASE = 'https://api.opusmax.pro';
const DEFAULT_PORT = 8080;

// ============================================================
// CONFIG MANAGEMENT
// ============================================================
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`\nConfig saved to: ${CONFIG_FILE}`);
}

// ============================================================
// INTERACTIVE INPUT
// ============================================================
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function question(rl, q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function askBaseUrl(rl, current) {
  const answer = await question(rl, `OpusMax Base URL [${current || DEFAULT_BASE}]: `);
  return (answer.trim() || current || DEFAULT_BASE).trim();
}

async function askApiKey(rl, current) {
  const answer = await question(rl, `OpusMax API Key${current ? ' (leave empty to keep current)' : ''}: `);
  return answer.trim();
}


async function setup() {
  const rl = createInterface();
  rl.write('\n╔══════════════════════════════════════════════════════════╗\n');
  rl.write('║        OpusMax Proxy — First-Time Setup                 ║\n');
  rl.write('╠══════════════════════════════════════════════════════════╣\n');
  rl.write('║  This will configure your OpusMax proxy.                ║\n');
  rl.write('║  Your credentials are stored locally (~/.opusmax-proxy) ║\n');
  rl.write('╚══════════════════════════════════════════════════════════╝\n\n');

  const current = loadConfig();

  const baseUrl = await askBaseUrl(rl, current?.baseUrl);
  const apiKey = await askApiKey(rl, current?.apiKey);
  const port = await askPort(rl, current?.port);

  rl.close();

  if (!apiKey) {
    console.error('\n❌ API key is required. Setup cancelled.');
    process.exit(1);
  }

  const config = { baseUrl, apiKey, port };
  saveConfig(config);

  return config;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const args = process.argv.slice(2);

  // Handle --configure flag
  if (args.includes('--configure') || args.includes('-c')) {
    await setup();
    return;
  }

  // Handle --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║              OpusMax Proxy CLI Help                     ║
╠══════════════════════════════════════════════════════════╣
║  opusmax-proxy           Start proxy (uses saved config) ║
║  opusmax-proxy -c       Reconfigure (change API key)    ║
║  opusmax-proxy -h       Show this help                  ║
║  opusmax-proxy --port N  Override port                  ║
╚══════════════════════════════════════════════════════════╝
    `);
    return;
  }

  // Parse port override
  let portOverride = null;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    portOverride = parseInt(args[portIdx + 1], 10);
  }

  // Load or prompt for config
  let config = loadConfig();
  if (!config || !config.apiKey) {
    config = await setup();
  }

  // Merge with overrides
  const finalConfig = {
    ...config,
    port: portOverride || config.port || DEFAULT_PORT
  };

  // Write runtime config (for proxy.js to pick up)
  const runtimeConfig = `OPUSMAX_BASE=${finalConfig.baseUrl}\nOPUSMAX_API_KEY=${finalConfig.apiKey}\nPORT=${finalConfig.port}\n`;
  process.env.OPUSMAX_BASE = finalConfig.baseUrl;
  process.env.OPUSMAX_API_KEY = finalConfig.apiKey;
  process.env.PORT = finalConfig.port;

  // Spawn proxy
  const proxyPath = path.join(__dirname, 'proxy.js');
  const proxy = spawn('node', [proxyPath], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  proxy.on('exit', (code) => {
    process.exit(code);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
