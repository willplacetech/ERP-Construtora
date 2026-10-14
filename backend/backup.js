import { execSync } from 'child_process';
import { resolve, join, dirname } from 'path';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sienge';
const BACKUP_DIR = resolve(__dirname, 'backups');

try {
  // Ensure backup directory exists
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `backup-${timestamp}`);

  console.log(`Iniciando backup do MongoDB para ${backupPath}...`);
  execSync(`mongodump --uri="${MONGO_URI}" --out="${backupPath}"`, { stdio: 'inherit' });
  console.log('Backup concluído com sucesso.');

  // Optional: verify backup by checking for expected collections
  const collections = readdirSync(join(backupPath, 'sienge'));
  console.log(`Coleções encontradas: ${collections.join(', ')}`);
} catch (error) {
  console.error('Erro durante o backup:', error.message);
  process.exit(1);
}