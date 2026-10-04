/* AI workflow restoration for the standalone preview. No service requests or credential persistence. */
(() => {
  const field = (key,label,options = {}) => ({key,label,...options});
  const genre = field('genre','题材',{options:['玄幻','都市','仙侠','科幻','悬疑','其他']});
  const requirement = field('requirement','补充要求',{multiline:true,placeholder:'希望保留什么？希望避免什么？'});
  const reference = field('reference','参考作品或写作方向');
  const source = field('source','待分析内容',{multiline:true,required:true});
  const count = field('count','候选数量',{number:true,min:1,max:8,value:3});
  const structures = window.previewOutlineStructures = {
    '七点结构法':['开篇状态','第一次转折','第一次压力','中点：由被动转主动','第二次压力','第二次转折','解决与余波'],
    '三幕式':['第一幕：建立处境与目标','第二幕：对抗与升级','第三幕：决战与解决'],
    '八步故事环':['舒适区','产生需求','进入陌生处境','适应与寻找','获得所求','付出代价','返回','发生改变'],
    '救猫咪十五节拍':['开场画面','主题呈现','铺垫','催化事件','犹豫与争论','进入第二幕','副线','趣味与承诺','中点','压力逼近','一无所有','灵魂暗夜','进入第三幕','终局','收尾画面'],
    '四幕结构':['建置','复杂化与上升','危机与下降','高潮与解决'],
    '五幕结构（弗莱塔格）':['展示','上升行动','高潮','下降行动','结局'],
    '八序列法':['日常与激励事件','进入新情境','反应与探索','中点转折','局势恶化','全盘皆输','危机抉择','高潮解决'],
    '英雄之旅十二阶段':['普通世界','冒险召唤','拒绝召唤','遇见导师','跨越门槛','试炼、盟友与敌人','接近最深洞穴','磨难','报酬','返回之路','复活','带着灵药归来'],
    '起承转合':['起：引入','承：展开','转：翻转','合：收束'],
    '序破急':['序：开场','破：加速发展','急：高潮收束'],
    '特鲁比七步':['弱点与需求','欲望','对手','计划','对决','自我启示','新平衡'],
    '麦基五阶段':['激励事件','进展纠葛','危机','高潮','结局'],
    '因果链六节点（皮克斯公式）':['从前','每天','直到一天','因为如此','因此','最终']
  };
  const structureField = field('structure','卷纲结构',{options:Object.keys(structures),value:'七点结构法',hint:'本工具按一个结构节点对应一章。切换结构可查看章数和节点；节点名是中文简化版本。雪花法用于逐层展开，场景—续场与目标—冲突—结果用于章内检查，MICE和时间线等用于组织故事，不按步骤数自动定章数。'});
  const outlineFields = [field('inspiration','依据本书灵感',{multiline:true,readonly:true,required:true}),field('volumes','生成卷数',{number:true,min:1,max:6,value:1}),structureField,field('chapters','每卷章节数（由结构决定）',{readonly:true,value:7}),field('nodes','结构节点',{multiline:true,readonly:true}),requirement];
  const readerEmotion = field('readerEmotion','读者情绪体验（可选）',{options:['根据卷纲自动安排','期待与爽感','紧张与悬念','温暖与感动','压抑后释放'],hint:'默认自动安排。通过事件、阻碍与选择带动情绪，不要求每章都制造悬念。'});
  window.previewChapterEmotion = (mode,index,count) => {
    const curves = {
      '期待与爽感':['关心 → 期待','期待 → 兴奋','兴奋 → 不甘','不甘 → 振奋','振奋 → 担心','担心 → 期待反击','期待反击 → 满足'],
      '紧张与悬念':['好奇 → 疑惑','疑惑 → 不安','不安 → 紧张','紧张 → 短暂放心','短暂放心 → 担心','担心 → 期待揭晓','期待揭晓 → 释然'],
      '温暖与感动':['亲近 → 关心','关心 → 牵挂','牵挂 → 心疼','心疼 → 温暖','温暖 → 担忧','担忧 → 被选择打动','被选择打动 → 欣慰'],
      '压抑后释放':['关心 → 不平','不平 → 憋闷','憋闷 → 担心','担心 → 一丝希望','一丝希望 → 揪心','揪心 → 期待突破','期待突破 → 释放']
    };
    const key = curves[mode] ? mode : '期待与爽感', phase = count > 1 ? Math.round(index * 6 / (count-1)) : 6;
    const expectations=['让读者看见主角在乎的人或目标，期待他得到机会。','给出向目标前进的机会，让读者盼着行动产生进展。','让已建立的期待遭遇具体阻碍，读者关心代价如何解决。','兑现部分进展，让主角通过主动行动获得新的可能。','使前面的选择产生后果，考验主角最珍视的东西。','让已有线索和铺垫成为办法，读者期待关键选择。','兑现本卷主要承诺，交代代价与余波，允许安静收束。'];
    return {mode:mode || '根据卷纲自动安排',curve:curves[key][phase],expectation:expectations[phase],mechanism:key==='紧张与悬念'?'用已有线索的信息差、证据变化和风险带动情绪，不凭空隐瞒人物已知事实。':key==='温暖与感动'?'用关系铺垫、具体行动和有代价的选择承载情感，避免突然煽情。':key==='压抑后释放'?'压力必须有原因，也要保留阶段性进展；兑现铺垫，避免连续受挫却毫无行动。':'让目标、阻碍、主动选择和得到的回报相互对应，胜利要有铺垫与代价。',ending:phase===6?'回应本卷核心期待，留下自然余波，不强行制造新危机。':phase===3?'给读者阶段性回报和喘息，再承接下一个节点。':'留下与本章结果相关的期待或问题，不要求使用悬念句收尾。'};
  };
  window.previewAIOperations = {
    book:{label:'AI 生成书名和简介',view:'home',source:'ProjectList.tsx',kind:'book',fields:[field('inspirationId','依据灵感库中的灵感',{options:[],required:true}),field('inspiration','灵感内容',{multiline:true,readonly:true,required:true}),genre,field('style','风格关键词'),requirement]},
    golden:{label:'AI 生成金手指',view:'home',source:'Workbench.tsx',kind:'golden',fields:[genre,field('protagonist','主角设定',{required:true}),field('inspiration','依据本书选定灵感',{multiline:true,readonly:true,required:true}),requirement]},
    person:{label:'AI 生成人物',view:'characters',source:'CharacterPage.tsx',kind:'person',fields:[field('inspirationId','依据本书灵感',{options:[],required:true}),field('inspiration','灵感内容',{multiline:true,readonly:true}),field('role','身份',{options:['主角','配角','反派']}),genre,field('faction','所属（选填）'),field('requirement','补充要求（选填）',{multiline:true,placeholder:'例如：一位冷静的宗门长老。可留空。',hint:'保留核心资料，并根据选定灵感展开目标与动机：要做什么、为什么这样做。'})]},
    world:{label:'AI 生成世界观设定',view:'world',source:'WorldPage.tsx',kind:'world',fields:[field('category','类别',{options:['势力','地点','物品','境界','功法','规则','其他']}),genre,field('requirement','补充要求（选填）',{multiline:true,placeholder:'例如：东皇大陆南域的顶级宗门。可留空。',hint:'只生成名称和核心介绍，便于后续写作时查阅。'})]},
    outline:{label:'AI 根据灵感生成卷纲',view:'outline',source:'OutlinePage.tsx',kind:'outline',fields:outlineFields},
    rewriteVolumes:{label:'AI 重写后续卷',view:'outline',source:'OutlinePage.tsx',kind:'rewriteVolumes',fields:[field('anchor','保留到这卷（只替换后续卷）',{readonly:true}),...outlineFields]},
    rewriteChapters:{label:'AI 重写后续章节',view:'outline',source:'OutlinePage.tsx',kind:'rewriteChapters',fields:[field('anchor','承接章节',{readonly:true}),field('volumeOutline','依据所属卷纲',{multiline:true,readonly:true,required:true}),field('chapters','后续章节数',{number:true,min:1,max:15,value:3}),requirement]},
    volumeChapters:{label:'AI 读取卷纲生成章纲',view:'outline',source:'OutlinePage.tsx',kind:'volumeChapters',fields:[field('anchor','当前卷',{readonly:true}),field('volumeOutline','依据卷纲',{multiline:true,readonly:true,required:true}),readerEmotion,field('structure','继承卷纲结构',{readonly:true}),field('chapters','章节数（由卷纲结构决定）',{readonly:true}),field('nodes','本卷节点安排',{multiline:true,readonly:true}),requirement]},
    chapterOutline:{label:'AI 重新生成本章细纲',view:'outline',source:'OutlinePage.tsx',kind:'chapterOutline',fields:[field('anchor','当前章节',{readonly:true}),field('volumeOutline','依据所属卷纲',{multiline:true,readonly:true,required:true}),readerEmotion,field('chapterSource','当前章纲',{multiline:true,readonly:true}),field('hook','章节钩子'),field('climax','章节爆点'),requirement]},
    continue:{label:'AI 续写',view:'editor',source:'ChapterPage.tsx',kind:'continue',fields:[field('source','光标前的正文',{multiline:true,readonly:true}),field('target','目标字数',{number:true,min:100,max:3000,value:300}),requirement]},
    polish:{label:'AI 润色选中',view:'editor',source:'ChapterPage.tsx',kind:'polish',fields:[field('source','选中的正文',{multiline:true,readonly:true,required:true}),requirement]},
    expand:{label:'AI 扩写选中',view:'editor',source:'ChapterPage.tsx',kind:'expand',fields:[field('source','选中的正文',{multiline:true,readonly:true,required:true}),requirement]},
    full:{label:'AI 生成整章',view:'editor',source:'ChapterPage.tsx',kind:'full',fields:[field('outline','本章细纲',{multiline:true,readonly:true,required:true}),field('target','目标字数',{number:true,min:300,max:6000,value:3000}),requirement]},
    summary:{label:'AI 生成本章摘要',view:'editor',source:'ChapterPage.tsx / summarizer.ts',kind:'summary',fields:[{...source,readonly:true},field('summaryPolicy','提炼要求',{readonly:true,multiline:true,value:'只根据已写正文提炼核心事件与结果、人物目标和状态变化、世界观变化、伏笔与未解决问题。正文未交代的内容不推测，章纲计划不写成已发生事实。当前本地预览提取原句作核对草稿，真实语义提炼尚未接入。'})]},
    ideas:{label:'AI 生成灵感',view:'ideas',source:'InspirationsPage.tsx',kind:'ideas',fields:[genre,field('elements','指定元素',{required:true,placeholder:'例如：旧书店、时间循环。几个关键词就够了。'}),field('requirement','补充要求（选填）',{multiline:true,placeholder:'可以留空。例如：轻松一点，避免悲剧。',hint:'概括整本书的主线，只点明金手指方向；详细设定留到金手指生成。补充要求可留空。'})]},
    prompt:{label:'AI 出练笔题目',view:'ideas',source:'WritingPracticePage.tsx',kind:'prompt',fields:[genre,field('direction','练习方向',{options:['场景描写','人物对话','动作与选择']}),requirement]},
    practice:{label:'保存并 AI 分析练笔',view:'ideas',source:'WritingPracticePage.tsx',kind:'practice',fields:[field('topic','当前题目',{readonly:true}),{...source,label:'练笔正文（100–300 字）',readonly:true}]},
    style:{label:'AI 更新我的文风卡',view:'ideas',source:'WritingPracticePage.tsx',kind:'style',fields:[field('oldStyle','当前文风卡',{multiline:true}),field('analysis','新练笔分析',{multiline:true,required:true})]},
    passage:{label:'单章分析',view:'library',source:'BookReader.tsx',kind:'passage',fields:[{...source,label:'本章正文'},field('dimensions','提炼哪些写作技巧',{checks:['剧情结构','人物塑造','情绪与悬念','文风表达']})]},
    bookAnalysis:{label:'整书分析',view:'library',source:'BookReader.tsx',kind:'bookAnalysis',fields:[field('range','读取范围',{options:['整本书','均匀采样十章']}),field('dimensions','提炼哪些写作技巧',{checks:['剧情结构','人物塑造','情绪与悬念','文风表达']})]},
    textAnalysis:{label:'新建 AI 拆书分析',view:'library',source:'NewAnalysis.tsx',kind:'textAnalysis',fields:[field('title','书名',{required:true}),field('author','作者'),{...source,label:'小说正文（粘贴）'}]},
    tips:{label:'AI 提炼写作技巧',view:'library',source:'BookReader.tsx',kind:'tips',fields:[{...source,label:'已有拆书报告'}]},
    techniques:{label:'AI 合并重复技巧',view:'library',source:'WritingToolboxPage.tsx',kind:'techniques',fields:[{...source,label:'现有技巧（只读）',readonly:true}]},
    rules:{label:'AI 提炼避雷规则',view:'library',source:'RejectionsPage.tsx',kind:'rules',fields:[{...source,label:'标记的 AI 味片段'},field('reason','标记原因',{multiline:true,required:true}),count]},
    mergeRules:{label:'AI 合并重复规则',view:'library',source:'RejectionsPage.tsx',kind:'mergeRules',fields:[{...source,label:'现有规则（只读）',readonly:true}]},
    test:{label:'演示连接测试',view:'settings',source:'SettingsPage.tsx',kind:'test',fields:[]}
  };

  const $ = id => document.getElementById(id);
  const node = (tag,text,classes) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (classes) element.className = classes; return element; };
  const button = (label,id) => { const element = node('button',label,'btn ai-action'); element.type = 'button'; element.dataset.aiOperation = id; return element; };
  window.preparePreviewAI = () => {
    const appendActions = (parent,ids,label = 'AI 辅助') => { const group = node('div',undefined,'ai-actions'); group.setAttribute('aria-label',label); ids.forEach(id => group.append(button(window.previewAIOperations[id].label,id))); parent.append(group); };
    [['characters',['person']],['world',['world']],['outline',['outline']]].forEach(([view,ids]) => appendActions($(view + '-view').querySelector('.page-heading'),ids));
    appendActions($('book-info-form'),['book']);
    appendActions($('outline-detail'),['volumeChapters','rewriteVolumes','rewriteChapters','chapterOutline']);
    const outlineTabs = document.querySelector('[aria-label="大纲与伏笔分类"]'); const outlineTab = node('button','章节细纲'); outlineTab.type = 'button'; outlineTab.dataset.collectionTab = 'outline'; outlineTab.dataset.group = '章节细纲'; outlineTab.setAttribute('aria-pressed','false'); outlineTabs.append(outlineTab);
    const aiPanel = $('ai-panel'); aiPanel.replaceChildren(node('h3','AI 写作助手'),node('p','演示模式 · 结果确认后才写入本页正文。润色和扩写请先选择正文。','ai-mode-note')); appendActions(aiPanel,['continue','polish','expand','full','summary']); aiPanel.append(node('h3','本章摘要')); const summary = node('p','本章还没有摘要。'); summary.id = 'ai-summary-preview'; summary.tabIndex = -1; aiPanel.append(summary);
    appendActions($('ideas-view').querySelector('.page-heading'),['ideas']); appendActions($('practice-panel'),['prompt','practice','style']);
    const practiceAnalysis = node('div',undefined,'ai-inline-result'); practiceAnalysis.id = 'practice-ai-analysis'; practiceAnalysis.hidden = true; $('practice-panel').append(practiceAnalysis);
    appendActions(document.querySelector('.reader-controls'),['passage','bookAnalysis']);

    const libraryTabs = document.querySelector('#library-view .segmented'); ['写作技巧','避雷规则'].forEach(group => { const tab = node('button',group); tab.type = 'button'; tab.dataset.collectionTab = 'library'; tab.dataset.group = group; tab.setAttribute('aria-pressed','false'); libraryTabs.append(tab); });
    const libraryTools = node('div',undefined,'ai-library-tools'); libraryTools.id = 'ai-library-tools'; appendActions(libraryTools,['techniques','rules','mergeRules']); $('library-catalog').before(libraryTools);
    const config = $('preview-ai-form'); const label = node('label','旧版服务商预设（示例）'); label.htmlFor = 'preview-provider'; const select = node('select'); select.id = 'preview-provider'; ['自定义','DeepSeek','Kimi (Moonshot)','智谱 GLM','通义千问','OpenAI','OpenRouter'].forEach(name => { const option = node('option',name); option.value = name; select.append(option); }); config.prepend(label,select);
    const tokenLabel = node('label','最大输出 tokens'); tokenLabel.htmlFor = 'preview-max-tokens'; const tokens = node('input'); tokens.id = 'preview-max-tokens'; tokens.type = 'number'; tokens.min = '1'; tokens.max = '131072'; tokens.value = '8192'; config.append(tokenLabel,tokens); config.querySelector('[type="submit"]').textContent = '保留本页演示配置'; appendActions(config,['test']);
    const configError = node('div',undefined,'field-error'); configError.id = 'preview-ai-config-error'; configError.setAttribute('role','alert'); config.append(configError);
    const dialog = node('dialog'); dialog.id = 'ai-workflow-dialog'; dialog.className = 'ai-workflow-dialog'; dialog.setAttribute('aria-labelledby','ai-workflow-title'); dialog.setAttribute('aria-describedby','ai-workflow-hint');
    // Fixed authored markup only; user values are always assigned through value/textContent.
    dialog.innerHTML = '<form id="ai-workflow-form" novalidate><div class="ai-dialog-heading"><div><span class="detail-kicker">AI 辅助 · 设计预览</span><h2 id="ai-workflow-title"></h2></div><button type="button" class="btn" id="ai-workflow-close">关闭</button></div><p id="ai-workflow-hint">以下结果是本地示例，用于检查原有操作流程；不会发送正文、读取旧密钥或调用模型。</p><p id="ai-workflow-context" class="ai-context"></p><div class="ai-workflow-layout"><section class="ai-input-panel"><h3>生成条件</h3><div id="ai-workflow-fields"></div><details class="ai-demo-controls"><summary>查看失败与重试效果（预览）</summary><label for="ai-demo-response">演示结果状态</label><select id="ai-demo-response"><option value="success">正常结果</option><option value="network">连接失败</option><option value="empty">返回为空</option><option value="format">格式异常</option></select></details><div id="ai-workflow-error" class="field-error" role="alert"></div><div class="actions"><button type="submit" class="btn primary" id="ai-workflow-generate">生成示例结果</button><button type="button" class="btn" id="ai-workflow-stop" hidden>停止生成</button></div><p id="ai-workflow-status" role="status" aria-live="polite"></p></section><section class="ai-output-panel"><h3>预览与采用</h3><p id="ai-output-empty">填写条件并生成后，在这里查看结果；确认前不会改变作品。</p><div id="ai-workflow-results" hidden><fieldset id="ai-result-choices"><legend>选择要采用的示例</legend><div id="ai-candidate-list"></div></fieldset><div class="ai-output-actions"><button type="button" class="btn" id="ai-select-all">全部选择</button><button type="button" class="btn" id="ai-select-none">全部取消</button></div><label for="ai-candidate-title">候选标题</label><input id="ai-candidate-title" type="text" maxlength="80"><label for="ai-candidate-content">结果内容（可修改）</label><textarea id="ai-candidate-content" spellcheck="false"></textarea><p id="ai-adopt-consequence"></p><button type="button" class="btn primary" id="ai-workflow-adopt">采用已选示例</button></div></section></div></form>';
    document.body.append(dialog);
    const feedback = node('div',undefined,'ai-undo-bar'); feedback.id = 'ai-undo-bar'; feedback.hidden = true; const message = node('span'); message.id = 'ai-adopt-feedback'; message.setAttribute('role','status'); const undo = node('button','撤销上次 AI 采用','btn'); undo.type = 'button'; undo.id = 'ai-adopt-undo'; feedback.append(message,undo); $('notice').before(feedback);
  };

  const candidate = (title,summary,fields = []) => ({title,summary,fields});
  const chapterNumber = title => { const token = /第([\d一二三四五六七八九十]+)章/.exec(title || '')?.[1]; if (!token) return 0; if (/^\d+$/.test(token)) return Number(token); const digits = '零一二三四五六七八九'; if (token.includes('十')) { const [tens,ones] = token.split('十'); return (tens ? digits.indexOf(tens) : 1) * 10 + (ones ? digits.indexOf(ones) : 0); } return digits.indexOf(token); };
  window.buildPreviewAIResults = (id,values,context = {},round = 1) => {
    const theme = values.requirement || values.elements || values.protagonist || '故乡、来信与一次选择'; const seed = String(theme).slice(0,80), suffix = round > 1 ? ' · 方案' + round : '';
    const generic = '围绕「' + seed + '」，先建立人物目标，再用阻碍迫使人物选择。\n\n示例观察：用动作、物件和对话承载情绪，并让结尾留下下一步的具体问题。';
    if (['continue','full','polish','expand'].includes(id) && context.chapterSelection) {
      const people=context.chapterSelection.people,world=context.chapterSelection.world,hints=context.chapterSelection.foreshadowing || [],names=people.map(card=>card.name),settings=world.map(card=>card.title);
      return [candidate('本章正文流程示例',(['polish','expand'].includes(id)?values.source+'\n\n':id==='continue'?'续写衔接正文：'+values.source+'\n\n':'')+'本章依据章纲：'+context.chapterOutline.summary+'\n\n'+(context.memory?'前文摘要：\n'+(context.memory.summaries.map(ch=>'第'+ch.id+'章 '+ch.title+'：'+ch.text).join('\n')||'暂无有效摘要')+'\n前章结尾：'+context.memory.previousEnding+'\n'+context.memory.instruction+'\n\n':'')+(context.quality?'本次写作技巧与避雷：\n'+context.quality.materials.map(item=>item.kind+' · '+item.title+'：'+item.text).join('\n')+'\n'+context.quality.instruction+'\n\n':'')+'本章人物：'+(names.join('、')||'沿用章纲人物')+'。本章世界观：'+(settings.join('、')||'沿用章纲背景')+'。\n\n'+[...people.map(card=>card.name+'：'+(card.currentState||card.summary)+' 目标与动机：'+(card.goalMotivation||'以章纲为准')), ...world.map(card=>card.title+'：'+(card.currentState||card.summary)),...hints.map(card=>'本章伏笔 · '+card.action+'：'+card.title+'。'+card.summary+' '+card.fields.map(([label,value])=>label+'：'+value).join('；'))].join('\n')+'\n\n这是展示所选卡片与章纲如何进入生成输入的本地示例。真实AI接入后，按章纲把人物行动和世界设定融入正文；当前不做语义冲突判断。')];
    }
    if (id === 'book') return ['青山来信','山门之外','长路有回声'].map(title => candidate(title + suffix,'在' + (values.genre || '玄幻') + '故事中，林逸面对「' + seed + '」。一封来信改变了他的方向，也让他重新选择愿意守护的人。'));
    if (id === 'golden') return ['回声罗盘','旧物留影','试炼记忆'].map(title => candidate(title + suffix,'围绕主角「' + values.protagonist + '」与核心灵感设计能力。只能追踪与自身选择有关的线索，每次使用需要付出记忆或时间的代价。',[['能力限制','不能直接获知真相，需要人物主动调查。'],['核心灵感',values.inspiration || seed]]));
    if (id === 'person') {
      const premise = values.inspiration || '', role = values.role || '配角';
      const goal = /主线目标：([^\n]+)/.exec(premise)?.[1] || /最终([^。]+)/.exec(premise)?.[1] || (premise ? '推进灵感中确立的主线' : '待根据本书核心灵感确定');
      const reason = /为了([^，。]+)/.exec(premise)?.[1]?.split(/进入|闯过|踏入|踏上/)[0] || '灵感中的人物处境与核心冲突；具体原因待作者确认';
      return ['谢云舟','沈知微','叶长风'].map((title,index) => ({...candidate(title + suffix,['性格冷静，善于观察。','行事果断，重视承诺。','为人谨慎，熟悉当地消息。'][index] + (values.requirement ? ' 补充方向：' + values.requirement : ''),[]),role,faction:values.faction || '',goalMotivation:premise ? '要做什么：' + (role === '主角' ? goal : role === '反派' ? '阻止主角完成「' + goal + '」，具体立场与利益待确认' : '围绕「' + goal + '」承担协助、引导或同行的作用，具体分工待确认') + '。\n为什么：' + (role === '主角' ? reason : '与主角主线有关的个人利益或情感原因待确认') + '。\n推进方向：先明确眼前要解决的危机，再调查阻碍目标的原因，最后围绕「' + goal + '」做出关键选择。' + (values.requirement ? '\n补充要求：' + values.requirement : '') : ''}));
    }
    if (id === 'world') {
      const extra = values.requirement ? ' 补充方向：' + values.requirement : '';
      if (['境界','修炼境界'].includes(values.category)) return [values.startRealm || '炼气','筑基','金丹','元婴',values.endRealm || '化神'].filter((name,index,all) => all.indexOf(name) === index).map((title,index) => ({...candidate(title,'修行体系第 ' + (index + 1) + ' 个境界，' + ['初步感知并运用灵气。','凝练灵力，建立稳定的修行根基。','凝结金丹，能够长时间御空。','孕育元婴，神识可离体探查。','神识与天地灵气相合。'][index % 5] + extra,[]),kind:'境界'}));
      const category = values.category || '势力', modern = ['都市','科幻'].includes(values.genre);
      const samples = {
        '势力':modern ? [['青云集团','总部位于东城区，是当地主要的科技企业。'],['长街商会','由旧街商户组成，负责协调商贸事务。'],['明川研究所','专门研究异常现象，与当地多家机构合作。']] : [['青云志','位于东皇大陆南域，是南域的顶级宗门之一，以剑修闻名。'],['玄剑门','位于南域西部，擅长御剑，是青云志的主要竞争宗门。'],['药谷','位于南域山谷，擅长炼丹与医术，常与各宗门往来。']],
        '地点':[['东皇大陆南域','东皇大陆南部区域，宗门众多，主要城镇依山而建。'],['落霞城','南域的贸易城镇，连接青云山和周边宗门。'],['青云山','位于南域东部，山中灵气充沛，是当地宗门驻地。']],
        '物品':[['聚气丹','常见修行丹药，帮助炼气期修士补充灵力。'],['青霜剑','剑修常用的灵剑，适合筑基期修士使用。'],['传音符','用于传递简短语音消息，宗门弟子常随身携带。']],
        '功法':[['归元诀','基础修行功法，用于凝练与恢复灵力。'],['青云剑诀','青云志的剑术功法，强调以灵力御剑。'],['凝神法','用于稳定心神并提升感知能力。']],
        '规则':[['境界顺序','修行依次分为炼气、筑基、金丹、元婴、化神。'],['宗门交易','宗门之间以灵石为主要交易媒介。'],['城内秩序','落霞城内禁止私斗，由城主府维持秩序。']],
        '其他':[['渡口集市','各地商旅交换消息和日用品的地方。'],['山门钟声','宗门用来通知集合与重大事务的信号。'],['旧路标','用于标记城镇之间的行路方向。']]
      };
      return (samples[category] || samples['其他']).map(([title,intro]) => ({...candidate(title + suffix,intro + extra,[]),kind:category}));
    }
    if (['outline','rewriteVolumes'].includes(id)) {
      const method = structures[values.structure] ? values.structure : '七点结构法', nodes = structures[method];
      return Array.from({length:Number(values.volumes || 1)},(_,i) => {
        const number = i + (context.resultStart || 1);
        return candidate('第' + number + '卷 · 主线阶段' + number + suffix,'本卷围绕已选灵感推进第' + number + '阶段。\n核心灵感：' + (values.inspiration || '待选定本书灵感') + '\n本卷目标：建立本阶段目标，逐步提高阻力，以主动选择完成阶段转折。\n补充方向：' + (values.requirement || '沿用灵感主线。'),[['依据灵感',values.inspiration || ''],['卷结构',method],['章节数',String(nodes.length)],['章节计划',nodes.map((node,index) => (index+1) + '. ' + node + '：围绕本卷目标安排具体事件、阻碍与人物选择（本地示例待完善）。').join('\n')]]);
      });
    }
    if (id === 'volumeChapters') {
      const method = structures[values.structure] ? values.structure : '七点结构法', nodes = structures[method];
      const plan = context.anchor?.fields?.find(([label]) => label === '章节计划')?.[1] || values.nodes || '';
      return nodes.map((node,index) => {
        const feeling = window.previewChapterEmotion(values.readerEmotion,index,nodes.length);
        return candidate('第' + ((context.resultStart || 1)+index) + '章 · ' + node + suffix,'本章承担「' + node + '」。\n读者情绪：' + feeling.curve + '\n依据卷纲：' + (values.volumeOutline || '待选定卷纲') + '\n对应节点安排：' + (String(plan).split('\n')[index] || node) + '\n本章目标：依据该节点推进主角目标。' + feeling.expectation + '\n阻碍与行动：依据卷纲安排具体事件与人物选择。' + feeling.mechanism + '\n结果与承接：完成本节点变化，承接' + (nodes[index+1] || '卷末余波') + '。' + feeling.ending + (values.requirement ? '\n补充要求：'+values.requirement : ''),[['卷结构',method],['结构节点',node],['节点序号',String(index+1)],['读者情绪体验',feeling.mode],['读者情绪',feeling.curve]]);
      });
    }
    if (id === 'rewriteChapters') return Array.from({length:Number(values.chapters || 3)},(_,i) => candidate('第' + (i + chapterNumber(values.anchor) + 1) + '章 · 后续推进' + suffix,'承接当前章节与所属卷纲，推进后续目标与冲突。\n依据卷纲：' + (values.volumeOutline || context.parentVolume?.summary || '') + '\n补充方向：' + (values.requirement || '沿用原卷主线。'),[]));
    if (id === 'chapterOutline') {
      const count = (structures[values.structure] || structures['七点结构法']).length;
      const index = Math.max(0,Math.min(count-1,Number(context.anchor?.fields?.find(([label]) => label==='节点序号')?.[1] || 1)-1));
      const feeling = window.previewChapterEmotion(values.readerEmotion,index,count);
      return [candidate(values.anchor || '本章新细纲','读者情绪：'+feeling.curve+'\n依据所属卷纲：'+(values.volumeOutline || '')+'\n原章纲：'+(values.chapterSource || '')+'\n本章目标：'+feeling.expectation+'\n冲突与行动：'+feeling.mechanism+'\n结果与承接：'+feeling.ending+(values.requirement?'\n补充要求：'+values.requirement:''),[['钩子',values.hook || '沿用本章节点安排。'],['爆点',values.climax || '由卷纲约束本章转折。'],['读者情绪体验',feeling.mode],['读者情绪',feeling.curve]])];
    }
    if (id === 'continue' || id === 'full') return [candidate(id === 'full' ? '整章正文示例' : '续写示例','晚钟停下后，林逸并没有立刻上山。他看见石阶旁有人蹲着，正把散落的信纸一张张收进怀里。\n\n“你也收到信了？”他问。那人抬头，没有回答，却递来一张画着渡口的纸。\n\n关于「' + seed + '」，他终于有了可以追问的方向。\n\n这是用于检查采用流程的短示例，正式模型接入后才按目标字数生成。')];
    if (id === 'polish') return [candidate('润色示例',values.source.trim() + '\n\n风从桥边吹过，未说出口的话终于有了停顿的地方。')];
    if (id === 'expand') return [candidate('扩写示例',values.source.trim() + '\n\n林逸伸手按住信纸。折痕里还留着潮气，像是有人握着它等过一场雨。他没有急着拆开，只先看向桥的另一边。')];
    if (id === 'summary') return [candidate('本章核心摘要 · 待核对',window.previewExtractSummaryEvidence(values.source))];
    if (id === 'ideas') {
      // Only these three user conditions inform inspiration; other book context is not used.
      const ideaGenre = values.genre || '玄幻', elements = String(values.elements || '').trim(), extra = String(values.requirement || '').trim();
      const setting = {
        '玄幻':['被逐出宗门的少年','救下即将被献祭的故乡','打破强者垄断的修行秩序'],
        '仙侠':['资质平庸的外门弟子','救回被封进轮回的家人','查清仙门以凡人续命的秘密'],
        '都市':['接手一家濒临倒闭小店的年轻人','阻止家人将在三十天后遭遇的事故','让被人为抹去的一群人重新找回身份'],
        '科幻':['废弃空间站里的维修员','在能源耗尽前带幸存者返回地球','找出反复重启文明的幕后系统'],
        '悬疑':['追查亲人失踪案的普通人','找到失踪亲人并阻止下一次失踪','揭开一座城市集体遗忘的旧案'],
        '其他':['处境艰难的普通人','救回被卷入异常事件的家人','改变让普通人不断失去选择权的规则']
      }[ideaGenre] || ['处境艰难的普通人','救回失踪的家人','查清世界异常背后的真相'];
      const plans = [
        ['看见未来，改写命运','预知未来',setting[1],'主角发现眼前的危机与一场更大的阴谋有关'],
        ['读取回声，追查真相','读取过去的记忆',setting[2],'越接近真相，越会引来掌握旧秩序的人阻挠'],
        ['带着记忆，打破循环','在时间循环中保留记忆',setting[1] + '，最终找出循环源头','循环背后的真相与主角想要保护的人有关']
      ];
      return plans.map(([title,gift,goal,obstacle]) => candidate(title + suffix,'题材：' + ideaGenre + '\n指定元素：' + elements + '\n\n主角：' + setting[0] + '。\n金手指方向：' + gift + '。\n主线目标：' + goal + '。\n核心矛盾：' + obstacle + '。\n\n整书主线：' + setting[0] + '在与「' + elements + '」相关的事件中意外获得' + gift + '的能力，为了' + goal + '，从解决身边危机逐步追查事件背后的原因，最终面对幕后力量，争取改变自己和身边人的命运。' + (extra ? '\n\n补充方向：' + extra : ''),[['题材',ideaGenre],['指定元素',elements],['金手指方向',gift],['主线目标',goal],...(extra ? [['补充要求',extra]] : [])]));
    }
    if (id === 'prompt') return [candidate('练笔题目示例','在' + values.direction + '练习中，写一个人在雨停前收到迟到三年的回信，却没有立刻拆开的瞬间。')];
    if (id === 'practice') return [candidate('练笔文风分析','句式：动作描写与短句交替。\n用词：用具体物件承载记忆。\n情绪：以停顿替代直接解释。\n建议：在转折处让人物主动选择，而不是等待答案。')];
    if (id === 'style') return [candidate('我的文风卡','已有特征：' + (values.oldStyle || '尚无旧卡') + '\n\n新观察：' + values.analysis + '\n\n可执行建议：日常场景保留具体感官细节；冲突升级时使用短句；情绪转折用动作与对话呈现。')];
    if(['passage','bookAnalysis'].includes(id))return values.dimensions.map(dimension=>candidate(dimension+'：让选择推进故事','先设置明确目标和阻碍，再让人物作出有代价的选择。用于冲突推进，避免替人物直接解释情绪。',[['分析维度',dimension],['原文依据',(values.source||context.reading.text).slice(0,80)],['适用场景','人物面临选择的转折处'],['不适用情况','没有对应证据时不要机械套用']]));
    if (['passage','bookAnalysis','textAnalysis'].includes(id)) {
      let evidence = values.source || context.reading?.text || '', sampled = '';
      if (id === 'bookAnalysis') {
        const chapters = context.reading.chapters, limit = values.range === '前三章' ? 3 : 10, n = Math.min(limit,chapters.length);
        const indices = Array.from({length:n},(_,i) => values.range === '均匀采样十章' && n > 1 ? Math.round(i * (chapters.length - 1) / (n - 1)) : i);
        sampled = '\n分析范围：' + values.range + ' · 实际 ' + n + ' 章\n样本章节：' + indices.map(i => chapters[i].title).join('、');
        evidence = indices.map(i => chapters[i].title + '：' + chapters[i].body.slice(0,80)).join('\n');
      }
      return [candidate((values.title || context.reading?.title || '阅读片段') + ' · 拆书报告','结构：通过一个具体物件提出问题，再用选择推动情节。\n文风：动作、空间与对话结合，留出停顿。\n人物：愿望与责任之间形成张力。\n节奏：提出问题后留出一次观察，再进入选择。\n亮点：让物件与人物的情感关系相互呼应。\n大纲样例：来信提出疑问 → 寻找见证人 → 选择承担代价。\n可借鉴点：让下一章承接本章留下的问题。\n\n观察来源：' + evidence + sampled + '\n分析维度：' + (Array.isArray(values.dimensions) ? values.dimensions.join('、') : '文风、结构、节奏、人物'),id === 'textAnalysis' ? [['作者',values.author || '未填写'],['来源正文',values.source]] : [])];
    }
    if(['techniques','mergeRules'].includes(id)){const groups=new Map();for(const item of context.mergeItems){const key=item.summary.replace(/\s/g,'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}return [...groups.values()].filter(items=>items.length>1).map(items=>({...candidate(items[0].title,items[0].summary,[['合并前条目',items.map(x=>x.title+'：'+x.summary).join('\n\n')]]),sourceIds:items.map(x=>x.id)}));}
    if (id === 'tips') return ['用物件提出悬念','用动作推动转折','让结尾留下具体问题','对话保留信息差','让选择承担代价'].map(title => candidate(title,'使用时机：人物即将做出决定。\n执行方法：先展示一个可观察的细节，再安排阻碍，让人物通过选择改变局面。\n观察来源：' + values.source.slice(0,100)));
    if (id === 'rules' || id === 'mergeRules') return Array.from({length:Number(values.count || 3)},(_,i) => candidate(['减少抽象情绪标签','避免连续模板句','让人物选择具有代价','减少重复的解释','对话保留人物差异','修辞服务于场景','用行为表达情绪','保留因果与代价'][i],'规则：用具体动作与细节替代泛泛解释。\n适用范围：对话、转折与人物描写。\n输入依据：' + values.source.slice(0,100) + '\n原因：' + (values.reason || '相近规则合并，保留各自适用条件。')));
    return [candidate('连接测试流程示例','示例回复：连接成功。\n这只是本地演示，没有发送请求，不能据此判断真实服务是否可用。')];
  };

  window.createPreviewAI = ({switchView,notice,pages,books,features,writingContext,applyWriting,saveSummary,getCurrentChapterId,chapterReferences,getWritingChapters}) => {
    const dialog = $('ai-workflow-dialog'), form = $('ai-workflow-form'); let requestId; let operation,context,trigger,results = [],selected = new Set(),active = 0,round = 0,token = 0,timer,busy = false,undo = null;
    const goalWrapper = node('div'); goalWrapper.id = 'ai-person-goal-wrapper'; goalWrapper.hidden = true; const goalLabel = node('label','目标与动机（可修改）'); goalLabel.htmlFor = 'ai-person-goal'; const goalInput = node('textarea'); goalInput.id = 'ai-person-goal'; goalInput.maxLength = 20000; goalWrapper.append(goalLabel,goalInput); $('ai-adopt-consequence').before(goalWrapper);
    const resultFields=node('details');resultFields.append(node('summary','查看生成明细与原文依据'));const resultFieldBody=node('dl');resultFields.append(resultFieldBody);if(window.desktop)$('ai-candidate-content').after(resultFields);
    const acknowledgeLabel=node('label',undefined,'setting');const acknowledge=node('input');acknowledge.type='checkbox';acknowledgeLabel.append(acknowledge,document.createTextNode('已人工核对无法确认的内容，愿意采用'));acknowledgeLabel.hidden=true;if(window.desktop)$('ai-adopt-consequence').after(acknowledgeLabel);
    const recheck=node('button','重新核对修改后的正文','btn');recheck.type='button';recheck.hidden=true;if(window.desktop)$('ai-adopt-consequence').after(recheck);
    const reflect=()=>{if(!window.desktop || !results[active])return;resultFieldBody.replaceChildren();for(const [label,value] of results[active].fields || [])resultFieldBody.append(node('dt',label),node('dd',value));resultFields.hidden=!resultFieldBody.children.length;resultFields.open=['techniques','mergeRules'].includes(operation);recheck.hidden=!['full','continue','polish','expand'].includes(operation);acknowledge.checked=false;acknowledgeLabel.hidden=results[active].semanticReview?.status!=='uncertain';};
    recheck.addEventListener('click',async()=>{if(busy)return;const version=++token;requestId=crypto.randomUUID();setBusy(true);recheck.disabled=true;try{const checked=await window.desktop.generate({requestId,operation,reviewOnly:true,values:context.values,context:{...context,candidates:[results[active]]}});if(version!==token || !dialog.open)return;results[active]=checked[0];showActive(active);}catch(error){if(version===token)$('ai-workflow-error').textContent=error.message;}finally{if(version===token){requestId=null;setBusy(false);}recheck.disabled=false;}});
    const practiceReports = new Map(window.desktopStore?.get('aiReports') || []);window.desktopStore?.register('aiReports',()=>[...practiceReports]); const grow = input => { input.style.height = 'auto'; input.style.height = Math.min(440,Math.max(150,input.scrollHeight)) + 'px'; };
    const setBusy = value => { busy = value; form.setAttribute('aria-busy',String(value)); $('ai-workflow-generate').disabled = value; $('ai-workflow-stop').hidden = !value; $('ai-workflow-adopt').disabled = value; form.querySelectorAll('#ai-workflow-fields input,#ai-workflow-fields textarea,#ai-workflow-fields select').forEach(input => input.disabled = value); };
    const stop = () => { if(requestId){window.desktop?.cancel(requestId);requestId=null;} token++; clearTimeout(timer); setBusy(false); $('ai-workflow-status').textContent = '已停止，填写的条件保留。'; };
    const clearResults = () => { results = []; selected.clear(); $('ai-workflow-results').hidden = true; $('ai-output-empty').hidden = false; $('ai-workflow-error').textContent = ''; };
    const quality = window.createPreviewQuality({onChange:()=>{ if(busy) stop(); clearResults(); $('ai-workflow-status').textContent='参考资料已改变，请重新生成。'; }});
    const refreshFields = (values) => {
      const container = $('ai-workflow-fields'); container.replaceChildren();
      window.previewAIOperations[operation].fields.forEach(original => {
        const schema = original.key === 'inspirationId' ? {...original,options:(context.inspirations || []).map(note => note.id)} : original;
        const wrapper = node(schema.checks ? 'fieldset' : 'div',undefined,'ai-field'),label = node(schema.checks ? 'legend' : 'label',schema.label + (schema.required ? ' *' : ''));
        const id = 'ai-field-' + schema.key; if (!schema.checks) label.htmlFor = id; wrapper.append(label);
        if (schema.checks) schema.checks.forEach(option => { const choice = node('label',undefined,'ai-check'); const input = node('input'); input.type = 'checkbox'; input.name = schema.key; input.value = option; input.checked = true; choice.append(input,node('span',option)); wrapper.append(choice); });
        else {
          const input = node(schema.multiline ? 'textarea' : schema.options ? 'select' : 'input'); input.id = id; input.name = schema.key; input.setAttribute('aria-describedby','ai-workflow-error');
          if (schema.options) schema.options.forEach(option => { const item = node('option',schema.key === 'inspirationId' ? context.inspirations.find(note => note.id === option).title : option); item.value = option; input.append(item); });
          if (schema.checkbox) { input.type = 'checkbox'; input.checked = schema.value === true; }
          else { if (!schema.multiline && !schema.options) input.type = schema.number ? 'number' : 'text'; input.value = values[schema.key] ?? schema.value ?? schema.options?.[0] ?? ''; }
          if (schema.number) { input.min = schema.min; input.max = schema.max; } else if (!schema.options && !schema.checkbox) input.maxLength = schema.multiline ? 20000 : 240;
          if (schema.readonly) input.readOnly = true; if (schema.required) input.setAttribute('aria-required','true'); input.placeholder = schema.placeholder || '';
          if (schema.multiline) input.addEventListener('input',event => { if (!event.isComposing) grow(input); }); wrapper.append(input);
          if (schema.hint) { const hint = node('p',schema.hint,'field-hint'); hint.id = id + '-hint'; wrapper.append(hint); input.setAttribute('aria-describedby',hint.id + ' ai-workflow-error'); }
        }
        container.append(wrapper);
      });
    };
    const open = (id,sourceButton) => {
      if (id === 'ideas' && sourceButton.closest('#bookhome-view')) { notice('请到灵感板块生成，再从灵感库选入这本书。'); return; }
      if (id === 'golden' && (!sourceButton.closest('#bookhome-view') || !books.getInspirations().length)) { notice('请先为这本书选定一条核心灵感。'); return; }
      stop(); clearResults(); operation = id; trigger = sourceButton; round = 0;
      const spec = window.previewAIOperations[id]; context = {writing:writingContext(),reading:features.getReadingContext(),practice:pages.getPracticeContext(),outlines:pages.getAIContext('outline','大纲'),chapterOutlines:pages.getAIContext('outline','章节细纲')};
      if (sourceButton.closest('#bookhome-view,#characters-view,#world-view') || ['person','continue','full','polish','expand','outline','rewriteVolumes','volumeChapters','rewriteChapters','chapterOutline'].includes(id)) context.bookHome = books.currentBookContext();
      if (spec.view === 'editor') context.bookHome = window.desktopStore ? books.currentBookContext() : books.bookInfo('main');
      context.inspirations = books.getInspirations(context.bookHome?.id); context.characters = pages.getAIContext('characters',undefined,context.bookHome?.id).people;
      if(id==='book')context.inspirations=pages.getAIContext('ideas','灵感').items;
      const story = window.previewProgression && pages.getStoryContext ? pages.getStoryContext(context.bookHome?.id || 'main',spec.view === 'editor' ? Number(context.writing.id) || Infinity : Infinity) : {people:context.characters,world:[]}; context.characters = story.people; context.world = story.world;
      if (['continue','full','polish','expand'].includes(id)) {
        const references = chapterReferences.get(context.writing.id);
        if (references.missing.length) { notice('本章有选中卡片已删除，请重新选择后生成。'); return; }
        try { window.previewForeshadowingTransition(pages.getForeshadowing(window.desktopStore ? context.bookHome.id : 'main'),references.foreshadowing.map(card=>({id:card.id,action:card.action})),context.writing.id); } catch(error){notice(error.message);return;}
        context.chapterSelection = JSON.parse(JSON.stringify(references)); context.referenceSnapshot = chapterReferences.snapshot(context.writing.id);
        context.characters = context.chapterSelection.people; context.world = context.chapterSelection.world;
        context.chapterOutline = window.desktopChapterLinks ? window.desktopChapterLinks.resolve(context.writing,context.chapterOutlines.items) : context.chapterOutlines.items.find(item => chapterNumber(item.title) === Number(context.writing.id)) || context.chapterOutlines.items.find(item => context.writing.title && item.title.includes(context.writing.title));
        if (!context.chapterOutline) { notice('这章还没有对应章纲，请先在大纲与伏笔中准备本章章纲。'); return; }
        context.memory=window.previewBuildChapterMemory(getWritingChapters(),context.writing.id);
        context.constraint = '选中的人物和世界观必须参与本章，读取截至本章的设定；章纲剧情优先，不为塞入卡片另起主线。如果存在设定或出场冲突，需作者确认，不能擅自复活、升级或改写势力状态。';
      }
      const selectedOutline = context.outlines.items.find(item => item.id === context.outlines.selected) || context.outlines.items[0]; const selectedChapter = context.chapterOutlines.items.find(item => item.id === context.chapterOutlines.selected) || context.chapterOutlines.items[0];
      context.anchor = ['rewriteChapters','chapterOutline'].includes(id) ? selectedChapter : selectedOutline;
      if (id === 'outline') context.resultStart = context.outlines.items.length + 1;
      context.parentVolume = ['rewriteChapters','chapterOutline'].includes(id) ? context.outlines.items.find(item => context.anchor?.fields.some(([label,value]) => label === '所属卷ID' ? value === item.id : label === '所属卷' && value === item.title)) : selectedOutline;
      if (['outline','rewriteVolumes'].includes(id) && !context.inspirations[0]?.summary) { notice('请先到作品首页从灵感库选定一条灵感，再生成卷纲。'); return; }
      if (['volumeChapters','chapterOutline','rewriteChapters'].includes(id) && !context.parentVolume) { notice('请先创建并选定对应卷纲，再生成章纲。'); return; }
      if (id === 'rewriteVolumes') context.resultStart = context.outlines.items.findIndex(item => item.id === context.anchor.id) + 2;
      if (id === 'rewriteChapters') { const volume = context.anchor.fields.find(([label]) => label === '所属卷')?.[1]; context.chapterOutlines.items = context.chapterOutlines.items.filter(item => !volume || item.fields.some(([label,value]) => label === '所属卷' && value === volume)); }
      if (id === 'volumeChapters') {
        const prior = context.outlines.items.slice(0,context.outlines.items.findIndex(item => item.id === context.anchor.id));
        context.resultStart = 1 + prior.reduce((sum,item) => sum + Number(item.fields.find(([label]) => label === '章节数')?.[1] || (structures[item.fields.find(([label]) => label === '卷结构')?.[1]] || structures['七点结构法']).length),0);
      }
      const values = {anchor:context.anchor?.title,topic:context.practice.prompt};
      if (context.bookHome) { const genre = context.bookHome.genre.split(' · ')[0]; if (['玄幻','都市','仙侠','科幻','悬疑','其他'].includes(genre)) values.genre = genre; if (!window.desktopStore && context.bookHome.id === 'main') values.protagonist = '林逸，出身小山村的仙门新弟子'; }
      if (['person','book'].includes(id)) { values.inspirationId = context.inspirations[0]?.id || ''; values.inspiration = context.inspirations[0]?.summary || ''; }
      if (id === 'golden') { values.inspiration = context.inspirations[0]?.summary || ''; }
      if (['outline','rewriteVolumes'].includes(id)) { values.inspiration = context.inspirations[0]?.summary || ''; values.structure = '七点结构法'; values.chapters = 7; values.nodes = structures[values.structure].map((node,index) => (index+1) + '. ' + node).join('\n'); }
      if (['volumeChapters','chapterOutline','rewriteChapters'].includes(id)) {
        const volume = context.parentVolume;
        values.volumeOutline = volume.title + '\n' + volume.summary + '\n' + volume.fields.map(([label,value]) => label+'：'+value).join('\n');
        values.chapterSource = context.anchor.summary;
        values.readerEmotion = context.anchor.fields.find(([label]) => label === '读者情绪体验')?.[1] || '根据卷纲自动安排';
        values.structure = volume.fields.find(([label]) => label === '卷结构')?.[1] || '七点结构法';
        if (!structures[values.structure]) values.structure = '七点结构法';
        values.chapters = structures[values.structure].length;
        values.nodes = volume.fields.find(([label]) => label === '章节计划')?.[1] || structures[values.structure].map((node,index) => (index+1)+'. '+node).join('\n');
      }
      if (id === 'rewriteVolumes') values.volumes = Math.max(1,context.outlines.items.length - context.outlines.items.findIndex(item => item.id === context.anchor?.id) - 1);
      if (id === 'rewriteChapters') values.chapters = Math.max(1,context.chapterOutlines.items.length - context.chapterOutlines.items.findIndex(item => item.id === context.anchor?.id) - 1);
      if (id === 'continue') values.source = context.writing.body.slice(0,context.writing.start);
      if (id === 'polish' || id === 'expand') values.source = context.writing.body.slice(context.writing.start,context.writing.end);
      if (id === 'summary') values.source = context.writing.body;
      if (id === 'full') values.outline = context.chapterOutline.summary;
      if (id === 'practice') values.source = context.practice.text;
      if (id === 'passage') values.source = context.reading.text;
      if (id === 'tips') values.source = [...new Set([...(context.reading.reports||[]).map(item=>item.text),...Object.values(context.reading.notes)].filter(Boolean))].join('\n\n');
      if (id === 'style') { values.analysis = practiceReports.get(context.practice.index) || ''; values.oldStyle = pages.getAIContext('library','写作技巧').items.find(item => item.title === '我的文风卡')?.summary || ''; }
      if (id === 'techniques' || id === 'mergeRules') {context.mergeItems=pages.getAIContext('library',id === 'techniques' ? '写作技巧' : '避雷规则').items.filter(item => id !== 'techniques' || item.title !== '我的文风卡');if(context.mergeItems.length<2){notice('至少有两条条目才能检查重复。');return;}values.source=context.mergeItems.map(item=>item.title+'：'+item.summary).join('\n\n');}
      if(window.desktop && id==='style'){values.analysis=JSON.stringify(window.previewPracticeController.acceptedAnalysis());if(values.analysis==='[]'){notice('先分析并人工核对自己的练习，再提炼个人文风。');return;}}
      if (id === 'test') values.source = '';
      refreshFields(values); if (['person','book'].includes(id)) $('ai-field-inspirationId').addEventListener('change',() => { $('ai-field-inspiration').value = context.inspirations.find(note => note.id === $('ai-field-inspirationId').value)?.summary || ''; grow($('ai-field-inspiration')); clearResults(); }); $('ai-workflow-title').textContent = spec.label; $('ai-workflow-context').textContent = context.bookHome ? context.bookHome.name : spec.view === 'editor' ? books.primaryTitle() + ' / ' + context.writing.title : spec.view === 'library' ? context.reading.title : books.primaryTitle();
      if (context.chapterSelection) $('ai-workflow-context').textContent += ' · 本章已选：' + ([...context.characters.map(card=>card.name),...context.world.map(card=>card.title),...context.chapterSelection.foreshadowing.map(card=>card.title+'（'+card.action+'）')].join('、') || '未额外选择卡片') + ' · 以本章章纲为准';
      if (['outline','rewriteVolumes'].includes(id)) $('ai-field-structure').addEventListener('change',() => { const nodes = structures[$('ai-field-structure').value]; $('ai-field-chapters').value = nodes.length; $('ai-field-nodes').value = nodes.map((node,index) => (index+1)+'. '+node).join('\n'); grow($('ai-field-nodes')); clearResults(); });
      $('ai-demo-response').value = 'success'; $('ai-workflow-status').textContent = '结果采用后可撤销；阅读分析与技巧保存在本机，其他生成仍为本页预览。'; $('ai-workflow-generate').textContent = '生成示例结果';
      const consequence = ['rewriteVolumes','rewriteChapters','volumeChapters','chapterOutline','full','polish','expand','techniques','mergeRules'].includes(id);
      quality.open(id,context,group=>pages.getAIContext('library',group));
      if(context.memory){const pack=quality.packageInput();$('ai-workflow-context').textContent+=' · 前文摘要'+context.memory.summaries.length+'条 · 技巧/规则'+pack.materials.length+'条';if(context.memory.stale.length || context.memory.missing.length)$('ai-workflow-context').textContent+='（前文有摘要缺失或过期，已排除并保留前章结尾）';}
      $('ai-adopt-consequence').textContent = consequence ? '采用会更新对应的本页内容；请先检查结果，操作后可撤销。真实作品不受影响。' : id === 'book' ? '带入作品表单后，仍需确认创建或保存。' : '采用后加入对应的本页内容，刷新恢复示例。';
      $('ai-workflow-adopt').textContent=['passage','bookAnalysis'].includes(id)?'收录所选写作技巧':'采用已选结果';
      if(['passage','bookAnalysis','tips'].includes(id)) { $('ai-adopt-consequence').textContent='勾选需要的技巧，直接收录到“资料库 → 写作技巧”，保留原书依据，创作时可选择使用。'; }
      if(['techniques','mergeRules'].includes(id)){$('ai-workflow-context').textContent=(id==='techniques'?'写作技巧':'避雷规则')+' · '+context.mergeItems.length+' 条现有条目';$('ai-adopt-consequence').textContent='只替换你勾选的重复组。未重复条目和未勾选组保留，可撤销合并。';$('ai-workflow-adopt').textContent='确认合并所选重复组';}
      dialog.showModal(); form.querySelectorAll('textarea').forEach(grow); (form.querySelector('#ai-workflow-fields input:not([readonly]),#ai-workflow-fields textarea:not([readonly]),#ai-workflow-fields select') || $('ai-workflow-generate')).focus();
    };
    const readValues = () => {
      const values = {}; let invalid;
      window.previewAIOperations[operation].fields.forEach(schema => {
        if (schema.checks) { values[schema.key] = [...form.querySelectorAll('[name="' + schema.key + '"]:checked')].map(input => input.value); if (!values[schema.key].length) invalid = invalid || {message:'至少选择一个分析维度。',input:form.querySelector('[name="' + schema.key + '"]')}; return; }
        const input = $('ai-field-' + schema.key); input.removeAttribute('aria-invalid'); values[schema.key] = schema.checkbox ? input.checked : input.value.trim();
        if (schema.key === 'inspirationId' && !values[schema.key]) { invalid = {message:'请先选定一条有内容的核心灵感，再生成。',input}; return; }
        if (schema.required && !values[schema.key]) invalid = invalid || {message:['polish','expand'].includes(operation) ? '请先返回正文选择一段文字，再打开此操作。' : '请填写' + schema.label + '。',input};
        if (schema.number && (!Number.isInteger(Number(values[schema.key])) || Number(values[schema.key]) < schema.min || Number(values[schema.key]) > schema.max)) invalid = invalid || {message:schema.label + '需为 ' + schema.min + '–' + schema.max + ' 的整数。',input};
      });
      const words = Array.from((values.source || '').replace(/\s/g,'')).length;
      if (operation === 'practice' && (words < 100 || words > 300)) invalid = {message:'练笔需要 100–300 字，请先回练习页补充或调整正文。',input:$('ai-field-source')};
      if (operation === 'bookAnalysis' && !context.reading.chapters.some(chapter => chapter.body.trim())) invalid = {message:'当前阅读稿还没有正文。',input:$('ai-workflow-generate')};
      if (['rewriteVolumes','rewriteChapters'].includes(operation)) { const items = operation === 'rewriteVolumes' ? context.outlines.items : context.chapterOutlines.items; if (items.findIndex(item => item.id === context.anchor?.id) === items.length - 1) invalid = {message:'当前条目已经是最后一项，没有后续内容可重写。请返回选择前面的卷或章节。',input:$('ai-workflow-generate')}; }
      if (operation === 'test' && !window.desktop && !validateConfig()) invalid = {message:'请先在 AI 服务页填写有效的示例地址、示例密钥和模型名称。',input:$('ai-workflow-generate')};
      if (invalid) { $('ai-workflow-error').textContent = invalid.message; invalid.input?.setAttribute('aria-invalid','true'); invalid.input?.focus(); return null; }
      return values;
    };
    const showActive = index => { active = index; $('ai-person-goal-wrapper').hidden = operation !== 'person'; $('ai-person-goal').value = results[index].goalMotivation || ''; if (operation === 'person') grow($('ai-person-goal')); $('ai-candidate-title').value = results[index].title; $('ai-candidate-content').value = results[index].summary; grow($('ai-candidate-content')); document.querySelectorAll('[data-ai-candidate]').forEach(button => button.setAttribute('aria-pressed',String(Number(button.dataset.aiCandidate) === index))); quality.review([results[index]],context.values);if(window.desktop){const review=results[index].semanticReview;$('ai-workflow-status').textContent=review ? ({pass:'已通过独立核对，请作者最终确认',issues:'发现待修订问题',uncertain:'存在无法确认的内容，请核对'}[review.status])+(review.issues.length?'：'+review.issues.map(x=>x.reason).join('；'):''):'候选已生成，请核对后采用';}reflect(); };
    const renderResults = () => {
      if(!results.length){clearResults();$('ai-workflow-status').textContent='没有发现可合并的重复条目，现有列表保持原样。';return;}
      const list = $('ai-candidate-list'); list.replaceChildren(); const single = ['book','continue','polish','expand','full','summary','prompt','practice','style','textAnalysis','test','chapterOutline'].includes(operation);
      results.forEach((result,index) => { const row = node('div',undefined,'ai-candidate-row'),input = node('input'); input.type = single ? 'radio' : 'checkbox'; input.name = 'ai-result-selection'; input.checked = selected.has(index); input.setAttribute('aria-label','选择 ' + result.title); input.addEventListener('change',() => { if (single) selected.clear(); if (input.checked) selected.add(index); else selected.delete(index); showActive(index); }); const show = node('button',result.title); show.type = 'button'; show.dataset.aiCandidate = index; show.addEventListener('click',() => showActive(index)); row.append(input,show); list.append(row); });
      $('ai-select-all').hidden = single; $('ai-select-none').hidden = single; $('ai-workflow-results').hidden = false; $('ai-output-empty').hidden = true; showActive(0);
    };
    form.addEventListener('submit',async event => {
      event.preventDefault(); if (busy) return; $('ai-workflow-error').textContent = ''; const values = readValues(); if (!values) return;
      clearResults(); quality.clear(); context.quality=quality.packageInput(); setBusy(true); const version = ++token; $('ai-workflow-status').textContent = '正在准备本地示例结果…';
      if(window.desktop){
        requestId=crypto.randomUUID(); const currentRequest=requestId;
        context.values=values;context.structureNodes=structures[values.structure] || [];
        if(context.bookHome)context.golden=books.getGolden(context.bookHome.id);
        if(operation==='book'){const premise=pages.getAIContext('ideas','灵感').items.find(item=>item.id===values.inspirationId);if(!premise || premise.summary!==values.inspiration){setBusy(false);$('ai-workflow-error').textContent='灵感已变化，请重新选择后生成。';return;}}
        if(operation==='bookAnalysis'){
          const chapters=context.reading.chapters.filter(c=>c.body.trim());
          const sample=values.range==='整本书'?chapters:values.range==='均匀采样十章'?Array.from({length:Math.min(10,chapters.length)},(_,i)=>chapters[Math.round(i*(chapters.length-1)/Math.max(1,Math.min(10,chapters.length)-1))]):chapters.slice(0,values.range==='前三章'?3:10);
          context.reading={...context.reading,chapters:sample,totalChapters:chapters.length,coverage:sample.length};
        }
        if(['passage','tips'].includes(operation))context.reading={id:context.reading.id,title:context.reading.title,chapter:context.reading.chapter,chapterTitle:context.reading.chapterTitle,text:values.source,notes:context.reading.notes};
        $('ai-workflow-status').textContent='正在生成并核对，请稍候…';
        try{results=await window.desktop.generate({requestId:currentRequest,operation,values,context:JSON.parse(JSON.stringify(context))});if(version!==token || !dialog.open)return;selected=new Set(['outline','rewriteVolumes','rewriteChapters','volumeChapters'].includes(operation)?results.map((_,i)=>i):[0]);renderResults();$('ai-workflow-generate').textContent='重新生成';$('ai-workflow-status').textContent=results.length?results.length+' 个候选 · 尚未采用':'没有发现可合并的重复条目，现有列表保持原样。';}
        catch(error){if(version===token){$('ai-workflow-error').textContent=error.message;$('ai-workflow-status').textContent='未写入任何内容，条件保留。';}}
        finally{if(version===token){requestId=null;setBusy(false);}}
        return;
      }
      timer = setTimeout(() => { if (version !== token || !dialog.open) return; setBusy(false);
        const failure = $('ai-demo-response').value; if (failure !== 'success') { $('ai-workflow-error').textContent = {network:'示例错误：连接失败。条件保留，可切换为正常结果后重试。',empty:'示例错误：返回内容为空。请调整条件或重新生成。',format:'示例错误：返回格式异常。请重新生成。'}[failure]; $('ai-workflow-status').textContent = '未写入任何内容。'; return; }
        context.values = values; results = window.buildPreviewAIResults(operation,values,context,++round); selected = new Set(['outline','rewriteVolumes','rewriteChapters','volumeChapters'].includes(operation) ? results.map((_,i) => i) : [0]); renderResults(); $('ai-workflow-generate').textContent = '重新生成示例'; $('ai-workflow-status').textContent = results.length ? results.length + ' 个示例结果 · 尚未采用' : '没有发现可合并的重复条目，现有列表保持原样。'; $('ai-candidate-list').querySelector('button').focus();
      },700);
    });
    $('ai-workflow-stop').addEventListener('click',stop); $('ai-workflow-close').addEventListener('click',() => dialog.close());
    dialog.addEventListener('cancel',event=>{if($('ai-workflow-close').disabled)event.preventDefault();else stop();}); dialog.addEventListener('close',() => { if(dialog.open)return; stop(); if (!document.querySelector('dialog[open]') && trigger?.isConnected && trigger.offsetParent !== null) trigger.focus(); });
    $('ai-workflow-fields').addEventListener('input',event => { if (event.isComposing) return; if (busy) stop(); clearResults(); event.target.removeAttribute('aria-invalid'); $('ai-workflow-status').textContent = '条件已更新，请重新生成示例。'; if (event.target.tagName === 'TEXTAREA') grow(event.target); });
    $('ai-workflow-fields').addEventListener('compositionstart',() => { if (busy) stop(); clearResults(); }); $('ai-workflow-fields').addEventListener('compositionend',clearResults);
    $('ai-select-all').addEventListener('click',() => { selected = new Set(results.map((_,index) => index)); renderResults(); }); $('ai-select-none').addEventListener('click',() => { selected.clear(); renderResults(); });
    $('ai-candidate-title').addEventListener('input',event => { if (event.isComposing) return; results[active].title = event.target.value; const button = document.querySelector('[data-ai-candidate="' + active + '"]'); if (button) button.textContent = event.target.value || '未命名候选'; quality.review([results[active]],context.values); });
    $('ai-candidate-title').addEventListener('compositionend',event => { results[active].title = event.target.value; });
    const invalidate=()=>{if(window.desktop && results[active]?.semanticReview){results[active].semanticReview={status:'uncertain',issues:[],edited:true};reflect();$('ai-workflow-status').textContent='正文已人工修改，请重新核对这一版后采用。';}};
    $('ai-candidate-content').addEventListener('input',invalidate);$('ai-candidate-content').addEventListener('compositionend',invalidate);
    $('ai-candidate-content').addEventListener('input',event => { if (event.isComposing) return; results[active].summary = event.target.value; grow(event.target); quality.review([results[active]],context.values); }); $('ai-candidate-content').addEventListener('compositionend',event => { results[active].summary = event.target.value; quality.review([results[active]],context.values); });
    $('ai-person-goal').addEventListener('input',event => { if (!event.isComposing && results[active]) { results[active].goalMotivation = event.target.value; grow(event.target); } }); $('ai-person-goal').addEventListener('compositionend',event => { if (results[active]) results[active].goalMotivation = event.target.value; });
    const adopt = async chosen => {
      if(['techniques','mergeRules'].includes(operation)){
        const group=operation==='techniques'?'写作技巧':'避雷规则',current=pages.getAIContext('library',group).items,used=new Set();
        for(const item of chosen){if(!Array.isArray(item.sourceIds)||item.sourceIds.length<2)throw new Error('合并结果缺少对应的原条目，请重新检查。');for(const id of item.sourceIds){const original=context.mergeItems.find(x=>x.id===id),latest=current.find(x=>x.id===id);if(used.has(id)||!original||JSON.stringify(original)!==JSON.stringify(latest))throw new Error('原条目已变化或重复分组，请重新检查，未修改列表。');used.add(id);}}
        const readingUndo=await features.removeMergedReadingMaterials([...used]);
        let undoRecords;try{undoRecords=pages.applyAIRecords('library',group,chosen.map(x=>({...x,kind:group==='写作技巧'?'写作技巧':'避雷规则'})),{ids:[...used]});}catch(error){await readingUndo.undo();throw error;}
        return {undo:async()=>{if(!readingUndo.canUndo()||!undoRecords())return false;return readingUndo.undo();}};
      }
      if(window.desktop && context.bookHome && context.bookHome.id!==books.currentBookContext().id)throw new Error('当前作品已切换，请重新打开生成。');
      const v = context.values, operationView = window.previewAIOperations[operation].view;
      if (context.chapterSelection) {
        if(JSON.stringify(window.previewBuildChapterMemory(getWritingChapters(),context.writing.id))!==JSON.stringify(context.memory))throw new Error('前文正文或摘要已变化，请重新生成。');
        if (chapterReferences.snapshot(context.writing.id) !== context.referenceSnapshot) throw new Error('本章选择或卡片设定已变化，请保留结果并重新生成。');
        const outlineNow = pages.getAIContext('outline','章节细纲').items.find(item=>item.id===context.chapterOutline.id);
        if (JSON.stringify(outlineNow) !== JSON.stringify(context.chapterOutline)) throw new Error('本章章纲已变化，请重新生成。');
        const names=[...context.characters.map(card=>card.name),...context.world.map(card=>card.title)];
        const resultingText=result=>operation==='full'?result.summary:context.writing.body.slice(0,context.writing.start)+result.summary+context.writing.body.slice(operation==='continue'?context.writing.start:context.writing.end);
        if (chosen.some(result=>names.some(name=>!resultingText(result).includes(name)))) throw new Error('结果遗漏本章选中的人物或世界观，请补充或重新生成后采用。');
      }
      if (context.bookHome && ['ideas','golden'].includes(operation)) {
        if (operation === 'golden' && books.getInspirations(context.bookHome.id)[0]?.summary !== context.values.inspiration) throw new Error('本书灵感已修改，请关闭窗口后重新生成金手指。');
        return {undo:books.applyHomeAI(context.bookHome.id,operation === 'ideas' ? 'ideas' : 'golden',chosen)};
      }
      if (operation === 'book') return {afterClose:() => books.useAICandidate(chosen[0],trigger)};
      if (operation === 'person') { switchView('characters'); return {undo:pages.applyAIPeople(chosen)}; }
      if (['continue','polish','expand','full'].includes(operation)) {
        switchView('editor');
        const choices=context.chapterSelection.foreshadowing.map(card=>({id:card.id,action:card.action}));
        const hints=choices.length?pages.prepareForeshadowing(window.desktopStore ? context.bookHome.id : 'main',choices,context.writing.id):null;
        const undoWriting=applyWriting(context.writing,chosen[0].summary,operation,context.values);
        hints?.commit();
        return {undo:()=>{if(hints && !hints.canUndo())return false;const restored=undoWriting();if(!restored && !hints)return false;hints?.undo();return restored?true:{message:'已恢复伏笔原状态。正文在采用后有新修改，已保留，请检查其中的伏笔内容。'};}};
      }
      if (operation === 'summary') { switchView('editor'); return {undo:saveSummary(context.writing,chosen[0].summary)}; }
      if (operation === 'prompt' && window.desktop)return {undo:window.previewPracticeController.applyPrompt(chosen[0].summary)};
      if (operation === 'prompt') { switchView('ideas'); document.querySelector('[data-collection-tab="ideas"][data-group="练习"]').click(); return {undo:pages.applyAIPracticePrompt(context.practice,chosen[0].summary)}; }
      if (operation === 'practice') { const index = context.practice.index, before = practiceReports.get(index), after = chosen[0].summary; practiceReports.set(index,after); switchView('ideas'); document.querySelector('[data-collection-tab="ideas"][data-group="练习"]').click(); renderPracticeReport(); return {undo:() => { if (practiceReports.get(index) !== after) return false; if (before) practiceReports.set(index,before); else practiceReports.delete(index); renderPracticeReport(); return true; }}; }
      if (['passage','bookAnalysis'].includes(operation)) { const undo=await features.applyAITips(context.reading,chosen);switchView('library');document.querySelector('[data-collection-tab="library"][data-group="写作技巧"]').click();return {undo}; }
      if (operation === 'tips') { const undo = await features.applyAITips(context.reading,chosen); switchView('library'); document.querySelector('[data-collection-tab="library"][data-group="写作技巧"]').click(); return {undo}; }
      if (operation === 'test') { notice('连接测试流程已演示，未请求真实服务。'); return {}; }
      let view = operationView,group,replaceFrom = null;
      if (operation === 'world') group = ['势力','宗门/门派','家族','组织/商会'].includes(v.category) ? '势力' : ['境界','功法','规则','修炼境界','功法/武技'].includes(v.category) ? '修行' : ['物品','法宝/武器','丹药','灵材'].includes(v.category) ? '物品' : '地理';
      if (operation === 'golden') { view = 'world'; group = '修行'; }
      if (operation === 'ideas') group = '灵感';
      if (view === 'outline') {
        group = ['outline','rewriteVolumes'].includes(operation) ? '大纲' : '章节细纲';
        if (operation === 'outline') replaceFrom = {ids:[]};
        if (['rewriteVolumes','rewriteChapters'].includes(operation)) { const items = group === '大纲' ? context.outlines.items : context.chapterOutlines.items; replaceFrom = {ids:items.slice(items.findIndex(item => item.id === context.anchor.id) + 1).map(item => item.id)}; }
        if (operation === 'rewriteChapters') { const volume = context.anchor.fields.find(([label]) => label === '所属卷')?.[1]; if (volume) chosen = chosen.map(item => ({...item,fields:[['所属卷',volume],...item.fields]})); }
        if (operation === 'chapterOutline') { replaceFrom = {ids:[context.anchor.id]}; chosen = chosen.map(item => ({...item,fields:[...context.anchor.fields.filter(([label]) => ['所属卷','所属卷ID','卷结构','结构节点','节点序号'].includes(label)),...item.fields]})); }
        if (operation === 'volumeChapters') {
          if (chosen.length !== structures[v.structure].length) throw new Error('请采用完整章纲，保证每个结构节点对应一章。');
          replaceFrom = {ids:context.chapterOutlines.items.filter(item => item.fields.some(([label,value]) => label === '所属卷ID' ? value === context.anchor.id : label === '所属卷' && value === context.anchor.title)).map(item => item.id)};
          chosen = chosen.map(item => ({...item,fields:[['所属卷',context.anchor.title],['所属卷ID',context.anchor.id],...item.fields]}));
        }
      }
      if (['style','tips','techniques'].includes(operation)) { view = 'library'; group = '写作技巧'; if (operation === 'techniques') { const old = pages.getAIContext('library',group).items; replaceFrom = {ids:old.filter(item => item.title !== '我的文风卡').map(item => item.id)}; } if (operation === 'style') replaceFrom = {ids:pages.getAIContext('library',group).items.filter(item => item.title === '我的文风卡').map(item => item.id)}; }
      if (operation === 'textAnalysis') { throw new Error('请在阅读与拆书中先导入或粘贴正文，再使用片段拆解。'); }
      if (operation === 'rules' || operation === 'mergeRules') { view = 'library'; group = '避雷规则'; if (operation === 'mergeRules') replaceFrom = pages.getAIContext('library',group).items[0]?.id; }
      switchView(view); return {undo:pages.applyAIRecords(view,group,chosen,replaceFrom)};
    };
    $('ai-workflow-adopt').addEventListener('click',async () => {
      if (busy || !results.length) return; const chosen = [...selected].sort((a,b) => a - b).map(index => results[index]);
      if (!chosen.length || chosen.some(result => !result.title.trim() || !result.summary.trim())) { $('ai-workflow-error').textContent = !chosen.length ? '请至少选择一个示例结果。' : '候选标题和内容不能为空。'; $('ai-candidate-title').focus(); return; }
      if(window.desktop && chosen.some(item=>item.semanticReview?.status==='issues')){$('ai-workflow-error').textContent='语义审核仍有问题，请重新生成或手动修订后再次核对。';return;}
      if(window.desktop && chosen.some(item=>item.semanticReview?.edited)){$('ai-workflow-error').textContent='请先重新核对修改后的正文。';return;}
      if(window.desktop && chosen.some(item=>item.semanticReview?.status==='uncertain')&&!acknowledge.checked){$('ai-workflow-error').textContent='请先核对无法确认项，并勾选人工确认。';return;}
      if (!quality.canAdopt(chosen,context.values)) { $('ai-workflow-error').textContent='本地终验未通过，请核对检查区域。'; return; }
      setBusy(true); $('ai-workflow-close').disabled=true;$('ai-workflow-stop').hidden=true;
      try { const outcome = await adopt(chosen); window.workbench?.syncOutline();window.desktopStore?.changed(); undo = outcome.undo || null; $('ai-adopt-undo').textContent=context.chapterSelection?.foreshadowing.length?'不满意，撤销正文与伏笔':'撤销上次 AI 采用'; $('ai-undo-bar').hidden = !undo; $('ai-adopt-feedback').textContent = (context.bookHome ? '《' + context.bookHome.name + '》：' : '') + '已采用「' + window.previewAIOperations[operation].label + '」的'+(['passage','bookAnalysis','tips'].includes(operation)?'本机保存结果。':'本页示例。'); dialog.close(); outcome.afterClose?.(); notice(['passage','bookAnalysis','tips'].includes(operation)?'已采用并保存在本机；没有调用真实 AI。':'已采用本页示例，刷新恢复；没有调用真实 AI。'); }
      catch (error) { $('ai-workflow-error').textContent = error.message; } finally {setBusy(false);$('ai-workflow-close').disabled=false;}
    });
    $('ai-adopt-undo').addEventListener('click',async () => { if (!undo) return; try { const result=await undo(); if (!result) { notice('采用后的内容又有修改，未覆盖你的新改动。请手动检查。'); return; } undo = null; window.desktopStore?.changed();$('ai-undo-bar').hidden = true; notice(result.message || '已撤销上次 AI 示例采用。'); } catch(error){notice(error.message);} });
    const renderPracticeReport = () => { const report = practiceReports.get(pages.getPracticeContext().index); $('practice-ai-analysis').hidden = !report; $('practice-ai-analysis').textContent = report || ''; };
    document.querySelectorAll('[data-practice]').forEach(button => button.addEventListener('click',renderPracticeReport));
    const validateConfig = () => { const endpoint = $('preview-endpoint').value.trim(),key = $('preview-secret').value.trim(),model = $('preview-model').value.trim(); let url; try { url = new URL(endpoint); } catch {}
      const valid = url && ['https:','http:'].includes(url.protocol) && key && model && Number.isInteger(Number($('preview-max-tokens').value)) && Number($('preview-max-tokens').value) > 0 && Number($('preview-max-tokens').value) <= 131072;
      $('preview-ai-config-error').textContent = valid ? '' : '请填写 HTTP(S) 示例地址、示例密钥、模型名称，以及 1–131072 的整数输出上限。'; return !!valid;
    };
    $('preview-ai-form').addEventListener('preview-ai-config-save',() => { if (!window.desktop && validateConfig()) notice('演示配置已在本页保留，不保存真实密钥，不发送请求；刷新清除。'); });
    const presets = {DeepSeek:['https://api.deepseek.com/v1','deepseek-chat'],'Kimi (Moonshot)':['https://api.moonshot.cn/v1','moonshot-v1-32k'],'智谱 GLM':['https://open.bigmodel.cn/api/paas/v4','glm-4-plus'],'通义千问':['https://dashscope.aliyuncs.com/compatible-mode/v1','qwen-plus'],OpenAI:['https://api.openai.com/v1','gpt-4o-mini'],OpenRouter:['https://openrouter.ai/api/v1','anthropic/claude-3.5-sonnet']};
    $('preview-provider').addEventListener('change',() => { const preset = presets[$('preview-provider').value]; if (preset) { $('preview-endpoint').value = preset[0]; $('preview-model').value = preset[1]; } });
    document.querySelectorAll('[data-ai-operation]').forEach(button => button.addEventListener('click',() => open(button.dataset.aiOperation,button)));
    const updateLibraryTools = () => { const group = document.querySelector('[data-collection-tab="library"][aria-pressed="true"]').dataset.group; $('ai-library-tools').hidden = !['写作技巧','避雷规则'].includes(group);  document.querySelectorAll('#ai-library-tools [data-ai-operation]').forEach(button => button.hidden = group === '写作技巧' ? button.dataset.aiOperation !== 'techniques' : button.dataset.aiOperation === 'techniques'); };
    document.querySelectorAll('[data-collection-tab="library"]').forEach(button => button.addEventListener('click',updateLibraryTools)); updateLibraryTools();
    const updateOutlineTools = () => { const group = document.querySelector('[data-collection-tab="outline"][aria-pressed="true"]').dataset.group; document.querySelectorAll('#outline-detail [data-ai-operation]').forEach(button => button.hidden = group === '大纲' ? ['rewriteChapters','chapterOutline'].includes(button.dataset.aiOperation) : group === '章节细纲' ? ['volumeChapters','rewriteVolumes'].includes(button.dataset.aiOperation) : true); };
    document.querySelectorAll('[data-collection-tab="outline"]').forEach(button => button.addEventListener('click',updateOutlineTools)); updateOutlineTools();
    return {renderSummary:summary => { $('ai-summary-preview').textContent = summary || '本章还没有摘要。'; },searchDocuments:() => [...practiceReports].map(([index,text]) => ({id:'practice-analysis:' + index,type:'ideas',view:'ideas',title:'练笔 AI 分析 · ' + (index + 1),path:'灵感与练习 / 练习 / AI 分析',target:index,group:'练习',fields:[{label:'练笔分析',key:'analysis',text}]})),openSearchTarget:result => { document.querySelector('[data-collection-tab="ideas"][data-group="练习"]').click(); document.querySelector('[data-practice="' + result.target + '"]').click(); renderPracticeReport(); return $('practice-ai-analysis'); }};
  };
})();
