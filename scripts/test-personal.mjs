import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['test','apps','packages','scripts'],{stdio:'inherit'});
if(result.error)throw result.error;process.exit(result.status??1);
