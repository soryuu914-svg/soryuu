'use strict';
const { contextBridge, ipcRenderer }=require('electron');
const sync=(name,...args)=>{const result=ipcRenderer.sendSync(`desktop:${name}`,...args);if(!result?.ok)throw new Error(result?.error||'桌面存储通信失败');return result.value;};
const invoke=(name,...args)=>ipcRenderer.invoke(`desktop:${name}`,...args);
contextBridge.exposeInMainWorld('desktop',Object.freeze({
  bootstrap:()=>sync('bootstrap'),save:(snapshot,expectedRevision)=>invoke('save',snapshot,expectedRevision),flush:(snapshot,expectedRevision)=>sync('flush',snapshot,expectedRevision),
  getKV:key=>sync('getKV',key),setKV:(key,value)=>sync('setKV',key,value),
  windowState:()=>invoke('windowState'),windowAction:action=>invoke('windowAction',action),
  onWindowState:callback=>{if(typeof callback!=='function')throw new Error('窗口回调必须是函数');const listener=(_event,state)=>callback(state);ipcRenderer.on('desktop:windowState',listener);return ()=>ipcRenderer.removeListener('desktop:windowState',listener);},
  getAIConfig:()=>invoke('getAIConfig'),setAIConfig:config=>invoke('setAIConfig',config),generate:request=>invoke('generate',request),cancel:requestId=>invoke('cancel',requestId),testAI:()=>invoke('testAI'),
  exportData:()=>invoke('exportData'),exportRecovery:draft=>invoke('exportRecovery',draft),importData:()=>invoke('importData'),importWorkspace:()=>invoke('importWorkspace'),backup:()=>invoke('backup'),restore:()=>invoke('restore'),history:()=>invoke('history'),
  onBeforeClose:callback=>{if(typeof callback!=='function')throw new Error('关闭回调必须是函数');const listener=()=>callback();ipcRenderer.on('desktop:before-close',listener);return ()=>ipcRenderer.removeListener('desktop:before-close',listener);},
  readyToClose:(success=true)=>ipcRenderer.send('desktop:readyToClose',success)
}));
