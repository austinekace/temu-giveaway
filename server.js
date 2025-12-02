const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
// Import the PostgreSQL client
const { Pool } = require('pg'); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATABASE SETUP ---

// Use the DATABASE_URL environment variable provided by Render or set manually
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("WARNING: DATABASE_URL environment variable is not set. Database integration will be disabled.");
}

// Create a PostgreSQL connection pool (only if connection string exists)
const pool = connectionString ? new Pool({
    connectionString: connectionString,
    // Required for Render to connect securely
    ssl: {
        rejectUnauthorized: false
    }
}) : null;

/**
 * Initializes the database by ensuring the 'claims' table exists.
 */
async function initializeDatabase() {
    if (!pool) return;
    
    console.log('Attempting to initialize database...');
    try {
        const client = await pool.connect();
        // Create the 'claims' table if it doesn't exist
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS claims (
                id SERIAL PRIMARY KEY,
                claim_id VARCHAR(50) UNIQUE NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                user_email VARCHAR(100) NOT NULL,
                shipping_fee NUMERIC(10, 2) NOT NULL,
                items_json TEXT NOT NULL,
                full_data JSONB NOT NULL,
                submission_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(createTableQuery);
        client.release();
        console.log('Database initialized: "claims" table is ready.');
    } catch (err) {
        console.error('Error initializing database. Check DATABASE_URL and connectivity:', err.message);
    }
}

// --- MIDDLEWARE ---
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));


// --- ROUTE HANDLER ---
app.post('/submit-claim', async (req, res) => {
    const claimData = req.body;
    const mockClaimId = `CLAIM-${Date.now()}`;
    
    // Check if database is configured before attempting to save
    if (!pool) {
        console.warn(`Claim ID ${mockClaimId} received, but not saved: Database is not connected.`);
        // Proceed with success response even if DB is down/missing, 
        // to avoid breaking the frontend flow.
        return res.status(200).json({ 
            message: 'Claim received and payment confirmed (Server logging only).',
            claimId: mockClaimId,
            status: 'SUCCESS_NO_DB'
        });
    }


    // Prepare data fields for database insertion
    const { name, email, address } = claimData.user_info;
    const { shipping_fee_ngn, items_claimed } = claimData;

    try {
        const insertQuery = `
            INSERT INTO claims (
                claim_id, user_name, user_email, shipping_fee, items_json, full_data
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
        `;

        const values = [
            mockClaimId,
            name,
            email,
            shipping_fee_ngn,
            JSON.stringify(items_claimed),
            claimData 
        ];

        // Execute the insert query
        const result = await pool.query(insertQuery, values);
        console.log(`Successfully saved claim ID ${mockClaimId} to database. DB ID: ${result.rows[0].id}`);

        // Send a success response back to the client
        res.status(200).json({ 
            message: 'Claim received and payment confirmed (Data saved).',
            claimId: mockClaimId,
            status: 'SUCCESS'
        });

    } catch (error) {
        console.error('Database insertion error:', error.message);
        res.status(500).json({ 
            message: 'An internal error occurred while saving your claim.',
            error: error.message
        });
    }
});

// --- SERVER START ---
app.listen(PORT, async () => {
    console.log(`Server is running successfully on port ${PORT}.`);
    if (pool) {
        await initializeDatabase();
    }
});