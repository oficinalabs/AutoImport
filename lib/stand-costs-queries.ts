/**
 * Ler e gravar os custos próprios do stand (`stand_cost_settings`, P09).
 * Base da app: nada disto se publica, é dado do stand.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { member, standCostSettings } from "../db/schema";
import { type StandCostSettings, checkStandCosts } from "./stand-costs";
import type { CountryCode } from "./types";

/** As definições do stand; null se nunca gravou nada (usa as médias). */
export async function getStandCostsQuery(standId: string): Promise<StandCostSettings | null> {
  const [row] = await db
    .select()
    .from(standCostSettings)
    .where(eq(standCostSettings.standId, standId))
    .limit(1);
  if (!row) return null;
  return {
    transport: (row.transport ?? {}) as Partial<Record<CountryCode, number>>,
    legalization: row.legalization,
    despachante: row.despachante,
    preparation: row.preparation,
    minMarginEur: row.minMarginEur,
    minMarginPct: row.minMarginPct,
    vatRegistered: row.vatRegistered,
  };
}

/** Grava (ou substitui) as definições do stand. Já validadas (`checkStandCosts`). */
export async function saveStandCostsMutation(standId: string, s: StandCostSettings): Promise<void> {
  const values = {
    transport: s.transport,
    legalization: s.legalization,
    despachante: s.despachante,
    preparation: s.preparation,
    minMarginEur: s.minMarginEur,
    minMarginPct: s.minMarginPct,
    vatRegistered: s.vatRegistered,
    updatedAt: new Date(),
  };
  await db
    .insert(standCostSettings)
    .values({ standId, ...values })
    .onConflictDoUpdate({ target: standCostSettings.standId, set: values });
}

/**
 * Valida e grava, mas só se `userId` for DONO de `standId`. Os dois ids vêm da
 * sessão (lib/data.ts), nunca do cliente; o que o cliente manda é só `input`.
 * Os erros são frases para o utilizador — nunca o erro cru da BD.
 */
export async function saveStandCostsAsOwner(
  standId: string,
  userId: string,
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = checkStandCosts(input);
  if (!check.ok) return check;

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, standId), eq(member.userId, userId)))
    .limit(1);
  if (row?.role !== "owner") {
    return { ok: false, error: "Só o dono do stand pode alterar os custos." };
  }

  await saveStandCostsMutation(standId, check.value);
  return { ok: true };
}
