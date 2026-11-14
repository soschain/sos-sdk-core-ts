# Clinical creator and successor profile

SOS Data owns creator kinds, stable binding/evidence models, provenance inputs
and successor-result contracts. Core implements reusable profile behavior over
those contracts. Antifraud owns UUID and stable-contact primitives; FHIR owns
native references, attester modes and functional role coding descriptors.

`normalizeClinicalCreatorBinding` accepts complete UUID/UUID-URN forms, resolves
governed role codings and emits the historical `authorIdentifier` wire property.
That property identifies the role/relationship assignment. It is distinct from
the person's `actorIdentifier` and the organization's/subject's `ownerIdentifier`.
`buildClinicalCreatorPermissionActor` deliberately returns the assignment UUID
as the permission actor identifier, with its separately governed role.

`resolveClinicalCreatorBinding` matches caller-verified operational DID,
registered client/key aliases or stable verified-contact identifiers. It returns
one matching binding, no binding or an ambiguity error. Its input contract does
not prove that a caller actually verified those aliases. Token/signature/contact
verification and tenant admission remain mandatory in the owning transport and
service. The helper neither loads records nor chooses a repository backend.

`buildFhirIpsCreatorProvenance` separates document author and attester. A
professional organization is the default author; the PractitionerRole assignment
attests it. An individual owner is the default personal author; a RelatedPerson
assignment attests it. Subject-only creation has no manufactured attester entries.
An explicit source author remains distinct from the transport signer. The
deprecated `buildFhirIpsCreatorAuthor` retains its historical role-as-author
projection instead of silently changing its result semantics.

`resolveClinicalDocumentAuthorOrganization` describes the imported document graph
using the existing first-Composition/first-author and custodian fallback profile.
It supports direct organization authors and PractitionerRole/Practitioner paths.
It does not validate the complete FHIR profile, prove ownership or authenticate
the submitter. Legacy fallback and date parsing are preserved compatibility
behavior, not additional guarantees.

`evaluateClinicalResourceReplacement` compares the same nonempty resource ID,
same nonempty organization owner and a strictly later parseable document date.
Its successor outcome is only a narrow update-policy result. The Gateway still
checks authenticated actors, tenant/subject scope, registered author admission,
consent and resource permissions before writing. This helper must never be used
as delete authorization. Delete admission needs its own integration proof in the
owning Gateway; a unit test of this comparison cannot establish that boundary.

Original compatibility source:
<https://github.com/Global-DataCare/gdc-common-utils-ts>, specifically the reviewed
[creator profile](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/f4031b221216cacd9917d1d20c5ff0b03bed7045/src/utils/fhir-ips-creator-identity.ts)
and [document successor profile](https://github.com/Global-DataCare/gdc-common-utils-ts/blob/f4031b221216cacd9917d1d20c5ff0b03bed7045/src/utils/clinical-resource-replacement.ts).
These source comparisons add no GDC runtime or data dependency.
