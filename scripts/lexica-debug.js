const https = require('https');

function lexicaSearch(query) {
  const postData = `text=${encodeURIComponent(query)}`;
  
  const options = {
    hostname: 'lexica.art',
    path: '/api/infinite-prompts',
    method: 'POST',
    headers: {
      'Origin': 'https://lexica.art',
      'Referer': `https://lexica.art/?q=${encodeURIComponent(query)}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// Get the search query from command line argument
const query = process.argv[2] || 'anime girl';

console.log(`Searching Lexica for: ${query}\n`);

lexicaSearch(query)
  .then((result) => {
    console.log('Full API Response:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error('Error:', error.message);
  });
