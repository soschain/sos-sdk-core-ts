// Flow contract: explicit stored reminder policy binds the task subject and purpose; exact actor rules retain specificity, while missing, malformed or out-of-scope authority denies execution.
import assert from 'node:assert/strict'
import test from 'node:test'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {createReminderPermissionBundle} from 'sos-data-utils-ts/reminder-metadata'
import * as sdk from '../dist/index.js'
const baseRule={actorKind:'assistant',actorId:'voice-assistant',decision:'allow',actions:['execute'],entities:['dispatch-window'],channels:['phone'],purpose:'reminder-delivery'}
const bundle=(rules=[baseRule])=>createReminderPermissionBundle({subject:SAFE.didWeb,purpose:'reminder-delivery',rules,groupedBy:['subject']})
const request=(overrides={})=>({subject:SAFE.didWeb,permissionBundle:bundle(),actorKind:'assistant',actorId:'voice-assistant',action:'execute',entity:'dispatch-window',channel:'phone',...overrides})
test('authorizes an explicit subject-bound actor and stored purpose only',()=>{
 assert.equal(typeof sdk.evaluateReminderRuntimeAccess,'function')
 assert.equal(sdk.evaluateReminderRuntimeAccess(request()).allowed,true)
 assert.equal(sdk.evaluateReminderRuntimeAccess(request({subject:SAFE.firstContactIdentifier})).allowed,false)
 assert.equal(sdk.evaluateReminderRuntimeAccess(request({purpose:'untrusted-override',permissionBundle:createReminderPermissionBundle({subject:SAFE.didWeb,rules:[baseRule]})})).allowed,false)
})
test('denies absent, malformed, unmatched and omitted restricted channel or purpose',()=>{
 for(const change of [{permissionBundle:undefined},{permissionBundle:{}},{actorId:'another-assistant'},{channel:undefined},{channel:'email'},{permissionBundle:bundle([])}])assert.equal(sdk.evaluateReminderRuntimeAccess(request(change)).allowed,false)
})
test('preserves exact actor priority and deny priority at equal specificity',()=>{
 const genericDeny={...baseRule,actorId:undefined,decision:'deny'}
 assert.equal(sdk.evaluateReminderRuntimeAccess(request({permissionBundle:bundle([genericDeny,baseRule])})).allowed,true)
 assert.equal(sdk.evaluateReminderRuntimeAccess(request({permissionBundle:bundle([baseRule,{...baseRule,decision:'deny'}])})).reason,'explicit-deny')
})
