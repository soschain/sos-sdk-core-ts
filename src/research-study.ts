import {sha1} from '@noble/hashes/legacy.js'
import {
 ClaimConsent as C, CommunicationClaim, CommunicationCategoryCodes, ConsentDecisions, ConsentStatuses,
 FhirCodeSystems, HealthcareConsentPurposes, ResourceTypesFhirR5, normalizeGroupR5ResearchTeam,
 normalizeGroupR5FlatClaimsResource, projectGroupR5FlatClaimsResource, projectGroupPractitionerRoleMemberFlatClaimResources,
 normalizeResearchStudyAssociatedParties, normalizeResearchStudyR5FlatClaimsResource,
 projectResearchStudyR5FlatClaimsResource, projectResearchStudyAssociatedPartyFlatClaimResources,
} from 'fhir-data-utils-ts'
import {BundleEntryClaimsContext} from 'sos-data-utils-ts/consent-access-editor-contract'
import {HttpMediaTypes} from 'sos-data-utils-ts/bff-wire-contract'
import {buildResearchStudyReviewTeamIdentifier} from 'sos-data-utils-ts/research-review-team-identity'
export {buildResearchStudyReviewTeamGroupSearch} from 'sos-data-utils-ts/research-review-team-identity'
export type ResearchStudyActiveConsentInput=Readonly<{consentId:string;researchStudyId:string;practitionerRoleId:string;actorRole:string;date:string;status?:'active'}>
const id=(value:unknown):string=>{if(typeof value!=='string'||! /^[A-Za-z0-9.-]{1,64}$/u.test(value.trim()))throw new TypeError('research_study_resource_id_invalid');return value.trim()}
function freeze<T>(value:T):Readonly<T>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value}
const studyReference=(studyId:string)=>`ResearchStudy/${id(studyId)}`
const studyScope=(reference:string,operation:'crus'|'c')=>`organization/ResearchSubject.${operation}?study=${reference}`

/** Builds the exact member request. Only the gateway can grant it against current study Consent. */
export function buildResearchStudyProfessionalSmartRequest(studyId:string){
 const reference=studyReference(studyId)
 return {purpose:HealthcareConsentPurposes.Research,scopes:[studyScope(reference,'crus')],tokenCacheKey:`research-study:${reference}`}
}

/** Requests create-only access for a controller importing new ResearchSubjects. */
export function buildResearchStudyControllerImportScope(studyId:string){
 return studyScope(studyReference(studyId),'c')
}
/** Explicit controller decision commands, not invitation or membership-based authorization. */
export function buildResearchStudyActiveConsentBatch(inputs:readonly ResearchStudyActiveConsentInput[]){
 if(!Array.isArray(inputs)||!inputs.length)throw new TypeError('research_study_active_consent_batch_empty')
 return freeze({data:inputs.map(input=>{
  if(input.status!==undefined&&input.status!==ConsentStatuses.Active)throw new TypeError('research_study_active_consent_status_invalid')
  const study=studyReference(input.researchStudyId),actorRole=String(input.actorRole??'').trim(),date=String(input.date??'').trim()
  if(!/^ISCO-08\|[0-9]{1,4}$/u.test(actorRole))throw new TypeError('research_study_active_consent_actor_role_invalid')
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw new TypeError('research_study_active_consent_date_invalid')
  return {type:'Consent-v5.0.0',resource:{resourceType:ResourceTypesFhirR5.Consent,id:id(input.consentId),meta:{claims:{'@context':BundleEntryClaimsContext,[C.status]:ConsentStatuses.Active,[C.decision]:ConsentDecisions.Permit,[C.purpose]:HealthcareConsentPurposes.Research,[C.sourceReference]:study,[C.actorIdentifier]:`PractitionerRole/${id(input.practitionerRoleId)}`,[C.actorRole]:actorRole,[C.action]:studyScope(study,'crus'),[C.date]:date}}},request:{method:'POST',url:ResourceTypesFhirR5.Consent}}
 })})
}
/** Creates an empty descriptive team. Each member is persisted separately and conveys no access authority. */
export function buildResearchStudyGroupCreateEntry(input:Readonly<{group:unknown;researchStudyId:string}>){
 const group=normalizeGroupR5ResearchTeam(structuredClone(input.group))
 id(group.id)
 if(group.member.length)throw new TypeError('group_members_require_patch_entries')
 return freeze({type:'Group-v5.0.0',resource:projectGroupR5FlatClaimsResource({...group,identifier:[buildResearchStudyReviewTeamIdentifier(input.researchStudyId)]}),request:{method:'POST',url:'Group'}})
}

function record(value:unknown):Record<string,unknown>|undefined {
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined
}

