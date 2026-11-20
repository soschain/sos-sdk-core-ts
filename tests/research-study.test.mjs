// Flow contract: controller research decisions target exactly one study/registered role; review-team Group correlation is stable and descriptive, with membership authorized separately.
import assert from 'node:assert/strict'
import test from 'node:test'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {ClaimConsent as C, CommunicationClaim, CommunicationCategoryCodes, FhirCodeSystems, HealthcareConsentPurposes, ResearchStudyR5PartyRoleSystem} from 'fhir-data-utils-ts'
import * as sdk from '../dist/index.js'
const decision={consentId:SAFE.resourceUuid,researchStudyId:SAFE.resourceUuid,practitionerRoleId:SAFE.resourceUuid,actorRole:'ISCO-08|221',date:'2026-01-01'}
test('builds the same exact study-scoped request for member access and the active Consent action',()=>{
 const researchStudyId=SAFE.resourceUuid,reference=`ResearchStudy/${researchStudyId}`
 const request=sdk.buildResearchStudyProfessionalSmartRequest(researchStudyId)
 assert.deepEqual(request,{purpose:HealthcareConsentPurposes.Research,
  scopes:[`organization/ResearchSubject.crus?study=${reference}`],tokenCacheKey:`research-study:${reference}`})
 const action=sdk.buildResearchStudyActiveConsentBatch([decision]).data[0].resource.meta.claims[C.action]
 assert.equal(request.scopes[0],action)
 assert.equal(sdk.buildResearchStudyControllerImportScope(researchStudyId),`organization/ResearchSubject.c?study=${reference}`)
 assert.throws(()=>sdk.buildResearchStudyProfessionalSmartRequest('other?study=ResearchStudy/additional'),/research_study_resource_id_invalid/u)
})
test('composes an explicit active study-scoped Consent batch without delete authority',()=>{
 assert.equal(typeof sdk.buildResearchStudyActiveConsentBatch,'function')
 const batch=sdk.buildResearchStudyActiveConsentBatch([decision]);const entry=batch.data[0],claims=entry.resource.meta.claims
 assert.equal(entry.type,'Consent-v5.0.0');assert.deepEqual(entry.request,{method:'POST',url:'Consent'})
 assert.equal(claims[C.status],'active');assert.equal(claims[C.decision],'permit');assert.equal(claims[C.purpose],HealthcareConsentPurposes.Research)
 assert.equal(claims[C.sourceReference],`ResearchStudy/${SAFE.resourceUuid}`);assert.equal(claims[C.actorIdentifier],`PractitionerRole/${SAFE.resourceUuid}`)
 assert.equal(claims[C.action],`organization/ResearchSubject.crus?study=ResearchStudy/${SAFE.resourceUuid}`)
 assert.ok(Object.isFrozen(batch.data));assert.ok(Object.isFrozen(claims))
 for(const override of [{status:'draft'},{date:'2026-02-30'},{actorRole:'not-a-role'},{consentId:'../unsafe'}])assert.throws(()=>sdk.buildResearchStudyActiveConsentBatch([{...decision,...override}]))
 assert.throws(()=>sdk.buildResearchStudyActiveConsentBatch([]))
})
test('creates an empty descriptive team with the existing deterministic study identifier',()=>{
 const group={resourceType:'Group',id:SAFE.resourceUuid,type:'practitioner',membership:'enumerated',member:[]}
 const entry=sdk.buildResearchStudyGroupCreateEntry({group,researchStudyId:SAFE.resourceUuid})
 assert.equal(entry.type,'Group-v5.0.0');assert.equal(entry.resource.id,SAFE.resourceUuid);assert.deepEqual(entry.request,{method:'POST',url:'Group'})
 assert.deepEqual(sdk.buildResearchStudyReviewTeamGroupSearch(SAFE.resourceUuid),{identifier:'urn:ietf:rfc:3986|urn:uuid:5825fefb-f046-5be3-a4eb-b68965aad10b'})
 assert.throws(()=>sdk.buildResearchStudyGroupCreateEntry({group:{...group,member:[{entity:{reference:`PractitionerRole/${SAFE.resourceUuid}`}}]},researchStudyId:SAFE.resourceUuid}))
 assert.throws(()=>sdk.buildResearchStudyGroupCreateEntry({group:{...group,permission:['read']},researchStudyId:SAFE.resourceUuid}))
})

