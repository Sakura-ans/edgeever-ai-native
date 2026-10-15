import {readdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=['apps/desktop/src/main/personal-store.test.mjs','apps/desktop/src/main/personal-ai.test.mjs',...readdirSync('apps/web/src/lib').filter(name=>/^diagram-.*\.test\.mjs$/.test(name)).sort().map(name=>`apps/web/src/lib/${name}`)];
if(existsSync('apps/web/src/personal/proposal-diff.test.mjs')) files.push('apps/web/src/personal/proposal-diff.test.mjs');
console.log(`Personal test suite: ${files.length} files\n${files.join('\n')}`);
const result=spawnSync(process.execPath,['test',...files],{stdio:'inherit'});
if(result.error) throw result.error;
process.exit(result.status ?? 1);
