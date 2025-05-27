import type { Database } from "bun:sqlite";

export function setupDatabaseTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS app_meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS tracked_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_chat_id TEXT NOT NULL, -- To identify the user or chat
      solana_address TEXT NOT NULL,
      alias TEXT, -- Optional user-defined alias for the address
      UNIQUE(user_chat_id, solana_address) -- Ensure a user/chat tracks an address only once
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      signature TEXT PRIMARY KEY,
      block_slot INTEGER NOT NULL,
      block_time INTEGER NOT NULL,
      user_chat_id TEXT NOT NULL, -- Link to the user/chat
      address_tracked TEXT NOT NULL, -- The actual Solana address being tracked for this transaction
      fee_sol REAL NOT NULL,
      sol_change_sol REAL NOT NULL, -- Net SOL change for the tracked address in this TX
      transaction_type TEXT,
      parsed_message TEXT NOT NULL,
      raw_data_json TEXT,
      FOREIGN KEY (user_chat_id, address_tracked) REFERENCES tracked_wallets(user_chat_id, solana_address) ON DELETE CASCADE -- Optional: if you want to ensure address_tracked is one of the user's wallets
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS token_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_signature TEXT NOT NULL,
      mint TEXT NOT NULL,
      amount_ui TEXT NOT NULL,
      action TEXT NOT NULL, -- "Received" or "Sent" by tracked address
      decimals INTEGER NOT NULL,
      FOREIGN KEY (transaction_signature) REFERENCES transactions(signature) ON DELETE CASCADE
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS token_acquisitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_signature TEXT NOT NULL,
      user_chat_id TEXT NOT NULL, -- For easier PnL calculation per user/chat
      address_tracked TEXT NOT NULL, -- CRITICAL FIX: Add address tracking for proper FIFO scoping
      mint TEXT NOT NULL,
      block_time INTEGER NOT NULL, -- For FIFO ordering
      amount_acquired REAL NOT NULL, -- Store as numeric for calculations
      sol_cost_per_unit REAL NOT NULL,
      total_sol_cost REAL NOT NULL,
      amount_remaining REAL NOT NULL, -- For FIFO tracking
      FOREIGN KEY (transaction_signature) REFERENCES transactions(signature) ON DELETE CASCADE
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS token_disposals_pnl (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_signature TEXT NOT NULL,
      user_chat_id TEXT NOT NULL, -- For easier PnL calculation per user/chat
      address_tracked TEXT NOT NULL, -- CRITICAL FIX: Add address tracking for proper FIFO scoping
      mint TEXT NOT NULL,
      block_time INTEGER NOT NULL,
      amount_sold REAL NOT NULL, -- Store as numeric
      sol_proceeds_per_unit REAL NOT NULL,
      total_sol_proceeds REAL NOT NULL,
      cost_of_goods_sold_sol REAL NOT NULL,
      realized_pnl_sol REAL NOT NULL,
      FOREIGN KEY (transaction_signature) REFERENCES transactions(signature) ON DELETE CASCADE
    );
  `);
  
  // New table for tracking current portfolio positions
  database.run(`
    CREATE TABLE IF NOT EXISTS portfolio_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_chat_id TEXT NOT NULL,
      address_tracked TEXT NOT NULL,
      mint TEXT NOT NULL,
      current_balance REAL NOT NULL DEFAULT 0,
      average_cost_basis REAL NOT NULL DEFAULT 0,
      total_invested REAL NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL,
      UNIQUE(user_chat_id, address_tracked, mint),
      FOREIGN KEY (user_chat_id, address_tracked) REFERENCES tracked_wallets(user_chat_id, solana_address) ON DELETE CASCADE
    );
  `);
  
  console.log("Database tables schema checked/created (including PnL tables and portfolio positions).");
}

// Migration function to add address_tracked to existing tables
export function migrateDatabase(database: Database) {
  try {
    // Check if address_tracked column exists in token_acquisitions
    const checkAcquisitionsColumn = database.query(
      "PRAGMA table_info(token_acquisitions);"
    );
    const acquisitionsColumns = checkAcquisitionsColumn.all() as Array<{name: string}>;
    const hasAddressTrackedInAcquisitions = acquisitionsColumns.some(col => col.name === 'address_tracked');
    
    if (!hasAddressTrackedInAcquisitions) {
      console.log("Adding address_tracked column to token_acquisitions table...");
      database.run("ALTER TABLE token_acquisitions ADD COLUMN address_tracked TEXT;");
      
      // Update existing records with address_tracked from transactions table
      database.run(`
        UPDATE token_acquisitions 
        SET address_tracked = (
          SELECT address_tracked 
          FROM transactions 
          WHERE transactions.signature = token_acquisitions.transaction_signature
        );
      `);
    }
    
    // Check if address_tracked column exists in token_disposals_pnl
    const checkDisposalsColumn = database.query(
      "PRAGMA table_info(token_disposals_pnl);"
    );
    const disposalsColumns = checkDisposalsColumn.all() as Array<{name: string}>;
    const hasAddressTrackedInDisposals = disposalsColumns.some(col => col.name === 'address_tracked');
    
    if (!hasAddressTrackedInDisposals) {
      console.log("Adding address_tracked column to token_disposals_pnl table...");
      database.run("ALTER TABLE token_disposals_pnl ADD COLUMN address_tracked TEXT;");
      
      // Update existing records with address_tracked from transactions table
      database.run(`
        UPDATE token_disposals_pnl 
        SET address_tracked = (
          SELECT address_tracked 
          FROM transactions 
          WHERE transactions.signature = token_disposals_pnl.transaction_signature
        );
      `);
    }
    
    console.log("Database migration completed successfully.");
  } catch (error) {
    console.error("Error during database migration:", error);
  }
}

export function checkAndSetupDatabase(database: Database) {
    const checkTableQuery = database.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_meta';"
    );
    const tableExists = checkTableQuery.get();
  
    if (!tableExists) {
      console.log("'app_meta' table not found. Setting up database schema...");
      setupDatabaseTables(database);
    } else {
      console.log("Database schema already appears to be set up.");
      // Run migration to add missing columns to existing installations
      migrateDatabase(database);
    }
} 