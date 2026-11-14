import { isStableActorIdentifier, normalizeUuid } from 'antifraud-data-utils-ts'
import { CompositionAttesterModes, HL7_RELATED_PERSON_FUNCTIONAL_ROLES } from 'fhir-data-utils-ts'
import { getHealthcareRoleByClaim } from 'sos-data-utils-ts/healthcare-roles'
import {
  FhirIpsCreatorKinds,
  type ClinicalCreatorBinding, type ClinicalCreatorBindingInput,
  type AuthenticatedClinicalCreatorEvidence, type ClinicalCreatorPermissionActor,
  type FhirIpsCreatorAuthorInput, type FhirIpsCreatorAuthor,
  type FhirIpsCreatorProvenanceInput, type FhirIpsCreatorProvenance,
} from 'sos-data-utils-ts/clinical-creator-contract'

/** Normalize one profile binding without authenticating contacts or granting access. */
export function normalizeClinicalCreatorBinding(input: ClinicalCreatorBindingInput): ClinicalCreatorBinding {
  const actorIdentifier = canonicalUuidUrn(input.actorIdentifier, 'actorIdentifier')
  const preferred = input.assignmentIdentifier ? canonicalUuidUrn(input.assignmentIdentifier, 'assignmentIdentifier') : undefined
  const historical = input.authorIdentifier ? canonicalUuidUrn(input.authorIdentifier, 'authorIdentifier') : undefined
  if (preferred && historical && preferred !== historical) {
    throw new TypeError('assignmentIdentifier and deprecated authorIdentifier must identify the same assignment.')
  }
  const authorIdentifier = preferred || historical
  if (!authorIdentifier) throw new TypeError('assignmentIdentifier is required.')
  const ownerIdentifier = input.kind === FhirIpsCreatorKinds.Professional
    ? requireReference(input.ownerIdentifier, 'ownerIdentifier')
    : canonicalUuidUrn(input.ownerIdentifier, 'ownerIdentifier')
  const coding = requireRoleCoding(input.role)
  const { assignmentIdentifier: _assignment, ...wire } = input
  return { ...wire, actorIdentifier, authorIdentifier, ownerIdentifier, role: `${coding.system}|${coding.code}` }
}

/** Project the assignment UUID used by Consent rules, never the person's UUID. */
export function buildClinicalCreatorPermissionActor(binding: ClinicalCreatorBinding): ClinicalCreatorPermissionActor {
  requireUuidUrn(binding.actorIdentifier, 'binding.actorIdentifier')
  const actorIdentifier = requireUuidUrn(binding.authorIdentifier, 'binding.authorIdentifier')
  requireReference(binding.ownerIdentifier, 'binding.ownerIdentifier')
  requireRoleCoding(binding.role)
  return { actorIdentifier, actorRole: binding.role }
}

/** Match caller-verified evidence to exactly one registered binding.
 * This deterministic matcher does not verify tokens, contacts, keys or DIDs.
 * Matching and permission decisions must remain separate at the service boundary.
 */
export function resolveClinicalCreatorBinding(
  bindings: readonly ClinicalCreatorBinding[],
  evidence: AuthenticatedClinicalCreatorEvidence,
): ClinicalCreatorBinding | undefined {
  const contacts = new Set((evidence.verifiedContactIdentifiers || [])
    .map(value => String(value || '').trim()).filter(isStableActorIdentifier))
  const actorDid = String(evidence.actorDid || '').trim()
  const client = String(evidence.dcrClientId || '').trim()
  const key = String(evidence.keyId || '').trim()
  const matches = bindings.filter(binding => {
    requireUuidUrn(binding.actorIdentifier, 'binding.actorIdentifier')
    requireUuidUrn(binding.authorIdentifier, 'binding.authorIdentifier')
    requireReference(binding.ownerIdentifier, 'binding.ownerIdentifier')
    requireRoleCoding(binding.role)
    return Boolean(
      (actorDid && binding.actorDids?.includes(actorDid))
      || (client && binding.dcrClientIds?.includes(client))
      || (key && binding.keyIds?.includes(key))
      || binding.verifiedContactIdentifiers?.some(value => contacts.has(value)),
    )
  })
  if (matches.length > 1) throw new Error('Authenticated channel resolves more than one clinical creator binding.')
  return matches[0]
}

/** Separate source organization/individual author from the assignment attester.
 * Native resources are exchange projections; repository ownership and actor
 * authorization are checked separately by callers.
 */
