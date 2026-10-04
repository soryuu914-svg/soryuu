/* One content index across all preview pages. Rebuilt from current in-memory data. */
window.previewSearchMatches = (documents, rawQuery) => {
  const query = rawQuery.trim().toLocaleLowerCase('zh-CN');
  if (!query) return [];
  const matches = [];
  documents.forEach((document) => document.fields.forEach((field) => {
    const text = String(field.text || ''), normalized = text.toLocaleLowerCase('zh-CN');
    let from = 0, position, occurrence = 0;
    while ((position = normalized.indexOf(query,from)) !== -1) {
      matches.push({...document,field,position,length:query.length,occurrence:++occurrence});
      from = position + query.length;
    }
  }));
  return matches;
};

window.createPreviewSearch = ({ getDocuments, showResults, restoreView, openResult }) => {
  const $ = (id) => document.getElementById(id);
  const types = {all:'全部',books:'作品',chapters:'正文',characters:'人物',world:'世界观',outline:'大纲与伏笔',plots:'剧情卡',scenes:'场景卡',library:'资料',reading:'阅读拆书',ideas:'灵感与练习'};
  const input = $('search'), panel = $('global-search-view');
  let matches = [], type = 'all', page = 1, query = '', timer = null, suppressFocus = false;
  const pageSize = 12;
  const clearHighlight = () => {
    document.querySelectorAll('mark.search-hit').forEach((mark) => { const parent = mark.parentNode; mark.replaceWith(document.createTextNode(mark.textContent)); parent.normalize(); });
    document.querySelectorAll('.search-target-card').forEach((node) => node.classList.remove('search-target-card'));
    document.querySelectorAll('[data-search-target]').forEach((node) => { node.removeAttribute('data-search-target'); node.removeAttribute('tabindex'); });
  };
  const hide = (restore = true) => { clearTimeout(timer); panel.hidden = true; input.setAttribute('aria-expanded','false'); if (restore) restoreView(); };
  const selectResult = (result) => {
    clearHighlight(); hide(false);
    const target = openResult(result);
    if (!target) return;
    target.setAttribute('data-search-target','true');
    target.scrollIntoView({block:'center',behavior:'instant'});
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      target.focus(); target.setSelectionRange(result.position,result.position + result.length);
      if (target instanceof HTMLTextAreaElement) {
        const style = getComputedStyle(target), mirror = document.createElement('div');
        Object.assign(mirror.style,{position:'absolute',visibility:'hidden',left:'-100000px',top:'0',width:target.clientWidth + 'px',boxSizing:'border-box',font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,padding:style.padding,whiteSpace:'pre-wrap',overflowWrap:'break-word'});
        const caret = document.createElement('span'); caret.textContent = target.value.slice(result.position,result.position + result.length);
        mirror.append(document.createTextNode(target.value.slice(0,result.position)),caret); document.body.append(mirror);
        const offset = caret.offsetTop; mirror.remove();
        target.scrollTop = Math.max(0,offset - target.clientHeight / 3);
        const scroller = target.closest('.editor-middle');
        if (scroller) scroller.scrollTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + offset - scroller.clientHeight / 3;
      }
    } else {
      const text = target.textContent;
      const mark = document.createElement('mark'); mark.className = 'search-hit'; mark.textContent = text.slice(result.position,result.position + result.length);
      target.replaceChildren(document.createTextNode(text.slice(0,result.position)),mark,document.createTextNode(text.slice(result.position + result.length)));
      target.setAttribute('tabindex','-1'); target.focus({preventScroll:true});
      mark.scrollIntoView({block:'center',behavior:'instant'});
    }
    $('notice').textContent = '已定位到「' + result.title + '」的' + result.field.label + '。再次点击右上角搜索，可继续查看其他命中位置。';
  };
  const render = () => {
    const filtered = matches.filter((result) => type === 'all' || result.type === type);
    const totalPages = Math.max(1,Math.ceil(filtered.length / pageSize)); page = Math.min(page,totalPages);
    $('global-search-title').textContent = '搜索「' + query + '」';
    $('global-search-status').textContent = filtered.length + ' 处命中 · ' + new Set(filtered.map((result) => result.id)).size + ' 个条目';
    const filters = $('global-search-filters'); filters.replaceChildren();
    Object.entries(types).forEach(([key,label]) => {
      const count = key === 'all' ? matches.length : matches.filter((result) => result.type === key).length;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.searchType = key;
      button.textContent = label + ' ' + count; button.setAttribute('aria-pressed',String(type === key));
      button.addEventListener('click',() => { type = key; page = 1; render(); filters.querySelector('[aria-pressed="true"]').focus(); }); filters.append(button);
    });
    const list = $('global-search-results'); list.replaceChildren();
    filtered.slice((page - 1) * pageSize,page * pageSize).forEach((result) => {
      const item = document.createElement('li'), button = document.createElement('button'); button.type = 'button'; button.className = 'search-result'; button.dataset.searchDocument = result.id;
      const header = document.createElement('span'); header.className = 'search-result-head';
      const title = document.createElement('strong'); title.textContent = result.title;
      const badge = document.createElement('span'); badge.className = 'person-role'; badge.textContent = types[result.type]; header.append(title,badge);
      const path = document.createElement('span'); path.className = 'search-result-path'; path.textContent = result.path + ' / ' + result.field.label + ' · 第 ' + result.occurrence + ' 处';
      const snippet = document.createElement('span'); snippet.className = 'search-result-snippet';
      const text = result.field.text, start = Math.max(0,result.position - 35), end = Math.min(text.length,result.position + result.length + 65);
      const mark = document.createElement('mark'); mark.textContent = text.slice(result.position,result.position + result.length);
      snippet.append(document.createTextNode((start ? '…' : '') + text.slice(start,result.position)),mark,document.createTextNode(text.slice(result.position + result.length,end) + (end < text.length ? '…' : '')));
      const hint = document.createElement('span'); hint.className = 'search-result-link'; hint.textContent = '定位到这里 ›';
      button.append(header,path,snippet,hint); button.addEventListener('click',() => selectResult(result)); item.append(button); list.append(item);
    });
    $('global-search-empty').hidden = filtered.length > 0;
    $('global-search-empty-description').textContent = matches.length && type !== 'all' ? '当前分类没有命中，试试其他分类或查看全部。' : '换个名字或关键词再试试；这里只搜索当前预览中的作品内容。';
    $('global-search-range').textContent = filtered.length ? ((page - 1) * pageSize + 1) + '–' + Math.min(page * pageSize,filtered.length) + ' / ' + filtered.length + ' 处 · 第 ' + page + ' / ' + totalPages + ' 页' : '0 处命中';
    $('global-search-prev').disabled = page <= 1; $('global-search-next').disabled = page >= totalPages;
  };
  const search = () => {
    clearTimeout(timer); query = input.value.trim(); $('clear-search').hidden = !input.value;
    if (!query) { hide(); return; }
    clearHighlight(); type = 'all'; page = 1; matches = window.previewSearchMatches(getDocuments(),query);
    showResults(); panel.hidden = false; input.setAttribute('aria-expanded','true'); render();
  };
  const clear = () => { input.value = ''; query = ''; hide(); $('clear-search').hidden = true; input.focus(); };
  input.addEventListener('input',(event) => {
    clearTimeout(timer); $('clear-search').hidden = !input.value;
    if (!event.isComposing) { if (!input.value.trim()) clear(); else timer = setTimeout(search,300); }
  });
  input.addEventListener('compositionstart',() => clearTimeout(timer));
  input.addEventListener('compositionend',search);
  input.addEventListener('focus',() => { if (!suppressFocus && input.value.trim() && panel.hidden) search(); });
  input.addEventListener('click',() => { if (input.value.trim() && panel.hidden) search(); });
  input.addEventListener('keydown',(event) => { if (event.isComposing) return; if (event.key === 'Enter') { event.preventDefault(); search(); } if (event.key === 'ArrowDown' && !panel.hidden) { event.preventDefault(); $('global-search-results').querySelector('button')?.focus(); } });
  document.addEventListener('keydown',(event) => { if (event.key === 'Escape' && !panel.hidden && !event.isComposing) { event.preventDefault(); hide(); suppressFocus = true; input.focus(); suppressFocus = false; } });
  $('clear-search').addEventListener('click',clear); $('global-search-clear').addEventListener('click',clear);
  $('global-search-back').addEventListener('click',() => { hide(); document.querySelector('[data-nav][aria-current="page"]')?.focus(); });
  $('global-search-prev').addEventListener('click',() => { page--; render(); if ($('global-search-prev').disabled) $('global-search-range').focus(); });
  $('global-search-next').addEventListener('click',() => { page++; render(); if ($('global-search-next').disabled) $('global-search-range').focus(); });
  return {hide,clear,clearHighlight};
};
