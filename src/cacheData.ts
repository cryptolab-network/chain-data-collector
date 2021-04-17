import path from 'path';
import fs from 'fs';

export class Cache {
  folder: string
  constructor(folder: string) {
    this.folder = folder;
    if (!fs.existsSync(folder)){
      fs.mkdirSync(folder);
    }
  }

  async fetch<T>(type: string) {
    return new Promise<T>((resolve, reject)=>{
      const filePath = path.join(this.folder, type + '.json');
      fs.readFile(filePath, 'utf8', (err, data)=>{
        if(err !== null) {
          reject(err);
        } else {
          resolve(JSON.parse(data) as T);
        }
      });
    });
  }

  async update<T>(type: string, data: T) {
    return new Promise<void>((resolve, reject)=>{
      const filePath = path.join(this.folder, type + '.json');
      fs.writeFile(filePath, JSON.stringify(data), (err)=>{
        if(err !== null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
};