// Flow contract: runtime operational failures preserve reviewed issue-to-HTTP policy and fail closed for unrecognized issue codes.
import assert from 'node:assert/strict'
import test from 'node:test'
import * as sdk from '../dist/index.js'

test('carries an Error with a canonical issue and the established string status', () => {
  assert.equal(typeof sdk.ManagerError, 'function')
  for (const [code, status] of [
    ['forbidden', '403'], ['not-found', '404'], ['login', '401'],
    ['conflict', '409'], ['timeout', '504'], ['required', '400'],
    ['processing', '422'], ['not-supported', '501'], ['success', '200'],
  ]) {
    const error = new sdk.ManagerError('Operation rejected', code)
    assert.equal(error instanceof Error, true)
    assert.equal(error.name, 'ManagerError')
    assert.equal(error.message, 'Operation rejected')
    assert.equal(error.code, code)
    assert.equal(error.status, status)
    assert.equal(typeof error.stack, 'string')
  }
})

test('unknown and prototype-shaped codes cannot provide a success status or inherited value', () => {
  assert.equal(typeof sdk.ManagerError, 'function')
  for (const code of ['toString', '__proto__', 'future-issue', '', undefined, {}]) {
    const error = new sdk.ManagerError('Operation rejected', code)
    assert.equal(error.code, 'exception')
    assert.equal(error.status, '500')
  }
  assert.equal(Object.isFrozen(sdk.IssueTypeToHttpStatus), true)
})
