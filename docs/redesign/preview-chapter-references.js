/* Explicit per-chapter card choices for the standalone preview. No automatic selection. */
window.previewForeshadowingTransition = (cards,choices,chapter) => {
  return choices.map(choice=>{
    const card=cards.find(item=>item.id===choice.id);
    if(!card || !['埋设','推进','回收'].includes(choice.action)) throw new Error('伏笔选择已失效，请重新选择。');
    if(card.kind==='已回收') throw new Error('「'+card.title+'」已回收，请取消选择，避免重复回收。');
    if(['回收','推进'].includes(choice.action) && card.kind==='未埋设') throw new Error('「'+card.title+'」尚未埋设，请先选择埋设。');
    if(choice.action==='埋设' && card.kind!=='未埋设') throw new Error('「'+card.title+'」已埋设，可选择推进或回收。');
    return {...card,kind:choice.action==='回收'?'已回收':choice.action==='埋设'?'待回收':'推进中',fields:[...card.fields.filter(([label])=>label!=='最近正文采用'),['最近正文采用','第'+chapter+'章 · '+choice.action]]};
  });
};
window.previewResolveChapterReferences = (selection,story) => {
  const people=story.people.filter(card=>selection.people.includes(card.id)),world=story.world.filter(card=>selection.world.includes(card.id));
  const foreshadowing=(story.foreshadowing || []).filter(card=>(selection.foreshadowing || []).some(choice=>choice.id===card.id)).map(card=>({...card,action:selection.foreshadowing.find(choice=>choice.id===card.id).action}));
  return {people,world,foreshadowing,missing:[...selection.people.filter(id=>!people.some(card=>card.id===id)),...selection.world.filter(id=>!world.some(card=>card.id===id)),...(selection.foreshadowing || []).filter(choice=>!foreshadowing.some(card=>card.id===choice.id)).map(choice=>choice.id)]};
};
window.createPreviewChapterReferences = ({pages,getChapter,notice}) => {
  const $=id=>document.getElementById(id), states=new Map(); let editing=null;
  if(window.desktopStore){(window.desktopStore.get('references')?.states || []).forEach(([key,value])=>states.set(key,value));window.desktopStore.register('references',()=>({states:[...states]}));}
  const stateKey=id=>window.desktopStore ? pages.activeBookId()+':'+id : id;
  const state=id=>{const key=stateKey(id);if(!states.has(key))states.set(key,{people:[],world:[],foreshadowing:[]});return states.get(key);};
  const storyFor=id=>({...pages.getStoryContext(window.desktopStore?pages.activeBookId():'main',Number(id)-(window.desktopStore?1:0)),foreshadowing:pages.getForeshadowing(window.desktopStore?pages.activeBookId():'main')});
  const resolve=(id=getChapter())=>window.previewResolveChapterReferences(state(id),storyFor(id));
  const dialog=document.createElement('dialog');dialog.className='feature-dialog';dialog.id='chapter-reference-dialog';dialog.setAttribute('aria-labelledby','chapter-reference-heading');
  dialog.innerHTML='<form id="chapter-reference-form"><h2 id="chapter-reference-heading"></h2><p>从本书库中选择本章需要出现的卡片。生成仍以章纲为准；选择在本页保留，刷新恢复。</p><label for="chapter-reference-search">搜索名称或介绍</label><input id="chapter-reference-search" type="search"><div id="chapter-reference-options" style="max-height:360px;overflow:auto"></div><p id="chapter-reference-empty" hidden>本书没有符合条件的卡片，请先到书内人物库或世界观库创建。</p><div class="actions"><button type="button" class="btn" id="chapter-reference-cancel">取消</button><button type="submit" class="btn primary">保存本章选择</button></div></form>';
  document.body.append(dialog);
  const render=()=>{
    const selected=resolve();
    ['people','world','foreshadowing'].forEach(type=>{
      const list=$('chapter-reference-'+type);list.replaceChildren();
      if(!selected[type].length){const hint=document.createElement('p');hint.textContent='尚未选择';list.append(hint);}
      selected[type].forEach(card=>{const row=document.createElement('div');row.className='reference';const content=document.createElement('div'),title=document.createElement('strong'),body=document.createElement('small');title.textContent=(card.name||card.title)+(card.action?' · '+card.action+'（'+card.kind+'）':'');body.textContent=card.currentState||card.summary;content.append(title,body);row.append(content);list.append(row);});
    });
    $('chapter-reference-status').textContent=selected.missing.length?'有选中卡片已删除，请重新选择。':'生成会读取选中卡片的设定，并以本章章纲为主线。';
  };
  const draw=()=>{
    const query=$('chapter-reference-search').value.trim().toLowerCase(),list=$('chapter-reference-options');list.replaceChildren();
    const shown=editing.cards.filter(card=>((card.name||card.title)+' '+(card.currentState||card.summary)).toLowerCase().includes(query));
    shown.forEach(card=>{const label=document.createElement('label');label.className='ai-check';const input=document.createElement('input');input.type='checkbox';input.checked=editing.ids.has(card.id);const text=document.createElement('span');text.textContent=(card.name||card.title)+' · '+(card.role||card.kind||'设定');input.addEventListener('change',()=>{if(input.checked)editing.ids.add(card.id);else editing.ids.delete(card.id);});label.append(input,text);if(editing.type==='foreshadowing'){const select=document.createElement('select');select.setAttribute('aria-label',card.title+'的本章用途');['埋设','推进','回收'].forEach(action=>{const option=document.createElement('option');option.value=action;option.textContent=action;select.append(option);});select.value=editing.actions.get(card.id)||(card.kind==='未埋设'?'埋设':'推进');editing.actions.set(card.id,select.value);select.addEventListener('change',()=>editing.actions.set(card.id,select.value));label.append(select);}const description=document.createElement('p');description.textContent=card.currentState||card.summary;list.append(label,description);});
    $('chapter-reference-empty').hidden=shown.length>0;
  };
  document.querySelectorAll('[data-select-chapter-reference]').forEach(button=>button.addEventListener('click',()=>{
    const type=button.dataset.selectChapterReference,id=getChapter(),story=storyFor(id);
    editing={type,id,trigger:button,cards:story[type],ids:new Set(state(id)[type].map(key=>typeof key==='string'?key:key.id).filter(key=>story[type].some(card=>card.id===key))),actions:new Map(state(id).foreshadowing.map(choice=>[choice.id,choice.action]))};$('chapter-reference-heading').textContent=type==='people'?'选择本章人物':type==='world'?'选择本章世界观':'选择本章伏笔';$('chapter-reference-search').value='';draw();dialog.showModal();$('chapter-reference-search').focus();
  }));
  $('chapter-reference-search').addEventListener('input',draw);
  $('chapter-reference-cancel').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>editing?.trigger.focus());
  $('chapter-reference-form').addEventListener('submit',event=>{event.preventDefault();state(editing.id)[editing.type]=editing.type==='foreshadowing'?[...editing.ids].map(id=>({id,action:editing.actions.get(id)||'推进'})):[...editing.ids];render();dialog.close();notice('已保存这一章的卡片选择，其他章节独立。');});
  window.addEventListener('preview-chapter-changed',render);render();
  return {get:resolve,render,snapshot:id=>JSON.stringify(resolve(id))};
};

