import {ClaimConsent as C,ConsentDecisions,ResourceTypesFhirR4,HealthcareConsentPurposes as Purposes} from 'fhir-data-utils-ts'
import {exportConsentClaims} from 'sos-data-utils-ts/permission-templates'
import {isValidConsentPeriodBoundary} from 'sos-data-utils-ts/consent-coverage'
import {getHealthcareRoleByClaim,HealthcareRoleFamilies} from 'sos-data-utils-ts/healthcare-roles'
import {getHealthcarePermissionSectionFamilyByCode,getHealthcarePermissionSectionByCode,HealthcareCanonicalSectionFamilies as Families} from 'sos-data-utils-ts/healthcare-sections'
import {ConsentEditorEntryType,ConsentEditorScopeCodes,ConsentEditorTargetKinds} from 'sos-data-utils-ts/consent-access-editor-contract'
import type {
  ActiveEntrySelection,CommunicationAttachedBundleSessionOptions,ConsentEditorClassifiedActors,
  ConsentEditorClassifiedRole,ConsentEditorClassifiedRoles,ConsentEditorClassifiedTarget,ConsentViewModel,UpsertClaimsResourceEntryInput,
} from 'sos-data-utils-ts/consent-access-editor-contract'
import {CommunicationAttachedBundleSession} from './communication-attached-bundle-session.js'

const text=(value:unknown):string=>{
  if(value===undefined)return ''
  if(typeof value==='string')return value.trim()
  if(Array.isArray(value)&&value.length===1&&typeof value[0]==='string')return value[0].trim()
  throw new TypeError('consent_scalar_selector_invalid')
}
const csv=(value:unknown):string[]=>{
  if(value===undefined)return []
  const values=Array.isArray(value)?value:[value]
  if(!values.every((item):item is string=>typeof item==='string'))throw new TypeError('consent_selector_value_invalid')
  return [...new Set(values.flatMap(item=>item.split(',')).map(item=>item.trim()).filter(Boolean))]
}
const selectorText=(value:unknown):string=>{
  if(typeof value!=='string')throw new TypeError('consent_selector_value_invalid')
  return value.trim()
}
const required=(value:unknown,label:string):string=>{const result=text(value);if(!result)throw new TypeError(`consent_${label}_required`);return result}

