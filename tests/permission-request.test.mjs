// Flow contract: a professional proposes missing access as a correlated Communication with one draft Consent, retaining the existing wire format for later controller approval.
import assert from 'node:assert/strict'
import test from 'node:test'
import {REPOSITORY_SAFE_EXAMPLES as E} from 'sos-data-utils-ts/repository-privacy'
import {ClaimConsent,CommunicationClaim,ConsentStatuses,ConsentDecisions,HealthcareConsentPurposes,CommunicationCategoryCodes} from 'fhir-data-utils-ts'
import * as sdk from '../dist/index.js'

function input(){return {subject:E.didWeb+':individual:subject',requester:{actorKind:'professional',did:E.didWeb+':professional:actor',email:E.individualEmail,phone:E.phoneE164,organizationDid:E.didWeb+':organization:clinic',organizationUrl:E.httpsBaseUrl,jurisdiction:'ES-MD'},requesterRole:'ISCO-08|2261',purpose:HealthcareConsentPurposes.Treatment,missing:{sections:['LOINC|11450-4','LOINC|48765-2'],resourceTypes:['Condition'],pairs:[]},communicationIdentifier:'urn:uuid:'+E.resourceUuid,consentIdentifier:'urn:uuid:'+E.demoOrganizationUuids.healthCare,thid:'synthetic-permission-request',sender:E.didWeb+':professional:actor',recipient:E.didWeb+':individual:subject',justification:'Synthetic access proposal'}}

test('the permission-request operation is exported by SOS Core',()=>{
 assert.equal(typeof sdk.buildPermissionRequestCommunication,'function')
})

test('one proposed Consent retains the existing request wire and exact requester selectors',()=>{
 const source=input(),before=structuredClone(source)
 const result=sdk.buildPermissionRequestCommunication(source)
 assert.deepEqual(source,before)
 assert.equal(result.thid,source.thid)
 assert.equal(result.subject,source.subject)
 assert.equal(result.sender,source.sender)
 assert.equal(result.recipient,source.recipient)
 assert.deepEqual(result.category,[CommunicationCategoryCodes.Notification.attributeValue])
 assert.equal(result.text,source.justification)
 assert.equal(result.claims[CommunicationClaim.NoteText],source.justification)
 assert.equal(result.payload.resourceType,'Bundle')
 assert.equal(result.payload.type,'batch')
 assert.equal(result.payload.data.length,1)
 assert.deepEqual(result.payload.data[0],{
  type:'Consent-create-request-v1.0',fullUrl:source.consentIdentifier,
  resource:{resourceType:'Consent',id:source.consentIdentifier,meta:{claims:{
   '@context':'org.hl7.fhir.api',[ClaimConsent.identifier]:source.consentIdentifier,
   [ClaimConsent.status]:ConsentStatuses.Draft,[ClaimConsent.subject]:source.subject,
   [ClaimConsent.decision]:ConsentDecisions.Permit,
   [ClaimConsent.actorIdentifier]:[source.requester.did,source.requester.email,source.requester.phone,source.requester.organizationDid,source.requester.organizationUrl,source.requester.jurisdiction].join(','),
   [ClaimConsent.actorRole]:source.requesterRole,[ClaimConsent.purpose]:source.purpose,
   [ClaimConsent.action]:source.missing.sections.join(','),[ClaimConsent.resourceType]:'Condition',
  }},status:ConsentStatuses.Draft},request:{method:'POST',url:'Consent'},
 })
})

test('a phone-bound requester can propose access without an email address',()=>{
 const source=input()
 source.requester={actorKind:'professional',did:source.requester.did,phone:E.phoneE164}
 const result=sdk.buildPermissionRequestCommunication(source)
 assert.equal(result.payload.data[0].resource.meta.claims[ClaimConsent.actorIdentifier],[source.requester.did,E.phoneE164].join(','))
 assert.equal(result.payload.data[0].resource.status,ConsentStatuses.Draft)
})

test('section-only proposals omit unused optional selectors instead of writing empty claim values',()=>{
 const source=input();delete source.requesterRole;delete source.purpose;source.missing.resourceTypes=[]
 const claims=sdk.buildPermissionRequestCommunication(source).payload.data[0].resource.meta.claims
 for(const key of [ClaimConsent.actorRole,ClaimConsent.purpose,ClaimConsent.resourceType])assert.equal(Object.hasOwn(claims,key),false)
 assert.equal(claims[ClaimConsent.action],source.missing.sections.join(','))
})

test('omitted justification retains the generated missing-coverage message',()=>{
 const source=input();delete source.justification
 const result=sdk.buildPermissionRequestCommunication(source)
 assert.equal(result.text,'Missing consent coverage for LOINC|11450-4, LOINC|48765-2 and Condition.')
})

test('missing correlation, subject or explicit identifiers fail before returning a proposal',()=>{
 for(const field of ['subject','communicationIdentifier','consentIdentifier','thid','sender','recipient']){
  const source=input();delete source[field]
  assert.throws(()=>sdk.buildPermissionRequestCommunication(source),/permission_request_.*_required/u)
 }
})

test('empty or malformed requested targets do not produce an unscoped proposal',()=>{
 for(const missing of [{sections:[],resourceTypes:[],pairs:[]},{sections:[123],resourceTypes:[],pairs:[]}]){
  assert.throws(()=>sdk.buildPermissionRequestCommunication({...input(),missing}),/permission_request_targets_invalid/u)
 }
})

test('a proposal requires actual requester selectors',()=>{
 assert.throws(()=>sdk.buildPermissionRequestCommunication({...input(),requester:{actorKind:'professional'}}),/permission_request_requester_required/u)
})
