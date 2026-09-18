const https = require('https');
const fs = require('fs');
const path = require('path');

function lexicaSearch(query) {
  const options = {
    hostname: 'lexica.art',
    path: `/api/v1/search?q=${encodeURIComponent(query)}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
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

    req.end();
  });
}

function downloadImage(imageUrl, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from: ${imageUrl}`);
    
    const req = https.get(imageUrl, (res) => {
      console.log(`Status: ${res.statusCode}`);
      
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        console.log(`Redirecting to: ${redirectUrl}`);
        downloadImage(redirectUrl, outputPath).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(outputPath);
      
      res.pipe(file);
      
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(outputPath);
        console.log(`Saved: ${outputPath} (${stats.size} bytes)`);
        resolve(outputPath);
      });
    });

    req.on('error', (e) => {
      reject(e);
    });
  });
}

// Get the search query from command line argument
const query = process.argv[2] || 'anime girl';
const outputDir = process.argv[3] || 'lexica_output';

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Searching Lexica for: ${query}`);

lexicaSearch(query)
  .then(async (result) => {
    console.log(`\nFound ${result.images?.length || 0} images\n`);
    
    if (!result.images || result.images.length === 0) {
      console.log('No images found');
      return;
    }

    // Get the first image
    const firstImage = result.images[0];
    console.log('First image:');
    console.log('  src:', firstImage.src);
    console.log('  srcSmall:', firstImage.srcSmall);
    console.log('  alt:', firstImage.alt);
    
    // Try to download the image
    const outputPath = path.join(outputDir, 'test_image.jpg');
    
    try {
      await downloadImage(firstImage.srcSmall || firstImage.src, outputPath);
      console.log('\nDone! Image saved to:', outputPath);
    } catch (e) {
      console.log(`\nFailed to download: ${e.message}`);
    }
  })
  .catch((error) => {
    console.error('Error:', error.message);
  });
