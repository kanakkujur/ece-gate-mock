/**
 * Stage-14: Session locking helpers using transactions + SELECT ... FOR UPDATE
 */
export async function withSessionLock(pool, testId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the row
    const { rows } = await client.query(
      `SELECT *
         FROM public.test_sessions
        WHERE id = $1
        FOR UPDATE`,
      [testId]
    );

    if (!rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Test session not found" };
    }

    const session = rows[0];
    const out = await fn(client, session);

    await client.query("COMMIT");
    return { ok: true, data: out };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return { ok: false, error: e?.message || "Lock/transaction failed" };
  } finally {
    client.release();
  }
}
