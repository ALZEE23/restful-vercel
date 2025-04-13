const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/SupabaseClient');
const multer = require('multer');
const upload = multer();

const app = express();
const port = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; 

app.use(express.json());
app.use(cors());


const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

app.get('/', (req, res) => {
  res.send('Hello, this is the root endpoint!');
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) return res.status(401).json({ error: error.message });

  const token = jwt.sign(
    { 
      userId: data.user.id,
      email: data.user.email 
    }, 
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ 
    token,
    user: {
      id: data.user.id,
      email: data.user.email
    }
  });
});

app.post('/api/register', async (req, res) => {
  const { email, password, username } = req.body;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password
  });

  if (authError) return res.status(400).json({ error: authError.message });

  const userId = authData.user.id;

  const { error: insertError } = await supabase
    .from('users')
    .insert([{ id: userId, username }]);

  if (insertError) return res.status(400).json({ error: insertError.message });

  res.json({ userId, email, username });
});

app.post('/api/blogs', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const userId = req.user.userId;
    
    
    if (!req.file) {
      return res.status(400).json({ error: 'Image is required' });
    }

    
    const fileBuffer = req.file.buffer;
    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = `blogs/${userId}/${fileName}`;

    
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('blog-images') 
      .upload(filePath, fileBuffer, {
        contentType: req.file.mimetype
      });

    if (storageError) {
      throw new Error(storageError.message);
    }

    
    const { data: { publicUrl } } = supabase
      .storage
      .from('blog-images')
      .getPublicUrl(filePath);

    
    const { error: dbError } = await supabase
      .from('blogs')
      .insert([{ 
        image: publicUrl,
        title, 
        description, 
        user_id: userId 
      }]);

    if (dbError) throw new Error(dbError.message);

    res.json({ 
      message: 'Blog post created successfully',
      imageUrl: publicUrl
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/blogs', async (req, res) => {
  const { data, error } = await supabase
    .from('blogs')
    .select('*');

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
});

app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is protected data', user: req.user });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
