const sqlite3 = require('sqlite3').verbose();
const path = require('path');

/**
 * DATABASE SETUP
 * 
 * We're using SQLite for simplicity - it's a file-based database that doesn't
 * require a separate server. Perfect for learning/testing.
 * 
 * For production, you'd use PostgreSQL, MySQL, or MongoDB.
 */

const dbPath = path.join(__dirname, 'mpesa_transactions.db');
const db = new sqlite3.Database(dbPath);

/**
 * Initialize the database schema
 * 
 * This creates a table to store M-Pesa transaction records.
 * Each STK Push request creates a record here that gets updated when the callback arrives.
 */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Unique ID from M-Pesa that identifies this specific STK push request
      -- This is what we use to match the callback to the original request
      checkout_request_id TEXT UNIQUE NOT NULL,
      
      -- Another unique ID from M-Pesa (less commonly used but good to store)
      merchant_request_id TEXT NOT NULL,
      
      -- Customer's phone number (in 254XXXXXXXXX format)
      phone_number TEXT NOT NULL,
      
      -- Amount in KES
      amount REAL NOT NULL,
      
      -- Current status of the transaction
      -- Possible values: PENDING, SUCCESS, FAILED
      status TEXT NOT NULL DEFAULT 'PENDING',
      
      -- M-Pesa receipt number (only available after successful payment)
      -- This is the confirmation code customer sees on their phone
      -- Example: NLJ7RT61SV
      mpesa_receipt_number TEXT,
      
      -- Result code from M-Pesa callback
      -- 0 = Success
      -- 1032 = Cancelled by user
      -- 1037 = Timeout (user didn't respond)
      -- 1 = Insufficient balance
      result_code INTEGER,
      
      -- Human-readable description of the result
      result_desc TEXT,
      
      -- If payment failed, this stores the reason
      failure_reason TEXT,
      
      -- When M-Pesa processed the transaction (from callback)
      transaction_date TEXT,
      
      -- When we created this record (when STK push was initiated)
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      
      -- When this record was last updated (when callback was received)
      updated_at TEXT
    )
  `);
  
  console.log('✓ Database initialized');
});

/**
 * Database helper functions
 * These make it easier to work with the database using Promises instead of callbacks
 */

const dbHelpers = {
  /**
   * Insert a new transaction record when STK push is initiated
   */
  createTransaction(data) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO transactions (
          checkout_request_id,
          merchant_request_id,
          phone_number,
          amount,
          status
        ) VALUES (?, ?, ?, ?, ?)
      `;
      
      db.run(
        query,
        [
          data.checkoutRequestId,
          data.merchantRequestId,
          data.phoneNumber,
          data.amount,
          'PENDING'
        ],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...data });
        }
      );
    });
  },

  /**
   * Update transaction when callback is received from M-Pesa
   */
  updateTransaction(checkoutRequestId, updates) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE transactions
        SET status = ?,
            mpesa_receipt_number = ?,
            result_code = ?,
            result_desc = ?,
            failure_reason = ?,
            transaction_date = ?,
            updated_at = datetime('now')
        WHERE checkout_request_id = ?
      `;
      
      db.run(
        query,
        [
          updates.status,
          updates.mpesaReceiptNumber,
          updates.resultCode,
          updates.resultDesc,
          updates.failureReason,
          updates.transactionDate,
          checkoutRequestId
        ],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  /**
   * Get transaction by checkout request ID
   * This is used by the frontend to poll for transaction status
   */
  getTransaction(checkoutRequestId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM transactions WHERE checkout_request_id = ?',
        [checkoutRequestId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  },

  /**
   * Get all transactions (for admin view)
   */
  getAllTransactions() {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM transactions ORDER BY created_at DESC',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
};

module.exports = { db, dbHelpers };
