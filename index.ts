import { ChainData } from './src/chainData';
import { Cache } from './src/cacheData';
import { DatabaseHandler } from './src/db/database';
import { Scheduler } from './src/scheduler';
import { Scheduler as PolkadotScheduler } from  './src/polkadotScheduler';
import path from 'path';
const keys = require('./config/keys');

(async() => {
  try {
    initKusama();
    initPolkadot();
  } catch(err) {
    console.error(err);
  }
})();

async function initKusama() {
  try {
    const chainData = new ChainData('wss://kusama-rpc.polkadot.io');
    await chainData.connect();
    const cacheFolder = path.join(__dirname, './cache/kusama');
    const cacheData = new Cache(cacheFolder);
    const db = new DatabaseHandler();
    await db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME);
    const scheduler = new Scheduler(chainData, db, cacheData);
    scheduler.start();
  } catch(err) {
    console.error(err);
  }
}

async function initPolkadot() {
  try {
    const chainData = new ChainData('wss://rpc.polkadot.io');
    await chainData.connect();
    const cacheFolder = path.join(__dirname, './cache/polkadot');
    const cacheData = new Cache(cacheFolder);
    const db = new DatabaseHandler();
    await db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME_POLKADOT);
    const polkadotScheduler = new PolkadotScheduler(chainData, db, cacheData);
    polkadotScheduler.start();
  } catch(err) {
    console.error(err);
  }
}