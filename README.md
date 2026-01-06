# M-Pesa STK Push Integration Guide

Complete example application demonstrating M-Pesa Lipa Na M-Pesa Express (STK Push) integration.

## 📋 What This App Does

1. User enters phone number and amount on a web page
2. Backend initiates M-Pesa STK push
3. User receives payment prompt on their phone
4. User enters M-Pesa PIN to complete payment
5. M-Pesa sends callback to backend with result
6. Frontend displays payment success/failure

## 🏗️ Architecture Overview

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌──────────┐
│   Browser   │─────▶│   Backend   │─────▶│   M-Pesa    │─────▶│  User's  │
│  (Frontend) │      │  (Express)  │      │  Daraja API │      │   Phone  │
└─────────────┘      └─────────────┘      └─────────────┘      └──────────┘
       ▲                    ▲                      │                   │
       │                    │                      │                   │
       │              ┌─────┴─────┐                │                   │
       │              │  Database │                │                   │
       │              │  (SQLite) │                │                   │
       │              └───────────┘                │                   │
       │                    ▲                      │                   │
       │                    │                      ▼                   ▼
       │                    └──────────────────[Callback]───────[Enters PIN]
       │                                           │
       └───────────────────[Poll Status]───────────┘
```

## 📁 Project Structure

```
mpesa-stk-app/
├── server.js           # Main Express server with routes
├── mpesaService.js     # M-Pesa API interaction logic
├── database.js         # Database setup and helpers
├── package.json        # Dependencies
├── .env               # Configuration (create from .env.example)
├── .env.example       # Configuration template
└── public/
    └── index.html     # Frontend UI
```

## 🚀 Setup Instructions

### Step 1: Get Daraja Credentials

1. Go to https://developer.safaricom.co.ke/
2. Create account and login
3. Click "My Apps" → "Create App"
4. Select "Lipa Na M-Pesa Sandbox" product
5. Click on your app to view credentials:
   - **Consumer Key**
   - **Consumer Secret**
6. Click on "Lipa Na M-Pesa Sandbox" to view:
   - **Passkey** (Test Credentials section)
   - **Shortcode** (usually 174379 for sandbox)

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Copy the example file:
```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:
```env
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your_passkey_here
MPESA_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/mpesa/callback
MPESA_API_URL=https://sandbox.safaricom.co.ke
PORT=3000
```

**IMPORTANT:** You must get the passkey from the Daraja Portal:
- Login to Daraja
- Go to your app
- Click on "Lipa Na M-Pesa Sandbox"
- Look for "Test Credentials" section
- Copy the "Lipa Na Mpesa Online Passkey"

### Step 4: Setup Ngrok (for callback URL)

M-Pesa needs a publicly accessible HTTPS endpoint to send callbacks.

1. Download ngrok: https://ngrok.com/download
2. Start your Express server:
   ```bash
   npm start
   ```
3. In a new terminal, start ngrok:
   ```bash
   ngrok http 3000
   ```
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Update `.env`:
   ```env
   MPESA_CALLBACK_URL=https://abc123.ngrok.io/api/mpesa/callback
   ```
6. Restart your server

**Why ngrok?**
- M-Pesa servers need to reach your callback endpoint
- Localhost is not accessible from the internet
- ngrok creates a public tunnel to your local server

### Step 5: Test the Integration

1. Open browser: http://localhost:3000
2. Enter test phone number: `254708374149` (sandbox test number)
3. Enter amount: `1` (any amount works in sandbox)
4. Click "Pay with M-Pesa"
5. Watch the terminal logs for:
   - STK push request
   - M-Pesa callback (10-60 seconds later)
   - Transaction status update

**Sandbox Test Numbers:**
- 254708374149
- 254708374148
- 254708374147

**In sandbox, all test numbers automatically succeed.**

## 🔍 Understanding the Flow

### 1. User Initiates Payment

```javascript
// Frontend sends request
POST /api/mpesa/stkpush
Body: {
  phoneNumber: "0712345678",
  amount: "100"
}
```

### 2. Backend Initiates STK Push

```javascript
// Backend flow:
1. Get access token from M-Pesa
2. Generate password (Base64(shortcode + passkey + timestamp))
3. Format phone number to 254XXXXXXXXX
4. Call M-Pesa STK Push API
5. Save transaction to database (PENDING)
6. Return CheckoutRequestID to frontend
```

### 3. M-Pesa Sends STK Prompt

