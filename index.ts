import { ChainData } from './src/chainData';
import { Cache } from './src/cacheRedis';
import { DatabaseHandler } from './src/db/database';
import { Scheduler } from './src/scheduler';
import { RpcListener } from './src/event/rpcListener';
import { logger } from './src/logger';
import { keys } from './src/config/keys';
import SlackBot from './src/slack';

import yargs from 'yargs/yargs';

const argv = yargs(process.argv.slice(2)).options({
  chain: { type: 'string', default: 'none' },
}).parseSync();

const KUSAMA_DECIMAL = 1000000000000;
const POLKADOT_DECIMAL = 10000000000;

(async () => {
  try {
    logger.debug(argv);
    let bot;
    if (keys.SLACK_WEBHOOK !== undefined && keys.SLACK_WEBHOOK.length > 0) {
      bot = new SlackBot(keys.SLACK_WEBHOOK);
    }
    if (argv.chain !== undefined) {
      switch (argv.chain) {
        case 'kusama':
          initKusama(bot);
          break;
        case 'polkadot':
          initPolkadot(bot);
          break;
        case 'westend':
          initWestend(bot);
          break;
        default: {
          initKusama(bot);
          initPolkadot(bot);
        }
      }
    } else {
      initKusama(bot);
      initPolkadot(bot);
    }
  } catch (err) {
    logger.error(err);
  }
})();

async function initKusama(bot?: SlackBot) {
  try {
    const chainData = new ChainData(keys.KUSAMA_WSS, bot);
    await chainData.connect();
    const cacheData = new Cache('KSM', keys.REDIS_URL, keys.REDIS_PORT);
    const db = new DatabaseHandler();
    await db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME);
    const rpcListener = new RpcListener(chainData, db, KUSAMA_DECIMAL, 'KSM');
    rpcListener.start();
    const scheduler = new Scheduler('KUSAMA', chainData, db, cacheData);
    scheduler.start();
  } catch (err) {
    logger.error(err);
  }
}

async function initPolkadot(bot?: SlackBot) {
  try {
    const chainData = new ChainData(keys.POLKADOT_WSS, bot);
    await chainData.connect();
    const cacheData = new Cache('DOT', keys.REDIS_URL, keys.REDIS_PORT);
    const db = new DatabaseHandler();
    await db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME_POLKADOT);
    const rpcListener = new RpcListener(chainData, db, POLKADOT_DECIMAL, 'DOT');
    rpcListener.start();
    const polkadotScheduler = new Scheduler('POLKADOT', chainData, db, cacheData);
    polkadotScheduler.start();
  } catch (err) {
    logger.error(err);
  }
}

async function initWestend(bot?: SlackBot) {
  try {
    console.log(keys.WESTEND_WSS);
    const chainData = new ChainData(keys.WESTEND_WSS, bot);
    await chainData.connect();
    const cacheData = new Cache('WND', keys.REDIS_URL, keys.REDIS_PORT);
    const db = new DatabaseHandler();
    await db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME_WESTEND);
    const rpcListener = new RpcListener(chainData, db, KUSAMA_DECIMAL, 'WND');
    rpcListener.start();
    const scheduler = new Scheduler('WND', chainData, db, cacheData);
    scheduler.start();
  } catch (err) {
    logger.error(err);
  }
}