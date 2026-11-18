import {createReminderPermissionBundle} from 'sos-data-utils-ts/reminder-metadata'
import type {ReminderAction,ReminderActorKind,ReminderChannel,ReminderEntityKind,ReminderPermissionBundle,ReminderPermissionRule} from 'sos-data-utils-ts/reminder-metadata'
export {ReminderActions,ReminderActorKinds,ReminderChannels,ReminderEntityKinds,createReminderPermissionBundle,encodeReminderPermissionBundle,decodeReminderPermissionBundle} from 'sos-data-utils-ts/reminder-metadata'
export type {ReminderPermissionBundle,ReminderPermissionRule} from 'sos-data-utils-ts/reminder-metadata'
export type ReminderRuntimeAccessRequest=Readonly<{subject:string;permissionBundle?:ReminderPermissionBundle;actorKind:ReminderActorKind;actorId?:string;action:ReminderAction;entity:ReminderEntityKind;channel?:ReminderChannel}>
export type ReminderRuntimeAccessEvaluation=Readonly<{allowed:boolean;matchedRule?:ReminderPermissionRule;reason:'allowed'|'no-permission-bundle'|'invalid-permission-bundle'|'subject-mismatch'|'no-matching-rule'|'channel-not-allowed'|'explicit-deny'}>
/** Evaluates explicit stored policy only. Caller authentication and trusted policy creation remain separate boundaries. */
export function evaluateReminderRuntimeAccess(request:ReminderRuntimeAccessRequest):ReminderRuntimeAccessEvaluation{
 const deny=(reason:ReminderRuntimeAccessEvaluation['reason'],matchedRule?:ReminderPermissionRule):ReminderRuntimeAccessEvaluation=>Object.freeze({allowed:false,reason,...(matchedRule?{matchedRule}:{})})
 if(!request?.permissionBundle)return deny('no-permission-bundle')
 let bundle:ReminderPermissionBundle
 try{bundle=createReminderPermissionBundle(request.permissionBundle)}catch{return deny('invalid-permission-bundle')}
 if(typeof request.subject!=='string'||!request.subject||bundle.subject!==request.subject)return deny('subject-mismatch')
 const base=(rule:ReminderPermissionRule)=>rule.actorKind===request.actorKind&&(!rule.actorId||rule.actorId===request.actorId)&&rule.actions.includes(request.action)&&rule.entities.includes(request.entity)&&(!rule.purpose||(bundle.purpose!==undefined&&rule.purpose===bundle.purpose))
 const order=(a:ReminderPermissionRule,b:ReminderPermissionRule)=>Number(Boolean(b.actorId))-Number(Boolean(a.actorId))||Number(b.decision==='deny')-Number(a.decision==='deny')
 const candidates=bundle.rules.filter(base).sort(order)
 const direct=candidates.filter(rule=>!rule.channels?.length||(request.channel!==undefined&&rule.channels.includes(request.channel)))
 const matched=direct[0]
 if(!matched)return candidates[0]?deny(candidates[0].decision==='deny'?'explicit-deny':'channel-not-allowed',candidates[0]):deny('no-matching-rule')
 if(matched.decision==='deny')return deny('explicit-deny',matched)
 return Object.freeze({allowed:true,reason:'allowed',matchedRule:matched})
}
