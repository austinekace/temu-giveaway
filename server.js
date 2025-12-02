const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
// Render environment variables will automatically set the correct PORT
const PORT = process.env.PORT || 3000;

// Middleware setup:
// 1. body-parser: Necessary to handle and parse JSON data sent from the frontend.
app.use(bodyParser.json());

// 2. express.static: Serves static files (like index.html, and the images/ folder)
// from the root directory, making them accessible to the public.
app.use(express.static(path.join(__dirname)));

// Endpoint to handle the final form submission data from the client
app.post('/submit-claim', (req, res) => {
    const claimData = req.body;
    
    // --- Data Handling ---
    
    // In a production application, this is where you would connect to a database
    // (like PostgreSQL or MongoDB) and insert the data for long-term storage.
    
    // For this example, we log the received data to the server console.
    // This output can be viewed in the 'Logs' section of your Render Web Service dashboard.
    console.log('----------------------------------------------------');
    console.log(`NEW CLAIM RECEIVED at ${new Date().toISOString()}:`);
    console.log(`- Items: ${claimData.items_claimed.map(item => item.name).join(', ')}`);
    console.log(`- Shipping Fee (NGN): ${claimData.shipping_fee_ngn}`);
    console.log(`- User: ${claimData.user_info.name} (${claimData.user_info.email})`);
    console.log(`- Address: ${claimData.user_info.address.line1}, ${claimData.user_info.address.city}, ${claimData.user_info.address.zip}`);
    console.log('----------------------------------------------------');
    
    // Simulate a successful operation and return a unique claim ID to the client
    const mockClaimId = `CLAIM-${Date.now()}`;

    // Send a success response back to the client
    res.status(200).json({ 
        message: 'Claim received and payment confirmed.',
        claimId: mockClaimId,
        status: 'SUCCESS'
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}.`);
    console.log('This server is ready to accept claims via the /submit-claim POST endpoint.');
});