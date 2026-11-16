// Flow contract: the shared emergency orchestrator keeps ServiceRequest and triage Task independent, and binds an optional literal patient Communication to the same request, subject, sender and selected service without granting transport or clinical authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {CommunicationClaim as C,ServiceRequestClaim as S} from 'fhir-data-utils-ts/claims'
import {TaskClaim as T} from 'sos-data-utils-ts/task-artifact-schema'
import {orchestrateEmergencyRequest} from '../dist/care-emergency-alert-orchestration.js'

const text='  Synthetic request, caf\u00e9\n\u6c34\n  '
const input={
 intake:{idempotencyKey:'emergency-message-one',serviceRequestEntryId:'request-message-one',triageTaskEntryId:'triage-message-one',subjectReference:'Patient/subject-one',requesterReference:'RelatedPerson/controller-one',targetServiceReference:'HealthcareService/service-one',triageOwnerReference:'Group/triage-one',jurisdiction:'CA-BC',receivedAt:'2030-01-01T10:00:00.000Z',communicationThreadId:'thread-message-one'},
 serviceRequestIdentifier:'urn:uuid:00000000-0000-4000-8000-000000000011',
 triageTaskIdentifier:'urn:uuid:00000000-0000-4000-8000-000000000012',
 assistanceCode:{system:'https://example.invalid/fhir/CodeSystem/assistance',code:'urgent-care'},
}
const patientMessage={entryId:'patient-message-one',identifier:'urn:uuid:00000000-0000-4000-8000-000000000013',text}

test('plans the optional exact literal body using the existing request and routing coordinates',()=>{
 const plan=orchestrateEmergencyRequest({...input,patientMessage})
 assert.ok(plan.communicationEntry,'optional message must be an independent Communication entry')
 assert.equal(plan.communicationEntry.resourceType,'Communication')
 assert.equal(plan.communicationEntry.claims[C.ContentString],text)
 assert.equal(plan.communicationEntry.claims[C.BasedOn],plan.serviceRequestEntry.reference)
 assert.equal(plan.communicationEntry.claims[C.Subject],input.intake.subjectReference)
 assert.equal(plan.communicationEntry.claims[C.Sender],input.intake.requesterReference)
 assert.equal(plan.communicationEntry.claims[C.Recipient],input.intake.targetServiceReference)
 assert.equal(plan.communicationEntry.claims[C.Text],undefined)
 assert.equal(plan.communicationEntry.claims[C.NoteText],undefined)
 assert.equal(plan.triageTaskEntry.claims[T.Focus],plan.serviceRequestEntry.reference)
 assert.equal(plan.serviceRequestEntry.claims[S.Performer],input.intake.targetServiceReference)
})

test('retains the exact pre-message request and Task shape when the optional message is absent',()=>{
 const plan=orchestrateEmergencyRequest(input)
 assert.deepEqual(Object.keys(plan).sort(),['intake','serviceRequestEntry','triageTaskEntry'])
 assert.equal(plan.serviceRequestEntry.resourceType,'ServiceRequest')
 assert.equal(plan.triageTaskEntry.claims[T.Focus],plan.serviceRequestEntry.reference)
 assert.equal(plan.triageTaskEntry.claims[T.Owner],input.intake.triageOwnerReference)
})

test('retains an explicitly supplied real Encounter link on the ServiceRequest without changing triage focus',()=>{
 const plan=orchestrateEmergencyRequest({...input,encounterReference:'Encounter/existing-one'})
 assert.equal(plan.serviceRequestEntry.claims[S.Encounter],'Encounter/existing-one')
 assert.equal(plan.triageTaskEntry.claims[T.Focus],plan.serviceRequestEntry.reference)
 assert.throws(()=>orchestrateEmergencyRequest({...input,encounterReference:'Task/not-an-encounter'}),TypeError)
})

test('rejects malformed supplied text and caller-supplied recipient overrides rather than ignoring them',()=>{
 for(const message of [{...patientMessage,text:''},{...patientMessage,text:42},{...patientMessage,recipient:'Organization/foreign-one'}]){
  assert.throws(()=>orchestrateEmergencyRequest({...input,patientMessage:message}),TypeError)
 }
})
