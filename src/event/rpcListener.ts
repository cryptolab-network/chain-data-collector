import { ApiPromise } from "@polkadot/api";
import { ChainData } from "../chainData";
import { DatabaseHandler } from "../db/database";
// eslint-disable-next-line
const divide = require('divide-bigint');
import { logger } from '../logger';

export class RpcListener {
  api: ApiPromise
  db: DatabaseHandler
  isFetchingRewards: boolean
  decimals: number
  firstTime: boolean
  currentEra: number
  chain: string
  constructor(chainData: ChainData, db: DatabaseHandler, decimals: number, chain: string) {
    if(!chainData.api) {
      throw new Error("chainData API is not initialized");
    }
    this.api = chainData.api;
    this.isFetchingRewards = false;
    this.db = db;
    this.decimals = decimals;
    this.firstTime = true;
    this.currentEra = 0;
    this.chain = chain;
  }

  async start(): Promise<void> {
    logger.info('RPC listener starts');
    await this.api.rpc.chain.subscribeFinalizedHeads(async (blockHeader) => {
      const blockNumber = blockHeader.number.toNumber();
      this.onFinalizedBlock(
          blockNumber, 
      );
    });
  }

  private async onFinalizedBlock(blockNumber: number) {
    if (blockNumber % 300 == 0 || this.firstTime === true) {
      this.firstTime = false;
      logger.info('ProcessRewardUpToBlock ' + blockNumber);
        this.processRewardsUpToBlock(blockNumber - 1);
    }
  }

  private async processRewardsUpToBlock(blockNumber: number) {
    if (this.isFetchingRewards) { 
      logger.info('Fetching rewards...');
      return; 
    }
    try{
      this.isFetchingRewards = true;
      const startBlockNumber = (await this.db.getLastFetchedRewardBlock(blockNumber - 304000)) + 1;
      logger.info(`Starts process ${this.chain} block events from block ${startBlockNumber}`);
      for (let i = startBlockNumber; i <= blockNumber; i++) {
          try {
            if(i % 100 === 0) {
              logger.info(`Processing ${this.chain} block ${i}`);
            }
            const blockHash = await this.api.rpc.chain.getBlockHash(i);
            const era = await this.api.query.staking.activeEra.at(blockHash);
            if(era.unwrap().index.toNumber() !== this.currentEra) {
              this.currentEra = era.unwrap().index.toNumber();
              logger.debug('era = ' + this.currentEra);
            }
            const rewards = await this.getRewardsInBlock(blockHash.toString());
            for (const reward of rewards) {
              await this.db.saveRewards(reward.targetStashAddress, era.unwrap().index.toNumber(),
                divide(BigInt(reward.amount), BigInt(this.decimals)), reward.timestamp);
            }
            await this.db.saveLastFetchedBlock(i);
          } catch (error) {
            logger.error(`Error while fetching rewards in block #${i}: ${error}`);
            break;
          }
      }
    } catch(err) {
      logger.error(err);
    } finally {
      this.isFetchingRewards = false;
      logger.info('Fetch reward loop ends');
    }
  }

  private async getRewardsInBlock(blockHash: string) {
    const allRecords = await this.api.query.system.events.at(blockHash);
    const timestamp = await this.api.query.timestamp.now.at(blockHash);
    const rewards = [];
    for (let i = 0; i < allRecords.length; i++) {
        const { event } = allRecords[i];
        if (event.section.toLowerCase() == 'staking'
                && event.method.toLowerCase() == 'rewarded') {
            const reward = {
                timestamp: parseInt(timestamp.toString()),
                targetStashAddress: event.data[0].toString(),
                amount: event.data[1].toString()
            };
            rewards.push(reward);
        }
        if (event.section.toLowerCase() === 'staking'
        && (event.method.toLowerCase() === 'chilled' || event.method.toLowerCase() === 'chill')) {
          const stash = event.data[0].toString();
          console.log(event.toHuman());
        }
        if (event.section.toLowerCase() === 'staking'
        && (event.method.toLowerCase() === 'kicked' || event.method.toLowerCase() === 'kick')) {
          const nominator = event.data[0].toString();
          const stash = event.data[1].toString();
          console.log(event.toHuman());
        }
    }
    return rewards;
}
}