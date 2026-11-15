// Flow contract: channels navigate response bodies without treating extracted resources as successful or authorized operations.
import test from 'node:test'
import assert from 'node:assert/strict'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {ClaimConsent,ResourceTypesFhirR4} from 'fhir-data-utils-ts'
import {analyzeBundleChangesResponse} from '../dist/bundle-changes-response.js'

const load=()=>import('../dist/gateway-response-reader.js')
const first=()=>({resourceType:ResourceTypesFhirR4.Consent,id:SAFE.resourceUuid,meta:{claims:{[ClaimConsent.subject]:SAFE.didWeb}}})
const second=()=>({resourceType:ResourceTypesFhirR4.Consent,id:SAFE.demoOrganizationUuids.healthCare})
const bundle=resources=>({resourceType:'Bundle',type:'searchset',data:resources.map(resource=>({resource}))})

test('extracts ordered canonical resources through nested transport bodies without mutating input',async()=>{
  const {extractBundleSearchResources}=await load()
  const source={body:{body:bundle([first(),second()])}}
  const before=structuredClone(source)
  assert.deepEqual(extractBundleSearchResources(source),[first(),second()])
  assert.deepEqual(source,before)
})

test('retains read-only legacy aggregate and already-extracted row compatibility',async()=>{
  const {extractBundleSearchResources}=await load()
  for(const source of [
    bundle([{total:2,data:[first(),second()]}]),
    {resource:{data:[first(),second()]}},
    {data:[first(),second()]},
  ])assert.deepEqual(extractBundleSearchResources(source),[first(),second()])
})

test('keeps recognized empty search envelopes empty and tolerates malformed unrelated values',async()=>{
  const {extractBundleSearchResources}=await load()
  for(const source of [null,undefined,42,'',{},bundle([]),bundle([{total:0,data:[]}]),{data:[null,42]}]){
    assert.deepEqual(extractBundleSearchResources(source),[])
  }
  const cycle={};cycle.self=cycle
  assert.deepEqual(extractBundleSearchResources(cycle),[])
})

test('unwraps a nested body only when it contains an entry array and reads only the first resource',async()=>{
  const {unwrapBundleLikeResponseBody,readFirstBundleResourceFromResponseBody}=await load()
  const source=bundle([first(),second()])
  assert.deepEqual(unwrapBundleLikeResponseBody({body:source}),source)
  const native={resourceType:'Bundle',entry:[{resource:first()}]}
  assert.deepEqual(unwrapBundleLikeResponseBody({body:native}),native)
  assert.deepEqual(readFirstBundleResourceFromResponseBody({body:native}),first())
  const unrelated={body:{status:200},...source}
  assert.deepEqual(unwrapBundleLikeResponseBody(unrelated),unrelated)
  assert.equal(readFirstBundleResourceFromResponseBody(bundle([])),undefined)
  assert.equal(readFirstBundleResourceFromResponseBody({resourceType:'Bundle',data:[{}, {resource:first()}]}),undefined)
})

test('extraction does not override failed responses or stable identity correlation',async()=>{
  const {extractBundleSearchResources}=await load()
  const change={resourceType:'Bundle',type:'batch',data:[{type:'Consent',fullUrl:`urn:uuid:${SAFE.resourceUuid}`,resource:first()}]}
  const response={resourceType:'Bundle',type:'batch-response',data:[{...change.data[0],response:{status:'403 Forbidden'}}]}
  assert.deepEqual(extractBundleSearchResources(response),[first()])
  const result=analyzeBundleChangesResponse(change,response)
  assert.deepEqual(result.successfulIdentifiers,[])
  assert.deepEqual(result.failedIdentifiers,[change.data[0].fullUrl])
  assert.deepEqual(result.pendingIdentifiers,[])
})
