// Flow contract: one shared local editor round-trips canonical flat Consent and Communication attachments; proposals stay draft and never confer controller authority.
import assert from 'node:assert/strict'
import test from 'node:test'
import {ClaimConsent as C,CommunicationClaim as M,ConsentStatuses,HealthcareConsentPurposes,FHIR_IPS_SECTION_CODES,ResourceTypesFhirR4} from 'fhir-data-utils-ts'
import {FHIR_IPS_DOCUMENT_TYPE_CLAIM} from 'fhir-data-utils-ts/clinical-document-bundle'
import {HealthcareActorRoles,HealthcareRoleFamilies,getHealthcareRolesByFamily} from 'sos-data-utils-ts/healthcare-roles'
import {MultichannelPermissionClaim} from 'sos-data-utils-ts/multichannel-permission-forms'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {isConsentRuleActive} from 'sos-data-utils-ts/consent-coverage'
import {Format} from 'sos-data-utils-ts/bff-wire-contract'

const identifier=`urn:uuid:${SAFE.resourceUuid}`
const section=`LOINC|${FHIR_IPS_SECTION_CODES.Immunizations}`
const mother=getHealthcareRolesByFamily(HealthcareRoleFamilies.PersonalRelationshipHl7).MTH
const controller=getHealthcareRolesByFamily(HealthcareRoleFamilies.LegalRepresentativeHl7).RESPRSN
const input=(extra={})=>({type:'Consent',fullUrl:identifier,request:{method:'POST',url:'individual/org.hl7.fhir.r4/Consent'},claims:{'@context':Format.FHIR_API,[C.identifier]:identifier,[C.subject]:SAFE.didWeb,[C.status]:ConsentStatuses.Draft,[C.decision]:'permit',[C.actorIdentifier]:SAFE.individualEmail,[C.actorRole]:HealthcareActorRoles.Dentist,[C.purpose]:HealthcareConsentPurposes.Treatment,[C.action]:section,...extra}})
const load=()=>import('../dist/consent-access-editor.js')

test('preserves exact flat Consent entry metadata and encoded Communication attachment keys',async()=>{
  const {createConsentAccessEditor}=await load()
  const source=input({[C.category]:FHIR_IPS_DOCUMENT_TYPE_CLAIM,[C.categoryText]:'Atención dental',[C.resourceType]:ResourceTypesFhirR4.Composition})
  const editor=createConsentAccessEditor({communicationClaims:{'@context':Format.FHIR_API}})
  editor.upsertActiveConsentEntry(source)
  editor.applyConsentViewModel(editor.getConsentViewModel())
  const bundle=editor.getBundleInMemory()
  assert.deepEqual(bundle,{resourceType:'Bundle',type:'batch',data:[{id:identifier,type:source.type,fullUrl:identifier,request:source.request,resource:{resourceType:'Consent',meta:{claims:source.claims}}}]})
  const communication=editor.getCommunicationClaims()
  assert.deepEqual(Object.keys(communication).sort(),['@context',M.ContentAttachmentData,M.ContentAttachmentType,M.Subject].sort())
  assert.equal(communication[M.ContentAttachmentType],'application/fhir+json')
  assert.equal(communication[M.Subject],SAFE.didWeb)
  assert.equal(communication[M.ContentAttachmentData],Buffer.from(JSON.stringify(bundle),'utf8').toString('base64'))
  assert.deepEqual(JSON.parse(Buffer.from(communication[M.ContentAttachmentData],'base64').toString('utf8')),bundle)
})

test('classifies occupations and personal relationships separately without treating a role as authority',async()=>{
  const {createConsentAccessEditor}=await load()
  const editor=createConsentAccessEditor()
  editor.upsertActiveConsentEntry(input({[C.actorRole]:[HealthcareActorRoles.Dentist,mother.claim,controller.claim,'custom-system|reviewer'].join(',')}))
  const roles=editor.getConsentViewModel().classifiedRoles
  assert.equal(roles.professional[0].kind,HealthcareRoleFamilies.ProfessionalOccupationIsco08)
  assert.equal(roles.relationship[0].code,mother.code)
  assert.equal(roles.legalRepresentative[0].code,controller.code)
  editor.applyConsentViewModel(editor.getConsentViewModel())
  assert.ok(String(editor.getBundleInMemory().data[0].resource.meta.claims[C.actorRole]).includes('custom-system|reviewer'))
  assert.equal(editor.getBundleInMemory().data[0].resource.meta.claims[C.status],ConsentStatuses.Draft)
})

