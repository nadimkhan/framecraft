const https = require('https');
const fs = require('fs');
const path = require('path');

function generateWithHuggingFace(prompt) {
  const apiKey = process.env.HF_TOKEN || '';
  
  // Check if API key is provided
  if (!apiKey) {
    throw new Error('Hugging Face API key (HF_TOKEN) is required. Get one from https://huggingface.co/settings/tokens');
  }
  
  const postData = JSON.stringify({
    inputs: prompt,
    parameters: {
      negative_prompt: "blurry, ugly, bad anatomy, bad skin, text, watermark",
      height: 512,
      width: 512,
      num_inference_steps: 20,
      guidance_scale: 7.5
    }
  });

  // Using the new router endpoint with the correct model path
  const options = {
    hostname: 'router.huggingface.co',
    path: '/hf/stable-diffusion/stable-diffusion-2-1',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        const contentType = res.headers['content-type'];
        
        if (contentType && contentType.includes('application/json')) {
          const data = Buffer.concat(chunks).toString();
          reject(new Error('API returned JSON: ' + data.substring(0, 500)));
        } else {
          const data = Buffer.concat(chunks);
          resolve(data);
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
const prompt = process.argv[2] || 'anime girl in modern room with soft lighting';
const outputDir = process.argv[3] || 'lexica_output';

console.log(`Generating image with prompt: ${prompt}`);

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

generateWithHuggingFace(prompt)
  .then(async (imageData) => {
    const outputPath = path.join(outputDir, 'test_image.png');
    fs.writeFileSync(outputPath, imageData);
    console.log(`Saved: ${outputPath} (${imageData.length} bytes)`);
  })
  .catch((error) => {
    console.error('Error:', error.message);
  });