/** Local permission-authoring state, never persistence, recipient acceptance or controller approval. */
export class ConsentAccessEditor extends CommunicationAttachedBundleSession{
  constructor(options:CommunicationAttachedBundleSessionOptions={}){super(options)}
  upsertActiveConsentEntry(input:UpsertClaimsResourceEntryInput):this{
    const claims=structuredClone(input.claims)
    validateSelectorClaims(claims)
    const identifier=required(claims[C.identifier],'identifier')
    const subject=required(claims[C.subject],'subject')
    validatePeriods(claims)
    super.upsertActiveEntry({resourceType:ResourceTypesFhirR4.Consent,...input,claims,id:identifier,type:input.type??ConsentEditorEntryType})
    this.setCommunicationSubject(subject)
    return this
  }
  addConsent(input:UpsertClaimsResourceEntryInput):this{return this.upsertActiveConsentEntry(input)}
  override selectActiveEntry(selection:ActiveEntrySelection):this{
    const entries=this.getBundleInMemory().data
    const position=selection.position??selection.index
    let candidate
    if(position!==undefined){
      if(!Number.isInteger(position)||position<0||position>=entries.length)throw new TypeError('bundle_entry_position_invalid')
      candidate=entries[position]
    }else{
      if(!selection.fullUrl)throw new TypeError('bundle_entry_selection_required')
      const matches=entries.filter(entry=>entry.fullUrl===selection.fullUrl)
      if(matches.length!==1)throw new TypeError('bundle_entry_selection_not_unique')
      candidate=matches[0]
    }
    if(candidate?.resource?.resourceType!==ResourceTypesFhirR4.Consent)throw new TypeError('consent_active_entry_required')
    super.selectActiveEntry(selection)
    const subject=text(candidate.resource.meta?.claims?.[C.subject])
    if(subject)this.setCommunicationSubject(subject)
    return this
  }
  openConsent(selection:ActiveEntrySelection):this{return this.selectActiveEntry(selection)}
  saveConsent():this{return this.saveAndReleaseActiveEntry()}
  getConsentViewModel():ConsentViewModel{
    const entry=this.getActiveEntry()
    const rawClaims=entry?.resource?.meta?.claims
    const claims=rawClaims===undefined?{}:rawClaims
    validateSelectorClaims(claims)
    const roles=csv(claims[C.actorRole])
    return {
      ...(entry?.fullUrl?{fullUrl:entry.fullUrl}:{}),identifier:text(claims[C.identifier]),subject:text(claims[C.subject]),decision:text(claims[C.decision]),
      classifiedActors:classifyActors(csv(claims[C.actorIdentifier]),roles[0]),classifiedRoles:classifyRoles(roles),
      classifiedPurposes:csv(claims[C.purpose]).map(code=>({code,display:purposeDisplay(code)})),classifiedTargets:classifyTargets(claims),
    }
  }
  applyConsentViewModel(view:ConsentViewModel):this{
    const entry=this.getActiveEntry()
    if(!entry||entry.resource?.resourceType!==ResourceTypesFhirR4.Consent)throw new TypeError('consent_active_entry_required')
    const originalClaims=entry.resource.meta?.claims
    validateSelectorClaims(originalClaims===undefined?{}:originalClaims)
    const identifier=required(view.identifier,'identifier'),subject=required(view.subject,'subject')
    const decision=view.decision
    if(decision!==ConsentDecisions.Permit&&decision!==ConsentDecisions.Deny)throw new TypeError('consent_decision_invalid')
    const previousActors=csv(entry.resource.meta?.claims?.[C.actorIdentifier])
    const representedActors=new Set(flattenActors(classifyActors(previousActors)))
    // Editing classified contacts must not erase an opaque original selector.
    const actors=csv([...flattenActors(view.classifiedActors),...previousActors.filter(token=>!representedActors.has(token))])
    const roles=csv([
      ...view.classifiedRoles.professional,...view.classifiedRoles.relationship,
      ...view.classifiedRoles.legalRepresentative,...view.classifiedRoles.other,
    ].map(serializeRole))
    const updates=exportConsentClaims({decision,actorIdentifiers:actors,roles,purposes:view.classifiedPurposes.map(item=>selectorText(item.code)),targets:view.classifiedTargets.map(item=>{
      const kind=item.target.kind
      if(kind!==ConsentEditorTargetKinds.Section&&kind!==ConsentEditorTargetKinds.ResourceType)throw new TypeError('consent_target_selector_invalid')
      return {kind,code:selectorText(item.target.code),sectionFamily:item.target.sectionFamily===undefined?undefined:selectorText(item.target.sectionFamily),scopes:item.scopes.map(scope=>{
        if(!Object.values(ConsentEditorScopeCodes).includes(scope.code))throw new TypeError('consent_scope_selector_invalid')
        return scope.code
      })}
    })},{identifier,subject})
    const claims={...entry.resource.meta?.claims}
    for(const key of [C.actorIdentifier,C.actorRole,C.purpose,C.action,C.category,C.resourceType])if(!(key in updates))delete claims[key]
    Object.assign(claims,updates)
    validatePeriods(claims)
    const bundle=this.getAttachedBundle(),position=this.getActiveEntryPosition()
    if(position===null)throw new TypeError('consent_active_entry_required')
    bundle.data[position]={...entry,resource:{...entry.resource,meta:{...entry.resource.meta,claims}}}
    this.setAttachedBundle(bundle).setCommunicationSubject(subject)
    return this
  }
}

export function createConsentAccessEditor(options:CommunicationAttachedBundleSessionOptions={}):ConsentAccessEditor{return new ConsentAccessEditor(options)}

function validateSelectorClaims(claims:Record<string,unknown>):void{
  if(!claims||typeof claims!=='object'||Array.isArray(claims))throw new TypeError('consent_selector_claims_invalid')
  for(const key of [C.actorIdentifier,C.actorRole,C.action,C.category,C.resourceType,C.purpose])csv(claims[key])
  for(const key of [C.identifier,C.subject,C.decision])text(claims[key])
}

function validatePeriods(claims:Record<string,unknown>):void{
  const boundary=(key:string):string=>{
    const raw=claims[key]
    if(raw===undefined||raw===null||raw==='')return ''
    const value=Array.isArray(raw)&&raw.length===1?raw[0]:raw
    if(typeof value!=='string'||!isValidConsentPeriodBoundary(value))throw new TypeError('consent_period_boundary_invalid')
    return value.trim()
  }
  for(const [startKey,endKey] of [[C.periodStart,C.periodEnd],[C.dataPeriodStart,C.dataPeriodEnd]]){
    const start=boundary(startKey),end=boundary(endKey)
    if(start&&end&&Date.parse(end)<Date.parse(start))throw new TypeError('consent_period_order_invalid')
  }
}

