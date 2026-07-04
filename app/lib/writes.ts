import "server-only";

/**
 * Stage-2 write gate (grill-me Q2, bead 9bq.24): runtime env flag so writes
 * can be armed/disarmed with a container restart, no rebuild. Every server
 * action MUST check this — hiding UI affordances is not enforcement.
 */
export function writesEnabled(): boolean {
  return process.env.PO_WRITES_ENABLED === "1";
}
