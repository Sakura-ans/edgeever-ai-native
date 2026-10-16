import {userError} from './personal-errors.mjs';

// Explicit labels avoid Electron's English "OK" fallback on Linux.
export function nativeErrorOptions(error,fallback,title) {
 const safe=userError(error,fallback);
 return {type:'error',title,message:title,detail:`${safe.message}（错误代码：${safe.code}）`,buttons:['关闭应用'],defaultId:0,cancelId:0,noLink:true};
}
