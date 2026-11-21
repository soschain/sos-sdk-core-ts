import {
  buildResearchStudyDatasetPublication, ClaimsHealthDcatDataset, ClaimsHealthDcatDataService,
  normalizeHealthDcatResource,
} from 'sos-data-utils-ts/health-dcat'
import { normalizeProvenanceR5FlatClaimsResource } from 'sos-data-utils-ts/provenance'

type Row = Readonly<Record<string, unknown>>
const record = (value: unknown): Row | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined

/** Preserves the approved document and defines how many listings the gateway must confirm. */
export function planReviewedOfferingBatch(input: Readonly<{ document: Row; operationId: string }>) {
  const data = input.document?.data
  if (!Array.isArray(data) || data.length === 0) throw new TypeError('catalog_offering_document_invalid')
  const type = record(data[0])?.type
  if ((type !== 'Product' && type !== 'Service') || data.some(entry => record(entry)?.type !== type)) {
    throw new TypeError('catalog_offering_batch_mixed_types')
  }
  return { ...input, expectedTotal: data.length }
}

export function readOfferingPublicationReceipt(value: unknown, expectedTotal?: number): { total: number } | undefined {
  const receipt = record(value)
  const total = record(receipt?.body)?.total
  if (receipt?.type !== 'org.schema.catalog-publication' || typeof total !== 'number'
      || !Number.isSafeInteger(total) || total < 1 || (expectedTotal !== undefined && total !== expectedTotal)) return
  return { total }
}

export type OfferingReference = Readonly<{ type: 'Product' | 'Service'; id: string }>
export type OfferingReferenceInput = OfferingReference & Readonly<{ operationId: string }>

/** Only an exact JSON:API resource identifier belongs in a withdrawal or history request. */
export function planOfferingReference({ type, id, operationId }: OfferingReferenceInput) {
  if ((type !== 'Product' && type !== 'Service') || typeof id !== 'string'
      || !id || id.length > 2000 || id !== id.trim() || id === '*'
      || typeof operationId !== 'string' || !/^[A-Za-z0-9:_.-]{1,200}$/u.test(operationId)) {
    throw new TypeError('catalog_offering_reference_invalid')
  }
  return { document: { data: { type, id } }, operationId }
}

export type OfferingHistoryVersion = Readonly<{
  versionId: string
  contentHash: string
  status: 'imported' | 'published' | 'withdrawn'
  offering: Row & OfferingReference
  recordedAt?: string
}>

/** Binds every returned version to the resource the controller requested. */
export function readOfferingHistoryReceipt(value: unknown, reference: OfferingReference) {
  const receipt = record(value)
  const entries = record(receipt?.body)?.versions
  if (receipt?.type !== 'org.schema.catalog-history' || !Array.isArray(entries)) return
  const versions: OfferingHistoryVersion[] = []
  for (const entry of entries) {
    const row = record(entry)
    const offering = record(row?.offering)
    if (!row || !offering || offering.type !== reference.type || offering.id !== reference.id
        || typeof row.versionId !== 'string' || !row.versionId
        || typeof row.contentHash !== 'string' || !/^[a-f0-9]{64}$/u.test(row.contentHash)
        || (row.status !== 'imported' && row.status !== 'published' && row.status !== 'withdrawn')
        || (row.recordedAt !== undefined && (typeof row.recordedAt !== 'string' || !Number.isFinite(Date.parse(row.recordedAt))))) return
    versions.push({
      versionId: row.versionId, contentHash: row.contentHash, status: row.status,
      offering: { ...offering, type: reference.type, id: reference.id },
      ...(row.recordedAt !== undefined ? { recordedAt: row.recordedAt } : {}),
    })
  }
  return { versions }
}

export type ResearchStudyDatasetPublicationInput = Readonly<{
  distribution: unknown
  dataService: unknown
  dataset: unknown
  provenance: unknown
  researchStudyIdentifier: string
  catalogRecordIdentifier: string
  modifiedAt: string
  operationId: string
}>

type ResearchPublicationAuthority = Pick<Parameters<typeof buildResearchStudyDatasetPublication>[0],
  'organizationIdentifier' | 'controllerIdentifier' | 'actingControllerIdentifier'>

/** Validate the full study graph before handing ordered writes to a delivery adapter. */
export function planResearchStudyDatasetPublication(input: ResearchStudyDatasetPublicationInput, authority: ResearchPublicationAuthority) {
  const { researchStudyIdentifier, operationId } = input
  if (typeof operationId !== 'string' || !/^[A-Za-z0-9:_.-]{1,180}$/u.test(operationId)) {
    throw new TypeError('workforce_catalog_operation_invalid')
  }
  const distribution = normalizeHealthDcatResource(input.distribution)
  const dataService = normalizeHealthDcatResource(input.dataService)
  const dataset = normalizeHealthDcatResource(input.dataset)
  const provenance = normalizeProvenanceR5FlatClaimsResource(input.provenance)
  const distributions = dataset.meta.claims[ClaimsHealthDcatDataset.distribution]
  const served = dataService.meta.claims[ClaimsHealthDcatDataService.servesDataset]
  if (distribution.resourceType !== 'Distribution' || dataService.resourceType !== 'DataService' || dataset.resourceType !== 'Dataset'
      || !/^ResearchStudy\/[A-Za-z0-9.-]{1,64}$/u.test(researchStudyIdentifier)
      || !provenance.meta.claims['Provenance.target']?.includes(researchStudyIdentifier)
      || dataset.meta.claims[ClaimsHealthDcatDataset.source] !== researchStudyIdentifier
      || dataset.meta.claims[ClaimsHealthDcatDataset.publisher] !== authority.organizationIdentifier
      || dataService.meta.claims[ClaimsHealthDcatDataService.publisher] !== authority.organizationIdentifier
      || !Array.isArray(distributions) || !distributions.includes(distribution.id)
      || !Array.isArray(served) || !served.includes(dataset.id)) throw new TypeError('workforce_dataset_binding_invalid')

  const publication = buildResearchStudyDatasetPublication({
    ...authority, dataset, researchStudyIdentifier, provenanceReference: `Provenance/${provenance.id}`,
    catalogRecordIdentifier: input.catalogRecordIdentifier, status: 'published', modifiedAt: input.modifiedAt,
  })
  if ([distribution, dataService, publication.dataset, publication.record].some(resource => !/^[A-Za-z0-9._:-]{1,256}$/u.test(resource.id))
      || !/^[A-Za-z0-9.-]{1,64}$/u.test(provenance.id)) throw new TypeError('workforce_dataset_binding_invalid')

  return { publication, writes: [
    { format: 'org.w3.dcat', resourceType: 'Distribution', method: 'PUT', resource: distribution, operationId: `${operationId}-distribution` },
    { format: 'org.w3.dcat', resourceType: 'DataService', method: 'PUT', resource: dataService, operationId: `${operationId}-data-service` },
    { format: 'org.hl7.fhir.r5', resourceType: 'Provenance', method: 'PUT', resource: provenance, operationId: `${operationId}-provenance` },
    { format: 'org.w3.dcat', resourceType: 'Dataset', method: 'POST', resource: publication.dataset, operationId: `${operationId}-dataset` },
    { format: 'org.w3.dcat', resourceType: 'CatalogRecord', method: 'POST', resource: publication.record, operationId: `${operationId}-record` },
  ] as const }
}
