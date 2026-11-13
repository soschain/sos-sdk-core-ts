import {CommunicationClaim as C,DocumentReferenceClaim} from 'fhir-data-utils-ts'
import type {BundleEntry,BundleJsonApi,BundleRequest} from 'sos-data-utils-ts/bundle-contract'

export const CommunicationClaimsContext='org.hl7.fhir.api' as const
type EntryInput=Readonly<{resourceType:string;claims:Record<string,unknown>;fullUrl?:string;request?:BundleRequest}>
type SessionOptions=Readonly<{communicationClaims?:Record<string,unknown>;initialBundle?:BundleJsonApi<BundleEntry>}>
const text=(value:unknown)=>typeof value==='string'?value.trim():''
const encoded=(value:unknown)=>btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)),byte=>String.fromCharCode(byte)).join(''))

/** Decode operational claims only; semantic validation remains at the explicit reader boundary. */
export function decodeAttachedBundleFromCommunicationClaims(claims:Record<string,unknown>):Record<string,unknown>{
  const value=text(claims[C.ContentAttachmentData])
  if(!value)throw new TypeError('communication_bundle_attachment_required')
  const bytes=Uint8Array.from(atob(value),character=>character.charCodeAt(0))
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Record<string,unknown>
}

/** Runtime-neutral owned editing state; encoded attachment bytes derive only from the held Bundle. */
export class CommunicationAttachedBundleSession {
  private claims:Record<string,unknown>
  private bundle:BundleJsonApi<BundleEntry>
  private active:number|null=null
  constructor(options:SessionOptions={}){
    this.claims=structuredClone(options.communicationClaims??{})
    this.bundle=structuredClone(options.initialBundle??{resourceType:'Bundle',type:'batch',data:[]})
  }
  private sync():void{
    this.claims[C.ContentAttachmentType]='application/fhir+json'
    this.claims[C.ContentAttachmentData]=encoded(this.bundle)
  }
  getCommunicationClaims():Record<string,unknown>{this.sync();return structuredClone(this.claims)}
  setCommunicationIdentifier(value:string):this{this.claims[C.Identifier]=value;return this}
  getCommunicationIdentifier():unknown{return this.claims[C.Identifier]}
  setCommunicationSubject(value:string):this{this.claims[C.Subject]=value;return this}
  getCommunicationSubject():unknown{return this.claims[C.Subject]}
  setCommunicationCategory(values:string|readonly string[]):this{this.claims[C.Category]=Array.isArray(values)?values.join(','):values;return this}
  setCommunicationTopic(value:string):this{this.claims[C.Topic]=value;return this}
  setCommunicationText(value:string):this{this.claims[C.Text]=value;return this}
  getAttachedBundle():BundleJsonApi<BundleEntry>{return structuredClone(this.bundle)}
  setAttachedBundle(value:BundleJsonApi<BundleEntry>):this{
    if(value.resourceType!=='Bundle'||!Array.isArray(value.data))throw new TypeError('fhir_bundle_required')
    this.bundle=structuredClone(value)
    this.sync()
    return this
  }
  getActiveEntryPosition():number|null{return this.active}
  upsertActiveEntry(input:EntryInput):this{
    const id=text(input.claims[`${input.resourceType}.identifier`])||input.fullUrl
    if(!id)throw new TypeError('resource_identifier_required')
    const found=this.bundle.data.findIndex(entry=>entry.resource?.resourceType===input.resourceType&&(entry.fullUrl===input.fullUrl||text(entry.resource?.meta?.claims?.[`${input.resourceType}.identifier`])===id))
    const entry:BundleEntry={type:input.resourceType,...(input.fullUrl?{fullUrl:input.fullUrl}:{}),resource:{resourceType:input.resourceType,meta:{claims:structuredClone(input.claims)}},...(input.request?{request:structuredClone(input.request)}:{})}
    if(found>=0){this.bundle.data[found]=entry;this.active=found}
    else{this.bundle.data.push(entry);this.active=this.bundle.data.length-1}
    this.sync()
    return this
  }
  upsertActiveDocumentReferenceEntry(input:Readonly<{claims:Record<string,unknown>;fullUrl?:string}>):this{
    const id=text(input.claims[DocumentReferenceClaim.Identifier])
    this.upsertActiveEntry({resourceType:'DocumentReference',...input})
    if(id)this.bundle.data[this.active!].resource!.id=id
    return this
  }
  saveAndReleaseActiveEntry():this{this.active=null;this.sync();return this}
}
