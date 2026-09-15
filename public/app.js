const CATEGORY_ORDER = [
  'Produce',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Bakery',
  'Frozen',
  'Pantry',
  'Beverages',
  'Household',
  'Other',
];

const appEl = document.getElementById('app');

const state = {
  view: 'home',       // 'home' | 'list'
  currentListId: null,
  currentListName: '',
  lists: [],
  items: [],
  showCart: false,
  modal: null,        // { type: 'newList' }
};

// ---------- API ----------

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadLists() {
  state.lists = await api('/api/lists');
}

async function loadItems(listId) {
  state.items = await api(`/api/lists/${listId}/items`);
}

// ---------- navigation ----------

async function goHome() {
  state.view = 'home';
  state.currentListId = null;
  await loadLists();
  render();
}

async function openList(list) {
  state.view = 'list';
  state.currentListId = list.id;
  state.currentListName = list.name;
  state.showCart = false;
  await loadItems(list.id);
  render();
}

// ---------- actions ----------

async function createList(name) {
  await api('/api/lists', { method: 'POST', body: JSON.stringify({ name }) });
  await loadLists();
  render();
}

async function deleteList(id, evt) {
  evt.stopPropagation();
  if (!confirm('Delete this list and all its items?')) return;
  await api(`/api/lists/${id}`, { method: 'DELETE' });
  await loadLists();
  render();
}

async function addItem(rawInput) {
  const text = rawInput.trim();
  if (!text) return;
  // Support "2x eggs" or "eggs x2" shorthand for quantity.
  let name = text;
  let quantity = '';
  const leading = text.match(/^(\d+)\s*[xX]\s*(.+)$/);
  const trailing = text.match(/^(.+?)\s*[xX]\s*(\d+)$/);
  if (leading) {
    quantity = leading[1];
    name = leading[2];
  } else if (trailing) {
    name = trailing[1];
    quantity = trailing[2];
  }
  await api(`/api/lists/${state.currentListId}/items`, {
    method: 'POST',
    body: JSON.stringify({ name, quantity }),
  });
  await loadItems(state.currentListId);
  render();
}