// Summaries are evidence-backed chapter memory, never future plans.
window.previewBuildChapterMemory = (chapters,currentId) => {
  const previous=chapters.filter(ch=>Number(ch.id)<Number(currentId)).sort((a,b)=>Number(a.id)-Number(b.id));
  const valid=previous.filter(ch=>ch.summary && ch.summarySource===ch.body);
  const last=previous.at(-1);
  return {summaries:valid.slice(-8).map(ch=>({id:ch.id,title:ch.title,text:ch.summary})),stale:previous.filter(ch=>ch.summary && ch.summarySource!==ch.body).map(ch=>ch.id),missing:previous.filter(ch=>!ch.summary && ch.body.trim()).map(ch=>ch.id),previousEnding:last?.body.slice(-1600)||'',instruction:'只作为已确认前文，不读取未来章摘要。摘要和正文冲突以正文为准；本章按章纲推进，不能提前兑现后续计划。'};
};
window.previewExtractSummaryEvidence = text => {
  const sentences=(String(text||'').match(/[^。！？\n]+(?:[。！？][”’」』"]?|$)/gm)||[]).map(s=>s.trim()).filter(Boolean);
  if(!sentences.length)return '';
  const chosen=sentences.length<=8?sentences:[...sentences.slice(0,4),...sentences.slice(-4)];
  return '正文核心摘句（本地提取，需作者核对）：\n'+chosen.map((s,i)=>(i+1)+'. '+s).join('\n');
};
