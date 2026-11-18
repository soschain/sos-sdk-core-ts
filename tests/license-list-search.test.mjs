// Flow contract: compose license list selectors without granting seat access; preserve operator filters, clone state, and read first-entry claims without falling through to another result.
import assert from 'node:assert/strict'
import test from 'node:test'
import { REPOSITORY_SAFE_EXAMPLES as e } from 'sos-data-utils-ts/repository-privacy'
import { LicenseListSearchEditor } from '../dist/license-list-search.js'
import { getClaimsInFirstDataEntry } from '../dist/gateway-response-reader.js'

test('preserves semantic draft filters but serializes only supported request fields',()=>{
 const editor=new LicenseListSearchEditor().setActive(false).setUnused(true).setAssigned(false).setPeriod('2026-01-01','2026-12-31').setEmail(' '+e.firstContactEmail+' ').setUserClass('employee').setOwnerOrganizationId(e.tenantId).setSerialNumbers([e.resourceUuid])
 const entry=editor.buildSearchEntry()
 assert.equal(entry.meta.status,'inactive');assert.equal(entry.meta.ownerOrganizationId,e.tenantId)
 assert.equal(entry.resource.meta.claims['org.schema.Person.email'],e.firstContactEmail)
 assert.equal(entry.resource.meta.claims['org.schema.Offer.serialNumber'],e.resourceUuid)
 const state=editor.getState();state.serialNumbers.push('altered');assert.equal(editor.getState().serialNumbers.length,1)
 assert.equal(editor.toSearchInput().assigned,undefined);assert.equal(editor.getState().assigned,false)
 assert.equal(editor.setStatus('available').buildSearchEntry().meta.status,'available')
})
test('reads only resource claims of first entry across operational/native arrays',()=>{
 const claims={identifier:e.resourceUuid}
 for(const key of ['data','entry'])assert.deepEqual(getClaimsInFirstDataEntry({[key]:[{meta:{claims:{transport:true}},resource:{meta:{claims}}}]}),claims)
 for(const value of [undefined,{}, {data:[]},{data:[{}, {resource:{meta:{claims}}}]}])assert.deepEqual(getClaimsInFirstDataEntry(value),{})
})
