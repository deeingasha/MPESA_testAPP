// For Render/Production - use PostgreSQL
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      checkout_request_id TEXT UNIQUE NOT NULL,
      merchant_request_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      mpesa_receipt_number TEXT,
      result_code INTEGER,
      result_desc TEXT,
      failure_reason TEXT,
      transaction_date TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP
    )
  `);
  console.log('✓ Database initialized');
}

initDatabase();

const dbHelpers = {
  createTransaction: async (data) => {
    const query = `
      INSERT INTO transactions (checkout_request_id, merchant_request_id, phone_number, amount, status)
      VALUES ($1, $2, $3, $4, 'PENDING') RETURNING *
    `;
    const result = await pool.query(query, [
      data.checkoutRequestId,
      data.merchantRequestId,
      data.phoneNumber,
      data.amount
    ]);
    return result.rows[0];
  },

  updateTransaction: async (checkoutRequestId, updates) => {
    const query = `
      UPDATE transactions
      SET status = $1, mpesa_receipt_number = $2, result_code = $3,
          result_desc = $4, failure_reason = $5, transaction_date = $6,
          updated_at = NOW()
      WHERE checkout_request_id = $7
      RETURNING *
    `;
    const result = await pool.query(query, [
      updates.status,
      updates.mpesaReceiptNumber,
      updates.resultCode,
      updates.resultDesc,
      updates.failureReason,
      updates.transactionDate,
      checkoutRequestId
    ]);
    return result.rows[0];
  },

  getTransaction: async (checkoutRequestId) => {
    const result = await pool.query(
      'SELECT * FROM transactions WHERE checkout_request_id = $1',
      [checkoutRequestId]
    );
    return result.rows[0];
  },

  getAllTransactions: async () => {
    const result = await pool.query(
      'SELECT * FROM transactions ORDER BY created_at DESC'
    );
    return result.rows;
  }
};

module.exports = { dbHelpers };