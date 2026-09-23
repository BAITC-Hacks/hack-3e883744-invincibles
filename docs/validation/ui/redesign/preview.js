/* Review prototype. Reads a fixed synthetic API snapshot; never writes to an API. */
(() => {
  'use strict';
  const data = window.SHAGRA_DESIGN;
  const profile = data.profile;
  const overview = data.overview;
  const params = new URLSearchParams(location.search);
  const view = params.get('view') === 'hr' ? 'hr' : 'profile';
  const section = params.get('section') || 'overview';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const name = value => typeof value === 'string' ? value : value?.ru || value?.en || 'Без названия';
  const num = value => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1}).format(value);
  const pct = value => `${num(value)}%`;
  const icon = value => `<span class="sh-icon" aria-hidden="true">${data.icons[value] || ''}</span>`;
  const types = {course:'Курс',workshop:'Практикум',mentoring:'Наставничество'};
  const reasons = {no_catalog_coverage:'Нет подходящих активностей',incomplete_skills:'Не хватает оценок навыков',no_next_grade:'Финальный грейд',target_met:'Цель достигнута',all_useful_completed:'Полезные активности выполнены'};
  const skillName = id => name(profile.skill_rows.find(row => row.skill_id === id)?.name || id);
  const gaps = profile.skill_rows.filter(row => row.gap > 0).sort((a,b) => b.gap-a.gap || name(a.name).localeCompare(name(b.name),'ru'));
  const gapRows = [...overview.skill_gaps].sort((a,b) => b.affected_count-a.affected_count || name(a.name).localeCompare(name(b.name),'ru'));
  const counts = Object.fromEntries(Object.keys(reasons).map(key => [key, overview.no_step.filter(row => row.reason === key).length]));
  const nav = view === 'hr' ? [['overview','Обзор','layout-dashboard'],['import','Импорт','upload']] : [['overview','Обзор','layout-dashboard'],['skills','Навыки','grid-2x2'],['history','История','history']];
  const link = next => `?view=${view}&section=${next}`;
  const navLinks = () => nav.map(([key,label,glyph]) => `<a href="${link(key)}" ${section === key ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('');
  const button = (label,action,primary = false) => `<button class="sh-button ${primary ? 'sh-button-primary' : ''}" data-action="${action}">${label}</button>`;
  const stat = (label,value,hint,meter) => `<div class="sh-stat"><span class="sh-stat-label">${label}</span><span class="sh-stat-value">${value}</span><span class="sh-stat-hint">${hint}</span>${meter == null ? '' : `<div class="sh-meter" aria-hidden="true"><span style="width:${meter}%"></span></div>`}</div>`;
  const effect = item => `<div class="sh-rec-effect"><span class="sh-number">${pct(item.preview.coverage_before)}</span>${icon('arrow-right')}<span class="sh-number">${pct(item.preview.coverage_after)}</span><span class="sh-delta">+${num(item.preview.coverage_after-item.preview.coverage_before)} п.п.</span></div>`;
  const stateOf = row => row.current == null ? 'unknown' : row.target == null ? 'unrequired' : row.gap > 0 ? 'gap' : 'covered';
  const stateLabels = {gap:'Есть дефицит',covered:'Цель закрыта',unknown:'Нет оценки',unrequired:'Нет требования'};
  const selected = row => `<strong>${esc(name(row.name))}</strong><span>Сейчас ${row.current ?? 'нет оценки'} · требуется ${row.target ?? '—'}${row.gap > 0 ? ` · дефицит ${row.gap}` : ''}</span>`;
  const levels = rows => rows.map(row => `<div><div class="sh-level-head"><span>${esc(name(row.name))}</span><span class="sh-number">${row.current ?? '—'} / ${row.target ?? '—'}</span></div><div class="sh-level-track" aria-hidden="true"><span class="sh-level-target" style="width:${(row.target || 0)*20}%"></span><span class="sh-level-current" style="width:${(row.current || 0)*20}%"></span></div></div>`).join('');
  function skillPanel() {
    return `<section class="sh-panel sh-skills-panel"><div class="sh-panel-head"><h2>Карта навыков</h2><span>${profile.skill_rows.length} навыков</span></div><div class="sh-matrix-layout"><div class="sh-matrix-section"><div class="sh-matrix" aria-label="Выберите навык">${profile.skill_rows.map((row,i) => `<button class="sh-cell" data-skill="${i}" aria-pressed="${i === 0}" aria-label="${esc(name(row.name))}: ${stateLabels[stateOf(row)]}, сейчас ${row.current ?? 'нет оценки'}, требуется ${row.target ?? 'нет требования'}"><span class="sh-cell-mark ${stateOf(row)}"></span></button>`).join('')}</div><div class="sh-legend">${Object.entries(stateLabels).map(([key,label]) => `<span><i class="sh-cell-mark ${key}"></i>${label}</span>`).join('')}</div><div class="sh-selected-skill" aria-live="polite">${selected(profile.skill_rows[0])}</div></div><div><div class="sh-level-key"><span><i></i>Сейчас</span><span><i></i>Нужно для ${esc(profile.target_grade)}</span></div><div class="sh-level-list">${levels(gaps.slice(0,5))}</div></div></div><div class="sh-panel-footer"><a class="sh-text-action" href="${link('skills')}">Все навыки ${icon('chevron-right')}</a><span class="sh-text-action sh-faint">5 главных дефицитов</span></div></section>`;
  }
  function recPanel(index = 0) {
    const item = data.recommendations.items[index];
    const reason = item.evidence.find(row => row.kind === 'SKILL_GAP');
    return `<section class="sh-panel sh-recommendation"><div class="sh-panel-head"><h2>Рекомендуемый шаг</h2><span>${index+1} из ${data.recommendations.items.length}</span></div><div class="sh-rec-meta"><span class="sh-tag">${types[item.type]}</span><span class="sh-rec-source" title="AI недоступен. Подбор выполнен по правилам."><span class="sh-source-label">По правилам<small>AI недоступен</small></span>${icon('circle-help')}</span></div><h3>${esc(name(item.title))}</h3>${effect(item)}<div class="sh-rec-changes">${item.preview.changes.slice(0,3).map(change => `<div class="sh-rec-change"><span>${esc(skillName(change.skill_id))}</span><span class="sh-number">${change.before}${icon('arrow-right')}${change.after}</span></div>`).join('')}</div><p class="sh-rec-reason">${esc(reason?.text)}</p>${button(`Примерить шаг ${icon('arrow-up-right')}`,`preview:${index}`,true)}<div class="sh-rec-secondary"><button class="sh-text-action" data-action="complete:${index}">Отметить выполненным</button><button class="sh-text-action" data-action="another:${index}">Другой шаг</button></div><details class="sh-evidence"><summary>Почему этот шаг ${icon('chevron-down')}</summary><p class="sh-faint">AI недоступен. Подбор выполнен по правилам.</p>${item.evidence.map(row => `<p>${esc(row.text)}</p><details><summary>Основания ${icon('chevron-down')}</summary><div class="sh-refs">${row.refs.map(esc).join('<br>')}</div></details>`).join('')}</details></section>`;
  }
  function historyPanel() {
    return `<section class="sh-panel"><div class="sh-panel-head"><h2>Последняя активность</h2><span>${profile.history.length} записей</span></div><div class="sh-history-empty">${icon('history')}<p>Пока нет записей</p><p>Выполненный шаг появится здесь и обновит ваш профиль.</p></div><a class="sh-text-action" href="${link('history')}">Открыть историю ${icon('chevron-right')}</a></section>`;
  }
  function profilePage() {
    const identity = `<div class="sh-identity"><div class="sh-identity-primary"><span class="sh-avatar">${icon('user-round')}</span><div><h1>${esc(name(profile.role_name))}</h1><p class="sh-identity-sub"><span class="sh-number">${esc(profile.employee.employee_id)}</span><span>·</span><span>${profile.employee.tenure_months} мес. в компании</span></p></div></div><div class="sh-grade-path"><span class="sh-muted">${esc(profile.employee.grade)}</span>${icon('arrow-right')}<span>${esc(profile.target_grade)}</span></div></div>`;
    if (section === 'skills') return `${identity}${skillPanel()}<section class="sh-panel sh-all-skills"><div class="sh-panel-head"><h2>Все навыки</h2></div><label class="sh-search">${icon('search')}<input class="sh-input" type="search" placeholder="Найти навык" aria-label="Найти навык" id="skill-search"></label><div class="sh-level-list" id="all-skills">${levels(profile.skill_rows)}</div></section>`;
    if (section === 'history') return `${identity}${historyPanel()}`;
    return `${identity}<div class="sh-stats sh-profile-stats">${stat('Покрытие',pct(profile.coverage),'Требований следующего грейда',profile.coverage)}${stat('Дефициты',gaps.length,'Навыков ниже целевого уровня')}${stat('Выполнений',profile.history.filter(row => row.status === 'completed').length,'Записей о выполненных активностях')}</div><div class="sh-main-grid">${recPanel()}${skillPanel()}</div><div class="sh-lower-grid">${data.recommendations.items.slice(1).map((item,i) => `<section class="sh-panel sh-alternative"><div class="sh-rec-meta"><span class="sh-muted">Альтернатива ${i+1}</span><span class="sh-tag">${types[item.type]}</span></div><h3>${esc(name(item.title))}</h3>${effect(item)}<p class="sh-muted">${item.preview.changes.map(change => esc(skillName(change.skill_id))).join(' · ')}</p><button class="sh-text-action" data-action="preview:${i+1}">Примерить ${icon('chevron-right')}</button></section>`).join('')}${historyPanel()}</div>`;
  }
  function hrPage() {
    if (section === 'import') return `<div class="sh-identity"><h1>Импорт данных</h1></div><section class="sh-panel"><p class="sh-muted">1. Файлы ${icon('chevron-right')} 2. Проверка ${icon('chevron-right')} 3. Применение</p><div class="sh-import-files"><h2>Выберите набор данных</h2><p class="sh-review-hint">В этом макете показана компоновка. Загрузка данных подключается на этапе реализации.</p>${[['Профили · employees.json','.json'],['История · activity_history.csv','.csv']].map(([label,accept]) => `<label>${label}<input type="file" accept="${accept}"></label>`).join('')}</div></section>`;
    const max = gapRows[0].affected_count;
    return `<div class="sh-hr-heading"><div class="sh-identity"><div><h1>Развитие команды</h1><p class="sh-identity-sub">Обзор навыков и участия в активностях</p></div></div><div class="sh-hr-toolbar"><form class="sh-search sh-hr-search" id="employee-search">${icon('search')}<input class="sh-input" type="search" placeholder="Найти сотрудника по ID" aria-label="Найти сотрудника по ID"></form><a class="sh-text-action" href="${link('import')}">${icon('upload')} Импорт данных</a></div></div><div id="employee-result" aria-live="polite"></div><div class="sh-stats sh-hr-stats">${stat('Сотрудников',overview.employees_total,'В текущем наборе данных')}${stat('Без активностей',counts.no_catalog_coverage,'Нет подходящего шага в каталоге')}${stat('Без оценок',counts.incomplete_skills,'Недостаточно данных о навыках')}</div><div class="sh-hr-charts"><section class="sh-panel"><div class="sh-panel-head"><h2>Главные дефициты</h2><span>Топ-5</span></div><p class="sh-chart-sub">Сотрудники с дефицитом / оценённые · доля</p><div class="sh-gap-chart">${gapRows.slice(0,5).map(row => `<div class="sh-chart-row"><span>${esc(name(row.name))}</span><div class="sh-chart-bar" aria-hidden="true"><span style="width:${row.affected_count/max*100}%"></span></div><span class="sh-chart-count"><strong>${row.affected_count}/${row.assessed_count}</strong>${pct(row.affected_share*100)}</span></div>`).join('')}</div></section><section class="sh-panel"><div class="sh-panel-head"><h2>Без следующего шага</h2><span>${overview.no_step.length} сотрудника</span></div><div class="sh-reason-list">${Object.entries(reasons).map(([key,label]) => `<div class="sh-reason-row"><span class="sh-reason-label"><i class="sh-reason-mark ${['no_catalog_coverage','incomplete_skills'].includes(key) && counts[key] > 0 ? 'attention' : ''}"></i>${label}</span><span class="sh-number">${counts[key]}</span></div>`).join('')}</div><p class="sh-neutral-note">Финальный грейд и достигнутая цель — штатные состояния, дополнительный шаг не требуется.</p></section></div><section class="sh-panel sh-table-panel"><div class="sh-tabs" role="tablist" aria-label="Данные команды">${[['gaps','Дефициты'],['no-step','Без шага'],['participation','Участие']].map(([key,label]) => `<button class="sh-tab" role="tab" data-tab="${key}" aria-selected="false">${label}</button>`).join('')}</div><div class="sh-table-tools"><label class="sh-search">${icon('search')}<input class="sh-input" type="search" id="table-search" aria-label="Поиск в таблице" placeholder="Поиск в таблице"></label><span class="sh-table-count" id="table-count"></span></div><div id="table-data"></div></section>`;
  }
  document.getElementById('app').innerHTML = `<div class="sh-shell"><aside class="sh-sidebar"><a class="sh-brand" href="${link('overview')}"><span class="sh-logo">ш</span><span>Шагра</span></a><nav class="sh-nav" aria-label="Основное меню">${navLinks()}</nav><div class="sh-sidebar-bottom"><div class="sh-person"><span class="sh-avatar">${icon('user-round')}</span><div class="sh-person-text"><span>${view === 'hr' ? 'HR-команда' : esc(profile.employee.employee_id)}</span><small class="sh-faint">${view === 'hr' ? 'Рабочее пространство' : 'Личный кабинет'}</small></div></div><button class="sh-exit" data-action="account">${icon('log-out')}<span>Аккаунт и выход</span></button></div></aside><div class="sh-workspace"><header class="sh-topbar"><span class="sh-mobile-brand"><span class="sh-logo">ш</span>Шагра</span><span class="sh-desktop-title">${nav.find(row => row[0] === section)?.[1] || 'Обзор'}</span><span class="sh-top-context">${view === 'hr' ? 'HR-пространство' : 'Карьерное развитие'}<span>·</span>Набор ${profile.dataset_version}</span><button class="sh-icon-button sh-mobile-account" aria-label="Меню аккаунта" data-action="account">${icon('user-round')}</button></header><main class="sh-main">${view === 'hr' ? hrPage() : profilePage()}</main></div><nav class="sh-bottomnav" aria-label="Разделы">${navLinks()}</nav></div>`;

  let closeDialog;
  function dialog(title,content) {
    const previous = document.activeElement;
    const layer = document.createElement('div');
    layer.className = 'sh-dialog-layer';
    layer.innerHTML = `<section class="sh-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="sh-dialog-head"><h2 id="dialog-title">${title}</h2><button class="sh-icon-button" data-close aria-label="Закрыть">${icon('x')}</button></div>${content}</section>`;
    document.body.append(layer);
    document.body.style.overflow = 'hidden';
    closeDialog = () => {layer.remove(); document.body.style.overflow = ''; previous?.focus();};
    layer.querySelector('[data-close]').onclick = closeDialog;
    layer.onclick = event => {if (event.target === layer) closeDialog();};
    layer.onkeydown = event => {
      if (event.key === 'Escape') closeDialog();
      if (event.key !== 'Tab') return;
      const focusable = [...layer.querySelectorAll('button, a[href], input, select, summary')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
    };
    layer.querySelector('[data-close]').focus();
  }
  document.addEventListener('click', event => {
    const cell = event.target.closest('[data-skill]');
    if (cell) {
      document.querySelectorAll('[data-skill]').forEach(node => node.setAttribute('aria-pressed', String(node === cell)));
      document.querySelector('.sh-selected-skill').innerHTML = selected(profile.skill_rows[Number(cell.dataset.skill)]);
    }
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const [action,rawIndex] = actionNode.dataset.action.split(':');
    const index = Number(rawIndex || 0), item = data.recommendations.items[index];
    if (action === 'account') dialog('Аккаунт',`<p>${view === 'hr' ? 'HR-команда' : esc(profile.employee.employee_id)}</p><p class="sh-review-hint">Вы просматриваете макет на синтетических данных. Сессия приложения не изменяется.</p><div class="sh-dialog-actions"><a class="sh-button" href="?view=${view === 'hr' ? 'profile' : 'hr'}">Открыть макет ${view === 'hr' ? 'профиля' : 'HR'}</a></div>`);
    if (action === 'complete') dialog('Отметить выполненным',`<h3>${esc(name(item.title))}</h3><p class="sh-rec-reason">После выполнения уровень навыков и история обновятся.</p><p class="sh-review-hint">Это макет: запись выполнения здесь не отправляется. Подтверждение операции подключается при реализации.</p>`);
    if (action === 'another') document.querySelector('.sh-recommendation').outerHTML = recPanel((index+1)%data.recommendations.items.length);
    if (action === 'preview') {
      const alt = data.recommendations.items.find(row => row.event_id !== item.event_id);
      const union = [...new Set([...item.preview.changes,...alt.preview.changes].map(row => row.skill_id))];
      dialog('Примерка шага',`<p class="sh-dialog-base">Общая исходная точка · ${esc(profile.employee.employee_id)} · покрытие ${pct(profile.coverage)}</p><table class="sh-compare-summary"><thead><tr><th></th><th>A · Основной шаг</th><th>B · Альтернатива</th></tr></thead><tbody><tr><th>Активность</th><td>${esc(name(item.title))}</td><td>${esc(name(alt.title))}</td></tr><tr><th>Покрытие</th><td class="sh-number">${pct(item.preview.coverage_after)}</td><td class="sh-number">${pct(alt.preview.coverage_after)}</td></tr>${union.map(id => {const skill = profile.skill_rows.find(row => row.skill_id === id);return `<tr><th>${esc(skillName(id))}<br><small class="sh-muted">Сейчас ${skill.current} · цель ${skill.target}</small></th><td>${item.preview.changes.find(row => row.skill_id === id)?.after ?? skill.current}</td><td>${alt.preview.changes.find(row => row.skill_id === id)?.after ?? skill.current}</td></tr>`;}).join('')}</tbody></table><p class="sh-review-hint">Макет сравнения. Сохранение результата подключается на этапе реализации.</p><div class="sh-dialog-actions"><button class="sh-button sh-button-primary" data-review-complete>Отметить вариант A выполненным</button></div>`);
      document.querySelector('[data-review-complete]').onclick = () => {closeDialog(); dialog('Вариант A',`<p>${esc(name(item.title))}</p><p class="sh-review-hint">В макете данные не изменяются.</p>`);};
    }
  });
  document.getElementById('skill-search')?.addEventListener('input', event => {
    const rows = profile.skill_rows.filter(row => name(row.name).toLocaleLowerCase('ru').includes(event.target.value.toLocaleLowerCase('ru')));
    document.getElementById('all-skills').innerHTML = rows.length ? levels(rows) : '<p class="sh-muted">Навыки не найдены</p>';
  });
  document.getElementById('employee-search')?.addEventListener('submit', event => {
    event.preventDefault();
    const value = event.target.querySelector('input').value.trim().toUpperCase();
    document.getElementById('employee-result').innerHTML = value === 'E0001' ? '<a class="sh-text-action" href="?view=profile">E0001 · Backend-разработчик — открыть профиль</a>' : '<p class="sh-search-note">В макете доступен профиль E0001. Полный поиск подключается при реализации.</p>';
  });
  if (view !== 'hr' || section !== 'overview') return;
  let tab = ['gaps','no-step','participation'].includes(params.get('tab')) ? params.get('tab') : 'gaps';
  let size = [10,25,50].includes(Number(params.get('size'))) ? Number(params.get('size')) : 10;
  let page = Math.max(1,Number(params.get('page')) || 1);
  let query = params.get('q') || '';
  let ascending = params.get('sort') === 'asc';
  const search = document.getElementById('table-search');
  search.value = query;
  function renderTable() {
    const columns = tab === 'gaps' ? ['Навык','С дефицитом','Оценено','Доля','Средний дефицит'] : tab === 'no-step' ? ['Сотрудник','Роль','Причина'] : ['Активность','Выполнений','Пропусков','Отказов','Участников'];
    let rows = tab === 'gaps' ? gapRows.map(row => [name(row.name),row.affected_count,row.assessed_count,pct(row.affected_share*100),num(row.mean_gap)]) : tab === 'no-step' ? overview.no_step.map(row => [row.employee_id,name(data.role_names[row.role_id]),reasons[row.reason]]) : overview.participation.map(row => [name(row.title),row.completed,row.skipped,row.declined,row.unique_participants]);
    rows = rows.filter(row => row.join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
    if (ascending) rows.sort((a,b) => String(a[0]).localeCompare(String(b[0]),'ru'));
    const maxPage = Math.max(1,Math.ceil(rows.length/size));
    page = Math.min(page,maxPage);
    const visible = rows.slice((page-1)*size,page*size);
    const url = new URL(location.href);
    for (const [key,value] of Object.entries({tab,size,page,q:query,sort:ascending?'asc':'default'})) url.searchParams.set(key,String(value));
    history.replaceState(null,'',url);
    document.querySelectorAll('[data-tab]').forEach(node => node.setAttribute('aria-selected',String(node.dataset.tab === tab)));
    document.getElementById('table-count').textContent = `${rows.length} строк`;
    document.getElementById('table-data').innerHTML = `<div class="sh-table-scroll"><table class="sh-table"><thead><tr>${columns.map((label,i) => `<th scope="col">${i === 0 ? `<button data-sort>${esc(label)} ${icon('arrow-up-down')}</button>` : esc(label)}</th>`).join('')}</tr></thead><tbody>${visible.map(row => `<tr>${row.map(value => `<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="sh-mobile-rows">${visible.map(row => `<details><summary><span>${esc(row[0])}</span><span>${esc(row[1])} ${icon('chevron-down')}</span></summary><p>${row.slice(1).map((value,i) => `${esc(columns[i+1])}: ${esc(value)}`).join('<br>')}</p></details>`).join('')}</div>${rows.length ? '' : '<p class="sh-empty-table">Ничего не найдено. Измените поисковый запрос.</p>'}<div class="sh-pagination"><label>Строк <select class="sh-select" aria-label="Строк на странице">${[10,25,50].map(value => `<option ${value === size ? 'selected' : ''}>${value}</option>`).join('')}</select></label><span class="sh-pagination-info">${rows.length ? (page-1)*size+1 : 0}–${Math.min(page*size,rows.length)} из ${rows.length}</span><button class="sh-icon-button" data-page="-1" aria-label="Предыдущая страница" ${page === 1 ? 'disabled' : ''}>${icon('chevron-left')}</button><button class="sh-icon-button" data-page="1" aria-label="Следующая страница" ${page === maxPage ? 'disabled' : ''}>${icon('chevron-right')}</button></div>`;
    document.querySelector('[data-sort]').onclick = () => {ascending = !ascending; renderTable();};
    document.querySelector('.sh-pagination select').onchange = event => {size = Number(event.target.value); page=1; renderTable();};
    document.querySelectorAll('[data-page]').forEach(node => node.onclick = () => {page += Number(node.dataset.page); renderTable();});
  }
  document.querySelectorAll('[data-tab]').forEach(node => node.onclick = () => {tab=node.dataset.tab;page=1;renderTable();});
  search.oninput = event => {query=event.target.value;page=1;renderTable();};
  renderTable();
})();
