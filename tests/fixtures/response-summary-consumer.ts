import {summarizeBundleResponse,type BundleResponseSummary} from 'sos-sdk-core-ts/gateway-response-reader'
const summary:BundleResponseSummary=summarizeBundleResponse({data:[]})
const total:number=summary.totalOperations
const success:number=summary.successfulOperations
const errors:number=summary.errorOperations
const blocked:boolean=summary.hasErrors
const warnings:boolean=summary.hasWarnings
const diagnostics:readonly string[]=summary.issueDiagnostics
// @ts-expect-error Response-only counting cannot supply change correlation.
summary.successfulIdentifiers
void [total,success,errors,blocked,warnings,diagnostics]
