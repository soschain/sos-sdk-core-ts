// Flow contract: consumers read only typed response counts and diagnostics, never fabricated change-correlation identifiers.
import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {fileURLToPath} from 'node:url'
test('response summary is available through the public owned subpath',()=>{
 const fixture=fileURLToPath(new URL('./fixtures/response-summary-consumer.ts',import.meta.url))
 const program=ts.createProgram([fixture],{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noEmit:true,skipLibCheck:true,types:[]})
 assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item=>ts.flattenDiagnosticMessageText(item.messageText,'\n')),[])
})
