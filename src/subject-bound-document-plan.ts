import { CompositionClaim, ResourceTypesFhirR4, ResourceTypesFhirR5 } from 'fhir-data-utils-ts'
import { validateR4DocumentBundleStructure } from 'fhir-data-utils-ts/document-bundle-r4'
import {
  DocumentSupportInputTypes,
  IndexedClaimsContext,
  IndexedR4SemanticInputTypes,
  IndexedStructuralCompatibilityTypes,
  documentSupportResourceToClaims,
  indexedR4ResourceToClaims,
  indexedStructuralResourceToClaims,
} from 'fhir-data-utils-ts/indexed-r4'

type JsonRecord = Record<string, unknown>

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resourceOf(entry: unknown): JsonRecord | undefined {
  return record(entry) && record(entry.resource) ? entry.resource : undefined
}

function hasResourceType<T extends string>(resource: JsonRecord, types: readonly T[]): resource is JsonRecord & {resourceType: T} {
  return types.some(type => type === resource.resourceType)
}

function project(resource: JsonRecord): JsonRecord {
  if (hasResourceType(resource, DocumentSupportInputTypes)) {
    return documentSupportResourceToClaims(resource, {profile: 'document-support-r4-v1'})
  }
  if (hasResourceType(resource, IndexedR4SemanticInputTypes)) {
    return indexedR4ResourceToClaims(resource, {profile: 'indexed-r4-semantic'})
  }
  // EncounterHistory is an R5 family in the historical structural profile;
  // selecting this R4 document operation must never select that R5 behavior.
  if (resource.resourceType !== ResourceTypesFhirR5.EncounterHistory && hasResourceType(resource, IndexedStructuralCompatibilityTypes)) {
    return indexedStructuralResourceToClaims(resource, {profile: 'indexed-structural-compat-v1'})
  }
  throw new TypeError(`document_resource_type_unsupported: ${text(resource.resourceType)}`)
}

function aliases(entry: unknown): string[] {
  const resource = resourceOf(entry)
  const type = text(resource?.resourceType), id = text(resource?.id)
  const fullUrl = record(entry) ? text(entry.fullUrl) : ''
  return [...new Set([fullUrl, type && id ? `${type}/${id}` : '', id,
    fullUrl ? fullUrl.split('/').slice(-2).join('/') : ''].filter(Boolean))]
}

function sectionMembership(composition: JsonRecord): {tokens: string[]; references: Map<string, string[]>} {
  const tokens: string[] = [], references = new Map<string, string[]>()
  function visit(sections: unknown): void {
    if (!Array.isArray(sections)) return
    for (const section of sections) {
      if (!record(section)) continue
      const codings = record(section.code) && Array.isArray(section.code.coding) ? section.code.coding : []
      const coding = record(codings[0]) ? codings[0] : undefined
      const system = text(coding?.system), code = text(coding?.code)
      const token = code ? system ? `${system === 'http://loinc.org' ? 'LOINC' : system}|${code}` : code : ''
      if (token) {
        tokens.push(token)
        if (Array.isArray(section.entry)) for (const item of section.entry) {
          const reference = record(item) ? text(item.reference) : ''
          if (!reference) continue
          for (const alias of [reference, reference.split('/').slice(-2).join('/'), reference.split('/').pop() ?? ''].filter(Boolean)) {
            references.set(alias, [...new Set([...(references.get(alias) ?? []), token])])
          }
        }
      }
      visit(section.section)
    }
  }
  visit(composition.section)
  return {tokens: [...new Set(tokens)], references}
}

/**
 * Plans an import for a subject already selected and authorized by the caller.
 * Clones the native document, adds the explicit indexed R4 claim projections,
 * and binds subject/patient references to that selected subject. Imported claim
 * arrays and other source metadata retain precedence, except those references.
 * The caller confirms identity, authorizes the subject and persists the plan.
 */
export function prepareR4DocumentForSubject(bundle: unknown, subjectDid: string): JsonRecord {
  const validation = validateR4DocumentBundleStructure(bundle)
  if (!validation.ok) throw new TypeError(`document_bundle_invalid: ${validation.issues.join(' ')}`)
  const subject = text(subjectDid)
  if (!subject) throw new TypeError('document_subject_required')
  const prepared: unknown = JSON.parse(JSON.stringify(bundle))
  if (!record(prepared) || !Array.isArray(prepared.entry)) throw new TypeError('document_bundle_invalid')
  const composition = resourceOf(prepared.entry[0])
  if (!composition) throw new TypeError('document_bundle_invalid')
  const membership = sectionMembership(composition)
  for (const entry of prepared.entry) {
    const resource = resourceOf(entry)
    if (!resource) continue
    const type = text(resource.resourceType)
    if (type === ResourceTypesFhirR4.Composition || record(resource.subject) && text(resource.subject.reference)) {
      resource.subject = {...(record(resource.subject) ? resource.subject : {}), reference: subject}
    }
    if (record(resource.patient) && text(resource.patient.reference)) resource.patient = {...resource.patient, reference: subject}
    const meta = record(resource.meta) ? resource.meta : {}
    const existing = record(meta.claims) ? meta.claims : {}
    const claims: JsonRecord = {...project(resource), ...existing}
    if (type !== ResourceTypesFhirR4.Patient) for (const field of ['subject', 'patient']) {
      const key = `${type}.${field}`
      const qualified = `${IndexedClaimsContext}.${key}`
      const qualifiedPresent = Object.prototype.hasOwnProperty.call(claims, qualified)
      const nativeReference = record(resource[field]) && text(resource[field].reference)
      if (!nativeReference && !Object.prototype.hasOwnProperty.call(claims, key) && !qualifiedPresent) continue
      claims[key] = subject
      if (qualifiedPresent) claims[qualified] = subject
    }
    const sections = type === ResourceTypesFhirR4.Composition ? membership.tokens : aliases(entry).flatMap(alias => membership.references.get(alias) ?? [])
    if (sections.length) claims[CompositionClaim.Section] = [...new Set(sections)].join(',')
    resource.meta = {...meta, claims}
  }
  return prepared
}
