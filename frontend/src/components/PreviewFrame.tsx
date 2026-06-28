import { WebContainer } from '@webcontainer/api';
import React, { useEffect, useState } from 'react';
import { FileItem } from '../types';

interface PreviewFrameProps {
  files: FileItem[];
  mountedFilesKey: string;
  webContainer?: WebContainer;
}

function findFile(files: FileItem[], path: string): FileItem | undefined {
  for (const file of files) {
    if (file.path === path) {
      return file;
    }

    if (file.children) {
      const child = findFile(file.children, path);
      if (child) {
        return child;
      }
    }
  }
}

export function PreviewFrame({ files, mountedFilesKey, webContainer }: PreviewFrameProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("Waiting for project files...");
  const packageJson = findFile(files, "/package.json");

  useEffect(() => {
    if (!webContainer || !mountedFilesKey) {
      setStatus("Waiting for WebContainer...");
      return;
    }

    if (!packageJson) {
      setStatus("Waiting for package.json...");
      return;
    }

    let cancelled = false;
    let devProcess: Awaited<ReturnType<WebContainer['spawn']>> | undefined;
    let installOutput = "";

    function updateStatusFromOutput(data: string) {
      installOutput = `${installOutput}${data}`;
      const lines = installOutput.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const latestLine = lines.at(-1);
      if (latestLine) {
        setStatus(`Installing dependencies: ${latestLine}`);
      }
    }

    async function startPreview() {
      try {
        setUrl("");
        setStatus("Installing dependencies...");

        const installProcess = await webContainer.spawn('npm', ['install', '--no-audit', '--no-fund']);
        installProcess.output.pipeTo(new WritableStream({
          write(data) {
            console.log(data);
            if (!cancelled) {
              updateStatusFromOutput(data);
            }
          }
        }));

        const installExitCode = await Promise.race([
          installProcess.exit,
          new Promise<number>((_, reject) => {
            window.setTimeout(() => reject(new Error("npm install is taking too long. Check the browser console for the latest npm output.")), 120000);
          })
        ]);
        if (installExitCode !== 0) {
          throw new Error(`npm install failed with exit code ${installExitCode}`);
        }

        if (cancelled) {
          return;
        }

        setStatus("Starting preview...");

        webContainer.on('server-ready', (_port, previewUrl) => {
          if (!cancelled) {
            setUrl(previewUrl);
          }
        });

        devProcess = await webContainer.spawn('npm', ['run', 'dev']);
        devProcess.output.pipeTo(new WritableStream({
          write(data) {
            console.log(data);
            if (!cancelled && !url) {
              setStatus(`Starting preview: ${data.trim() || "waiting for Vite..."}`);
            }
          }
        }));
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Preview failed to start");
        }
      }
    }

    startPreview();

    return () => {
      cancelled = true;
      devProcess?.kill();
    };
  }, [mountedFilesKey, packageJson?.content, webContainer]);

  return (
    <div className="h-full flex items-center justify-center text-gray-400">
      {!url && <div className="text-center">
        <p className="mb-2">{status}</p>
      </div>}
      {url && <iframe className="w-full h-full bg-white" src={url} />}
    </div>
  );
}
