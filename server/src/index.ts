import axios from 'axios';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { REST } from 'suitereact';

import nsOauth from './ns-oauth.js';
import nsReactApi from './routes/nsReactApi.js';

dotenv.config();
const app = express();
const host = process.env.SUITEREACT_PROXY_HOST || '127.0.0.1';
const port = Number(process.env.SUITEREACT_PROXY_PORT || 3001);
const proxyToken = process.env.SUITEREACT_PROXY_TOKEN || '';
const allowedOrigins = new Set(
  (
    process.env.SUITEREACT_ALLOWED_ORIGINS ||
    'http://127.0.0.1:5173,http://localhost:5173'
  )
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

if (host !== '127.0.0.1' && host !== '::1') {
  throw new Error('SUITEREACT_PROXY_HOST must be 127.0.0.1 or ::1');
}

if (proxyToken.length < 24) {
  throw new Error(
    'SUITEREACT_PROXY_TOKEN must be configured with at least 24 characters'
  );
}

function tokensMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

const requestCounts = new Map<string, { count: number; resetAt: number }>();
function enforceRateLimit(req: Request, res: Response, next: () => void) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'local';
  const current = requestCounts.get(key);
  const windowState =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + 60_000 }
      : current;
  windowState.count += 1;
  requestCounts.set(key, windowState);
  if (windowState.count > 120) {
    res.status(429).json({ error: 'Too many proxy requests' });
    return;
  }
  next();
}

app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by the local proxy'));
    },
    allowedHeaders: ['Content-Type', 'X-SuiteReact-Proxy-Token'],
    exposedHeaders: ['Content-Range'],
  })
);

app.use(express.json({ limit: process.env.SUITEREACT_BODY_LIMIT || '1mb' }));

if (process.env.NODE_ENV === 'development') {
  // @ts-ignore
  global.REST = REST;
  axios.interceptors.request.use(req => {
    if (!req.headers) {
      req.headers = {} as any;
    }
    if (req.url?.includes('restlet')) {
      req.headers['Authorization'] = nsOauth(req);
    }
    return req;
  });
}

// Mount routes
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    service: 'suitereact-proxy',
    status: 'ok',
    allowedOrigins: [...allowedOrigins],
  });
});
app.use('/api', enforceRateLimit);
app.use('/api', (req: Request, res: Response, next: () => void) => {
  const actual = req.get('X-SuiteReact-Proxy-Token') || '';
  if (!tokensMatch(actual, proxyToken)) {
    res.status(401).json({ error: 'Invalid or missing proxy token' });
    return;
  }
  next();
});
app.use('/api', nsReactApi);

app.use((err: any, req: Request, res: Response, next: any) => {
  void req;
  void next;
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, host, () => {
  const urlHost = host === '::1' ? '[::1]' : host;
  console.warn(`Proxy server listening on http://${urlHost}:${port}`);
});