test('round-trips direct contacts, organization departments and exact jurisdictions independently',async()=>{
  const {createConsentAccessEditor}=await load()
  const organization=`did:web:${SAFE.domain}:${SAFE.organizationScopedResources.departmentUuid}`
  const jurisdiction=`${SAFE.secondaryCountryIso2}-MD`
  const tokens=[jurisdiction,organization,SAFE.individualEmail,`tel:${SAFE.phoneE164}`]
  const editor=createConsentAccessEditor()
  editor.upsertActiveConsentEntry(input({[C.actorIdentifier]:tokens.join(',')}))
  const view=editor.getConsentViewModel()
  assert.equal(view.classifiedActors.jurisdictions[0].code,jurisdiction)
  assert.equal(view.classifiedActors.organizations[0].domain,SAFE.domain)
  assert.equal(view.classifiedActors.organizations[0].departments[0].code,SAFE.organizationScopedResources.departmentUuid)
  assert.equal(view.classifiedActors.users.length,2)
  editor.applyConsentViewModel(view)
  assert.deepEqual(new Set(String(editor.getBundleInMemory().data[0].resource.meta.claims[C.actorIdentifier]).split(',')),new Set(tokens))
  const stored=editor.getBundleInMemory()
  stored.data[0].resource.meta.claims[C.actorIdentifier]=[tokens.join(',')]
  const restored=createConsentAccessEditor({initialBundle:stored}).openConsent({position:0})
  const restoredActors=restored.getConsentViewModel().classifiedActors
  assert.equal(restoredActors.jurisdictions.length,1)
  assert.equal(restoredActors.organizations.length,1)
  assert.equal(restoredActors.users.length,2)
})

test('reopens by fullUrl or position and preserves unrelated claims and defensive copies',async()=>{
  const {createConsentAccessEditor}=await load()
  const editor=createConsentAccessEditor()
  editor.upsertActiveConsentEntry(input({[C.periodEnd]:SAFE.organizationScopedResources.slotEnd,[MultichannelPermissionClaim.RecipientSector]:'health-care'})).saveAndReleaseActiveEntry()
  editor.selectActiveEntry({position:0})
  const view=editor.getConsentViewModel()
  editor.applyConsentViewModel({...view,decision:'deny'}).saveAndReleaseActiveEntry()
  editor.openConsent({fullUrl:identifier})
  assert.equal(editor.getConsentViewModel().decision,'deny')
  const bundle=editor.getBundleInMemory()
  assert.equal(bundle.data[0].resource.meta.claims[C.periodEnd],SAFE.organizationScopedResources.slotEnd)
  assert.equal(bundle.data[0].resource.meta.claims[MultichannelPermissionClaim.RecipientSector],'health-care')
  bundle.data[0].resource.meta.claims[C.subject]='changed-outside-editor'
  assert.equal(editor.getConsentViewModel().subject,SAFE.didWeb)
  const stored=editor.getBundleInMemory()
  for(const key of [C.identifier,C.subject,C.decision])stored.data[0].resource.meta.claims[key]=[stored.data[0].resource.meta.claims[key]]
  const restored=createConsentAccessEditor({initialBundle:stored}).openConsent({position:0})
  assert.equal(restored.getConsentViewModel().identifier,identifier)
  assert.equal(restored.getConsentViewModel().subject,SAFE.didWeb)
})

test('rejects malformed or reversed permission periods before mutating editor state',async()=>{
  const {createConsentAccessEditor}=await load()
  for(const extra of [{[C.periodEnd]:'not-a-date'},{[C.periodStart]:SAFE.organizationScopedResources.slotEnd,[C.periodEnd]:SAFE.organizationScopedResources.slotStart}]){
    const editor=createConsentAccessEditor()
    assert.throws(()=>editor.upsertActiveConsentEntry(input(extra)),/period/i)
    assert.equal(editor.getBundleInMemory().data.length,0)
  }
})

test('keeps a proposed permit draft through editing and never materializes controller approval',async()=>{
  const {createConsentAccessEditor}=await load()
  const editor=createConsentAccessEditor()
  editor.upsertActiveConsentEntry(input())
  editor.applyConsentViewModel({...editor.getConsentViewModel(),decision:'permit'})
  const claims=editor.getBundleInMemory().data[0].resource.meta.claims
  assert.equal(claims[C.status],ConsentStatuses.Draft)
  assert.equal(isConsentRuleActive(claims),false)
})
