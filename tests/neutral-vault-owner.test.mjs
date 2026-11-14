// Flow contract: the public SOS vault import path preserves the neutral Antifraud query/record/repository API without owning a duplicate storage contract.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

test('reexports the neutral port instead of declaring a parallel backend interface', () => {
  const source = readFileSync(new URL('../src/vault-repository.ts', import.meta.url), 'utf8')
  assert.match(source, /from ['"]antifraud-data-utils-ts\/vault-repository['"]/u)
  assert.doesNotMatch(source, /export interface IVaultRepository/u)
})

test('public record, query and repository types retain cross-package assignment compatibility', () => {
  const fixture = fileURLToPath(new URL('./fixtures/neutral-vault-owner-consumer.ts', import.meta.url))
  const program = ts.createProgram([fixture], { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: [] })
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), [])
})
