import type {RouteContext} from 'sos-data-utils-ts/gateway-transport-contract'

/** Explicit operational route selectors; none of these fields confer authority. */
export type TenantResourceActionSelector=RouteContext&Readonly<{
  version:string
  section:string
  format:string
  resourceType:string
  action:string
}>

function segment(value:unknown):string{
  if(typeof value!=='string')throw new TypeError('gateway_route_segment_required')
  const normalized=value.trim().replace(/^\/+|\/+$/gu,'')
  if(!normalized)throw new TypeError('gateway_route_segment_required')
  return normalized
}

/**
 * Formats the explicit eight-segment tenant route without selecting a provider,
 * inventing a default jurisdiction, encoding a transport, or checking access.
 * Boundary slashes are normalized; the supplied namespace and wire case remain.
 */
export function buildTenantResourceActionPath(input:TenantResourceActionSelector):string{
  if(!input||typeof input!=='object')throw new TypeError('gateway_route_context_required')
  return `/${segment(input.tenantId)}/cds-${segment(input.jurisdiction)}`
    +`/${segment(input.version)}/${segment(input.sector)}/${segment(input.section)}`
    +`/${segment(input.format)}/${segment(input.resourceType)}/${segment(input.action)}`
}
