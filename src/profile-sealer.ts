/** Host-owned sealing capability. Key custody and user-secret verification stay outside Core. */
export type ServerProfileSealer=Readonly<{
  seal(cleartext:string,aad:string):Promise<string>
  unseal(ciphertext:string,aad:string):Promise<string>
}>
