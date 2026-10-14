import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sienge';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node restore.js <caminho-para-backup>');
  process.exit(1);
}

const backupPath = resolve(args[0]);

if (!existsSync(backupPath)) {
  console.error(`Diretório de backup não encontrado: ${backupPath}`);
  process.exit(1);
}

console.log(`Iniciando restauração do backup ${backupPath}...`);
try {
  execSync(`mongorestore --uri="${MONGO_URI}" --drop "${backupPath}"`, { stdio: 'inherit' });
  console.log('Restauração concluída com sucesso.');
} catch (error) {
  console.error('Erro durante a restauração:', error.message);
  process.exit(1);
}