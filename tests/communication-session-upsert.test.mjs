// Flow contract: optional locator metadata never replaces the canonical per-resource identifier used to match staged entries.
import assert from 'node:assert/strict'
import test from 'node:test'
import {ClaimConsent as C,ResourceTypesFhirR4} from 'fhir-data-utils-ts'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
const identifier=`urn:uuid:${SAFE.resourceUuid}`

test('keeps distinct same-type entries when callers omit an optional fullUrl',async()=>{
  const {CommunicationAttachedBundleSession}=await import('../dist/communication-attached-bundle-session.js')
  const session=new CommunicationAttachedBundleSession()
  const identifiers=[identifier,`urn:uuid:${SAFE.organizationScopedResources.departmentUuid}`]
  for(const value of identifiers)session.upsertActiveEntry({resourceType:ResourceTypesFhirR4.Consent,claims:{[C.identifier]:value,[C.subject]:SAFE.didWeb}})
  assert.equal(session.getAttachedBundle().data.length,2)
  assert.deepEqual(session.getAttachedBundle().data.map(entry=>entry.resource.meta.claims[C.identifier]),identifiers)
  session.upsertActiveEntry({resourceType:ResourceTypesFhirR4.Consent,claims:{[C.identifier]:identifier,[C.subject]:SAFE.didWeb}})
  assert.equal(session.getAttachedBundle().data.length,2)
})
