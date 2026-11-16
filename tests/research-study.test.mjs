// Flow contract: controller research decisions target exactly one study/registered role; review-team Group correlation is stable and descriptive, with membership authorized separately.
import assert from 'node:assert/strict'
import test from 'node:test'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {ClaimConsent as C, HealthcareConsentPurposes} from 'fhir-data-utils-ts'
import * as sdk from '../dist/index.js'
const decision={consentId:SAFE.resourceUuid,researchStudyId:SAFE.resourceUuid,practitionerRoleId:SAFE.resourceUuid,actorRole:'ISCO-08|221',date:'2026-01-01'}
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
