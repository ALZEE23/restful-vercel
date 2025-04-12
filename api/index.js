const express = require('express');
const morgan = require('morgan');
const indexRouter = require('./routes/index');

const app = express();
app.use(morgan('dev'));
app.use(express.json());

// CORS: biar frontend bisa akses
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // ubah kalau mau dibatasi
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/', indexRouter);

module.exports = app; // Penting buat Vercel!
