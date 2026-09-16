import { afterEach, describe, expect, it } from 'vitest';
import { fetchOrderSnapshot, fixtureOrderId, fixtureSnapshot } from './snapshot.js';

describe('fetchOrderSnapshot', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('returns the local fixture when POOLI_API_URL is unset', async () => {
    delete process.env.POOLI_API_URL;
    const snap = await fetchOrderSnapshot(fixtureOrderId());
    expect(snap).toEqual(fixtureSnapshot());
  });

  it('returns null for unknown ids without API base', async () => {
    delete process.env.POOLI_API_URL;
    expect(await fetchOrderSnapshot('ord_missing')).toBeNull();
  });
});
