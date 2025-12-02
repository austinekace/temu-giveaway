const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Step 1: Import CORS middleware
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(cors()); // Step 2: Enable CORS for all origins (fixes NetworkError)
app.use(bodyParser.json());

// Database connection setup (using a single connection string)
// Note: Render sets the DATABASE_URL environment variable automatically.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for some environments like Render
    }
});

/**
 * Initializes the database by creating the 'claims' table if it doesn't exist.
 */
async function initializeDatabase() {
    try {
        const client = await pool.connect();
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS claims (
                id SERIAL PRIMARY KEY,
                claim_id VARCHAR(50) UNIQUE NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_name VARCHAR(255) NOT NULL,
                user_email VARCHAR(255) NOT NULL,
                user_phone VARCHAR(50) NOT NULL,
                user_address TEXT NOT NULL,
                items_claimed JSONB NOT NULL,
                item_count INTEGER NOT NULL,
                shipping_fee_ngn DECIMAL(10, 2) NOT NULL
            );
        `;
        await client.query(createTableQuery);
        client.release();
        console.log('Database initialized: "claims" table is ready.');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

// Generate a simple unique ID (e.g., CLAIM-123456)
function generateClaimId() {
    return 'CLAIM-' + Math.floor(100000 + Math.random() * 900000);
}

// POST endpoint to handle the claim submission
app.post('/claim', async (req, res) => {
    try {
        const { user_info, items_claimed, item_count, shipping_fee_ngn } = req.body;
        const { name, email, phone, address } = user_info;
        const claim_id = generateClaimId();

        const insertQuery = `
            INSERT INTO claims (claim_id, user_name, user_email, user_phone, user_address, items_claimed, item_count, shipping_fee_ngn)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING claim_id;
        `;
        const values = [
            claim_id, 
            name, 
            email, 
            phone, 
            address, 
            JSON.stringify(items_claimed), // Store as JSON string in JSONB column
            item_count, 
            shipping_fee_ngn
        ];

        const result = await pool.query(insertQuery, values);

        console.log(`Claim ${claim_id} submitted by ${name}. Fee: ${shipping_fee_ngn}`);

        res.status(201).json({ 
            message: 'Claim successfully recorded.',
            claimId: result.rows[0].claim_id,
            fee: shipping_fee_ngn 
        });

    } catch (error) {
        console.error('Error processing claim:', error.message);
        // Ensure to send a JSON response on error
        res.status(500).json({ 
            error: 'Failed to process claim submission.', 
            details: error.message 
        });
    }
});

// GET endpoint for health check or testing
app.get('/', (req, res) => {
    res.send('TEMU Giveaway Claim Service is running.');
});

// Start server and initialize DB
initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server is running successfully on port ${port}.`);
    });
});