function reference(value:unknown,resourceType:string):string {
 const current=String(value??'').trim()
 if(!current.startsWith(`${resourceType}/`))throw new TypeError('research_study_reference_invalid')
 id(current.slice(resourceType.length+1))
 return current
}

function workflowUuid(name:string,operationId:string):string {
 const namespace=Uint8Array.from(operationId.replace(/-/gu,'').match(/../gu)!,octet=>Number.parseInt(octet,16))
 const value=new TextEncoder().encode(name)
 const bytes=new Uint8Array(namespace.length+value.length)
 bytes.set(namespace);bytes.set(value,namespace.length)
 const digest=sha1(bytes).slice(0,16)
 digest[6]=(digest[6]&0x0f)|0x50;digest[8]=(digest[8]&0x3f)|0x80
 const hex=Array.from(digest,octet=>octet.toString(16).padStart(2,'0')).join('')
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

/** Stable IDs allow each separate write to be safely retried. */
export function buildResearchStudyCreateWorkflowIds(input:Readonly<{operationId:string;practitionerRoleReferences:readonly string[]}>){
 const operationId=String(input.operationId??'').trim().toLowerCase()
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(operationId)){
  throw new TypeError('research_study_create_operation_id_invalid')
 }
 if(!Array.isArray(input.practitionerRoleReferences))throw new TypeError('research_study_create_references_invalid')
 const parties=input.practitionerRoleReferences.map(party=>reference(party,'PractitionerRole'))
 if(new Set(parties).size!==parties.length)throw new TypeError('research_study_create_practitioner_role_duplicate')
 return freeze({researchStudyId:operationId,groupId:workflowUuid('Group',operationId),
  invitations:parties.map(practitionerRoleReference=>({practitionerRoleReference,
   communicationId:workflowUuid(`Communication|${practitionerRoleReference}`,operationId),
   consentId:workflowUuid(`Consent|${practitionerRoleReference}`,operationId),
  }))})
}

type StudyBatchResource='ResearchStudy'|'Group'

function studyBatchEntry<T extends StudyBatchResource,R extends {id:string}>(type:T,resource:R,method:'POST'|'PATCH'){
 return {type:`${type}-v5.0.0` as const,resource,request:{method,url:method==='POST'?type:`${type}/${resource.id}`}}
}

function studyBatch<T extends StudyBatchResource,R extends {id:string}>(entries:readonly unknown[],type:T,normalize:(value:unknown)=>R){
 if(!Array.isArray(entries)||!entries.length)throw new TypeError('research_study_batch_empty')
 return freeze({data:entries.map(value=>{
  const entry=record(value),request=record(entry?.request)
  if(entry?.type!==`${type}-v5.0.0`||(request?.method!=='POST'&&request?.method!=='PATCH')){
   throw new TypeError('research_study_batch_entry_invalid')
  }
  const normalized=studyBatchEntry(type,normalize(entry.resource),request.method)
  if(request.url!==normalized.request.url)throw new TypeError('research_study_batch_request_invalid')
  return normalized
 })})
}

export function buildResearchStudyCreateEntry(input:Readonly<{study:unknown}>){
 const study=record(input.study)
 if(study?.resourceType!=='ResearchStudy'||study.associatedParty!==undefined||!['draft','active','retired','unknown'].includes(String(study.status))){
  throw new TypeError('research_study_create_entry_invalid')
 }
 return freeze(studyBatchEntry('ResearchStudy',projectResearchStudyR5FlatClaimsResource({...study,id:id(study.id)}),'POST'))
}

export function buildResearchStudyPartyPatchEntries(input:Parameters<typeof projectResearchStudyAssociatedPartyFlatClaimResources>[0]){
 const resources=projectResearchStudyAssociatedPartyFlatClaimResources({...input,researchStudyId:id(input.researchStudyId)})
 return freeze(resources.map(resource=>studyBatchEntry('ResearchStudy',resource,'PATCH')))
}

export function buildResearchStudyBatch(entries:readonly unknown[]){
 return studyBatch(entries,'ResearchStudy',normalizeResearchStudyR5FlatClaimsResource)
}

export function buildResearchStudyGroupMemberPatchEntries(input:Parameters<typeof projectGroupPractitionerRoleMemberFlatClaimResources>[0]){
 const resources=projectGroupPractitionerRoleMemberFlatClaimResources({...input,groupId:id(input.groupId)})
 return freeze(resources.map(resource=>studyBatchEntry('Group',resource,'PATCH')))
}

export function buildResearchStudyGroupBatch(entries:readonly unknown[]){
 return studyBatch(entries,'Group',normalizeGroupR5FlatClaimsResource)
}

const topic={system:FhirCodeSystems.ActReason,code:HealthcareConsentPurposes.Research,
 value:`${FhirCodeSystems.ActReason}|${HealthcareConsentPurposes.Research}`} as const
