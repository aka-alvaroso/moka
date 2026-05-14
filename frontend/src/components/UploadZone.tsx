import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '../lib/api';

interface Props {
  onUploaded: (fileId: string, previewUrl: string, isVideo: boolean, w: number, h: number) => void;
  compact?: boolean;
}

function getImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.onloadedmetadata = () => { resolve({ w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(url); };
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.src = url;
    }
  });
}

export function UploadZone({ onUploaded, compact = false }: Props) {
  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    const [res, dims] = await Promise.all([
      uploadFile(file),
      getImageDimensions(file),
    ]);
    const previewUrl = URL.createObjectURL(file);
    onUploaded(res.fileId, previewUrl, res.isVideo, dims.w, dims.h);
  }, [onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'video/*': ['.mp4', '.mov', '.webm'],
    },
    maxFiles: 1,
    maxSize: 200 * 1024 * 1024,
  });

  if (compact) {
    return (
      <div
        {...getRootProps()}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer transition-colors text-xs
          ${isDragActive ? 'border-accent text-accent bg-accent/10' : 'border-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'}`}
      >
        <input {...getInputProps()} />
        <UploadIcon size={12} />
        <span>Change file</span>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed cursor-pointer transition-all p-6 text-center
        ${isDragActive ? 'border-accent bg-accent/10' : 'border-border hover:border-zinc-600 hover:bg-surface-2'}`}
    >
      <input {...getInputProps()} />
      <UploadIcon size={24} active={isDragActive} />
      <div>
        <p className="text-sm font-medium text-zinc-300">
          {isDragActive ? 'Drop it' : 'Drop image or video'}
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">PNG · JPG · WebP · MP4 · MOV</p>
      </div>
    </div>
  );
}

function UploadIcon({ size = 20, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={active ? '#6366f1' : '#52525b'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}
