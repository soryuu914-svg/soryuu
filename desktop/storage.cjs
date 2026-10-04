'use strict';
const { DatabaseSync, backup } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_BYTES = 100 * 1024 * 1024;
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('数据必须是对象'); return value; }
function encode(value) { const text = JSON.stringify(value); if (!text || Buffer.byteLength(text) > MAX_BYTES) throw new Error('数据为空或超过 100 MB'); return text; }
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) if (!/^(apiKey|api_key|secret|authorization|token|password)$/i.test(key)) Object.defineProperty(result,key,{value:sanitize(item),enumerable:true,writable:true,configurable:true});
  return result;
}
function resolveDataRoot({ packaged, execPath, projectRoot }) { return packaged ? path.dirname(execPath) : path.join(projectRoot, '.desktop-data'); }
function recoveryObject(base,draft) {
  object(draft);object(draft.snapshot);object(draft.kv || {});
  const result=sanitize({format:'writing-workbench',version:1,exportedAt:new Date().toISOString(),recovery:true,snapshot:draft.snapshot,kv:{...(base.kv || {}),...(draft.kv || {})},generations:base.generations || []});
  encode(result);return result;
}
function migrateLegacy(tables) {
  object(tables); if(!Array.isArray(tables.projects)) throw new Error('旧备份缺少 projects 表');
  const rows=name=>Array.isArray(tables[name])?tables[name]:[];
  const bookId=id=>`legacy-${id}`;
  const seen=new Set();
  for(const p of tables.projects) { if(p.id===undefined||seen.has(String(p.id)))throw new Error('旧作品 ID 缺失或重复');seen.add(String(p.id)); }
  for(const name of ['chapters','characters','worldSettings','volumes','foreshadows','plotCards','sceneCards']) for(const row of rows(name)) if(!seen.has(String(row.projectId)))throw new Error(`旧数据 ${name} 含失去作品关联的记录，请修复源备份`);
  const forBook=(name,id)=>rows(name).filter(row=>String(row.projectId)===String(id));
  const text=html=>String(html||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|h[1-6]|li)>/gi,'\n\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const books=[], homes=[], cards=[], outlines=[], writing=[], features=[];
  for(const p of tables.projects) {
    const id=bookId(p.id), chapters=forBook('chapters',p.id).sort((a,b)=>(a.index||a.order||0)-(b.index||b.order||0));
    books.push({...p,id,name:p.name||'未命名作品',description:p.description || '',genre:p.genre || '待设定',cover:p.name || '作品',chapters:chapters.length,words:chapters.reduce((sum,c)=>sum+(c.wordCount||text(c.content).length),0),updated:'旧版导入'});
    const premise=rows('inspirations').find(c=>String(c.id)===String(p.coreInspirationId));
    homes.push([id,{ideas:(premise?[premise]:forBook('inspirations',p.id).slice(0,1)).map(c=>({...c,id:'legacy-idea-'+c.id,sourceIdeaId:'legacy-idea-'+c.id,title:c.title||c.name||'灵感',summary:c.content||c.description||''})),ideaArchive:[],goldenArchive:{},golden:p.goldenFinger?[{id:'legacy-golden',title:'原作品金手指',summary:p.goldenFinger}]:[]}]);
    const world={势力:[],地理:[],修行:[],物品:[]};
    for(const c of forBook('worldSettings',p.id)) {const category=/faction|宗门|家族|王朝|组织|邪派/.test(c.category)?'势力':/power|修炼|功法|血脉|神通|规则/.test(c.category)?'修行':/item|武器|丹药|灵材/.test(c.category)?'物品':'地理';world[category].push({...c,id:'legacy-world-'+c.id,title:c.name||c.title,kind:category==='势力'?'势力':category==='物品'?'物品':category==='地理'?'地点':/功法|武技/.test(c.category)?'功法':/规则/.test(c.category)?'规则':'境界',name:c.name||c.title,summary:c.description||c.content||'',fields:[]});}
    cards.push([id,{people:forBook('characters',p.id).map(c=>({...c,id:'legacy-person-'+c.id,role:({protagonist:'主角',heroine:'主角',antagonist:'反派',supporting:'配角'})[c.role] || c.role || '配角',summary:c.description||[c.identity,c.personality,c.appearance,c.abilities].filter(Boolean).join('；'),goalMotivation:c.motivation||'',progression:c.growth||'',faction:'',fields:[]})),world}]);
    outlines.push([id,{大纲:forBook('volumes',p.id).sort((a,b)=>(a.index || a.order || 0)-(b.index || b.order || 0)).map(c=>({...c,id:'legacy-volume-'+c.id,title:c.title||c.name,kind:'卷纲',summary:c.summary||'',fields:[['卷结构',c.volumeStructure || '七点结构法'],['章节数',String(chapters.filter(ch=>ch.volumeId===c.id).length)],['原版钩子',c.hook || ''],['原版爆点',c.climax || '']]})),章节细纲:chapters.map((c,i)=>({...c,id:'legacy-outline-'+c.id,title:'第'+(i+1)+'章 '+c.title,kind:'章纲',summary:c.outline||'',fields:[['所属卷ID','legacy-volume-'+c.volumeId],['所属卷',forBook('volumes',p.id).find(v=>v.id===c.volumeId)?.title || ''],['原版钩子',c.hook || ''],['原版爆点',c.climax || '']]})),伏笔:forBook('foreshadows',p.id).map(c=>({...c,id:'legacy-hint-'+c.id,title:c.content,kind:c.status==='resolved'?'已回收':c.chapterId?'已埋设':'未埋设',summary:c.content,fields:[]}))}]);
    const chapterMap={},sourceIds=new Set();for(const [index,c] of chapters.entries()) {if(c.id===undefined||sourceIds.has(String(c.id)))throw new Error('旧章节 ID 缺失或重复');sourceIds.add(String(c.id));const number=index+1;chapterMap[number]={...c,id:number,legacyId:c.id,outlineId:'legacy-outline-'+c.id,paragraphs:text(c.content).split(/\n\s*\n/),summarySource:'旧版导入',legacyHtml:c.content||''};}
    writing.push([id,{chapters:chapterMap,currentChapterId:chapters.length?1:null}]);
    features.push([id,{plot:forBook('plotCards',p.id).map(c=>({...c,id:'legacy-plot-'+c.id,title:c.title || '剧情卡',description:c.description || c.content || '',tags:c.tags || []})),scene:forBook('sceneCards',p.id).map(c=>({...c,id:'legacy-scene-'+c.id,title:c.title || '场景卡',description:c.description || c.content || '',atmosphere:c.atmosphere || '',tags:c.tags || []}))}]);
  }
  const material=(c,prefix,kind)=>({...c,id:prefix+c.id,title:c.title || c.name || String(c.content || '').slice(0,50) || kind,kind,summary:c.content || c.description || '',fields:[['来源','旧版导入'],['原分类',c.category || '其他']]});
  const templates=rows('libraryItems').filter(c=>c.content&&typeof c.content==='object').map(c=>{const type=c.type==='character'?'characters':'world',raw=c.content,card=type==='characters'?{...raw,id:'library-person-'+c.id,name:raw.name || c.name,role:({protagonist:'主角',heroine:'主角',antagonist:'反派'})[raw.role] || '配角',faction:'',goalMotivation:raw.motivation || '',summary:raw.description || raw.personality || '',fields:[]}:{...raw,id:'library-world-'+c.id,title:raw.name || raw.title || c.name,kind:'其他',summary:raw.description || raw.content || '',fields:[]};return {id:'legacy-library-'+c.id,type,bookId:'archived',bookName:c.sourceProjectName || '旧版独立资料',sourceId:card.id,sourceGroup:type==='characters'?'人物卡':'其他',linked:false,card,initialCard:{...card},initialOrigin:'first-recoverable'};});
  return {schema:1,books:{books,homes,nextId:1,nextNoteId:1,selectedBookId:books[0]?.id??null},pages:{bookCards:cards,bookOutlines:outlines,library:{写作技巧:[...rows('writingStyles').map(c=>material(c,'legacy-style-','写作技巧')),...rows('prompts').map(c=>material(c,'legacy-prompt-','写作技巧'))],避雷规则:rows('rejectionRules').map(c=>material(c,'legacy-rule-','避雷规则'))},ideas:{灵感:rows('inspirations').map(c=>material(c,'legacy-idea-','灵感'))},templates:{entries:templates,revision:0}},writing:{books:writing,activeBookId:books[0]?.id??null,fontSize:18,bold:false,italic:false,serif:false},features:{cardsByBook:features},references:{states:[]},legacyImport:{importedAt:new Date().toISOString(),tables:sanitize(tables)}};
}
function readLegacyWorkspace(directory) {
  const tables={projects:[],chapters:[],characters:[],worldSettings:[],volumes:[],foreshadows:[],plotCards:[],sceneCards:[]};
  const files=[], mapping={'project.json':'projects','characters.json':'characters','world-settings.json':'worldSettings','volumes.json':'volumes','foreshadows.json':'foreshadows','plot-cards.json':'plotCards','scene-cards.json':'sceneCards'};
  const root=fs.realpathSync(directory);
  function scan(dir,depth=0) {if(depth>10)throw new Error('工作区目录层级过深');for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {if(entry.isSymbolicLink())continue;const name=path.join(dir,entry.name);if(entry.isDirectory())scan(name,depth+1);else if(entry.isFile()&&entry.name.endsWith('.json'))files.push(name);}}
  scan(root);let total=0;
  for(const name of files) {total+=fs.statSync(name).size;if(total>MAX_BYTES)throw new Error('工作区超过 100 MB，请先分批导出');const base=path.basename(name);if(base==='workspace.json')continue;const data=JSON.parse(fs.readFileSync(name,'utf8'));const table=mapping[base]||(/[\\/]chapters[\\/]/.test(name)?'chapters':null);if(table)tables[table].push(...(Array.isArray(data)?data:Array.isArray(data.rows)?data.rows:[data]));else {tables.workspaceFiles??=[];tables.workspaceFiles.push({relativePath:path.relative(root,name),data:sanitize(data)});}}
  if(!tables.projects.length)throw new Error('所选文件夹没有可迁移的作品，请选择包含 project.json 的旧工作区。');
  migrateLegacy(tables); // Validate relationships before requesting replacement of current data.
  return {tables};
}
function createStorage(root, { safeStorage } = {}) {
  fs.mkdirSync(root, { recursive: true });
  const probe = path.join(root, `.write-check-${crypto.randomUUID()}`);
  fs.writeFileSync(probe, 'check', { flag: 'wx' }); fs.unlinkSync(probe);
  const filename = path.join(root, 'writing-workbench.sqlite3');
  const db = new DatabaseSync(filename);
  let sessionConfig = null;
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('数据库完整性检查失败，原文件已保留');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('数据库版本较新，请使用新版写作台');
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    db.exec('BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS secrets (id INTEGER PRIMARY KEY CHECK(id=1), encrypted BLOB NOT NULL); CREATE TABLE IF NOT EXISTS generation_records (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, json TEXT NOT NULL); INSERT OR IGNORE INTO state VALUES(1,0,\'{}\'); PRAGMA user_version=1; COMMIT;');
  } catch (error) { db.close(); throw error; }
  function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }
  function read() { const row=db.prepare('SELECT revision,json FROM state WHERE id=1').get(); return {...JSON.parse(row.json),_revision:row.revision}; }
  function save(snapshot, expectedRevision) {
    object(snapshot); const clean={...snapshot}; delete clean._revision;
    const json=encode(clean); const expected=expectedRevision ?? snapshot._revision;
    if (!Number.isSafeInteger(expected) || expected<0) throw new Error('保存需要有效的数据版本，请重新读取数据');
    return transaction(()=> { const revision=db.prepare('SELECT revision FROM state WHERE id=1').get().revision; if(revision!==expected) throw new Error('数据版本冲突，请重新读取，未覆盖已有数据'); db.prepare('UPDATE state SET revision=?,json=? WHERE id=1').run(revision+1,json); return {revision:revision+1}; });
  }
  function getKV(key) { const row=db.prepare('SELECT json FROM kv WHERE key=?').get(String(key)); return row ? JSON.parse(row.json) : null; }
  function setKV(key,value) { if(typeof key!=='string'||key.length>200) throw new Error('无效设置名称'); db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json').run(key,encode(value)); return true; }
  function getAIConfig({includeSecret=false}={}) {
    let config=sessionConfig;
    if(!config) { const row=db.prepare('SELECT encrypted FROM secrets WHERE id=1').get(); if(row) { try { config=JSON.parse(safeStorage.decryptString(Buffer.from(row.encrypted))); } catch { return {needsKey:true,configured:false}; } } }
    if(!config) return {configured:false};
    if(includeSecret) return {...config};
    const {apiKey,...publicConfig}=config; return {...publicConfig,configured:!!apiKey,hasKey:!!apiKey,sessionOnly:!!sessionConfig};
  }
  function setAIConfig(input) {
    object(input); const current=getAIConfig({includeSecret:true});
    const config={endpoint:String(input.endpoint||''),model:String(input.model||''),apiKey:input.apiKey===undefined ? current.apiKey||'' : String(input.apiKey),maxTokens:Number(input.maxTokens || current.maxTokens || 8192),reviewModel:String(input.reviewModel || current.reviewModel || '')};
    const url=new URL(config.endpoint); if(url.protocol!=='https:' && !(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('模型地址必须使用 HTTPS，本机测试服务可使用 HTTP');
    if(!config.model) throw new Error('请填写模型名称');
    const available=safeStorage?.isEncryptionAvailable() && (!safeStorage.getSelectedStorageBackend || safeStorage.getSelectedStorageBackend()!=='basic_text');
    if(!available) { if(!input.sessionOnly) throw new Error('系统密钥保护不可用，请选择仅本次使用'); sessionConfig=config; return getAIConfig(); }
    if(input.sessionOnly) {sessionConfig=config;return getAIConfig();}
    const encrypted=safeStorage.encryptString(encode(config)); db.prepare('INSERT INTO secrets VALUES(1,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted').run(encrypted); sessionConfig=null; return getAIConfig();
  }
  function exportObject() { const snapshot=sanitize(read()); delete snapshot._revision; const kv={}; for(const row of db.prepare('SELECT key,json FROM kv').all()) kv[row.key]=sanitize(JSON.parse(row.json)); const generations=db.prepare('SELECT created_at,json FROM generation_records ORDER BY id').all().map(row=>({createdAt:row.created_at,value:sanitize(JSON.parse(row.json))}));return {format:'writing-workbench',version:1,exportedAt:new Date().toISOString(),snapshot,kv,generations}; }
  async function makeBackup(destination) { fs.mkdirSync(path.dirname(destination),{recursive:true}); if(fs.existsSync(destination)) throw new Error('备份文件已存在，请选择新名称'); await backup(db,destination); return destination; }
  function importObject(input) {
    object(input); const previous=read(); let snapshot, kv={};
    if(input.format==='writing-workbench') { if(input.version!==1) throw new Error('不支持此备份版本'); snapshot=object(input.snapshot);kv=object(input.kv||{}); }
    else if(input.snapshot) snapshot=object(input.snapshot);
    else {const tables=input.tables||input.data||input;snapshot=migrateLegacy(tables);const rows=name=>Array.isArray(tables[name])?tables[name]:[];
      const reading=rows('localBooks').map(book=>({id:'legacy-reading-'+book.id,title:book.title,chapters:rows('bookChapters').filter(c=>c.bookId===book.id).sort((a,b)=>(a.index || 0)-(b.index || 0)).map(c=>({title:c.title,body:String(c.content || '')})),notes:{structure:'',characters:'',style:'',excerpts:rows('bookBookmarks').filter(c=>c.bookId===book.id).map(c=>(c.chapterTitle || '')+'\n'+c.text+'\n'+(c.note || '')).join('\n\n')},reports:[]})).filter(book=>book.chapters.length && book.chapters.length<=2000);
      if(reading.length)kv['reading-archive']=JSON.stringify({books:reading,materials:[]});
      const practices=rows('writingPractices').map(c=>({id:'legacy-practice-'+c.id,version:1,genre:'其他',task:'场景描写',prompt:c.prompt || '旧版练习',body:c.content || '',created:new Date(c.createdAt || 0).toISOString(),updated:new Date(c.createdAt || 0).toISOString(),analysis:null,feedback:{},history:[],legacyAnalysis:c.aiAnalysis || ''}));
      if(practices.length)kv['writing-workbench.preview.practice.v1']=JSON.stringify({schema:1,revision:0,entries:practices,draft:null,profileReviews:{},reviewDrafts:{}});
    }
    snapshot={...snapshot}; delete snapshot._revision; const json=encode(sanitize(snapshot));
    const generations=Array.isArray(input.generations)?input.generations:[];encode(generations);
    transaction(()=>{db.prepare('UPDATE state SET revision=revision+1,json=? WHERE id=1').run(json);db.exec('DELETE FROM kv; DELETE FROM generation_records;');for(const [key,value] of Object.entries(kv)) setKV(key,value);for(const item of generations)db.prepare('INSERT INTO generation_records(created_at,json) VALUES(?,?)').run(String(item.createdAt || new Date().toISOString()),encode(sanitize(object(item.value))));});
    return {snapshot:read(),legacy:!!snapshot.legacyImport};
  }
  async function restore(source) {
    const candidate=new DatabaseSync(source,{readOnly:true}); let payload;
    try { if(candidate.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('备份已损坏'); const row=candidate.prepare('SELECT json FROM state WHERE id=1').get(); if(!row) throw new Error('备份缺少正文数据'); payload={format:'writing-workbench',version:1,snapshot:JSON.parse(row.json),kv:{},generations:candidate.prepare('SELECT created_at,json FROM generation_records ORDER BY id').all().map(row=>({createdAt:row.created_at,value:JSON.parse(row.json)}))};for(const row of candidate.prepare('SELECT key,json FROM kv').all()) payload.kv[row.key]=JSON.parse(row.json); } finally {candidate.close();}
    await makeBackup(path.join(root,'backups',`before-restore-${Date.now()}-${crypto.randomUUID()}.sqlite3`));
    return importObject(payload);
  }
  return {filename,read,save,getKV,setKV,getAIConfig,setAIConfig,exportObject,makeBackup,importObject,restore,history(){return db.prepare('SELECT created_at,json FROM generation_records ORDER BY id DESC LIMIT 100').all().map(row=>({createdAt:row.created_at,value:JSON.parse(row.json)}));},record(value){db.prepare('INSERT INTO generation_records(created_at,json) VALUES(?,?)').run(new Date().toISOString(),encode(sanitize(value)));},close(){db.close();}};
}
module.exports={createStorage,resolveDataRoot,sanitize,migrateLegacy,readLegacyWorkspace,recoveryObject};