function classifyRoles(tokens:readonly string[]):ConsentEditorClassifiedRoles{
  const result:{professional:ConsentEditorClassifiedRole[];relationship:ConsentEditorClassifiedRole[];legalRepresentative:ConsentEditorClassifiedRole[];other:ConsentEditorClassifiedRole[]}={professional:[],relationship:[],legalRepresentative:[],other:[]}
  for(const token of tokens){
    const descriptor=getHealthcareRoleByClaim(token),separator=token.indexOf('|')
    const role:ConsentEditorClassifiedRole=descriptor?{kind:descriptor.family,codingSystem:descriptor.codingSystem,code:descriptor.code,display:descriptor.titleEn,...(descriptor.definition?{definition:descriptor.definition}:{})}:{codingSystem:separator<0?'':token.slice(0,separator),code:separator<0?token:token.slice(separator+1),display:token}
    const bucket=role.kind===HealthcareRoleFamilies.ProfessionalOccupationIsco08?'professional':role.kind===HealthcareRoleFamilies.PersonalRelationshipHl7?'relationship':role.kind===HealthcareRoleFamilies.LegalRepresentativeHl7?'legalRepresentative':'other'
    result[bucket].push(role)
  }
  return result
}
function serializeRole(role:ConsentEditorClassifiedRole):string{
  const system=selectorText(role.codingSystem),code=selectorText(role.code)
  const token=system?`${system}|${code}`:code
  return getHealthcareRoleByClaim(token)?.claim??token
}
function classifyActors(tokens:readonly string[],roleToken?:string):ConsentEditorClassifiedActors{
  const jurisdictions=new Map<string,{code:string;display:string}>()
  const organizations=new Map<string,ConsentEditorClassifiedActors['organizations'][number]>()
  const users=new Map<string,ConsentEditorClassifiedActors['users'][number]>()
  const descriptor=roleToken?getHealthcareRoleByClaim(roleToken):undefined
  const role=descriptor?{codingSystem:descriptor.codingSystem,code:descriptor.code,display:descriptor.titleEn}:undefined
  for(const token of tokens){
    if(/^[A-Z]{2}(?:[-:][A-Z0-9]+)?$/u.test(token)){jurisdictions.set(token,{code:token,display:token});continue}
    if(token.startsWith('tel:')){users.set(token,{phone:token,...(role?{role}:{})});continue}
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(token)){users.set(token,{email:token,...(role?{role}:{})});continue}
    if(token.startsWith('did:web:')){
      const [domain,...departments]=token.slice('did:web:'.length).split(':').filter(Boolean)
      if(domain)organizations.set(token,{domain,display:domain,departments:departments.map(code=>({code,display:code})),locations:[]})
    }
  }
  return {jurisdictions:[...jurisdictions.values()],organizations:[...organizations.values()],users:[...users.values()]}
}
function flattenActors(actors:ConsentEditorClassifiedActors):string[]{
  return csv([
    ...actors.jurisdictions.map(item=>selectorText(item.code)),
    ...actors.organizations.map(item=>['did:web',selectorText(item.domain),...item.departments.map(department=>selectorText(department.code))].join(':')),
    ...actors.users.flatMap(item=>[item.email,item.phone].filter(value=>value!==undefined).map(selectorText)),
  ])
}
function classifyTargets(claims:Record<string,unknown>):ConsentEditorClassifiedTarget[]{
  const targets=new Map<string,ConsentEditorClassifiedTarget>()
  for(const [key,kind] of [[C.action,ConsentEditorTargetKinds.Section],[C.category,ConsentEditorTargetKinds.Section],[C.resourceType,ConsentEditorTargetKinds.ResourceType]] as const){
    for(const code of csv(claims[key])){
      const family=key===C.category?Families.KindOfDocument:getHealthcarePermissionSectionFamilyByCode(code)
      const display=kind===ConsentEditorTargetKinds.ResourceType?code:getHealthcarePermissionSectionByCode(code)?.titleEn
      targets.set(`${kind}:${code}`,{target:{kind,code,...(display?{display}:{}),...(kind===ConsentEditorTargetKinds.Section&&family?{sectionFamily:family}:{})},scopes:[{code:ConsentEditorScopeCodes.Read,display:'read'}]})
    }
  }
  return [...targets.values()]
}

function purposeDisplay(code:string):string{
  const labels:Readonly<Record<string,string>>={
    [Purposes.Treatment]:'Treatment',[Purposes.EmergencyTreatment]:'Emergency treatment',[Purposes.CareManagement]:'Care management',
    [Purposes.Operations]:'Operations',[Purposes.PatientAdministration]:'Patient administration',[Purposes.RecordsManagement]:'Records management',
  }
  return Object.prototype.hasOwnProperty.call(labels,code)?labels[code]:code
}
