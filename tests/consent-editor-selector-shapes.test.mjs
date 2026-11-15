// Flow contract: malformed existing security selectors must fail before editing an active Consent; scalar, CSV and string-array claims retain their constraints.
import assert from 'node:assert/strict'
import test from 'node:test'
import {ClaimConsent as C,ConsentStatuses,HealthcareConsentPurposes,FHIR_IPS_SECTION_CODES,ResourceTypesFhirR4} from 'fhir-data-utils-ts'
import {FHIR_IPS_DOCUMENT_TYPE_CLAIM} from 'fhir-data-utils-ts/clinical-document-bundle'
import {HealthcareActorRoles} from 'sos-data-utils-ts/healthcare-roles'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'

const fullUrl=`urn:uuid:${SAFE.resourceUuid}`
const valid={
  [C.identifier]:fullUrl,[C.subject]:SAFE.didWeb,[C.status]:ConsentStatuses.Active,[C.decision]:'permit',
  [C.actorIdentifier]:SAFE.individualEmail,[C.actorRole]:HealthcareActorRoles.Dentist,
  [C.action]:`LOINC|${FHIR_IPS_SECTION_CODES.Immunizations}`,[C.category]:FHIR_IPS_DOCUMENT_TYPE_CLAIM,
  [C.resourceType]:ResourceTypesFhirR4.Composition,[C.purpose]:HealthcareConsentPurposes.Treatment,
}
const selectorKeys=[C.actorIdentifier,C.actorRole,C.action,C.category,C.resourceType,C.purpose]
const bundle=claims=>({resourceType:'Bundle',type:'batch',data:[{type:ResourceTypesFhirR4.Consent,fullUrl,resource:{resourceType:ResourceTypesFhirR4.Consent,meta:{claims}}}]})

test('rejects malformed selectors atomically and preserves every supported wire shape',async()=>{
  const {createConsentAccessEditor}=await import('../dist/consent-access-editor.js')
  const cleanView=createConsentAccessEditor({initialBundle:bundle(valid)}).openConsent({position:0}).getConsentViewModel()
  for(const key of [...selectorKeys,C.identifier,C.subject,C.decision]){
    for(const malformed of [null,{reference:SAFE.didWeb},[{reference:SAFE.didWeb}],[valid[key],{reference:SAFE.didWeb}],false,42]){
      const claims={...valid,[key]:malformed}
      const editor=createConsentAccessEditor({initialBundle:bundle(claims)})
      const before=editor.getBundleInMemory()
      assert.throws(()=>editor.openConsent({position:0}).getConsentViewModel(),/selector/i,key)
      assert.throws(()=>editor.applyConsentViewModel(cleanView),/selector/i,key)
      assert.deepEqual(editor.getBundleInMemory(),before,key)
      const fresh=createConsentAccessEditor()
      assert.throws(()=>fresh.upsertActiveConsentEntry({fullUrl,claims}),/selector/i,key)
      assert.equal(fresh.getBundleInMemory().data.length,0)
    }
  }
  for(const project of [value=>value,value=>` ${value},${value} `,value=>[value,`${value},${value}`]]){
    const claims={...valid,...Object.fromEntries(selectorKeys.map(key=>[key,project(valid[key])]))}
    const editor=createConsentAccessEditor({initialBundle:bundle(claims)}).openConsent({position:0})
    editor.applyConsentViewModel(editor.getConsentViewModel())
    const saved=editor.getBundleInMemory().data[0].resource.meta.claims
    for(const key of selectorKeys)assert.equal(saved[key],valid[key],key)
    assert.equal(saved[C.status],ConsentStatuses.Active)
  }
})
