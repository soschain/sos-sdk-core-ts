// Flow contract: public clinical runtime helpers consume data-owned creator contracts without accepting unrelated role kinds, malformed input shapes or native routing authority.
import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

test('consumer can use typed clinical binding and replacement helpers from their public SDK subpaths', () => {
  const fixture = fileURLToPath(new URL('./fixtures/clinical-creator-consumer.ts', import.meta.url))
  const program = ts.createProgram([fixture], { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: [] })
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), [])
})
