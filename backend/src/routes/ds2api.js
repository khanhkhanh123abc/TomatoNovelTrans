const express = require('express');
const config = require('../config');

const router = express.Router();

const ALLOWED_PATHS = new Set(['/v1/chat/completions', '/chat/completions', '/v1/models']);

function ds2apiUrl(req) {
  const incoming = new URL(req.originalUrl, 'http://localhost');
  const upstreamPath = incoming.pathname.replace(/^\/api\/ds2api/, '') || '/';
  if (
    !ALLOWED_PATHS.has(upstreamPath) &&
    !upstreamPath.startsWith('/v1/models/')
  ) {
    const err = new Error('DS2API route is not exposed');
    err.status = 404;
    throw err;
  }

  const base = config.DS2API_BASE_URL.replace(/\/+$/, '');
  const target = new URL(base + upstreamPath);
  target.search = incoming.search;
  return target;
}

router.all('*', async (req, res, next) => {
  try {
    const target = ds2apiUrl(req);
    const headers = { 'Content-Type': 'application/json' };
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const body = await upstream.text();
    res.status(upstream.status).type(contentType).send(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
