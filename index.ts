import { ChainData } from './src/chainData';
// import { Cache } from './src/cacheData';
import { Cache } from './src/cacheRedis';
import { DatabaseHandler } from './src/db/database';
import { Scheduler } from './src/scheduler';
import path from 'path';
import { RpcListener } from './src/event/rpcListener';
import { logger } from './src/logger';

const argv = require('yargs/yargs')(process.argv.slice(2)).argv;
const keys = require('./config/keys');
const KUSAMA_DECIMAL = 1000000000000;
const POLKADOT_DECIMAL = 10000000000;

(async() => {
  try {
    logger.debug(argv);
    if(argv.chain !== undefined) {
      switch (argv.chain) {
        case 'kusama':
          initKusama();
          break;
        case 'polkadot':
          initPolkadot();
          break;
        default: {
          initKusama();
          initPolkadot();
        }
      }
    } else {
      initKusama();
      initPolkadot();
    }
  } catch(err) {
    logger.error(err);
  }
})();

async function initKusama() {
  try {
    const chainData = new ChainData(keys.KUSAMA_WSS);
    await chainData.connect();
    const cacheFolder = path.join(__dirname, './cache/kusama');
    const cacheData = new Cache('KSM', keys.REDIS_URL, keys.REDIS_PORT);
    const db = new DatabaseHandler();
    await db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME);
    const rpcListener = new RpcListener(chainData, db, KUSAMA_DECIMAL, 'KSM');
    rpcListener.start();
    const scheduler = new Scheduler('KUSAMA', chainData, db, cacheData);
    scheduler.start();
  } catch(err) {
    logger.error(err);
  }
}

async function initPolkadot() {
  try {
    const chainData = new ChainData(keys.POLKADOT_WSS);
    await chainData.connect();
    const cacheFolder = path.join(__dirname, './cache/polkadot');
    const cacheData = new Cache('DOT', keys.REDIS_URL, keys.REDIS_PORT);
    const db = new DatabaseHandler();
    await db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME_POLKADOT);
    const rpcListener = new RpcListener(chainData, db, POLKADOT_DECIMAL, 'DOT');
    rpcListener.start();
    const polkadotScheduler = new Scheduler('POLKADOT', chainData, db, cacheData);
    polkadotScheduler.start();
  } catch(err) {
    logger.error(err);
  }
}