/**
 * O passo da RDW no `run-daily`: corre com o limite diário quando há warehouse
 * local e salta (sem derrubar a corrida) quando não há. Sem rede: o enrich é falso.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { RDW_DAILY_LIMIT, kmRdwStep } from "../../scripts/pipeline/run-daily";

/** "" conta como ausente (o `warehouseUrl()` faz trim e devolve ""). */
async function withWarehouse<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const before = process.env.WAREHOUSE_URL ?? "";
  process.env.WAREHOUSE_URL = value;
  try {
    return await fn();
  } finally {
    process.env.WAREHOUSE_URL = before;
  }
}

test("com warehouse local: chama a RDW com o limite diário", async () => {
  const calls: { limit: number }[] = [];
  const ran = await withWarehouse("postgresql://u:p@localhost:5432/warehouse", () =>
    kmRdwStep(async (opts) => {
      calls.push(opts);
    }),
  );
  assert.equal(ran, true);
  assert.deepEqual(calls, [{ limit: RDW_DAILY_LIMIT }]);
});

test("sem WAREHOUSE_URL: o passo salta e não chama a RDW", async () => {
  let called = false;
  const ran = await withWarehouse("", () =>
    kmRdwStep(async () => {
      called = true;
    }),
  );
  assert.equal(ran, false);
  assert.equal(called, false);
});
