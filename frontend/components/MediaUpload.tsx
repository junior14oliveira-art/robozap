'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Image as ImageIcon, X, Upload, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiUpload, API_URL } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface UploadedMedia {
  filename: string;
  filePath: string;
  url: string;
  mimetype: string;
  size: number;
}

interface MediaUploadProps {
  media: UploadedMedia | null;
  onMediaSelected: (media: UploadedMedia | null) => void;
}

export function MediaUpload({ media, onMediaSelected }: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('media', file);

        const result = await apiUpload<UploadedMedia>('/api/upload/media', formData);
        onMediaSelected(result);
      } catch (err: any) {
        setError(err.message || 'Erro ao enviar a imagem.');
      } finally {
        setUploading(false);
      }
    },
    [onMediaSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    maxSize: 16 * 1024 * 1024,
    disabled: uploading,
  });

  const handleRemove = () => {
    onMediaSelected(null);
    setError(null);
  };

  const getMediaUrl = (url: string) => {
    if (url.startsWith('http')) return url;
    return `${API_URL}${url}`;
  };

  if (media) {
    return (
      <div className="rounded-2xl border border-whatsapp/30 bg-whatsapp/5 p-4 space-y-3 animate-slide-up">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-border bg-black/40 shrink-0">
              <img
                src={getMediaUrl(media.url)}
                alt="Foto anexada"
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-whatsapp" />
                <p className="text-sm font-semibold text-foreground truncate max-w-[220px]">
                  {media.filename}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(media.size / (1024 * 1024)).toFixed(2)} MB · {media.mimetype.replace('image/', '').toUpperCase()}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-whatsapp">
                <ShieldCheck className="h-3 w-3" />
                <span>Hash SHA-256 único ativado para cada destinatário</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRemove}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Remover foto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center transition-all cursor-pointer',
          isDragActive
            ? 'border-whatsapp bg-whatsapp/10'
            : 'border-border bg-secondary/20 hover:border-whatsapp/50 hover:bg-secondary/40',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary mb-2">
          {uploading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-whatsapp border-t-transparent" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <p className="text-xs font-semibold text-foreground">
          {uploading ? 'Enviando foto...' : isDragActive ? 'Solte a foto aqui' : 'Anexar Foto à Campanha (Opcional)'}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          JPG, PNG ou WEBP até 16MB · O texto da mensagem será enviado como legenda da foto
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
