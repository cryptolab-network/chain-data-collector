import { ApiPromise } from "@polkadot/api";
import type { Option, u32, Vec } from '@polkadot/types';
import type { ActiveEraInfo, Event } from '@polkadot/types/interfaces';
import { ChainData } from "../chainData";
import { DatabaseHandler } from "../db/database";
// eslint-disable-next-line
const divide = require('divide-bigint');
import { logger } from '../logger';
import { NominationRecordsDBSchema } from "../types";

export class RpcListener {
  api: ApiPromise
  db: DatabaseHandler
  userDb: DatabaseHandler
  isFetchingRewards: boolean
  decimals: number
  firstTime: boolean
  currentEra: number
  chain: string
  constructor(chainData: ChainData, db: DatabaseHandler, userDb: DatabaseHandler, decimals: number, chain: string) {
    if(!chainData.api) {
      throw new Error("chainData API is not initialized");
    }
    this.api = chainData.api;
    this.isFetchingRewards = false;
    this.db = db;
    this.userDb = userDb;
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
      const cryptoLabUsers = await this.userDb.getAllNominationRecords();
      this.processRewardsUpToBlock(blockNumber - 1, cryptoLabUsers);
    }
  }

  private async processRewardsUpToBlock(blockNumber: number, cryptoLabUsers: NominationRecordsDBSchema[]) {
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
            const apiAt = await this.api.at(blockHash);
            const era = await apiAt.query.staking.activeEra<Option<ActiveEraInfo>>();
            if(era.unwrap().index.toNumber() !== this.currentEra) {
              this.currentEra = era.unwrap().index.toNumber();
              logger.debug('era = ' + this.currentEra);
            }
            const {rewards, chills, kicks} = await this.getEventsInBlock(blockHash.toString());
            for (const reward of rewards) {
              let writeToUserMapping = false;
              if (cryptoLabUsers.findIndex((v) => v.stash === reward.targetStashAddress) >= 0) {
                writeToUserMapping = true;
              }
              await this.db.saveRewards(reward.targetStashAddress, era.unwrap().index.toNumber(),
                divide(BigInt(reward.amount), BigInt(this.decimals)), reward.timestamp, writeToUserMapping);
            }
            for (const chill of chills) {
              let writeToUserMapping = false;
              if (cryptoLabUsers.findIndex((v) => v.validators.findIndex((a) => a === chill.validator) >= 0) >= 0) {
                writeToUserMapping = true;
              }
              await this.db.saveChillEvent(chill.validator, era.unwrap().index.toNumber(), chill.timestamp, writeToUserMapping);
            }
            for (const kick of kicks) {
              let writeToUserMapping = false;
              if (cryptoLabUsers.findIndex((v) => v.validators.findIndex((a) => a === kick.validator) >= 0) >= 0) {
                writeToUserMapping = true;
              }
              await this.db.saveKickEvent(kick.validator, era.unwrap().index.toNumber(), kick.nominator, kick.timestamp, writeToUserMapping);
            }
            await this.db.saveLastFetchedBlock(i);
          } catch (error) {
            logger.error(`Error while fetching rewards in block #${i}: ${error}`);
            break;
          }
      }
    } catch(err) {
      logger.error(err as Error);
    } finally {
      this.isFetchingRewards = false;
      logger.info('Fetch reward loop ends');
    }
  }

  private async getEventsInBlock(blockHash: string) {
    const apiAt = await this.api.at(blockHash);
    const allRecords = await apiAt.query.system.events<Vec<any>>();
    const timestamp = await apiAt.query.timestamp.now();
    const rewards = [];
    const chills = [];
    const kicks = [];
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
          const chillEvent = {
            timestamp: parseInt(timestamp.toString()),
            validator: event.data[0].toString(),
          }
          chills.push(chillEvent);
        }
        if (event.section.toLowerCase() === 'staking'
        && (event.method.toLowerCase() === 'kicked' || event.method.toLowerCase() === 'kick')) {
          const nominator = event.data[0].toString();
          const stash = event.data[1].toString();
          console.log(event.toHuman());
          const kickEvent = {
            timestamp: parseInt(timestamp.toString()),
            validator: stash,
            nominator: nominator,
          }
          kicks.push(kickEvent);
        }
    }
    return { rewards, chills, kicks };
}
}