// Synthetic acceptance report only: expose compressed evidence for authenticated
// clients that can read Actions logs but cannot fetch artifact redirect URLs.
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const bytes=await readFile(process.argv[2]);
if(bytes.length>5_000_000)throw new Error('Compact evidence exceeds transfer limit');
console.log('MIND_REPORT_SHA256='+createHash('sha256').update(bytes).digest('hex'));
const base64=gzipSync(bytes).toString('base64');
for(let i=0;i<base64.length;i+=12000)console.log('MIND_REPORT_CHUNK='+base64.slice(i,i+12000));