```
User's phone receives:
┌─────────────────────────┐
│  M-Pesa Payment Request │
│  Pay KES 100            │
│  To: 174379             │
│  Enter PIN: ____        │
│  [OK]  [Cancel]         │
└─────────────────────────┘
```

### 4. M-Pesa Sends Callback

```javascript
// 10-60 seconds later, M-Pesa posts to:
POST /api/mpesa/callback
Body: {
  Body: {
    stkCallback: {
      CheckoutRequestID: "ws_CO_...",
      ResultCode: 0,  // 0 = success
      ResultDesc: "Success",
      CallbackMetadata: {
        Item: [
          { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
          { Name: "Amount", Value: 100 },
          ...
        ]
      }
    }
  }
}

// Backend updates database:
UPDATE transactions
SET status = "SUCCESS",
    mpesa_receipt_number = "NLJ7RT61SV"
WHERE checkout_request_id = "ws_CO_..."
```

### 5. Frontend Polls Status

```javascript
// Frontend polls every 3 seconds:
GET /api/mpesa/status/ws_CO_...

// Eventually gets:
{
  transaction: {
    status: "SUCCESS",
    mpesa_receipt_number: "NLJ7RT61SV",
    ...
  }
}

// Displays success message to user
```

## 🔐 Security Notes

### For Production:

1. **Never commit `.env` file**
   - Add `.env` to `.gitignore`
   - Use environment variables in production

2. **Validate callback source**
   - Verify callbacks come from M-Pesa IPs
   - Add signature verification

3. **Use HTTPS only**
   - Production must use HTTPS
   - Get SSL certificate

4. **Secure your database**
   - Use PostgreSQL/MySQL instead of SQLite
   - Implement proper access controls

5. **Rate limiting**
   - Prevent abuse of STK push endpoint
   - Add rate limiting middleware

6. **Transaction verification**
   - Implement STK query API to verify status
   - Don't rely solely on callbacks

## 🐛 Troubleshooting

### "Failed to get access token"
- Check Consumer Key and Consumer Secret
- Ensure no extra spaces in .env
- Verify Daraja credentials are for correct environment (sandbox vs production)

### "Failed to initiate payment"
- Check passkey is correct
- Verify shortcode is 174379 (sandbox)
- Ensure phone number format is correct

### "Callback never received"
- Verify ngrok is running
- Check MPESA_CALLBACK_URL is correct HTTPS URL
- Look at ngrok web interface (http://127.0.0.1:4040) for requests
- Ensure callback endpoint responds with 200 OK

### "Transaction stuck in PENDING"
- Check ngrok logs for incoming callback
- Verify callback URL in .env is correct
- In sandbox, callbacks may be delayed 10-60 seconds

## 📚 API Endpoints

### POST /api/mpesa/stkpush
Initiate STK push payment.

**Request:**
```json
{
  "phoneNumber": "0712345678",
  "amount": "100"
}
```

**Response:**
```json
{
  "success": true,
  "message": "STK Push sent to phone",
  "checkoutRequestId": "ws_CO_...",
  "merchantRequestId": "29115-..."
}
```

### POST /api/mpesa/callback
Receives M-Pesa transaction results (called by M-Pesa, not frontend).

### GET /api/mpesa/status/:checkoutRequestId
Check transaction status.

**Response:**
```json
{
  "success": true,
  "transaction": {
    "status": "SUCCESS",
    "mpesa_receipt_number": "NLJ7RT61SV",
    "amount": 100,
    "phone_number": "254712345678",
    ...
  }
}
```

### GET /api/mpesa/transactions
Get all transactions (for debugging).

### GET /api/health
Health check endpoint.

## 🎯 Result Codes

M-Pesa returns these result codes in callbacks:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Insufficient Balance |
| 1032 | User cancelled |
| 1037 | Timeout (user didn't respond) |
| 2001 | Invalid parameters |

## 🚦 Production Checklist

Before going live:

- [ ] Get production credentials from Daraja
- [ ] Register production callback URL
- [ ] Use real paybill/till number
- [ ] Switch to production API URL
- [ ] Setup proper database (PostgreSQL/MySQL)
- [ ] Add transaction verification
- [ ] Implement proper error handling
- [ ] Add logging and monitoring
- [ ] Setup SSL certificate
- [ ] Add rate limiting
- [ ] Implement retry logic for failed callbacks
- [ ] Add admin dashboard for transaction management

## 📞 Support

- Daraja Support: https://developer.safaricom.co.ke/support
- Documentation: https://developer.safaricom.co.ke/docs

## 📝 License

MIT - Feel free to use this for learning or building your own integrations.
