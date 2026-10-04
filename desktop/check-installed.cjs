'use strict';
// This test attaches only to the disposable installed-smoke app started by the
// release test. It never reads the normal development or author database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const directory=path.resolve(process.argv[2]||'');
 assert.equal(directory,path.join(__dirname,'test-artifacts','installed-smoke'));
 let page;
 for(let i=0;i<60;i++){try{const pages=await (await fetch('http://127.0.0.1:9876/json/list')).json();page=pages.find(p=>p.type==='page'&&p.url.includes('app.asar/dist/index.html'));if(page)break;}catch{}await new Promise(r=>setTimeout(r,150));}
 assert.ok(page,'Installed renderer did not load');
 const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let nextId=0;
 socket.addEventListener('message',event=>{const response=JSON.parse(event.data);const request=pending.get(response.id);if(request){pending.delete(response.id);response.error?request.reject(new Error(response.error.message)):request.resolve(response.result);}});
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 const evaluate=expression=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve:result=>{if(result.exceptionDetails)reject(new Error(JSON.stringify(result.exceptionDetails)));else resolve(result.result?.value);},reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
 const report=await evaluate(`(async()=>{for(let i=0;i<50&&(document.readyState!=='complete'||!window.workbench||!document.documentElement.classList.contains('desktop-frame'));i++)await new Promise(r=>setTimeout(r,100));const app=window.workbench;if(!app)throw new Error('写作界面未初始化');const marker=window.desktop.getKV('installation-check');if(!marker){if(app.books.listBooks().length)throw new Error('验收库必须为空');app.switchView('home');document.getElementById('new-book').click();document.getElementById('book-name').value='安装验收用书';document.getElementById('book-info-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}else if(!app.books.listBooks().some(x=>x.name==='安装验收用书'))throw new Error('重开或升级丢失测试作品');window.desktopStore.flush();window.desktop.setKV('installation-check',String(Number(marker||0)+1));return {ok:true,launch:Number(marker||0)+1,books:app.books.listBooks().length,frame:document.documentElement.classList.contains('desktop-frame')};})()`);
 assert.equal(report.frame,true);assert.ok(fs.existsSync(path.join(directory,'writing-workbench.sqlite3')));report.databasePath=path.join(directory,'writing-workbench.sqlite3');
 fs.writeFileSync(path.join(__dirname,'test-artifacts','installed-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));socket.close();
})().catch(error=>{console.error(error.message);process.exit(1);});
