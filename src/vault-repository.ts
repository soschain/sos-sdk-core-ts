/** A record inside an adapter-owned logical collection; identifiers confer no authority. */
export interface VaultRecord {id:string}

export interface VaultQueryCondition {
  attribute:string
  equals?:unknown
  in?:unknown[]
}

/** Portable query input shared by SOS vault adapters. */
export interface VaultQuery {
  where?:VaultQueryCondition[]
  orderBy?:{attribute:string;direction:'asc'|'desc'}
  limit?:number
  offset?:number
}

/** SOS-owned storage port. Authentication, collection scope and transactions remain explicit host capabilities. */
export interface IVaultRepository {
  put<T extends VaultRecord>(collectionName:string,records:T|T[]):Promise<boolean>
  get<T extends VaultRecord>(collectionName:string,id:string):Promise<T|undefined>
  query<T extends VaultRecord>(collectionName:string,query:VaultQuery):Promise<T[]>
  delete(collectionName:string,id:string):Promise<boolean>
}
