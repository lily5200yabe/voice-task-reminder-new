(() => {
  const STORAGE_KEY = 'voice-task-reminder.tasks.v1';
  const form = document.querySelector('#task-form');
  const input = document.querySelector('#task-input');
  const voiceButton = document.querySelector('#voice-button');
  const speechNotice = document.querySelector('#speech-notice');
  const groupsRoot = document.querySelector('#task-groups');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let tasks = loadTasks();

  function loadTasks() {
    try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }

  function numberFromChinese(s) {
    const digits = {零:0,〇:0,一:1,兩:2,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
    if (/^\d+$/.test(s)) return Number(s);
    if (s === '半') return 0.5;
    if (s.includes('十')) { const [a,b] = s.split('十'); return (a ? (digits[a] ?? Number(a)) : 1) * 10 + (b ? (digits[b] ?? Number(b)) : 0); }
    return digits[s] ?? Number(s);
  }
  function normalize(text) {
    let value = text.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    value = value.replace(/一個半(?:小時|鐘頭)/g, '1.5小時');
    value = value.replace(/([零〇一兩二三四五六七八九十]+)個小時/g, '$1小時');
    value = value.replace(/([零〇一兩二三四五六七八九十]+)鐘頭/g, '$1小時');
    value = value.replace(/([零〇一兩二三四五六七八九十]+)分鐘/g, '$1分鐘');
    value = value.replace(/([零〇一兩二三四五六七八九十]+)分(?!鐘)/g, '$1分鐘');
    value = value.replace(/([零〇一兩二三四五六七八九十]+)(?=小時|點|分鐘|時)/g, (_, n) => String(numberFromChinese(n)));
    value = value.replace(/點鐘|点钟|点|時/g, '點');
    value = value.replace(/[\s，。！？、；：,.!?;:'"「」『』（）()【】\[\]—-]/g, '');
    return value;
  }
  const localDate = (base, hour, minute = 0) => { const d = new Date(base); d.setHours(hour, minute, 0, 0); return d; };
  function resolveHour(hour, period) {
    if (period === '下午' || period === '晚上' || period === '傍晚' || period === '明晚' || period === '今晚') return hour < 12 ? hour + 12 : hour;
    if (period === '中午') return hour < 11 ? hour + 12 : hour;
    if ((period === '早上' || period === '早晨' || period === '上午') && hour === 12) return 0;
    return hour;
  }
  function parseReminder(source) {
    const text = normalize(source);
    const now = new Date();
    const relative = text.match(/(\d+(?:\.5)?)小時後/);
    if (relative) return { date: new Date(now.getTime() + Number(relative[1]) * 3600000), kind: 'relative' };
    const minutes = text.match(/(\d+)分鐘後/);
    if (minutes) return { date: new Date(now.getTime() + Number(minutes[1]) * 60000), kind: 'relative' };
    if (/半小時後/.test(text)) return { date: new Date(now.getTime() + 1800000), kind: 'relative' };
    if (/等一下|待會|待会/.test(text)) return { date: new Date(now.getTime() + 600000), kind: 'relative' };
    if (/晚一點|晚一点/.test(text)) return { date: new Date(now.getTime() + 3600000), kind: 'relative' };

    let base = new Date(now); let hasDay = false; let period = '';
    if (/下週|下周/.test(text)) {
      const day = text.match(/下週([一二三四五六日天])/);
      if (day) { const offset = {一:1,二:2,三:3,四:4,五:5,六:6,日:0,天:0}[day[1]]; const delta = ((offset - now.getDay() + 7) % 7) || 7; base.setDate(now.getDate() + delta + 7); hasDay = true; }
    } else if (/這禮拜|這星期|本週|本周/.test(text)) {
      const day = text.match(/(?:這禮拜|這星期|本週|本周)([一二三四五六日天])/);
      if (day) { const offset = {一:1,二:2,三:3,四:4,五:5,六:6,日:0,天:0}[day[1]]; const delta = (offset - now.getDay() + 7) % 7; base.setDate(now.getDate() + delta); hasDay = true; }
    } else if (/明天|明早|明晚/.test(text)) { base.setDate(now.getDate() + 1); hasDay = true; }
    else if (/今天|今早|今晚/.test(text)) hasDay = true;
    if (/早上|早晨|上午|明早|今早/.test(text)) period = '早上';
    if (/下午/.test(text)) period = '下午';
    if (/晚上|明晚|今晚/.test(text)) period = '晚上';
    if (/中午/.test(text)) period = '中午';

    const time = text.match(/(早上|早晨|上午|下午|晚上|傍晚|中午|明早|今早|明晚|今晚)?(\d{1,2})點(?:(\d{1,2})分鐘?|半)?/);
    if (time) {
      let hour = Number(time[2]); const minute = time[3] ? Number(time[3]) : time[0].endsWith('半') ? 30 : 0;
      const foundPeriod = time[1] || period;
      hour = resolveHour(hour, foundPeriod);
      if (!hasDay && !foundPeriod) { const candidate = localDate(base, hour, minute); if (candidate <= now) candidate.setDate(candidate.getDate() + 1); base = candidate; }
      else base = localDate(base, hour, minute);
      return { date: base, kind: 'specific' };
    }
    if (/明早/.test(text)) return { date: localDate(base, 8), kind: 'default' };
    if (/明晚/.test(text)) return { date: localDate(base, 19), kind: 'default' };
    return null;
  }
  function taskName(source) {
    let value = normalize(source);
    value = value.replace(/提醒我/g, '');
    value = value.replace(/(?:今天|明天|明早|明晚|今早|今晚|下週[一二三四五六日天]|下周[一二三四五六日天]|這禮拜[一二三四五六日天]|這星期[一二三四五六日天]|本週[一二三四五六日天]|本周[一二三四五六日天])/g, '');
    value = value.replace(/(?:早上|早晨|上午|下午|晚上|傍晚|中午)?\d{1,2}點(?:\d{1,2}分鐘?|半)?/g, '');
    value = value.replace(/\d+(?:\.5)?小時後|\d+分鐘後|半小時後|等一下|待會|待会|晚一點|晚一点|睡前/g, '');
    return value.replace(/^(?:請|麻煩我?|幫我?)/, '').replace(/^[提醒去幫替]*/, '').trim() || source.trim();
  }
  function formatDate(date) {
    if (!date) return '未設定';
    return new Intl.DateTimeFormat('zh-TW', { month:'numeric', day:'numeric', weekday:'short', hour:'numeric', minute:'2-digit', hour12:true }).format(date);
  }
  function groupFor(task, now) {
    if (task.completed) return 'completed';
    if (!task.reminderAt) return 'pending';
    const date = new Date(task.reminderAt);
    if (date < now) return 'overdue';
    if (date.toDateString() === now.toDateString()) return 'today';
    return 'pending';
  }
  const definitions = [ ['overdue','已到期'], ['today','今日任務'], ['pending','待辦任務'], ['completed','已完成'] ];
  function render() {
    groupsRoot.replaceChildren();
    const now = new Date();
    for (const [key, title] of definitions) {
      const items = tasks.filter(task => groupFor(task, now) === key).sort((a,b) => (a.reminderAt || '9999').localeCompare(b.reminderAt || '9999'));
      const section = document.createElement('section'); section.className = `group ${key}`;
      const heading = document.createElement('h2'); heading.className = 'group-heading'; heading.textContent = title;
      const count = document.createElement('span'); count.className = 'group-count'; count.textContent = items.length; heading.append(count);
      section.append(heading);
      const list = document.createElement('div'); list.className = 'task-list';
      if (!items.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = key === 'today' ? '今天還沒有安排任務' : '目前沒有任務'; list.append(empty); }
      for (const task of items) list.append(makeTaskCard(task));
      section.append(list); groupsRoot.append(section);
    }
  }
  function makeTaskCard(task) {
    const card = document.createElement('article'); card.className = `task-card${task.completed ? ' completed' : ''}`;
    const top = document.createElement('div'); top.className = 'task-top';
    const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'task-check'; check.checked = task.completed; check.setAttribute('aria-label', task.completed ? '標記為未完成' : '標記為完成');
    check.addEventListener('change', () => { task.completed = check.checked; saveTasks(); render(); });
    const content = document.createElement('div'); content.className = 'task-content';
    const name = document.createElement('div'); name.className = 'task-name'; name.textContent = task.name;
    const meta = document.createElement('div'); meta.className = 'task-meta';
    const reminder = document.createElement('span'); reminder.innerHTML = '<strong>提醒時間</strong>　'; reminder.append(document.createTextNode(task.reminderAt ? formatDate(new Date(task.reminderAt)) : '未設定'));
    const original = document.createElement('span'); original.innerHTML = '<strong>原始輸入</strong>　'; original.append(document.createTextNode(task.original));
    meta.append(reminder, original); content.append(name, meta); top.append(check, content); card.append(top);
    const actions = document.createElement('div'); actions.className = 'task-actions';
    if (task.reminderAt) {
      const google = document.createElement('button'); google.className = 'action-button calendar'; google.textContent = '加入 Google Calendar'; google.addEventListener('click', () => openGoogleCalendar(task));
      const apple = document.createElement('button'); apple.className = 'action-button calendar'; apple.textContent = '加入 Apple 行事曆'; apple.addEventListener('click', () => downloadICS(task)); actions.append(google, apple);
    }
    const del = document.createElement('button'); del.className = 'action-button delete'; del.textContent = '刪除'; del.addEventListener('click', () => { tasks = tasks.filter(item => item.id !== task.id); saveTasks(); render(); }); actions.append(del); card.append(actions); return card;
  }
  function escapeCalendar(value) { return value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
  function openGoogleCalendar(task) {
    const start = new Date(task.reminderAt); const end = new Date(start.getTime() + 30 * 60000);
    const stamp = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const params = new URLSearchParams({ action:'TEMPLATE', text:task.name, dates:`${stamp(start)}/${stamp(end)}`, details:`原始輸入：${task.original}` });
    window.open(`https://calendar.google.com/calendar/render?${params}`, '_blank', 'noopener,noreferrer');
  }
  function downloadICS(task) {
    const start = new Date(task.reminderAt); const end = new Date(start.getTime() + 30 * 60000);
    const stamp = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'');
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Voice Task Reminder//ZH-TW','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${task.id}@voice-task-reminder`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}Z`,`DTEND:${stamp(end)}Z`,`SUMMARY:${escapeCalendar(task.name)}`,`DESCRIPTION:${escapeCalendar(`原始輸入：${task.original}`)}`,'END:VEVENT','END:VCALENDAR'];
    const blob = new Blob([lines.join('\r\n')], {type:'text/calendar;charset=utf-8'}); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'voice-task-reminder.ics'; link.click(); URL.revokeObjectURL(url);
  }
  form.addEventListener('submit', event => {
    event.preventDefault(); const original = input.value.trim(); if (!original) return;
    const parsed = parseReminder(original);
    tasks.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, name:taskName(original), original, reminderAt:parsed ? parsed.date.toISOString() : null, completed:false });
    saveTasks(); render(); input.value = ''; input.focus();
  });
  if (!SpeechRecognition) {
    speechNotice.textContent = '此瀏覽器不支援語音輸入，請改用打字';
    speechNotice.hidden = false;
    voiceButton.addEventListener('click', () => { speechNotice.textContent = '此瀏覽器不支援語音輸入，請改用打字'; speechNotice.hidden = false; });
  } else {
    recognition = new SpeechRecognition(); recognition.lang = 'zh-TW'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => { listening = true; voiceButton.classList.add('listening'); voiceButton.querySelector('span').textContent = '聆聽中...'; speechNotice.hidden = true; };
    recognition.onresult = event => { input.value = event.results[0][0].transcript; input.focus(); };
    recognition.onerror = () => { speechNotice.textContent = '語音辨識未完成，請再試一次或改用打字'; speechNotice.hidden = false; };
    recognition.onend = () => { listening = false; voiceButton.classList.remove('listening'); voiceButton.querySelector('span').textContent = '語音輸入'; };
    voiceButton.addEventListener('click', () => { if (listening) recognition.stop(); else { try { recognition.start(); } catch {} } });
  }
  render();
})();
