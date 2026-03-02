const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, 'data', 'events.db');
const PIXEL_BUFFER = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.prepare(`
  CREATE TABLE IF NOT EXISTS raw_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    session_id TEXT,
    user_id TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS enriched_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_event_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    session_id TEXT,
    user_id TEXT,
    payload TEXT NOT NULL,
    user_email TEXT,
    loyalty_status TEXT,
    country TEXT,
    created_at TEXT NOT NULL,
    enriched_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(raw_event_id) REFERENCES raw_events(id)
  )
`).run();

app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const ALLOWED_EVENTS = new Set(['page_view', 'add_to_cart', 'checkout', 'purchase']);

const insertRawEvent = db.prepare(`
  INSERT INTO raw_events (event_type, session_id, user_id, payload)
  VALUES (@event_type, @session_id, @user_id, @payload)
`);

function persistEvent({ eventType, sessionId, userId, payload }) {
  if (!eventType || !ALLOWED_EVENTS.has(eventType)) {
    throw new Error('eventType must be page_view, add_to_cart, checkout, or purchase');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('payload is required (object)');
  }

  const record = {
    event_type: eventType,
    session_id: sessionId ?? null,
    user_id: userId ?? null,
    payload: JSON.stringify(payload)
  };

  const result = insertRawEvent.run(record);
  return result.lastInsertRowid;
}

app.get('/collect-pixel', (req, res) => {
  try {
    const parsedPayload = req.query.payload ? JSON.parse(req.query.payload) : null;
    persistEvent({
      eventType: req.query.eventType,
      sessionId: req.query.sessionId,
      userId: req.query.userId,
      payload: parsedPayload
    });
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(PIXEL_BUFFER);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/events/raw', (_req, res) => {
  const rows = db
    .prepare('SELECT id, event_type, session_id, user_id, payload, created_at FROM raw_events ORDER BY created_at DESC LIMIT 50')
    .all();

  const parsedRows = rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
  res.json(parsedRows);
});

app.get('/events/enriched', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM enriched_events ORDER BY enriched_at DESC LIMIT 50')
    .all();

  const parsedRows = rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
  res.json(parsedRows);
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Local MarTech test server running at http://localhost:${PORT}`);
});
