import path from "node:path";
import { backupSQLite } from "../backend/sqlite-backup";

const [ destination, source = path.join(process.env.DOCKGE_DATA_DIR || "./data", "dockge.db") ] = process.argv.slice(2);
if (!destination) {
    console.error("Usage: npm run backup:db -- <destination.db> [source.db]");
    process.exitCode = 1;
} else {
    try {
        await backupSQLite(source, destination);
        console.log(`Database backup created: ${path.resolve(destination)}`);
    } catch (error) {
        console.error("Database backup failed:", error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
