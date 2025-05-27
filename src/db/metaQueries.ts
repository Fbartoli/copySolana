import type { Database } from "bun:sqlite";
import type { AppMetaRow } from "../types";

const LAST_PROCESSED_BLOCK_SLOT_KEY_PREFIX = "last_processed_block_slot_for_user_chat_";

export function getLastProcessedBlockSlotFromDB(database: Database, user_chat_id: string, solana_address: string): number {
  const key = `${LAST_PROCESSED_BLOCK_SLOT_KEY_PREFIX}${user_chat_id}_address_${solana_address}`;
  const query = database.query<AppMetaRow, [string]>(
    "SELECT meta_value FROM app_meta WHERE meta_key = ?;"
  );
  const result = query.get(key);
  return result ? parseInt(result.meta_value, 10) : 0;
}

export function saveLastProcessedBlockSlotToDB(database: Database, user_chat_id: string, solana_address: string, blockSlot: number) {
  const key = `${LAST_PROCESSED_BLOCK_SLOT_KEY_PREFIX}${user_chat_id}_address_${solana_address}`;
  const query = database.query(
    "INSERT OR REPLACE INTO app_meta (meta_key, meta_value) VALUES (?, ?);"
  );
  query.run(key, blockSlot.toString());
  console.log(`Saved lastProcessedBlockSlot to DB: ${blockSlot} for user/chat ${user_chat_id}, address ${solana_address}`);
} 