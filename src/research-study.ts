import {ClaimConsent as C,ConsentDecisions,ConsentStatuses,HealthcareConsentPurposes,ResourceTypesFhirR5,normalizeGroupR5ResearchTeam,projectGroupR5FlatClaimsResource} from 'fhir-data-utils-ts'
import {BundleEntryClaimsContext} from 'sos-data-utils-ts/consent-access-editor-contract'
import {buildResearchStudyReviewTeamIdentifier} from 'sos-data-utils-ts/research-review-team-identity'
export {buildResearchStudyReviewTeamGroupSearch} from 'sos-data-utils-ts/research-review-team-identity'
export type ResearchStudyActiveConsentInput=Readonly<{consentId:string;researchStudyId:string;practitionerRoleId:string;actorRole:string;date:string;status?:'active'}>
const id=(value:unknown):string=>{if(typeof value!=='string'||! /^[A-Za-z0-9.-]{1,64}$/u.test(value.trim()))throw new TypeError('research_study_resource_id_invalid');return value.trim()}
function freeze<T>(value:T):Readonly<T>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value}
/** Explicit controller decision commands, not invitation or membership-based authorization. */
export function buildResearchStudyActiveConsentBatch(inputs:readonly ResearchStudyActiveConsentInput[]){
 if(!Array.isArray(inputs)||!inputs.length)throw new TypeError('research_study_active_consent_batch_empty')
 return freeze({data:inputs.map(input=>{
  if(input.status!==undefined&&input.status!==ConsentStatuses.Active)throw new TypeError('research_study_active_consent_status_invalid')
  const study=id(input.researchStudyId),actorRole=String(input.actorRole??'').trim(),date=String(input.date??'').trim()
  if(!/^ISCO-08\|[0-9]{1,4}$/u.test(actorRole))throw new TypeError('research_study_active_consent_actor_role_invalid')
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw new TypeError('research_study_active_consent_date_invalid')
  return {type:'Consent-v5.0.0',resource:{resourceType:ResourceTypesFhirR5.Consent,id:id(input.consentId),meta:{claims:{'@context':BundleEntryClaimsContext,[C.status]:ConsentStatuses.Active,[C.decision]:ConsentDecisions.Permit,[C.purpose]:HealthcareConsentPurposes.Research,[C.sourceReference]:`ResearchStudy/${study}`,[C.actorIdentifier]:`PractitionerRole/${id(input.practitionerRoleId)}`,[C.actorRole]:actorRole,[C.action]:`organization/ResearchSubject.crus?study=ResearchStudy/${study}`,[C.date]:date}}},request:{method:'POST',url:ResourceTypesFhirR5.Consent}}
 })})
}
/** Creates an empty descriptive team. Each member is persisted separately and conveys no access authority. */
export function buildResearchStudyGroupCreateEntry(input:Readonly<{group:unknown;researchStudyId:string}>){
 const group=normalizeGroupR5ResearchTeam(structuredClone(input.group))
 id(group.id)
 if(group.member.length)throw new TypeError('group_members_require_patch_entries')
 return freeze({type:'Group-v5.0.0',resource:projectGroupR5FlatClaimsResource({...group,identifier:[buildResearchStudyReviewTeamIdentifier(input.researchStudyId)]}),request:{method:'POST',url:'Group'}})
}
