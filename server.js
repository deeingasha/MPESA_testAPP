require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { dbHelpers } = require('./database');
const mpesaService = require('./mpesaService');
const {adminPage} = require('./adminPage');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * HELPER: Get current time in EAT (East Africa Time)
 */
function getEATTime() {
  const now = new Date();
  const eatOffset = 3 * 60; // EAT is UTC+3
  const eatTime = new Date(now.getTime() + eatOffset * 60 * 1000);
  return eatTime.toISOString().replace('T', ' ').substring(0, 19) + ' EAT';
}

/**
 * MIDDLEWARE SETUP
 */

// Parse JSON request bodies
app.use(express.json());

// Enable CORS (allows frontend from any origin to call this API)
app.use(cors());

// Serve static files (our HTML/JS frontend)
app.use(express.static('public'));

// Log all incoming requests with EAT time
app.use((req, res, next) => {
  console.log(`${getEATTime()} - ${req.method} ${req.path}`);
  next();
});

/**
 * ROUTE 1: INITIATE STK PUSH
 * 
 * POST /api/mpesa/stkpush
 * 
 * This is called by your frontend when user clicks "Pay" button.
 * 
 * Flow:
 * 1. Receive phone number and amount from frontend
 * 2. Call M-Pesa API to initiate STK push
 * 3. M-Pesa sends STK prompt to user's phone
 * 4. Save transaction in database with PENDING status
 * 5. Return CheckoutRequestID to frontend
 * 6. Frontend uses CheckoutRequestID to poll for status
 * 
 * Request Body:
 * {
 *   "phoneNumber": "0712345678",
 *   "amount": "100"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "STK Push sent to phone",
 *   "checkoutRequestId": "ws_CO_...",
 *   ...
 * }
 */
app.post('/api/mpesa/stkpush', async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;

    // Validate input
    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and amount are required',
      });
    }

    if (amount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be at least 1 KES',
      });
    }

    console.log(`\n--- New STK Push Request ---`);
    console.log(`Phone: ${phoneNumber}`);
    console.log(`Amount: KES ${amount}`);

    // Call M-Pesa API to initiate STK push
    const mpesaResponse = await mpesaService.initiateSTKPush(phoneNumber, amount);

    // Save transaction to database with PENDING status
    // This will be updated later when callback is received
    await dbHelpers.createTransaction({
      checkoutRequestId: mpesaResponse.checkoutRequestId,
      merchantRequestId: mpesaResponse.merchantRequestId,
      phoneNumber: mpesaService.formatPhoneNumber(phoneNumber),
      amount: parseFloat(amount),
    });

    console.log(`✓ Transaction saved to database`);
    console.log(`--- End Request ---\n`);

    // Return success response to frontend
    res.json(mpesaResponse);

  } catch (error) {
    console.error('Error in /stkpush:', error.message);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate payment',
    });
  }
});

/**
 * ROUTE 2: M-PESA CALLBACK ENDPOINT
 * 
 * POST /api/mpesa/callback
 * 
 * This is called by M-Pesa (NOT your frontend) after user completes/cancels payment.
 * M-Pesa calls this 5-60 seconds after STK push was sent.
 * 
 * IMPORTANT REQUIREMENTS:
 * 1. Must be publicly accessible (use ngrok for local dev)
 * 2. Must use HTTPS (ngrok provides this automatically)
 * 3. Must respond with status 200 quickly
 * 4. Must be defined in MPESA_CALLBACK_URL env variable
 * 
 * Flow:
 * 1. M-Pesa posts transaction result to this endpoint
 * 2. We process the callback data
 * 3. We update the transaction in database
 * 4. We respond with 200 OK to acknowledge receipt
 * 5. Frontend polls /status endpoint to see updated status
 * 
 * M-Pesa sends JSON with this structure:
 * {
 *   "Body": {
 *     "stkCallback": {
 *       "CheckoutRequestID": "ws_CO_...",
 *       "ResultCode": 0,
 *       "ResultDesc": "Success",
 *       "CallbackMetadata": { ... }
 *     }
 *   }
 * }
 */
app.post('/api/mpesa/callback', async (req, res) => {
  try {
    console.log(`\n--- M-Pesa Callback Received ---`);
    console.log('Callback Data:', JSON.stringify(req.body, null, 2));

    // Process the callback data
    const result = mpesaService.processCallback(req.body);

    // Update transaction in database
    await dbHelpers.updateTransaction(result.checkoutRequestId, {
      status: result.status,
      mpesaReceiptNumber: result.mpesaReceiptNumber,
      resultCode: result.resultCode,
      resultDesc: result.resultDesc,
      failureReason: result.failureReason,
      transactionDate: result.transactionDate,
    });

    console.log(`✓ Transaction updated in database`);
    console.log(`--- End Callback ---\n`);

    // IMPORTANT: Respond to M-Pesa quickly with 200 OK
    // M-Pesa expects this specific response format
    res.json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });

  } catch (error) {
    console.error('Error processing callback:', error.message);
    
    // Still respond with 200 to prevent M-Pesa from retrying
    res.json({
      ResultCode: 1,
      ResultDesc: 'Failed to process callback',
    });
  }
});

