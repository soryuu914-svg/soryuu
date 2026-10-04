from pathlib import Path
root=Path(__file__).resolve().parents[2]
def edit(name,old,new):
    p=root/'docs/redesign'/name
    s=p.read_text(encoding='utf-8')
    if new in s:return
    if old not in s:raise Exception(name+' missing '+old[:100])
    p.write_text(s.replace(old,new),encoding='utf-8')
edit('preview-books.js',"{ideas:[],golden:[]}","{ideas:[],golden:[],ideaArchive:[],goldenArchive:{}}")
edit('preview-books.js',"state.ideaArchive = state.ideas.slice(1); state.ideas = state.ideas.slice(0,1); state.goldenArchive = {};", "state.ideaArchive ||= state.ideas.slice(1); state.ideas = state.ideas.slice(0,1); state.goldenArchive ||= {};")
edit('preview-books.js',"const book = books.find(item => item.id === selectedBookId), state = homeState(book.id);", "const book = books.find(item => item.id === selectedBookId); if(!book)return; const state = homeState(book.id);")
edit('preview-books.js',"$('book-home-writing').hidden = book.id !== 'main';", "$('book-home-writing').hidden = !window.desktopStore && book.id !== 'main';")
edit('preview-books.js',"openBookHome('main'))", "openBookHome(window.desktopStore ? selectedBookId : 'main'))")
edit('preview-books.js',"id:window.desktopStore && !books.length ? 'main' : 'book-' + nextId++", "id:window.desktopStore ? 'book-' + crypto.randomUUID() : 'book-' + nextId++")
edit('preview-books.js',"filterBooks(); renderHome();", "if(window.desktopStore)document.querySelector('.continue-card')?.toggleAttribute('hidden',!books.length); filterBooks(); renderHome();")
edit('ios26-preview.html',"const bindChapter = (button) => { button.querySelector('span')", "const bindChapter = (button) => { if(!chapters[button.dataset.chapter])return; button.querySelector('span')")
edit('ios26-preview.html',"const rememberDraft = () => { chapters[currentChapterId].paragraphs", "const rememberDraft = () => { if(!chapters[currentChapterId])return; chapters[currentChapterId].paragraphs")
edit('ios26-preview.html',"if(window.desktopStore){const saved=window.desktopStore.get('writing');(saved?.books", "if(window.desktopStore){const saved=window.desktopStore.get('writing');writingBookId=saved?.activeBookId || 'main';(saved?.books")
edit('ios26-preview.html',"writingBooks.get('main')", "writingBooks.get(writingBookId)")
edit('ios26-preview.html',"removeChapter(){", "deleteBookWriting(id){writingBooks.delete(id);if(writingBookId===id){Object.keys(chapters).forEach(key=>delete chapters[key]);writingBookId='__empty__';currentChapterId='1';$('chapter-input').value='';$('chapter-title').value='';}},\n          removeChapter(){")
edit('preview-pages.js',"let generatedRecordId = 1;", "let generatedRecordId = window.desktopStore?.get('pages')?.generatedRecordId || 1;")
edit('preview-pages.js',"templates:templateStore.snapshot(),nextCardId}", "templates:templateStore.snapshot(),nextCardId,generatedRecordId}")
edit('preview-pages.js',"const templateRecord = item =>", "let templateVersion='latest';\n  const templateRecord = item =>")
edit('preview-pages.js',"templateStore.list('characters')", "templateStore.list('characters',templateVersion)")
edit('preview-pages.js',"templateStore.list('world')", "templateStore.list('world',templateVersion)")
edit('preview-pages.js',"['同步状态',item.linked ?", "['资料版本',item.version==='initial' ? (item.initialOrigin==='first-recoverable' ? '首次可恢复模板（原始版本已不可追溯）' : '初始模板 · 独立保留') : '书内最新版本'],['同步状态',item.version==='initial' ? '独立保留 · 不被后续修改覆盖' : item.linked ?")
edit('preview-pages.js',"activeBookId:()=>activeBook.id,", "activeBookId:()=>activeBook.id,\n    setTemplateVersion(value){templateVersion=value==='initial'?'initial':'latest';refreshTemplates();renderCollection('library');},")
edit('preview-pages.js',"removeBook(id){", "removeBook(id){if(activeBook.id===id){people=[];collections.world.groups={地理:[],势力:[],修行:[],物品:[]};collections.outline.groups={大纲:[],章节细纲:[],伏笔:[]};activeBook={id:'__empty__',name:'未选择作品'};}")
edit('preview-pages.js',"view === 'world' ? [] : item.fields || []", "view === 'world' ? [] : item.fields || []")
edit('preview-pages.js',"item.kind || 'AI 示例'", "item.kind || (window.desktopStore ? (view==='world'?'其他':'AI 生成') : 'AI 示例')")
edit('preview-ai.js',"let operation,context,trigger,results", "let requestId; let operation,context,trigger,results")
edit('preview-ai.js',"const stop = () => { token++;", "const stop = () => { if(requestId){window.desktop?.cancel(requestId);requestId=null;} token++;")
edit('preview-ai.js',"if (spec.view === 'editor') context.bookHome = books.bookInfo('main');", "if (spec.view === 'editor') context.bookHome = window.desktopStore ? books.currentBookContext() : books.bookInfo('main');")
edit('preview-ai.js',"pages.getForeshadowing('main')", "pages.getForeshadowing(window.desktopStore ? context.bookHome.id : 'main')")
edit('preview-ai.js',"pages.prepareForeshadowing('main',choices", "pages.prepareForeshadowing(window.desktopStore ? context.bookHome.id : 'main',choices")
edit('preview-ai.js',"context.bookHome.id === 'main') values.protagonist", "!window.desktopStore && context.bookHome.id === 'main') values.protagonist")
edit('preview-ai.js',"if (operation === 'test' && !validateConfig())", "if (operation === 'test' && !window.desktop && !validateConfig())")
edit('preview-ai.js',"form.addEventListener('submit',event => {", "form.addEventListener('submit',async event => {")
edit('preview-ai.js',"      timer = setTimeout(() => { if (version !== token", """      if(window.desktop){
        requestId=crypto.randomUUID(); const currentRequest=requestId;
        context.values=values;context.structureNodes=structures[values.structure] || [];
        if(context.bookHome)context.golden=context.bookHome.golden;
        if(operation==='book'){const premise=books.getInspirations()[0];if(premise)values.inspiration=premise.summary;}
        if(operation==='bookAnalysis'){
          const chapters=context.reading.chapters.filter(c=>c.body.trim());
          const sample=values.range==='均匀采样十章'?Array.from({length:Math.min(10,chapters.length)},(_,i)=>chapters[Math.round(i*(chapters.length-1)/Math.max(1,Math.min(10,chapters.length)-1))]):chapters.slice(0,values.range==='前三章'?3:10);
          context.reading={...context.reading,chapters:sample,totalChapters:chapters.length,coverage:sample.length};
        }
        $('ai-workflow-status').textContent='正在生成并核对，请稍候…';
        try{results=await window.desktop.generate({requestId:currentRequest,operation,values,context:JSON.parse(JSON.stringify(context))});if(version!==token || !dialog.open)return;selected=new Set(['outline','rewriteVolumes','rewriteChapters','volumeChapters'].includes(operation)?results.map((_,i)=>i):[0]);renderResults();$('ai-workflow-generate').textContent='重新生成';$('ai-workflow-status').textContent=results.length+' 个候选 · 尚未采用';}
        catch(error){if(version===token){$('ai-workflow-error').textContent=error.message;$('ai-workflow-status').textContent='未写入任何内容，条件保留。';}}
        finally{if(version===token){requestId=null;setBusy(false);}}
        return;
      }
      timer = setTimeout(() => { if (version !== token""")
