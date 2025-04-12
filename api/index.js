const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware untuk CORS
app.use(cors());

// Route untuk root ('/')
app.get('/', (req, res) => {
  res.send('Hello, this is the root endpoint!');
});

// Route untuk '/api/users'
app.get('/api/users', (req, res) => {
  res.json({ message: 'Hello from Express on Vercel!' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
