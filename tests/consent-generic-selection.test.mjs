// Flow contract: generic Bundle selection preserves mixed-resource navigation while openConsent alone enforces the Consent resource boundary.
import test from 'node:test'
import assert from 'node:assert/strict'
import {ClaimConsent as C,DocumentReferenceClaim,ResourceTypesFhirR4} from 'fhir-data-utils-ts'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {createConsentAccessEditor} from '../dist/consent-access-editor.js'

test('generic selection navigates mixed resource entries without changing their data or Communication subject',()=>{
  const consentId=`urn:uuid:${SAFE.resourceUuid}`
  const documentId=`urn:uuid:${SAFE.organizationScopedResources.departmentUuid}`
  const consent={type:ResourceTypesFhirR4.Consent,fullUrl:consentId,resource:{resourceType:ResourceTypesFhirR4.Consent,meta:{claims:{[C.identifier]:consentId,[C.subject]:SAFE.didWeb}}}}
  const document={type:ResourceTypesFhirR4.DocumentReference,fullUrl:documentId,resource:{resourceType:ResourceTypesFhirR4.DocumentReference,meta:{claims:{[DocumentReferenceClaim.Identifier]:documentId}}}}
  const bundle={resourceType:'Bundle',type:'batch',data:[consent,document]}
  const editor=createConsentAccessEditor({initialBundle:bundle}).selectActiveEntry({position:0})
  const communication=editor.getCommunicationClaims()
  assert.equal(editor.selectActiveEntry({position:1}),editor)
  assert.equal(editor.getActiveEntryPosition(),1)
  assert.deepEqual(editor.getActiveEntry(),document)
  assert.deepEqual(editor.getBundleInMemory(),bundle)
  assert.deepEqual(editor.getCommunicationClaims(),communication)
  assert.equal(editor.selectActiveEntry({fullUrl:documentId}),editor)
  assert.deepEqual(editor.getActiveEntry(),document)
  assert.equal(editor.selectActiveEntry({fullUrl:consentId}),editor)
  assert.equal(editor.getConsentViewModel().identifier,consentId)
})
