'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Image as ImageIcon, X, ShieldCheck, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { apiUpload, BACKEND_URL } from '@/lib/api';
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
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const performUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setUploadStatus('Enviando foto...');

    try {
      const result = await apiUpload<UploadedMedia>(
        '/api/upload/media',
        () => {
          const fd = new FormData();
          fd.append('media', file);
          return fd;
        },
        {
          maxRetries: 3,
          onProgress: (msg) => setUploadStatus(msg),
        }
      );
      onMediaSelected(result);
      setLastFile(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar a imagem.');
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[], fileRejections: any[]) => {
      if (fileRejections && fileRejections.length > 0) {
        const rej = fileRejections[0];
        const isTooLarge = rej?.errors?.some((e: any) => e.code === 'file-too-large');
        setError(
          isTooLarge
            ? 'A imagem excede o tamanho limite de 16MB. Por favor envie uma imagem menor.'
            : 'Formato de imagem inválido. Suportados: JPG, JPEG, PNG, WEBP.'
        );
        return;
      }

      const file = acceptedFiles[0];
      if (!file) return;

      setLastFile(file);
      await performUpload(file);
    },
    [onMediaSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.jfif'],
    },
    maxFiles: 1,
    maxSize: 16 * 1024 * 1024,
    disabled: uploading,
  });

  const handleRemove = () => {
    onMediaSelected(null);
    setError(null);
    setLastFile(null);
  };

  const handleRetry = async () => {
    if (lastFile) {
      await performUpload(lastFile);
    }
  };

  const getMediaUrl = (url: string) => {
    if (url.startsWith('http')) return url;
    return `${BACKEND_URL}${url}`;
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
          uploading && 'opacity-60 cursor-not-allowed'
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
          {uploading
            ? uploadStatus || 'Enviando foto...'
            : isDragActive
            ? 'Solte a foto aqui'
            : 'Anexar Foto à Campanha (Opcional)'}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {uploading
            ? 'Aguarde o processamento seguro...'
            : 'JPG, PNG ou WEBP até 16MB · O texto da mensagem será enviado como legenda da foto'}
        </p>
      </div>

      {error && (
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs animate-slide-up">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
          {lastFile && !uploading && (
            <div className="flex items-center gap-2 pt-1 border-t border-destructive/20 justify-end">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setLastFile(null);
                }}
                className="px-2 py-1 text-xs rounded hover:bg-destructive/10 transition-colors text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Tentar novamente ({lastFile.name})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
