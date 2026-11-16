// Flow contract: an authorized subject's imported R4 document is cloned and projected without inferring identity, while preserving sections and overriding imported subject claims before any persistence.
import assert from 'node:assert/strict'
import test from 'node:test'
import {FhirCodeSystems} from 'fhir-data-utils-ts'
import {IndexedClaimsContext} from 'fhir-data-utils-ts/indexed-r4'
import * as sdk from '../dist/index.js'

const subject='did:web:example.test:individual:subject-one'
const qualifiedSubjectClaim=`${IndexedClaimsContext}.Condition.subject`
function input(){return {resourceType:'Bundle',type:'document',entry:[
 {fullUrl:'urn:uuid:composition-one',resource:{resourceType:'Composition',id:'composition-one',status:'final',subject:{reference:'Patient/patient-one'},section:[{code:{coding:[{system:'http://loinc.org',code:'11450-4'}]},entry:[{reference:'Condition/condition-one'}],section:[{code:{coding:[{system:'http://loinc.org',code:'48765-2'}]},entry:[{reference:'urn:uuid:condition-one'}]}]}]}},
 {fullUrl:'urn:uuid:patient-one',resource:{resourceType:'Patient',id:'patient-one',name:[{given:['Synthetic'],family:'Individual'}]}},
 {fullUrl:'urn:uuid:condition-one',resource:{resourceType:'Condition',id:'condition-one',subject:{reference:'Patient/patient-one'},code:{coding:[{system:FhirCodeSystems.SnomedCt,code:'123456'}]},meta:{tag:[{code:'source-tag'}],claims:{'Condition.subject':'did:web:other.test:unauthorized',[qualifiedSubjectClaim]:'did:web:other.test:unauthorized','Condition.custom':['retained'],'Condition.code':'source-precedence'}}}},
]}}

test('the subject-bound planner is exported by SOS Core',()=>{
 assert.equal(typeof sdk.prepareR4DocumentForSubject,'function')
})

test('planner clones input, forces selected subject references and preserves source claim precedence',()=>{
 const source=input(),before=structuredClone(source)
 const result=sdk.prepareR4DocumentForSubject(source,subject)
 assert.deepEqual(source,before)
 assert.notEqual(result,source)
 assert.notEqual(result.entry[2].resource,source.entry[2].resource)
 assert.equal(result.entry[0].resource.subject.reference,subject)
 assert.equal(result.entry[2].resource.subject.reference,subject)
 assert.equal(result.entry[2].resource.meta.claims['Condition.subject'],subject)
 assert.equal(result.entry[2].resource.meta.claims[qualifiedSubjectClaim],subject)
 assert.deepEqual(result.entry[2].resource.meta.claims['Condition.custom'],['retained'])
 assert.equal(result.entry[2].resource.meta.claims['Condition.code'],'source-precedence')
 assert.deepEqual(result.entry[2].resource.meta.tag,[{code:'source-tag'}])
})

test('recursive section membership joins both fullUrl and relative resource aliases without duplicates',()=>{
 const result=sdk.prepareR4DocumentForSubject(input(),subject)
 assert.equal(result.entry[0].resource.meta.claims['Composition.section'],'LOINC|11450-4,LOINC|48765-2')
 // Historical resource projection visits the fullUrl alias before Resource/id.
 assert.equal(result.entry[2].resource.meta.claims['Composition.section'],'LOINC|48765-2,LOINC|11450-4')
})

test('Patient internal ID and names do not become business identifiers or subject authority',()=>{
 const result=sdk.prepareR4DocumentForSubject(input(),subject)
 const patient=result.entry[1].resource
 assert.equal(patient.id,'patient-one')
 assert.equal(patient.meta.claims['Patient.identifier'],undefined)
 assert.equal(patient.meta.claims['Patient.subject'],undefined)
 assert.equal(patient.subject,undefined)
})

test('patient references and imported patient claims are rebound without changing unrelated references',()=>{
 const source=input()
 source.entry.push({resource:{resourceType:'Immunization',id:'immunization-one',patient:{reference:'Patient/patient-one',display:'Recorded subject'},performer:[{actor:{reference:'Practitioner/practitioner-one'}}],meta:{claims:{'Immunization.patient':'Patient/other'}}}})
 const resource=sdk.prepareR4DocumentForSubject(source,subject).entry[3].resource
 assert.equal(resource.patient.reference,subject)
 assert.equal(resource.patient.display,'Recorded subject')
 assert.equal(resource.meta.claims['Immunization.patient'],subject)
 assert.deepEqual(resource.performer,[{actor:{reference:'Practitioner/practitioner-one'}}])
})

test('planner refuses malformed document or absent selected subject before returning a plan',()=>{
 for(const source of [null,{}, {resourceType:'Bundle',type:'collection',entry:[]}, {resourceType:'Bundle',type:'document',entry:[{resource:{resourceType:'Patient'}}]}])assert.throws(()=>sdk.prepareR4DocumentForSubject(source,subject),/document_bundle_invalid/u)
 for(const value of ['', ' ', null, undefined, 1, {}])assert.throws(()=>sdk.prepareR4DocumentForSubject(input(),value),/document_subject_required/u)
})

test('unsupported resource types fail explicitly instead of using a generic semantic converter',()=>{
 const source=input()
 source.entry.push({resource:{resourceType:'UnsupportedResource',id:'unsupported-one'}})
 assert.throws(()=>sdk.prepareR4DocumentForSubject(source,subject),/document_resource_type_unsupported/u)
})