/**
 * ROUTE 3: CHECK TRANSACTION STATUS
 * 
 * GET /api/mpesa/status/:checkoutRequestId
 * 
 * This is called by your frontend to check if payment completed.
 * Frontend polls this endpoint every few seconds after initiating STK push.
 * 
 * Flow:
 * 1. Frontend sends CheckoutRequestID (received from /stkpush)
 * 2. We query database for this transaction
 * 3. Return current status (PENDING, SUCCESS, or FAILED)
 * 4. Frontend shows appropriate message to user
 * 
 * Response:
 * {
 *   "id": 1,
 *   "checkout_request_id": "ws_CO_...",
 *   "phone_number": "254712345678",
 *   "amount": 100,
 *   "status": "SUCCESS",
 *   "mpesa_receipt_number": "NLJ7RT61SV",
 *   "created_at": "2024-01-06 10:30:45",
 *   "updated_at": "2024-01-06 10:31:15",
 *   ...
 * }
 */
app.get('/api/mpesa/status/:checkoutRequestId', async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    // Get transaction from database
    const transaction = await dbHelpers.getTransaction(checkoutRequestId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    res.json({
      success: true,
      transaction,
    });

  } catch (error) {
    console.error('Error checking status:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to check transaction status',
    });
  }
});

/**
 * ROUTE 4: GET ALL TRANSACTIONS (for admin/debugging)
 * 
 * GET /api/mpesa/transactions
 * 
 * Returns all transactions from database.
 * Useful for seeing transaction history and debugging.
 */
app.get('/api/mpesa/transactions', async (req, res) => {
  try {
    const transactions = await dbHelpers.getAllTransactions();
    
    res.json({
      success: true,
      count: transactions.length,
      transactions,
    });

  } catch (error) {
    console.error('Error fetching transactions:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
    });
  }
});

/**
 * ROUTE 5: Health check endpoint
 * 
 * GET /api/health
 * 
 * Simple endpoint to verify server is running
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'M-Pesa Integration Server is running',
    timestamp: new Date().toISOString(),
  });
});

/** ROUTE 6: ADMIN INTERFACE
 * 
 * GET /admin
 * 
 * Simple HTML page to view all transactions in a table.
 * Useful for quick monitoring without needing API client.
 */
app.get('/admin', adminPage);

/**
 * START SERVER
 */
app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   M-PESA STK PUSH INTEGRATION SERVER              ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ Frontend: http://localhost:${PORT}`);
  console.log(`✓ API Endpoints:`);
  console.log(`  - POST   /api/mpesa/stkpush`);
  console.log(`  - POST   /api/mpesa/callback`);
  console.log(`  - GET    /api/mpesa/status/:checkoutRequestId`);
  console.log(`  - GET    /api/mpesa/transactions`);
  console.log(`  - GET    /api/health\n`);
  
  if (!process.env.MPESA_PASSKEY || process.env.MPESA_PASSKEY === 'your_passkey_here') {
    console.log('⚠️  WARNING: MPESA_PASSKEY not configured!');
    console.log('   Please update .env file with your passkey from Daraja Portal\n');
  }
  
  // if (!process.env.MPESA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL.includes('ngrok')) {
  if (!process.env.MPESA_CALLBACK_URL )
  {
    console.log('⚠️  WARNING: MPESA_CALLBACK_URL may not be configured!');
    console.log('   For local testing:');
    console.log('   1. Install ngrok: https://ngrok.com/download');
    console.log('   2. Run: ngrok http 3000');
    console.log('   3. Copy HTTPS URL to .env as MPESA_CALLBACK_URL\n');
  }
});

/**
 * HOW TO TEST THIS APP:
 * 
 * 1. Setup:
 *    - Copy .env.example to .env
 *    - Fill in your Daraja credentials
 *    - Get passkey from Daraja Portal (Test Credentials section)
 *    - Setup ngrok: ngrok http 3000
 *    - Copy ngrok HTTPS URL to MPESA_CALLBACK_URL
 * 
 * 2. Start server:
 *    npm install
 *    npm start
 * 
 * 3. Open frontend:
 *    http://localhost:3000
 * 
 * 4. Test with sandbox credentials:
 *    - Phone: 254708374149 (sandbox test number)
 *    - Amount: Any amount (e.g., 1)
 *    - Click "Pay with M-Pesa"
 * 
 * 5. Check logs:
 *    - Watch terminal for STK push request
 *    - Wait for callback (10-60 seconds)
 *    - See transaction update in logs
 * 
 * 6. Sandbox test credentials:
 *    The sandbox STK push will always succeed with test phone numbers.
 *    No actual money moves in sandbox.
 */
