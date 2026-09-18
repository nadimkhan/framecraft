const https = require('https');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function testImageUrls() {
  const imageId = '93a645a4-2ab9-492b-ac28-4c50becac7db';
  
  const urls = [
    `https://image.lexica.art/${imageId}`,
    `https://images.lexica.art/${imageId}`,
    `https://lexica.art/api/image/${imageId}`,
    `https://lexica-art.s3.amazonaws.com/${imageId}`,
    `https://prod-images-static.s3.amazonaws.com/${imageId}`,
    `https://cdn.lexica.art/${imageId}`,
    `https://cdn.lexica.art/${imageId}.jpg`,
    `https://images.unsplash.com/${imageId}`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`Testing: ${url}`);
      const result = await makeRequest(url);
      console.log(`  Status: ${result.status}, Size: ${result.data.length}`);
      if (result.status === 200 && result.data.length > 1000) {
        console.log(`  SUCCESS! Found working URL: ${url}`);
        break;
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

testImageUrls();
