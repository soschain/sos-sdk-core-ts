// Flow contract: stable person, role assignment, document author and authenticated channel evidence remain separate; pure matching never authenticates aliases or grants clinical operations.
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStableActorIdentifier } from 'antifraud-data-utils-ts'
import { REPOSITORY_SAFE_EXAMPLES as SAFE } from 'sos-data-utils-ts/repository-privacy'
import { HealthcareActorRoles, getHealthcareRoleByClaim } from 'sos-data-utils-ts/healthcare-roles'
import { CompositionAttesterModes, HL7_RELATED_PERSON_FUNCTIONAL_ROLES } from 'fhir-data-utils-ts'
import * as sdk from '../dist/index.js'

const actor = `urn:uuid:${SAFE.resourceUuid}`
const assignment = `urn:uuid:${SAFE.organizationScopedResources.departmentUuid}`
const subject = `urn:uuid:${SAFE.demoOrganizationUuids.healthCare}`
const contact = buildStableActorIdentifier({ contactKind: 'email', contact: SAFE.individualEmail })
const role = HealthcareActorRoles.GeneralistMedicalPractitioner
function professional() {
  return {
    kind: 'professional', actorIdentifier: actor, authorIdentifier: assignment,
    ownerIdentifier: SAFE.didWeb, role,
    actorDids: [SAFE.didWeb], verifiedContactIdentifiers: [contact],
    dcrClientIds: [SAFE.resourceUuid], keyIds: [`${SAFE.didWeb}#key`],
  }
}

test('normalizes full UUID forms while retaining persisted assignment spelling and role coding', () => {
  assert.equal(typeof sdk.normalizeClinicalCreatorBinding, 'function')
  const input = { ...professional(), actorIdentifier: SAFE.resourceUuid.toUpperCase(), assignmentIdentifier: SAFE.organizationScopedResources.departmentUuid.replaceAll('-', ''), authorIdentifier: undefined }
  const binding = sdk.normalizeClinicalCreatorBinding(input)
  assert.equal(binding.actorIdentifier, actor)
  assert.equal(binding.authorIdentifier, assignment)
  assert.equal(binding.ownerIdentifier, SAFE.didWeb)
  assert.equal(binding.role, 'org.ilo.isco|2211')
  assert.equal(Object.hasOwn(binding, 'assignmentIdentifier'), false)
  assert.equal(input.authorIdentifier, undefined)
  assert.equal(input.actorIdentifier, SAFE.resourceUuid.toUpperCase())
  const permission = sdk.buildClinicalCreatorPermissionActor(binding)
  assert.deepEqual(permission, { actorIdentifier: assignment, actorRole: binding.role })
  assert.notEqual(permission.actorIdentifier, binding.actorIdentifier)
})

test('rejects mismatched or absent assignments, invalid UUIDs and ungoverned role claims', () => {
  assert.equal(typeof sdk.normalizeClinicalCreatorBinding, 'function')
  for (const patch of [
    { assignmentIdentifier: SAFE.organizationScopedResources.serviceUuid },
    { authorIdentifier: undefined }, { actorIdentifier: 'short-display' },
    { role: 'unknown-system|2211' }, { ownerIdentifier: '' },
  ]) assert.throws(() => sdk.normalizeClinicalCreatorBinding({ ...professional(), ...patch }), TypeError)
  assert.throws(() => sdk.buildClinicalCreatorPermissionActor({ ...professional(), authorIdentifier: SAFE.individualEmail }), TypeError)
})

test('normalizes a member owner and governed functional relationship without treating Controller as a professional kind', () => {
  const responsible = HL7_RELATED_PERSON_FUNCTIONAL_ROLES.find(entry => entry.code === 'RESPRSN')
  const member = sdk.normalizeClinicalCreatorBinding({
    kind: 'individual-member', actorIdentifier: SAFE.resourceUuid,
    assignmentIdentifier: SAFE.organizationScopedResources.departmentUuid,
    ownerIdentifier: SAFE.demoOrganizationUuids.healthCare, role: responsible.code,
  })
  assert.equal(member.ownerIdentifier, subject)
  assert.equal(member.role, `${responsible.codingSystem}|${responsible.code}`)
})

test('resolves each already-verified registered alias without rewriting or mutating the binding', () => {
  assert.equal(typeof sdk.resolveClinicalCreatorBinding, 'function')
  const binding = sdk.normalizeClinicalCreatorBinding(professional())
  for (const evidence of [
    { actorDid: SAFE.didWeb }, { verifiedContactIdentifiers: [contact] },
    { dcrClientId: SAFE.resourceUuid }, { keyId: `${SAFE.didWeb}#key` },
  ]) assert.equal(sdk.resolveClinicalCreatorBinding([binding], evidence), binding)
  assert.equal(sdk.resolveClinicalCreatorBinding([binding], {}), undefined)
  assert.equal(sdk.resolveClinicalCreatorBinding([binding], { actorDid: `${SAFE.didWeb}:unregistered` }), undefined)
  assert.equal(sdk.resolveClinicalCreatorBinding([binding], { verifiedContactIdentifiers: [SAFE.individualEmail] }), undefined)
  assert.equal(sdk.resolveClinicalCreatorBinding([binding], { verifiedContactIdentifiers: [SAFE.resourceUuid] }), undefined)
  assert.equal(binding.role, 'org.ilo.isco|2211')
})