edit('preview-ai.js',"      const v = context.values, operationView", "      if(window.desktop && context.bookHome && context.bookHome.id!==books.currentBookContext().id)throw new Error('当前作品已切换，请重新打开生成。');\n      const v = context.values, operationView")
edit('preview-ai.js',"const outcome = await adopt(chosen); undo", "const outcome = await adopt(chosen); window.workbench?.syncOutline();window.desktopStore?.changed(); undo")
edit('preview-ai.js',"undo = null; $('ai-undo-bar').hidden = true; notice", "undo = null; window.desktopStore?.changed();$('ai-undo-bar').hidden = true; notice")
edit('preview-ai.js',"if (validateConfig()) notice", "if (!window.desktop && validateConfig()) notice")
edit('preview-ai.js',"const practiceReports = new Map();", "const practiceReports = new Map(window.desktopStore?.get('aiReports') || []);window.desktopStore?.register('aiReports',()=>[...practiceReports]);")
edit('preview-ai.js',"quality.review([results[index]],context.values); };", "quality.review([results[index]],context.values);if(window.desktop){const review=results[index].semanticReview;$('ai-workflow-status').textContent=review ? ({pass:'已通过独立核对，请作者最终确认',issues:'发现待修订问题',uncertain:'存在无法确认的内容，请核对'}[review.status])+(review.issues.length?'：'+review.issues.map(x=>x.reason).join('；'):''):'候选已生成，请核对后采用';} };")
edit('preview-ai.js',"if (!quality.canAdopt(chosen,context.values))", "if(window.desktop && chosen.some(item=>item.semanticReview?.status==='issues')){$('ai-workflow-error').textContent='语义审核仍有问题，请重新生成或手动修订后再次核对。';return;}\n      if (!quality.canAdopt(chosen,context.values))")
edit('preview-progression.js',"if (book.id !== 'main') return [];", "if (!window.desktop && book.id !== 'main') return [];")
edit('preview-progression.js',"addEventListener('submit',event =>", "addEventListener('submit',async event =>")
edit('preview-progression.js',"snapshot = pages.getProgressionSnapshot(book.id); suggestions = window.previewProgression.suggest(snapshot.cards,body);", """snapshot = pages.getProgressionSnapshot(book.id);
    if(window.desktop){const version=JSON.stringify({book:book.id,chapter,title,body,stage:$('progression-stage').value});const submit=$('progression-form').querySelector('[type=submit]');submit.disabled=true;$('progression-status').textContent='正在提取并核对变化…';try{const result=await window.desktop.generate({requestId:crypto.randomUUID(),operation:'progression',values:{source:body,stage:$('progression-stage').value},context:{cards:snapshot.cards,chapter}});if(!dialog.open || version!==JSON.stringify({book:book.id,chapter:Number($('progression-chapter').value),title:$('progression-title').value.trim(),body:$('progression-body').value.trim(),stage:$('progression-stage').value}))return;if(result[0].semanticReview?.status==='issues')throw new Error('变化核对发现问题，请调整依据后重试。');suggestions=result[0].changes;}catch(error){$('progression-error').textContent=error.message;return;}finally{submit.disabled=false;}}
    else suggestions = window.previewProgression.suggest(snapshot.cards,body);""")
