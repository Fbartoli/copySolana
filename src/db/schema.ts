import type { Database } from "bun:sqlite";

export function setupDatabaseTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS app_meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      signature TEXT PRIMARY KEY,
      block_slot INTEGER NOT NULL,
      block_time INTEGER NOT NULL,
      address_tracked TEXT NOT NULL,
      fee_sol REAL NOT NULL,
      sol_change_sol REAL NOT NULL, -- Net SOL change for the tracked address in this TX
      transaction_type TEXT,
      parsed_message TEXT NOT NULL,
      raw_data_json TEXT
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
  console.log("Database tables schema checked/created (including PnL tables).");
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
    }
} 