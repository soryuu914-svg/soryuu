/* Local practice archive. Statistics are real; topics are local demonstrations, not model responses. */
window.previewPracticeModel = (() => {
  const count = text => Array.from(text.replace(/\s/g,'')).length;
  const median = values => { const v = [...values].sort((a,b) => a-b), i = Math.floor(v.length/2); return v.length ? v.length % 2 ? v[i] : (v[i-1]+v[i])/2 : 0; };
  const rules = [
    {id:'short',label:'较多使用短句',dimension:'句式与节奏',definition:'按本页规则，15字及以下为短句，占可统计句子的一半以上。',test:m => m.sentences >= 3 ? m.shortRatio >= .5 : null},
    {id:'dialogue',label:'对话内容占比较高',dimension:'对话特点',definition:'按本页规则，引号中的文字占正文四分之一以上；引号也可能是引用，须人工核对。',test:(m,e) => e.task === '人物对话' || m.quoteChars > 0 ? m.quoteRatio >= .25 : null},
    {id:'question',label:'使用疑问标点',dimension:'叙事习惯',definition:'正文中出现问号；仅说明表达形式，不代表擅长制造悬念。',test:m => m.questions > 0}
  ];
  function metrics(text) {
    const sentences = (text.match(/[^。！？!?\n]+[。！？!?]?/g) || []).map(s => s.trim()).filter(Boolean);
    const lengths = sentences.map(s => count(s.replace(/[。！？!?，,；;：“”「」『』"']/g,'')));
    const average = lengths.length ? lengths.reduce((sum,n)=>sum+n,0)/lengths.length : 0;
    const sentenceStd = lengths.length ? Math.sqrt(lengths.reduce((sum,n)=>sum+(n-average)**2,0)/lengths.length) : 0;
    const quoteChars = (text.match(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g) || []).reduce((n,s) => n + count(s.slice(1,-1)),0);
    return {words:count(text),sentences:sentences.length,medianSentence:median(lengths),sentenceStd,shortRatio:lengths.length ? lengths.filter(n => n <= 15).length / lengths.length : 0,quoteChars,quoteRatio:quoteChars / Math.max(1,count(text)),questions:(text.match(/[？?]/g)||[]).length,paragraphs:text.split(/\n+/).filter(p => p.trim()).length,lines:sentences};
  }
  function analysisInput(entry, entries = []) {
    const corrections = [];
    entries.filter(e => e.id !== entry.id).forEach(e => {
      [...(e.history || []),e].forEach(v => Object.entries(v.feedback || {}).forEach(([ruleId,f]) => {
        if (f.version !== v.version) return;
        const scope = f.scope || 'genre';
        corrections.push({sourceId:e.id,sourceVersion:v.version,sourcePrompt:v.prompt,genre:v.genre,task:v.task,ruleId,scope,choice:f.choice,original:v.analysis?.claims.find(c=>c.id===ruleId)?.label || ruleId,corrected:f.corrected || '作者删除该结论，不可将它自动认作个人文风。',note:f.note || ''});
      }));
    });
    // Last review of each source/rule wins; same-work versions are never held-out evidence.
    const latest = new Map(); corrections.forEach(c=>latest.set(c.sourceId + ':' + c.ruleId,c));
    return {mode:'input-preview-only',genre:entry.genre,task:entry.task,prompt:entry.prompt,body:entry.body,corrections:[...latest.values()].filter(c=>['correct','reject'].includes(c.choice) && (c.scope === 'common' || c.genre === entry.genre) && (c.scope !== 'task' || c.task === entry.task)).slice(-6),instruction:'先引用新正文证据，再核对历史纠正的适用范围。不要照抄档案；统计不能推断情绪、质量或AI来源。'};
  }
  function analyze(entry, entries = []) {
    const m = metrics(entry.body);
    const evidenceFor = rule => rule.id === 'short' ? m.lines.filter(s => count(s.replace(/[。！？!?，,；;：“”「」『』"']/g,'')) <= 15) : rule.id === 'dialogue' ? m.lines.filter(s => /[“「『"]/.test(s)) : m.lines.filter(s => /[？?]/.test(s));
    return {version:entry.version,mode:'local-statistics-v1',metrics:m,claims:rules.filter(rule => rule.test(m,entry) === true).map(rule => ({id:rule.id,label:rule.label,dimension:rule.dimension,definition:rule.definition,evidence:evidenceFor(rule).slice(0,3)})),input:analysisInput(entry,entries)};
  }
  const normalized = text => text.replace(/\s/g,'');
  function eligible(entries) {
    const seen = new Set(); return entries.filter(e => {
      if (count(e.body) < 100 || !e.analysis || e.analysis.version !== e.version) return false;
      const key = normalized(e.body); if (seen.has(key)) return false; seen.add(key); return true;
    });
  }
  function validate(entries, rule, genre) {
    const pool = eligible(entries).filter(e => !genre || e.genre === genre).map(e => ({e,result:rule.test(e.analysis.metrics,e)})).filter(x => x.result !== null);
    let proposed = 0, supported = 0, contradicted = 0;
    if (pool.length >= 4) pool.forEach((held,index) => {
      const train = pool.filter((_,i) => i !== index);
      if (train.filter(x => x.result).length / train.length >= 2/3) { proposed++; held.result ? supported++ : contradicted++; }
    });
    const genres = [...new Set(pool.map(x => x.e.genre))];
    const cross = genres.map(g => { const train = pool.filter(x => x.e.genre !== g), held = pool.filter(x => x.e.genre === g); return {genre:g,observable:held.length,proposed:train.length >= 3 && held.length >= 2 && train.filter(x => x.result).length / train.length >= 2/3,support:held.filter(x => x.result).length,against:held.filter(x => !x.result).length}; });
    const feedback = pool.flatMap(({e}) => { const f = e.feedback?.[rule.id]; return f?.version === e.version ? [f] : []; });
    const total = eligible(entries).filter(e => !genre || e.genre === genre).length;
    return {samples:pool.length,total,coverage:total ? pool.length/total : null,supportRate:proposed ? supported/proposed : null,proposed,supported,contradicted,genres,cross,accepted:feedback.filter(f => f.choice === 'accept').length,rejected:feedback.filter(f => f.choice === 'reject').length,corrected:feedback.filter(f => f.choice === 'correct').length,scoped:feedback.filter(f => f.choice === 'scope').length,unsure:feedback.filter(f => f.choice === 'unsure').length};
  }
  function profileSignature(entries,genre,ruleId) { return JSON.stringify({ruleId,genre,version:'rules-v1',sources:eligible(entries).filter(e=>!genre || e.genre===genre).map(e=>({id:e.id,version:e.version,body:e.body,genre:e.genre,task:e.task,feedback:e.feedback?.[ruleId] || null})).sort((a,b)=>a.id.localeCompare(b.id))}); }
  function styleContext(entries,reviews = {},genre) {
    return rules.flatMap(rule => [genre,null].filter((g,i,all)=>all.indexOf(g)===i).flatMap(g => {
      const review = reviews[(g || '*') + ':' + rule.id], v = validate(entries,rule,g);
      const cross = v.cross.filter(c=>c.proposed), stable = g ? v.proposed >= 3 && v.supported >= 3 && !v.contradicted : cross.length >= 2 && cross.every(c=>c.support>=2 && !c.against);
      if (!review || !['accept','correct'].includes(review.decision) || review.signature !== profileSignature(entries,g,rule.id) || !stable || v.rejected || v.corrected || (!g && v.scoped)) return [];
      return [{ruleId:rule.id,text:review.text,genre:g || '共同习惯',basis:'作者已审核；统计原候选已有样本支持，语义仍需真实AI复核'}];
    }));
  }
  function revise(previous, draft, id, now) {
    if (!draft.body.trim()) throw new Error('先写下练习正文，再保存。');
    if (!draft.prompt.trim()) throw new Error('请先选择或填写练习题目。');
    const changed = !previous || ['body','prompt','genre','task'].some(key => previous[key] !== draft[key]);
    if (previous && !changed) return JSON.parse(JSON.stringify(previous));
    return {...draft,id:previous?.id || id,version:(previous?.version || 0)+1,created:previous?.created || now,updated:now,analysis:null,feedback:{},history:previous ? [...(previous.history || []),{version:previous.version,body:previous.body,prompt:previous.prompt,genre:previous.genre,task:previous.task,analysis:previous.analysis,feedback:previous.feedback}] : []};
  }
  function replaceAnalysis(entry,analysis) {
    const result=JSON.parse(JSON.stringify(entry));
    if(entry.analysis && Object.keys(entry.feedback || {}).length){result.history.push({version:entry.version,body:entry.body,prompt:entry.prompt,genre:entry.genre,task:entry.task,analysis:entry.analysis,feedback:entry.feedback});}
    result.analysis=analysis;result.feedback={};return result;
  }
  function parse(raw) {
    if (!raw) return {schema:1,revision:0,entries:[],draft:null,profileReviews:{},reviewDrafts:{}};
    const state = JSON.parse(raw);
    if (state.schema !== 1 || !Number.isInteger(state.revision) || !Array.isArray(state.entries) || state.entries.some(e => typeof e.id !== 'string' || typeof e.body !== 'string' || typeof e.prompt !== 'string' || typeof e.genre !== 'string' || typeof e.task !== 'string' || !Number.isInteger(e.version) || e.version < 1) || new Set(state.entries.map(e => e.id)).size !== state.entries.length) throw new Error('练习存档格式无法读取，原存档未覆盖。');
    if (state.draft && (typeof state.draft.body !== 'string' || typeof state.draft.prompt !== 'string' || typeof state.draft.genre !== 'string' || typeof state.draft.task !== 'string')) throw new Error('练习草稿格式无法读取，原存档未覆盖。');
    const validFeedback = value => value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(f => f && ['accept','scope','reject','unsure','correct'].includes(f.choice) && Number.isInteger(f.version) && typeof f.note === 'string' && (!f.scope || ['common','genre','task'].includes(f.scope)) && (f.choice !== 'correct' || typeof f.corrected === 'string' && !!f.corrected.trim()) && (!f.history || Array.isArray(f.history) && f.history.every(h=>h && typeof h.choice==='string' && typeof h.note==='string' && typeof h.corrected==='string')));
    state.profileReviews ??= {};
    state.reviewDrafts ??= {};
    if (!state.reviewDrafts || typeof state.reviewDrafts !== 'object' || Array.isArray(state.reviewDrafts) || Object.values(state.reviewDrafts).some(d=>!d || typeof d !== 'object' || Object.values(d).some(v=>typeof v !== 'string'))) throw new Error('审核草稿无法读取，原存档未覆盖。');
    if (!state.profileReviews || typeof state.profileReviews !== 'object' || Array.isArray(state.profileReviews) || Object.values(state.profileReviews).some(r=>!r || !['accept','correct','reject','unsure'].includes(r.decision) || typeof r.signature !== 'string' || typeof r.text !== 'string' || r.history && !Array.isArray(r.history))) throw new Error('文风审核记录无法读取，原存档未覆盖。');
    state.entries.forEach(e => {
      e.history ??= []; e.feedback ??= {};
      if (!Array.isArray(e.history) || !validFeedback(e.feedback) || e.history.some(h => !h || typeof h.body !== 'string' || typeof h.prompt !== 'string' || !Number.isInteger(h.version) || (h.feedback && !validFeedback(h.feedback)))) throw new Error('练习版本记录无法读取，原存档未覆盖。');
    });
    // Recompute derived statistics from source text; never trust cached metrics as evidence.
    state.entries.forEach(e => { if (e.analysis?.version === e.version) { const input = e.analysis.input, previous=e.analysis; e.analysis = analyze(e);if(previous.mode==='model-analysis-v1'){e.analysis={...previous,metrics:e.analysis.metrics,claims:previous.claims.filter(c=>Array.isArray(c.evidence)&&c.evidence.every(q=>e.body.includes(q)))};} if (input?.mode === 'input-preview-only' && Array.isArray(input.corrections)) e.analysis.input = input; } else e.analysis = null; });
    return state;
  }
  return {count,metrics,rules,analyze,analysisInput,eligible,validate,profileSignature,styleContext,revise,replaceAnalysis,parse};
})();

window.createPreviewPractice = ({notice,resetSearch}) => {
  const model = window.previewPracticeModel, KEY = 'writing-workbench.preview.practice.v1';
  const $ = id => document.getElementById(id), node = (tag,text,cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  let state, raw = null, unavailable = false, entryId = null, composing = false, draftTimer, topicRound = 0;
  try { raw = localStorage.getItem(KEY); state = model.parse(raw); } catch { state = model.parse(null); unavailable = true; }
  const panel = $('practice-panel'); panel.replaceChildren();
  panel.innerHTML = '<div class="practice-heading"><div><h2>写一小篇，认识自己的表达</h2><p>约300字 · 先写、保存，再核对观察。题目为本地演示；统计来自你的正文，未调用真实AI。</p></div><button type="button" class="btn" id="practice-new">新练习</button></div><div class="practice-topic-controls"><div><label for="practice-genre">题材</label><select id="practice-genre"><option>随机题材</option><option>修仙</option><option>都市</option><option>灵异</option><option>科幻</option><option>悬疑</option><option>其他</option></select></div><div><label for="practice-task">练习方向</label><select id="practice-task"><option>场景描写</option><option>人物对话</option><option>动作与选择</option><option>心理描写</option></select></div><button type="button" class="btn" id="practice-topics">AI 出题 · 演示</button></div><div id="practice-candidates" class="practice-topic-list"></div><div class="practice-workspace"><section class="practice-write"><label for="practice-prompt" id="practice-title">本次练习题目</label><textarea id="practice-prompt" maxlength="1200"></textarea><p id="practice-description">围绕题目完成约300字，字数是目标，不是保存限制。</p><label for="practice-text">练习正文</label><textarea id="practice-text" maxlength="12000" placeholder="从你自己的第一句话开始。" aria-describedby="practice-description practice-error" spellcheck="false"></textarea><div class="practice-status"><span id="practice-count">0字 / 约300字</span><span id="practice-save-state"></span></div><div class="actions"><button type="button" class="btn primary" id="practice-save">保存练习</button><button type="button" class="btn" id="practice-analyze">分析已保存练习</button></div><p id="practice-error" class="field-error" role="alert"></p><p id="practice-status" role="status" aria-live="polite"></p></section><aside class="practice-history" aria-label="练习历史"><h3>已保存练习</h3><label for="practice-history-genre">查看题材</label><select id="practice-history-genre"><option>全部题材</option><option>修仙</option><option>都市</option><option>灵异</option><option>科幻</option><option>悬疑</option><option>其他</option></select><div id="practice-history-list"></div><p>保存在本机浏览器，刷新后仍可打开。其他作品预览仍按原规则恢复示例。</p></aside></div><div class="practice-review-toolbar segmented" aria-label="练习分析视图"><button type="button" id="practice-single-tab" aria-pressed="true">本篇观察与人工核对</button><button type="button" id="practice-profile-tab" aria-pressed="false">累计文风档案</button></div><section id="practice-report" aria-label="本篇观察与人工核对"></section><section id="practice-profile" aria-label="累计文风档案" hidden><label for="practice-profile-genre">档案范围</label><select id="practice-profile-genre"><option>共同表达习惯</option><option>修仙</option><option>都市</option><option>灵异</option><option>科幻</option><option>悬疑</option><option>其他</option></select><div id="practice-profile-content"></div></section>';
  const error = message => { $('practice-error').textContent = message; };
  const saved = () => state.entries.find(e => e.id === entryId);
  const draft = () => ({id:entryId,genre:$('practice-genre').value === '随机题材' ? '其他' : $('practice-genre').value,task:$('practice-task').value,prompt:$('practice-prompt').value,body:$('practice-text').value});
  const dirty = () => { const e = saved(), d = draft(); return e ? ['genre','task','prompt','body'].some(k => e[k] !== d[k]) : !!d.body.trim(); };
  const commit = next => {
    if (unavailable) throw new Error('本机存档暂时无法使用，未覆盖原存档；请先保留正文，再检查浏览器存储权限。');
    if (localStorage.getItem(KEY) !== raw) throw new Error('另一个窗口已修改练习档案，未覆盖新内容。请先复制当前正文，再刷新读取最新档案。');
    next.revision = state.revision + 1; const serialized = JSON.stringify(next); localStorage.setItem(KEY,serialized); raw = serialized; state = next;
  };
  const bindReviewDraft = (key,fields) => {
    const value=state.reviewDrafts?.[key]; Object.entries(fields).forEach(([name,control])=>{if(typeof value?.[name]==='string')control.value=value[name];});
    const persist=event=>{if(composing || event.isComposing)return;try{const values=Object.fromEntries(Object.entries(fields).map(([name,control])=>[name,control.value]));commit({...state,reviewDrafts:{...state.reviewDrafts,[key]:values}});$('practice-status').textContent='审核草稿已在本机暂存；点击保存审核后才会生效。';}catch(ex){error('审核草稿未能暂存。'+ex.message);}};
    Object.values(fields).forEach(control=>{control.addEventListener(control.tagName==='SELECT'?'change':'input',persist);control.addEventListener('compositionend',event=>{composing=false;persist(event);});});
  };
  const grow = el => { el.style.height = 'auto'; el.style.height = Math.min(el.id === 'practice-text' ? 520 : 200,Math.max(el.id === 'practice-text' ? 300 : 85,el.scrollHeight)) + 'px'; };
  const updateCount = () => { const n = model.count($('practice-text').value); $('practice-count').textContent = n + '字 / 约300字' + (n && n < 100 ? ' · 样本较短，可保存，暂不分析' : n > 500 ? ' · 超过练习目标，也可以保存' : ''); $('practice-save-state').textContent = dirty() ? '有未保存修改' : entryId ? '已保存 · 第' + saved()?.version + '版' : '新练习'; grow($('practice-text')); grow($('practice-prompt')); };
  const persistDraft = () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => { try { commit({...state,draft:draft()}); $('practice-save-state').textContent = dirty() ? '草稿已在本机暂存 · 尚未收录作品' : $('practice-save-state').textContent; } catch(e) { error('草稿未能暂存。' + e.message); } },350); };
  const reportText = e => e.analysis ? e.analysis.claims.map(c => c.label + '：' + c.evidence.join(' / ') + (e.feedback?.[c.id]?.corrected ? '\n作者修正：' + e.feedback[c.id].corrected : '')).join('\n') : '';
  const renderHistory = () => {
    const list = $('practice-history-list'); list.replaceChildren(); const filter = $('practice-history-genre').value;
    const entries = state.entries.filter(e => filter === '全部题材' || e.genre === filter).slice().reverse();
    if (!entries.length) list.append(node('p',state.entries.length ? '这一题材还没有保存的练习。' : '保存第一篇练习后，就能在这里回看。','practice-empty'));
    entries.forEach(e => { const b = node('button',undefined,'practice-history-item'); b.type = 'button'; b.setAttribute('aria-pressed',String(e.id === entryId)); b.append(node('strong',e.genre + ' · ' + e.task),node('span',e.prompt),node('small',model.count(e.body) + '字 · 第' + e.version + '版 · ' + (e.analysis ? '已分析' : '待分析'))); b.addEventListener('click',() => openEntry(e.id)); list.append(b); });
  };
  const renderProfile = () => {
    const owner = $('practice-profile-content'); owner.replaceChildren(); const genre = $('practice-profile-genre').value === '共同表达习惯' ? null : $('practice-profile-genre').value;
    const eligible = model.eligible(state.entries).filter(e => !genre || e.genre === genre), total = state.entries.filter(e => !genre || e.genre === genre);
    owner.append(node('h3',genre ? genre + '题材观察' : '跨题材共同表达习惯'),node('p','已保存' + total.length + '篇；可验证的独立样本' + eligible.length + '篇，共' + eligible.reduce((n,e) => n + model.count(e.body),0) + '字。相同正文只计一次，旧版本和未分析的作品不参与。'));
    owner.append(node('p','这里验证可测量表达形式的稳定性，不显示“AI准确率”。情绪、描写和潜台词等语义判断待真实AI接入。','practice-method-note'));
    if (!eligible.length) { owner.append(node('p','先保存并分析练习，再核对本篇观察。档案不会用固定示例替你下结论。','practice-empty')); return; }
    model.rules.forEach(rule => {
      const v = model.validate(state.entries,rule,genre), card = node('article',undefined,'practice-observation'); card.append(node('h4',rule.label),node('p',rule.definition));
      const crossValid = v.cross.filter(c => c.proposed), crossSupported = crossValid.length >= 2 && crossValid.every(c => c.support >= 2 && !c.against);
      const stable = v.proposed >= 3 && !v.contradicted && v.supported >= 3;
      const label = genre ? stable ? '已有多篇支持' : v.samples < 4 ? '样本不足，暂时观察' : '结论不稳定或有反例' : crossSupported ? '多个题材提供支持' : '跨题材证据不足，暂不归为共同习惯';
      card.append(node('strong',label + ' · ' + (v.rejected ? '人工核对存在异议' : v.corrected ? '存在作者修正，需核对适用范围' : !genre && v.scoped ? '存在范围限制，暂不收录共同习惯' : v.accepted ? '已有作者认可' : '待人工核对')),node('p','留一篇验证：' + v.proposed + '轮提出该判断，' + v.supported + '篇支持、' + v.contradicted + '篇反例。至少4篇可观察样本才启动；每次用其余作品提炼，再检查留出的作品。'),node('p','作者反馈：准确' + v.accepted + ' · 限定范围' + v.scoped + ' · 删除' + v.rejected + ' · 不确定' + v.unsure + '。人工反馈单独记录，不替代正文验证。'));
      if (!genre) v.cross.forEach(c => card.append(node('p',c.genre + '：' + (c.proposed ? '留出本题材验证，' + c.support + '篇支持、' + c.against + '篇反例' : '分组样本不足或其他题材没有形成该判断'))));
      card.append(node('p','可观察覆盖：' + v.samples + '/' + v.total + '篇；留出支持：' + (v.supportRate === null ? '暂无数据' : v.supported + '/' + v.proposed + '篇') + '。作者修改分析' + v.corrected + '条；修改不改变原文统计，也不作为原候选通过验证。'));
      const evidence = node('details'), summary = node('summary','查看来源作品与反例'); evidence.append(summary);
      eligible.forEach(e => { const result = rule.test(e.analysis.metrics,e); evidence.append(node('p',e.genre + ' · ' + e.prompt.slice(0,45) + '：' + (result === null ? '无法观察' : result ? '支持' : '不支持该判断'))); }); card.append(evidence); owner.append(card);
      const key = (genre || '*') + ':' + rule.id, signature = model.profileSignature(state.entries,genre,rule.id), previous = state.profileReviews?.[key];
      card.append(node('h4','审核累计文风结论'),node('p',previous ? previous.signature === signature ? '已保存本组证据对应的审核。' : '证据或反馈已经变化，旧审核保留，请重新核对。' : '样本不足时只能保存为待验证观察，不能自动成为生成要求。'));
      const textLabel = node('label','累计结论'), text = node('textarea'); text.id = 'profile-text-' + rule.id; textLabel.htmlFor = text.id; text.maxLength = 1500; text.value = previous?.text || rule.label;
      const decisionLabel = node('label','累计审核结果'), decision = node('select'); decision.id = 'profile-decision-' + rule.id; decisionLabel.htmlFor = decision.id;
      [['unsure','暂时无法判断'],['accept','结论准确'],['correct','采用我修改的结论'],['reject','不采用该结论']].forEach(([value,label])=>{const option=node('option',label);option.value=value;decision.append(option);}); decision.value = previous?.decision || 'unsure';
      bindReviewDraft('profile:'+key,{text,decision});
      const save = node('button','保存文风审核','btn'); save.type='button'; save.addEventListener('click',()=>{
        if (composing) return; if (dirty()) return error('先保存当前正文，再审核累计档案。');
        if (!text.value.trim() && ['accept','correct'].includes(decision.value)) return error('请输入你认可的文风结论。');
        try { const next=JSON.parse(JSON.stringify(state)); delete next.reviewDrafts['profile:'+key]; next.profileReviews ||= {}; const old=next.profileReviews[key]; next.profileReviews[key]={genre:genre || null,ruleId:rule.id,text:text.value.trim(),decision:decision.value,signature,history:old ? [...(old.history || []),{text:old.text,decision:old.decision,signature:old.signature}] : []}; commit(next); error(''); $('practice-status').textContent='已保存累计文风审核；只有证据有效且已有验证支持的结论，才能作为生成参考。'; renderProfile(); resetSearch(''); } catch(ex) { error('文风审核未能保存。'+ex.message); }
      }); card.append(textLabel,text,decisionLabel,decision,save);
    });
    const scopeEntries = eligible.filter(e => e.analysis.claims.some(c => e.feedback?.[c.id]?.version === e.version && e.feedback[c.id].choice === 'accept'));
    owner.append(node('p','已有' + scopeEntries.length + '篇包含作者认可的观察。尚未核对的候选保留为待验证，不作为已认可文风。'));
  };
  const renderReport = () => {
    const owner = $('practice-report'); owner.replaceChildren(); const e = saved();
    if (!e) { owner.append(node('h3','先完成这一篇'),node('p','保存正文后再分析，分析结果会绑定这一版作品。')); return; }
    owner.append(node('h3',e.genre + ' · 第' + e.version + '版本篇观察'));
    if (dirty()) owner.append(node('p','正文或题目有未保存修改。下面仍对应已保存版本，保存后需重新分析。','practice-method-note'));
    if (!e.analysis) { owner.append(node('p',e.history?.some(v => v.analysis) ? '作品已修改，旧分析与反馈保留在版本记录；请重新分析这一版。' : '尚未分析。点击“分析已保存练习”查看统计及待核对观察。')); }
    else {
      const m = e.analysis.metrics;
      const rows = [['用词习惯','暂无语义分析；不会把题材专有词直接认作个人文风。'],['句式与节奏',m.sentences + '个句子，中位句长' + m.medianSentence + '字；短句占比' + Math.round(m.shortRatio*100) + '%；句长变化（标准差）' + m.sentenceStd.toFixed(1) + '字。仅描述节奏变化，不据此判定AI味。'],['描写方式','动作、感官与心理描写的判断待真实AI，当前不作推断。'],['对话特点','引号内文字约占' + Math.round(m.quoteRatio*100) + '%；引用不一定是对话，请核对。'],['情绪表达','含蓄、直接及情绪转折的判断待真实AI，当前不作推断。'],['叙事习惯',m.paragraphs + '个自然段，' + m.questions + '处疑问标点；不据此推断悬念质量。']];
      const dl = node('dl',undefined,'practice-dimensions'); rows.forEach(([label,value]) => dl.append(node('dt',label),node('dd',value))); owner.append(dl);
      owner.append(node('h4','人工核对候选观察'),node('p','审核分析是否准确，可直接修改结论；不修改练习正文。审核草稿自动暂存，保存审核后生效。累计文风仍需其他作品验证；当前阈值为未经校准的演示规则。'));
      if (!e.analysis.claims.length) owner.append(node('p','本篇未形成这些规则的候选观察，仍可参与其他已存在判断的验证。'));
      e.analysis.claims.forEach(c => {
        const card = node('article',undefined,'practice-observation'); card.append(node('h4',c.label + ' · ' + c.dimension),node('p','范围：' + e.genre + ' / ' + e.task),node('p',c.definition));
        c.evidence.forEach(s => card.append(node('blockquote',s)));
        const label = node('label','你的判断'), select = node('select'); select.id = 'practice-feedback-' + c.id; label.htmlFor = select.id;
        [['','待核对'],['accept','分析准确'],['correct','修改分析'],['scope','仅适用于这类题材／这次练习'],['reject','删除错误结论'],['unsure','暂时无法判断']].forEach(([value,text]) => { const o = node('option',text); o.value = value; select.append(o); });
        select.value = e.feedback?.[c.id]?.version === e.version ? e.feedback[c.id].choice : '';
        const correctedLabel = node('label','修正后的分析'), corrected = node('textarea'); corrected.id='practice-corrected-' + c.id; correctedLabel.htmlFor=corrected.id; corrected.maxLength=1500; corrected.value=e.feedback?.[c.id]?.corrected || c.label; corrected.setAttribute('placeholder','写下正确的分析，不修改练习正文。');
        const scopeLabel=node('label','这条审核适用的范围'), scope=node('select'); scope.id='practice-scope-' + c.id; scopeLabel.htmlFor=scope.id; [['task','同题材、同练习方向'],['genre','同题材'],['common','跨题材共同判断']].forEach(([value,text])=>{const option=node('option',text);option.value=value;scope.append(option);}); scope.value=e.feedback?.[c.id]?.scope || 'task';
        const toggleCorrection=()=>{corrected.hidden=correctedLabel.hidden=select.value !== 'correct';}; select.addEventListener('change',toggleCorrection); toggleCorrection();
        const noteLabel = node('label','补充说明（选填）'), note = node('textarea'); note.id = 'practice-feedback-note-' + c.id; noteLabel.htmlFor = note.id; note.maxLength = 1500; note.value = e.feedback?.[c.id]?.note || '';
        const reviewKey='entry:'+e.id+':'+e.version+':'+c.id; bindReviewDraft(reviewKey,{choice:select,corrected,scope,note}); toggleCorrection();
        const save = node('button','保存这条核对','btn'); save.type = 'button'; save.addEventListener('click',() => {
          if (composing) return; if (dirty()) return error('先保存并重新分析当前修改，再核对新版本。');
          if (!select.value) return error('请选择你的判断，也可以选择“暂时不确定”。');
          if (select.value === 'correct' && !corrected.value.trim()) return error('请输入修正后的分析；不想填写时可以选择删除错误结论。');
          try { const next = JSON.parse(JSON.stringify(state)), target = next.entries.find(x => x.id === e.id); if (target.version !== e.version || target.analysis?.version !== e.version) throw new Error('分析版本已改变，请重新核对。'); delete next.reviewDrafts[reviewKey]; target.feedback ||= {}; const previous=target.feedback[c.id]; target.feedback[c.id] = {choice:select.value,corrected:select.value === 'correct' ? corrected.value.trim() : '',scope:scope.value,original:c.label,note:note.value.trim(),version:e.version,analysisMode:e.analysis.mode,history:previous ? [...(previous.history || []),{choice:previous.choice,corrected:previous.corrected || '',note:previous.note,scope:previous.scope || 'genre'}] : []}; commit(next); error(''); $('practice-status').textContent = '已保存审核和修正版。下一篇会按适用范围准备纠正参考；当前未发送真实AI请求。'; renderProfile(); resetSearch(''); } catch(ex) { error('核对未能保存。' + ex.message); }
        }); card.append(label,select,correctedLabel,corrected,scopeLabel,scope,noteLabel,note,save);
        if(e.feedback?.[c.id]?.history?.length) {const past=node('details');past.append(node('summary','查看本条审核历史'));e.feedback[c.id].history.forEach(f=>past.append(node('p',(f.corrected || f.choice)+' · '+(f.note || '无补充说明'))));card.append(past);} owner.append(card);
      });
      const input=e.analysis.input || model.analysisInput(e,state.entries), references=node('details',undefined,'practice-reference'); references.append(node('summary','本次分析准备的纠正参考 · 未发送真实AI请求'),node('p',input.instruction));
      if (!input.corrections.length) references.append(node('p','没有其他练习中适用于本篇的纠正记录。同一篇的旧版本不作为独立参考。'));
      input.corrections.forEach(c=>references.append(node('p',c.genre+' / '+c.task+' · 第'+c.sourceVersion+'版\n来源题目：'+(c.sourcePrompt || '历史练习')+'\n原判断「'+c.original+'」；作者修正：'+c.corrected+(c.note ? '\n说明：'+c.note : '')))); owner.append(references);
    }
    if (e.history?.length) { const details = node('details'), summary = node('summary','查看旧版本与旧核对记录'); details.append(summary); e.history.slice().reverse().forEach(v => { const section = node('section'); section.append(node('h4','第' + v.version + '版 · ' + v.genre),node('p',v.body),node('p',v.analysis ? '该版已分析，旧反馈不计入新版' : '该版未分析')); Object.values(v.feedback || {}).forEach(f => section.append(node('p','人工核对：' + ({accept:'准确',correct:'修改分析',scope:'限定范围',reject:'删除',unsure:'不确定'}[f.choice] || '待核对') + ' ' + (f.corrected || '') + ' ' + (f.note || '')))); details.append(section); }); owner.append(details); }
  };
  const render = () => { renderHistory(); renderReport(); renderProfile(); updateCount(); };
  const setDraft = d => { entryId = d?.id && state.entries.some(e => e.id === d.id) ? d.id : null; $('practice-genre').value = d?.genre || '都市'; $('practice-task').value = d?.task || '场景描写'; $('practice-prompt').value = d?.prompt || '雨停后，一个人回到多年没有来过的街口。用具体细节写出他停下脚步的瞬间。'; $('practice-text').value = d?.body || ''; render(); };
  function openEntry(id) { if (dirty()) { error('当前练习有未保存修改，先保存，再打开其他作品。'); return; } clearTimeout(draftTimer); setDraft(state.entries.find(e => e.id === id)); persistDraft(); error(''); }
  $('practice-new').addEventListener('click',() => { if (dirty()) return error('先保存当前练习，再开始新练习；正文不会被清空。'); clearTimeout(draftTimer); setDraft(null); persistDraft(); error(''); $('practice-text').focus(); });
  ['practice-genre','practice-task','practice-prompt','practice-text'].forEach(id => $(id).addEventListener(id.includes('genre') || id.includes('task') ? 'change' : 'input',event => { updateCount(); if (!event.isComposing && !composing) { error(''); persistDraft(); } }));
  panel.addEventListener('compositionstart',() => { composing = true; clearTimeout(draftTimer); }); panel.addEventListener('compositionend',() => { composing = false; updateCount(); persistDraft(); });
  $('practice-save').addEventListener('click',() => {
    if (composing) return; clearTimeout(draftTimer);
    try { const d = draft(), previous = saved(), entry = model.revise(previous,d,crypto.randomUUID(),new Date().toISOString()), next = {...state,entries:previous ? state.entries.map(e => e.id === entry.id ? entry : e) : [...state.entries,entry],draft:{...d,id:entry.id}}; commit(next); entryId = entry.id; error(''); $('practice-status').textContent = '已保存到本机 · 第' + entry.version + '版。' + (previous?.analysis && !entry.analysis ? '原分析已标为旧版本，请重新分析。' : ''); render(); resetSearch(''); } catch(ex) { error('练习未能保存。' + ex.message); }
  });
  $('practice-analyze').addEventListener('click',async () => {
    if (composing) return; const e = saved(); if (!e || dirty()) return error('先保存当前正文和题目，再分析这一版作品。'); if (model.count(e.body) < 100) return error('这篇不足100字，已保存；建议补充内容后再分析，避免样本过短。');
    try { clearTimeout(draftTimer); let analysis = model.analyze(e,state.entries);
      if(window.desktop){$('practice-analyze').disabled=true;$('practice-status').textContent='正在分析这一版正文并独立核对…';try{const result=await window.desktop.generate({requestId:crypto.randomUUID(),operation:'practice',values:{source:e.body,topic:e.prompt},context:{genre:e.genre,task:e.task,corrections:analysis.input.corrections}});if(saved()?.id!==e.id || saved()?.version!==e.version || dirty())throw new Error('正文或当前练习已变化，请重新分析。');if(result[0].semanticReview.status==='issues')throw new Error('AI 核对发现分析问题，请重新分析。');analysis={...analysis,mode:'model-analysis-v1',claims:[...analysis.claims,...result[0].claims.filter(c=>!analysis.claims.some(x=>x.id===c.id))],semanticReview:result[0].semanticReview,report:result[0].summary};}finally{$('practice-analyze').disabled=false;}}
      const next = JSON.parse(JSON.stringify(state)), index = next.entries.findIndex(x => x.id === e.id); next.entries[index] = model.replaceAnalysis(next.entries[index],analysis); commit(next); error(''); $('practice-status').textContent = '已分析保存的第' + e.version + '版，并准备'+analysis.input.corrections.length+'条适用纠正。候选分析已更新，请重新人工核对。'; render(); resetSearch(''); } catch(ex) { error('分析未能保存，练习正文仍保留。' + ex.message); }
  });
  const topics = {修仙:['少年发现救命恩人来自敌对宗门。','守山弟子听见失踪师父的声音。','丹炉开裂，一名学徒决定承担后果。'],都市:['旧邮局收到一封没有收件人的信。','多年未联系的朋友突然来借钱。','末班车停下，有人认出了司机。'],灵异:['镜子里的人比房间里多一个。','门外的敲门声与自己的心跳一致。','失踪者的电话从空房间响起。'],科幻:['机器人请求删除唯一一段快乐记忆。','飞船收到十年后自己发来的警告。','城市最后一个真人拒绝上传意识。'],悬疑:['失物招领箱里出现了明天的报纸。','证人只记得凶手说话时的停顿。','一封告别信用了收信人的笔迹。'],其他:['旅人把最后一盏灯留给陌生人。','两个朋友在岔路口交换一件旧物。','一个人终于打开藏了多年的箱子。']};
  const tasks = {场景描写:'用场景和感官细节写出这一刻，约300字。',人物对话:'通过人物对话表现分歧与未说出口的话，约300字。','动作与选择':'让人物做出一次具体选择，并写出行动，约300字。',心理描写:'写出人物的心理变化与决定，约300字。'};
  $('practice-topics').addEventListener('click',async () => { if (composing) return; const selected = $('practice-genre').value, genre = selected === '随机题材' ? Object.keys(topics)[topicRound++ % 6] : selected, task = $('practice-task').value, list = $('practice-candidates'); list.replaceChildren();let topicList=topics[genre];
    if(window.desktop){$('practice-topics').disabled=true;try{const result=await window.desktop.generate({requestId:crypto.randomUUID(),operation:'prompt',values:{genre,direction:task,count:3},context:{}});topicList=result.map(c=>c.summary);}catch(ex){error(ex.message);return;}finally{$('practice-topics').disabled=false;}}
    topicList.forEach((text,i) => { const b = node('button',undefined,'practice-topic'); b.type = 'button'; b.append(node('strong',genre + ' · ' + task),node('span',text + tasks[task])); b.addEventListener('click',() => { if (dirty()) return error('先保存当前练习，再采用新题目；正文不会丢失。'); setDraft({genre,task,prompt:window.desktop ? text : text + tasks[task],body:''}); persistDraft(); list.replaceChildren(); $('practice-status').textContent = '已采用本地演示题目，请写下自己的正文。'; $('practice-text').focus(); }); list.append(b); }); $('practice-status').textContent = '已列出3个' + genre + '演示主题，没有发送AI请求。'; });
  $('practice-history-genre').addEventListener('change',renderHistory); $('practice-profile-genre').addEventListener('change',renderProfile);
  ['single','profile'].forEach(view => $('practice-' + view + '-tab').addEventListener('click',() => { $('practice-report').hidden = view !== 'single'; $('practice-profile').hidden = view !== 'profile'; $('practice-single-tab').setAttribute('aria-pressed',String(view === 'single')); $('practice-profile-tab').setAttribute('aria-pressed',String(view === 'profile')); if (view === 'profile') renderProfile(); }));
  const onConflict = event => { if (event.key === KEY && event.newValue !== raw) error('其他窗口已更新本机练习档案，请先保留当前正文，再刷新读取。'); };
  window.addEventListener('storage',onConflict);
  document.querySelectorAll('[data-collection-tab="ideas"]').forEach(button => button.addEventListener('click',() => { const practice = button.dataset.group === '练习'; $('ideas-view').querySelector('.module-footer').textContent = practice ? '练习稿、统计及人工核对保存在本机浏览器；题目为本地演示，未接入真实AI。' : '灵感示例内容 · 本页修改刷新后恢复，不连接真实作品。'; if (practice) updateCount(); }));
  setDraft(state.draft); if (unavailable) error('本机存档无法读取或存储被阻止，原存档未覆盖。请先保留正文，再检查存储权限。');
  return {
    applyPrompt(prompt){if(dirty())throw new Error('先保存当前练习，再采用新题目。');const before=draft();setDraft({...before,prompt,body:''});persistDraft();return ()=>{if(draft().prompt!==prompt)return false;setDraft(before);persistDraft();return true;};},
    acceptedAnalysis(){return state.entries.filter(e=>e.analysis?.version===e.version).map(e=>({id:e.id,version:e.version,genre:e.genre,task:e.task,body:e.body,claims:e.analysis.claims.filter(c=>['accept','correct'].includes(e.feedback?.[c.id]?.choice)).map(c=>({...c,author:e.feedback[c.id]}))})).filter(e=>e.claims.length);},
    styleContext:genre=>model.styleContext(state.entries,state.profileReviews,genre),context:() => ({index:entryId || 'draft',title:draft().genre + ' · ' + draft().task,prompt:draft().prompt,text:draft().body}),searchDocuments:() => state.entries.map(e => ({id:'practice-work:' + e.id,type:'ideas',view:'ideas',group:'练习',target:e.id,title:e.genre + ' · ' + e.task,path:'灵感与练习 / 已保存练习 / ' + e.genre,fields:[{label:'题目',key:'prompt',text:e.prompt},{label:'正文',key:'body',text:e.body},{label:'本篇观察',key:'analysis',text:reportText(e)},{label:'人工核对',key:'feedback',text:Object.values(e.feedback || {}).map(f => f.choice + ' ' + (f.corrected || '') + ' ' + f.note).join('\n')}]})),openSearchTarget:result => { if (dirty()) { error('先保存当前练习修改，再定位其他练习。'); return null; } openEntry(result.target); $('practice-single-tab').click(); return result.field.key === 'body' ? $('practice-text') : result.field.key === 'prompt' ? $('practice-prompt') : $('practice-report'); }};
};
