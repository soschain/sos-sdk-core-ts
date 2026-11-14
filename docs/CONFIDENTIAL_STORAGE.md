# Portable confidential record persistence

Record, index, audit and blob-reference data shapes belong to SOS Data. Core's
`confidential-storage-persistence` runtime uses explicit reader/writer ports to
externalize an encrypted JSON envelope and hydrate it later. The host supplies
its backend, collection authorization and cryptographic verification/decryption.

Externalization preserves metadata, removes inline encrypted content only after
a successful blob write, and requires a usable blob reference. Input records
remain unchanged on success or failure. Hydration prefers an existing inline
envelope and rejects malformed JSON or non-object blob payloads.

The minimal record guard recognizes shape; it does not establish a complete
resource schema, valid lifecycle transition, authenticated author or access right.
The same runtime can use a memory, mobile or durable blob adapter without making
backend selection part of the data contract.
