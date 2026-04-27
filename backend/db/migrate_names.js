const { query } = require('./connection');

async function migrate() {
  console.log('🔄 Starting migration: Splitting name and adding plaintext password field...');
  try {
    // 1. Add new columns
    console.log('1. Adding first_name, last_name, and password_plaintext columns to Users...');
    await query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'first_name')
      ALTER TABLE Users ADD 
        first_name NVARCHAR(100),
        last_name NVARCHAR(100),
        password_plaintext NVARCHAR(255)
    `);

    // 2. Migrate data
    console.log('2. Migrating data from full_name to first_name...');
    // Check if full_name still exists before updating
    await query(`
      IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'full_name')
      BEGIN
        EXEC sp_executesql N'UPDATE Users SET first_name = full_name'
      END
    `);

    // 3. Drop old column
    console.log('3. Dropping full_name column from Users...');
    await query(`
      IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'full_name')
      ALTER TABLE Users DROP COLUMN full_name
    `);

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
