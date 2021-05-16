import { ChainData } from "./chainData";
import { Cache } from './cacheData';
import { OneKvNominatorSummary, OneKvSummary } from './oneKvData';
import { DatabaseHandler } from "./db/database";
import { CronJob } from 'cron';
import { BalancedNominator, Validator } from "./types";
import { OneKvHandler } from "./oneKvData";
import { RewardCalc } from "./rewardCalc";
const keys = require('../config/keys');

const POLKADOT_DECIMAL = 10000000000;

let nominatorCache = {};

export class Scheduler {
  chainData: ChainData
  cacheData: Cache
  db: DatabaseHandler
  isCaching: boolean
  oneKvHandler: OneKvHandler
  constructor(chainData: ChainData, db: DatabaseHandler, cacheData: Cache) {
    this.chainData = chainData;
    this.cacheData = cacheData;
    this.db = db;
    this.isCaching = false;
    this.oneKvHandler= new OneKvHandler(this.chainData, this.cacheData, this.db, keys.API_1KV_POLKADOT);
  }

  start() {
    const calc = new RewardCalc(this.chainData, this.db, this.cacheData);
    const rewardCalcJob = new CronJob('0 0 * * *', async () => {
      console.log('Polkadot Reward Calc starts');
      await calc.calc(BigInt(POLKADOT_DECIMAL));
      console.log('Polkadot Reward Calc ends');
    }, null, true, 'America/Los_Angeles', null, true);
    rewardCalcJob.start();

    const job = new CronJob('*/15 * * * *', async () => {
      if(this.isCaching) {
        return;
      }
      this.isCaching = true;
      try {
        console.log('Polkadot scheduler starts');
        nominatorCache = {};
        await this.updateActiveEra();
        const activeEra = await this.chainData.getActiveEraIndex();
        const eraReward = await this.chainData.getEraTotalReward(activeEra - 1);
        const validatorCount = await this.chainData.getCurrentValidatorCount();
        console.log('era reward: ' + eraReward);
        const validatorWaitingInfo = await this.chainData.getValidatorWaitingInfo();
        console.log('Write to database');
        for(let i = 0; i < validatorWaitingInfo.validators.length; i++) {
          const validator = validatorWaitingInfo.validators[i];
          if(validator !== undefined && eraReward !== undefined) {
            await this.makeValidatorInfoOfEra(validator, eraReward, activeEra, validatorCount);
          }
        }
        this.cacheData.update('validDetailAll', { 
          valid: validatorWaitingInfo.validators.map(v => {
            if(v !== undefined) {
              return v.exportString();
            }
          }) 
        });
        const nominators = await this.chainData.getNominators();
        this.cacheData.update('nominators', nominators.map((n)=>{
          return n?.exportString();
        }));
        await this.cacheOneKVInfo(validatorWaitingInfo.validators);
        console.log('Polkadot scheduler ends');
      } catch (err){
        console.log(err);
        console.log('schedule retrieving data error');
      }
      this.isCaching = false;
    }, null, true, 'America/Los_Angeles', null, true);
    job.start();
  }

  private async cacheOneKVInfo(validators: (Validator | undefined)[]) {
    const oneKvSummary = await this.oneKvHandler.getValidValidators(validators);
    this.cacheData.update<any>('onekv', oneKvSummary.toJSON());
    const oneKvNominators = await this.oneKvHandler.getOneKvNominators();
    this.cacheData.update<OneKvNominatorSummary>('oneKvNominators', oneKvNominators);
  }

  private async updateActiveEra() {
    const era = await this.chainData.getActiveEraIndex();
    await this.db.saveActiveEra(era);
  }

  private async makeValidatorInfoOfEra(validator: Validator, eraReward: string,
    era: number, validatorCount: number) {
    const stakerPoint = await this.chainData.getStakerPoints(validator.accountId);
    const activeEras = stakerPoint?.filter((point)=>{
      return point.points.toNumber() > 0;
    });
    const unclaimedEras = activeEras?.filter((point) => !validator.stakingLedger.claimedRewards.includes(point.era));
    const lastEraInfo = await this.db.getValidatorStatusOfEra(validator?.accountId!, era - 1);
    let latestCommission = 0;
    if(lastEraInfo !== undefined) {
      if(lastEraInfo.validator !== undefined && lastEraInfo.validator !== null) {
        if(lastEraInfo.validator.info !== undefined) {
          latestCommission = lastEraInfo.validator.info![0].commission;
        }
      }
    }
    let commissionChanged = 0;
    if(latestCommission != validator.prefs.commissionPct()) {
      if(validator.prefs.commissionPct() > latestCommission) {
        commissionChanged = 1;
      } else if(validator.prefs.commissionPct() < latestCommission) {
        commissionChanged = 2;
      } else {
        commissionChanged = 0;
      }
    }
    const apy = validator.apy(BigInt(POLKADOT_DECIMAL), BigInt(eraReward), validatorCount, 1);
    const data = {
      era: era,
      exposure: validator.exposure,
      commission: validator.prefs.commissionPct(),
      apy: apy,
      identity: validator.identity,
      nominators: validator.nominators.map((n)=>{
        return n.address;
      }),
      commissionChanged: commissionChanged,
    };
    this.db.saveValidatorUnclaimedEras(validator.accountId, unclaimedEras?.map((era)=>{
      return era.era.toNumber();
    })!);
    await this.saveNominators(validator, data, era);
  }

  private async saveNominators(validator: Validator, data: { era: number; exposure: import("e:/git/chain-data-collector/src/types").Exposure; commission: number; apy: number; identity: import("e:/git/chain-data-collector/src/types").Identity | undefined; nominators: string[]; commissionChanged: number; }, era: number) {
    await this.db.saveValidatorNominationData(validator.accountId, data);
    for (let i = 0; i < validator.nominators.length; i++) {
      (nominatorCache as any)[validator.nominators[i].address] = validator.nominators[i];
    }

    let i = 1;
    let tmp = [];
    for (const address in nominatorCache) {
      tmp.push((nominatorCache as any)[address]);
      if (i % 500 === 0) {
        await this.db.saveNominators(tmp, era);
        tmp = [];
      }
      i++;
    }
    if (tmp.length > 0) {
      await this.db.saveNominators(tmp, era);
    }
  }
}
