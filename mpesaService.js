const axios = require('axios');

/**
 * M-PESA SERVICE
 * 
 * This file contains all the logic for interacting with M-Pesa Daraja API.
 * We separate this from routes to keep code organized (separation of concerns).
 */

class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.passkey = process.env.MPESA_PASSKEY;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    this.apiUrl = process.env.MPESA_API_URL;
  }

  /**
   * STEP 1: GET ACCESS TOKEN
   * 
   * Before we can make any M-Pesa API calls, we need an access token.
   * This is like logging in - we prove who we are using Consumer Key & Secret.
   * 
   * How it works:
   * 1. Combine Consumer Key and Secret with a colon: "key:secret"
   * 2. Encode this combination in Base64
   * 3. Send it to M-Pesa's OAuth endpoint
   * 4. M-Pesa returns an access token valid for ~1 hour
   * 
   * The access token is then used in the Authorization header for all other API calls.
   */
  async getAccessToken() {
    try {
      // Combine credentials with colon separator
      const auth = `${this.consumerKey}:${this.consumerSecret}`;
      
      // Convert to Base64 (this is Basic Authentication format)
      const encodedAuth = Buffer.from(auth).toString('base64');

      // Make request to OAuth endpoint
      const response = await axios.get(
        `${this.apiUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${encodedAuth}`,
          },
        }
      );

      console.log('✓ Access token obtained');
      return response.data.access_token;
    } catch (error) {
      console.error('✗ Failed to get access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with M-Pesa');
    }
  }

  /**
   * STEP 2: GENERATE PASSWORD
   * 
   * M-Pesa requires a "password" for STK push requests. This isn't a user password.
   * It's a security credential that proves the request is coming from you.
   * 
   * Formula: Base64(Shortcode + Passkey + Timestamp)
   * 
   * Example:
   * - Shortcode: 174379
   * - Passkey: bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
   * - Timestamp: 20231215103045
   * - Combined: 174379bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c91920231215103045
   * - Base64 encoded: MTc0Mzc5YmZiMjc5ZjlhYTliZGJjZjE1OGU5N2RkNzFhNDY3Y2QyZTBjODkzMDU5YjEwZjc4ZTZiNzJhZGExZWQyYzkxOTIwMjMxMjE1MTAzMDQ1
   * 
   * M-Pesa validates this to ensure:
   * 1. You have the correct passkey
   * 2. The request isn't too old (timestamp check)
   * 3. Nobody tampered with the request
   */
  generatePassword() {
    // Get current timestamp in format: YYYYMMDDHHmmss
    const timestamp = new Date().toISOString()
      .replace(/[^0-9]/g, '')  // Remove all non-numeric characters
      .slice(0, 14);             // Take first 14 digits (YYYYMMDDHHmmss)

    // Combine shortcode + passkey + timestamp
    const passwordString = this.shortcode + this.passkey + timestamp;
    
    // Convert to Base64
    const password = Buffer.from(passwordString).toString('base64');

    return { password, timestamp };
  }

  /**
   * STEP 3: FORMAT PHONE NUMBER
   * 
   * M-Pesa requires phone numbers in format: 254XXXXXXXXX (no spaces, no +)
   * Users might enter: 0712345678, +254712345678, 254712345678
   * We need to normalize all these to: 254712345678
   */
  formatPhoneNumber(phone) {
    // Remove all non-numeric characters
    phone = phone.replace(/\D/g, '');

    // Convert 07XXXXXXXX to 2547XXXXXXXX
    if (phone.startsWith('0')) {
      phone = '254' + phone.slice(1);
    }
    // Remove + if present (from +254...)
    else if (phone.startsWith('254')) {
      // Already correct format
    }
    // Add 254 prefix if missing
    else if (phone.length === 9) {
      phone = '254' + phone;
    }

    return phone;
  }

  /**
   * STEP 4: INITIATE STK PUSH
   * 
   * This is the main function that sends the STK push request to M-Pesa.
   * 
   * Flow:
   * 1. Get access token
   * 2. Generate password and timestamp
   * 3. Format phone number
   * 4. Send request to M-Pesa STK Push API
   * 5. M-Pesa validates and sends STK prompt to user's phone
   * 6. M-Pesa immediately returns a CheckoutRequestID (before user pays)
   * 7. Later, M-Pesa calls our callback URL with the actual result
   */
  async initiateSTKPush(phoneNumber, amount) {
    try {
      // Step 4.1: Get access token
      const accessToken = await this.getAccessToken();

      // Step 4.2: Generate password and timestamp
      const { password, timestamp } = this.generatePassword();

      // Step 4.3: Format phone number
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      // Step 4.4: Prepare request body
      const requestBody = {
        // Your business shortcode (paybill/till number)
        BusinessShortCode: this.shortcode,
        
        // Security credential (generated above)
        Password: password,
        
        // Timestamp used in password generation
        Timestamp: timestamp,
        
        // Transaction type
        // CustomerPayBillOnline = Customer paying to a paybill
        // CustomerBuyGoodsOnline = Customer paying to a till number
        TransactionType: 'CustomerPayBillOnline',
        
        // Amount to charge (in KES)
        Amount: Math.ceil(amount), // M-Pesa only accepts whole numbers
        
        // Customer's phone number (payer)
        PartyA: formattedPhone,
        
        // Your business shortcode (receiver)
        PartyB: this.shortcode,
        
        // Customer's phone number (where STK prompt is sent)
        PhoneNumber: formattedPhone,
        
        // Where M-Pesa sends the transaction result
        // MUST be publicly accessible HTTPS endpoint
        CallBackURL: this.callbackUrl,
        
        // Account reference (shows on customer's phone)
        // This could be order number, invoice number, etc.
        AccountReference: `Order-${Date.now()}`,
        
        // Transaction description (shows on customer's phone)
        TransactionDesc: 'Payment for services',
      };

      console.log('→ Initiating STK Push to:', formattedPhone);

      // Step 4.5: Send request to M-Pesa
      const response = await axios.post(
        `${this.apiUrl}/mpesa/stkpush/v1/processrequest`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      /**
       * M-Pesa Response (SUCCESS):
       * {
       *   "MerchantRequestID": "29115-34620561-1",
       *   "CheckoutRequestID": "ws_CO_191220191020363925",
       *   "ResponseCode": "0",
       *   "ResponseDescription": "Success. Request accepted for processing",
       *   "CustomerMessage": "Success. Request accepted for processing"
       * }
       * 
       * ResponseCode "0" means request was ACCEPTED (not that payment succeeded)
       * The actual payment result comes later via callback
       */

      console.log('✓ STK Push initiated successfully');
      console.log('  CheckoutRequestID:', response.data.CheckoutRequestID);

      return {
        success: true,
        message: 'STK Push sent to phone',
        checkoutRequestId: response.data.CheckoutRequestID,
        merchantRequestId: response.data.MerchantRequestID,
        responseCode: response.data.ResponseCode,
        responseDescription: response.data.ResponseDescription,
      };

    } catch (error) {
      console.error('✗ STK Push failed:', error.response?.data || error.message);
      
      // M-Pesa error responses often contain useful error messages
      const errorMessage = error.response?.data?.errorMessage || 
                          error.response?.data?.ResponseDescription ||
                          'Failed to initiate payment';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * STEP 5: PROCESS CALLBACK
   * 
   * This function processes the callback data sent by M-Pesa after user completes/cancels payment.
   * 
   * M-Pesa calls your callback URL (defined in MPESA_CALLBACK_URL) with transaction results.
   * This can happen 5-60 seconds after STK push was initiated.
   * 
   * Callback arrives regardless of success/failure/timeout.
   */
  processCallback(callbackData) {
    try {
      /**
       * M-Pesa Callback Structure:
       * {
       *   "Body": {
       *     "stkCallback": {
       *       "MerchantRequestID": "29115-34620561-1",
       *       "CheckoutRequestID": "ws_CO_191220191020363925",
       *       "ResultCode": 0,  // 0 = success, other = failed
       *       "ResultDesc": "The service request is processed successfully.",
       *       "CallbackMetadata": {  // Only present if ResultCode = 0 (success)
       *         "Item": [
       *           { "Name": "Amount", "Value": 1.00 },
       *           { "Name": "MpesaReceiptNumber", "Value": "NLJ7RT61SV" },
       *           { "Name": "TransactionDate", "Value": 20191219102115 },
       *           { "Name": "PhoneNumber", "Value": 254708374149 }
       *         ]
       *       }
       *     }
       *   }
       * }
       */

      const stkCallback = callbackData.Body.stkCallback;
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc;

      console.log('→ Callback received for:', checkoutRequestId);
      console.log('  Result Code:', resultCode);

      /**
       * Result Codes:
       * 0    = Success (payment completed)
       * 1    = Insufficient Balance
       * 1032 = User cancelled
       * 1037 = Timeout (user didn't respond)
       * 2001 = Invalid parameters
       * Many others...
       */

      const result = {
        checkoutRequestId,
        resultCode,
        resultDesc,
        status: resultCode === 0 ? 'SUCCESS' : 'FAILED',
        mpesaReceiptNumber: null,
        transactionDate: null,
        amount: null,
        phoneNumber: null,
        failureReason: resultCode !== 0 ? resultDesc : null,
      };

      // If payment was successful, extract additional details
      if (resultCode === 0 && stkCallback.CallbackMetadata) {
        const metadata = stkCallback.CallbackMetadata.Item;

        // Extract each metadata item
        metadata.forEach(item => {
          switch (item.Name) {
            case 'Amount':
              result.amount = item.Value;
              break;
            case 'MpesaReceiptNumber':
              // This is the receipt/confirmation code
              result.mpesaReceiptNumber = item.Value;
              break;
            case 'TransactionDate':
              // Format: 20191219102115 (YYYYMMDDHHmmss)
              result.transactionDate = this.parseTransactionDate(item.Value);
              break;
            case 'PhoneNumber':
              result.phoneNumber = item.Value;
              break;
          }
        });

        console.log('✓ Payment successful');
        console.log('  Receipt:', result.mpesaReceiptNumber);
      } else {
        console.log('✗ Payment failed:', resultDesc);
      }

      return result;

    } catch (error) {
      console.error('✗ Error processing callback:', error.message);
      throw error;
    }
  }

  /**
   * Helper: Parse M-Pesa transaction date
   * Converts: 20191219102115 → 2019-12-19 10:21:15
   */
  parseTransactionDate(dateString) {
    const str = String(dateString);
    const year = str.substr(0, 4);
    const month = str.substr(4, 2);
    const day = str.substr(6, 2);
    const hour = str.substr(8, 2);
    const minute = str.substr(10, 2);
    const second = str.substr(12, 2);
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
}

module.exports = new MpesaService();
