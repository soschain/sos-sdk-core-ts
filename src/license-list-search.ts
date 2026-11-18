import { buildLicenseSearchEntry, type LicenseClaims, type LicenseSearchInput } from 'sos-data-utils-ts/license-commercial-contract'
import type { LicenseStatus } from 'sos-data-utils-ts/device-license-contract'

/** UI/BFF selector state is distinct from actual licensed-device authority. */
export interface LicenseListSearchState {
 serialNumbers?:readonly string[]; email?:string; role?:string; status?:LicenseStatus;
 subjectId?:string; ownerOrganizationId?:string; userClass?:string; type?:string;
 active?:boolean; assigned?:boolean; unused?:boolean; periodStart?:string; periodEnd?:string;
 additionalClaims:LicenseClaims
}
const normalize=(value:unknown)=>String(value??'').trim()||undefined
function clone(input:Partial<LicenseListSearchState>={}):LicenseListSearchState {
 return {serialNumbers:Array.isArray(input.serialNumbers)?[...input.serialNumbers]:undefined,status:input.status,active:typeof input.active==='boolean'?input.active:undefined,assigned:typeof input.assigned==='boolean'?input.assigned:undefined,unused:typeof input.unused==='boolean'?input.unused:undefined,
  email:normalize(input.email),role:normalize(input.role),subjectId:normalize(input.subjectId),ownerOrganizationId:normalize(input.ownerOrganizationId),userClass:normalize(input.userClass),type:normalize(input.type),periodStart:normalize(input.periodStart),periodEnd:normalize(input.periodEnd),additionalClaims:{...input.additionalClaims}}
}
/** Retains descriptive filters without advertising unsupported runtime predicates. */
export class LicenseListSearchEditor {
 private draft:LicenseListSearchState
 constructor(input?:Partial<LicenseListSearchState>){this.draft=clone(input)}
 private set(value:Partial<LicenseListSearchState>):this{this.draft=clone({...this.draft,...value});return this}
 setSerialNumbers(value:readonly string[]):this{return this.set({serialNumbers:[...value]})}
 setEmail(value:string):this{return this.set({email:value})}
 setRole(value:string):this{return this.set({role:value})}
 setStatus(value:LicenseStatus):this{return this.set({status:value})}
 setSubjectId(value:string):this{return this.set({subjectId:value})}
 setOwnerOrganizationId(value:string):this{return this.set({ownerOrganizationId:value})}
 setUserClass(value:string):this{return this.set({userClass:value})}
 setAppType(value:string):this{return this.set({type:value})}
 setActive(value:boolean):this{return this.set({active:value})}
 setAssigned(value:boolean):this{return this.set({assigned:value})}
 setUnused(value:boolean):this{return this.set({unused:value})}
 setPeriod(start?:string,end?:string):this{return this.set({periodStart:start,periodEnd:end})}
 mergeClaims(value:LicenseClaims):this{return this.set({additionalClaims:{...this.draft.additionalClaims,...value}})}
 getState():LicenseListSearchState{return clone(this.draft)}
 toSearchInput():LicenseSearchInput{
  const d=this.draft
  const status=d.status??(d.active===true?'active':d.active===false?'inactive':d.unused===true?'available':undefined)
  return {...(d.serialNumbers?{serialNumbers:[...d.serialNumbers]}:{}),...(d.userClass?{userClass:d.userClass as LicenseSearchInput['userClass']}:{}),...(d.type?{type:d.type as LicenseSearchInput['type']}:{}),...(d.email?{email:d.email}:{}),...(d.role?{role:d.role}:{}),...(status?{status}:{}),...(d.subjectId?{subjectId:d.subjectId}:{}),...(d.ownerOrganizationId?{ownerOrganizationId:d.ownerOrganizationId}:{}),additionalClaims:{...d.additionalClaims}}
 }
 buildSearchEntry(){return buildLicenseSearchEntry(this.toSearchInput())}
}
