import express from 'express';
import cors from 'cors';
import path from 'path';
import { uploadRouter } from './routes/upload';
import { renderRouter } from './routes/render';
import { downloadRouter } from './routes/download';
import { ensureTmpDir } from './services/fileManager';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/upload', uploadRouter);
app.use('/api/render', renderRouter);   // POST /api/render
app.use('/api/download', downloadRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

ensureTmpDir();

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
