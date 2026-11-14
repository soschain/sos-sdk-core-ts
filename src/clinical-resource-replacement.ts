import {
  ClinicalResourceReplacementDecision,
  type ClinicalResourceReplacementInput, type ClinicalResourceReplacementDecisionValue,
  type ClinicalDocumentAuthorOrganization,
} from 'sos-data-utils-ts/clinical-creator-contract'

type NativeProjection = Readonly<{
  resourceType?: unknown; id?: unknown; author?: readonly Readonly<{ reference?: unknown }>[]
  custodian?: Readonly<{ reference?: unknown }>; organization?: Readonly<{ reference?: unknown }>
  practitioner?: Readonly<{ reference?: unknown }>; date?: unknown
}>
type NativeEntry = Readonly<{ fullUrl?: unknown; resource?: NativeProjection }>
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

/** Resolve descriptive document authorship using the existing import profile.
 * First author/Composition and legacy custodian fallback are compatibility rules,
 * not proof that an actor is entitled to write the referenced organization.
 */
export function resolveClinicalDocumentAuthorOrganization(bundle: unknown): ClinicalDocumentAuthorOrganization | undefined {
  const entries = Array.isArray((bundle as { entry?: unknown })?.entry) ? (bundle as { entry: NativeEntry[] }).entry : []
  const composition = entries.find(entry => entry.resource?.resourceType === 'Composition')?.resource
  const authorReference = text(composition?.author?.[0]?.reference)
  const documentDate = text(composition?.date)
  if (!composition || !authorReference || !documentDate || !Number.isFinite(Date.parse(documentDate))) return undefined
  const find = (reference: string): NativeProjection | undefined => entries.find(entry => {
    const full = text(entry.fullUrl)
    const type = text(entry.resource?.resourceType), id = text(entry.resource?.id)
    const relative = type && id ? `${type}/${id}` : ''
    return reference === full || reference === relative || Boolean(full && relative && reference === `${full.replace(/\/$/, '')}/${relative}`)
  })?.resource
  const author = find(authorReference)
  let organizationReference = ''
  if (author?.resourceType === 'Organization') organizationReference = authorReference
  else if (author?.resourceType === 'PractitionerRole') organizationReference = text(author.organization?.reference)
  else if (author?.resourceType === 'Practitioner') {
    const role = entries.find(entry => entry.resource?.resourceType === 'PractitionerRole' && text(entry.resource.practitioner?.reference) === authorReference)?.resource
    organizationReference = text(role?.organization?.reference)
  }
  if (!organizationReference) organizationReference = text(composition.custodian?.reference)
  if (!organizationReference || find(organizationReference)?.resourceType !== 'Organization') return undefined
  return { authorReference, organizationReference, documentDate }
}

/** Narrow successor-update decision. Caller authentication, tenant/subject
 * admission, resource permissions and every delete decision stay with the caller.
 */
export function evaluateClinicalResourceReplacement(input: ClinicalResourceReplacementInput): ClinicalResourceReplacementDecisionValue {
  const id = String(input.existing.resourceId || '').trim()
  const owner = String(input.existing.authorOwnerIdentifier || '').trim()
  const previous = Date.parse(String(input.existing.documentDate || '').trim())
  const next = Date.parse(String(input.incoming.documentDate || '').trim())
  if (!id || String(input.incoming.resourceId || '').trim() !== id
    || !owner || String(input.incoming.authorOwnerIdentifier || '').trim() !== owner
    || !Number.isFinite(previous) || !Number.isFinite(next) || next <= previous) {
    return ClinicalResourceReplacementDecision.Deny
  }
  return ClinicalResourceReplacementDecision.AllowOrganizationSuccessor
}
