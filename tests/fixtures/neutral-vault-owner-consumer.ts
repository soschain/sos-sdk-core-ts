// Flow contract: neutral storage types preserve existing SOS entry points and finite query syntax without importing product policy into Antifraud.
import type { IVaultRepository as NeutralRepository, VaultQuery as NeutralQuery, RecordBase } from 'antifraud-data-utils-ts/vault-repository'
import type { IVaultRepository as SosRepository, VaultQuery as SosQuery, VaultRecord } from 'sos-sdk-core-ts/vault-repository'
import type { RecordBase as SosRecord } from 'sos-data-utils-ts/confidential-storage'
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
const repositoryIdentity: Equal<NeutralRepository, SosRepository> = true
const queryIdentity: Equal<NeutralQuery, SosQuery> = true
const recordIdentity: Equal<RecordBase, VaultRecord> = true
const dataRecordIdentity: Equal<RecordBase, SosRecord> = true
// @ts-expect-error persisted records retain an identifier across all public paths
const missingId: SosRecord = {}
// @ts-expect-error indexed-attribute queries require their own explicit capability, not invented base-query fields
const wrongDialect: SosQuery = { indexName: 'unregistered-index' }
void [repositoryIdentity, queryIdentity, recordIdentity, dataRecordIdentity, missingId, wrongDialect]
