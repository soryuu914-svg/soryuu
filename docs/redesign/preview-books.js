/* One title/content editor shared by global inspiration and per-book notes. */
window.createPreviewNoteEditor = ({notice}) => {
  const $ = id => document.getElementById(id), dialog = $('book-note-dialog'); let editing = null, composing = false;
  if (!dialog) return {open:() => notice('请使用最新预览编辑灵感内容。')};
  const grow = () => { const input = $('book-note-body'); input.style.height = 'auto'; input.style.height = Math.min(360,Math.max(160,input.scrollHeight)) + 'px'; };
  const clearError = event => { if (!event.isComposing) { event.target.removeAttribute('aria-invalid'); $('book-note-error').textContent = ''; } };
  $('book-note-form').addEventListener('input',clearError); $('book-note-form').addEventListener('compositionend',clearError);
  $('book-note-form').addEventListener('compositionstart',() => { composing = true; }); $('book-note-form').addEventListener('compositionend',() => { composing = false; });
  $('book-note-body').addEventListener('input',event => { if (!event.isComposing) grow(); }); $('book-note-body').addEventListener('compositionend',grow);
  $('book-note-cancel').addEventListener('click',() => dialog.close());
  dialog.addEventListener('close',() => { const target = editing?.source?.isConnected ? editing.source : editing?.resolveFocus?.(); if (target && !target.closest('[hidden]')) target.focus(); editing = null; });
  $('book-note-form').addEventListener('submit',event => {
    event.preventDefault(); if (event.isComposing || composing || !editing) return;
    const title = $('book-note-title').value.trim(), summary = $('book-note-body').value.trim();
    if (!title || !summary) { $('book-note-error').textContent = title ? '请填写灵感或设定内容。' : '请填写标题。'; const input = $(title ? 'book-note-body' : 'book-note-title'); input.setAttribute('aria-invalid','true'); input.focus(); return; }
    const action = editing; action.onSave({title,summary}); dialog.close(); notice(action.feedback);
  });
  return {open(options) {
    editing = options; composing = false; $('book-note-heading').textContent = (options.record ? '修改' : '新建') + options.kind;
    $('book-note-context').textContent = options.context; $('book-note-title').value = options.record?.title || ''; $('book-note-body').value = options.record?.summary || '';
    $('book-note-body').placeholder = options.kind === '灵感' ? '概括整本书：主角是谁，获得什么金手指，要完成什么目标。' : '写下能力、用途、限制与代价。';
    $('book-note-form').querySelector('[type="submit"]').textContent = options.saveLabel;
    $('book-note-error').textContent = ''; ['book-note-title','book-note-body'].forEach(id => { $(id).removeAttribute('aria-invalid'); $(id).setAttribute('aria-required','true'); });
    dialog.showModal(); grow(); $('book-note-title').focus();
  }};
};
/* Shared book metadata flow for this local design preview. */
window.createPreviewBooks = ({ switchView, notice, filterBooks, onPrimaryChanged, noteEditor, getIdeaLibrary = () => [] }) => {
  noteEditor ||= window.createPreviewNoteEditor({notice});
  const $ = (id) => document.getElementById(id);
  const books = [
    {id:'main',name:'修仙世界：从凡人到仙帝',description:'一个平凡少年，走出小山村，踏上一条不肯认命的修行之路。',genre:'玄幻 · 修仙',words:'24,680',chapters:12,updated:'今天编辑',cover:'从凡人到仙帝',color:''},
    {id:'letter',name:'长街来信',description:'旧街道上的一间邮局，收留了那些没有寄出的告别。',genre:'都市 · 日常',words:'8,420',chapters:4,updated:'昨天编辑',cover:'长街来信',color:'blue'},
    {id:'dawn',name:'第七次黎明',description:'每当太阳升起，世界便少一个人。只有她记得他们的名字。',genre:'科幻 · 悬疑',words:'3,180',chapters:2,updated:'9 月 30 日编辑',cover:'第七次黎明',color:'gray'}
  ];
  let editingId = null, trigger = null, nextId = 1, selectedBookId = 'main', nextNoteId = 1;
  const bookNotes = new Map([
    ['main',{ideas:[{id:'seed-idea-1',title:'追寻命运的线索，寻找成仙的另一条路',summary:'小村少年林逸意外获得追踪命运线索的能力。他为了救下被仙门献祭的故乡进入修行世界，逐步揭开仙门以凡人续命的秘密，最终寻找不牺牲他人也能成仙的道路。'},{id:'seed-idea-2',title:'在试炼中成长，打破修行垄断',summary:'毫无灵根的少年意外获得在试炼中积累力量的能力。他为了救回被囚禁的家人闯过一次次试炼，在修为提升中揭开宗门垄断传承的真相，最终让普通人也有选择修行的机会。'}],golden:[{id:'seed-golden-1',title:'回声罗盘',summary:'追踪与自己的选择有关的线索。每次使用都要付出记忆的代价，不能直接得到答案。'}]}],
    ['letter',{ideas:[{id:'letter-idea-1',title:'读懂未寄出的信，找回被遗忘的人',summary:'接手旧街邮局的年轻人获得读取信件残留记忆的能力。为了寻找失踪的母亲，他替一封封未寄出的信找到收件人，却发现这些人的过去都指向同一场被抹去的事故。他必须在邮局拆除前拼出真相，让失去身份的人重新被世界记住。'}],golden:[]}],
    ['dawn',{ideas:[{id:'dawn-idea-1',title:'保留重置前的记忆，终止黎明清除',summary:'每次黎明都会有人被世界抹去，女主意外获得保留重置前记忆的能力。她为了救回消失的弟弟，在一次次重置中追查清除规则，逐渐发现世界是一个运行失败的实验。她必须在自己也被清除前找到控制系统，终止重置并让消失的人回来。'}],golden:[{id:'dawn-golden-1',title:'黎明之前的记忆',summary:'能保留世界重置前的记忆，却无法让他人直接相信。每次追查都会改变下一次黎明。'}]}]
  ]);
  if (window.desktopStore) { const saved=window.desktopStore.get('books'); books.splice(0,books.length,...(saved?.books || [])); bookNotes.clear(); (saved?.homes || []).forEach(([id,state])=>bookNotes.set(id,state)); nextId=saved?.nextId || 1; nextNoteId=saved?.nextNoteId || 1; selectedBookId=saved?.selectedBookId || books[0]?.id || 'main'; window.desktopStore.register('books',()=>({books,homes:[...bookNotes],nextId,nextNoteId,selectedBookId})); }
  const homeState = id => { if (!bookNotes.has(id)) bookNotes.set(id,{ideas:[],golden:[],ideaArchive:[],goldenArchive:{}}); return bookNotes.get(id); };
  // One selected premise per book; older demo alternatives remain in the archive.
  bookNotes.forEach(state => { state.ideaArchive ||= state.ideas.slice(1); state.ideas = state.ideas.slice(0,1); state.goldenArchive ||= {}; });
  const picker = $('book-idea-picker'); let pickerBookId = null, pickerIdeas = [];
  const previewChoice = () => {
    const idea = pickerIdeas.find(item => item.id === $('book-idea-choice').value);
    $('book-idea-preview').textContent = idea?.summary || '灵感库还没有条目，请先到灵感板块记录或生成。';
    $('book-idea-picker-save').disabled = !idea;
  };
  $('book-select-idea').addEventListener('click',() => {
    pickerBookId = selectedBookId; pickerIdeas = getIdeaLibrary(); const select = $('book-idea-choice'); select.replaceChildren();
    pickerIdeas.forEach(idea => { const option = document.createElement('option'); option.value = idea.id; option.textContent = idea.title; select.append(option); });
    const current = homeState(pickerBookId).ideas[0]; if (pickerIdeas.some(idea => idea.id === current?.sourceIdeaId)) select.value = current.sourceIdeaId;
    $('book-idea-picker-info').textContent = '更换灵感时，原金手指随旧灵感保留；新灵感需在书内生成对应金手指。选回旧灵感会恢复它的设定。本页预览刷新恢复。';
    previewChoice(); picker.showModal(); select.focus();
  });
  $('book-idea-choice').addEventListener('change',previewChoice);
  $('book-idea-picker-cancel').addEventListener('click',() => picker.close());
  picker.addEventListener('close',() => $('book-select-idea').focus());
  $('book-idea-picker-form').addEventListener('submit',event => {
    event.preventDefault(); const idea = pickerIdeas.find(item => item.id === $('book-idea-choice').value); if (!idea) return;
    const state = homeState(pickerBookId), old = state.ideas[0];
    if (old?.sourceIdeaId === idea.id) { picker.close(); notice('本书已选定这条灵感，保留书内修改。'); return; }
    if (old) { state.ideaArchive.push({...old}); state.goldenArchive[old.sourceIdeaId || old.id] = state.golden; }
    const saved = [...state.ideaArchive].reverse().find(item => item.sourceIdeaId === idea.id);
    state.ideas = [saved ? {...saved} : {id:'book-note-' + nextNoteId++,sourceIdeaId:idea.id,title:idea.title,summary:idea.summary}];
    state.golden = state.goldenArchive[idea.id] || (idea.golden || []).map(item => ({...item,id:'book-note-' + nextNoteId++}));
    renderHome(); picker.close(); notice('已选入一条核心灵感；金手指仅使用该灵感关联的设定。');
  });
  const renderHome = () => {
    if (!$('bookhome-view')) return;
    const book = books.find(item => item.id === selectedBookId); if(!book)return; const state = homeState(book.id);
    $('book-home-title').textContent = book.name; $('book-home-description').textContent = book.description || '还没有简介，先从一个灵感开始。';
    $('book-home-genre').textContent = book.genre; $('book-home-stats').textContent = book.words + ' 字 · ' + book.chapters + ' 章';
    $('book-home-writing').hidden = !window.desktopStore && book.id !== 'main';
    $('book-golden-generate').disabled = !state.ideas[0];
    $('book-golden-generate').textContent = state.ideas[0] ? '依据本书灵感生成金手指' : '先从灵感库选定一条灵感';
    ['ideas','golden'].forEach(type => {
      const list = $('book-home-' + type + '-list'); list.replaceChildren(); $('book-home-' + type + '-count').textContent = state[type].length + ' 条';
      $('book-home-' + type + '-empty').hidden = state[type].length > 0;
      state[type].forEach(note => {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'book-home-note'; row.dataset.bookNote = note.id; row.dataset.noteType = type;
        const title = document.createElement('strong'),body = document.createElement('p'),hint = document.createElement('span'); title.textContent = note.title; body.textContent = note.summary; hint.textContent = '查看与修改 ›'; row.append(title,body,hint);
        row.addEventListener('click',() => openNote(type,note.id,row)); list.append(row);
      });
    });
  };
  const openBookHome = id => { if (!books.some(book => book.id === id)) return false; if (!$('bookhome-view')) { if (id === 'main') switchView('editor'); else notice('这部作品为展示示例。'); return true; } selectedBookId = id; window.dispatchEvent(new CustomEvent('desktop-book-changed',{detail:{id}})); renderHome(); switchView('bookhome'); $('book-home-title').focus(); return true; };
  const openNote = (type,id,source) => {
    const bookId = selectedBookId, note = homeState(bookId)[type].find(item => item.id === id), kind = type === 'ideas' ? '灵感' : '金手指';
    if (!note) { notice('请先选入灵感或带入已有金手指设定。书籍首页只修改已有内容。'); return; }
    noteEditor.open({record:note,kind,context:books.find(book => book.id === bookId).name,source,saveLabel:'保存到这本书',
      resolveFocus:() => id ? document.querySelector('[data-book-note="' + id + '"]') : null,
      feedback:'已保留这本书的' + kind + '，切换作品不会混在一起；刷新恢复示例。',
      onSave({title,summary}) { const state = homeState(bookId), existing = state[type].find(item => item.id === id); if (existing) { existing.title = title; existing.summary = summary; } else state[type].unshift({id:'book-note-' + nextNoteId++,title,summary}); renderHome(); }
    });
  };
  document.querySelectorAll('[data-book-note-new]').forEach(button => button.addEventListener('click',() => openNote(button.dataset.bookNoteNew,null,button)));
  document.querySelectorAll('[data-book-open-primary]').forEach(button => button.addEventListener('click',() => openBookHome(window.desktopStore ? selectedBookId : 'main')));
  const dialog = $('book-info-dialog');
  const growDescription = () => {
    const input = $('book-description'); input.style.height = 'auto'; input.style.height = Math.min(320,Math.max(170,input.scrollHeight)) + 'px';
    $('book-description-count').textContent = input.value.length + ' / 1,000 个字符';
  };
  const open = (id, source) => {
    editingId = id; trigger = source;
    const book = books.find((item) => item.id === id);
    $('book-info-title').textContent = book ? '编辑作品信息' : '新建作品';
    $('book-name').value = book?.name ?? '';
    $('book-description').value = book?.description ?? '';
    $('book-name-error').textContent = ''; $('book-name').removeAttribute('aria-invalid');
    $('book-info-submit').textContent = book ? '保存修改' : '创建示例作品';
    dialog.showModal(); growDescription(); $('book-name').focus();
  };
  const render = () => {
    const grid = $('book-grid'); grid.replaceChildren();
    books.forEach((book) => {
      const card = document.createElement('article'); card.className = 'book-card'; card.dataset.book = book.name; card.dataset.bookId = book.id; card.dataset.description = book.description;
      const openButton = document.createElement('button'); openButton.type = 'button'; openButton.className = 'book-open';
      openButton.setAttribute('aria-label','打开作品《' + book.name + '》');
      openButton.innerHTML = '<div class="book-card-top"><div class="cover"><span></span><small>示例作品</small></div><div class="book-info"><h3></h3><span class="tag"></span></div></div><p class="book-synopsis"></p><div class="book-meta"><span><strong></strong><span class="chapter-number"></span></span><span class="book-updated"></span></div>';
      openButton.querySelector('.cover').classList.add(book.color || 'ink');
      openButton.querySelector('.cover span').textContent = book.cover;
      openButton.querySelector('.cover').title = book.name;
      openButton.querySelector('h3').textContent = book.name;
      openButton.querySelector('.tag').textContent = book.genre;
      openButton.querySelector('.book-synopsis').textContent = book.description || '暂无简介';
      openButton.querySelector('strong').textContent = book.words;
      openButton.querySelector('.chapter-number').textContent = ' 字 · ' + book.chapters + ' 章';
      openButton.querySelector('.book-updated').textContent = book.updated;
      openButton.addEventListener('click',() => openBookHome(book.id));
      const actions = document.createElement('div'); actions.className = 'book-card-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'book-edit'; edit.dataset.editBook = book.id;
      edit.innerHTML = '<span>编辑信息</span>';
      edit.setAttribute('aria-label','编辑《' + book.name + '》的书名和简介');
      edit.addEventListener('click',() => open(book.id,edit));
      const hint = document.createElement('span'); hint.textContent = '进入这本书的首页';
      actions.append(edit,hint); card.append(openButton,actions); grid.append(card);
    });
    const primary = books.find((book) => book.id === selectedBookId) || books[0] || {name:'还没有作品',id:'main'};
    document.querySelectorAll('[data-nav="home"] small').forEach((node) => { node.textContent = String(books.length); });
    document.querySelectorAll('[data-primary-book-title]').forEach((node) => { node.textContent = primary.name; });
    $('edit-current-book')?.setAttribute('aria-label','编辑最近作品《' + primary.name + '》的书名和简介');
    if(window.desktopStore){const recent=document.querySelector('.continue');recent.hidden=!books.length;recent.querySelector('h2 + p').textContent=(primary.chapters || 0)+' 章 · '+(primary.words || 0)+' 字';const snippet=recent.querySelector('.manuscript-snippet');snippet.querySelector('h3').textContent='作品简介';snippet.querySelector('p').textContent=primary.description || '从灵感选入故事主线，再开始创作。';snippet.querySelector('small').textContent='保存在本机数据库';} filterBooks(); renderHome();
  };
  $('edit-current-book')?.addEventListener('click',(event) => open('main',event.currentTarget));
  $('new-book').addEventListener('click',(event) => open(null,event.currentTarget));
  $('book-info-cancel').addEventListener('click',() => dialog.close());
  dialog.addEventListener('close',() => {
    const replacement = editingId && document.querySelector('[data-edit-book="' + editingId + '"]');
    const target = trigger?.isConnected ? trigger : replacement;
    if (target && !target.closest('[hidden]')) target.focus(); else $('search').focus();
    trigger = null;
  });
  $('book-description').addEventListener('input',(event) => { if (!event.isComposing) growDescription(); });
  $('book-description').addEventListener('compositionend',growDescription);
  $('book-name').addEventListener('input',(event) => {
    if (!event.isComposing && $('book-name').value.trim()) { $('book-name').removeAttribute('aria-invalid'); $('book-name-error').textContent = ''; }
  });
  $('book-info-form').addEventListener('submit',(event) => {
    event.preventDefault();
    const name = $('book-name').value.trim();
    if (!name) { $('book-name-error').textContent = '请填写书名，不能只输入空格。'; $('book-name').setAttribute('aria-invalid','true'); $('book-name').focus(); return; }
    const description = $('book-description').value.trim();
    const book = books.find((item) => item.id === editingId);
    if (book) {
      book.name = name; book.description = description;
      book.cover = Array.from(name.replace(/[：:，,。.!！?？\s]/g,'')).slice(0,8).join('');
    } else {
      books.push({id:window.desktopStore ? 'book-' + crypto.randomUUID() : 'book-' + nextId++,name,description,genre:'待设定',words:'0',chapters:0,updated:'刚刚创建 · 示例',cover:Array.from(name).slice(0,8).join(''),color:'gray'});
      if(window.desktopStore){selectedBookId=books.at(-1).id;window.dispatchEvent(new CustomEvent('desktop-book-changed',{detail:{id:selectedBookId}}));}
    }
    render(); onPrimaryChanged(); dialog.close();
    notice((book ? '已更新「' : '已创建示例作品「') + name + (book ? '」的本页示例信息。' : '」。') + '刷新后恢复示例，不写入真实作品。');
  });
  render();
  return {
    openBookHome,
    currentBookContext:() => ({id:selectedBookId,name:'未选择作品',...books.find(book => book.id === selectedBookId)}),
    getInspirations:(id = selectedBookId) => homeState(id).ideas.map(note => ({...note})),
    getGolden:(id = selectedBookId) => homeState(id).golden.map(note => ({...note})),
    bookInfo:id => books.find(book => book.id === id) ? {...books.find(book => book.id === id)} : null,
    applyHomeAI(bookId,type,candidates) {
      const state = homeState(bookId), before = [...state[type]];
      if (type === 'ideas' || !state.ideas[0] || state.golden.length) throw new Error('书籍首页只选择灵感和修改已有设定；首次生成金手指需要已选定的灵感。');
      state[type] = [...candidates.map(item => ({id:'book-note-' + nextNoteId++,title:item.title,summary:item.summary + (type !== 'ideas' && item.fields?.length ? '\n\n' + item.fields.map(([label,value]) => label + '：' + value).join('\n') : '')})),...before]; const after = JSON.stringify(state[type]); openBookHome(bookId);
      return () => { if (JSON.stringify(state[type]) !== after) return false; state[type] = before; openBookHome(bookId); return true; };
    },
    homeSearchDocuments:() => books.flatMap(book => ['ideas','golden'].flatMap(type => homeState(book.id)[type].map(note => ({id:'book-home:' + book.id + ':' + note.id,type:type === 'ideas' ? 'ideas' : 'world',view:'bookhome',title:note.title,path:book.name + ' / 作品首页 / ' + (type === 'ideas' ? '灵感' : '金手指'),target:book.id,noteId:note.id,noteType:type,fields:[{label:'标题',key:'title',text:note.title},{label:'内容',key:'body',text:note.summary}]})))),
    openHomeSearchTarget(result) { openBookHome(result.target); const row = document.querySelector('[data-book-note="' + result.noteId + '"]'); return row.querySelector(result.field.key === 'title' ? 'strong' : 'p'); },
    useAICandidate(candidate,source) {
      if (!dialog.open) open(null,source);
      $('book-name').value = candidate.title; $('book-description').value = candidate.summary.slice(0,1000); growDescription(); $('book-name').focus();
    },
    primaryTitle: () => (books.find((book) => book.id === (window.desktopStore ? selectedBookId : 'main')) || books[0])?.name || '未选择作品',
    listBooks:()=>books.map(book=>({...book})),
    removeBook(id) { const index=books.findIndex(book=>book.id===id); if(index<0)return;books.splice(index,1);bookNotes.delete(id);selectedBookId=books[0]?.id || 'main';render();switchView('home'); },
    updateDraftStats(chapters,words,id=window.desktopStore ? selectedBookId : 'main') { const book = books.find((item) => item.id === id); if(!book)return; book.chapters = chapters; book.words = words.toLocaleString('zh-CN'); render(); },
    searchDocuments: () => books.map((book) => ({id:'book:' + book.id,type:'books',view:'home',title:book.name,path:'作品 / ' + book.name,target:book.id,fields:[{label:'书名',text:book.name,key:'name'},{label:'简介',text:book.description,key:'description'},{label:'类型',text:book.genre,key:'genre'}]})),
    openSearchTarget(result) {
      const card = document.querySelector('[data-book-id="' + result.target + '"]');
      card.classList.add('search-target-card');
      return card.querySelector(result.field.key === 'description' ? '.book-synopsis' : result.field.key === 'genre' ? '.tag' : 'h3');
    }
  };
};
