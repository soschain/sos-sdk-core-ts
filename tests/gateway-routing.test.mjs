// Flow contract: channels describe explicit tenant resource actions without selecting a provider, transport or authorization policy.
import test from 'node:test'
import assert from 'node:assert/strict'
import {REPOSITORY_SAFE_EXAMPLES as SAFE} from 'sos-data-utils-ts/repository-privacy'
import {GatewayRouteSections,GatewayRouteFormats} from 'sos-data-utils-ts/gateway-response-contract'
import {ResourceTypesFhirR4} from 'fhir-data-utils-ts'

const load=()=>import('../dist/gateway-routing.js')
const route=()=>({tenantId:SAFE.tenantId,jurisdiction:'ES-MD',version:'v1',sector:SAFE.sector,section:GatewayRouteSections.Individual,format:GatewayRouteFormats.FhirApi,resourceType:ResourceTypesFhirR4.Consent,action:'_batch'})

test('builds all eight explicit wire segments without changing jurisdiction, namespace or action',async()=>{
  const {buildTenantResourceActionPath}=await load()
  const input=route()
  assert.equal(buildTenantResourceActionPath(input),`/${SAFE.tenantId}/cds-ES-MD/v1/${SAFE.sector}/individual/org.hl7.fhir.api/Consent/_batch`)
  assert.deepEqual(input,route())
  assert.equal(buildTenantResourceActionPath({...input,section:'organization',format:'org.hl7.fhir.r5',action:'_batch-response'}),`/${SAFE.tenantId}/cds-ES-MD/v1/${SAFE.sector}/organization/org.hl7.fhir.r5/Consent/_batch-response`)
})

test('normalizes boundary whitespace and slashes while requiring every explicit context field',async()=>{
  const {buildTenantResourceActionPath}=await load()
  const input=route()
  const padded=Object.fromEntries(Object.entries(input).map(([key,value])=>[key,` /${value}/ `]))
  assert.equal(buildTenantResourceActionPath(padded),buildTenantResourceActionPath(input))
  for(const field of Object.keys(input))for(const invalid of [undefined,null,'',' / ']){
    assert.throws(()=>buildTenantResourceActionPath({...input,[field]:invalid}),/route|segment|context/iu,field)
  }
})
