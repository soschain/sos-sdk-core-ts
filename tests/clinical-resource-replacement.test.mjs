// Flow contract: descriptive document ownership and a strictly later same-owner version permit only a narrow successor decision; neither authenticates a sender nor authorizes deletion.
import assert from 'node:assert/strict'
import test from 'node:test'
import { REPOSITORY_SAFE_EXAMPLES as SAFE } from 'sos-data-utils-ts/repository-privacy'
import * as sdk from '../dist/index.js'

const organization = { fullUrl: SAFE.didWeb, resource: { resourceType: 'Organization', id: SAFE.resourceUuid } }
const actor = `urn:uuid:${SAFE.resourceUuid}`
const assignment = `urn:uuid:${SAFE.organizationScopedResources.departmentUuid}`
const direct = () => ({ resourceType: 'Bundle', type: 'document', entry: [
  { resource: { resourceType: 'Composition', author: [{ reference: SAFE.didWeb }], date: SAFE.organizationScopedResources.slotStart } }, organization,
] })

test('resolves a direct organization author without inventing authentication evidence', () => {
  assert.equal(typeof sdk.resolveClinicalDocumentAuthorOrganization, 'function')
  const bundle = direct()
  const result = sdk.resolveClinicalDocumentAuthorOrganization(bundle)
  assert.deepEqual(result, { authorReference: SAFE.didWeb, organizationReference: SAFE.didWeb, documentDate: SAFE.organizationScopedResources.slotStart })
  assert.equal(Object.hasOwn(result, 'authenticated'), false)
  assert.equal(bundle.entry[0].resource.author[0].reference, SAFE.didWeb)
})

test('resolves PractitionerRole and Practitioner author paths through organization references', () => {
  const role = { fullUrl: assignment, resource: { resourceType: 'PractitionerRole', practitioner: { reference: actor }, organization: { reference: SAFE.didWeb } } }
  for (const authorReference of [assignment, actor]) {
    const bundle = direct()
    bundle.entry[0].resource.author = [{ reference: authorReference }]
    bundle.entry.push(role, { fullUrl: actor, resource: { resourceType: 'Practitioner' } })
    assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(bundle).organizationReference, SAFE.didWeb)
  }
})

test('retains relative-reference and custodian fallback compatibility but rejects malformed graphs', () => {
  const bundle = direct()
  const relative = `Organization/${SAFE.resourceUuid}`
  bundle.entry[0].resource.author = [{ reference: relative }]
  assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(bundle).organizationReference, relative)
  bundle.entry[0].resource.author = [{ reference: actor }]
  bundle.entry[0].resource.custodian = { reference: SAFE.didWeb }
  bundle.entry.push({ fullUrl: actor, resource: { resourceType: 'Practitioner' } })
  assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(bundle).organizationReference, SAFE.didWeb)
  for (const value of [undefined, null, {}, { entry: [] }, { entry: [{ resource: { resourceType: 'Composition', author: [{ reference: SAFE.didWeb }], date: 'not-a-date' } }, organization] }]) {
    assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(value), undefined)
  }
})

test('allows only a strictly newer same-resource same-owner successor', () => {
  assert.equal(typeof sdk.evaluateClinicalResourceReplacement, 'function')
  const existing = { resourceId: SAFE.resourceUuid, authorOwnerIdentifier: SAFE.didWeb, documentDate: SAFE.organizationScopedResources.slotStart }
  const incoming = { ...existing, documentDate: SAFE.organizationScopedResources.slotEnd }
  assert.equal(sdk.evaluateClinicalResourceReplacement({ existing, incoming }), 'allow-organization-successor')
  for (const patch of [
    { resourceId: SAFE.organizationScopedResources.serviceUuid },
    { authorOwnerIdentifier: `${SAFE.didWeb}:other` }, { authorOwnerIdentifier: '' },
    { documentDate: existing.documentDate }, { documentDate: 'not-a-date' },
    { documentDate: '2000-01-01T00:00:00Z' },
  ]) assert.equal(sdk.evaluateClinicalResourceReplacement({ existing, incoming: { ...incoming, ...patch } }), 'deny')
  assert.equal(sdk.evaluateClinicalResourceReplacement({ existing: { ...existing, resourceId: '' }, incoming }), 'deny')
  assert.equal(sdk.evaluateClinicalResourceReplacement({ existing: { ...existing, documentDate: 'bad' }, incoming }), 'deny')
})

test('preserves combined fullUrl/relative lookup and requires an actual organization resource', () => {
  const bundle = direct()
  const reference = `${SAFE.didWeb}/Organization/${SAFE.resourceUuid}`
  bundle.entry[0].resource.author = [{ reference }]
  assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(bundle).organizationReference, reference)
  bundle.entry[1] = { fullUrl: SAFE.didWeb, resource: { resourceType: 'Practitioner', id: SAFE.resourceUuid } }
  assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(bundle), undefined)
})

test('uses the first Composition and first author while retaining custodian fallback behavior', () => {
  const bundle = direct()
  bundle.entry[0].resource.author = [{ reference: actor }, { reference: SAFE.didWeb }]
  assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(bundle), undefined)
  bundle.entry[0].resource.custodian = { reference: SAFE.didWeb }
  assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(bundle).authorReference, actor)
  bundle.entry.unshift({ resource: { resourceType: 'Composition', author: [{ reference: SAFE.didWeb }], date: 'not-a-date' } })
  assert.equal(sdk.resolveClinicalDocumentAuthorOrganization(bundle), undefined)
})
