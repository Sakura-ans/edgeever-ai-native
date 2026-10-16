import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
import {defineConfig} from 'vite';
export default defineConfig({
 root:'apps/web',base:'./',plugins:[react()],
 build:{outDir:'dist',emptyOutDir:true,modulePreload:false,rolldownOptions:{input:{personal:fileURLToPath(new URL('./personal.html',import.meta.url))}}},
});
