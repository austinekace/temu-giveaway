const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());
// Serve the frontend file (index.html) and other static assets
app.use(express.static(path.join(__dirname)));

// --- PostgreSQL Database Setup ---
// IMPORTANT: The connection string must be provided via the DATABASE_URL environment variable.
// Example: postgres://user:password@host:port/database
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/mydatabase';

const pool = new Pool({
    connectionString: DATABASE_URL,
    // Add SSL configuration if connecting to a remote database (like Render/Heroku)
    // ssl: {
    //     rejectUnauthorized: false 
    // }
});

// Function to ensure the 'claims' table exists before the server starts handling requests
const setupDatabase = async () => {
    try {
        const client = await pool.connect();
        // The table stores contact info, the selected items (as JSONB), and the calculated fee.
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
        console.error("PostgreSQL Error: Failed to set up database. Ensure DATABASE_URL is correct.", err.stack);
        // The server will continue running, but database operations will fail if this is not fixed.
    }
};

// Initialize database setup
setupDatabase();


// --- POST /claim Route Handler ---
// This endpoint receives the form data and inserts it into the PostgreSQL table.
app.post('/claim', async (req, res) => {
    const { fullName, email, phone, city, fullAddress, selectedPrizes, totalFee } = req.body;

    // Basic validation
    if (!fullName || !email || !fullAddress || !selectedPrizes || totalFee === undefined) {
        return res.status(400).json({ success: false, message: 'Missing required claim fields.' });
    }

    try {
        const client = await pool.connect();
        
        // SQL Injection-safe query using parameterized values ($1, $2, ...)
        const query = `
            INSERT INTO claims (full_name, email, phone, city, full_address, selected_prizes, total_fee)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `;
        
        // selectedPrizes is sent as a JavaScript array, which we turn into a string for JSONB storage
        const values = [
            fullName, 
            email, 
            phone, 
            city, 
            fullAddress, 
            JSON.stringify(selectedPrizes), 
            parseInt(totalFee, 10) // Ensure fee is stored as an integer
        ];

        const result = await client.query(query, values);
        client.release();

        const claimId = result.rows[0].id;
        // Generate a simple, mock tracking ID based on the database ID
        const trackingId = `TEMU-CLAIM-${claimId}`;

        // Success response
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
    console.log(`Server running successfully on http://localhost:${PORT}`);
    console.log(`Ensure your PostgreSQL database is running and accessible via the DATABASE_URL environment variable.`);
});