test('throws on ambiguous matches rather than selecting a role, tenant or first result', () => {
  const binding = sdk.normalizeClinicalCreatorBinding(professional())
  const other = { ...binding, authorIdentifier: `urn:uuid:${SAFE.organizationScopedResources.serviceUuid}` }
  assert.throws(() => sdk.resolveClinicalCreatorBinding([binding, other], { actorDid: SAFE.didWeb }), /more than one/)
  assert.throws(() => sdk.resolveClinicalCreatorBinding([{ ...binding, actorIdentifier: 'invalid' }], {}), TypeError)
})

test('source organization authors professional provenance while the assignment attests', () => {
  assert.equal(typeof sdk.buildFhirIpsCreatorProvenance, 'function')
  const input = { kind: 'professional', actorIdentifier: actor, authorIdentifier: assignment, organizationReference: SAFE.didWeb, role }
  const provenance = sdk.buildFhirIpsCreatorProvenance({ ...input, attestedAt: SAFE.organizationScopedResources.slotStart })
  assert.equal(provenance.authorReference, SAFE.didWeb)
  assert.deepEqual(provenance.attesters, [{ mode: CompositionAttesterModes.Professional, party: { reference: assignment }, time: SAFE.organizationScopedResources.slotStart }])
  assert.deepEqual(provenance.entries.map(entry => entry.resource.resourceType), ['Organization', 'Practitioner', 'PractitionerRole'])
  assert.equal(provenance.entries[1].fullUrl, actor)
  assert.equal(provenance.entries[2].fullUrl, assignment)
  assert.equal(provenance.entries[2].resource.practitioner.reference, actor)
  assert.equal(sdk.buildFhirIpsCreatorAuthor(input).authorReference, assignment)
})

test('source individual authors member provenance and the relationship assignment attests', () => {
  const responsible = HL7_RELATED_PERSON_FUNCTIONAL_ROLES.find(entry => entry.code === 'RESPRSN')
  const provenance = sdk.buildFhirIpsCreatorProvenance({
    kind: 'individual-member', actorIdentifier: actor, authorIdentifier: assignment,
    subjectReference: subject, role: `${responsible.codingSystem}|${responsible.code}`,
  })
  assert.equal(provenance.authorReference, subject)
  assert.equal(provenance.attesters[0].party.reference, assignment)
  assert.equal(provenance.attesters[0].mode, CompositionAttesterModes.Personal)
  assert.equal(provenance.entries[0].resource.resourceType, 'RelatedPerson')
  assert.equal(provenance.entries[0].resource.patient.reference, subject)
})

test('subject-only provenance adds no manufactured person or attestation entries', () => {
  const result = sdk.buildFhirIpsCreatorProvenance({ kind: 'individual-subject', actorIdentifier: subject, authorIdentifier: subject, subjectReference: subject })
  assert.deepEqual(result, { authorReference: subject, attesters: [], entries: [] })
  assert.throws(() => sdk.buildFhirIpsCreatorAuthor({ kind: 'individual-subject', actorIdentifier: actor, authorIdentifier: assignment, subjectReference: subject }), /ONESELF/)
})

test('normalizes the subject-only binding and rejects unknown evidence contact spellings', () => {
  const role = getHealthcareRoleByClaim('ONESELF')
  assert.ok(role)
  const binding = sdk.normalizeClinicalCreatorBinding({
    kind: 'individual-subject', actorIdentifier: SAFE.demoOrganizationUuids.healthCare,
    assignmentIdentifier: SAFE.demoOrganizationUuids.healthCare,
    ownerIdentifier: SAFE.demoOrganizationUuids.healthCare, role: role.claim,
    verifiedContactIdentifiers: [contact],
  })
  assert.equal(binding.actorIdentifier, subject)
  assert.equal(binding.authorIdentifier, subject)
  assert.equal(binding.ownerIdentifier, subject)
  assert.equal(sdk.resolveClinicalCreatorBinding([binding], { verifiedContactIdentifiers: [`${contact}:suffix`] }), undefined)
})

test('retains explicit source author, attester mode/time and rejects missing governed role provenance', () => {
  const input = { kind: 'professional', actorIdentifier: actor, authorIdentifier: assignment, organizationReference: SAFE.didWeb, role }
  const author = `${SAFE.didWeb}:source`
  const result = sdk.buildFhirIpsCreatorProvenance({ ...input, compositionAuthorReference: author, attesterMode: CompositionAttesterModes.Legal })
  assert.equal(result.authorReference, author)
  assert.equal(result.attesters[0].mode, CompositionAttesterModes.Legal)
  assert.throws(() => sdk.buildFhirIpsCreatorProvenance({ ...input, role: 'unknown' }), TypeError)
})
