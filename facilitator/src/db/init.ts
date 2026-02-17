/**
 * SQLite audit database for tracking upto payment authorizations and settlements.
 */

import Database from "better-sqlite3";

export function initDb(path = "facilitator.db"): Database.Database {
  const db = new Database(path);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payer TEXT NOT NULL,
      recipient TEXT NOT NULL,
      token TEXT NOT NULL,
      authorized_amount TEXT NOT NULL,
      settled_amount TEXT,
      nonce TEXT NOT NULL UNIQUE,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'verified',
      network TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      settled_at TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_nonce ON payments(nonce);
  `);

  return db;
}
