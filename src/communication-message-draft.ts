import {CommunicationClaim as C} from 'fhir-data-utils-ts'
import {CommunicationClaimsContext} from './communication-attached-bundle-session.js'

export type CommunicationMessageDraftInput=Readonly<{
  messageId?:string;draftId?:string;thid?:string;createdAt?:string;subject:string
  sender?:string;recipient?:string|readonly string[];sent?:string;status?:string
  category?:string;noteText?:string;claims?:Readonly<Record<string,unknown>>
}>
/** Construct a local claims-first message; persistence, dispatch and authority stay with the host. */
export function createCommMsgExtendedDraft(input:CommunicationMessageDraftInput){
  const createdAt=input.createdAt??new Date().toISOString()
  const id=input.messageId??globalThis.crypto.randomUUID()
  const recipients=input.recipient?(Array.isArray(input.recipient)?input.recipient:[input.recipient]).map(value=>String(value).trim()).filter(Boolean):[]
  const claims:Record<string,unknown>={...structuredClone(input.claims??{}),'@context':CommunicationClaimsContext,[C.Subject]:input.subject,[C.Status]:input.status??'completed'}
  if(input.sender)claims[C.Sender]=input.sender
  if(recipients.length)claims[C.Recipient]=recipients.join(',')
  if(input.sent)claims[C.Sent]=input.sent
  if(input.category)claims[C.Category]=input.category
  if(input.noteText){claims[C.NoteText]=input.noteText;claims[C.Text]=input.noteText}
  return Object.freeze({id:input.draftId??globalThis.crypto.randomUUID(),createdAt,updatedAt:createdAt,message:{
    id,type:'https://didcomm.org/v2/communication',thid:input.thid??globalThis.crypto.randomUUID(),
    ...(input.sender?{from:input.sender}:{}),...(recipients.length?{to:recipients}:{}),
    body:{data:[{id,type:'Communication',resource:{resourceType:'Communication',meta:{claims}}}]},
  }})
}
