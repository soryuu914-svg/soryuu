'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { verifyIntegrity } = require('./integrity.cjs');
const { sameDocument } = require('./security.cjs');
// GUI processes may outlive the shell which provided their output pipes.
for(const stream of [process.stdout,process.stderr])stream?.on('error',error=>{if(error.code!=='EPIPE')throw error;});
let win, store, ai, closing=false;
const smoke=process.argv.includes('--smoke-test');
const protectedRuntime=fs.existsSync(path.join(__dirname,'runtime.json'));
const root=smoke?path.join(__dirname,protectedRuntime?'..':'.','test-artifacts','database-'+Date.now()):app.isPackaged?path.dirname(process.execPath):path.join(path.resolve(__dirname,protectedRuntime?'../..':'..'),'.desktop-data');
try { fs.mkdirSync(root,{recursive:true}); app.setPath('userData',path.join(root,'electron-profile')); app.setPath('sessionData',path.join(root,'electron-session')); }
catch { dialog.showErrorBox('写作台无法启动','安装目录不可写，请使用当前用户可写的安装位置。不会改用其他目录。'); app.exit(1); }
function startup(phase,details={}){try{const file=path.join(root,'startup.jsonl');if(fs.existsSync(file)&&fs.statSync(file).size>256*1024)fs.writeFileSync(file,'');fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),phase,...details})+'\n');}catch{}}
startup('boot',{pid:process.pid});
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();startup('reactivated',{visible:win.isVisible()});}});
  app.whenReady().then(async()=>{
    try {verifyIntegrity(__dirname);}
    catch {dialog.showErrorBox('桌面资源校验失败','安装文件缺失或发生变化，请恢复完整程序文件。现有数据库不会被覆盖。');app.quit();return;}
    const { createStorage, readLegacyWorkspace, recoveryObject } = require('./storage.cjs');
    const { createAIService } = require('./ai.cjs');
    try {store=createStorage(root,{safeStorage});ai=createAIService({getConfig:()=>store.getAIConfig({includeSecret:true}),record:value=>store.record(value)});}
    catch {dialog.showErrorBox('数据库无法打开','安装目录不可写、磁盘已满或数据库损坏。请保留数据库与 backups 目录后检查权限和磁盘；程序不会覆盖已有文件。');app.quit();return;}
    let mockAPI;const testBase=path.resolve(__dirname,protectedRuntime?'..':'.');if(smoke){mockAPI=await require(path.join(testBase,'smoke-api.cjs')).createSmokeAPI();store.setAIConfig({endpoint:mockAPI.url,model:'local-fixture',apiKey:'local-test-only',sessionOnly:true});}
    const fileDialogs=smoke?require(path.join(testBase,'smoke-dialogs.cjs')).createSmokeDialogs(testBase):dialog;
    const entry=pathToFileURL(path.join(__dirname,'dist','index.html')).href;
    function trusted(event) {if(!win||event.sender!==win.webContents||event.senderFrame?.parent!==null||!sameDocument(event.senderFrame?.url,entry))throw new Error('拒绝不受信任页面的访问');}
    const bootstrap=()=>({snapshot:store.read(),settings:store.read().settings||{},info:{databasePath:store.filename,packaged:app.isPackaged,platform:process.platform}});
    const asyncHandler=(name,fn)=>ipcMain.handle(`desktop:${name}`,async(event,...args)=>{trusted(event);return fn(...args);});
    const syncHandler=(name,fn)=>ipcMain.on(`desktop:${name}`,(event,...args)=>{try{trusted(event);event.returnValue={ok:true,value:fn(...args)};}catch(error){event.returnValue={ok:false,error:error.message};}});
    syncHandler('bootstrap',bootstrap);syncHandler('flush',(snapshot,expected)=>store.save(snapshot,expected));syncHandler('getKV',key=>store.getKV(key));syncHandler('setKV',(key,value)=>store.setKV(key,value));
    asyncHandler('save',(snapshot,expected)=>store.save(snapshot,expected));asyncHandler('getAIConfig',()=>store.getAIConfig());asyncHandler('setAIConfig',config=>store.setAIConfig(config));
    asyncHandler('generate',request=>ai.generate(request));asyncHandler('cancel',requestId=>ai.cancel(requestId));asyncHandler('testAI',()=>ai.test());
    asyncHandler('history',()=>store.history());
    const backupName=prefix=>path.join(root,'backups',`${prefix}-${Date.now()}.sqlite3`);
    asyncHandler('exportData',async()=>{const result=await fileDialogs.showSaveDialog(win,{title:'导出完整写作数据（不含密钥）',defaultPath:'writing-workbench.json',filters:[{name:'写作数据',extensions:['json']}]});if(result.canceled)return {canceled:true};fs.writeFileSync(result.filePath,JSON.stringify(store.exportObject(),null,2),'utf8');return {path:result.filePath};});
    asyncHandler('exportRecovery',async draft=>{let base;try{base=store.exportObject();}catch{base={};}const payload=recoveryObject(base,draft);const result=await fileDialogs.showSaveDialog(win,{title:'另存当前内容（无需先保存数据库）',defaultPath:'writing-workbench-recovery.json',filters:[{name:'写作数据',extensions:['json']}]});if(result.canceled)return {canceled:true};fs.writeFileSync(result.filePath,JSON.stringify(payload,null,2),'utf8');return {path:result.filePath};});
    asyncHandler('importData',async()=>{const result=await fileDialogs.showOpenDialog(win,{title:'导入写作数据或旧版 JSON 备份',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return {canceled:true};const filename=result.filePaths[0];if(fs.statSync(filename).size>100*1024*1024)throw new Error('导入文件超过 100 MB');const data=JSON.parse(fs.readFileSync(filename,'utf8'));const answer=await fileDialogs.showMessageBox(win,{type:'warning',buttons:['取消','备份当前数据并导入'],defaultId:0,cancelId:0,message:'导入会替换当前写作数据。旧文件会保留，并先备份当前数据库。'});if(answer.response!==1)return {canceled:true};await store.makeBackup(backupName('before-import'));const imported=store.importObject(data);return {...bootstrap(),...imported,path:filename};});
    asyncHandler('backup',async()=>{const result=await fileDialogs.showSaveDialog(win,{title:'创建数据库一致性备份',defaultPath:backupName('writing-workbench'),filters:[{name:'SQLite',extensions:['sqlite3']}]});if(result.canceled)return {canceled:true};return {path:await store.makeBackup(result.filePath)};});
    asyncHandler('importWorkspace',async()=>{const result=await fileDialogs.showOpenDialog(win,{title:'选择旧工作区（不会删除旧文件）',properties:['openDirectory']});if(result.canceled)return {canceled:true};const data=readLegacyWorkspace(result.filePaths[0]);const counts=Object.fromEntries(Object.entries(data.tables).map(([name,rows])=>[name,rows.length]));const answer=await fileDialogs.showMessageBox(win,{type:'warning',buttons:['取消','备份并迁移'],defaultId:0,cancelId:0,message:`检测到 ${counts.projects} 部作品、${counts.chapters} 章正文。导入前备份当前数据库，旧文件保留。`});if(answer.response!==1)return {canceled:true};await store.makeBackup(backupName('before-migration'));store.importObject(data);return {...bootstrap(),counts};});
    asyncHandler('restore',async()=>{const result=await fileDialogs.showOpenDialog(win,{title:'恢复数据库备份',properties:['openFile'],filters:[{name:'SQLite',extensions:['sqlite3']}]});if(result.canceled)return {canceled:true};const answer=await fileDialogs.showMessageBox(win,{type:'warning',buttons:['取消','检查并恢复'],defaultId:0,cancelId:0,message:'恢复会替换当前数据，恢复前会自动备份。模型密钥需要重新检查。'});if(answer.response!==1)return {canceled:true};await store.restore(result.filePaths[0]);return bootstrap();});
    ipcMain.on('desktop:readyToClose',(event,success=true)=>{trusted(event);if(success!==true)return;closing=true;win.close();});
    session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    // DownloadItem save options must be set synchronously inside will-download.
    session.defaultSession.on('will-download',(_event,item)=>{if(smoke)item.setSavePath(fileDialogs.downloadPath(item.getFilename()));else item.setSaveDialogOptions({title:'导出正文',defaultPath:item.getFilename()});});
    session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"]}}));
    win=new BrowserWindow({width:1440,height:960,minWidth:1040,minHeight:720,title:'写作台',show:false,frame:false,roundedCorners:true,backgroundColor:'#f7f8fc',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!protectedRuntime}});
    const windowState=()=>({maximized:win.isMaximized(),fullscreen:win.isFullScreen(),focused:win.isFocused()});
    asyncHandler('windowState',windowState);
    asyncHandler('windowAction',action=>{
      if(!['minimize','maximize','close'].includes(action))throw new Error('未知窗口操作');
      if(action==='minimize')win.minimize();
      if(action==='maximize'){if(win.isFullScreen())win.setFullScreen(false);else if(win.isMaximized())win.unmaximize();else win.maximize();}
      if(action==='close')win.close();
    });
    for(const event of ['maximize','unmaximize','enter-full-screen','leave-full-screen','focus','blur'])win.on(event,()=>{if(!win.webContents.isDestroyed())win.webContents.send('desktop:windowState',windowState());});
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'文件',submenu:[{label:'退出写作台',accelerator:'Alt+F4',click:()=>win?.close()}]},{label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},{label:'查看',submenu:[{role:'resetZoom',label:'恢复缩放'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{role:'togglefullscreen',label:'全屏'}]},{label:'帮助',submenu:[{label:'关于写作台',click:()=>dialog.showMessageBox(win,{message:'写作台 0.2.0',detail:'本地创作 · Electron 桌面测试版',buttons:['确定']})}]}]));
    win.removeMenu();
    if(protectedRuntime)win.webContents.on('before-input-event',(event,input)=>{if(input.key==='F12'||input.control&&input.shift&&['I','J','C'].includes(input.key.toUpperCase()))event.preventDefault();});
    async function external(url) {let parsed;try{parsed=new URL(url);}catch{return;}if(parsed.protocol!=='https:')return;const answer=await dialog.showMessageBox(win,{type:'question',message:'在系统浏览器打开此链接？',detail:parsed.href,buttons:['取消','打开'],defaultId:0,cancelId:0});if(answer.response===1)await shell.openExternal(parsed.href);}
    win.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
    win.webContents.on('will-navigate',(event,url)=>{if(!sameDocument(url,entry)){event.preventDefault();external(url);}});
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.on('close',event=>{if(closing)return;event.preventDefault();win.webContents.send('desktop:before-close');});
    win.on('ready-to-show',()=>{startup('ready-to-show');if(!smoke || process.argv.includes('--verify-visible'))win.show();});win.on('closed',()=>{win=null;});
    await win.loadFile(path.join(__dirname,'dist','index.html'));
    // Windows may consume the first show request with the launcher's hidden startup state.
    // Ensure visibility after loading as well; a live process is not proof of a visible window.
    if(!smoke || process.argv.includes('--verify-visible')){win.show();win.focus();startup('shown-after-load',{visible:win.isVisible()});}
    startup('loaded',{visible:win.isVisible()});
    if(!smoke)setTimeout(()=>{if(win)startup('window-state',{visible:win.isVisible(),loading:win.webContents.isLoading()});},2000);
    if(smoke){const result=await require(path.join(testBase,'smoke-runner.cjs')).run(win,store,testBase);if(process.argv.includes('--verify-visible')){if(win.isVisible())result.checks.push('隐藏启动环境下主窗口仍可见');else{result.ok=false;result.error='主窗口未显示';}}result.mockRequests=mockAPI.calls.length;mockAPI.close();if(result.ok){try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('关闭前保存未完成')),5000);win.once('closed',()=>{clearTimeout(timeout);resolve();});win.close();});result.checks.push('实际窗口关闭前保存');}catch(error){result.ok=false;result.error=error.message;}}fs.writeFileSync(path.join(testBase,'test-artifacts','smoke-result.json'),JSON.stringify(result,null,2));closing=true;if(win)win.close();app.exit(result.ok?0:1);}
  }).catch(error=>{if(smoke){fs.writeFileSync(path.join(__dirname,protectedRuntime?'..':'.','test-artifacts','smoke-result.json'),JSON.stringify({ok:false,error:error.stack},null,2));closing=true;app.exit(1);return;}dialog.showErrorBox('写作台无法启动','桌面资源加载失败。请检查安装文件是否完整。');app.quit();});
  app.on('window-all-closed',()=>{if(!smoke)app.quit();});
  app.on('will-quit',()=>{if(store)store.close();});
}
