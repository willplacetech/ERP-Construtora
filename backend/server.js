import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { whatsappService } from './services/whatsapp/index.js';
import { startCronJobs } from './jobs/cron.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
}));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    try {
      whatsappService.init({
        provider: process.env.WHATSAPP_PROVIDER || 'evolution',
        baseUrl: process.env.WHATSAPP_BASE_URL || process.env.WHATSAPP_API_URL,
        apiKey: process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_TOKEN,
        instance: process.env.WHATSAPP_INSTANCE
      });
    } catch (err) {
      console.warn('[boot] WhatsApp:', err.message);
    }
    try {
      startCronJobs();
    } catch (err) {
      console.warn('[boot] cron:', err.message);
    }
  })
  .catch((err) => console.error('MongoDB connection error:', err));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const routesDir = join(__dirname, 'routes');

const routeModules = await Promise.all(
  readdirSync(routesDir)
    .filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'))
    .map(async (file) => {
      try {
        return { file, routeModule: await import(`./routes/${file}`) };
      } catch (err) {
        console.error(`Failed to load route ${file}:`, err);
        return null;
      }
    })
);

routeModules.filter(Boolean).forEach(({ file, routeModule }) => {
  const router = routeModule.default || routeModule;
  const routeName = file.replace('.js', '');
  app.use(`/api/${routeName}`, router);
  // alias kebab-case para o front legado
  if (routeName === 'usuarioWhatsApp') {
    app.use('/api/usuario-whatsapp', router);
  }
  console.log(`Route loaded: /api/${routeName}`);
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Something went wrong!', error: err.message });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
