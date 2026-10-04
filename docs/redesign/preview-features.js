/* Additional preview workflows; source data stays in page memory. */
window.parsePreviewManuscript = (source) => {
  const text = String(source).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if (!text) return [];
  const lines = text.split('\n'), chapters = []; let title = '前言', body = [], found = false;
  const flush = () => { if (body.join('\n').trim() || found) chapters.push({title,body:body.join('\n').trim()}); body = []; };
  lines.forEach((line) => {
    if (/^(?:#{1,6}\s*)?(?:第[一二三四五六七八九十百千万零〇两\d]+[章回节].*|Chapter\s+\d+.*)$/i.test(line.trim())) {
      flush(); found = true; title = line.trim().replace(/^#{1,6}\s*/,'');
    } else body.push(line);
  });
  if (!found) return [{title:'正文',body:text}];
  flush(); return chapters;
};
window.serializePreviewChapters = (title, chapters, format) => {
  const blocks = chapters.map((chapter) => (format === 'md' ? '## ' : '') + chapter.title + '\n\n' + chapter.body);
  return (format === 'md' ? '# ' : '') + title + '\n\n' + blocks.join('\n\n') + '\n';
};

window.createPreviewFeatures = ({ switchView, notice, primaryTitle, getWritingChapters, appendWritingChapters, addIdea }) => {
  const $ = (id) => document.getElementById(id);
  const count = (text) => Array.from(text.replace(/\s/g,'')).length;
  const grow = (input,minimum = 150,maximum = 500) => { input.style.height = 'auto'; input.style.height = Math.min(maximum,Math.max(minimum,input.scrollHeight)) + 'px'; };
  const make = (id,title,description,tags,atmosphere = '') => ({id,title,description,tags,atmosphere});
  const cards = {
    plot:[make('p1','离开青石村','林逸离开故乡。父亲没有送到村口，却把那把旧柴刀放进了包袱。',['开篇','选择']),make('p2','山门下的第一次选择','试炼即将结束，林逸回头帮助落在最后的同伴，放弃争取名次。',['转折','人物成长']),make('p3','藏书阁里的矛盾记录','方知秋发现两本古籍对同一事件的描述不同，决定请林逸寻找见证人。',['悬念','线索']),make('p4','一封没有署名的信','苏浅语收到来自故乡的信，信中只写了一处早已废弃的渡口。',['悬念','情感']),make('p5','试炼之后的争执','沈砚与林逸因承担风险的方式不同发生争执，双方第一次说出各自的害怕。',['冲突','人物成长']),make('p6','旧柴刀上的刻痕','林逸在后山石碑上看见熟悉纹路，意识到父亲从未告诉他全部往事。',['线索','伏笔']),make('p7','故人来到山门','阿棠带来村里的近况，一件小事改变了林逸对修行的判断。',['情感','回望']),make('p8','守书人的代价','温知远帮助众人找到古籍，却遗忘了一段关于自己的记忆。',['代价','转折']),make('p9','选择守住同伴','卷末，林逸放弃更安全的机会，选择与受到怀疑的同伴一起面对追查。',['卷末','选择'])],
    scene:[make('s1','薄雾里的青云山门','青石阶从松林中延伸向山门，湿冷的风卷着钟声。林逸站在石阶下，第一次意识到自己已经离家很远。',['山门','初见'],'冷白薄雾、湿青石、远处钟声；从陌生到坚定。'),make('s2','黄昏的村口木桥','河水映着落日。桥边的人渐渐散去，苏浅语最后递来一张折好的地图。',['故乡','告别'],'暖橙夕光、缓慢河水、木桥的轻响；安静而克制。'),make('s3','无人点灯的藏书阁','高窗漏下最后一道光，灰尘悬在书架之间。一页被撕去的目录，比完整古籍更引人注目。',['藏书阁','悬念'],'微暗的金色侧光、旧纸味、停顿的脚步；隐藏的不安。')]
  };
  const cardsByBook=new Map();let cardsBookId='main';
  if(window.desktopStore){const saved=window.desktopStore.get('features');(saved?.cardsByBook || []).forEach(([id,value])=>cardsByBook.set(id,value));Object.assign(cards,cardsByBook.get(cardsBookId) || {plot:[],scene:[]});window.desktopStore.register('features',()=>{cardsByBook.set(cardsBookId,{plot:cards.plot,scene:cards.scene});return {cardsByBook:[...cardsByBook]};});window.addEventListener('desktop-book-changed',event=>{cardsByBook.set(cardsBookId,{plot:cards.plot,scene:cards.scene});cardsBookId=event.detail.id;Object.assign(cards,cardsByBook.get(cardsBookId) || {plot:[],scene:[]});selectedCard=null;cardPage=1;renderCards();});}
  let cardTab = 'plot', selectedCard = 'p1', cardPage = 1, tagFilter = '', nextCard = 1, removed = null;
  const cardPageSize = 8, kindLabel = () => cardTab === 'plot' ? '剧情卡' : '场景卡';
  const renderCards = () => {
    const tags = [...new Set(cards[cardTab].flatMap((card) => card.tags))];
    if (!tags.includes(tagFilter)) tagFilter = '';
    $('cards-tag').replaceChildren(); ['',...tags].forEach((tag) => { const option = document.createElement('option'); option.value = tag; option.textContent = tag || '全部标签'; $('cards-tag').append(option); }); $('cards-tag').value = tagFilter;
    const filtered = cards[cardTab].filter((card) => !tagFilter || card.tags.includes(tagFilter));
    cardPage = Math.max(1,Math.min(cardPage,Math.ceil(filtered.length / cardPageSize) || 1));
    const rows = filtered.slice((cardPage - 1) * cardPageSize,cardPage * cardPageSize);
    if (!rows.some((card) => card.id === selectedCard)) selectedCard = rows[0]?.id ?? null;
    $('new-story-card').lastChild.textContent = '新建' + kindLabel();
    $('cards-count').textContent = filtered.length + ' 张' + kindLabel() + ' · 示例'; $('story-card-empty').hidden = !!rows.length; $('story-card-detail').hidden = !rows.length;
    const list = $('story-card-list'); list.replaceChildren();
    rows.forEach((card) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'record-row'; button.dataset.storyCard = card.id; button.setAttribute('aria-pressed',String(card.id === selectedCard));
      const title = document.createElement('strong'); title.textContent = card.title;
      const summary = document.createElement('p'); summary.textContent = card.description || '还没有描述';
      const tagsNode = document.createElement('span'); tagsNode.className = 'record-meta'; tagsNode.textContent = card.tags.join(' · ') || '未分类';
      button.append(title,summary,tagsNode); button.addEventListener('click',() => { selectedCard = card.id; renderCards(); }); list.append(button);
    });
    const selected = cards[cardTab].find((card) => card.id === selectedCard);
    if (selected) {
      $('story-card-kind').textContent = kindLabel(); $('story-card-title').textContent = selected.title; $('story-card-description').textContent = selected.description || '还没有描述';
      const fields = $('story-card-fields'); fields.replaceChildren();
      const pairs = cardTab === 'scene' ? [['场景氛围',selected.atmosphere || '待补充'],['标签',selected.tags.join(' · ') || '未分类']] : [['标签',selected.tags.join(' · ') || '未分类']];
      pairs.forEach(([label,text]) => { const dt = document.createElement('dt'),dd = document.createElement('dd'); dt.textContent = label; dd.textContent = text; fields.append(dt,dd); });
    }
    $('cards-range').textContent = filtered.length ? ((cardPage - 1) * cardPageSize + 1) + '–' + Math.min(cardPage * cardPageSize,filtered.length) + ' / ' + filtered.length + ' 张' : '0 张卡片';
    $('cards-prev').disabled = cardPage <= 1; $('cards-next').disabled = cardPage * cardPageSize >= filtered.length;
  };
  const setCardTab = (tab) => { cardTab = tab; cardPage = 1; tagFilter = ''; document.querySelectorAll('[data-card-tab]').forEach((button) => button.setAttribute('aria-pressed',String(button.dataset.cardTab === tab))); renderCards(); };
  document.querySelectorAll('[data-card-tab]').forEach((button) => button.addEventListener('click',() => setCardTab(button.dataset.cardTab)));
  $('cards-tag').addEventListener('change',() => { tagFilter = $('cards-tag').value; cardPage = 1; renderCards(); });
  $('cards-reset').addEventListener('click',() => { tagFilter = ''; cardPage = 1; renderCards(); });
  $('cards-prev').addEventListener('click',() => { cardPage--; renderCards(); }); $('cards-next').addEventListener('click',() => { cardPage++; renderCards(); });

  let editorTrigger = null, editorSave = null, editorBusy = false;
  const openEditor = (trigger,title,fields,onSave,options={}) => {
    editorTrigger = trigger; editorSave = onSave; $('feature-dialog-hint').textContent=options.hint||'修改只在本页预览保留，刷新后恢复。';$('feature-form').querySelector('[type=submit]').textContent=options.action||'保存卡片'; $('feature-dialog-title').textContent = title; $('feature-dialog-error').textContent = '';
    const container = $('feature-dialog-fields'); container.replaceChildren();
    fields.forEach((field) => {
      const label = document.createElement('label'); label.htmlFor = 'feature-field-' + field.key; label.textContent = field.label + (field.required ? ' *' : '');
      const input = document.createElement(field.options ? 'select' : field.multiline ? 'textarea' : 'input'); input.id = label.htmlFor; input.name = field.key; if(field.options)field.options.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}); input.value = field.value || '';if(field.readonly)input.readOnly=true; input.maxLength = field.multiline ? 20000 : field.key === 'title' ? 80 : 240; input.required = !!field.required; input.setAttribute('aria-describedby','feature-dialog-error'); if (!field.multiline) input.autocomplete = 'off';
      if (field.multiline) input.addEventListener('input',(event) => { if (!event.isComposing) grow(input); });
      container.append(label,input);
    });
    $('feature-dialog').showModal(); container.querySelectorAll('textarea').forEach((input) => grow(input)); container.querySelector('input,textarea').focus();
  };
  $('feature-dialog-cancel').addEventListener('click',() => {if(!editorBusy)$('feature-dialog').close();});
  $('feature-dialog').addEventListener('cancel',event=>{if(editorBusy)event.preventDefault();});
  $('feature-dialog').addEventListener('close',() => { if (editorTrigger?.isConnected && !editorTrigger.closest('[hidden]')) editorTrigger.focus(); else $('new-story-card').focus(); editorSave = null; });
  $('feature-form').addEventListener('submit',async (event) => {
    event.preventDefault(); if(editorBusy || event.isComposing)return; const values = {}; let invalid = null;
    $('feature-dialog-fields').querySelectorAll('input,textarea,select').forEach((input) => { values[input.name] = input.value.trim(); input.removeAttribute('aria-invalid'); if (input.required && !values[input.name]) invalid = invalid || input; });
    if (invalid) { invalid.setAttribute('aria-invalid','true'); $('feature-dialog-error').textContent = '请填写标有 * 的内容，不能只输入空格。'; invalid.focus(); return; }
    editorBusy=true; const controls=[...$('feature-form').querySelectorAll('input,textarea,select,button')];controls.forEach(input=>input.disabled=true);
    try {const outcome=await editorSave(values);$('feature-dialog').close();notice(outcome?.message||'已保存本页卡片。刷新后恢复示例。');}
    catch(error){$('feature-dialog-error').textContent=error.message;}finally{editorBusy=false;controls.forEach(input=>input.disabled=false);}
  });
  const editCard = (trigger, existing = null) => {
    const tab = cardTab;
    const fields = [{key:'title',label:kindLabel() + '标题',required:true,value:existing?.title},{key:'description',label:tab === 'plot' ? '事件、冲突与结果' : '场景描述',multiline:true,value:existing?.description}];
    if (tab === 'scene') fields.push({key:'atmosphere',label:'场景氛围',multiline:true,value:existing?.atmosphere});
    fields.push({key:'tags',label:'标签（用逗号分隔）',value:existing?.tags.join('，')});
    openEditor(trigger,(existing ? '编辑' : '新建') + kindLabel(),fields,(values) => {
      const tags = [...new Set(values.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))];
      if (existing) Object.assign(existing,{title:values.title,description:values.description,atmosphere:values.atmosphere || '',tags});
      else { const card = make(window.desktopStore ? 'card-'+crypto.randomUUID() : 'new-card-' + nextCard++,values.title,values.description,tags,values.atmosphere || ''); cards[tab].unshift(card); selectedCard = card.id; cardPage = 1; tagFilter = ''; }
      renderCards();
    });
  };
  $('new-story-card').addEventListener('click',(event) => editCard(event.currentTarget));
  $('edit-story-card').addEventListener('click',(event) => editCard(event.currentTarget,cards[cardTab].find((card) => card.id === selectedCard)));
  let removalTarget = null;
  $('remove-story-card').addEventListener('click',() => { removalTarget = {tab:cardTab,id:selectedCard}; const card = cards[cardTab].find((item) => item.id === selectedCard); $('feature-confirm-description').textContent = '从本页预览移除「' + card.title + '」？移除后可以撤销，真实作品不会受影响。'; $('feature-confirm').showModal(); $('feature-confirm-cancel').focus(); });
  $('feature-confirm-cancel').addEventListener('click',() => $('feature-confirm').close());
  $('feature-confirm').addEventListener('close',() => { (!$('story-card-detail').hidden ? $('remove-story-card') : $('new-story-card')).focus(); });
  $('feature-confirm-remove').addEventListener('click',() => {
    const {tab,id} = removalTarget, index = cards[tab].findIndex((card) => card.id === id); removed = {tab,index,card:cards[tab][index]}; cards[tab].splice(index,1); renderCards();
    $('cards-undo').hidden = false; $('cards-feedback').textContent = '已移除「' + removed.card.title + '」，可以撤销。'; $('feature-confirm').close(); notice('已移除本页卡片，可在窗口底部撤销。');
  });
  $('cards-undo').addEventListener('click',() => { if (!removed) return; const saved = removed; removed = null; cards[saved.tab].splice(saved.index,0,saved.card); setCardTab(saved.tab); selectedCard = saved.card.id; cardPage = Math.floor(saved.index / cardPageSize) + 1; renderCards(); $('cards-undo').hidden = true; $('cards-feedback').textContent = '已撤销移除。本页修改刷新后恢复。'; $('edit-story-card').focus(); notice('卡片已恢复。'); });

  const noteLabels = {structure:'结构',characters:'人物',style:'文风',excerpts:'摘录'};
  const readingBooks = [{id:'reading-1',title:'青山来信 · 阅读示例',chapters:[{title:'第一章 山间来信',body:'傍晚，林逸在山门前收到一封没有署名的信。\n\n信纸上写着故乡的渡口，还有一个他多年没有听见的名字。他没有立刻拆开第二页，而是先把灯点亮。\n\n远处有人敲响晚钟。林逸将地图铺在桌上，在渡口旁画了一个很小的圈。'},{title:'第二章 灯下的选择',body:'苏浅语推开门时，桌上的灯已经烧去了半截。\n\n“明天就走吗？”她问。林逸摇头，指了指信纸背面的日期。那不是寄信的日子，而是一场约定的起点。\n\n两人决定先寻找当年的见证人。急切没有消失，却终于有了方向。'},{title:'第三章 木桥上的故人',body:'阿棠站在木桥中央，手里拿着一把旧伞。\n\n林逸看见她时，忽然想起离家那天的雨。她没有问他修行到了什么境界，只问了一句：“这次回来，能住几天？”\n\n他放下包袱，第一次没有急着回答。'}],notes:{structure:'用一封来信提出悬念，再让人物通过一次选择推进情节。',characters:'林逸的急切与苏浅语的观察形成互补。',style:'克制的对话，借灯、地图、木桥承载情绪。',excerpts:''}}];
  let readingId = 'reading-1', readingChapter = 0, noteTab = 'structure', readingSize = 18;
  const readingStore = window.createPreviewReadingStore();
  let readingMaterials = [], readingReady = false, noteTimer;
  const saveReading = async () => { if (!readingReady) throw new Error('阅读资料尚未载入，请稍后重试。'); await readingStore.save({books:readingBooks,materials:readingMaterials}); };
  let manualNoteSaving=false;
  const saveNote = async (manual=false) => {
    if(manualNoteSaving)return;
    clearTimeout(noteTimer);
    const button=$('reader-save-note');
    if(manual){
      manualNoteSaving=true;button.disabled=true;button.textContent='正在保存…';button.setAttribute('aria-busy','true');
      if(readingReady)currentReading().notes[noteTab]=$('reader-note').value;
    }
    try {
      await saveReading();$('reader-note-status').textContent='已保存到《'+currentReading().title+'》的'+noteLabels[noteTab]+'笔记';
      if(manual){button.textContent='已保存';notice('笔记已保存。');}
    }catch(error){
      $('reader-note-status').textContent='保存失败：'+error.message;
      if(manual){button.textContent='重试保存';notice('笔记保存失败：'+error.message);}
    }finally{if(manual){manualNoteSaving=false;button.disabled=false;button.removeAttribute('aria-busy');}}
  };
  $('reader-note').disabled = true;
  readingStore.ready.then(async saved => { if(saved.books.length) readingBooks.splice(0,readingBooks.length,...saved.books); readingMaterials = saved.materials; readingId = readingBooks[0].id; readingReady = true; $('reader-note').disabled = false; renderReader();window.dispatchEvent(new Event('preview-reading-change')); if(!saved.books.length) await saveReading(); }).catch(error=>{ $('reader-note-status').textContent = error.message; notice(error.message); });
  const currentReading = () => readingBooks.find((book) => book.id === readingId);
  const updateNote = () => { const book = currentReading(); book.notes[noteTab] = $('reader-note').value; if(!manualNoteSaving)$('reader-save-note').textContent='保存笔记'; $('reader-note-status').textContent = count($('reader-note').value) + ' 字 · 待保存'; grow($('reader-note'),240,500); clearTimeout(noteTimer); noteTimer = setTimeout(saveNote,450); };
  const renderNote = () => { $('reader-note-label').textContent = noteLabels[noteTab] + '笔记'; $('reader-note').value = currentReading().notes[noteTab] || ''; $('reader-note').placeholder = ({structure:'记下开篇、冲突、转折与收束。',characters:'人物想要什么？他做了什么选择？',style:'观察叙述节奏、句式与感官细节。',excerpts:'记录想保留的片段和自己的理解。'}[noteTab]); document.querySelectorAll('[data-note-tab]').forEach((button) => button.setAttribute('aria-pressed',String(button.dataset.noteTab === noteTab)));
    if(!manualNoteSaving)$('reader-save-note').textContent='保存笔记';
    $('reader-note-location').textContent='《'+currentReading().title+'》的笔记';
    $('reader-note-status').textContent = readingReady ? '自动保存 · 下次选回这本书即可查看' : '正在载入笔记…';
    $('reader-use-note').textContent = noteTab==='characters'?'收录到人物资料库':noteTab==='excerpts'?'从摘录整理写作技巧':'收录到写作技巧';
    $('reader-note-hint').textContent = noteTab==='characters'?'收录后在“资料库 → 人物库”查看。':noteTab==='excerpts'?'原文留在这里；借鉴的方法可收录到写作技巧。':'收录后在“资料库 → 写作技巧”查看和使用。';
    grow($('reader-note'),240,500); };
  const renderReader = () => {
    const book = currentReading(); readingChapter = Math.max(0,Math.min(readingChapter,book.chapters.length - 1));
    $('reader-book').replaceChildren(); readingBooks.forEach((item) => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; $('reader-book').append(option); }); $('reader-book').value = readingId;
    const chapter = book.chapters[readingChapter]; $('reader-position').textContent = book.title + ' / 第 ' + (readingChapter + 1) + ' / ' + book.chapters.length + ' 章 · ' + Math.round((readingChapter + 1) / book.chapters.length * 100) + '%'; $('reader-title').textContent = chapter.title; $('reader-body').textContent = chapter.body || '本章暂无正文。'; $('reader-body').style.fontSize = readingSize + 'px';
    $('reader-directory').replaceChildren(); book.chapters.forEach((item,index) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = item.title; button.dataset.readingChapter = String(index); if (index === readingChapter) button.setAttribute('aria-current','page'); button.addEventListener('click',() => { readingChapter = index; renderReader(); }); $('reader-directory').append(button); });
    $('reader-prev').disabled = readingChapter === 0; $('reader-next').disabled = readingChapter === book.chapters.length - 1; renderNote();
    const reports = $('reader-reports'); reports.replaceChildren();
    const techniques=readingMaterials.filter(item=>item.readingSource.bookId===book.id&&item.kind!=='人物模板');
    techniques.forEach(item=>{const row=document.createElement('div'),title=document.createElement('strong'),description=document.createElement('p'),button=document.createElement('button');row.className='record-row';title.textContent=item.title;description.textContent=item.summary;button.type='button';button.className='btn';button.textContent='查看写作技巧';button.addEventListener('click',()=>{switchView('library');document.querySelector('[data-collection-tab="library"][data-group="写作技巧"]').click();window.dispatchEvent(new CustomEvent('preview-select-reading-material',{detail:{id:item.id}}));});row.append(title,description,button);reports.append(row);});
    const history = book.reports || [];
    $('reader-report-count').textContent = techniques.length + ' 条 · 同时保存在资料库的写作技巧中';
    if(!techniques.length&&!history.length) reports.textContent = '点击单章分析或整书分析，勾选需要的结果后直接收录到写作技巧。';
    history.slice().reverse().forEach(item=>{const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p'); summary.textContent=item.title+' · '+item.source+' · '+new Date(item.createdAt).toLocaleString('zh-CN'); text.textContent=item.text; text.className='feature-prose'; details.append(summary,text); reports.append(details);});
  };
  const showReader = () => { document.querySelector('[data-collection-tab="library"][data-group="阅读与拆书"]').click(); renderReader(); };
  document.querySelector('[data-collection-tab="library"][data-group="阅读与拆书"]').addEventListener('click',renderReader);
  $('reader-book').addEventListener('change',() => { readingId = $('reader-book').value; readingChapter = 0; renderReader(); });
  $('reader-prev').addEventListener('click',() => { readingChapter--; renderReader(); }); $('reader-next').addEventListener('click',() => { readingChapter++; renderReader(); });
  $('reader-size').addEventListener('click',() => { readingSize = readingSize === 22 ? 16 : readingSize + 2; $('reader-size').textContent = '字号 ' + readingSize + ' px'; $('reader-body').style.fontSize = readingSize + 'px'; });
  $('reader-note').addEventListener('input',(event) => { if (!event.isComposing) updateNote(); }); $('reader-note').addEventListener('compositionend',updateNote);
  document.querySelectorAll('[data-note-tab]').forEach((button) => button.addEventListener('click',() => { noteTab = button.dataset.noteTab; renderNote(); }));
  const collectedNotes = new Set();
  $('reader-add-idea').addEventListener('click',() => { const book = currentReading(),text = $('reader-note').value.trim(); if (!text) { notice('先写一段拆书笔记，再收进灵感。'); $('reader-note').focus(); return; } const key = book.id + ':' + noteTab + ':' + text; if (collectedNotes.has(key)) { notice('这段笔记已经收进灵感，不重复添加。'); return; } collectedNotes.add(key); addIdea(book.title + ' · ' + noteLabels[noteTab] + '观察',text); switchView('ideas'); notice('已将这段拆书笔记收进本页灵感，原笔记保留。'); });

  $('reader-save-note').addEventListener('click',()=>saveNote(true));
  const commitMaterial = async (material,existing=null) => {
    clearTimeout(noteTimer);const index=existing?readingMaterials.indexOf(existing):-1;
    if(index>=0)readingMaterials[index]=material;else readingMaterials.push(material);
    try {await saveReading();}catch(error){if(index>=0)readingMaterials[index]=existing;else readingMaterials.splice(readingMaterials.indexOf(material),1);throw error;}
  };
  const openReadingPerson = (trigger,existing=null) => {
    const source=existing?.readingSource,book=source?readingBooks.find(item=>item.id===source.bookId):currentReading(),chapterIndex=source?.chapter??readingChapter;
    const chapter=book.chapters[chapterIndex],extracted=existing?.person||window.previewReadingPerson.extract(chapter.body);
    const quote=existing?.fields.find(([key])=>key==='原文依据')?.[1]||'';
    openEditor(trigger,'按原书收录人物资料',[
      {key:'original',label:'原书本章正文（核对依据）',multiline:true,readonly:true,value:chapter.body},
      {key:'name',label:'姓名',required:true,value:extracted.name},
      {key:'role',label:'身份',options:['主角','配角','反派'],value:extracted.role},
      {key:'faction',label:'所属（选填，原书未说明可留空）',value:extracted.faction},
      {key:'summary',label:'人物介绍（按原书设定）',multiline:true,required:true,value:extracted.summary},
      {key:'goalMotivation',label:'目标与动机（原书未说明可留空）',multiline:true,value:extracted.goalMotivation},
      {key:'quote',label:'原文依据（粘贴原书中相关段落）',multiline:true,required:true,value:quote}
    ],async values=>{
      if(!window.previewReadingPerson.hasEvidence(book,values.quote))throw new Error('原文依据未在这本阅读稿中找到，请粘贴原书中的原句。');
      const person={name:values.name,role:values.role,faction:values.faction,summary:values.summary,goalMotivation:values.goalMotivation};
      const found=existing||readingMaterials.find(item=>item.destination==='人物模板'&&item.readingSource.bookId===book.id&&item.person.name===person.name);
      const material=window.previewReadingPerson.material(book,person,values.quote,book.chapters.findIndex(chapter=>chapter.body.replace(/\r\n?/g,'\n').trim().includes(values.quote.replace(/\r\n?/g,'\n').trim())),found?.id||'reading-person-'+crypto.randomUUID());
      await commitMaterial(material,found);switchView('library');document.querySelector('[data-collection-tab="library"][data-group="人物模板"]').click();window.dispatchEvent(new CustomEvent('preview-select-reading-material',{detail:{id:material.id}}));
      return {message:'已'+(found?'更新':'收录')+'《'+book.title+'》的人物「'+person.name+'」，本机保留。'};
    },{hint:'核对原书后再保存；未知信息留空，不补造设定。当前预览仅识别显式字段标签，未接入真实 AI 人物提取。',action:'保存到人物资料库'});
  };
  window.addEventListener('preview-edit-reading-person',event=>{const item=readingMaterials.find(item=>item.id===event.detail.id);if(item)openReadingPerson($('edit-reading-person'),item);});
  $('reader-use-note').addEventListener('click',event=>{
    const book=currentReading(),dimension=noteTab,chapterIndex=readingChapter,text=$('reader-note').value.trim();
    if(dimension==='characters'){openReadingPerson(event.currentTarget);return;}
    if(!text){notice('先填写笔记或摘录，再收录。');$('reader-note').focus();return;}
    {
      openEditor(event.currentTarget,dimension==='excerpts'?'从摘录整理写作技巧':'收录'+noteLabels[dimension]+'技巧',[
        {key:'original',label:dimension==='excerpts'?'原摘录与理解（保留在阅读稿）':'原拆书笔记（保留在阅读稿）',multiline:true,readonly:true,value:text},
        {key:'title',label:'技巧名称',required:true,value:dimension==='excerpts'?'':book.title+' · '+noteLabels[dimension]+'技巧'},
        {key:'method',label:'可借鉴的方法（用自己的话）',multiline:true,required:true,value:dimension==='excerpts'?'':text},
        {key:'usage',label:'适用场景与例外',multiline:true,required:true}
      ],async values=>{
        if(book.chapters.some(chapter=>chapter.body.includes(values.method))||(dimension==='excerpts'&&values.method===text))throw new Error('请填写自己的方法总结；原文保留为出处，不直接作为写作技巧。');
        const found=readingMaterials.find(item=>item.readingSource.bookId===book.id&&item.readingSource.dimension===dimension&&item.title===values.title&&item.summary===values.method);
        const material={id:found?.id||'reading-material-'+crypto.randomUUID(),title:values.title,kind:dimension==='excerpts'?'摘录提炼技巧':noteLabels[dimension]+'技巧',summary:values.method,fields:[['适用场景与例外',values.usage],['来源作品',book.title],['来源章节',book.chapters[chapterIndex].title],[dimension==='excerpts'?'原摘录与理解':'原拆书笔记',text]],readingSource:{bookId:book.id,bookTitle:book.title,dimension,chapter:chapterIndex}};
        await commitMaterial(material,found);switchView('library');document.querySelector('[data-collection-tab="library"][data-group="写作技巧"]').click();window.dispatchEvent(new CustomEvent('preview-select-reading-material',{detail:{id:material.id}}));return {message:'已将'+noteLabels[dimension]+'方法收录到写作技巧，原笔记保留。'};
      },{hint:'保留原笔记与出处；请选择值得借鉴的方法，不必收录全部分析。生成窗口参考方法与适用情境。',action:'保存写作技巧'});return;
    }
  });
  window.addEventListener('preview-open-reading',event=>{const source=event.detail; if(!readingBooks.some(book=>book.id===source.bookId)) return; readingId=source.bookId; readingChapter=source.chapter||0; if(noteLabels[source.dimension])noteTab=source.dimension; switchView('library'); showReader();});
  let importPlan = null, importVersion = 0, fileBusy = false, exportInitialized = false;
  const selectedExport = new Set();
  const activeWritingBook = () => window.workbench?.books.currentBookContext();
  window.addEventListener('desktop-book-changed',()=>{cancelPendingFile();invalidateImport();selectedExport.clear();exportInitialized=false;if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=null;$('export-download').removeAttribute('href');queueMicrotask(()=>{if(!$('export-panel').hidden)renderExport();});});
  const invalidateImport = () => { importPlan = null; $('import-commit').disabled = true; $('import-chapter-list').replaceChildren(); $('import-status').textContent = '内容有变化，请重新预览章节拆分。'; };
  const importError = (message,field) => { $('import-error').textContent = message; if (field) { field.setAttribute('aria-invalid','true'); field.focus(); } };
  const clearImportError = () => { $('import-error').textContent = ''; ['import-title','import-text','manuscript-file'].forEach((id) => $(id).removeAttribute('aria-invalid')); };
  const cancelPendingFile = () => { importVersion++; fileBusy = false; $('import-preview').disabled = false; };
  ['import-title','import-text'].forEach((id) => {
    $(id).addEventListener('compositionstart',() => { cancelPendingFile(); invalidateImport(); });
    $(id).addEventListener('input',(event) => { if (event.isComposing) return; cancelPendingFile(); invalidateImport(); clearImportError(); if (id === 'import-text') grow($(id),300,600); });
    $(id).addEventListener('compositionend',() => { cancelPendingFile(); invalidateImport(); clearImportError(); if (id === 'import-text') grow($(id),300,600); });
  });
  const previewImport = () => {
    clearImportError(); invalidateImport(); if (fileBusy) { importError('文件正在读取，请稍候。'); return; }
    if(window.desktopStore && $('import-target').value==='writing' && !window.workbench.books.bookInfo(activeWritingBook().id)){importError('请先创建或打开一部作品，再导入正文。');return;}
    if (!$('import-title').value.trim()) { importError('请填写稿件名称。',$('import-title')); return; }
    if (!$('import-text').value.trim()) { importError('请选择文件或粘贴稿件正文。',$('import-text')); return; }
    if (new TextEncoder().encode($('import-text').value).length > ($('import-target').value === 'reading' ? 20 : 2) * 1024 * 1024) { importError('内容超过当前导入上限：阅读稿 20 MiB，写作稿 2 MiB。请分批导入。',$('import-text')); return; }
    const chapters = window.parsePreviewManuscript($('import-text').value); if (chapters.length > ($('import-target').value === 'reading' ? 2000 : 200)) { importError('章节超过当前上限：阅读稿 2000 章，写作稿 200 章。请分批导入。',$('import-text')); return; }
    importPlan = {title:$('import-title').value.trim(),chapters,target:$('import-target').value,bookId:activeWritingBook()?.id};
    chapters.forEach((chapter) => { const item = document.createElement('li'); item.textContent = chapter.title + ' · ' + count(chapter.body) + ' 字'; $('import-chapter-list').append(item); });
    $('import-status').textContent = importPlan.title + ' · ' + chapters.length + ' 章 · ' + count(chapters.map((chapter) => chapter.body).join('')) + ' 字。确认后添加到所选位置；阅读稿保存在本机，写作稿为本页预览。'; $('import-commit').disabled = false;
  };
  $('manuscript-form').addEventListener('submit',(event) => { event.preventDefault(); previewImport(); });
  $('import-target').addEventListener('change',() => { cancelPendingFile(); invalidateImport(); $('import-commit').textContent = $('import-target').value === 'reading' ? '确认添加阅读稿' : '确认追加章节'; });
  $('import-sample').addEventListener('click',() => { importVersion++; fileBusy = false; $('import-preview').disabled = false; $('manuscript-file').value = ''; $('import-title').value = '青山新篇 · 示例'; $('import-text').value = '第一章 渡口的约定\n张三在渡口等到黄昏，终于看见那把旧伞。\n\n第二章 归来的信\n林逸把信交给张三，决定先听完故乡的消息。'; invalidateImport(); clearImportError(); grow($('import-text'),300,600); });
  $('manuscript-file').addEventListener('change',async () => {
    const version = ++importVersion, file = $('manuscript-file').files[0]; fileBusy = false; $('import-preview').disabled = false; invalidateImport(); clearImportError(); if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { importError('只支持 TXT 或 Markdown 文件。',$('manuscript-file')); return; }
    if (file.size === 0 || file.size > ($('import-target').value === 'reading' ? 20 : 2) * 1024 * 1024) { importError(file.size === 0 ? '文件为空，请选择有正文的文件。' : '文件超过导入上限：阅读稿 20 MiB，写作稿 2 MiB。',$('manuscript-file')); return; }
    fileBusy = true; $('import-preview').disabled = true; $('import-status').textContent = '正在读取「' + file.name + '」…';
    try {
      const buffer = await file.arrayBuffer(); if (version !== importVersion) return;
      const text = new TextDecoder($('import-encoding').value,{fatal:true}).decode(buffer);
      $('import-text').value = text; if (!$('import-title').value.trim()) $('import-title').value = file.name.replace(/\.(txt|md)$/i,'').slice(0,80); grow($('import-text'),300,600);
      $('import-status').textContent = '已读取「' + file.name + '」。请预览章节拆分后再确认。';
    } catch { if (version === importVersion) { $('import-status').textContent='文件未载入，请选择正确编码后重试。'; importError('文件读取失败或编码不匹配，请切换 UTF-8 / GBK 编码后重新选择文件。',$('manuscript-file')); } }
    finally { if (version === importVersion) { fileBusy = false; $('import-preview').disabled = false; } }
  });
  $('import-file-clear').addEventListener('click',() => { importVersion++; fileBusy = false; $('manuscript-file').value = ''; $('import-preview').disabled = false; invalidateImport(); clearImportError(); $('import-status').textContent = '已清除所选文件，已载入的正文仍保留在输入框。'; });
  $('import-encoding').addEventListener('change',()=>{cancelPendingFile();invalidateImport();$('manuscript-file').value='';$('import-status').textContent='编码已切换，请重新选择文件。';});
  $('import-commit').addEventListener('click',async () => {
    if (!importPlan || fileBusy) return; const plan = importPlan; importPlan = null; $('import-commit').disabled = true;
    if(window.desktopStore && plan.target==='writing' && (plan.bookId!==activeWritingBook()?.id || !window.workbench.books.bookInfo(plan.bookId))){importError('当前作品已变化，请重新预览后导入。');return;}
    clearTimeout(noteTimer);
    const importControls=[...$('manuscript-form').querySelectorAll('input,select,textarea,button')]; importControls.forEach(input=>input.disabled=true);
    try {
    if ($('import-target').value === 'reading') {
      const book = {id:'reading-'+crypto.randomUUID(),title:plan.title,chapters:plan.chapters,notes:{structure:'',characters:'',style:'',excerpts:''},reports:[]};
      readingBooks.push(book);
      try { await saveReading(); readingId=book.id; readingChapter=0; switchView('library'); showReader(); notice('已将「'+plan.title+'」的 '+plan.chapters.length+' 章保存在本机阅读书架。'); }
      catch(error) { readingBooks.splice(readingBooks.indexOf(book),1); importPlan=plan; $('import-commit').disabled=false; importError(error.message); return; }
    }
    else { appendWritingChapters(plan.chapters); switchView('editor'); notice('已追加 ' + plan.chapters.length + ' 个本页章节，原有章节保留。刷新后恢复示例。'); }
    $('import-status').textContent = '本次稿件已经添加。若要再次导入，请重新预览。';
    } finally {importControls.forEach(input=>input.disabled=false);$('import-commit').disabled=!importPlan;}
  });
  const exportData = () => { const chapters = getWritingChapters().filter((chapter) => selectedExport.has(chapter.id)); const format = $('export-format').value; return {chapters,format,text:window.serializePreviewChapters(primaryTitle(),chapters,format)}; };
  let exportUrl = null, exportFilename = '';
  const renderExportPreview = () => {
    const {chapters,format,text} = exportData(); $('export-text').textContent = chapters.length ? text : '选择章节后，这里显示将要导出的正文。'; $('export-status').textContent = chapters.length + ' 章 · ' + count(chapters.map((chapter) => chapter.body).join('')) + ' 字 · ' + format.toUpperCase(); $('export-error').textContent = '';
    if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = null;
    const link = $('export-download'); link.removeAttribute('href'); link.removeAttribute('download'); link.setAttribute('aria-disabled',String(!chapters.length));
    if (chapters.length) {
      const title = primaryTitle().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,60) || '作品'; exportFilename = title + '-预览稿件.' + format;
      exportUrl = URL.createObjectURL(new Blob(['\uFEFF' + text],{type:format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'})); link.href = exportUrl; link.download = exportFilename;
    }
  };
  const renderExport = () => {
    const chapters = getWritingChapters(); if (!exportInitialized) { chapters.forEach((chapter) => selectedExport.add(chapter.id)); exportInitialized = true; }
    $('export-chapters').replaceChildren(); chapters.forEach((chapter) => { const label = document.createElement('label'),input = document.createElement('input'),text = document.createElement('span'); input.type = 'checkbox'; input.dataset.exportChapter = chapter.id; input.checked = selectedExport.has(chapter.id); text.textContent = chapter.title + ' · ' + count(chapter.body) + ' 字'; label.append(input,text); input.addEventListener('change',() => { if (input.checked) selectedExport.add(chapter.id); else selectedExport.delete(chapter.id); renderExportPreview(); }); $('export-chapters').append(label); }); renderExportPreview();
  };
  const setTransferTab = (tab) => { $('manuscript-form').hidden = tab !== 'import'; $('export-panel').hidden = tab !== 'export'; document.querySelectorAll('[data-transfer-tab]').forEach((button) => button.setAttribute('aria-pressed',String(button.dataset.transferTab === tab))); if (tab === 'export') renderExport(); else grow($('import-text'),300,600); };
  document.querySelectorAll('[data-transfer-tab]').forEach((button) => button.addEventListener('click',() => setTransferTab(button.dataset.transferTab)));
  const openImport = (target = 'writing') => { switchView('transfer'); setTransferTab('import'); $('import-target').value = target; $('import-target').dispatchEvent(new Event('change')); };
  $('reader-import-txt').addEventListener('click',()=>{openImport('reading');$('manuscript-file').focus();});
  $('reader-import-paste').addEventListener('click',()=>{openImport('reading');$('import-text').focus();});
  $('import-demo').addEventListener('click',() => openImport()); $('new-library').addEventListener('preview-reading-import',() => openImport('reading'));
  $('export-all').addEventListener('click',() => { getWritingChapters().forEach((chapter) => selectedExport.add(chapter.id)); renderExport(); }); $('export-none').addEventListener('click',() => { selectedExport.clear(); renderExport(); });
  $('export-format').addEventListener('change',renderExportPreview);
  $('export-download').addEventListener('click',(event) => {
    renderExportPreview(); // Capture the latest edited body, rather than the previously displayed blob.
    const {chapters} = exportData(); if (!chapters.length || !exportUrl) { event.preventDefault(); $('export-error').textContent = '至少选择一个章节再导出。'; $('export-all').focus(); return; }
    notice('已发起「' + exportFilename + '」的下载，包含 ' + chapters.length + ' 个本页章节。');
  });
  window.addEventListener('pagehide',() => { if (exportUrl) URL.revokeObjectURL(exportUrl); });
  renderCards(); renderReader();
  return {
    removeBook(id){cardsByBook.delete(id);if(cardsBookId===id){cardsBookId='__empty__';cards.plot=[];cards.scene=[];selectedCard=null;}},
    getReadingContext() {
      const book = currentReading(), chapter = book.chapters[readingChapter], selection = window.getSelection();
      const selected = selection?.anchorNode && $('reader-body').contains(selection.anchorNode) ? selection.toString() : '';
      return {id:book.id,title:book.title,chapter:readingChapter,chapterTitle:chapter.title,text:chapter.body,selected,chapters:JSON.parse(JSON.stringify(book.chapters)),notes:{...book.notes},reports:JSON.parse(JSON.stringify(book.reports||[]))};
    },
    async applyAINote(context,dimension,text,operation='passage',input={}) {
      clearTimeout(noteTimer);
      const book=readingBooks.find(item=>item.id===context.id); if(!book)throw new Error('来源阅读稿不存在，请重新打开分析。');
      const before=book.notes[dimension], after=before ? before+'\n\n'+text : text;
      const report={id:crypto.randomUUID(),title:operation==='bookAnalysis'?'整书分析（按所选章节采样）':'片段拆解',source:operation==='bookAnalysis'?(input.range||'前三章')+' · 结论仅覆盖样本':'输入片段 · 打开时章节：'+context.chapterTitle,createdAt:Date.now(),text,input:{...input},mode:'local-demo'};
      book.reports ||= []; book.reports.push(report); book.notes[dimension]=after;
      try { await saveReading(); } catch(error) {book.reports.splice(book.reports.indexOf(report),1); if(book.notes[dimension]===after)book.notes[dimension]=before;throw error;}
      readingId=context.id; readingChapter=context.chapter;noteTab=dimension;showReader();
      return async()=>{if(book.notes[dimension]!==after)return false;book.notes[dimension]=before;book.reports=book.reports.filter(item=>item.id!==report.id);try{await saveReading();}catch(error){book.notes[dimension]=after;book.reports.push(report);throw error;}showReader();return true;};
    },
    async removeMergedReadingMaterials(ids) {
      const wanted=new Set(ids),before=[...readingMaterials];
      if(!before.some(item=>wanted.has(item.id)))return {canUndo:()=>true,undo:async()=>true};
      readingMaterials=before.filter(item=>!wanted.has(item.id));
      try{await saveReading();}catch(error){readingMaterials=before;throw error;}
      const after=JSON.stringify(readingMaterials);
      return {canUndo:()=>JSON.stringify(readingMaterials)===after,undo:async()=>{if(JSON.stringify(readingMaterials)!==after)return false;const current=readingMaterials;readingMaterials=before;try{await saveReading();}catch(error){readingMaterials=current;throw error;}return true;}};
    },
    async applyAITips(context,chosen) {
      clearTimeout(noteTimer);
      const added=chosen.map(item=>({...item,id:'reading-material-'+crypto.randomUUID(),kind:'写作技巧',readingSource:{bookId:context.id,bookTitle:context.title,dimension:'tips',chapter:context.chapter},fields:[...(item.fields||[]),['来源',context.title],['用途','正文生成、续写、润色、扩写时勾选使用']]}));
      readingMaterials.push(...added); try{await saveReading();}catch(error){readingMaterials=readingMaterials.filter(item=>!added.includes(item));throw error;}
      return async()=>{const before=[...readingMaterials];readingMaterials=readingMaterials.filter(item=>!added.includes(item));try{await saveReading();}catch(error){readingMaterials=before;throw error;}return true;};
    },
    onView(view) { if (view === 'cards') renderCards(); if (view === 'transfer' && !$('export-panel').hidden) renderExport(); if (view === 'library' && !$('reader-shell').hidden) renderReader(); },
    searchDocuments() {
      const documents = [];
      Object.entries(cards).forEach(([tab,items]) => items.forEach((card) => documents.push({id:'card:' + card.id,type:tab === 'plot' ? 'plots' : 'scenes',view:'cards',title:card.title,path:primaryTitle() + ' / ' + (tab === 'plot' ? '剧情卡' : '场景卡') + ' / ' + card.title,target:card.id,group:tab,fields:[{label:'标题',key:'title',text:card.title},{label:'描述',key:'description',text:card.description},{label:'标签',key:'tags',text:card.tags.join(' · ')},...(tab === 'scene' ? [{label:'氛围',key:'atmosphere',text:card.atmosphere}] : [])]})));
      readingBooks.forEach((book) => {
        documents.push({id:'reading-book:' + book.id,type:'reading',view:'library',title:book.title,path:'书库 / 阅读与拆书 / ' + book.title,target:book.id,fields:[{label:'阅读稿名称',key:'book',text:book.title}]});
        book.chapters.forEach((chapter,index) => documents.push({id:'reading:' + book.id + ':' + index,type:'reading',view:'library',title:book.title + ' · ' + chapter.title,path:'书库 / 阅读与拆书 / ' + book.title + ' / ' + chapter.title,target:book.id,chapter:index,fields:[{label:'章节标题',key:'title',text:chapter.title},{label:'阅读正文',key:'body',text:chapter.body}]}));
        (book.reports||[]).forEach(item=>documents.push({id:'report:'+item.id,type:'reading',view:'library',title:book.title+' · '+item.title,path:'书库 / 阅读与拆书 / '+book.title+' / 分析记录',target:book.id,report:item.id,fields:[{label:'分析记录',key:'report',text:item.text}]}));
        Object.entries(book.notes).forEach(([key,text]) => documents.push({id:'note:' + book.id + ':' + key,type:'reading',view:'library',title:book.title + ' · ' + noteLabels[key] + '笔记',path:'书库 / 阅读与拆书 / ' + book.title + ' / ' + noteLabels[key] + '笔记',target:book.id,note:key,fields:[{label:'拆书笔记',key:'note',text}]}));
      }); return documents;
    },
    openSearchTarget(result) {
      if (result.view === 'cards') { setCardTab(result.group); selectedCard = result.target; cardPage = Math.floor(cards[cardTab].findIndex((card) => card.id === selectedCard) / cardPageSize) + 1; renderCards(); if (result.field.key === 'tags') return $('story-card-fields').querySelectorAll('dd')[cardTab === 'scene' ? 1 : 0]; if (result.field.key === 'atmosphere') return $('story-card-fields').querySelector('dd'); return $('story-card-' + result.field.key); }
      readingId = result.target; if (result.chapter !== undefined) readingChapter = result.chapter; if (result.note) noteTab = result.note; showReader(); if(result.report){const report=[...$('reader-reports').children].find(item=>item.querySelector('p')?.textContent===result.field.text);if(report){report.open=true;return report.querySelector('p');}} return result.note ? $('reader-note') : $(result.field.key === 'book' ? 'reader-position' : result.field.key === 'title' ? 'reader-title' : 'reader-body');
    }
  };
};
