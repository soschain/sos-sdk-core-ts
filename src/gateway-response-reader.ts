import {BundleReader} from 'sos-data-utils-ts/bundle-contract'

type ResourceRecord=Record<string,unknown>

function record(value:unknown):ResourceRecord|undefined{
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    ?value as ResourceRecord:undefined
}

/** Breadth-first compatibility navigation, bounded by identity even for cycles. */
function nestedRecords(root:unknown):ResourceRecord[]{
  const pending:unknown[]=[root]
  const visited=new Set<object>()
  const result:ResourceRecord[]=[]
  for(let index=0;index<pending.length;index++){
    const value=pending[index]
    if(value===null||typeof value!=='object'||visited.has(value))continue
    visited.add(value)
    if(Array.isArray(value))pending.push(...value)
    else{
      const item=value as ResourceRecord
      result.push(item)
      pending.push(...Object.values(item))
    }
  }
  return result
}

/**
 * Reads canonical data[].resource search results in response order. Historical
 * resource.{total,data} aggregates and already-extracted rows are read-only
 * compatibility inputs. This projection neither evaluates response success nor
 * grants permission; use the existing change-response analyzer for write results.
 */
export function extractBundleSearchResources(input:unknown):ResourceRecord[]{
  const candidates=nestedRecords(input)
  for(const candidate of candidates){
    if(!Array.isArray(candidate.data))continue
    const entries=candidate.data.map(record).filter((value):value is ResourceRecord=>value!==undefined)
    if(!entries.length)return []
    let recognizedAggregate=false
    const resources:ResourceRecord[]=[]
    for(const entry of entries){
      const resource=record(entry.resource)
      if(!resource)continue
      if(resource.total!==undefined&&Array.isArray(resource.data)){
        recognizedAggregate=true
        resources.push(...resource.data.map(record).filter((value):value is ResourceRecord=>value!==undefined))
      }else resources.push(resource)
    }
    if(resources.length)return resources
    if(recognizedAggregate)return []
    return entries
  }
  for(const candidate of candidates){
    const rows=record(candidate.resource)?.data
    if(Array.isArray(rows))return rows.map(record).filter((value):value is ResourceRecord=>value!==undefined)
  }
  return []
}

/** Unwraps one transport body only when it supplies an operational/native array. */
export function unwrapBundleLikeResponseBody(input:unknown):ResourceRecord{
  const outer=record(input)??{}
  const body=record(outer.body)
  return body&&(Array.isArray(body.data)||Array.isArray(body.entry))?body:outer
}

/** Reads the first entry's resource without skipping over an absent first result. */
export function readFirstBundleResourceFromResponseBody(input:unknown):ResourceRecord|undefined{
  const reader=new BundleReader(unwrapBundleLikeResponseBody(input))
  return record(reader.getEntries()[0]?.resource)
}

export type BundleResponseSummary=Readonly<{
  totalOperations:number;successfulOperations:number;errorOperations:number
  hasWarnings:boolean;hasErrors:boolean;issueDiagnostics:readonly string[]
}>

/** Response counts only: no submitted-change correlation, authorization or delivery acknowledgement. */
export function summarizeBundleResponse(input:unknown):BundleResponseSummary{
  const body=unwrapBundleLikeResponseBody(input)
  const entries=Array.isArray(body.entry)?body.entry:Array.isArray(body.data)?body.data:[]
  let successfulOperations=0,hasWarnings=false,hasErrors=false
  const issueDiagnostics:string[]=[]
  for(const raw of entries){
    if(raw===null||raw===undefined)throw new TypeError('bundle_response_entry_required')
    const response=record(record(raw)?.response)
    const status=typeof response?.status==='string'?response.status.trim():''
    const outcome=record(response?.outcome)
    const issues=Array.isArray(outcome?.issue)?outcome.issue:[]
    let blocking=false
    for(const rawIssue of issues){
      const issue=record(rawIssue)
      if(!issue)continue
      const severity=issue.severity
      if(severity==='warning'){hasWarnings=true;blocking=true}
      if(severity==='fatal'||severity==='error'){hasErrors=true;blocking=true}
      const diagnostic=typeof issue.diagnostics==='string'&&issue.diagnostics.trim()
        ?issue.diagnostics:record(issue.details)?.text
      if(typeof diagnostic==='string'&&diagnostic.trim())issueDiagnostics.push(diagnostic)
    }
    if(/^2\d\d$/u.test(status)&&!blocking)successfulOperations++
  }
  return {totalOperations:entries.length,successfulOperations,errorOperations:entries.length-successfulOperations,hasWarnings,hasErrors,issueDiagnostics}
}

/** Returns only the first operation's canonical resource claims; no fallback to a later entry. */
export function getClaimsInFirstDataEntry(input:unknown):Record<string,unknown>{
 const bundle=record(input)
 const entries=Array.isArray(bundle?.data)?bundle.data:Array.isArray(bundle?.entry)?bundle.entry:[]
 return record(record(record(record(entries[0])?.resource)?.meta)?.claims)??{}
}
