import { IssueType, isIssueTypeCode, type IssueTypeCode } from 'fhir-data-utils-ts/operation-outcome'

/** SOS adapter policy; FHIR vocabulary alone does not prescribe an HTTP status. */
export const IssueTypeToHttpStatus: Readonly<Record<IssueTypeCode, string>> = Object.freeze({
  [IssueType.Invalid]: '400',
  [IssueType.Structure]: '400',
  [IssueType.Required]: '400',
  [IssueType.Value]: '400',
  [IssueType.Invariant]: '400',
  [IssueType.Security]: '403',
  [IssueType.Login]: '401',
  [IssueType.Unknown]: '401',
  [IssueType.Expired]: '401',
  [IssueType.Forbidden]: '403',
  [IssueType.Suppressed]: '403',
  [IssueType.Processing]: '422',
  [IssueType.NotSupported]: '501',
  [IssueType.Duplicate]: '409',
  [IssueType.MultipleMatches]: '409',
  [IssueType.NotFound]: '404',
  [IssueType.Deleted]: '410',
  [IssueType.TooLong]: '413',
  [IssueType.CodeInvalid]: '400',
  [IssueType.Extension]: '400',
  [IssueType.TooCostly]: '422',
  [IssueType.BusinessRule]: '422',
  [IssueType.Conflict]: '409',
  [IssueType.LimitedFilter]: '422',
  [IssueType.Transient]: '503',
  [IssueType.LockError]: '423',
  [IssueType.NoStore]: '503',
  [IssueType.Exception]: '500',
  [IssueType.Timeout]: '504',
  [IssueType.Incomplete]: '206',
  [IssueType.Throttled]: '429',
  [IssueType.Informational]: '200',
  [IssueType.Success]: '200',
})

/** Propagates an operational failure without granting caller-controlled status authority. */
export class ManagerError extends Error {
  public readonly code: IssueTypeCode
  public readonly status: string

  constructor(message: string, code: IssueTypeCode) {
    super(message)
    this.name = 'ManagerError'
    this.code = isIssueTypeCode(code) ? code : IssueType.Exception
    this.status = IssueTypeToHttpStatus[this.code]
  }
}
