# Local Image Generation Setup Guide

## Changes Made

### 1. Model Update
- **New default model:** `nousresearch/hermes-4-405b`
- **Reasoning disabled** - Unlike StepFun, this model won't waste tokens on internal thinking
- **Better for creative writing** - 405B parameters, trained for instruction following

### 2. Local Image Generation
Replaced kei.ai with local image generation using one of these options:

## Setup Options

### Option 1: Automatic1111 (Recommended - Easiest)

1. **Install Automatic1111 WebUI:**
   ```bash
   git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
   cd stable-diffusion-webui
   ./webui.sh --api  # Linux/Mac
   webui-user.bat --api  # Windows
   ```

2. **Download an anime/checkpoint model:**
   - Recommended: `anything-v5.ckpt` or `AbyssOrangeMix3.ckpt`
   - Place in `models/Stable-diffusion/`

3. **Configure environment:**
   ```bash
   # Add to your .env file
   LOCAL_IMAGE_API_URL=http://localhost:7860
   LOCAL_IMAGE_API_TYPE=automatic1111
   ```

### Option 2: ComfyUI (More Advanced)

1. **Install ComfyUI:**
   ```bash
   git clone https://github.com/comfyanonymous/ComfyUI.git
   cd ComfyUI
   pip install -r requirements.txt
   python main.py
   ```

2. **Configure environment:**
   ```bash
   LOCAL_IMAGE_API_URL=http://localhost:8188
   LOCAL_IMAGE_API_TYPE=comfyui
   ```

### Option 3: Fooocus (User-Friendly)

1. **Install Fooocus:**
   ```bash
   git clone https://github.com/lllyasviel/Fooocus.git
   cd Fooocus
   python entry_with_update.py
   ```

2. **Enable API mode:**
   Edit config to enable API, then:
   ```bash
   LOCAL_IMAGE_API_URL=http://localhost:7865
   LOCAL_IMAGE_API_TYPE=fooocus
   ```

## Environment Variables

Update your `.env` file:

```env
# OpenRouter Configuration
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=nousresearch/hermes-4-405b

# Local Image Generation
LOCAL_IMAGE_API_URL=http://localhost:7860
LOCAL_IMAGE_API_TYPE=automatic1111  # or 'comfyui' or 'fooocus'

# Optional: Other models to try
# SCRIPT_MODEL_1=google/gemma-3-27b-it:free
# SCRIPT_MODEL_2=openrouter/auto
```

## How It Works Now

1. **Generate Script:**
   - Uses `nousresearch/hermes-4-405b` with reasoning disabled
   - Returns JSON with title, narration, and scenes

2. **Generate Images:**
   - Connects to local SD instance (Automatic1111/ComfyUI/Fooocus)
   - Generates image synchronously (no waiting/polling)
   - Saves directly to `/public/generations/`
   - Supports 9:16 (Shorts), 16:9 (YouTube), and other ratios

## ⚠️ Important: Model Compatibility for Aspect Ratios

The code sends `width` and `height` to generate custom aspect ratios, but **not all SD models handle non-square resolutions well**.

### SDXL Models (Recommended)
**These work great with custom aspect ratios:**
- `sd_xl_base_1.0.safetensors` (or anime variants)
- `anything-v5-Prt.safetensors` 
- `AbyssOrangeMix3.safetensors`
- **Dimensions used:** 1024x1024 base, scaled to 9:16 (576x1024), 16:9 (1024x576)
- **Result:** High quality at any ratio ✓

### SD 1.5 Models (Limited)
**These are trained on 512x512 and produce lower quality at other ratios:**
- `v1-5-pruned-emaonly.safetensors`
- Older anime models
- **Dimensions used:** 512x512 base, scaled to 9:16 (384x640), 16:9 (640x384)
- **Result:** Lower resolution, possible distortion ✗

### If Images Look Bad (Distorted/Low Quality)
1. **Switch to an SDXL model** - They're designed for 1024px+ resolutions
2. **Check your model type** - In A1111, look at the model file size:
   - SD 1.5: ~4GB
   - SDXL: ~6-7GB

## Setup for Best Results

### 1. Download SDXL Anime Model (Recommended)
```
https://civitai.com/models/9409/orangemixs
Download: AOM3A1B_orangemixs.safetensors (6.46 GB)
Place in: stable-diffusion-webui/models/Stable-diffusion/
```

### 2. Or Download Anything V5 (SDXL)
```
https://civitai.com/models/9409?modelVersionId=30142
Download: anythingV5_PrtRE.safetensors
```

### 3. Configure Dimensions (Optional)
If using SD 1.5 models, edit `lib/localImage.ts`:
```typescript
// In createImageAutomatic1111 function, change:
const { width, height } = getDimensionsFromAspectRatio(aspectRatio)
// To:
const { width, height } = getSD15Dimensions(aspectRatio)
```

## Aspect Ratios Generated

| Ratio | Dimensions | Best For | Model Type |
|-------|-----------|----------|------------|
| `9:16` | 576x1024 | YouTube Shorts | SDXL ✓ |
| `16:9` | 1024x576 | YouTube Videos | SDXL ✓ |
| `1:1` | 1024x1024 | Social Posts | SDXL ✓ |
| `9:16` | 384x640 | YouTube Shorts | SD 1.5 (low res) |
| `16:9` | 640x384 | YouTube Videos | SD 1.5 (low res) |

## Test Your Setup

After starting A1111, test with curl:
```bash
# Test API is working
curl http://YOUR_WINDOWS_IP:7860/sdapi/v1/sd-models

# Test image generation (9:16 ratio)
curl -X POST http://YOUR_WINDOWS_IP:7860/sdapi/v1/txt2img \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "anime girl, cherry blossoms, masterpiece",
    "width": 576,
    "height": 1024,
    "steps": 30
  }'
```

If the test generates a 576x1024 image, your setup is correct!

## Troubleshooting

### Image generation fails
1. Check if SD server is running: `curl http://localhost:7860`
2. Verify model file exists in `models/Stable-diffusion/`
3. Check console for specific error messages

### Model returns no content
1. Check OpenRouter API key
2. Verify `OPENROUTER_MODEL` is set correctly
3. The debug logs will show the full API response

### Out of memory
- Reduce image dimensions in `lib/localImage.ts`
- Use a smaller SD model (2GB instead of 7GB)
- Enable CPU offloading in SD settings

## Model Comparison

| Model | Cost | Reasoning | Best For |
|-------|------|-----------|----------|
| `stepfun/step-3.5-flash:free` | Free | Always on (wastes tokens) | Programming |
| `nousresearch/hermes-4-405b` | Paid ($1/M input, $3/M output) | Disabled | Creative writing |
| `google/gemma-3-27b-it:free` | Free | No | Fast, simple tasks |

## Recommended Setup

For best results:
1. Use **Automatic1111** with `anything-v5` anime model
2. Set **Hermes 4 405B** as your script model
3. Keep a backup free model (Gemma 3) for rate limit situations

## Build Check

```bash
npm run build
```

All changes compile successfully ✓
