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
    const { title, content, publish = false } = req.body; 
    const userId = req.user.userId;
    
    const contentBlocks = typeof content === 'string' ? JSON.parse(content) : content;

    const { data: blog, error: blogError } = await supabase
      .from('blogs')
      .insert([{ 
        title,
        user_id: userId,
        publish: publish === 'true' || publish === true 
      }])
      .select()
      .single();

    if (blogError) throw new Error(blogError.message);

    
    if (req.file) {
      const fileBuffer = req.file.buffer;
      const fileName = `${Date.now()}_${req.file.originalname}`;
      const filePath = `blogs/${userId}/${fileName}`;

      const { error: storageError } = await supabase
        .storage
        .from('blog-images')
        .upload(filePath, fileBuffer, {
          contentType: req.file.mimetype
        });

      if (storageError) throw new Error(storageError.message);

      const { data: { publicUrl } } = supabase
        .storage
        .from('blog-images')
        .getPublicUrl(filePath);

      
      contentBlocks.push({
        type: 'image',
        imageUrl: publicUrl,
        position: contentBlocks.length + 1
      });
    }

    
    const { error: contentError } = await supabase
      .from('blog_contents')
      .insert(
        contentBlocks.map(block => ({
          blog_id: blog.id,
          type: block.type,
          content: block.content,
          image_url: block.imageUrl,
          position: block.position
        }))
      );

    if (contentError) throw new Error(contentError.message);

    res.json({ 
      message: 'Blog post created successfully',
      blog: {
        ...blog,
        content: contentBlocks
      }
    });

  } catch (error) {
    console.error('Error creating blog:', error);
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/blogs/:id', async (req, res) => {
  try {
    const { id } = req.params;


    const { data: blog, error: blogError } = await supabase
      .from('blogs')
      .select(`
        *,
        users (
          id,
          username
        )
      `)
      .eq('id', id)
      .single();

    if (blogError) throw new Error(blogError.message);

    
    const { data: contents, error: contentError } = await supabase
      .from('blog_contents')
      .select('*')
      .eq('blog_id', id)
      .order('position');

    if (contentError) throw new Error(contentError.message);

    res.json({
      ...blog,
      content: contents
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/blogs', async (req, res) => {
  try {
    const { data: blogs, error } = await supabase
      .from('blogs')
      .select(`
        *,
        users (
          id,
          username
        ),
        blog_contents (
          id,
          type,
          content,
          image_url,
          position
        )
      `)
      .eq('publish', true) 
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching blogs:', error);
      return res.status(400).json({ error: error.message });
    }

    
    const formattedBlogs = blogs.map(blog => ({
      id: blog.id,
      title: blog.title,
      created_at: blog.created_at,
      user: blog.users,
      content: blog.blog_contents.sort((a, b) => a.position - b.position)
    }));

    res.json({ blogs: formattedBlogs });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/blogs/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const blogId = req.params.id;
    const userId = req.user.userId;
    const { title, content, publish } = req.body;
    
    
    const contentBlocks = typeof content === 'string' ? JSON.parse(content) : content;

    
    const { data: blog, error: fetchError } = await supabase
      .from('blogs')
      .select('*')
      .eq('id', blogId)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    if (blog.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this blog' });
    }

    
    if (req.file) {
      const fileBuffer = req.file.buffer;
      const fileName = `${Date.now()}_${req.file.originalname}`;
      const filePath = `blogs/${userId}/${fileName}`;

      const { error: storageError } = await supabase
        .storage
        .from('blog-images')
        .upload(filePath, fileBuffer, {
          contentType: req.file.mimetype
        });

      if (storageError) throw new Error(storageError.message);

      const { data: { publicUrl } } = supabase
        .storage
        .from('blog-images')
        .getPublicUrl(filePath);

    
      contentBlocks.push({
        type: 'image',
        imageUrl: publicUrl,
        position: contentBlocks.length + 1
      });
    }

  
    const { data: updatedBlog, error: updateError } = await supabase
      .from('blogs')
      .update({ 
        title,
        publish: publish === 'true' || publish === true 
      })
      .eq('id', blogId)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    
    const { error: deleteError } = await supabase
      .from('blog_contents')
      .delete()
      .eq('blog_id', blogId);

    if (deleteError) throw new Error(deleteError.message);


    const { error: contentError } = await supabase
      .from('blog_contents')
      .insert(
        contentBlocks.map(block => ({
          blog_id: blogId,
          type: block.type,
          content: block.content,
          image_url: block.imageUrl,
          position: block.position
        }))
      );

    if (contentError) throw new Error(contentError.message);

    
    const { data: updatedContents, error: fetchContentError } = await supabase
      .from('blog_contents')
      .select('*')
      .eq('blog_id', blogId)
      .order('position');

    if (fetchContentError) throw new Error(fetchContentError.message);

    res.json({ 
      message: 'Blog updated successfully',
      blog: {
        ...updatedBlog,
        content: updatedContents
      }
    });

  } catch (error) {
    console.error('Error updating blog:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/myblogs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const { data: blogs, error } = await supabase
      .from('blogs')
      .select(`
        *,
        users (
          id,
          username
        ),
        blog_contents (
          id,
          type,
          content,
          image_url,
          position
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    
    const formattedBlogs = blogs.map(blog => ({
      id: blog.id,
      title: blog.title,
      created_at: blog.created_at,
      publish: blog.publish,
      user: blog.users,
      content: blog.blog_contents.sort((a, b) => a.position - b.position)
    }));

    res.json({ blogs: formattedBlogs });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/blogs/:id', authenticateToken, async (req, res) => {
  try {
    const blogId = req.params.id;
    const userId = req.user.userId;

    
    const { data: blog, error: fetchError } = await supabase
      .from('blogs')
      .select('*, blog_contents(*)')
      .eq('id', blogId)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    if (blog.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this blog' });
    }

    
    const imageContents = blog.blog_contents.filter(content => content.type === 'image');
    if (imageContents.length > 0) {
      for (const content of imageContents) {
        if (content.image_url) {
          const imagePath = `blogs/${userId}/${content.image_url.split('/').pop()}`;
          await supabase.storage
            .from('blog-images')
            .remove([imagePath]);
        }
      }
    }

    
    const { error: deleteError } = await supabase
      .from('blogs')
      .delete()
      .eq('id', blogId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    res.json({ 
      message: 'Blog and all associated content deleted successfully',
      blogId
    });

  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bookmarks', authenticateToken, async (req, res) => {
  const { blogId } = req.body;
  const userId = req.user.userId;

  const { error } = await supabase
    .from('bookmarks')
    .insert([{ user_id: userId, blog_id: blogId }]);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Blog bookmarked successfully' });
});

app.get('/api/bookmarks', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('user_id', userId);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ bookmarks: data });
});

app.delete('/api/bookmarks/:id', authenticateToken, async (req, res) => {
  const bookmarkId = req.params.id;
  const userId = req.user.userId;

  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', bookmarkId)
    .eq('user_id', userId);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Bookmark deleted successfully' });
});

app.put('api/user', authenticateToken, async (req, res) => {
  const { email, username } = req.body;
  const userId = req.user.userId;

  const { error } = await supabase
    .from('users')
    .update({ email, username })
    .eq('id', userId);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'User updated successfully' });
});

app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is protected data', user: req.user });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
