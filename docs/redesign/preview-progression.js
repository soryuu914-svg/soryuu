/* Chapter-aware setting updates for the disposable preview; no model requests. */
window.previewProgression = {
  context(card, chapter = Infinity) {
    const events = (card.stateHistory || []).filter(event => event.stage === 'actual' && event.chapter <= chapter);
    const latest = events.sort((a,b) => b.chapter - a.chapter || b.sequence - a.sequence)[0];
    return {currentState:latest?.after || card.summary || '',stateAsOf:latest ? {chapter:latest.chapter,title:latest.title} : null,
      plannedState:card.plannedState || '',plannedAsOf:card.plannedAsOf || null};
  },
  fields(card) {
    const current = this.context(card), fields = [];
    if (current.stateAsOf) fields.push(['初始设定',card.summary || '未填写'],['当前状态 · 已发生（第' + current.stateAsOf.chapter + '章）',current.currentState]);
    if (current.plannedState) fields.push(['章纲计划 · 不作为当前事实（第' + current.plannedAsOf.chapter + '章）',current.plannedState]);
    if (card.stateHistory?.length) fields.push(['剧情变化记录',card.stateHistory.slice().reverse().map(event => (event.stage === 'actual' ? '已发生' : '计划中') + ' · 第' + event.chapter + '章「' + event.title + '」\n更新前：' + (event.before || '尚无记录') + '\n更新后：' + event.after + '\n依据：' + event.evidence).join('\n\n')]);
    return fields;
  },
  suggest(cards, text) {
    const sentences = text.match(/[^。！？\n]+[。！？]?/g) || [];
    return cards.flatMap(item => {
      const evidence = sentences.filter(line => line.includes(item.card.name || item.card.title)).slice(0,6).join('\n');
      return evidence ? [{type:item.type,id:item.card.id,name:item.card.name || item.card.title,before:JSON.stringify(item.card),evidence,value:evidence}] : [];
    });
  },
  update(card, change) {
    if (!['actual','planned'].includes(change.stage) || !Number.isInteger(change.chapter) || change.chapter < 1 || !change.value.trim() || !change.evidence.trim()) throw new Error('请填写正确的章节、状态和依据。');
    const current = this.context(card);
    if (change.stage === 'actual' && current.stateAsOf && change.chapter < current.stateAsOf.chapter) throw new Error('旧章节不能覆盖较新章节的当前状态；请重新选择更新章节。');
    const before = change.stage === 'actual' ? current.currentState : card.plannedState || '';
    if (before === change.value.trim()) return JSON.parse(JSON.stringify(card));
    const history = [...(card.stateHistory || []),{stage:change.stage,chapter:change.chapter,title:change.title,source:change.source,evidence:change.evidence,before,after:change.value.trim(),sequence:(card.stateHistory?.length || 0) + 1}];
    const result = {...card,stateHistory:history};
    if (change.stage === 'actual') { result.currentState = change.value.trim(); result.stateAsOf = {chapter:change.chapter,title:change.title}; }
    else { result.plannedState = change.value.trim(); result.plannedAsOf = {chapter:change.chapter,title:change.title}; }
    return result;
  }
};

