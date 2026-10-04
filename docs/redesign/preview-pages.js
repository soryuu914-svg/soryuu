/* Local, disposable design data. No database, file, AI or network access. */
window.previewCardCore = {
  roleTag:role => role === '反派' ? '反派' : ['主角','女主'].includes(role) ? '主角' : '配角',
  person:card => ({id:card.id,name:card.name,role:card.role || '配角',faction:card.faction || '',summary:card.summary || '',goalMotivation:card.goalMotivation || '',...window.previewProgression?.context(card),fields:[]}),
  category:(card,group) => ['势力','地点','物品','境界','功法','规则','其他'].includes(card.kind) ? card.kind : ({地理:'地点',势力:'势力',修行:'境界',物品:'物品'}[group] || '其他'),
  world(card,group) { return {id:card.id,title:card.title,kind:this.category(card,group),summary:card.summary || '',...window.previewProgression?.context(card),fields:[]}; },
  template(item) { const card = item.source?.card; if (!card) return item; return {id:item.id,title:item.title,kind:item.kind,summary:card.summary || '',fields:item.source.type === 'characters' ? [['身份',card.role || '配角'],['所属',card.faction || ''],['目标与动机',card.goalMotivation || '']] : [['类别',this.category(card,item.source.sourceGroup)]]}; }
};
window.createPreviewPages = ({ notice, openDialog, resetSearch, noteEditor, getBook = () => ({id:'main',name:'修仙世界：从凡人到仙帝'}), bookInfo = () => null, openBookCards = () => {} }) => {
  const $ = (id) => document.getElementById(id);
  const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const detailFields = (node, fields) => {
    node.replaceChildren();
    fields.forEach(([label, value]) => {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      if(label==='适用操作')dd.textContent=String(value).replace(/continue/g,'续写').replace(/full/g,'本章生成').replace(/polish/g,'润色').replace(/expand/g,'扩写');
      if (label === '剧情变化记录') { const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('p'); summary.textContent = '查看变化记录与章节依据'; body.textContent = value; details.append(summary,body); dd.replaceChildren(details); }
      node.append(dt, dd);
    });
  };
  const progressionTarget = (owner,label) => { const target = [...owner.querySelectorAll('dt')].find(dt => dt.textContent === label)?.nextElementSibling; const details = target?.querySelector('details'); if (details) details.open = true; return target; };
  const peopleSeed = [
    ['林逸','主角','青云宗','天赋平平却不肯认命，带着家人的期盼走进仙门。'],
    ['苏浅语','主角','苏家','在家族的期望与自己的选择之间寻找答案。'],
    ['沈砚','配角','青云宗','外冷内热的执剑弟子，习惯把关心藏在提醒里。'],
    ['顾长青','配角','青云宗','守护山门的长老，对林逸的来历有所怀疑。'],
    ['陆清霜','配角','药谷','擅长草药与医术，追查失传的药方。'],
    ['谢无尘','配角','散修','游历四方的剑客，曾经受过林逸父亲的帮助。'],
    ['温知远','配角','藏书阁','记得每一本古籍的位置，却忘记了自己的过去。'],
    ['江晚宁','配角','青云宗','负责新弟子试炼，公平严厉，不轻易给人机会。'],
    ['秦昭','配角','玄剑门','不服输的年轻剑修，把林逸视为同行者。'],
    ['许明川','配角','青云宗','看似圆滑，关键时候愿意为同伴承担后果。'],
    ['叶见山','配角','青云宗','守在后山的老人，知道石碑背后的秘密。'],
    ['宋怀月','配角','药谷','温柔坚定的医者，曾失去一位重要的朋友。'],
    ['林母','配角','小山村','把牵挂缝进包袱里，只盼孩子平安回来。'],
    ['林父','配角','小山村','很少谈论过去，那把旧柴刀却始终留在身边。'],
    ['阿棠','配角','小山村','记得故乡每一条小路，盼着收到远方来信。'],
    ['宁舟','配角','商行','替宗门传递书信，熟悉沿途城镇的消息。'],
    ['赵衡','配角','青云宗','在实力与责任之间重新认识自己的位置。'],
    ['方知秋','配角','藏书阁','以整理旧典为生，发现了被人改写的记录。'],
    ['白芷','配角','药谷','性格直率的学徒，珍惜每一个活下来的病人。'],
    ['程雁回','配角','散修','离开宗门后独自修行，对旧友仍有牵挂。'],
    ['韩霄','反派','玄剑门','将出身与力量视为唯一标准，轻视凡人弟子。'],
    ['裴玄','反派','苏家','用家族责任限制苏浅语的选择。'],
    ['莫行止','反派','黑水盟','善于利用他人的急切与恐惧。'],
    ['周沉','反派','黑水盟','为得到古碑秘密，不惜制造宗门之间的猜疑。']
  ];
  let people = peopleSeed.map(([name, role, faction, summary], i) => ({
    id: i === 0 ? 'lin' : i === 1 ? 'su' : 'person-' + i, name, role, faction, summary,
    goalMotivation:i === 0 ? '要做什么：救下被仙门献祭的故乡，查清仙门以凡人续命的秘密，寻找不牺牲他人也能成仙的道路。\n为什么：家人和故乡面临献祭，他不愿用他人的性命换取自己的修行。\n推进方向：先找到献祭线索并保护乡人，再追查仙门秘密，最终寻找另一条成仙之路。' : '',fields: []
  }));
  let peoplePage = 1, peopleRole = '全部', peopleSort = 'default', peopleQuery = '', selectedPerson = 'lin';
  // Historical HTML snapshots do not load the new archive dependency.
  const templateStore = window.createPreviewTemplateStore?.() || {syncBook(){},list:() => [],snapshot:() => null,restore:() => true,revision:0};
  const bookCards = new Map(); let activeBook = {id:'main',name:'修仙世界：从凡人到仙帝'}, nextCardId = 1;
  const syncTemplates = () => { bookCards.set(activeBook.id,{people,world:collections.world.groups}); templateStore.syncBook(activeBook,people,collections.world.groups); refreshTemplates(); };
  let templateVersion='latest';
  const templateRecord = item => ({id:item.id,title:item.card.name || item.card.title,kind:item.type === 'characters' ? '人物模板' : '世界模板',summary:item.card.summary,source:item,fields:[...(item.type === 'characters' ? [['身份',item.card.role],[item.card.stateAsOf ? '初始所属' : '所属',item.card.faction || '未填写'],[item.card.stateAsOf ? '初始目标与动机' : '目标与动机',item.card.goalMotivation || '尚未填写']] : [['类别',window.previewCardCore.category(item.card,item.sourceGroup)]]),['来源作品',bookInfo(item.bookId)?.name || item.bookName],['资料版本',item.version==='initial' ? (item.initialOrigin==='first-recoverable' ? '首次可恢复模板（原始版本已不可追溯）' : '初始模板 · 独立保留') : '书内最新版本'],['同步状态',item.version==='initial' ? '独立保留 · 不被后续修改覆盖' : item.linked ? '关联中 · 书内修改自动同步' : '源卡已删除 · 保留最后一次同步内容']]});
  const refreshTemplates = () => {
    collections.library.groups['人物模板'] = [...templateStore.list('characters',templateVersion).map(templateRecord),...(window.previewReadingArchive?.materials||[]).filter(item=>item.readingSource.dimension==='characters').map(item=>item.destination==='人物模板'?{...item,fields:item.fields.map(([label,value])=>[label,(label==='所属'&&!item.person.faction)||(label==='目标与动机'&&!item.person.goalMotivation)?'未填写（以原书为准）':value])}:{...item,title:item.readingSource.bookTitle+' · 待完善人物观察',kind:'待完善',needsPersonReview:true})];
    collections.library.groups['世界模板'] = templateStore.list('world',templateVersion).map(templateRecord);
  };
  const pageSize = 8;
  const showPerson = (person) => {
    $('profile-panel').hidden = false;
    $('detail-avatar').textContent = person.name[0];
    $('detail-name').textContent = person.name;
    $('detail-role').textContent = person.role;
    $('detail-summary').textContent = window.previewProgression?.context(person).currentState || person.summary;
    const evolved = !!person.stateAsOf;
    const fields = [...(person.faction ? [[evolved ? '初始所属' : '所属',person.faction]] : []),[evolved ? '初始目标与动机' : '目标与动机',person.goalMotivation || '尚未填写，可根据本书灵感补充人物要做什么、为什么这样做。']];
    detailFields($('person-fields'),[...fields,...(window.previewProgression?.fields(person) || [])]); $('person-fields').hidden = false;
  };
  const renderPeople = () => {
    let matches = people.filter((p) => (peopleRole === '全部' || p.role === peopleRole) && [p.name,p.faction,p.summary,p.role,p.goalMotivation].join(' ').toLocaleLowerCase('zh-CN').includes(peopleQuery.toLocaleLowerCase('zh-CN')));
    if (peopleSort === 'name') matches = [...matches].sort((a,b) => a.name.localeCompare(b.name,'zh-CN'));
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    peoplePage = Math.min(peoplePage,totalPages);
    const page = matches.slice((peoplePage - 1) * pageSize, peoplePage * pageSize);
    if (!page.some((p) => p.id === selectedPerson)) selectedPerson = page[0]?.id ?? null;
    const list = $('people-list'); list.replaceChildren();
    $('people-count').textContent = (matches.length === people.length ? people.length + ' 位人物' : matches.length + ' / ' + people.length + ' 位人物') + ' · 示例';
    $('people-result').textContent = matches.length ? '姓名 / 身份 / 设定摘要' : '没有匹配的人物';
    $('people-empty').hidden = matches.length > 0;
    $('people-empty').querySelector('h3').textContent = people.length ? '没有找到人物' : '这本书还没有人物';
    $('people-empty').querySelector('p').textContent = people.length ? '换个关键词，或清除搜索与身份筛选。' : '点击“新建人物”，或根据本书的核心灵感生成第一位人物。';
    $('people-empty').querySelector('button').hidden = !people.length;
    $('profile-panel').hidden = matches.length === 0;
    page.forEach((person) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'people-row'; button.dataset.person = person.id;
      button.setAttribute('aria-pressed',String(person.id === selectedPerson));
      button.innerHTML = '<span class="person-initial" aria-hidden="true">' + esc(person.name[0]) + '</span><span class="person-row-main"><span class="person-row-title"><strong>' + esc(person.name) + '</strong><span class="person-role">' + esc(window.previewCardCore.roleTag(person.role)) + '</span></span><p>' + esc((person.faction ? person.faction + ' · ' : '') + person.summary) + '</p></span><span class="row-chevron" aria-hidden="true">›</span>';
      button.addEventListener('click',() => { selectedPerson = person.id; showPerson(person); list.querySelectorAll('[data-person]').forEach((row) => row.setAttribute('aria-pressed',String(row.dataset.person === person.id))); });
      button.querySelector('p').textContent = (person.stateAsOf ? '' : person.faction ? person.faction + ' · ' : '') + (window.previewProgression?.context(person).currentState || person.summary);
      list.append(button);
    });
    if (selectedPerson) showPerson(page.find((p) => p.id === selectedPerson));
    $('people-range').textContent = matches.length ? ((peoplePage - 1) * pageSize + 1) + '–' + Math.min(peoplePage * pageSize,matches.length) + ' / ' + matches.length + ' 位' : '0 位人物';
    const pager = $('people-pagination'); pager.replaceChildren();
    const addPageButton = (text, pageNumber, disabled, label, current = false) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.disabled = disabled;
      button.setAttribute('aria-label',label); button.dataset.page = String(pageNumber);
      if (current) button.setAttribute('aria-current','page');
      button.addEventListener('click',() => { peoplePage = pageNumber; renderPeople(); pager.querySelector('[aria-current="page"]')?.focus(); });
      pager.append(button);
    };
    addPageButton('‹',peoplePage - 1,peoplePage === 1,'上一页人物');
    const visiblePages = [...new Set([1,totalPages,peoplePage - 1,peoplePage,peoplePage + 1])].filter((p) => p >= 1 && p <= totalPages).sort((a,b) => a - b);
    visiblePages.forEach((p,index) => {
      if (index && p - visiblePages[index - 1] > 1) {
        const gap = document.createElement('span'); gap.textContent = '…'; gap.setAttribute('aria-hidden','true'); pager.append(gap);
      }
      addPageButton(String(p),p,false,'人物第 ' + p + ' 页',p === peoplePage);
    });
    addPageButton('›',peoplePage + 1,peoplePage === totalPages,'下一页人物');
  };
  document.querySelectorAll('[data-person-role]').forEach((button) => button.addEventListener('click',() => {
    peopleRole = button.dataset.personRole; peoplePage = 1;
    document.querySelectorAll('[data-person-role]').forEach((b) => b.setAttribute('aria-pressed',String(b === button))); renderPeople();
  }));
  $('people-sort').addEventListener('change',() => { peopleSort = $('people-sort').value; peoplePage = 1; renderPeople(); });
  $('people-reset').addEventListener('click',() => {
    peopleRole = '全部'; peoplePage = 1; resetSearch('');
    document.querySelectorAll('[data-person-role]').forEach((b) => b.setAttribute('aria-pressed',String(b.dataset.personRole === '全部'))); renderPeople(); $('search').focus();
  });
  $('new-person').addEventListener('click',(event) => editCard('characters',null,event.currentTarget));
  $('edit-person').addEventListener('click',(event) => {
    const person = people.find((p) => p.id === selectedPerson);
    if (person) editCard('characters',person,event.currentTarget);
  });

  const record = (id, title, kind, summary, fields) => ({id,title,kind,summary,fields});
  const collections = {
    world: { active:'地理', selected:null, query:'', groups:{
      '地理': [record('mountain','青云山','宗门所在地','终年云雾缭绕，山门、试炼石阶与后山古碑构成最初的故事舞台。',[['空间结构','山脚小镇 → 山门石阶 → 外门院落 → 后山禁地。'],['故事用途','用山门内外的差异，表现林逸第一次进入修行世界。'],['关联章节','第一卷 · 第三章「山门之外」']]),record('village','青石村','故乡','林逸长大的村落。家书、糖与旧柴刀都从这里进入故事。',[['核心地点','林家院落、河湾、老槐树与村口木桥。'],['情感作用','故乡作为角色做出选择时的参照。']]),record('river','落霞城','城镇','宗门附近的集市城镇，消息和交易在此交汇。',[['故事用途','引入外部势力与修行资源的交换。']])],
      '势力': [record('sect','青云宗','宗门','重视心性与责任的修行宗门，内部对凡人弟子的态度并不一致。',[['组织结构','宗主、长老、内门、外门与执事。'],['内部矛盾','出身与能力的争论，影响林逸得到的机会。']]),record('su-family','苏家','世家','苏浅语的家族，以维护声望为名安排年轻人的道路。',[['核心冲突','家族利益与个体选择。']]),record('blackwater','黑水盟','对立势力','觊觎后山古碑的秘密，试图挑起宗门猜疑。',[['叙事作用','将个人试炼推进为更大的外部冲突。']])],
      '修行': [record('levels','境界顺序','规则','修行依次分为炼气、筑基、金丹、元婴、化神。',[]),record('trial','入门试炼','规则','青云宗招收弟子的考核，主要考察灵根、基础能力与合作表现。',[])],
      '物品': [record('sugar','油纸包着的糖','情感线索','母亲临行前放入包袱的糖，把故乡的牵挂留在林逸身边。',[['首次出现','第三章 · 山门之外。'],['后续用途','在角色陷入困境时唤起回家的理由。']]),record('stele','后山古碑','关键物品','被刻意隐藏的残缺石碑，记载宗门历史中的空白。',[['关联人物','叶见山、周沉。'],['悬念','缺失部分由谁带走，为什么？']])]
    }},
    outline: { active:'大纲', selected:null, query:'', groups:{
      '章节细纲': [record('chapter-outline-1','第三章 · 山门之外','第一卷 · 章节细纲','林逸抵达山门，在入门机会与帮助同伴之间做出选择。',[['所属卷','第一卷 · 初入仙途'],['钩子','钟声响起，试炼已开始。'],['情绪','陌生 → 紧张 → 坚定。']]),record('chapter-outline-2','第四章 · 试炼','第一卷 · 章节细纲','通过一次合作看见仙门规则的另一面。',[['所属卷','第一卷 · 初入仙途'],['钩子','最后一级台阶没有人能独自跨过。']])],
      '大纲': [record('act1','第一卷 · 初入仙途','起点','离开故乡，走进仙门，从追随安排到第一次主动选择。',[['开篇','小村少年 → 远行 → 山门之外。'],['发展','入门试炼、结识同伴、面对出身偏见。'],['卷末转折','林逸为保护同伴放弃更安全的选择。']]),record('act2','第二卷 · 云起青山','推进','古碑线索浮现，个人成长卷入宗门争端。',[['核心目标','查清后山古碑与父亲旧事的关联。'],['冲突升级','信任受到挑战，角色必须自己判断真相。']]),record('act3','第三卷 · 故人来信','回望','来自故乡的一封信，迫使林逸重新思考修行的意义。',[['情感线','母亲留下的糖与家书相呼应。'],['人物选择','面对更大的机会，决定自己真正愿意守护什么。']])],
      '伏笔': [record('hint1','母亲留下的糖','待回收','包袱中的糖在第三章出现，计划在故人来信中回应。',[['埋设位置','第一卷 · 第三章。'],['计划回收','第三卷 · 故人来信。'],['回收目标','让故乡从背景成为角色选择的动力。']]),record('hint2','父亲的旧柴刀','推进中','普通柴刀上隐藏的刻痕，与后山石碑上的纹路相似。',[['埋设位置','第一卷 · 第一章。'],['下一次提示','林逸首次进入后山。']]),record('hint3','被改写的宗门记录','待回收','藏书阁里两本古籍对同一场事件的记录相互矛盾。',[['关联人物','方知秋、温知远。'],['回收条件','找到当年的见证人。']])]
    }},
    library: { active:'人物模板', selected:null, query:'', groups:{
      '写作技巧': [record('technique-1','用动作承载情绪','自定义技巧','让一个具体动作表达人物犹豫，少用情绪标签。',[['使用方式','先写目标，再写阻碍，最后用一个动作表达选择。']])],
      '避雷规则': [record('rule-1','避免重复情绪标签','避雷规则','用可观察的动作和细节表达情绪。',[['规则正文','避免连续使用“震惊、难以置信”等抽象标签。']])],
      '人物模板': [],
      '世界模板': [],

    }},
    ideas: { active:'灵感', selected:null, query:'', groups:{
      '灵感': [record('letter','一封始终没寄出的信','情感','角色每次想寄信都会被新事件打断，信里的称呼却悄悄改变。',[['适合放置','章节间的情感连接。'],['下一步','决定信件最终被谁读到，以及它改变了什么。']]),record('gate','山门上的最后一级台阶','场景','台阶看似普通，只有愿意回头看同行者的人才能越过。',[['冲突','追求名次还是帮助同伴？'],['使用位置','入门试炼的最后一道选择。']]),record('memory','记得别人的守书人','人物','守书人记得所有来访者，却无法找到一本记载自己名字的书。',[['悬念','这是遗忘、诅咒，还是主动付出的代价？']])]
    }}
  };
  const bookOutlineGroups = new Map([['main',collections.outline.groups]]);
  Object.entries(window.previewZhihuWriting || {}).forEach(([group,items]) => { collections.library.groups[group] = [...collections.library.groups[group].filter(item => !items.some(research => research.id === item.id)),...JSON.parse(JSON.stringify(items))]; });
  Object.entries(collections.world.groups).forEach(([group,items]) => { collections.world.groups[group] = items.map(item => window.previewCardCore.world(item,group)); });
  const editReadingPerson=document.createElement('button');editReadingPerson.id='edit-reading-person';editReadingPerson.className='btn';editReadingPerson.type='button';editReadingPerson.textContent='修改人物资料';editReadingPerson.hidden=true;document.querySelector('[data-edit-record="library"]').after(editReadingPerson);
  editReadingPerson.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('preview-edit-reading-person',{detail:{id:collections.library.selected}})));
  const syncReadingMaterials = () => {
    const items=window.previewReadingArchive?.materials || [];
    collections.library.groups['写作技巧']=[...collections.library.groups['写作技巧'].filter(item=>!item.readingSource),...items.filter(item=>item.readingSource.dimension!=='characters')];
  };
  window.addEventListener('preview-select-reading-material',event=>{collections.library.selected=event.detail.id;renderCollection('library');});
  window.addEventListener('preview-reading-change',()=>{syncReadingMaterials();if($('reader-shell').hidden)renderCollection('library');});
  const renderCollection = (view) => {
    if(view==='library')syncReadingMaterials();
    if (view === 'library') refreshTemplates();
    const state = collections[view];
    const matches = state.groups[state.active].filter((item) => [item.title,item.kind,item.summary].join(' ').includes(state.query));
    if (!matches.some((item) => item.id === state.selected)) state.selected = matches[0]?.id ?? null;
    const list = $(view + '-list'); list.replaceChildren();
    $(view + '-count').textContent = matches.length + (view==='library' && matches.some(item=>item.researchSource) ? ' 条资料 · 含知乎提炼' : view==='library' && matches.some(item=>item.readingSource) ? ' 条资料 · 含本机拆书参考' : ' 条 · 示例');
    $(view + '-empty').hidden = matches.length > 0;
    if (view === 'world') { const emptyBook = !Object.values(state.groups).some(items => items.length); $('world-empty').querySelector('h3').textContent = emptyBook ? '这本书还没有世界观设定' : '没有找到条目'; $('world-empty').querySelector('p').textContent = emptyBook ? '点击“新建设定”或使用 AI 生成，记录本书的势力、地点、物品和境界等核心信息。' : '换个关键词，或切换分类查看。'; $('world-empty').querySelector('button').hidden = emptyBook; }
    const detail = $(view + '-detail'); detail.hidden = !state.selected;
    const show = (item) => {
      $(view + '-detail-title').textContent = item.title;
      $(view + '-detail-kind').textContent = item.kind;
      $(view + '-detail-summary').textContent = window.previewProgression?.context(item.source?.card || item).currentState || item.summary;
      const fields = view === 'world' ? window.previewProgression?.fields(item) || [] : [...item.fields,...(item.source ? window.previewProgression?.fields(item.source.card) || [] : [])];
      detailFields($(view + '-detail-fields'),fields); $(view + '-detail-fields').hidden = !fields.length;
      if(item.researchSource) { const dt=document.createElement('dt'), dd=document.createElement('dd');dt.textContent='知乎出处 · 检索摘要';item.researchSource.sources.forEach(source=>{const url=new URL(source.url);if(url.protocol!=='https:' || !(url.hostname==='zhihu.com'||url.hostname.endsWith('.zhihu.com')))return;const p=document.createElement('p'),a=document.createElement('a');a.textContent=source.id+' · '+source.title;a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';p.append(a);dd.append(p);});$(view+'-detail-fields').append(dt,dd); }
      if (view === 'library') { editReadingPerson.hidden=item.destination!=='人物模板'&&!item.needsPersonReview;editReadingPerson.textContent=item.needsPersonReview?'按原书完善人物资料':'修改人物资料'; const edit = document.querySelector('[data-edit-record="library"]'); edit.textContent = item.readingSource ? '查看拆书来源' : item.source ? (item.source.linked ? '前往书中修改' : '源卡已删除 · 模板保留') : '修改资料名称'; edit.disabled = !!item.source && !item.source.linked; }
      list.querySelectorAll('[data-record]').forEach((row) => row.setAttribute('aria-pressed',String(row.dataset.record === item.id)));
    };
    matches.forEach((item) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'record-row'; button.dataset.record = item.id;
      button.setAttribute('aria-pressed',String(item.id === state.selected));
      const badge = view === 'ideas' ? '' : item.source?.type === 'characters' ? window.previewCardCore.roleTag(item.source.card.role) : item.source?.type === 'world' ? window.previewCardCore.category(item.source.card,item.source.sourceGroup) : item.kind;
      button.innerHTML = '<span class="record-row-head"><strong>' + esc(item.title) + '</strong>' + (badge ? '<span class="person-role">' + esc(badge) + '</span>' : '') + '</span><p>' + esc(item.summary) + '</p><span class="record-meta">' + esc(item.source ? (bookInfo(item.source.bookId)?.name || item.source.bookName) + ' · ' + (item.source.linked ? '关联中' : '源卡已删除，模板保留') : item.readingSource ? '来源：'+item.readingSource.bookTitle+' · 本机资料' : state.active + ' · 示例设定') + '<span aria-hidden="true">查看详情 ›</span></span>';
      if(item.researchSource)button.querySelector('.record-meta').firstChild.textContent='知乎提炼 · '+item.researchSource.sources.length+'条摘要依据 ';
      button.querySelector('p').textContent = window.previewProgression?.context(item.source?.card || item).currentState || item.summary;
      button.addEventListener('click',() => { state.selected = item.id; show(item); }); list.append(button);
    });
    if (state.selected) show(matches.find((item) => item.id === state.selected));
    if (view === 'library') { const personLibrary = state.active === '人物模板' && $('reader-shell').hidden; $('library-view').querySelector('h1').textContent = '资料库'; $('library-view').setAttribute('aria-label','资料库'); $('library-view').querySelector('.subtitle').textContent = personLibrary ? '收录书内同步人物与原书拆解人物。拆书人物独立保存，保留原书设定与出处。' : '把人物、世界设定与参考笔记放在随手可查的地方。'; const auto = ['人物模板','世界模板'].includes(state.active) && $('reader-shell').hidden; $('new-library').hidden = auto; $('new-library').disabled = false; $('new-library').lastChild.textContent = $('reader-shell').hidden ? '新建资料' : '添加阅读稿'; $('template-sync-info')?.toggleAttribute('hidden',!auto); $('library-list').classList.toggle('template-list',auto); }
  };
  document.querySelectorAll('[data-collection-tab]').forEach((button) => button.addEventListener('click',() => {
    const view = button.dataset.collectionTab;
    document.querySelectorAll('[data-collection-tab="' + view + '"]').forEach((b) => b.setAttribute('aria-pressed',String(b === button)));
    if (view === 'library') {
      const reading = button.dataset.group === '阅读与拆书';
      if (reading) { $('library-view').querySelector('h1').textContent = '资料库'; $('library-view').setAttribute('aria-label','资料库'); $('library-view').querySelector('.subtitle').textContent = '导入整本 TXT 或粘贴单章，把阅读观察收为创作参考。'; }
      $('new-library').hidden = false; $('new-library').disabled = false; $('template-sync-info')?.setAttribute('hidden','');
      $('library-catalog').hidden = reading; $('reader-shell').hidden = !reading; $('library-count').hidden = reading;
      $('new-library').lastChild.textContent = reading ? '添加阅读稿' : '新建资料';
      if (reading) return;
    }
    const practice = view === 'ideas' && button.dataset.group === '练习';
    if (view === 'ideas') { $('ideas-catalog').hidden = practice; $('practice-panel').hidden = !practice; $('ideas-count').hidden = practice; }
    if (!practice) { collections[view].active = button.dataset.group; renderCollection(view); }
  }));
  const editIdea = (item,source) => {
    const state = collections.ideas, id = item?.id;
    noteEditor.open({record:item,kind:'灵感',context:'灵感库 · 修改只在本页预览保留，刷新恢复示例。',source,saveLabel:'保存灵感',feedback:'已保存灵感的标题和内容；切换页面会保留本页修改，刷新恢复示例。',
      onSave({title,summary}) {
        const existing = state.groups.灵感.find(record => record.id === id);
        if (existing) { existing.title = title; existing.summary = summary; existing.fields = existing.fields.filter(([label]) => label === '来源'); }
        else { const created = record('manual-idea-' + generatedRecordId++,title,'灵感',summary,[]); state.groups.灵感.unshift(created); state.selected = created.id; }
        resetSearch(''); document.querySelector('[data-collection-tab="ideas"][data-group="灵感"]').click(); renderCollection('ideas');
      }
    });
  };
  document.querySelectorAll('[data-new-record]').forEach((button) => button.addEventListener('click',() => {
    const view = button.dataset.newRecord, state = collections[view];
    if (view === 'world') { editCard('world',null,button); return; }
    if (view === 'ideas' && noteEditor) { editIdea(null,button); return; }
    if (view === 'library' && ['人物模板','世界模板'].includes(state.active) && $('reader-shell').hidden) return;
    if (view === 'library' && !$('reader-shell').hidden) { button.dispatchEvent(new Event('preview-reading-import')); return; }
    if(window.desktop && window.desktopEditMaterial){window.desktopEditMaterial(view,state.active,null,button);return;}
    openDialog(button,'新建示例条目','条目名称','',(title) => {
      const id = view + '-new-' + Object.values(state.groups).flat().length;
      state.groups[state.active].unshift(record(id,title,view==='outline' && state.active==='伏笔'?'未埋设':state.active,'新条目已加入本页，详细内容待补充。',[['设定内容','等待作者补充。']])); state.selected = id;
      resetSearch(''); renderCollection(view);
      if (view === 'ideas') { $('ideas-catalog').hidden = false; $('practice-panel').hidden = true; $('ideas-count').hidden = false; document.querySelectorAll('[data-collection-tab="ideas"]').forEach((b) => b.setAttribute('aria-pressed',String(b.dataset.group === '灵感'))); }
    });
  }));
  document.querySelectorAll('[data-edit-record]').forEach((button) => button.addEventListener('click',() => {
    const view = button.dataset.editRecord, state = collections[view], item = state.groups[state.active].find((r) => r.id === state.selected);
    if (view === 'library' && item?.readingSource) { window.dispatchEvent(new CustomEvent('preview-open-reading',{detail:item.readingSource})); return; }
    if (view === 'world' && item) { editCard('world',item,button); return; }
    if (view === 'ideas' && item && noteEditor) { editIdea(item,button); return; }
    if (view === 'library' && item?.source) { if (item.source.linked) { openBookCards(item.source.bookId,item.source.type); focusSource(item.source); } return; }
    if(window.desktop && item && window.desktopEditMaterial){window.desktopEditMaterial(view,state.active,item,button);return;}
    if (item) openDialog(button,'修改示例条目名称','条目名称',item.title,(title) => { item.title = title; resetSearch(''); renderCollection(view); });
  }));
  document.querySelectorAll('[data-reset-record]').forEach((button) => button.addEventListener('click',() => { resetSearch(''); renderCollection(button.dataset.resetRecord); $('search').focus(); }));
  const prompts = [
    ['场景描写','不用“紧张”这个词，写一段少年第一次站在山门下的场景。'],
    ['人物对话','写一次告别。让两个人都没有直接说出自己最想说的话。'],
    ['动作与选择','写一个角色放弃眼前机会，转身帮助同行者的瞬间。']
  ];
  let activePrompt = 0;
  let generatedRecordId = window.desktopStore?.get('pages')?.generatedRecordId || 1;
  const drafts = ['', '', ''];
  const updatePractice = () => { drafts[activePrompt] = $('practice-text').value; $('practice-count').textContent = Array.from($('practice-text').value.replace(/\s/g,'')).length + ' 字'; $('practice-text').style.height = 'auto'; $('practice-text').style.height = Math.max(300,$('practice-text').scrollHeight) + 'px'; };
  document.querySelectorAll('[data-practice]').forEach((button) => button.addEventListener('click',() => {
    drafts[activePrompt] = $('practice-text').value; activePrompt = Number(button.dataset.practice);
    $('practice-title').textContent = prompts[activePrompt][0]; $('practice-description').textContent = prompts[activePrompt][1]; $('practice-text').value = drafts[activePrompt];
    document.querySelectorAll('[data-practice]').forEach((b) => b.setAttribute('aria-pressed',String(b === button))); updatePractice();
  }));
  $('practice-text').addEventListener('input',(event) => { if (!event.isComposing) updatePractice(); });
  $('practice-text').addEventListener('compositionend',updatePractice);
  document.querySelectorAll('[data-settings-tab]').forEach((button) => button.addEventListener('click',() => {
    document.querySelectorAll('[data-settings-tab]').forEach((b) => b.setAttribute('aria-pressed',String(b === button)));
    ['appearance','workspace','ai','backup'].forEach((key) => $('settings-' + key).hidden = key !== button.dataset.settingsTab);
  }));
  $('settings-glass').addEventListener('change',() => { $('reduce-glass').checked = $('settings-glass').checked; $('reduce-glass').dispatchEvent(new Event('change')); });
  $('reduce-glass').addEventListener('change',() => { $('settings-glass').checked = $('reduce-glass').checked; });
  $('preview-density').addEventListener('change',() => { document.body.classList.toggle('spacious',$('preview-density').value === 'spacious'); notice('已调整本页人物列表间距，刷新后恢复默认。'); });
  $('preview-secret-toggle').addEventListener('click',() => { const show = $('preview-secret').type === 'password'; $('preview-secret').type = show ? 'text' : 'password'; $('preview-secret-toggle').textContent = show ? '隐藏密钥' : '显示密钥'; $('preview-secret-toggle').setAttribute('aria-pressed',String(show)); });
  $('preview-ai-form').addEventListener('submit',(event) => { event.preventDefault(); $('preview-ai-form').dispatchEvent(new Event('preview-ai-config-save')); });
  $('preview-backup').addEventListener('click',() => notice('备份外观已展示。正式程序将调用已有工作区备份流程；当前预览不访问文件，也没有生成备份。'));
  const setBook = () => {
    const target = getBook();
    if (target.id !== activeBook.id) {
      bookOutlineGroups.set(activeBook.id,collections.outline.groups);
      bookCards.set(activeBook.id,{people,world:collections.world.groups});
      const state = bookCards.get(target.id) || {people:[],world:{地理:[],势力:[],修行:[],物品:[]}};
      activeBook = {...target}; people = state.people; collections.world.groups = state.world;
      collections.outline.groups = bookOutlineGroups.get(target.id) || {大纲:[],章节细纲:[],伏笔:[]}; collections.outline.selected = null; collections.outline.query = '';
      peoplePage = 1; peopleQuery = ''; peopleRole = '全部'; selectedPerson = null; collections.world.selected = null; collections.world.query = '';
      document.querySelectorAll('[data-person-role]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.personRole === '全部')));
    } else activeBook = {...target};
    const bookTitle = $('characters-view').querySelector('[data-primary-book-title]'); if (bookTitle) bookTitle.textContent = activeBook.name;
    $('world-view').querySelector('.subtitle').textContent = activeBook.name + ' · 仅管理本书的势力、地点、物品和修行设定，创建和修改会同步到资料库世界观库。';
    syncTemplates(); renderPeople(); renderCollection('world');
  };
  const focusSource = source => {
    if (source.type === 'characters') { peopleRole = '全部'; peopleQuery = ''; document.querySelectorAll('[data-person-role]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.personRole === '全部'))); selectedPerson = source.sourceId; const ordered = peopleSort === 'name' ? [...people].sort((a,b) => a.name.localeCompare(b.name,'zh-CN')) : people; peoplePage = Math.floor(ordered.findIndex(p => p.id === selectedPerson) / pageSize) + 1; renderPeople(); $('edit-person').focus(); }
    else { collections.world.active = source.sourceGroup; collections.world.selected = source.sourceId; document.querySelector('[data-collection-tab="world"][data-group="' + source.sourceGroup + '"]').click(); document.querySelector('[data-edit-record="world"]').focus(); }
  };
  const cardDialog = document.createElement('dialog'); cardDialog.id = 'source-card-dialog'; cardDialog.className = 'feature-dialog'; cardDialog.setAttribute('aria-labelledby','source-card-heading');
  cardDialog.innerHTML = '<form id="source-card-form" novalidate><h2 id="source-card-heading"></h2><p id="source-card-context"></p><div id="source-card-fields"></div><div id="source-card-error" class="field-error" role="alert"></div><div class="actions"><button type="button" class="btn" id="source-card-cancel">取消</button><button type="submit" class="btn primary">保存并同步模板</button></div></form>';
  document.body.append(cardDialog); let editingCard = null;
  const editCard = (type,card,trigger) => {
    editingCard = {type,id:card?.id,bookId:activeBook.id,trigger,group:collections.world.active};
    $('source-card-heading').textContent = (card ? '编辑' : '新建') + (type === 'characters' ? '人物卡' : '世界观卡');
    $('source-card-context').textContent = activeBook.name + ' · 只记录保持故事一致的核心信息，保存后自动同步到资料库。';
    if (card?.stateAsOf) $('source-card-context').textContent += ' 这里修改初始资料；当前状态请通过“跟随剧情更新”维护，变化记录会保留。';
    $('source-card-error').textContent = ''; const container = $('source-card-fields'); container.replaceChildren();
    const schemas = type === 'characters' ? [['name','姓名',card?.name || '',false],['role','身份',card?.role || '配角',false,['主角','女主','配角','反派','导师']],['faction','所属（选填）',card?.faction || '',false],['summary','介绍',card?.summary || '',true],['goalMotivation','目标与动机',card?.goalMotivation || '',true]] : [['kind','类别',window.previewCardCore.category(card || {},collections.world.active),false,['势力','地点','物品','境界','功法','规则','其他']],['title','名称',card?.title || '',false],['summary','介绍',card?.summary || '',true]];
    schemas.forEach(([key,label,value,multiline,options]) => { const wrapper = document.createElement('div'), caption = document.createElement('label'), input = document.createElement(options ? 'select' : multiline ? 'textarea' : 'input'); input.id = 'source-card-' + key; caption.htmlFor = input.id; caption.textContent = label + (key === 'name' || key === 'title' ? ' *' : ''); if (options) options.forEach(option => { const el = document.createElement('option'); el.value = option; el.textContent = option; input.append(el); }); else { input.maxLength = multiline ? 5000 : 120; if (!multiline) input.type = 'text'; } input.value = value; if (key === 'summary') input.placeholder = type === 'characters' ? '简短介绍人物的性格与背景。' : '例如：位于东皇大陆南域，是南域的顶级宗门之一。'; if (key === 'goalMotivation') input.placeholder = '根据本书核心灵感写清：要做什么、为什么这样做，以及主线如何推进。'; input.setAttribute('aria-describedby','source-card-error'); if (key === 'name' || key === 'title') input.setAttribute('aria-required','true'); wrapper.append(caption,input); container.append(wrapper); });
    cardDialog.showModal(); container.querySelector('input').focus();
  };
  $('source-card-cancel').addEventListener('click',() => cardDialog.close());
  $('source-card-form').addEventListener('input',event => { if (!event.isComposing) { event.target.removeAttribute('aria-invalid'); $('source-card-error').textContent = ''; } });
  cardDialog.addEventListener('close',() => { if (editingCard?.trigger?.isConnected) editingCard.trigger.focus(); });
  $('source-card-form').addEventListener('submit',event => {
    event.preventDefault(); if (editingCard.bookId !== activeBook.id) return;
    const type = editingCard.type, nameInput = $('source-card-' + (type === 'characters' ? 'name' : 'title')), name = nameInput.value.trim();
    if (!name) { $('source-card-error').textContent = '请填写' + (type === 'characters' ? '姓名' : '名称') + '。'; nameInput.setAttribute('aria-invalid','true'); nameInput.focus(); return; }
    const fields = [];
    const id = editingCard.id || 'manual-card-' + nextCardId++;
    const previousCard = type === 'characters' ? people.find(item => item.id === id) : Object.values(collections.world.groups).flat().find(item => item.id === id);
    if (type === 'characters') { const item = {id,name,role:$('source-card-role').value,faction:$('source-card-faction').value.trim(),summary:$('source-card-summary').value.trim(),goalMotivation:$('source-card-goalMotivation').value.trim(),fields}; const index = people.findIndex(p => p.id === id); if (index < 0) people.unshift(item); else people[index] = item; peopleRole = '全部'; peopleQuery = ''; peoplePage = 1; selectedPerson = id; peopleSort = 'default'; $('people-sort').value = 'default'; document.querySelectorAll('[data-person-role]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.personRole === '全部'))); }
    else { const kind = $('source-card-kind').value, group = ({势力:'势力',地点:'地理',物品:'物品',境界:'修行',功法:'修行',规则:'修行',其他:'地理'})[kind], item = record(id,name,kind,$('source-card-summary').value.trim(),fields); Object.values(collections.world.groups).forEach(items => { const index = items.findIndex(r => r.id === id); if (index >= 0) items.splice(index,1); }); collections.world.groups[group].unshift(item); collections.world.active = group; collections.world.selected = id; document.querySelector('[data-collection-tab="world"][data-group="' + group + '"]').click(); }
    const savedCard = type === 'characters' ? people.find(item => item.id === id) : Object.values(collections.world.groups).flat().find(item => item.id === id);
    if (previousCard?.stateHistory) { ['currentState','stateAsOf','plannedState','plannedAsOf','stateHistory'].forEach(key => { if (previousCard[key] !== undefined) savedCard[key] = previousCard[key]; }); }
    syncTemplates(); resetSearch(''); renderPeople(); renderCollection('world'); cardDialog.close(); notice('已保存到《' + activeBook.name + '》，资料库模板已同步更新；刷新恢复示例。');
  });
  const removeDialog = document.createElement('dialog'); removeDialog.id = 'source-card-remove'; removeDialog.setAttribute('aria-labelledby','source-remove-title'); removeDialog.innerHTML = '<h2 id="source-remove-title">删除书内卡片</h2><p id="source-remove-description"></p><div class="actions"><button type="button" class="btn" id="source-remove-cancel">保留卡片</button><button type="button" class="btn danger-text" id="source-remove-confirm">仅删除书内卡片</button></div>'; document.body.append(removeDialog); let removing = null;
  const addRemoveButton = (owner,type) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn danger-text'; button.textContent = '删除书内卡片'; button.dataset.removeSource = type; owner.append(button); button.addEventListener('click',() => { const card = type === 'characters' ? people.find(p => p.id === selectedPerson) : collections.world.groups[collections.world.active].find(r => r.id === collections.world.selected); if (!card) return; removing = {type,id:card.id,group:collections.world.active,bookId:activeBook.id}; $('source-remove-description').textContent = '从《' + activeBook.name + '》删除「' + (card.name || card.title) + '」。资料库保留最后一次同步的人物或世界模板。'; removeDialog.showModal(); $('source-remove-cancel').focus(); }); };
  addRemoveButton($('profile-panel'),'characters'); addRemoveButton($('world-detail'),'world');
  $('source-remove-cancel').addEventListener('click',() => removeDialog.close());
  $('source-remove-confirm').addEventListener('click',() => { if (removing.bookId !== activeBook.id) return; if (removing.type === 'characters') people = people.filter(p => p.id !== removing.id); else collections.world.groups[removing.group] = collections.world.groups[removing.group].filter(r => r.id !== removing.id); $('world-view').querySelector('.subtitle').textContent = activeBook.name + ' · 仅管理本书的势力、地点、物品和修行设定，创建和修改会同步到资料库世界观库。';
    syncTemplates(); renderPeople(); renderCollection('world'); removeDialog.close(); (removing.type === 'characters' ? $('new-person') : $('new-world')).focus(); notice('已删除书内卡片，资料库仍保留最后一次同步的模板。'); });
  $('edit-person').textContent = '编辑人物资料'; document.querySelector('[data-edit-record="world"]').textContent = '编辑世界观资料';
  if(window.desktopStore){const saved=window.desktopStore.get('pages');bookCards.clear();bookOutlineGroups.clear();(saved?.bookCards || []).forEach(([id,value])=>bookCards.set(id,value));(saved?.bookOutlines || []).forEach(([id,value])=>bookOutlineGroups.set(id,value));people=bookCards.get(activeBook.id)?.people || [];collections.world.groups=bookCards.get(activeBook.id)?.world || Object.fromEntries(Object.keys(collections.world.groups).map(key=>[key,[]]));collections.outline.groups=bookOutlineGroups.get(activeBook.id) || {大纲:[],章节细纲:[],伏笔:[]};if(saved?.library)Object.assign(collections.library.groups,saved.library);collections.ideas.groups.灵感=saved?.ideas?.灵感 || [];if(saved?.templates)templateStore.restore(saved.templates,templateStore.revision);nextCardId=saved?.nextCardId || 1;window.desktopStore.register('pages',()=>{bookCards.set(activeBook.id,{people,world:collections.world.groups});bookOutlineGroups.set(activeBook.id,collections.outline.groups);return {bookCards:[...bookCards],bookOutlines:[...bookOutlineGroups],library:collections.library.groups,ideas:{灵感:collections.ideas.groups.灵感},templates:templateStore.snapshot(),nextCardId,generatedRecordId};});}
  syncTemplates(); renderPeople(); Object.keys(collections).forEach(renderCollection);
  return {
    setBook,
    activeBookId:()=>activeBook.id,
    saveMaterial(view,group,item){const state=collections[view];state.groups[group] ||= [];const index=state.groups[group].findIndex(c=>c.id===item.id);if(index<0)state.groups[group].unshift(item);else state.groups[group][index]=item;state.active=group;state.selected=item.id;renderCollection(view);},
    removeMaterial(view,group,id){const state=collections[view];state.groups[group]=state.groups[group].filter(c=>c.id!==id);state.selected=null;renderCollection(view);},
    setTemplateVersion(value){templateVersion=value==='initial'?'initial':'latest';refreshTemplates();renderCollection('library');},
    removeBook(id){if(activeBook.id===id){people=[];collections.world.groups={地理:[],势力:[],修行:[],物品:[]};collections.outline.groups={大纲:[],章节细纲:[],伏笔:[]};activeBook={id:'__empty__',name:'未选择作品'};}const state=bookCards.get(id);if(state)templateStore.syncBook(bookInfo(id)||{id,name:id},[],{});bookCards.delete(id);bookOutlineGroups.delete(id);refreshTemplates();},
    getProgressionSnapshot(bookId = activeBook.id) {
      const state = bookId === activeBook.id ? {people,world:collections.world.groups} : bookCards.get(bookId) || {people:[],world:{}};
      return {bookId,cards:JSON.parse(JSON.stringify([...state.people.map(card => ({type:'characters',card})),...Object.entries(state.world).flatMap(([group,cards]) => cards.map(card => ({type:'world',group,card})))]))};
    },
    getStoryContext(bookId,chapter = Infinity) {
      const cards = this.getProgressionSnapshot(bookId).cards;
      const state=card=>{const current=window.previewProgression.context(card,chapter);if(window.desktopStore && Number.isFinite(chapter)){current.plannedState='';current.plannedAsOf=null;}return current;};
      return {people:cards.filter(item => item.type === 'characters').map(({card}) => ({...window.previewCardCore.person(card),...state(card)})),world:cards.filter(item => item.type === 'world').map(({card,group}) => ({...window.previewCardCore.world(card,group),...state(card)}))};
    },
    applyProgression(batch) {
      const state = batch.bookId === activeBook.id ? {people,world:collections.world.groups} : bookCards.get(batch.bookId);
      if (!state) throw new Error('这本书的卡片已经改变，请重新检查。');
      const prepared = batch.items.map(change => {
        const card = (change.type === 'characters' ? state.people : Object.values(state.world).flat()).find(item => item.id === change.id);
        if (!card || JSON.stringify(card) !== change.before) throw new Error('卡片在检查后发生了变化，请重新检查，避免覆盖新内容。');
        return {card,after:window.previewProgression.update(card,{...batch,...change})};
      });
      prepared.forEach(({card,after}) => Object.assign(card,after));
      templateStore.syncBook(bookInfo(batch.bookId) || activeBook,state.people,state.world); syncTemplates(); resetSearch(''); renderPeople(); renderCollection('world'); renderCollection('library');
      return prepared.length;
    },
    getAIContext(view, group, bookId) {
      if(view==='library'){syncReadingMaterials();refreshTemplates();}
      if (view === 'characters') return {people:(bookId && bookId !== activeBook.id ? bookCards.get(bookId)?.people || [] : people).map(window.previewCardCore.person)};
      const state = collections[view]; group = group || state.active;
      const items = state.groups[group] || [];
      return {group,items:JSON.parse(JSON.stringify(items.map(item => view === 'world' ? window.previewCardCore.world(item,group) : view === 'library' && item.source ? window.previewCardCore.template(item) : item))),selected:state.selected};
    },
    getForeshadowing(bookId) {
      const groups=bookId===activeBook.id?collections.outline.groups:bookOutlineGroups.get(bookId);
      return JSON.parse(JSON.stringify(groups?.伏笔 || []));
    },
    prepareForeshadowing(bookId,choices,chapter) {
      const groups=bookId===activeBook.id?collections.outline.groups:bookOutlineGroups.get(bookId);
      const before=JSON.parse(JSON.stringify(groups.伏笔)), updates=window.previewForeshadowingTransition(before,choices,chapter);
      const after=before.map(card=>updates.find(update=>update.id===card.id)||card);
      const refresh=()=>{if(bookId===activeBook.id)renderCollection('outline');window.dispatchEvent(new Event('preview-chapter-changed'));};
      return {commit(){groups.伏笔=after;refresh();},canUndo:()=>JSON.stringify(groups.伏笔)===JSON.stringify(after),undo(){groups.伏笔=before;refresh();}};
    },
    applyAIRecords(view,group,items,replaceFrom = null) {
      const archiveBefore = templateStore.snapshot(), bookId = activeBook.id;
      const state = collections[view], before = [...state.groups[group]];
      const added = items.map((item) => record('ai-record-' + generatedRecordId++,item.title,item.kind || (window.desktopStore ? (view==='world'?'其他':'AI 生成') : 'AI 示例'),item.summary,view === 'world' ? [] : item.fields || []));
      const index = replaceFrom ? before.findIndex((item) => item.id === replaceFrom) : -1;
      if (replaceFrom && typeof replaceFrom === 'object') {
        const ids = new Set(replaceFrom.ids), first = before.findIndex(item => ids.has(item.id));
        const insertion = first >= 0 ? first : before.length;
        state.groups[group] = [...before.slice(0,insertion).filter(item => !ids.has(item.id)),...added,...before.slice(insertion).filter(item => !ids.has(item.id))];
      } else state.groups[group] = index >= 0 ? [...before.slice(0,index),...added] : [...added,...before];
      state.active = group; state.selected = added[0]?.id; state.query = '';
      document.querySelector('[data-collection-tab="' + view + '"][data-group="' + group + '"]').click();
      if (view === 'world') syncTemplates();
      renderCollection(view); const after = JSON.stringify(state.groups[group]), archiveRevision = templateStore.revision;
      return () => { if (JSON.stringify(state.groups[group]) !== after || (view === 'world' && (bookId !== activeBook.id || !templateStore.restore(archiveBefore,archiveRevision)))) return false; state.groups[group] = before; if (view === 'world') syncTemplates(); state.selected = before[0]?.id; document.querySelector('[data-collection-tab="' + view + '"][data-group="' + group + '"]').click(); renderCollection(view); return true; };
    },
    applyAIPeople(items) {
      const before = [...people], archiveBefore = templateStore.snapshot(), bookId = activeBook.id;
      people = [...items.map((item) => ({id:'ai-person-' + generatedRecordId++,name:item.title,role:item.role || '配角',faction:item.faction || '',summary:item.summary,goalMotivation:item.goalMotivation || '',fields:[]})),...people];
      peopleRole = '全部'; peopleSort = 'default'; $('people-sort').value = 'default'; peopleQuery = ''; peoplePage = 1; selectedPerson = people[0].id;
      document.querySelectorAll('[data-person-role]').forEach((button) => button.setAttribute('aria-pressed',String(button.dataset.personRole === '全部'))); syncTemplates(); renderPeople(); const after = JSON.stringify(people), archiveRevision = templateStore.revision;
      return () => { if (bookId !== activeBook.id || JSON.stringify(people) !== after || !templateStore.restore(archiveBefore,archiveRevision)) return false; people = before; syncTemplates(); peoplePage = 1; selectedPerson = people[0]?.id; renderPeople(); return true; };
    },
    getPracticeContext() { return window.previewPracticeController?.context() || {index:activePrompt,title:prompts[activePrompt][0],prompt:prompts[activePrompt][1],text:$('practice-text').value}; },
    applyAIPracticePrompt(context,prompt) {
      const before = [...prompts[context.index]]; prompts[context.index] = [before[0],prompt];
      if (activePrompt === context.index) $('practice-description').textContent = prompt;
      return () => { if (prompts[context.index][1] !== prompt) return false; prompts[context.index] = before; if (activePrompt === context.index) $('practice-description').textContent = before[1]; return true; };
    },
    addIdea(title,summary) {
      const state = collections.ideas, id = 'reader-idea-' + state.groups.灵感.length;
      state.groups.灵感.unshift(record(id,title,'拆书笔记',summary,[['来源','阅读与拆书 · 本页笔记']])); state.active = '灵感'; state.selected = id; state.query = '';
      document.querySelector('[data-collection-tab="ideas"][data-group="灵感"]').click(); renderCollection('ideas');
    },
    searchDocuments() {
      refreshTemplates();syncReadingMaterials();
      const documents = people.map((person) => ({id:'person:' + person.id,type:'characters',view:'characters',title:person.name,path:'书内人物库 / ' + person.name,target:person.id,fields:[{label:'姓名',text:person.name,key:'name'},{label:'身份',text:person.role,key:'role'},{label:'所属',text:person.faction,key:'faction'},{label:'人物介绍',text:person.summary,key:'summary'},{label:'目标与动机',text:person.goalMotivation || '',key:'goalMotivation'}].filter((field,i,fields) => fields.findIndex((other) => other.text === field.text) === i)}));
      Object.entries(collections).forEach(([view,state]) => Object.entries(state.groups).forEach(([group,items]) => items.forEach((item) => documents.push({id:view + ':' + item.id,type:view,view,title:item.title,path:({world:'书内世界观库',outline:'大纲与伏笔',library:'资料库',ideas:'灵感'}[view]) + ' / ' + (group === '人物模板' ? '人物库' : group === '世界模板' ? '世界观库' : group) + ' / ' + item.title,target:item.id,group,fields:[{label:'名称',text:item.title,key:'title'},{label:'类别',text:item.kind,key:'kind'},{label:'介绍',text:item.summary,key:'summary'},...(view === 'world' ? [] : item.fields).map(([label,text],i) => ({label,text,key:i}))]}))));
      documents.forEach(doc => { if (['characters','world'].includes(doc.view)) { doc.bookId = activeBook.id; doc.id = activeBook.id + ':' + doc.id; doc.path = activeBook.name + ' / ' + doc.path; } });
      bookCards.forEach((state,bookId) => { if (bookId === activeBook.id) return; const name = bookInfo(bookId)?.name || bookId; state.people.forEach(person => documents.push({id:bookId + ':person:' + person.id,type:'characters',view:'characters',title:person.name,path:name + ' / 书内人物库 / ' + person.name,bookId,target:person.id,fields:[{label:'姓名',text:person.name,key:'name'},{label:'身份',text:person.role,key:'role'},{label:'所属',text:person.faction,key:'faction'},{label:'人物介绍',text:person.summary,key:'summary'},{label:'目标与动机',text:person.goalMotivation || '',key:'goalMotivation'}]})); Object.entries(state.world).forEach(([group,items]) => items.forEach(item => documents.push({id:bookId + ':world:' + item.id,type:'world',view:'world',title:item.title,path:name + ' / 书内世界观库 / ' + group,bookId,target:item.id,group,fields:[{label:'名称',text:item.title,key:'title'},{label:'类别',text:item.kind,key:'kind'},{label:'介绍',text:item.summary,key:'summary'}]}))); });
      if (!window.previewPracticeController) prompts.forEach(([title,description],index) => documents.push({id:'practice:' + index,type:'ideas',view:'ideas',title,path:'写作练习 / ' + title,target:index,group:'练习',fields:[{label:'题目',text:title,key:'title'},{label:'练习说明',text:description,key:'description'},{label:'练习正文',text:index === activePrompt ? $('practice-text').value : drafts[index],key:'draft'}]}));
      documents.forEach(document => {
        let card;
        if (['characters','world'].includes(document.view)) card = this.getProgressionSnapshot(document.bookId || activeBook.id).cards.find(item => item.type === document.view && item.card.id === document.target)?.card;
        else if (document.view === 'library') card = collections.library.groups[document.group]?.find(item => item.id === document.target)?.source?.card;
        if (card) { const summary = document.fields.find(field => field.key === 'summary'); if (summary) summary.text = window.previewProgression?.context(card).currentState || card.summary; (window.previewProgression?.fields(card) || []).forEach(([label,text],index) => document.fields.push({label,text,key:'progression:' + index})); }
      });
      return documents;
    },
    openSearchTarget(result) {
      if (result.bookId && result.bookId !== activeBook.id) openBookCards(result.bookId,result.view);
      if (result.view === 'characters') {
        peopleRole = '全部'; peopleQuery = ''; selectedPerson = result.target;
        document.querySelectorAll('[data-person-role]').forEach((b) => b.setAttribute('aria-pressed',String(b.dataset.personRole === '全部')));
        const ordered = peopleSort === 'name' ? [...people].sort((a,b) => a.name.localeCompare(b.name,'zh-CN')) : people;
        peoplePage = Math.floor(ordered.findIndex((person) => person.id === selectedPerson) / pageSize) + 1; renderPeople();
        if (String(result.field.key).startsWith('progression:')) return progressionTarget($('person-fields'),result.field.label);
        return ['faction','goalMotivation'].includes(result.field.key) ? [...$('person-fields').querySelectorAll('dt')].find(dt => dt.textContent.endsWith(result.field.key === 'faction' ? '所属' : '目标与动机'))?.nextElementSibling : $({name:'detail-name',role:'detail-role',summary:'detail-summary'}[result.field.key]);
      }
      if (result.group === '练习') {
        document.querySelector('[data-collection-tab="ideas"][data-group="练习"]').click();
        document.querySelector('[data-practice="' + result.target + '"]').click();
        return $({title:'practice-title',description:'practice-description',draft:'practice-text'}[result.field.key]);
      }
      const state = collections[result.view]; state.query = ''; state.active = result.group; state.selected = result.target;
      document.querySelector('[data-collection-tab="' + result.view + '"][data-group="' + result.group + '"]').click();
      renderCollection(result.view);
      if (String(result.field.key).startsWith('progression:')) return progressionTarget($(result.view + '-detail-fields'),result.field.label);
      return typeof result.field.key === 'number' ? $(result.view + '-detail-fields').querySelectorAll('dd')[result.field.key] : $(result.view + '-detail-' + result.field.key);
    },
    filter(view, query) {
      if (view === 'characters') { if (peopleQuery !== query) peoplePage = 1; peopleQuery = query; renderPeople(); }
      if (collections[view]) {
        collections[view].query = query;
        if (view === 'ideas' && query) {
          $('ideas-catalog').hidden = false; $('practice-panel').hidden = true; $('ideas-count').hidden = false;
          document.querySelectorAll('[data-collection-tab="ideas"]').forEach((b) => b.setAttribute('aria-pressed',String(b.dataset.group === '灵感')));
        }
        renderCollection(view);
      }
    }
  };
};
