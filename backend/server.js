import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
}));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // replicaSet: 'rs0' // already in URI if needed
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Dynamically load routes
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const routesDir = join(__dirname, 'routes');

import { readdirSync } from 'fs';
readdirSync(routesDir)
  .filter(file => file.endsWith('.js') && !file.endsWith('.test.js'))
  .forEach(file => {
    const route = import(`./routes/${file}`);
    route.then(routeModule => {
      // Assuming each route exports a router as default
      const router = routeModule.default || routeModule;
      const routeName = file.replace('.js', '');
      app.use(`/api/${routeName}`, router);
      console.log(`Route loaded: /api/${routeName}`);
    }).catch(err => {
      console.error(`Failed to load route ${file}:`, err);
    });
  });

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
