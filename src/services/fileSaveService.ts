export async function saveFileToDevice(blob: Blob, fileName: string): Promise<{ success: boolean; method: 'filesystem-api' | 'download-fallback'; error?: string }> {
  // Check if File System Access API is supported (window.showSaveFilePicker)
  if ('showSaveFilePicker' in window) {
    try {
      const ext = fileName.includes('.') ? `.${fileName.split('.').pop()}` : '';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: ext ? [
          {
            description: 'File',
            accept: {
              [blob.type || 'application/octet-stream']: [ext]
            }
          }
        ] : undefined
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();

      return { success: true, method: 'filesystem-api' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled picker dialog
        return { success: false, method: 'filesystem-api', error: 'Save was cancelled.' };
      }
      console.warn('[FileSave] showSaveFilePicker failed or unpermitted, falling back to download:', err);
      // Fall through to standard download
    }
  }

  // Standard browser download fallback
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);

    return { success: true, method: 'download-fallback' };
  } catch (err: any) {
    return { success: false, method: 'download-fallback', error: err?.message || 'Download failed' };
  }
}

export async function saveAllFiles(files: Array<{ blob: Blob; fileName: string }>): Promise<{ savedCount: number; errors: string[] }> {
  let savedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Stagger slightly so mobile browsers don't choke on simultaneous downloads
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const result = await saveFileToDevice(file.blob, file.fileName);
    if (result.success) {
      savedCount++;
    } else if (result.error && result.error !== 'Save was cancelled.') {
      errors.push(`${file.fileName}: ${result.error}`);
    }
  }

  return { savedCount, errors };
}
