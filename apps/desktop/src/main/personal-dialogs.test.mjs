import {test,expect} from 'bun:test';
import {nativeErrorOptions} from './personal-dialogs.mjs';
test('fatal and startup dialogs have explicit Chinese safe exit controls',()=>{
 for(const code of ['RUNTIME_FAILURE','WORKSPACE_READ']){
  const options=nativeErrorOptions(new Error('secret /private/path'),code,'运行异常');
  expect(options.buttons).toEqual(['关闭应用']);expect(options.defaultId).toBe(0);expect(options.cancelId).toBe(0);
  expect(options.detail).toContain(code);expect(JSON.stringify(options)).not.toMatch(/secret|private|OK/);
 }
});
