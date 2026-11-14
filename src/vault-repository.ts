/** Existing SOS public import path for neutral Antifraud storage contracts.
 * Authentication, scope, transaction capability and persistence adapters remain
 * explicit host/runtime responsibilities. The richer gateway port is distinct.
 */
export type {
  VaultRecord,
  VaultQueryCondition,
  VaultQuery,
  IVaultRepository,
} from 'antifraud-data-utils-ts/vault-repository'
