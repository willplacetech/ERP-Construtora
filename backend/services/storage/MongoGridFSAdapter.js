import mongoose from 'mongoose';
import crypto from 'crypto';
import { GridFSBucket, ObjectId } from 'mongodb';
import { StorageService } from './StorageService.js';

export class MongoGridFSAdapter extends StorageService {
  constructor(bucketName = 'arquivos') {
    super();
    this.bucketName = bucketName;
  }

  _bucket() {
    return new GridFSBucket(mongoose.connection.db, { bucketName: this.bucketName });
  }

  async salvar(buffer, metadados = {}) {
    const hashSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const nome = metadados.nome || 'arquivo';
    const mimeType = metadados.mimeType || 'application/octet-stream';

    return await new Promise((resolve, reject) => {
      const uploadStream = this._bucket().openUploadStream(nome, {
        contentType: mimeType,
        metadata: { ...metadados, hashSha256, tamanho: buffer.length }
      });
      uploadStream.once('finish', () => resolve({ arquivoId: uploadStream.id.toString(), hashSha256 }));
      uploadStream.once('error', reject);
      uploadStream.end(buffer);
    });
  }

  async obter(arquivoId, { empresaId } = {}) {
    if (!ObjectId.isValid(arquivoId)) {
      const error = new Error('arquivo_id_invalido');
      error.status = 400;
      throw error;
    }
    const id = new ObjectId(arquivoId);
    const bucket = this._bucket();
    const query = { _id: id };
    if (empresaId) query['metadata.empresa'] = String(empresaId);
    const file = await bucket.find(query).next();
    if (!file) throw new Error('arquivo_nao_encontrado');

    const chunks = [];
    await new Promise((resolve, reject) => {
      const stream = bucket.openDownloadStream(id);
      stream.on('data', (c) => chunks.push(c));
      stream.once('end', resolve);
      stream.once('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    return {
      buffer,
      nome: file.filename,
      mimeType: file.contentType,
      tamanho: file.length,
      hashSha256: file.metadata?.hashSha256
    };
  }

  async remover(arquivoId, { empresaId } = {}) {
    if (!ObjectId.isValid(arquivoId)) {
      const error = new Error('arquivo_id_invalido');
      error.status = 400;
      throw error;
    }
    const id = new ObjectId(arquivoId);
    const bucket = this._bucket();
    const query = { _id: id };
    if (empresaId) query['metadata.empresa'] = String(empresaId);
    const file = await bucket.find(query).next();
    if (!file) throw new Error('arquivo_nao_encontrado');
    await bucket.delete(id);
  }
}