export function buildFhirIpsCreatorProvenance(input: FhirIpsCreatorProvenanceInput): FhirIpsCreatorProvenance {
  if (input.kind === FhirIpsCreatorKinds.IndividualSubject) {
    return { authorReference: requireReference(input.compositionAuthorReference || input.subjectReference, 'compositionAuthorReference'), attesters: [], entries: [] }
  }
  const creator = buildFhirIpsCreatorAuthor(input)
  const owner = input.kind === FhirIpsCreatorKinds.Professional ? input.organizationReference : input.subjectReference
  const mode = input.attesterMode || (input.kind === FhirIpsCreatorKinds.Professional ? CompositionAttesterModes.Professional : CompositionAttesterModes.Personal)
  return {
    authorReference: requireReference(input.compositionAuthorReference || owner, 'compositionAuthorReference'),
    attesters: [{ mode, party: { reference: creator.authorReference }, ...(input.attestedAt ? { time: input.attestedAt } : {}) }],
    entries: creator.entries,
  }
}

/** @deprecated Historical role-as-author projection; prefer separate provenance. */
export function buildFhirIpsCreatorAuthor(input: FhirIpsCreatorAuthorInput): FhirIpsCreatorAuthor {
  const actor = requireUuidUrn(input.actorIdentifier, 'actorIdentifier')
  const assignment = requireUuidUrn(input.authorIdentifier, 'authorIdentifier')
  if (input.kind === FhirIpsCreatorKinds.IndividualSubject) {
    const subject = requireUuidUrn(input.subjectReference, 'subjectReference')
    if (actor !== subject || assignment !== subject) throw new TypeError('ONESELF author must reference the individual subject identifier.')
    return { authorReference: subject, entries: [] }
  }
  const role = requireRoleCoding(input.role)
  if (input.kind === FhirIpsCreatorKinds.IndividualMember) {
    const subject = requireReference(input.subjectReference, 'subjectReference')
    return {
      authorReference: assignment,
      entries: [{ fullUrl: assignment, resource: {
        resourceType: 'RelatedPerson', id: uuidValue(assignment),
        identifier: [{ value: actor }], patient: { reference: subject }, relationship: [{ coding: [role] }],
      } }],
    }
  }
  const organization = requireReference(input.organizationReference, 'organizationReference')
  return { authorReference: assignment, entries: [
    { fullUrl: organization, resource: { resourceType: 'Organization', identifier: [{ value: organization }] } },
    { fullUrl: actor, resource: { resourceType: 'Practitioner', id: uuidValue(actor), identifier: [{ value: actor }] } },
    { fullUrl: assignment, resource: {
      resourceType: 'PractitionerRole', id: uuidValue(assignment), identifier: [{ value: assignment }],
      practitioner: { reference: actor }, organization: { reference: organization }, code: [{ coding: [role] }],
    } },
  ] }
}

function requireUuidUrn(value: string, label: string): string {
  const urn = String(value || '').trim().toLowerCase()
  if (!urn.startsWith('urn:uuid:') || !normalizeUuid(urn)) throw new TypeError(`${label} must be a canonical urn:uuid identifier.`)
  return urn
}
function canonicalUuidUrn(value: string, label: string): string {
  const normalized = String(value || '').trim().toLowerCase()
  const raw = normalized.startsWith('urn:uuid:') ? normalized.slice('urn:uuid:'.length) : normalized
  if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(raw)) {
    throw new TypeError(`${label} must be a UUID or urn:uuid identifier.`)
  }
  const hex = normalizeUuid(raw)
  if (!hex) throw new TypeError(`${label} must be a UUID or urn:uuid identifier.`)
  return `urn:uuid:${[hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')}`
}
function uuidValue(urn: string): string { return urn.slice('urn:uuid:'.length) }
function requireReference(value: string, label: string): string {
  const reference = String(value || '').trim()
  if (!reference) throw new TypeError(`${label} is required.`)
  return reference
}
function requireRoleCoding(value: string): Readonly<{ system: string; code: string; display?: string }> {
  const role = String(value || '').trim()
  const governed = getHealthcareRoleByClaim(role)
  if (governed) return { system: governed.codingSystem, code: governed.code, ...(governed.titleEn ? { display: governed.titleEn } : {}) }
  const functional = HL7_RELATED_PERSON_FUNCTIONAL_ROLES.find(entry => role === `${entry.codingSystem}|${entry.code}`)
  if (!functional) throw new TypeError('role must be a canonical governed healthcare or RelatedPerson functional role.')
  return { system: functional.codingSystem, code: functional.code, display: functional.display }
}
