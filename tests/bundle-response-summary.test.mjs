// Flow contract: response-only counts preserve actual GW status/outcome semantics without inferring request correlation, authority or delivery.
import test from 'node:test'
import assert from 'node:assert/strict'
const load=()=>import('../dist/gateway-response-reader.js')
const entry=(status,issue=[])=>({response:{status,outcome:{resourceType:'OperationOutcome',issue}}})

test('counts exact trimmed three-digit 2xx and retains non-success/missing status entries',async()=>{
 const {summarizeBundleResponse}=await load()
 assert.equal(typeof summarizeBundleResponse,'function','owned response-only API must exist')
 const result=summarizeBundleResponse({data:[entry(' 201 '),entry('204'),entry('200 OK'),entry('403'),entry(undefined)]})
 assert.deepEqual(result,{totalOperations:5,successfulOperations:2,errorOperations:3,hasWarnings:false,hasErrors:false,issueDiagnostics:[]})
})

test('warning blocks entry success without becoming fatal/error; information/success do not block',async()=>{
 const {summarizeBundleResponse}=await load()
 const result=summarizeBundleResponse({entry:[entry('200',[{severity:'warning',diagnostics:'Review pending'}]),entry('200',[{severity:'information'}]),entry('200',[{severity:'success'}])]})
 assert.equal(result.successfulOperations,2)
 assert.equal(result.errorOperations,1)
 assert.equal(result.hasWarnings,true)
 assert.equal(result.hasErrors,false)
})

test('fatal/error outcomes deny success and preserve diagnostic entry/issue order and exact text',async()=>{
 const {summarizeBundleResponse}=await load()
 const result=summarizeBundleResponse({data:[entry('200',[{severity:'fatal',diagnostics:'  First failure  '},{severity:'error',details:{text:'Fallback detail'}}]),entry('500',[{severity:'error',diagnostics:'Last failure'}])]})
 assert.equal(result.successfulOperations,0)
 assert.equal(result.hasErrors,true)
 assert.deepEqual(result.issueDiagnostics,['  First failure  ','Fallback detail','Last failure'])
})

test('supports direct and one-body data/entry envelopes without mutation; entry retains precedence',async()=>{
 const {summarizeBundleResponse}=await load()
 for(const input of [{data:[entry('201')]},{entry:[entry('201')]},{body:{data:[entry('201')]}},{body:{entry:[entry('201')]}},{entry:[entry('201')],data:[entry('403')]}]){
  const before=structuredClone(input)
  assert.equal(summarizeBundleResponse(input).successfulOperations,1)
  assert.deepEqual(input,before)
 }
})

test('empty/unrecognized inputs cannot become successful operations or infer missing submitted identities',async()=>{
 const {summarizeBundleResponse}=await load()
 for(const input of [null,undefined,{}, {data:[]},{body:{status:200}}]){
  const result=summarizeBundleResponse(input)
  assert.equal(result.totalOperations,0)
  assert.equal(result.successfulOperations,0)
  assert.equal('successfulIdentifiers' in result,false)
 }
 const malformed=summarizeBundleResponse({data:[42,'unexpected',false,[]]})
 assert.equal(malformed.totalOperations,4)
 assert.equal(malformed.successfulOperations,0)
 assert.equal(malformed.errorOperations,4)
 assert.throws(()=>summarizeBundleResponse({data:[null]}),TypeError)
})