window.createPreviewProgression = ({pages,books,getWritingChapters,getCurrentChapterId,notice}) => {
  const node = (tag,text,className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
  const dialog = node('dialog',null,'feature-dialog progression-dialog'); dialog.id = 'progression-dialog'; dialog.setAttribute('aria-labelledby','progression-heading');
  dialog.innerHTML = '<form id="progression-form" novalidate><h2 id="progression-heading">跟随剧情更新设定</h2><p id="progression-book"></p><p>正文记为已发生，章纲记为计划中；计划不会改变当前事实。当前为本地提取演示，请核对后确认，未调用 AI 服务。</p><label for="progression-stage">依据类型</label><select id="progression-stage"><option value="actual">正文 · 已发生</option><option value="planned">章纲 · 计划中</option></select><label for="progression-source">选择章节或章纲</label><select id="progression-source"></select><div class="progression-chapter-fields"><div><label for="progression-chapter">对应章节 *</label><input id="progression-chapter" type="number" min="1" step="1"></div><div><label for="progression-title">章节名称 *</label><input id="progression-title" maxlength="120"></div></div><label for="progression-body">依据内容 *</label><textarea id="progression-body" maxlength="30000" placeholder="可粘贴已写正文或章纲。仅检查本书中已经建立的卡片。"></textarea><div id="progression-error" class="field-error" role="alert"></div><div class="actions"><button type="submit" class="btn primary">检查变化</button><button type="button" class="btn" id="progression-close">关闭</button></div><section id="progression-results" hidden><h3>逐项核对更新建议</h3><p>默认不采用。相关句子可能包含回忆、否定或尚未发生的内容，请先修改为准确的状态，再勾选确认。</p><div id="progression-candidates"></div><button type="button" class="btn primary" id="progression-apply">确认同步选中项</button></section><p id="progression-status" role="status"></p></form>';
  document.body.append(dialog); const $ = id => document.getElementById(id); let book, trigger, sources = [], snapshot, suggestions = [], sourceSnapshot, manual = false, composing = false;
  const grow = input => { input.style.height = 'auto'; input.style.height = Math.min(350,Math.max(150,input.scrollHeight)) + 'px'; };
  const clear = () => { suggestions = []; $('progression-results').hidden = true; $('progression-error').textContent = ''; $('progression-status').textContent = ''; ['progression-chapter','progression-title','progression-body'].forEach(id => $(id).removeAttribute('aria-invalid')); };
  const collectSources = () => {
    if (!window.desktop && book.id !== 'main') return [];
    if ($('progression-stage').value === 'actual') return getWritingChapters().map(item => ({...item,number:Number(item.id)}));
    return pages.getAIContext('outline','章节细纲').items.map((item,index) => ({id:item.id,title:item.title,number:index + 1,body:item.summary + '\n' + item.fields.map(([key,value]) => key + '：' + value).join('\n')}));
  };
  const setSource = () => {
    clear(); manual = false; sources = collectSources(); const selected = sources.find(item => item.id === $('progression-source').value);
    sourceSnapshot = selected ? {...selected} : null; $('progression-chapter').value = selected?.number || ''; $('progression-title').value = selected?.title || ''; $('progression-body').value = selected?.body || ''; grow($('progression-body'));
  };
  const fillSources = () => {
    sources = collectSources(); $('progression-source').replaceChildren(); const own = node('option','粘贴本书内容'); own.value = ''; $('progression-source').append(own);
    sources.forEach(item => { const option = node('option',item.title); option.value = item.id; $('progression-source').append(option); });
    $('progression-source').value = $('progression-stage').value === 'actual' ? sources.find(item => item.id === getCurrentChapterId())?.id || '' : sources[0]?.id || ''; setSource();
  };
  $('progression-stage').addEventListener('change',fillSources); $('progression-source').addEventListener('change',setSource);
  ['progression-body','progression-chapter','progression-title'].forEach(id => { $(id).setAttribute('aria-describedby','progression-error'); $(id).addEventListener('input',event => { if (id === 'progression-body') grow($(id)); if (!event.isComposing) {manual = true; clear();} }); });
  $('progression-body').addEventListener('compositionend',() => { manual = true; clear(); });
  $('progression-form').addEventListener('compositionstart',() => { composing = true; }); $('progression-form').addEventListener('compositionend',() => { composing = false; });
  $('progression-close').addEventListener('click',() => dialog.close()); dialog.addEventListener('close',() => { if (trigger?.isConnected) trigger.focus(); });
  $('progression-form').addEventListener('submit',async event => {
    event.preventDefault(); if (composing) return; clear(); const chapter = Number($('progression-chapter').value), title = $('progression-title').value.trim(), body = $('progression-body').value.trim();
    const missing = !Number.isInteger(chapter) || chapter < 1 ? 'progression-chapter' : !title ? 'progression-title' : !body ? 'progression-body' : '';
    if (missing) { $('progression-error').textContent = '请填写章节序号、章节名称和依据内容。'; $(missing).setAttribute('aria-invalid','true'); $(missing).focus(); return; }
    snapshot = pages.getProgressionSnapshot(book.id);
    if(window.desktop){const version=JSON.stringify({book:book.id,chapter,title,body,stage:$('progression-stage').value});const submit=$('progression-form').querySelector('[type=submit]');submit.disabled=true;$('progression-status').textContent='正在提取并核对变化…';try{const result=await window.desktop.generate({requestId:crypto.randomUUID(),operation:'progression',values:{source:body,stage:$('progression-stage').value},context:{cards:snapshot.cards,chapter}});if(!dialog.open || version!==JSON.stringify({book:book.id,chapter:Number($('progression-chapter').value),title:$('progression-title').value.trim(),body:$('progression-body').value.trim(),stage:$('progression-stage').value}))return;if(result[0].semanticReview?.status==='issues')throw new Error('变化核对发现问题，请调整依据后重试。');suggestions=result[0].changes;}catch(error){$('progression-error').textContent=error.message;return;}finally{submit.disabled=false;}}
    else suggestions = window.previewProgression.suggest(snapshot.cards,body);
    const list = $('progression-candidates'); list.replaceChildren();
    suggestions.forEach((item,index) => {
      const card = snapshot.cards.find(entry => entry.type === item.type && entry.card.id === item.id).card, current = window.previewProgression.context(card), wrapper = node('article',null,'progression-candidate');
      const label = node('label',null,'progression-choice'), check = node('input'); check.type = 'checkbox'; check.id = 'progression-check-' + index; label.append(check,document.createTextNode('采用' + (item.type === 'characters' ? '人物' : '世界观') + '「' + item.name + '」的变化')); wrapper.append(label);
      wrapper.append(node('p','更新前：' + ($('progression-stage').value === 'actual' ? current.currentState : current.plannedState || '尚无计划')));
      const evidence = node('blockquote',item.evidence); wrapper.append(evidence); const caption = node('label','更新后（可修改）'); caption.htmlFor = 'progression-value-' + index; const input = node('textarea'); input.id = caption.htmlFor; input.value = item.value; input.maxLength = 5000; input.addEventListener('input',() => grow(input)); wrapper.append(caption,input); list.append(wrapper);
    });
    $('progression-results').hidden = !suggestions.length; list.querySelectorAll('textarea').forEach(grow); $('progression-status').textContent = suggestions.length ? '找到 ' + suggestions.length + ' 张相关卡片；核对并勾选后才会同步。' : '没有找到已有卡片的名称。可以补充明确名称后重试，或手动编辑卡片；不会猜测或创建新设定。';
  });
  $('progression-apply').addEventListener('click',() => {
    if (composing) return;
    const selected = suggestions.filter((item,index) => $('progression-check-' + index).checked).map(item => ({...item,value:$('progression-value-' + suggestions.indexOf(item)).value}));
    if (!selected.length) { $('progression-error').textContent = '请先勾选要同步的建议。'; return; }
    try {
      if (!manual && sourceSnapshot && collectSources().find(item => item.id === sourceSnapshot.id)?.body !== sourceSnapshot.body) throw new Error('依据内容已经改变，请重新检查变化。');
      const count = pages.applyProgression({bookId:book.id,stage:$('progression-stage').value,chapter:Number($('progression-chapter').value),title:$('progression-title').value.trim(),source:$('progression-stage').value === 'actual' ? '正文' : '章纲',items:selected});
      clear(); $('progression-status').textContent = '已同步 ' + count + ' 张卡片及资料库。' + ($('progression-stage').value === 'planned' ? '本次仅保存计划，当前状态未改变。' : '当前状态已更新，初始设定和变化记录仍保留。'); window.desktopStore?.changed();notice($('progression-status').textContent + (window.desktop ? '' : ' 刷新恢复示例。'));
    } catch(error) { $('progression-error').textContent = error.message; }
  });
  ['characters','world','outline','editor'].forEach(view => {
    const owner = view === 'editor' ? document.getElementById('ai-panel') : document.querySelector('#' + view + '-view .page-heading'); if (!owner) return;
    const button = node('button','跟随剧情更新','btn ai-action'); button.type = 'button'; owner.append(button); button.addEventListener('click',() => {trigger = button; book = view === 'editor' && !window.desktop ? books.bookInfo('main') : books.currentBookContext(); $('progression-book').textContent = '《' + book.name + '》 · 只更新这本书的卡片'; $('progression-stage').value = view === 'outline' ? 'planned' : 'actual'; fillSources(); dialog.showModal(); $('progression-stage').focus();});
  });
  return {dialog};
};
