import { ChainData } from "./chainData";
import { DatabaseHandler } from "./db/database";
import { Cache } from './cacheData';
import { ValidatorEraReward, ValidatorTotalReward } from "./types";
const divide = require('divide-bigint');

export class RewardCalc {
  chainData: ChainData
  cacheData: Cache
  db: DatabaseHandler
  constructor(chainData: ChainData, db: DatabaseHandler, cacheData: Cache) {
    this.chainData = chainData;
    this.cacheData = cacheData;
    this.db = db;
  }

  async calc(decimals: bigint) {
    const latestFinishedEra = await this.chainData.getActiveEraIndex() - 1;
    const eraTotalReward = await this.chainData.getEraTotalReward(latestFinishedEra);
    const eraRewardDist = await this.chainData.getEraRewardDist(latestFinishedEra);
    eraRewardDist.individual.forEach((point, id)=>{
      const reward = (point / eraRewardDist.total) * divide(eraTotalReward, decimals);
      // console.log(id, point, eraRewardDist.total, eraTotalReward, reward);
      this.db.updateValidatorTotalReward(id, new ValidatorEraReward(latestFinishedEra, reward));
    });
  }
}