edit('preview-progression.js',"notice($('progression-status').textContent + ' 刷新恢复示例。');", "window.desktopStore?.changed();notice($('progression-status').textContent + (window.desktop ? '' : ' 刷新恢复示例。'));")
edit('preview-progression.js',"view === 'editor' ? books.bookInfo('main') : books.currentBookContext()", "view === 'editor' && !window.desktop ? books.bookInfo('main') : books.currentBookContext()")
print('Desktop integration connected')
edit('preview-practice.js',"const input = e.analysis.input; e.analysis = analyze(e);", "const input = e.analysis.input, previous=e.analysis; e.analysis = analyze(e);if(previous.mode==='model-analysis-v1'){e.analysis={...previous,metrics:e.analysis.metrics,claims:previous.claims.filter(c=>Array.isArray(c.evidence)&&c.evidence.every(q=>e.body.includes(q)))};}")
edit('preview-practice.js',"$('practice-analyze').addEventListener('click',() => {", "$('practice-analyze').addEventListener('click',async () => {")
edit('preview-practice.js',"const analysis = model.analyze(e,state.entries), next", """let analysis = model.analyze(e,state.entries);
      if(window.desktop){$('practice-analyze').disabled=true;$('practice-status').textContent='正在分析这一版正文并独立核对…';try{const result=await window.desktop.generate({requestId:crypto.randomUUID(),operation:'practice',values:{source:e.body,topic:e.prompt},context:{genre:e.genre,task:e.task,corrections:analysis.input.corrections}});if(saved()?.id!==e.id || saved()?.version!==e.version || dirty())throw new Error('正文或当前练习已变化，请重新分析。');if(result[0].semanticReview.status==='issues')throw new Error('AI 核对发现分析问题，请重新分析。');analysis={...analysis,mode:'model-analysis-v1',claims:[...analysis.claims,...result[0].claims.filter(c=>!analysis.claims.some(x=>x.id===c.id))],semanticReview:result[0].semanticReview,report:result[0].summary};}finally{$('practice-analyze').disabled=false;}}
      const next""")
