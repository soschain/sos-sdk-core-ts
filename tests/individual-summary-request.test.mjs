// Flow contract: compose a subject-bound summary request without manufacturing consent, actor roles, or permission grants.
import test from 'node:test'
import assert from 'node:assert/strict'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {HealthcareCoreSections} from 'sos-data-utils-ts/healthcare-sections'
import {buildIndividualSummaryRequestCommunication} from '../dist/individual-summary-request.js'

const input={subjectId:`${SAFE.didWeb}:individual:subject`,requesterId:`${SAFE.didWeb}:employee:requester`,thid:SAFE.resourceUuid,sent:'2026-01-02T03:04:05.000Z',communicationIdentifier:`urn:uuid:${SAFE.resourceUuid}`}
const decode=resource=>JSON.parse(Buffer.from(resource.payload.find(item=>item.contentAttachment)?.contentAttachment.data,'base64').toString('utf8'))

test('an all-sections request preserves the operation, subject, actor and Parameters attachment without a grant',()=>{
  const result=buildIndividualSummaryRequestCommunication(input)
  const entry=result.body.data[0]
  assert.equal(result.thid,input.thid)
  assert.equal(entry.type,'Communication-request-search-with-reference-url-v1.0')
  assert.equal(entry.resource.subject.reference,input.subjectId)
  assert.equal(entry.resource.sender.reference,input.requesterId)
  assert.equal(entry.resource.sent,input.sent)
  assert.equal(entry.resource.payload[0].contentReference.reference,'individual/org.hl7.fhir.api/Subject/$summary')
  const parameters=decode(entry.resource)
  assert.equal(parameters.resourceType,'Parameters')
  assert.deepEqual(parameters.parameter.find(item=>item.name==='subject'),{name:'subject',valueString:input.subjectId})
  assert.equal(parameters.parameter.find(item=>item.name==='document-type').valueCoding.code,'60591-5')
  assert.equal(parameters.parameter.filter(item=>item.name==='section').length,0)
  assert.doesNotMatch(JSON.stringify(result),/requesterKind|requesterRole|filterSections|Consent|access_token/)
})

test('requested sections remain explicit repeated Parameters and recipients are descriptive',()=>{
  const result=buildIndividualSummaryRequestCommunication({...input,sections:[HealthcareCoreSections.AllergiesAndIntolerances.claim,HealthcareCoreSections.HistoryOfMedicationUse.claim],recipient:[input.requesterId]})
  const resource=result.body.data[0].resource
  assert.deepEqual(decode(resource).parameter.filter(item=>item.name==='section').map(item=>item.valueString),[HealthcareCoreSections.AllergiesAndIntolerances.claim,HealthcareCoreSections.HistoryOfMedicationUse.claim])
  assert.deepEqual(resource.recipient,[{reference:input.requesterId}])
})

test('missing subject or requester and permission wildcard requests are rejected',()=>{
  for(const invalid of [{...input,subjectId:''},{...input,requesterId:''},{...input,sections:['*']}])assert.throws(()=>buildIndividualSummaryRequestCommunication(invalid))
})
