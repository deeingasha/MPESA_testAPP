const { dbHelpers } = require('./database');

/**
 * HELPER: Convert UTC to EAT
 */
function convertToEAT(utcTimeString) {
  if (!utcTimeString) return '-';
  
  // SQLite stores timestamps like: "2026-01-06 13:44:17"
  // We need to treat this as UTC and add 3 hours for EAT
  
  // Parse the timestamp as UTC
  const utcDate = new Date(utcTimeString + ' UTC');
  
  // Add 3 hours for EAT (East Africa Time = UTC+3)
  const eatOffset = 3 * 60 * 60 * 1000;
  const eatDate = new Date(utcDate.getTime() + eatOffset);
  
  // Format: YYYY-MM-DD HH:MM:SS EAT
  const year = eatDate.getUTCFullYear();
  const month = String(eatDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(eatDate.getUTCDate()).padStart(2, '0');
  const hours = String(eatDate.getUTCHours()).padStart(2, '0');
  const minutes = String(eatDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(eatDate.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} EAT`;
}

/**
 * ADMIN INTERFACE ROUTE
 * 
 * GET /admin
 * 
 * Simple HTML page to view all transactions in a table.
 * Displays times in EAT (East Africa Time).
 */
async function adminPage(req, res) {
  try {
    const transactions = await dbHelpers.getAllTransactions();
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>M-Pesa Admin - Transactions</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      padding: 20px; 
      background: #f5f5f5;
    }
    
    .header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    
    h1 { 
      color: #333; 
      margin-bottom: 10px;
    }
    
    .stats {
      display: flex;
      gap: 20px;
      margin-top: 15px;
    }
    
    .stat-box {
      padding: 10px 15px;
      border-radius: 5px;
      background: #f0f0f0;
    }
    
    .stat-box strong {
      display: block;
      font-size: 24px;
      color: #667eea;
    }
    
    .stat-box span {
      font-size: 12px;
      color: #666;
    }
    
    .table-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    
    table { 
      width: 100%; 
      border-collapse: collapse; 
    }
    
    th, td { 
      padding: 12px; 
      text-align: left; 
      border-bottom: 1px solid #ddd; 
    }
    
    th { 
      background: #667eea; 
      color: white; 
      font-weight: 600;
      position: sticky;
      top: 0;
    }
    
    tr:hover { 
      background: #f5f5f5; 
    }
    
    .status-success { 
      color: #28a745; 
      font-weight: bold; 
    }
    
    .status-failed { 
      color: #dc3545; 
      font-weight: bold; 
    }
    
    .status-pending { 
      color: #ffc107; 
      font-weight: bold; 
    }
    
    .receipt { 
      font-family: 'Courier New', monospace; 
      background: #f0f0f0;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    
    .time {
      font-size: 11px;
      color: #666;
    }
    
    .eat-badge {
      display: inline-block;
      background: #e3f2fd;
      color: #1976d2;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      margin-left: 5px;
    }
    
    .actions {
      margin: 20px 0;
      display: flex;
      gap: 10px;
    }
    
    button {
      padding: 10px 20px; 
      background: #667eea; 
      color: white; 
      border: none; 
      border-radius: 5px; 
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    button:hover {
      background: #5568d3;
    }
    
    button:active {
      transform: scale(0.98);
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }
    
    .empty-state svg {
      width: 64px;
      height: 64px;
      margin-bottom: 20px;
      opacity: 0.5;
    }
    
    @media (max-width: 768px) {
      table {
        font-size: 12px;
      }
      
      th, td {
        padding: 8px;
      }
      
      .stats {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>💳 M-Pesa Transactions Dashboard</h1>
    <p>Real-time view of all M-Pesa transactions <span class="eat-badge">EAT</span></p>
    
    <div class="stats">
      <div class="stat-box">
        <strong>${transactions.length}</strong>
        <span>Total Transactions</span>
      </div>
      <div class="stat-box">
        <strong>${transactions.filter(t => t.status === 'SUCCESS').length}</strong>
        <span>Successful</span>
      </div>
      <div class="stat-box">
        <strong>${transactions.filter(t => t.status === 'PENDING').length}</strong>
        <span>Pending</span>
      </div>
      <div class="stat-box">
        <strong>${transactions.filter(t => t.status === 'FAILED').length}</strong>
        <span>Failed</span>
      </div>
    </div>
  </div>
  
  <div class="actions">
    <button onclick="location.reload()">
      🔄 Refresh
    </button>
    <button onclick="exportToCSV()">
      📥 Export CSV
    </button>
  </div>
  
  <div class="table-container">
    ${transactions.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Phone</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Receipt</th>
          <th>Created (EAT)</th>
          <th>Updated (EAT)</th>
          <th>Checkout ID</th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map(t => `
          <tr>
            <td>${t.id}</td>
            <td>${t.phone_number}</td>
            <td>KES ${t.amount.toLocaleString()}</td>
            <td class="status-${t.status.toLowerCase()}">${t.status}</td>
            <td>${t.mpesa_receipt_number ? `<span class="receipt">${t.mpesa_receipt_number}</span>` : '-'}</td>
            <td class="time">${convertToEAT(t.created_at)}</td>
            <td class="time">${convertToEAT(t.updated_at)}</td>
            <td style="font-size: 11px; font-family: monospace;">${t.checkout_request_id}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : `
    <div class="empty-state">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
      </svg>
      <h3>No transactions yet</h3>
      <p>Transactions will appear here when payments are processed</p>
    </div>
    `}
  </div>
  
  <script>
    // Auto-refresh every 5 seconds
    setTimeout(() => location.reload(), 5000);
    
    // Export to CSV function
    function exportToCSV() {
      const transactions = ${JSON.stringify(transactions)};
      
      if (transactions.length === 0) {
        alert('No transactions to export');
        return;
      }
      
      const headers = ['ID', 'Phone', 'Amount', 'Status', 'Receipt', 'Created (EAT)', 'Updated (EAT)', 'Checkout ID'];
      const rows = transactions.map(t => [
        t.id,
        t.phone_number,
        t.amount,
        t.status,
        t.mpesa_receipt_number || '',
        t.created_at,
        t.updated_at || '',
        t.checkout_request_id
      ]);
      
      let csvContent = headers.join(',') + '\\n';
      csvContent += rows.map(row => row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? '"' + cell + '"' : cell
      ).join(',')).join('\\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mpesa_transactions_' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        location.reload();
      }
    });
  </script>
</body>
</html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error loading admin page:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>⚠️ Error Loading Transactions</h1>
          <p>${error.message}</p>
          <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px;">Retry</button>
        </body>
      </html>
    `);
  }
}

module.exports = { adminPage };