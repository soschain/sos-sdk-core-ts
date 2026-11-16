import {CommunicationClaim as C,CommunicationCategoryCodes,FhirCodeSystems,FHIR_IPS_DOCUMENT_CODE,communicationPayloadProfileFlatToFhirR4,tokenToCoding,type FhirCommunicationResource} from 'fhir-data-utils-ts'
import {buildFhirParametersResourceFromSearchParams} from 'fhir-data-utils-ts/fhir-parameters'
import {CommunicationClaimsContext} from 'sos-data-utils-ts/consent-access-editor-contract'

export type IndividualSummaryRequestInput=Readonly<{
 subjectId:string;requesterId:string;thid?:string;sent?:string;communicationIdentifier?:string
 recipient?:string|readonly string[];sections?:readonly string[]
}>
export const IndividualSummaryRequestProfile=Object.freeze({
 messageType:'Communication-request-search-with-reference-url-v1.0',
 operationPath:'individual/org.hl7.fhir.api/Subject/$summary',
 attachmentType:'application/fhir+json',attachmentTitle:'summary-operation-parameters.json',
})
const required=(value:string,name:string)=>{const result=String(value??'').trim();if(!result)throw new TypeError(`summary_request_${name}_required`);return result}
const encode=(value:unknown)=>btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)),byte=>String.fromCharCode(byte)).join(''))

/** Compose an auditable summary request. Sender, recipients and requested sections confer no authority; the receiving host applies the caller's verified SMART permissions. */
export function buildIndividualSummaryRequestCommunication(input:IndividualSummaryRequestInput){
 const subject=required(input.subjectId,'subject'),sender=required(input.requesterId,'requester')
 const sections=(input.sections??[]).map(value=>String(value).trim()).filter(Boolean)
 if(sections.includes('*'))throw new TypeError('summary_request_omit_sections_instead_of_permission_wildcard')
 const parameters=buildFhirParametersResourceFromSearchParams({subject,section:sections})
 parameters.parameter.splice(1,0,{name:'document-type',valueCoding:{system:FhirCodeSystems.Loinc,code:FHIR_IPS_DOCUMENT_CODE}})
 const identifier=input.communicationIdentifier??`urn:uuid:${globalThis.crypto.randomUUID()}`
 const sent=input.sent??new Date().toISOString()
 const recipients=(typeof input.recipient==='string'?[input.recipient]:input.recipient??[]).map(value=>String(value).trim()).filter(Boolean)
 const claims:Record<string,string>={
  '@context':CommunicationClaimsContext,[C.Identifier]:identifier,[C.Status]:'completed',
  [C.Category]:CommunicationCategoryCodes.Notification.attributeValue,[C.Subject]:subject,[C.Sender]:sender,[C.Sent]:sent,
  [C.Text]:'Request IPS Bundle search',[C.NoteText]:'Request IPS Bundle search',
  [C.ContentReference]:IndividualSummaryRequestProfile.operationPath,
  [C.ContentAttachmentType]:IndividualSummaryRequestProfile.attachmentType,
  [C.ContentAttachmentTitle]:IndividualSummaryRequestProfile.attachmentTitle,[C.ContentAttachmentData]:encode(parameters),
 }
 if(recipients.length)claims[C.Recipient]=recipients.join(',')
 const category=tokenToCoding(claims[C.Category])
 const resource:FhirCommunicationResource={
  resourceType:'Communication',meta:{claims},identifier:[{value:identifier}],status:claims[C.Status],
  subject:{reference:subject},sender:{reference:sender},sent,
  ...(category?{category:[{coding:[category]}]}:{}),
  ...(recipients.length?{recipient:recipients.map(reference=>({reference}))}:{}),
  note:[{text:claims[C.NoteText]}],payload:communicationPayloadProfileFlatToFhirR4(claims),
 }
 return {thid:input.thid,body:{data:[{type:IndividualSummaryRequestProfile.messageType,resource}]}}
}
