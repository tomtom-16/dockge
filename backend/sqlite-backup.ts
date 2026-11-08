import fs from "node:fs";
import path from "node:path";
import sqlite from "sqlite3";

/**
 * Snapshot a database including committed WAL transactions, without running migrations.
 * @param source Existing database path
 * @param destination New standalone database path
 */
export async function backupSQLite(source: string, destination: string): Promise<void> {
    const output = path.resolve(destination);
    const database = await new Promise<sqlite.Database>((resolve, reject) => {
        const connection = new sqlite.Database(path.resolve(source), sqlite.OPEN_READONLY, error => {
            if (error) {
                reject(error);
            } else {
                resolve(connection);
            }
        });
    });
    let reserved = false;
    try {
        // Never overwrite an existing file; backups contain passwords and agent credentials.
        const descriptor = fs.openSync(output, "wx", 0o600);
        reserved = true;
        fs.closeSync(descriptor);
        database.configure("busyTimeout", 5000);
        await new Promise<void>((resolve, reject) => {
            database.run("VACUUM INTO ?", [ output ], error => error ? reject(error) : resolve());
        });
    } catch (error) {
        if (reserved) {
            fs.unlinkSync(output);
        }
        throw error;
    } finally {
        await new Promise<void>((resolve, reject) => {
            database.close(error => error ? reject(error) : resolve());
        });
    }
}
