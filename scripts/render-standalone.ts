import { spawn } from 'child_process';
import path from 'path';

interface SceneInput {
  image: string;
  audio: string;
}

interface RenderRequest {
  scenes: SceneInput[];
  music?: string;
}

const RENDER_SCRIPT = path.join(process.cwd(), 'scripts', 'render-scene.ts');

export async function renderVideoStandalone(scenes: SceneInput[], music?: string): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  return new Promise((resolve) => {
    const inputJson = JSON.stringify({ scenes, music });
    
    const child = spawn('npx', ['tsx', RENDER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        RENDER_INPUT: inputJson,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      console.log(data.toString());
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const match = stdout.match(/RENDER_COMPLETE:(\S+)/);
          if (match) {
            resolve({ success: true, videoUrl: match[1] });
          } else {
            resolve({ success: true });
          }
        } catch {
          resolve({ success: true });
        }
      } else {
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
