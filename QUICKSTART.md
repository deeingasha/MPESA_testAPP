# Quick Start Guide - 5 Minutes to Testing

## 1. Install Dependencies
```bash
npm install
```

## 2. Get Your Passkey from Daraja

You already have Consumer Key and Secret. Now get the passkey:

1. Go to https://developer.safaricom.co.ke/
2. Login and go to "My Apps"
3. Click on your app ("Integration Practice")
4. Click on "Lipa Na M-Pesa Sandbox" (in the Products section)
5. Scroll to "Test Credentials"
6. Copy the **"Lipa Na Mpesa Online Passkey"** (long string)

## 3. Configure .env

Copy the example:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
MPESA_CONSUMER_KEY=aKHD***  # You already have this
MPESA_CONSUMER_SECRET=fd9g***  # You already have this
MPESA_SHORTCODE=174379
MPESA_PASSKEY=paste_your_passkey_here  # Get from step 2 above
MPESA_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/mpesa/callback
MPESA_API_URL=https://sandbox.safaricom.co.ke
PORT=3000
```

## 4. Setup Ngrok

Install ngrok: https://ngrok.com/download

Or if you have it already, skip to step 5.

## 5. Start Everything

**Terminal 1 - Start the app:**
```bash
npm start
```

**Terminal 2 - Start ngrok:**
```bash
ngrok http 3000
```

Copy the HTTPS URL from ngrok (looks like: `https://abc123.ngrok.io`)

**Edit .env again** and update:
```env
MPESA_CALLBACK_URL=https://abc123.ngrok.io/api/mpesa/callback
```

**Restart the app** (Ctrl+C in Terminal 1, then `npm start` again)

## 6. Test It!

1. Open browser: http://localhost:3000
2. Enter phone: `254708374149` (test number)
3. Enter amount: `1`
4. Click "Pay with M-Pesa"
5. Watch terminal for logs!

**In sandbox, it will automatically succeed after 10-20 seconds**

## What to Watch For

In your terminal, you'll see:
```
--- New STK Push Request ---
Phone: 254708374149
Amount: KES 1
→ Initiating STK Push to: 254708374149
✓ STK Push initiated successfully
  CheckoutRequestID: ws_CO_...
✓ Transaction saved to database
--- End Request ---

[Wait 10-20 seconds...]

--- M-Pesa Callback Received ---
→ Callback received for: ws_CO_...
  Result Code: 0
✓ Payment successful
  Receipt: NLJ7RT61SV
✓ Transaction updated in database
--- End Callback ---
```

## Troubleshooting

**"Failed to get access token"**
- Double check Consumer Key and Secret in .env
- No extra spaces!

**"MPESA_PASSKEY not configured"**
- You need to get the passkey from Daraja (Step 2 above)
- It's a long string, make sure you copied it completely

**"Callback never received"**
- Make sure ngrok is running
- Check that MPESA_CALLBACK_URL in .env has your ngrok HTTPS URL
- Restart the server after changing .env

**Want to see all transactions?**
Visit: http://localhost:3000/api/mpesa/transactions

## Next Steps

Once it works, read the full README.md to understand:
- How each part works
- What happens at each step
- How to move to production
