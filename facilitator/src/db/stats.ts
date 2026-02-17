/**
 * Audit logging and statistics for upto payments.
 */

import type Database from "better-sqlite3";

export type PaymentRecord = {
  payer: string;
  recipient: string;
  token: string;
  authorized_amount: string;
  settled_amount?: string;
  nonce: string;
  tx_hash?: string;
  status: "verified" | "settled" | "failed";
  network: string;
};

export function recordVerification(db: Database.Database, record: PaymentRecord) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO payments (payer, recipient, token, authorized_amount, nonce, status, network)
    VALUES (?, ?, ?, ?, ?, 'verified', ?)
  `);
  stmt.run(
    record.payer,
    record.recipient,
    record.token,
    record.authorized_amount,
    record.nonce,
    record.network,
  );
}

export function recordSettlement(
  db: Database.Database,
  nonce: string,
  settledAmount: string,
  txHash: string,
) {
  const stmt = db.prepare(`
    UPDATE payments
    SET settled_amount = ?, tx_hash = ?, status = 'settled', settled_at = datetime('now')
    WHERE nonce = ?
  `);
  stmt.run(settledAmount, txHash, nonce);
}

export function recordFailure(db: Database.Database, nonce: string, error: string) {
  const stmt = db.prepare(`
    UPDATE payments
    SET status = 'failed', settled_amount = ?
    WHERE nonce = ?
  `);
  stmt.run(error, nonce);
}

export function getStats(db: Database.Database) {
  const total = db.prepare("SELECT COUNT(*) as count FROM payments").get() as { count: number };
  const settled = db
    .prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'settled'")
    .get() as { count: number };
  const totalAuthorized = db
    .prepare("SELECT COALESCE(SUM(CAST(authorized_amount AS INTEGER)), 0) as total FROM payments")
    .get() as { total: number };
  const totalSettled = db
    .prepare(
      "SELECT COALESCE(SUM(CAST(settled_amount AS INTEGER)), 0) as total FROM payments WHERE status = 'settled'",
    )
    .get() as { total: number };

  return {
    totalPayments: total.count,
    settledPayments: settled.count,
    totalAuthorized: totalAuthorized.total.toString(),
    totalSettled: totalSettled.total.toString(),
    savingsPercent:
      totalAuthorized.total > 0
        ? Math.round((1 - totalSettled.total / totalAuthorized.total) * 100)
        : 0,
  };
}
