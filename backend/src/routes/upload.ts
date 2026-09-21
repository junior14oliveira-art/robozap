import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parseSpreadsheet } from '../services/spreadsheetService';
import { requireAuth } from '../middleware/auth';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const MEDIA_DIR = path.join(UPLOAD_DIR, 'media');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Storage para planilhas
const spreadsheetStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `upload-${timestamp}${ext}`);
  },
});

const spreadsheetFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['.xlsx', '.xls', '.csv'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Arquivo inválido. Envie um arquivo .xlsx, .xls ou .csv'));
  }
};

const uploadSpreadsheet = multer({
  storage: spreadsheetStorage,
  fileFilter: spreadsheetFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

// Storage para fotos e mídias
const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `media-${timestamp}-${cleanName}`);
  },
});

const mediaFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.jfif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext) || (file.mimetype && file.mimetype.startsWith('image/'))) {
    cb(null, true);
  } else {
    cb(new Error('Formato de imagem inválido. Suportados: JPG, JPEG, PNG, WEBP.'));
  }
};

const uploadMedia = multer({
  storage: mediaStorage,
  fileFilter: mediaFilter,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max para fotos
});

export const uploadRouter = Router();

uploadRouter.use(requireAuth);

/**
 * POST /api/upload/spreadsheet
 * Upload e processamento de planilhas Excel / CSV.
 */
uploadRouter.post('/spreadsheet', (req: Request, res: Response) => {
  uploadSpreadsheet.single('file')(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Erro ao carregar planilha.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
      const phoneColumn = req.body.phoneColumn ? String(req.body.phoneColumn) : undefined;
      const nameColumn = req.body.nameColumn ? String(req.body.nameColumn) : undefined;

      const result = await parseSpreadsheet(req.file.path, { phoneColumn, nameColumn });

      return res.json({
        filename: req.file.originalname,
        filePath: req.file.path,
        ...result,
      });
    } catch (error: any) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(422).json({ error: error.message });
    }
  });
});

/**
 * POST /api/upload/media
 * Upload de fotos/imagens para campanhas.
 */
uploadRouter.post('/media', (req: Request, res: Response) => {
  uploadMedia.single('media')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'A foto excede o limite máximo permitido de 16MB.' });
        }
        return res.status(400).json({ error: `Erro no upload: ${err.message}` });
      }
      return res.status(400).json({ error: err.message || 'Formato de foto inválido.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma foto ou imagem enviada.' });
    }

    const relativeUrl = `/uploads/media/${path.basename(req.file.path)}`;

    return res.json({
      filename: req.file.originalname,
      filePath: req.file.path,
      url: relativeUrl,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  });
});
