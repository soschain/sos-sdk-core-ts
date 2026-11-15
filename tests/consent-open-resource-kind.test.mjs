// Flow contract: opening a Consent rejects a different resource kind before changing the active selection or Communication attachment.
import test from 'node:test'
import assert from 'node:assert/strict'
import {ClaimConsent as C,ConsentStatuses,DocumentReferenceClaim,ResourceTypesFhirR4} from 'fhir-data-utils-ts'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'

const load=()=>import('../dist/consent-access-editor.js')

test('rejects opening a non-Consent immediately and preserves the prior Consent selection atomically',async()=>{
  const {createConsentAccessEditor}=await load()
  const consentIdentifier=`urn:uuid:${SAFE.resourceUuid}`
  const documentIdentifier=`urn:uuid:${SAFE.organizationScopedResources.departmentUuid}`
  const consent={type:ResourceTypesFhirR4.Consent,fullUrl:consentIdentifier,resource:{resourceType:ResourceTypesFhirR4.Consent,meta:{claims:{[C.identifier]:consentIdentifier,[C.subject]:SAFE.didWeb,[C.status]:ConsentStatuses.Active,[C.decision]:'permit'}}}}
  const document={type:ResourceTypesFhirR4.DocumentReference,fullUrl:documentIdentifier,resource:{resourceType:ResourceTypesFhirR4.DocumentReference,meta:{claims:{[DocumentReferenceClaim.Identifier]:documentIdentifier}}}}
  const editor=createConsentAccessEditor({initialBundle:{resourceType:'Bundle',type:'batch',data:[consent,document]}}).openConsent({position:0})
  const priorBundle=editor.getBundleInMemory()
  const priorCommunication=editor.getCommunicationClaims()
  const priorView=editor.getConsentViewModel()
  for(const selection of [{position:1},{fullUrl:documentIdentifier}]){
    assert.throws(()=>editor.openConsent(selection),/consent_active_entry_required/)
    assert.equal(editor.getActiveEntryPosition(),0)
    assert.deepEqual(editor.getActiveEntry(),consent)
    assert.deepEqual(editor.getBundleInMemory(),priorBundle)
    assert.deepEqual(editor.getCommunicationClaims(),priorCommunication)
    assert.deepEqual(editor.getConsentViewModel(),priorView)
  }
  assert.equal(editor.openConsent({fullUrl:consentIdentifier}),editor)
  assert.equal(editor.getConsentViewModel().identifier,consentIdentifier)
})
