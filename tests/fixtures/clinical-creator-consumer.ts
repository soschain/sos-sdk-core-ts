// Flow contract: typed public helpers retain stable person/assignment/owner separation and return a decision rather than an authorization grant.
import { normalizeClinicalCreatorBinding, buildClinicalCreatorPermissionActor, resolveClinicalCreatorBinding, buildFhirIpsCreatorProvenance } from 'sos-sdk-core-ts/clinical-creator'
import { evaluateClinicalResourceReplacement } from 'sos-sdk-core-ts/clinical-resource-replacement'
import { FhirIpsCreatorKinds, type ClinicalCreatorBinding, type ClinicalResourceReplacementDecisionValue } from 'sos-data-utils-ts/clinical-creator-contract'
import { REPOSITORY_SAFE_EXAMPLES as SAFE } from 'sos-data-utils-ts/repository-privacy'
import { HealthcareActorRoles } from 'sos-data-utils-ts/healthcare-roles'

const binding: ClinicalCreatorBinding = normalizeClinicalCreatorBinding({
  kind: FhirIpsCreatorKinds.Professional, actorIdentifier: SAFE.resourceUuid,
  assignmentIdentifier: SAFE.organizationScopedResources.departmentUuid,
  ownerIdentifier: SAFE.didWeb, role: HealthcareActorRoles.GeneralistMedicalPractitioner,
})
const permission = buildClinicalCreatorPermissionActor(binding)
const found: ClinicalCreatorBinding | undefined = resolveClinicalCreatorBinding([binding], { actorDid: SAFE.didWeb })
const provenance = buildFhirIpsCreatorProvenance({
  kind: FhirIpsCreatorKinds.Professional, actorIdentifier: binding.actorIdentifier,
  authorIdentifier: binding.authorIdentifier, organizationReference: binding.ownerIdentifier,
  role: binding.role,
})
const existing = { resourceId: SAFE.resourceUuid, authorOwnerIdentifier: SAFE.didWeb, documentDate: SAFE.organizationScopedResources.slotStart }
const result: ClinicalResourceReplacementDecisionValue = evaluateClinicalResourceReplacement({ existing, incoming: { ...existing, documentDate: SAFE.organizationScopedResources.slotEnd } })
// @ts-expect-error Clinical actor kinds do not include organization Controller.
normalizeClinicalCreatorBinding({ kind: 'controller', actorIdentifier: SAFE.resourceUuid, assignmentIdentifier: SAFE.resourceUuid, ownerIdentifier: SAFE.didWeb, role: binding.role })
// @ts-expect-error Stable actor identity is required even if a contact exists.
normalizeClinicalCreatorBinding({ kind: FhirIpsCreatorKinds.Professional, assignmentIdentifier: SAFE.resourceUuid, ownerIdentifier: SAFE.didWeb, role: binding.role })
// @ts-expect-error A successor outcome is not an authenticated boolean grant.
const authorized: boolean = result
void [permission, found, provenance, authorized]
