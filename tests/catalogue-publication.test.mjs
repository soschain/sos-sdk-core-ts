// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict'
import test from 'node:test'
import { REPOSITORY_SAFE_EXAMPLES as safe } from 'sos-data-utils-ts/repository-privacy'
import * as catalogue from '../dist/catalogue-publication.js'
const { planReviewedOfferingBatch, readOfferingPublicationReceipt } = catalogue

test('keeps the reviewed document and stable operation ID for the delivery adapter', () => {
  const data = [{ type: 'Product', id: safe.resourceUuid }]
  const document = { jsonapi: { version: '1.1' }, data }
  assert.deepEqual(planReviewedOfferingBatch({ document, operationId: safe.resourceUuid }), {
    document, operationId: safe.resourceUuid, expectedTotal: data.length,
  })
  assert.throws(() => planReviewedOfferingBatch({
    document: { data: [...data, { type: 'Service', id: safe.resourceUuid }] },
    operationId: safe.resourceUuid,
  }), /catalog_offering_batch_mixed_types/)
  assert.throws(() => planReviewedOfferingBatch({
    document: { data: [{ type: 'Dataset', id: safe.resourceUuid }] }, operationId: safe.resourceUuid,
  }), /catalog_offering_batch_mixed_types/)
})

test('requires a typed receipt confirming the entire publication', () => {
  const receipt = { type: 'org.schema.catalog-publication', body: { total: 2 } }
  assert.deepEqual(readOfferingPublicationReceipt(receipt, 2), { total: 2 })
  assert.equal(readOfferingPublicationReceipt(receipt, 3), undefined)
  assert.equal(readOfferingPublicationReceipt({ body: receipt.body }, 2), undefined)
})

test('targets exactly one catalogue entry and rejects invalid history receipts', () => {
  const reference = { type: 'Product', id: safe.resourceUuid }
  const input = { ...reference, operationId: safe.resourceUuid }
  assert.deepEqual(catalogue.planOfferingReference(input), {
    document: { data: reference }, operationId: safe.resourceUuid,
  })
  assert.throws(() => catalogue.planOfferingReference({ ...input, id: '*' }), /catalog_offering_reference_invalid/)
  const receipt = { type: 'org.schema.catalog-history', body: { versions: [] } }
  assert.deepEqual(catalogue.readOfferingHistoryReceipt(receipt, reference), { versions: [] })
  assert.equal(catalogue.readOfferingHistoryReceipt({ ...receipt, body: { versions: [{}] } }, reference), undefined)
  assert.equal(catalogue.readOfferingHistoryReceipt({ body: receipt.body }, reference), undefined)
})
