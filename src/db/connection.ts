import { Database } from "bun:sqlite";

export const db = new Database("tracker.sqlite");

console.log("Database connection initialized (tracker.sqlite)."); 