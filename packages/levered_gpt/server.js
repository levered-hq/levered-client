const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3200;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the chat interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chat interface running at http://localhost:${PORT}`);
  console.log(`Make sure the proxy server is running at http://localhost:3100`);
});
