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
const here = dirname(fileURLToPath(import.meta.url));
const configPath = () => join(app.getPath('userData'),'deepseek.bin');
const secure = () => {
  if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('OS secure credential storage is unavailable');
};
const readConfig = async () => {
  secure();
  try { return JSON.parse(safeStorage.decryptString(await readFile(configPath()))); }
  catch (e) { if (e.code === 'ENOENT') return {model:'deepseek-flash',apiKey:''}; throw new Error('Cannot decrypt saved credentials'); }
};
function handle(name, fn) {
  ipcMain.handle(`mind:${name}`,async (event,...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted caller');
    return fn(...args);
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
    const selected = await dialog.showSaveDialog(window,{defaultPath:'edgeever-mind-backup.json',filters:[{name:'Mind map backup',extensions:['json']}]});
    if (selected.canceled) return false;
    await writeFile(selected.filePath,JSON.stringify(store.snapshot(),null,2),{mode:0o600}); return true;
  });
  handle('import',async () => {
    const selected = await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Mind map backup',extensions:['json']}]});
    if (selected.canceled) return store.snapshot();
    const raw = await readFile(selected.filePaths[0],'utf8');
    if (raw.length > 8_000_000) throw new Error('Backup too large');
    return store.command({type:'import',backup:JSON.parse(raw)});
  });
  handle('config',async () => { const c = await readConfig(); return {model:c.model,hasKey:!!c.apiKey}; });
  handle('save-config',async input => {
    secure();
    if (!input || typeof input.model !== 'string' || !input.model.trim() || input.model.length > 150 || typeof input.apiKey !== 'string' || input.apiKey.length > 2000) throw new Error('Enter a model identifier and API key');
    const previous = await readConfig();
    const apiKey = input.apiKey.trim() || previous.apiKey;
    if (!apiKey) throw new Error('API key required');
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
    if (url.host !== 'app' || localPath.startsWith('..') || isAbsolute(localPath)) return new Response('Forbidden',{status:403});
    return net.fetch(pathToFileURL(file).toString());
  });
  window = new BrowserWindow({width:1400,height:900,minWidth:640,minHeight:650,title:'EdgeEver Mind',webPreferences:{preload:join(here,'../preload/personal.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
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
  else await window.loadURL('edgeever-mind://app/personal.html');
}).catch(async error => { await dialog.showMessageBox({type:'error',message:'EdgeEver Mind could not start',detail:error.message}); app.quit(); });
app.on('window-all-closed',() => { agentRequests?.cancel(); app.quit(); });
}
