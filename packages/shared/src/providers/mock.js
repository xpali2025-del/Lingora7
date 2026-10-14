// Development/staging provider: deposits come from the mock_deposits table (see `npm run sim:deposit`).
export const mockProvider = {
  type: 'mock',
  async testConnection() { return { ok: true, message: 'Mock provider (staging only)' }; },
  async fetchEvents(cfg, { db, cursor = null }) {
    const r = await db.query('SELECT * FROM mock_deposits WHERE id > $1 AND lower(to_address)=lower($2) ORDER BY id', [cursor?.id ?? 0, cfg.receivingAddress]);
    return {
      events: r.rows.map(d => ({ txRef: d.tx_hash, amount: String(d.amount), asset: 'USDT', network: 'BSC', confirmations: d.confirmations,
        detectedAt: new Date(d.created_at).toISOString(), raw: { source: 'mock' } })),
      cursor: { id: r.rows.length ? Number(r.rows[r.rows.length - 1].id) : cursor?.id ?? 0 },
    };
  },
};
