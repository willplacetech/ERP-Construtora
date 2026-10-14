const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sienge';
const BACKUP_DIR = path.resolve(__dirname, 'backups');

try {
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

  console.log(`Iniciando backup do MongoDB para ${backupPath}...`);
  execSync(`mongodump --uri="${MONGO_URI}" --out="${backupPath}"`, { stdio: 'inherit' });
  console.log('Backup concluído com sucesso.');

  // Optional: verify backup by checking for expected collections
  const collections = fs.readdirSync(path.join(backupPath, 'sienge'));
  console.log(`Coleções encontradas: ${collections.join(', ')}`);
} catch (error) {
  console.error('Erro durante o backup:', error.message);
  process.exit(1);
}