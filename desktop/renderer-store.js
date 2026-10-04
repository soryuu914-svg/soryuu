/* 桌面业务快照的唯一保存入口。浏览器设计预览不加载此文件。 */
(() => {
  if (!window.desktop) return;
  let initial;
  try { initial = window.desktop.bootstrap(); }
  catch (error) { document.documentElement.innerHTML = '<body><h1>无法打开写作台数据</h1><p id="error"></p></body>'; document.getElementById('error').textContent = error.message; throw error; }
  let revision = initial.snapshot?._revision || 0, timer, saving = false, dirty = false, ready = false, failures = 0;
  const owners = new Map();
  const pendingKV = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const status = message => { const el = document.getElementById('desktop-save-status'); if (el) el.textContent = message; };
  function capture() {
    const data = {...(initial.snapshot || {}),schema:1,_revision:revision};
    owners.forEach((get,name) => { data[name] = clone(get()); });
    return data;
  }
  async function save() {
    clearTimeout(timer);
    if (!ready || saving || !dirty) return;
    saving = true; dirty = false; status('正在保存…');
    try { retryKV();const data = capture(), result = await window.desktop.save(data); revision = result.revision; initial.snapshot = {...data,_revision:revision}; failures = 0; status('已保存'); }
    catch (error) { dirty = true; failures++; status('保存失败：' + error.message + ' · 请重试或另存当前内容'); window.dispatchEvent(new CustomEvent('desktop-save-error',{detail:error.message})); }
    finally { saving = false; if (dirty && failures < 3) timer = setTimeout(save,1000 * Math.max(1,failures)); }
  }
  function changed() { if (!ready) return; dirty = true; status('有修改待保存'); clearTimeout(timer); timer = setTimeout(save,220); }
  function flush() {
    clearTimeout(timer);
    // 同步 IPC 排在先前异步保存之后执行；先等异步响应更新版本，避免冲突。
    if (saving) throw new Error('保存正在进行，请稍候再关闭。');
    retryKV();const data = capture(), result = window.desktop.flush(data); revision = result.revision; initial.snapshot = {...data,_revision:revision}; dirty = false; failures=0;status('已保存'); return data;
  }
  window.desktopStore = {initial,get:name=>clone(initial.snapshot?.[name] || null),register:(name,get)=>owners.set(name,get),changed,save,flush,capture,info:initial.info};
  // 练笔保留既有同步接口，落盘由受限主进程 KV 执行；无浏览器存储副本。
  function retryKV(){for(const [key,value] of pendingKV){window.desktop.setKV(key,value);pendingKV.delete(key);}}
  const writeKV=(key,value)=>{key=String(key);pendingKV.set(key,value);try{const result=window.desktop.setKV(key,value);pendingKV.delete(key);return result;}catch(error){dirty=true;status('保存失败：'+error.message+' · 可另存当前内容');window.dispatchEvent(new CustomEvent('desktop-save-error',{detail:error.message}));throw error;}};
  const kv = {getItem:key=>pendingKV.has(String(key))?pendingKV.get(String(key)):window.desktop.getKV(String(key)),setItem:(key,value)=>writeKV(key,String(value)),removeItem:key=>writeKV(key,null)};
  Object.defineProperty(window,'localStorage',{value:kv,configurable:false});
  document.addEventListener('DOMContentLoaded',() => {
    const badge = document.createElement('button'); badge.id='desktop-save-status'; badge.className='btn'; badge.textContent='已打开本机数据库'; badge.title='点击立即保存'; badge.addEventListener('click',()=>{dirty=true;save();});
    document.querySelector('.sidebar-footer')?.append(badge);
    if (!badge.isConnected) document.getElementById('notice')?.after(badge);
    const recovery = document.createElement('button');recovery.id='desktop-recovery-export';recovery.className='btn';recovery.textContent='另存当前内容';recovery.hidden=true;badge.after(recovery);
    window.addEventListener('desktop-save-error',()=>{recovery.hidden=false;});
    recovery.addEventListener('click',async()=>{recovery.disabled=true;try{const result=await window.desktop.exportRecovery({snapshot:capture(),kv:Object.fromEntries(pendingKV)});if(!result.canceled)status('当前内容已另存：'+result.path+' · 数据库仍需重试保存');}catch(error){status('另存失败：'+error.message);}finally{recovery.disabled=false;}});
    ready = true;
    ['input','change','click','submit','compositionend'].forEach(type=>document.addEventListener(type,event=>{if(event.isComposing)return;queueMicrotask(changed);},true));
    window.addEventListener('preview-reading-change',changed);
    window.addEventListener('desktop-state-change',changed);
    window.desktop.onBeforeClose(async()=>{try{while(saving)await new Promise(r=>setTimeout(r,40));flush();window.desktop.readyToClose();}catch(error){status('未关闭：'+error.message);window.desktop.readyToClose(false);}});
    changed();
  });
})();
