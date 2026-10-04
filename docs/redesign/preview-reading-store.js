/* One durable owner for reading manuscripts, notes, reports and reusable references. */
window.previewReadingUsage = {structure:{label:'大纲结构参考',operations:['outline','rewriteVolumes','rewriteChapters','volumeChapters','chapterOutline']},characters:{label:'人物塑造参考',operations:['person']},style:{label:'正文文风参考',operations:['continue','full','polish','expand']},excerpts:{label:'正文表达参考',operations:['continue','full','polish','expand']},tips:{label:'写作技巧',operations:['continue','full','polish','expand']}};
window.previewReadingPerson = {
  extract(text) {
    const field = labels => { const match=String(text).match(new RegExp('(?:^|\\n)\\s*(?:'+labels+')\\s*[：:]\\s*([^\\n]+)'));return match?.[1].trim() || ''; };
    const role=field('身份|角色'),goal=field('目标与动机') || [field('目标'),field('动机')].filter(Boolean).join('；');
    return {name:field('姓名|名字|人物'),role:['主角','配角','反派'].includes(role)?role:'配角',faction:field('所属|势力'),summary:field('介绍|简介|性格'),goalMotivation:goal};
  },
  hasEvidence(book,quote) { const normalize=text=>String(text).replace(/\r\n?/g,'\n').trim(); const text=normalize(quote);return !!text && book.chapters.some(chapter=>normalize(chapter.body).includes(text)); },
  material(book,person,quote,chapter,id) {
    return {id,title:person.name.trim(),kind:person.role,summary:person.summary.trim(),destination:'人物模板',person:{...person,name:person.name.trim()},fields:[['身份',person.role],['所属',person.faction || '未填写（以原书为准）'],['目标与动机',person.goalMotivation || '未填写（以原书为准）'],['来源作品',book.title],['来源章节',book.chapters[chapter].title],['原文依据',quote],['收录方式','外部拆书人物 · 独立资料；不与自己的书内人物同步']],readingSource:{bookId:book.id,bookTitle:book.title,dimension:'characters',chapter}};
  }
};
window.previewReadingValid = value => {
  if (!value || !Array.isArray(value.books) || !Array.isArray(value.materials)) return false;
  const ids = new Set();
  for (const book of value.books) {
    if (!book || typeof book.id !== 'string' || ids.has(book.id) || typeof book.title !== 'string' || !Array.isArray(book.chapters) || !book.chapters.length || book.chapters.length > 2000 || !book.notes) return false;
    ids.add(book.id);
    if (book.chapters.some(chapter=>typeof chapter.title !== 'string' || typeof chapter.body !== 'string')) return false;
    if (['structure','characters','style','excerpts'].some(key=>typeof book.notes[key] !== 'string')) return false;
    if (book.reports && (!Array.isArray(book.reports) || book.reports.some(item=>typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.title !== 'string' || typeof item.source !== 'string' || !Number.isFinite(item.createdAt)))) return false;
  }
  const materialIds = new Set();
  return value.materials.every(item=>{
    if (!item || typeof item.id !== 'string' || materialIds.has(item.id) || typeof item.title !== 'string' || typeof item.summary !== 'string' || !Array.isArray(item.fields) || item.fields.some(pair=>!Array.isArray(pair) || pair.length!==2 || pair.some(text=>typeof text!=='string')) || !ids.has(item.readingSource?.bookId) || !window.previewReadingUsage[item.readingSource.dimension]) return false;
    if(item.destination==='人物模板' && (!item.person?.name?.trim() || !['主角','配角','反派'].includes(item.person.role) || typeof item.person.summary!=='string' || typeof item.person.faction!=='string' || typeof item.person.goalMotivation!=='string'))return false;
    materialIds.add(item.id); return true;
  });
};
window.createPreviewReadingStore = () => {
  const clone = value => JSON.parse(JSON.stringify(value));
  if(window.desktop){const key='reading-archive',raw=window.desktop.getKV(key),state=raw?JSON.parse(raw):{books:[],materials:[]};if(!window.previewReadingValid(state))throw new Error('阅读数据库格式异常，未覆盖原数据。');window.previewReadingArchive=clone(state);return {ready:Promise.resolve(clone(state)),snapshot:()=>clone(state),save:async value=>{if(!window.previewReadingValid(value))throw new Error('阅读格式异常');window.desktop.setKV(key,JSON.stringify(value));Object.assign(state,clone(value));window.previewReadingArchive=clone(value);window.dispatchEvent(new Event('preview-reading-change'));return clone(value);}};}
  let db, revision = 0, queue = Promise.resolve(), state = {books:[],materials:[]};
  const ready = new Promise((resolve,reject) => {
    if(typeof indexedDB==='undefined'){reject(new Error('当前浏览器不支持本机阅读保存，请使用常规浏览器窗口。'));return;}
    const request = indexedDB.open('writing-workbench-preview-reading',1);
    request.onupgradeneeded = () => request.result.createObjectStore('archive');
    request.onerror = () => reject(new Error('无法打开本机阅读资料，请检查浏览器存储权限。'));
    request.onblocked = () => reject(new Error('阅读资料升级被其他窗口占用，请关闭旧页面后重试。'));
    request.onsuccess = () => { db = request.result; const read = db.transaction('archive').objectStore('archive').get('current');
      read.onerror = () => reject(new Error('读取阅读资料失败，未覆盖已有资料。'));
      read.onsuccess = () => { const saved = read.result;
        if (saved && (!window.previewReadingValid(saved) || !Number.isInteger(saved.revision))) { reject(new Error('阅读资料格式异常，未覆盖已有资料。')); return; }
        if(saved) { state = clone({books:saved.books,materials:saved.materials}); revision = saved.revision; }
        window.previewReadingArchive = clone(state); resolve(clone(state));
      };
    };
  });
  const save = value => {
    if (!window.previewReadingValid(value)) return Promise.reject(new Error('阅读资料格式异常，未覆盖已有资料。'));
    const snapshot = clone(value);
    const operation = queue.catch(()=>{}).then(()=>ready).then(()=>new Promise((resolve,reject)=>{
      const tx = db.transaction('archive','readwrite'), store = tx.objectStore('archive'); let conflict = false;
      const read = store.get('current');
      read.onsuccess = () => { if ((read.result?.revision || 0) !== revision) { conflict = true; tx.abort(); return; } store.put({...snapshot,revision:revision + 1},'current'); };
      tx.onabort = tx.onerror = () => reject(new Error(conflict ? '另一窗口已更新阅读资料，请复制当前未保存内容后刷新再试。' : '保存失败，内容仍在当前页面。请检查存储空间后重试。'));
      tx.oncomplete = () => { revision++; state = snapshot; window.previewReadingArchive = clone(state); window.dispatchEvent(new Event('preview-reading-change')); resolve(clone(state)); };
    }));
    queue = operation; return operation;
  };
  return {ready,save,snapshot:()=>clone(state)};
};
