// Flow contract: every Core public export loads under a resolver that rejects all frozen-project imports; installed historical packages cannot conceal a runtime dependency.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'

test('loads the entire Core public surface with GDC imports forbidden',()=>{
  const target=new URL('../dist/index.js',import.meta.url).href
  const result=spawnSync(process.execPath,['--input-type=module','-e',`
    import {registerHooks} from 'node:module';
    registerHooks({resolve(specifier,context,nextResolve){
      if(specifier.startsWith('gdc-'))throw new Error('forbidden_frozen_dependency');
      return nextResolve(specifier,context);
    }});
    const sdk=await import(${JSON.stringify(target)});
    if(typeof sdk.CommunicationBundleEditor!=='function')throw new Error('public_editor_missing');
  `],{encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
})
