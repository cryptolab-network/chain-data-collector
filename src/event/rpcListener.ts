import { ApiPromise } from "@polkadot/api";
import { ChainData } from "../chainData";
import { DatabaseHandler } from "../db/database";
const divide = require('divide-bigint');

export class RpcListener {
  api: ApiPromise
  db: DatabaseHandler
  isFetchingRewards: Boolean
  decimals: number
  firstTime: Boolean
  currentEra: number
  constructor(chainData: ChainData, db: DatabaseHandler, decimals: number) {
    this.api = chainData.api!;
    this.isFetchingRewards = false;
    this.db = db;
    this.decimals = decimals;
    this.firstTime = true;
    this.currentEra = 0;
  }

  async start() {
    console.log('RPC listener starts');
    await this.api.rpc.chain.subscribeFinalizedHeads(async (blockHeader) => {
      const blockNumber = blockHeader.number.toNumber();
      // console.log('onFinalizedBlock ' + blockNumber);
      this.onFinalizedBlock(
          blockNumber, 
      );
    });
  }
  private async onFinalizedBlock(blockNumber: number) {
    if (blockNumber % 300 == 0 || this.firstTime === true) {
      this.firstTime = false;
      console.log('ProcessRewardUpToBlock ' + blockNumber);
        this.processRewardsUpToBlock(blockNumber - 50);
    }
  }

  private async processRewardsUpToBlock(blockNumber: number) {
    try{
      if (this.isFetchingRewards) { return; }
      this.isFetchingRewards = true;
      const startBlockNumber = (await this.db.getLastFetchedRewardBlock(blockNumber - 304000)) + 1;
      console.log('Starts process block events from block ' + startBlockNumber);
      for (let i = startBlockNumber; i <= blockNumber; i++) {
          try {
            console.log('Processing block ' + i);
            const blockHash = await this.api.rpc.chain.getBlockHash(i);
            const era = await this.api.query.staking.activeEra.at(blockHash);
            if(era.unwrap().index.toNumber() !== this.currentEra) {
              this.currentEra = era.unwrap().index.toNumber();
              console.log('era = ' + this.currentEra);
            }
            const rewards = await this.getRewardsInBlock(i);
            // console.log(i, rewards);
            rewards.forEach(async (reward)=>{
              await this.db.saveRewards(reward.targetStashAddress, era.unwrap().index.toNumber(), divide(BigInt(reward.amount), BigInt(this.decimals)));
            });
            await this.db.saveLastFetchedBlock(i);
          } catch (error) {
            console.error(`Error while fetching rewards in block #${i}: ${error}`);
            break;
          }
      }
    } catch(err) {
      console.log(err);
    } finally {
      this.isFetchingRewards = false;
    };
  }

  private async getRewardsInBlock(blockNumber: number) {
    const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber);
    const allRecords = await this.api.query.system.events.at(blockHash);
    const timestamp = await this.api.query.timestamp.now.at(blockHash);
    const rewards = [];
    for (let i = 0; i < allRecords.length; i++) {
        const { event } = allRecords[i];
        if (event.section.toLowerCase() == 'staking'
                && event.method.toLowerCase() == 'reward') {
            const reward = {
                blockNumber: blockNumber,
                timestamp: parseInt(timestamp.toString()),
                targetStashAddress: event.data[0].toString(),
                amount: event.data[1].toString()
            };
            rewards.push(reward);
        }
    }
    return rewards;
}
}