import {nativeErrorOptions} from './personal-dialogs.mjs';
import {MindError,userError,diagnostic} from './personal-errors.mjs';
import { app, BrowserWindow, ipcMain, dialog, safeStorage, protocol, net } from 'electron';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { PersonalStore } from './personal-store.mjs';
import { createPersonalAgentRequests } from './personal-ai.mjs';

// Separate identity prevents reading/migrating original EdgeEver account data.
app.setName('EdgeEver Mind');
const requestedProfile = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData',requestedProfile ? resolve(requestedProfile) : join(app.getPath('appData'),'EdgeEverMind'));
protocol.registerSchemesAsPrivileged([{scheme:'edgeever-mind',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
let window, store, agentRequests;
let fatalReported=false;
function fatal(error){if(fatalReported)return;fatalReported=true;console.error(JSON.stringify(diagnostic(error,'runtime')));dialog.showMessageBoxSync(nativeErrorOptions(error,'RUNTIME_FAILURE','EdgeEver Mind 运行异常'));app.exit(1);}
process.on('uncaughtException',fatal);process.on('unhandledRejection',fatal);

const here = dirname(fileURLToPath(import.meta.url));
const configPath = () => join(app.getPath('userData'),'deepseek.bin');
const secure = () => {
  if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new MindError('SECURE_UNAVAILABLE');
};
const readConfig = async () => {
  secure();
  try { return JSON.parse(safeStorage.decryptString(await readFile(configPath()))); }
  catch (e) { if (e.code === 'ENOENT') return {model:'deepseek-flash',apiKey:''};if(['EACCES','EPERM','EIO','ENOSPC'].includes(e.code))throw e; throw new MindError('DECRYPT'); }
};
function handle(name, fn) {
  ipcMain.handle(`mind:${name}`,async (event,...args) => {
    try {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new MindError('UNTRUSTED');
    return await fn(...args);
    }catch(error){console.warn(JSON.stringify(diagnostic(error,name)));throw new MindError(userError(error).code);}
  });
}
app.on('second-instance',() => { window?.show(); window?.focus(); });
app.whenReady().then(async () => {
  store = new PersonalStore(join(app.getPath('userData'),'maps'));
  await store.init();
  handle('load',() => store.snapshot());
  handle('command',input => store.command(input));
  handle('approve',id => store.approve(id));
  handle('reject',id => { store.reject(id); return true; });
  handle('export',async () => {
    const selected = await dialog.showSaveDialog(window,{title:'导出导图备份',buttonLabel:'保存备份',defaultPath:'edgeever-mind-backup.json',filters:[{name:'导图备份',extensions:['json']}]});
    if (selected.canceled) return false;
    await writeFile(selected.filePath,JSON.stringify(store.snapshot(),null,2),{mode:0o600}); return true;
  });
  handle('import',async () => {
    const selected = await dialog.showOpenDialog(window,{title:'导入导图备份',buttonLabel:'导入备份',properties:['openFile'],filters:[{name:'导图备份',extensions:['json']}]});
    if (selected.canceled) return store.snapshot();
    const raw = await readFile(selected.filePaths[0],'utf8');
    if (raw.length > 8_000_000) throw new MindError('TOO_LARGE');
    let backup;try{backup=JSON.parse(raw);}catch{throw new MindError('INVALID_BACKUP');}
    try{return await store.command({type:'import',backup});}catch(error){if(['INVALID_MAP','INVALID_PARENT','TITLE_REQUIRED','TITLE_LONG','INVALID_BACKUP'].includes(userError(error).code))throw new MindError('INVALID_BACKUP');throw error;}
  });
  handle('config',async () => { const c = await readConfig(); return {model:c.model,hasKey:!!c.apiKey}; });
  handle('save-config',async input => {
    secure();
    if (!input || typeof input.model !== 'string' || !input.model.trim() || input.model.length > 150 || typeof input.apiKey !== 'string' || input.apiKey.length > 2000) throw new MindError('CONFIG_INVALID');
    const previous = await readConfig();
    const apiKey = input.apiKey.trim() || previous.apiKey;
    if (!apiKey) throw new MindError('CONFIG_REQUIRED');
    await mkdir(app.getPath('userData'),{recursive:true});
    await writeFile(configPath(),safeStorage.encryptString(JSON.stringify({model:input.model.trim(),apiKey})),{mode:0o600});
    return true;
  });
  handle('clear-config',async () => { await rm(configPath(),{force:true}); return true; });
  agentRequests = createPersonalAgentRequests({store,readConfig,
    makeDirectory:() => mkdtemp(join(tmpdir(),'edgeever-mind-agent-')),
    removeDirectory:directory => rm(directory,{recursive:true,force:true}),
    emit:event => { if (!window.isDestroyed()) window.webContents.send('mind:agent-event',event); },
  });
  handle('cancel',() => agentRequests.cancel());
  handle('ask',input => agentRequests.ask(input));
  const webRoot = resolve(here,app.isPackaged ? '../../../../web' : '../../../web/dist');
  const packagedRoot = app.isPackaged ? join(process.resourcesPath,'web') : webRoot;
  protocol.handle('edgeever-mind',request => {
    const url = new URL(request.url);
    const file = resolve(packagedRoot,`.${decodeURIComponent(url.pathname)}`);
    const localPath = relative(packagedRoot,file);
    if (url.host !== 'app' || localPath.startsWith('..') || isAbsolute(localPath)) return new Response('禁止访问',{status:403});
    return net.fetch(pathToFileURL(file).toString());
  });
  window = new BrowserWindow({width:1400,height:900,minWidth:640,minHeight:650,title:'EdgeEver Mind',webPreferences:{preload:join(here,'../preload/personal.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.on('render-process-gone',(_event,details)=>{if(details.reason!=='clean-exit')fatal(new MindError('RUNTIME_FAILURE'));});
  let closing = false;
  handle('close-ready',async () => { await store.queue; closing = true; window.close(); return true; });
  window.on('close',event => {
    if (closing) return;
    event.preventDefault(); agentRequests?.cancel();
    window.webContents.send('mind:before-close');
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate',event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  if (!app.isPackaged && process.env.EDGEEVER_MIND_DEV_URL) await window.loadURL(process.env.EDGEEVER_MIND_DEV_URL);
  else await window.loadURL('edgeever-mind://app/personal.html').catch(()=>{throw new MindError('APP_LOAD');});
}).catch(async error => { console.warn(JSON.stringify(diagnostic(error,'startup')));await dialog.showMessageBox(nativeErrorOptions(error,'WORKSPACE_READ','EdgeEver Mind 无法启动')); app.quit(); });
app.on('window-all-closed',() => { agentRequests?.cancel(); app.quit(); });
}
