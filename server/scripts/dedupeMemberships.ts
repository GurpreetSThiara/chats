import { pool } from "../db";

async function main() {
  const client = await pool.connect();
  try {
    console.log("Starting deduplication of workspace_members and channel_members...");
    await client.query('BEGIN');

    // Deduplicate workspace_members: keep the earliest joined_at or lowest ctid per (workspace_id, user_id)
    console.log("Deduplicating workspace_members...");
    await client.query(`
      DELETE FROM workspace_members a
      USING workspace_members b
      WHERE a.workspace_id = b.workspace_id
        AND a.user_id = b.user_id
        AND a.ctid > b.ctid;
    `);

    // Deduplicate channel_members similarly
    console.log("Deduplicating channel_members...");
    await client.query(`
      DELETE FROM channel_members a
      USING channel_members b
      WHERE a.channel_id = b.channel_id
        AND a.user_id = b.user_id
        AND a.ctid > b.ctid;
    `);

    await client.query('COMMIT');
    console.log("Deduplication complete.");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Deduplication failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
