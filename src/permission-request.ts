import {
 ClaimConsent,CommunicationClaim,CommunicationCategoryCodes,ConsentDecisions,
 ConsentStatuses,IndexedClaimsContext,ResourceTypesFhirR4,
} from 'fhir-data-utils-ts'
import {BundleEditor,BundleOperations,BundleTypes,BundleEditableResourceTypes} from 'sos-data-utils-ts/bundle-contract'
import {PermissionRequestConsentEntryType} from 'sos-data-utils-ts/permission-request-contract'
import type {PermissionRequestCommunicationInput,PermissionRequestCommunicationDraft} from 'sos-data-utils-ts/permission-request-contract'

function required(value:unknown,field:string):string {
 if(typeof value!=='string'||!value.trim())throw new TypeError(`permission_request_${field}_required`)
 return value.trim()
}

function optional(value:unknown,field:string):string|undefined {
 if(value===undefined)return undefined
 if(typeof value!=='string')throw new TypeError(`permission_request_${field}_invalid`)
 return value.trim()||undefined
}

function targets(value:unknown):string[] {
 if(!Array.isArray(value)||!value.every(item=>typeof item==='string'))throw new TypeError('permission_request_targets_invalid')
 return [...new Set(value.map(item=>item.trim()).filter(Boolean))]
}

function recipient(value:unknown):string|string[] {
 if(typeof value==='string')return required(value,'recipient')
 if(!Array.isArray(value)||!value.length||!value.every(item=>typeof item==='string'&&item.trim()))throw new TypeError('permission_request_recipient_required')
 return value.map(item=>item.trim())
}

/** Builds one access proposal; the controller approves its draft through the Consent workflow. */
export function buildPermissionRequestCommunication(input:PermissionRequestCommunicationInput):PermissionRequestCommunicationDraft {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('permission_request_subject_required')
 const subject=required(input.subject,'subject')
 const communicationIdentifier=required(input.communicationIdentifier,'communication_identifier')
 const consentIdentifier=required(input.consentIdentifier,'consent_identifier')
 const thid=required(input.thid,'thid'),sender=required(input.sender,'sender'),receivers=recipient(input.recipient)
 if(!input.missing||typeof input.missing!=='object')throw new TypeError('permission_request_targets_invalid')
 const sections=targets(input.missing.sections),resourceTypes=targets(input.missing.resourceTypes)
 if(!sections.length&&!resourceTypes.length)throw new TypeError('permission_request_targets_invalid')
 const requester=input.requester
 if(!requester||typeof requester!=='object'||Array.isArray(requester))throw new TypeError('permission_request_requester_required')
 const requesterTargets=[requester.did,requester.email,requester.phone,requester.organizationDid,requester.organizationUrl,requester.jurisdiction]
  .map(value=>optional(value,'requester')).filter((value):value is string=>value!==undefined)
 if(!requesterTargets.length)throw new TypeError('permission_request_requester_required')
 const role=optional(input.requesterRole,'role'),purpose=optional(input.purpose,'purpose')
 if(input.justification!==undefined&&typeof input.justification!=='string')throw new TypeError('permission_request_justification_invalid')
 const text=input.justification||`Missing consent coverage for ${sections.join(', ')||'requested sections'}`
  +`${resourceTypes.length?` and ${resourceTypes.join(', ')}`:''}.`
 const category=CommunicationCategoryCodes.Notification.attributeValue
 const bundle=new BundleEditor()
  .setBundleOperation(BundleOperations.create).setBundleType(BundleTypes.batch)
  .setAllowedResourceType(BundleEditableResourceTypes.consent)
 const consent=bundle.newEntryAs(BundleEditableResourceTypes.consent,consentIdentifier)
  .setIdentifier(consentIdentifier).setStatus(ConsentStatuses.Draft).setSubject(subject)
  .setDecision(ConsentDecisions.Permit).setActorIdentifierList(requesterTargets).create()
 if(role)consent.setActorRoleList([role])
 if(purpose)consent.setPurposeList([purpose])
 if(sections.length)consent.setSectionList(sections)
 if(resourceTypes.length)consent.setResourceTypeList(resourceTypes)
 const payload=bundle.buildJsonApi()
 const entry=payload.data[0]
 entry.type=PermissionRequestConsentEntryType
 if(!entry.resource)throw new TypeError('permission_request_consent_resource_required')
 entry.resource.status=ConsentStatuses.Draft
 entry.resource.meta={...entry.resource.meta,claims:{'@context':IndexedClaimsContext,...entry.resource.meta?.claims,[ClaimConsent.status]:ConsentStatuses.Draft}}
 // The request URL retains the existing unversioned operational resource path.
 entry.request={method:'POST',url:ResourceTypesFhirR4.Consent}
 return {
  thid,subject,sender,recipient:receivers,category:[category],text,
  claims:{'@context':IndexedClaimsContext,[CommunicationClaim.Identifier]:communicationIdentifier,
   [CommunicationClaim.Subject]:subject,[CommunicationClaim.Recipient]:receivers,
   [CommunicationClaim.Sender]:sender,[CommunicationClaim.Category]:category,[CommunicationClaim.NoteText]:text},
  payload:{...payload},
 }
}