edit('preview-practice.js',"$('practice-topics').addEventListener('click',() => {", "$('practice-topics').addEventListener('click',async () => {")
edit('preview-practice.js',"list.replaceChildren(); topics[genre].forEach((text,i) =>", """list.replaceChildren();let topicList=topics[genre];
    if(window.desktop){$('practice-topics').disabled=true;try{const result=await window.desktop.generate({requestId:crypto.randomUUID(),operation:'prompt',values:{genre,direction:task,count:3},context:{}});topicList=result.map(c=>c.summary);}catch(ex){error(ex.message);return;}finally{$('practice-topics').disabled=false;}}
    topicList.forEach((text,i) =>""")
edit('preview-practice.js',"prompt:text + tasks[task]", "prompt:window.desktop ? text : text + tasks[task]")
edit('preview-practice.js',"  return {styleContext:genre=>model.styleContext(state.entries,state.profileReviews,genre),", """  return {
    applyPrompt(prompt){if(dirty())throw new Error('先保存当前练习，再采用新题目。');const before=draft();setDraft({...before,prompt,body:''});persistDraft();return ()=>{if(draft().prompt!==prompt)return false;setDraft(before);persistDraft();return true;};},
    acceptedAnalysis(){return state.entries.filter(e=>e.analysis?.version===e.version).map(e=>({id:e.id,version:e.version,genre:e.genre,task:e.task,body:e.body,claims:e.analysis.claims.filter(c=>['accept','correct'].includes(e.feedback?.[c.id]?.choice)).map(c=>({...c,author:e.feedback[c.id]}))})).filter(e=>e.claims.length);},
    styleContext:genre=>model.styleContext(state.entries,state.profileReviews,genre),""")
edit('preview-ai.js',"if (operation === 'prompt') { switchView('ideas');", "if (operation === 'prompt' && window.desktop)return {undo:window.previewPracticeController.applyPrompt(chosen[0].summary)};\n      if (operation === 'prompt') { switchView('ideas');")
edit('preview-ai.js',"if (id === 'style') { values.analysis", "if (id === 'style') { values.analysis")
edit('preview-ai.js',"      if (id === 'test') values.source = '';", "      if(window.desktop && id==='style'){values.analysis=JSON.stringify(window.previewPracticeController.acceptedAnalysis());if(values.analysis==='[]'){notice('先分析并人工核对自己的练习，再提炼个人文风。');return;}}\n      if (id === 'test') values.source = '';")
edit('preview-pages.js',"    openDialog(button,'新建示例条目'", "    if(window.desktop && window.desktopEditMaterial){window.desktopEditMaterial(view,state.active,null,button);return;}\n    openDialog(button,'新建示例条目'")
edit('preview-pages.js',"    if (item) openDialog(button,'修改示例条目名称'", "    if(window.desktop && item && window.desktopEditMaterial){window.desktopEditMaterial(view,state.active,item,button);return;}\n    if (item) openDialog(button,'修改示例条目名称'")
edit('preview-pages.js',"activeBookId:()=>activeBook.id,", "activeBookId:()=>activeBook.id,")
edit('preview-pages.js',"    setTemplateVersion(value)", "    saveMaterial(view,group,item){const state=collections[view];state.groups[group] ||= [];const index=state.groups[group].findIndex(c=>c.id===item.id);if(index<0)state.groups[group].unshift(item);else state.groups[group][index]=item;state.active=group;state.selected=item.id;renderCollection(view);},\n    removeMaterial(view,group,id){const state=collections[view];state.groups[group]=state.groups[group].filter(c=>c.id!==id);state.selected=null;renderCollection(view);},\n    setTemplateVersion(value)")