export const ResearchStudyInvitationCommunicationFilter=freeze({categories:[CommunicationCategoryCodes.Notification.attributeValue],
 topics:[topic],allowTopicSelection:false} as const)

function draftConsent(recipient:string,study:string){
 return {'@context':BundleEntryClaimsContext,[C.status]:ConsentStatuses.Draft,[C.decision]:ConsentDecisions.Permit,
  [C.actorIdentifier]:recipient,[C.grantee]:recipient,[C.purpose]:topic.value,[C.action]:'create,read,update,search',
  [C.resourceType]:'ResearchSubject',[C.sourceReference]:study}
}

type InvitationParty=Readonly<{associatedParty:unknown;communicationId:string;consentId:string}>
type InvitationScope=Readonly<{researchStudyId:string;controllerReference:string;sentAt?:string}>

export function buildResearchStudyPartyInvitation(input:InvitationParty&InvitationScope){
 const study=studyReference(input.researchStudyId)
 const party=normalizeResearchStudyAssociatedParties([input.associatedParty])[0]?.party
 const recipient=reference(party?.reference,'PractitionerRole'),sender=reference(input.controllerReference,'Organization')
 const communicationId=id(input.communicationId)
 const sent=String(input.sentAt??'').trim()
 if(sent&&!Number.isFinite(Date.parse(sent)))throw new TypeError('research_study_invitation_sent_invalid')
 const consent={type:'Consent-v5.0.0',id:id(input.consentId),attributes:draftConsent(recipient,study)}
 const bytes=new TextEncoder().encode(JSON.stringify({data:[consent]}))
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte)
 return freeze({resourceType:'Communication' as const,id:communicationId,meta:{claims:{
  '@context':BundleEntryClaimsContext,[CommunicationClaim.Identifier]:communicationId,[CommunicationClaim.Status]:'completed',
  [CommunicationClaim.Category]:ResearchStudyInvitationCommunicationFilter.categories[0],[CommunicationClaim.Topic]:topic.value,
  [CommunicationClaim.ContentReference]:study,[CommunicationClaim.Recipient]:recipient,[CommunicationClaim.Sender]:sender,
  ...(sent?{[CommunicationClaim.Sent]:sent}:{}),[CommunicationClaim.ContentAttachmentType]:HttpMediaTypes.JsonApi,
  [CommunicationClaim.ContentAttachmentTitle]:'research-study-draft-consent.json',[CommunicationClaim.ContentAttachmentData]:btoa(binary),
 }}})
}

export function buildResearchStudyPartyInvitations(input:InvitationScope&Readonly<{invitations:readonly InvitationParty[]}>){
 const {invitations,...scope}=input
 if(!Array.isArray(invitations)||!invitations.length)throw new TypeError('research_study_invitations_empty')
 return freeze(invitations.map(party=>buildResearchStudyPartyInvitation({...scope,...party})))
}

/** Reads the descriptive draft attached to a claims-only invitation. */
export function decodeResearchStudyInvitationDocument(value:unknown){
 try {
  const communication=record(value),claims=record(record(communication?.meta)?.claims)
  if(communication?.resourceType!=='Communication'||typeof communication.id!=='string'||
   Object.keys(communication).some(key=>!['resourceType','id','meta'].includes(key))||!claims||
   Object.values(claims).some(claim=>typeof claim!=='string'||!claim.trim())||
   claims[CommunicationClaim.ContentAttachmentType]!==HttpMediaTypes.JsonApi||claims[CommunicationClaim.Topic]!==topic.value||
   claims[CommunicationClaim.Category]!==ResearchStudyInvitationCommunicationFilter.categories[0])throw new TypeError()
  const encoded=claims[CommunicationClaim.ContentAttachmentData]
  if(typeof encoded!=='string')throw new TypeError()
  const document=record(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),character=>character.charCodeAt(0)))))
  const entry=Array.isArray(document?.data)&&document.data.length===1?record(document.data[0]):undefined
  const attributes=record(entry?.attributes)
  const expected=draftConsent(reference(claims[CommunicationClaim.Recipient],'PractitionerRole'),reference(claims[CommunicationClaim.ContentReference],'ResearchStudy'))
  if(entry?.type!=='Consent-v5.0.0'||Object.keys(entry).some(key=>!['type','id','attributes'].includes(key))||!attributes||
   Object.keys(attributes).length!==Object.keys(expected).length||Object.entries(expected).some(([key,expectedValue])=>attributes[key]!==expectedValue)){
   throw new TypeError()
  }
  return freeze({data:[{type:'Consent-v5.0.0' as const,id:id(entry.id),attributes:expected}]})
 } catch {
  throw new TypeError('research_study_invitation_document_invalid')
 }
}
