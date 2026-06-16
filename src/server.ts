import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);

interface ChatBody {
  message: string;
  sessionId?: string;
  model?: string;
}

const app = createApp();

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

function sendEvent(res: ServerResponse, event: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: ChatBody;
  try {
    body = await readJsonBody<ChatBody>(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!body.message?.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'message is required' }));
    return;
  }

  let session = body.sessionId ? app.sessionManager.get(body.sessionId) : undefined;
  if (!session) session = app.sessionManager.create();

  sseHeaders(res);

  try {
    await app.agent.run(session.id, body.message, {
      model: body.model,
      onTextDelta: (text) => sendEvent(res, { type: 'text_delta', content: text }),
      onToolCall: (name) => sendEvent(res, { type: 'tool_call', name }),
    });
    res.write('data: [DONE]\n\n');
  } catch (err) {
    sendEvent(res, { type: 'error', message: (err as Error).message });
    res.write('data: [DONE]\n\n');
  } finally {
    res.end();
  }
}

async function handleSession(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = app.sessionManager.create();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ sessionId: session.id }));
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = createServer((req, res) => {
  if (!req.url) return notFound(res);

  // CORS headers for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/chat') {
    void handleChat(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/session') {
    void handleSession(req, res);
    return;
  }

  // List sessions
  if (req.method === 'GET' && req.url === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: app.sessionManager.list(30) }));
    return;
  }

  // Delete a session
  const deleteMatch = req.url.match(/^\/api\/session\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    const sessionId = deleteMatch[1];
    app.sessionManager.delete(sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Get display messages for a session
  const messagesMatch = req.url.match(/^\/api\/session\/([^/]+)\/messages$/);
  if (req.method === 'GET' && messagesMatch) {
    const sessionId = messagesMatch[1];
    const messages = app.sessionManager.getDisplayMessages(sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages }));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, providers: app.queryEngine.listProviders() }));
    return;
  }
  notFound(res);
});

server.listen(PORT, () => {
  console.log(`OfferPilot HTTP backend listening on http://localhost:${PORT}`);
  console.log(`Providers: ${app.queryEngine.listProviders().join(', ')}`);
});
