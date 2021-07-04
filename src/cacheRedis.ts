import redis from 'redis';
import { logger } from './logger';

export class Cache {
  client: redis.RedisClient
  coin: string
  constructor(coin: string, host: string, port: number) {
    this.client = redis.createClient({
      host: host,
      port: port,
    });
    this.client.on("error", function(error: Error) {
      logger.error(error);
    });
    this.client.on('ready', function() {
      logger.info('redis connected');
    });
    this.coin = coin;
  }

  async fetch<T>(type: string): Promise<T> {
    return new Promise<T>((resolve, reject)=>{
      this.client.get(this.coin + type, (err, data)=>{
        if(err !== null) {
          reject(err);
        } else {
          if(data) {
            resolve(JSON.parse(data) as T);
          } else {
            reject('data is null');
          }
        }
      });
    });
  }

  async update<T>(type: string, data: T): Promise<void> {
    return new Promise<void>((resolve, reject)=>{
      let str = '';
      if(typeof data !== 'string') {
        str = JSON.stringify(data);
      } else {
        str = data;
      }
      this.client.set(this.coin + type, str, (err)=>{
        if(err !== null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

}