async function toggleItem(item) {
  item.checked = !item.checked; // optimistic
  render();
  await api(`/api/items/${item.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ checked: item.checked }),
  });
  await loadLists(); // refresh counts in background for when user returns home
}

async function deleteItem(id) {
  await api(`/api/items/${id}`, { method: 'DELETE' });
  await loadItems(state.currentListId);
  render();
}

async function clearChecked() {
  await api(`/api/lists/${state.currentListId}/items/checked`, { method: 'DELETE' });
  await loadItems(state.currentListId);
  render();
}

// ---------- rendering ----------

function render() {
  appEl.innerHTML = '';
  if (state.view === 'home') {
    appEl.appendChild(renderHomeTopbar());
    appEl.appendChild(renderHomeContent());
  } else {
    appEl.appendChild(renderListTopbar());
    appEl.appendChild(renderListContent());
  }
  if (state.modal) {
    appEl.appendChild(renderModal());
  }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') {
      node.innerHTML = v;
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function renderHomeTopbar() {
  return el('div', { class: 'topbar' }, [
    el('h1', {}, 'Provisions'),
    el('button', {
      class: 'icon-btn',
      'aria-label': 'New list',
      onClick: () => { state.modal = { type: 'newList' }; render(); },
    }, '+'),
  ]);
}

function renderHomeContent() {
  const content = el('div', { class: 'content' });

  if (state.lists.length === 0) {
    content.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji' }, '🧺'),
      el('h2', {}, 'No lists yet'),
      el('p', {}, 'Start one for this week\u2019s groceries.'),
    ]));
  } else {
    for (const list of state.lists) {
      const pct = list.itemCount ? Math.round((list.doneCount / list.itemCount) * 100) : 0;
      content.appendChild(el('div', { class: 'list-card', onClick: () => openList(list) }, [
        el('div', { class: 'list-card-main' }, [
          el('h3', {}, list.name),
          el('div', { class: 'progress-row' }, [
            el('div', { class: 'progress-track' }, [
              el('div', { class: 'progress-fill', style: `width:${pct}%` }),
            ]),
            el('span', { class: 'progress-label' }, `${list.doneCount}/${list.itemCount}`),
          ]),
        ]),
        el('button', {
          class: 'list-card-delete',
          'aria-label': 'Delete list',
          onClick: (e) => deleteList(list.id, e),
        }, '✕'),
      ]));
    }
  }

  content.appendChild(el('div', { class: 'fab-row' }, [
    el('button', {
      class: 'primary-btn',
      onClick: () => { state.modal = { type: 'newList' }; render(); },
    }, '+ New list'),
  ]));

  return content;
}

function renderListTopbar() {
  const items = state.items;
  const done = items.filter((i) => i.checked).length;
  return el('div', { class: 'topbar' }, [
    el('button', { class: 'back-btn', 'aria-label': 'Back', onClick: goHome }, '←'),
    el('div', { style: 'flex:1' }, [
      el('h1', {}, state.currentListName),
      items.length
        ? el('div', { class: 'list-meta' }, `${done} of ${items.length} in cart`)
        : null,
    ]),
  ]);
}

function renderListContent() {
  const content = el('div', { class: 'content' });

  // add bar
  const input = el('input', {
    type: 'text',
    placeholder: 'Add an item… (try "2x eggs")',
    autocomplete: 'off',
  });
  const addBtn = el('button', { 'aria-label': 'Add item' }, '+');
  const submit = async () => {
    const val = input.value;
    if (!val.trim()) return;
    input.value = '';
    await addItem(val);
    input.focus();
  };
  addBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  content.appendChild(el('div', { class: 'add-bar' }, [input, addBtn]));

  const active = state.items.filter((i) => !i.checked);
  const checked = state.items.filter((i) => i.checked);

  if (state.items.length === 0) {
    content.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji' }, '🥕'),
      el('h2', {}, 'List is empty'),
      el('p', {}, 'Add what you need above.'),
    ]));
    return content;
  }

  // group active items by category, in fixed order
  const byCategory = {};
  for (const item of active) {
    (byCategory[item.category] = byCategory[item.category] || []).push(item);
  }
  for (const cat of CATEGORY_ORDER) {
    if (!byCategory[cat]) continue;
    content.appendChild(el('div', { class: 'category-section' }, [
      el('div', { class: 'category-label' }, cat),
      ...byCategory[cat].map(renderItemRow),
    ]));
  }

  if (checked.length) {
    const toggleBtn = el('button', {
      class: `cart-toggle${state.showCart ? ' open' : ''}`,
      onClick: () => { state.showCart = !state.showCart; render(); },
    }, [
      el('span', {}, `In cart (${checked.length})`),
      el('span', { class: 'chevron' }, '▾'),
      el('span', {
        class: 'clear-checked',
        onClick: (e) => { e.stopPropagation(); clearChecked(); },
      }, 'Clear'),
    ]);
    content.appendChild(toggleBtn);
    if (state.showCart) {
      checked.forEach((item) => content.appendChild(renderItemRow(item)));
    }
  }

  return content;
}

function renderItemRow(item) {
  return el('div', { class: `item-row${item.checked ? ' checked' : ''}` }, [
    el('button', {
      class: `checkbox${item.checked ? ' checked' : ''}`,
      'aria-label': item.checked ? 'Mark not done' : 'Mark done',
      onClick: () => toggleItem(item),
    }, item.checked ? '✓' : ''),
    el('span', { class: 'item-name' }, item.name),
    item.quantity ? el('span', { class: 'item-qty' }, `×${item.quantity}`) : null,
    el('button', {
      class: 'item-delete',
      'aria-label': 'Delete item',
      onClick: () => deleteItem(item.id),
    }, '✕'),
  ]);
}

function renderModal() {
  if (state.modal.type === 'newList') {
    const input = el('input', { type: 'text', placeholder: 'e.g. Weekly groceries' });
    const close = () => { state.modal = null; render(); };
    const confirmCreate = async () => {
      const name = input.value.trim();
      if (!name) return;
      close();
      await createList(name);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmCreate(); });
    setTimeout(() => input.focus(), 0);
    return el('div', { class: 'modal-backdrop', onClick: (e) => { if (e.target === e.currentTarget) close(); } }, [
      el('div', { class: 'modal-sheet' }, [
        el('h2', {}, 'New list'),
        input,
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'modal-cancel', onClick: close }, 'Cancel'),
          el('button', { class: 'modal-confirm', onClick: confirmCreate }, 'Create'),
        ]),
      ]),
    ]);
  }
  return el('div');
}

// ---------- boot ----------

(async function init() {
  await loadLists();
  render();
})();
