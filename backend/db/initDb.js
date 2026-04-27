const fs = require('fs');
const path = require('path');
const sql = require('mssql');
require('dotenv').config();

// Config without database first to CREATE the database
const masterConfig = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT) || 1433,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'master',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
};

async function initDb() {
  let pool;
  try {
    console.log('🔌 Connecting to SQL Server (master)...');
    pool = await sql.connect(masterConfig);

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME;
    console.log(`📦 Ensuring database "${dbName}" exists...`);
    await pool.request().query(`
      IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${dbName}')
      BEGIN
        CREATE DATABASE [${dbName}]
        PRINT 'Database ${dbName} created.'
      END
      ELSE
        PRINT 'Database ${dbName} already exists.'
    `);

    await pool.close();

    // Now connect to the target database
    console.log(`🔌 Connecting to ${dbName}...`);
    const dbPool = await sql.connect({
      ...masterConfig,
      database: dbName,
    });

    // Read and execute init.sql
    const sqlScript = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    // Split on GO statements (T-SQL batch separator)
    const batches = sqlScript.split(/\bGO\b/i).filter(b => b.trim().length > 0);

    for (const batch of batches) {
      if (batch.trim()) {
        await dbPool.request().query(batch);
      }
    }

    console.log('✅ TravelEliteDB initialized successfully!');
    await dbPool.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ DB Init Error:', err.message);
    if (pool) await pool.close().catch(() => {});
    process.exit(1);
  }
}

initDb();
