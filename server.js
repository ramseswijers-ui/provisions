const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

app.use(express.json());

// ---------- storage ----------

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ lists: [], items: [] }, null, 2));
  }
}

// Simple write queue so concurrent requests never interleave writes to the file.
let writeChain = Promise.resolve();

function readDB() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeDB(db) {
  writeChain = writeChain.then(() =>
    fs.promises.writeFile(DATA_FILE, JSON.stringify(db, null, 2))
  );
  return writeChain;
}

function id() {
  return crypto.randomUUID();
}

// ---------- category auto-detection ----------

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

const CATEGORY_KEYWORDS = {
  Produce: ['apple', 'banana', 'lettuce', 'spinach', 'tomato', 'onion', 'garlic', 'potato', 'carrot', 'pepper', 'avocado', 'lemon', 'lime', 'berry', 'berries', 'grape', 'orange', 'cucumber', 'broccoli', 'mushroom', 'herb', 'basil', 'cilantro', 'fruit', 'vegetable', 'salad'],
  'Dairy & Eggs': ['milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg', 'eggs'],
  'Meat & Seafood': ['chicken', 'beef', 'pork', 'bacon', 'sausage', 'turkey', 'fish', 'salmon', 'shrimp', 'steak', 'ham', 'meat'],
  Bakery: ['bread', 'bagel', 'bun', 'roll', 'croissant', 'muffin', 'tortilla', 'cake', 'pastry'],
  Frozen: ['frozen', 'ice cream', 'pizza'],
  Pantry: ['rice', 'pasta', 'flour', 'sugar', 'salt', 'oil', 'cereal', 'beans', 'sauce', 'soup', 'can', 'spice', 'coffee', 'tea', 'snack', 'chips', 'cracker', 'nut', 'jam', 'honey'],
  Beverages: ['water', 'juice', 'soda', 'beer', 'wine', 'drink', 'cola'],
  Household: ['soap', 'detergent', 'paper towel', 'toilet paper', 'napkin', 'cleaner', 'trash bag', 'battery', 'lightbulb', 'foil', 'wrap'],
};

function guessCategory(name) {
  // Pad with spaces so keyword matches only land on whole words, e.g. "oil"
  // must not match inside "toilet paper".
  const n = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const cat of CATEGORY_ORDER) {
    const words = CATEGORY_KEYWORDS[cat];
    if (words && words.some((w) => n.includes(` ${w} `))) return cat;
  }
  return 'Other';
}

// ---------- helpers ----------

function listSummary(db, list) {
  const items = db.items.filter((i) => i.listId === list.id);
  return {
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    itemCount: items.length,
    doneCount: items.filter((i) => i.checked).length,
  };
}

// ---------- routes: lists ----------

app.get('/api/lists', (req, res) => {
  const db = readDB();
  res.json(db.lists.map((l) => listSummary(db, l)));
});

app.post('/api/lists', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const db = readDB();
  const list = { id: id(), name, createdAt: new Date().toISOString() };
  db.lists.push(list);
  writeDB(db);
  res.status(201).json(listSummary(db, list));
});

app.patch('/api/lists/:listId', (req, res) => {
  const db = readDB();
  const list = db.lists.find((l) => l.id === req.params.listId);
  if (!list) return res.status(404).json({ error: 'not found' });
  if (typeof req.body.name === 'string' && req.body.name.trim()) {
    list.name = req.body.name.trim();
  }
  writeDB(db);
  res.json(listSummary(db, list));
});

app.delete('/api/lists/:listId', (req, res) => {
  const db = readDB();
  const exists = db.lists.some((l) => l.id === req.params.listId);
  if (!exists) return res.status(404).json({ error: 'not found' });
  db.lists = db.lists.filter((l) => l.id !== req.params.listId);
  db.items = db.items.filter((i) => i.listId !== req.params.listId);
  writeDB(db);
  res.status(204).end();
});

// ---------- routes: items ----------

app.get('/api/lists/:listId/items', (req, res) => {
  const db = readDB();
  const items = db.items
    .filter((i) => i.listId === req.params.listId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(items);
});

app.post('/api/lists/:listId/items', (req, res) => {
  const db = readDB();
  const list = db.lists.find((l) => l.id === req.params.listId);
  if (!list) return res.status(404).json({ error: 'list not found' });

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const item = {
    id: id(),
    listId: list.id,
    name,
    quantity: req.body.quantity ? String(req.body.quantity).trim() : '',
    category: req.body.category && CATEGORY_ORDER.includes(req.body.category)
      ? req.body.category
      : guessCategory(name),
    checked: false,
    createdAt: new Date().toISOString(),
  };
  db.items.push(item);
  writeDB(db);
  res.status(201).json(item);
});

app.patch('/api/items/:itemId', (req, res) => {
  const db = readDB();
  const item = db.items.find((i) => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'not found' });

  if (typeof req.body.checked === 'boolean') item.checked = req.body.checked;
  if (typeof req.body.name === 'string' && req.body.name.trim()) item.name = req.body.name.trim();
  if (typeof req.body.quantity === 'string') item.quantity = req.body.quantity.trim();
  if (typeof req.body.category === 'string' && CATEGORY_ORDER.includes(req.body.category)) {
    item.category = req.body.category;
  }
  writeDB(db);
  res.json(item);
});

app.delete('/api/items/:itemId', (req, res) => {
  const db = readDB();
  const exists = db.items.some((i) => i.id === req.params.itemId);
  if (!exists) return res.status(404).json({ error: 'not found' });
  db.items = db.items.filter((i) => i.id !== req.params.itemId);
  writeDB(db);
  res.status(204).end();
});

app.delete('/api/lists/:listId/items/checked', (req, res) => {
  const db = readDB();
  db.items = db.items.filter((i) => !(i.listId === req.params.listId && i.checked));
  writeDB(db);
  res.status(204).end();
});

app.get('/api/categories', (req, res) => {
  res.json(CATEGORY_ORDER);
});

// ---------- static frontend ----------

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureDataFile();
app.listen(PORT, () => {
  console.log(`Provisions running on port ${PORT}, data dir: ${DATA_DIR}`);
});
