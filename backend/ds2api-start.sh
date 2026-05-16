#!/bin/sh
set -eu

CONFIG_PATH="${DS2API_CONFIG_PATH:-/data/ds2api/config.json}"
export CONFIG_PATH

node <<'NODE'
const fs = require('fs');
const path = require('path');

const configPath = process.env.CONFIG_PATH;

function parseConfig(raw, source) {
  if (!raw || !raw.trim()) return undefined;

  const trimmed = raw.trim();
  const candidates = [trimmed];
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    candidates.push(Buffer.from(trimmed, 'base64').toString('utf8'));
  }

  let lastError;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Cannot parse ${source}: ${lastError?.message || 'invalid JSON'}`);
}

function readExistingConfig() {
  if (!fs.existsSync(configPath)) return {};

  const raw = fs.readFileSync(configPath, 'utf8');
  if (!raw.trim()) return {};
  return parseConfig(raw, configPath) || {};
}

fs.mkdirSync(path.dirname(configPath), { recursive: true });

const fileConfig = readExistingConfig();
const envConfig = parseConfig(process.env.DS2API_CONFIG_JSON, 'DS2API_CONFIG_JSON');
const config = envConfig ? { ...fileConfig, ...envConfig } : fileConfig;

// DS2API can upload long/current user input as a file. This app sends novel
// text directly through chat completions, so file upload only adds a failing
// dependency and returns "upload current user input file" errors.
config.current_input_file = {
  ...(typeof config.current_input_file === 'object' && config.current_input_file !== null
    ? config.current_input_file
    : {}),
  enabled: false,
  min_chars: 100000000,
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
NODE

unset DS2API_CONFIG_JSON
exec /usr/local/bin/ds2api
