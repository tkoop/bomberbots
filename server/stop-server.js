import { exec } from 'child_process';
import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const PORT = 3001;

function findAndKillProcess() {
  return new Promise((resolve, reject) => {
    exec(`lsof -ti:${PORT}`, (error, stdout, stderr) => {
      if (error) {
        // No process found on port, which is what we want
        if (stderr.includes('lsof:')) {
          // lsof not available, try alternative
          exec(`fuser -k ${PORT}/tcp 2>/dev/null || true`, () => {
            resolve(false);
          });
          return;
        }
        resolve(false);
        return;
      }

      const pids = stdout.trim().split('\n').filter(p => p);
      if (pids.length === 0) {
        resolve(false);
        return;
      }

      console.log(`Killing server process(es) (PIDs: ${pids.join(', ')})...`);
      
      // Kill each PID individually
      const killPromises = pids.map(pid => {
        return new Promise((resolve, reject) => {
          exec(`kill -9 ${pid}`, (killError) => {
            if (killError) {
              console.error(`Failed to kill process ${pid}:`, killError);
              reject(killError);
            } else {
              resolve(true);
            }
          });
        });
      });

      Promise.all(killPromises)
        .then(() => {
          console.log('Server process(es) killed successfully');
          resolve(true);
        })
        .catch((error) => {
          reject(error);
        });
    });
  });
}

async function waitForServerToStop(maxAttempts = 10, delay = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await new Promise((resolve, reject) => {
        exec(`lsof -ti:${PORT}`, (error, stdout) => {
          if (error) {
            resolve(false); // No process found
            return;
          }
          resolve(!!stdout.trim()); // Process still running
        });
      });

      if (!result) {
        return true;
      }
    } catch (e) {
      // lsof might not be available, assume stopped
      return true;
    }

    await new Promise(r => setTimeout(r, delay));
  }
  return false;
}

async function updateServerStatus(running) {
  const statusFile = '.server-status';
  const status = running ? 'running' : 'stopped';
  await writeFile(statusFile, status, 'utf-8');
  console.log(`Server status updated to: ${status}`);
}

async function main() {
  try {
    console.log('Stopping server...');
    await findAndKillProcess();
    
    console.log('Waiting for server to fully stop...');
    const stopped = await waitForServerToStop();
    
    if (stopped) {
      console.log('Server confirmed stopped');
      await updateServerStatus(false);
    } else {
      console.warn('Server may still be running (could not verify)');
    }
  } catch (error) {
    console.error('Error stopping server:', error);
    process.exit(1);
  }
}

main();
