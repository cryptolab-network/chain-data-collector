import redis from 'redis';
import { logger } from './logger';

export class Cache {
  client: redis.RedisClient
  coin: String
  constructor(coin: String, host: string, port: number) {
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

  async fetch<T>(type: string) {
    return new Promise<T>((resolve, reject)=>{
      this.client.get(this.coin + type, (err, data)=>{
        if(err !== null) {
          reject(err);
        } else {
          resolve(JSON.parse(data!) as T);
        }
      });
    });
  }

  async update<T>(type: string, data: T) {
    return new Promise<void>((resolve, reject)=>{
      this.client.set(this.coin + type, JSON.stringify(data), (err)=>{
        if(err !== null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

}