test('reuses the recorded study, group and invitation IDs on retry',()=>{
 const practitionerRoleReference=`PractitionerRole/${SAFE.demoOrganizationUuids.healthCare}`
 const input={operationId:SAFE.resourceUuid,practitionerRoleReferences:[practitionerRoleReference]}
 const result=sdk.buildResearchStudyCreateWorkflowIds(input)
 assert.deepEqual(result,{researchStudyId:SAFE.resourceUuid,groupId:'64106a95-e677-5850-aa0f-d1b4e6b5c459',invitations:[{
  practitionerRoleReference,communicationId:'4db03be5-7583-50a5-b8f4-260d6e666921',consentId:'8947c613-67b0-5022-bdfe-d55cc09e1c15',
 }]})
 assert.deepEqual(sdk.buildResearchStudyCreateWorkflowIds(input),result)
 assert.throws(()=>sdk.buildResearchStudyCreateWorkflowIds({...input,practitionerRoleReferences:[practitionerRoleReference,practitionerRoleReference]}),/duplicate/u)
})

test('builds separately correlated party and Group member PATCH entries',()=>{
 const groupId=SAFE.resourceUuid
 const first=`PractitionerRole/${SAFE.resourceUuid}`,second=`PractitionerRole/${SAFE.demoOrganizationUuids.healthCare}`
 const members=[{entity:{type:'PractitionerRole',reference:first}},{entity:{type:'PractitionerRole',reference:second}}]
 const associatedParties=members.map(member=>({role:{coding:[{system:ResearchStudyR5PartyRoleSystem,code:'collaborator'}]},party:member.entity}))
 const study=sdk.buildResearchStudyCreateEntry({study:{resourceType:'ResearchStudy',id:groupId,status:'draft',title:'Synthetic study'}})
 const party=sdk.buildResearchStudyPartyPatchEntries({researchStudyId:groupId,associatedParties})
 const group=sdk.buildResearchStudyGroupCreateEntry({group:{resourceType:'Group',id:groupId,type:'practitioner',membership:'enumerated',member:[]},researchStudyId:groupId})
 const memberEntries=sdk.buildResearchStudyGroupMemberPatchEntries({groupId,members})
 assert.deepEqual(sdk.buildResearchStudyBatch([study,...party]).data.map(item=>item.request.method),['POST','PATCH','PATCH'])
 assert.deepEqual(sdk.buildResearchStudyGroupBatch([group,...memberEntries]).data.map(item=>item.request.method),['POST','PATCH','PATCH'])
 assert.throws(()=>sdk.buildResearchStudyBatch([{...party[0],request:{method:'PATCH',url:'ResearchStudy/foreign'}}]))
 assert.throws(()=>sdk.buildResearchStudyGroupBatch([{...memberEntries[0],request:{method:'PATCH',url:'Group/foreign'}}]))
})

test('round-trips a claims-only invitation and rejects mismatched or active Consent',()=>{
 const recipient=`PractitionerRole/${SAFE.resourceUuid}`
 const invitation=sdk.buildResearchStudyPartyInvitation({researchStudyId:SAFE.resourceUuid,controllerReference:'Organization/synthetic-controller',
  communicationId:'study-invite',consentId:'draft-consent',associatedParty:{role:{coding:[{system:ResearchStudyR5PartyRoleSystem,code:'collaborator'}]},party:{reference:recipient}}})
 const claims=invitation.meta.claims
 assert.equal(claims[CommunicationClaim.Category],CommunicationCategoryCodes.Notification.attributeValue)
 assert.equal(claims[CommunicationClaim.Topic],`${FhirCodeSystems.ActReason}|${HealthcareConsentPurposes.Research}`)
 const document=sdk.decodeResearchStudyInvitationDocument(invitation)
 assert.equal(document.data[0].attributes[C.status],'draft')
 assert.equal(document.data[0].attributes[C.grantee],recipient)
 assert.equal(document.data[0].attributes[C.sourceReference],`ResearchStudy/${SAFE.resourceUuid}`)
 assert.throws(()=>sdk.decodeResearchStudyInvitationDocument({...invitation,meta:{claims:{...claims,[CommunicationClaim.Recipient]:'PractitionerRole/other'}}}),/invitation_document_invalid/u)
 const active=structuredClone(document);active.data[0].attributes[C.status]='active'
 assert.throws(()=>sdk.decodeResearchStudyInvitationDocument({...invitation,meta:{claims:{...claims,[CommunicationClaim.ContentAttachmentData]:btoa(JSON.stringify(active))}}}),/invitation_document_invalid/u)
})
