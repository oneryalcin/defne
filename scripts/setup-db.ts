import { getDb } from "../src/lib/db";
import { getDatabasePath } from "../src/lib/db/client";

getDb();
console.log(`SQLite database ready at ${getDatabasePath()}`);
