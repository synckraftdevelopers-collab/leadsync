const pool = require("./db");

const createLeadsTableQuery = `
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    business_name TEXT,
    owner_name TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,
    city TEXT,
    category TEXT,
    source TEXT,
    confidence_score INTEGER,
    is_valid_lead BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_lead UNIQUE(business_name, email, phone)
);
`;

const createSearchesTableQuery = `
CREATE TABLE IF NOT EXISTS searches (
    id SERIAL PRIMARY KEY,
    query TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function init() {
  try {
    console.log("Initializing database...");
    console.log("Dropping old tables...");
    await pool.query("DROP TABLE IF EXISTS leads CASCADE;");
    await pool.query("DROP TABLE IF EXISTS searches CASCADE;");
    
    console.log("Creating leads table...");
    await pool.query(createLeadsTableQuery);
    
    console.log("Creating searches table...");
    await pool.query(createSearchesTableQuery);
    
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization error:", err);
  } finally {
    await pool.end();
  }
}

init();
