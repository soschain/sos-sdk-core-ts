// Flow contract: editable metadata retains unknown purpose strings and serializes only the four declared role buckets in stable order.
import assert from 'node:assert/strict'
import test from 'node:test'
import {ClaimConsent as C,ConsentStatuses,HealthcareConsentPurposes} from 'fhir-data-utils-ts'
import {HealthcareActorRoles,HealthcareRoleFamilies,getHealthcareRolesByFamily} from 'sos-data-utils-ts/healthcare-roles'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {buildStableActorIdentifier,StableActorContactKinds} from 'antifraud-data-utils-ts/organization-identity'
const entry=(extra={})=>({fullUrl:`urn:uuid:${SAFE.resourceUuid}`,claims:{[C.identifier]:SAFE.resourceUuid,[C.subject]:SAFE.didWeb,[C.status]:ConsentStatuses.Draft,[C.decision]:'permit',[C.actorIdentifier]:SAFE.individualEmail,[C.purpose]:HealthcareConsentPurposes.Treatment,...extra}})

test('keeps inherited property names as unknown purpose strings rather than inherited label values',async()=>{
  const {createConsentAccessEditor}=await import('../dist/consent-access-editor.js')
  for(const code of ['__proto__','constructor','toString']){
    const editor=createConsentAccessEditor().upsertActiveConsentEntry(entry({[C.purpose]:code}))
    assert.deepEqual(editor.getConsentViewModel().classifiedPurposes,[{code,display:code}])
  }
})

test('preserves declared role-bucket order independently of object insertion order and ignores extra buckets',async()=>{
  const {createConsentAccessEditor}=await import('../dist/consent-access-editor.js')
  const mother=getHealthcareRolesByFamily(HealthcareRoleFamilies.PersonalRelationshipHl7).MTH
  const controller=getHealthcareRolesByFamily(HealthcareRoleFamilies.LegalRepresentativeHl7).RESPRSN
  const expected=[HealthcareActorRoles.Dentist,mother.claim,controller.claim]
  const editor=createConsentAccessEditor().upsertActiveConsentEntry(entry({[C.actorRole]:expected.join(',')}))
  const view=editor.getConsentViewModel(),roles=view.classifiedRoles
  editor.applyConsentViewModel({...view,classifiedRoles:{other:roles.other,legalRepresentative:roles.legalRepresentative,relationship:roles.relationship,professional:roles.professional,unexpected:[{codingSystem:'custom',code:'extra'}]}})
  assert.equal(editor.getBundleInMemory().data[0].resource.meta.claims[C.actorRole],expected.join(','))
})

test('retains opaque actor constraints that the classified contact view cannot represent',async()=>{
  const {createConsentAccessEditor}=await import('../dist/consent-access-editor.js')
  const opaque=buildStableActorIdentifier({contactKind:StableActorContactKinds.Email,contact:SAFE.firstContactEmail})
  const tokens=[SAFE.individualEmail,opaque]
  const editor=createConsentAccessEditor().upsertActiveConsentEntry(entry({[C.actorIdentifier]:tokens.join(',')}))
  editor.applyConsentViewModel(editor.getConsentViewModel())
  assert.deepEqual(new Set(String(editor.getBundleInMemory().data[0].resource.meta.claims[C.actorIdentifier]).split(',')),new Set(tokens))
})
