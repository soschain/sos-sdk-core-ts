// Flow contract: an explicit blob port externalizes only encrypted bytes, preserves metadata and hydrates the exact authenticated envelope without dropping the caller's source on failure.
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { REPOSITORY_SAFE_EXAMPLES as SAFE } from 'sos-data-utils-ts/repository-privacy'
import * as sdk from '../dist/index.js'

function encryptedRecord() {
 const key=randomBytes(32),iv=randomBytes(12),plaintext=Buffer.from('synthetic protected claims')
 const header=Buffer.from(JSON.stringify({alg:'dir',enc:'A256GCM'})).toString('base64url')
 const cipher=createCipheriv('aes-256-gcm',key,iv)
 cipher.setAAD(Buffer.from(header))
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()])
 const jwe={protected:header,iv:iv.toString('base64url'),ciphertext:ciphertext.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')}
 return {key,plaintext,document:{id:SAFE.resourceUuid,status:'active',sequence:1,jwe,indexed:{attributes:[{name:'protected-name',value:'protected-value'}]},audit:{sourceRecordId:SAFE.resourceUuid}}}
}
test('externalizes and hydrates a real encrypted envelope with metadata and input isolation',async()=>{
 assert.equal(typeof sdk.externalizeConfidentialStorageDocForPersistence,'function')
 const {document,key,plaintext}=encryptedRecord(),stored=new Map()
 const port={provider:'mem',async put(bytes,contentType){assert.equal(contentType,sdk.CONFIDENTIAL_JWE_BLOB_CONTENT_TYPE);stored.set(SAFE.resourceUuid,bytes.slice());return{blobRef:SAFE.resourceUuid}},async get(ref){return{dataBytes:stored.get(ref)}}}
 const persisted=await sdk.externalizeConfidentialStorageDocForPersistence(document,port)
 assert.equal(Object.hasOwn(persisted,'jwe'),false)
 assert.deepEqual(persisted.indexed,document.indexed)
 assert.deepEqual(persisted.audit,document.audit)
 assert.equal(persisted.blob.provider,'mem')
 assert.equal(document.jwe.ciphertext.length>0,true)
 const hydrated=await sdk.hydrateConfidentialStorageDocFromPersistence(persisted,port)
 assert.deepEqual(hydrated.jwe,document.jwe)
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(hydrated.jwe.iv,'base64url'))
 decipher.setAAD(Buffer.from(hydrated.jwe.protected));decipher.setAuthTag(Buffer.from(hydrated.jwe.tag,'base64url'))
 assert.deepEqual(Buffer.concat([decipher.update(Buffer.from(hydrated.jwe.ciphertext,'base64url')),decipher.final()]),plaintext)
 assert.equal(Buffer.from(stored.get(SAFE.resourceUuid)).includes(plaintext),false)
})
test('keeps inline envelopes and non-records local while projecting undefined index values',async()=>{
 const {document}=encryptedRecord()
 const inline=await sdk.externalizeConfidentialStorageDocForPersistence({...document,audit:{...document.audit,unset:undefined}})
 assert.deepEqual(inline.jwe,document.jwe)
 assert.equal(Object.hasOwn(inline.audit,'unset'),false)
 let reads=0
 assert.equal(await sdk.hydrateConfidentialStorageDocFromPersistence(document,{async get(){reads++;throw Error('unexpected read')}}),document)
 assert.equal(reads,0)
 let writes=0
 const ordinary={id:SAFE.resourceUuid,optional:undefined}
 assert.deepEqual(await sdk.externalizeConfidentialStorageDocForPersistence(ordinary,{async put(){writes++;throw Error('unexpected write')}}),{id:SAFE.resourceUuid})
 assert.equal(writes,0)
})
test('writer failure or an invalid blob reference never discards the source envelope',async()=>{
 const {document}=encryptedRecord()
 await assert.rejects(sdk.externalizeConfidentialStorageDocForPersistence(document,{async put(){throw Error('write failed')}}),/write failed/u)
 await assert.rejects(sdk.externalizeConfidentialStorageDocForPersistence(document,{async put(){return{blobRef:''}}}),TypeError)
 assert.ok(document.jwe)
 let writes=0
 await assert.rejects(sdk.externalizeConfidentialStorageDocForPersistence({...document,jwe:[]},{async put(){writes++;return{blobRef:SAFE.resourceUuid}}}),TypeError)
 assert.equal(writes,0)
})
test('malformed stored JSON, non-object payloads and reader failures fail at hydration',async()=>{
 const persisted={id:SAFE.resourceUuid,status:'active',sequence:1,blob:{blobRef:SAFE.resourceUuid}}
 for(const serialized of ['broken','null','[]','"text"']) await assert.rejects(sdk.hydrateConfidentialStorageDocFromPersistence(persisted,{async get(){return{dataBytes:new TextEncoder().encode(serialized)}}}))
 await assert.rejects(sdk.hydrateConfidentialStorageDocFromPersistence(persisted,{async get(){throw Error('read failed')}}),/read failed/u)
})
