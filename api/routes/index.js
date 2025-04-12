const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Example GET
router.get('/', async (req, res) => {
  res.json({ message: 'API is up and running!' });
});

// Example POST
router.post('/add', async (req, res) => {
  const { name } = req.body;
  const { data, error } = await supabase.from('your_table').insert({ name });
  if (error) return res.status(500).json({ error });
  res.status(201).json(data);
});

module.exports = router;
