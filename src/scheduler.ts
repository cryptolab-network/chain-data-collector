import { ChainData } from "./chainData";
import { Cache } from './cacheData';
import { OneKvNominatorSummary, OneKvSummary } from './oneKvData';
import { DatabaseHandler } from "./db/database";
import { CronJob } from 'cron';
import { BalancedNominator, Validator, Exposure, Identity } from "./types";
import { OneKvHandler } from "./oneKvData";
import { RewardCalc } from "./rewardCalc";
const keys = require('../config/keys');

const KUSAMA_DECIMAL = 1000000000000;

let nominatorCache = {};
let validatorCache = {};
let unclaimedEraCache = {};

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
    this.oneKvHandler= new OneKvHandler(this.chainData, this.cacheData, this.db, keys.API_1KV_KUSAMA);
  }

  start() {
    this.rewardCalcScheduler();
    this.fetchDataScheduler();
  }

  private async rewardCalcScheduler() {
    const calc = new RewardCalc(this.chainData, this.db, this.cacheData);
    const rewardCalcJob = new CronJob('0 2,8,14,20 * * *', async () => {
      console.log('Kusama Reward Calc starts');
      await calc.calc(BigInt(KUSAMA_DECIMAL));
      console.log('Kusama Reward Calc ends');
    }, null, true, 'America/Los_Angeles', null, true);
    rewardCalcJob.start();
  }

  private async fetchDataScheduler() {
    const job = new CronJob('*/20 * * * *', async () => {
      if(this.isCaching) {
        return;
      }
      this.isCaching = true;
      try {
        console.log('Kusama scheduler starts');
        console.time('[Kusama] Update active era');
        await this.updateActiveEra();
        console.timeEnd('[Kusama] Update active era');

        console.time('[Kusama] Retrieving chain data');
        const activeEra = await this.chainData.getActiveEraIndex();
        const eraReward = await this.chainData.getEraTotalReward(activeEra - 1);
        const validatorCount = await this.chainData.getCurrentValidatorCount();
        console.log('era reward: ' + eraReward);
        const validatorWaitingInfo = await this.chainData.getValidatorWaitingInfo();
        console.timeEnd('[Kusama] Retrieving chain data');
        console.time('[Kusama] Write Validator Data');
        nominatorCache = {};
        validatorCache = {};
        unclaimedEraCache = {};
        for(let i = 0; i < validatorWaitingInfo.validators.length; i++) {
          const validator = validatorWaitingInfo.validators[i];
          if(validator !== undefined && eraReward !== undefined) {
            await this.makeValidatorInfoOfEra(validator, eraReward, activeEra, validatorCount);
          }
        }
        let i = 1;
        let tmp = [];
        for (const address in validatorCache) {
          tmp.push((validatorCache as any)[address]);
          if (i % 100 === 0) {
            await this.db.saveMultipleValidatorNominationData(tmp, activeEra);
            tmp = [];
          }
          i++;
        }
        if (tmp.length > 0) {
          await this.db.saveMultipleValidatorNominationData(tmp, activeEra);
        }
        i = 1;
        tmp = [];
        for (const address in unclaimedEraCache) {
          tmp.push((unclaimedEraCache as any)[address]);
          if (i % 100 === 0) {
            await this.db.saveMultipleValidatorUnclaimedEras(tmp);
            tmp = [];
          }
          i++;
        }
        if (tmp.length > 0) {
          await this.db.saveMultipleValidatorUnclaimedEras(tmp);
        }
        console.timeEnd('[Kusama] Write Validator Data');
        console.time('[Kusama] Write Nominator Data');
        i = 1;
        tmp = [];
        for (const address in nominatorCache) {
          tmp.push((nominatorCache as any)[address]);
          if (i % 500 === 0) {
            await this.db.saveNominators(tmp, activeEra);
            tmp = [];
          }
          i++;
        }
        if (tmp.length > 0) {
          await this.db.saveNominators(tmp, activeEra);
        }
        console.timeEnd('[Kusama] Write Nominator Data');
        console.time('[Kusama] Update Cache Data');
        this.cacheData.update('validDetailAll', { 
          valid: validatorWaitingInfo.validators.map(v => {
            if(v !== undefined) {
              return v.exportString();
            }
          }) 
        });
        const nominators = validatorWaitingInfo.balancedNominators;
        this.cacheData.update('nominators', nominators.map((n)=>{
          return n?.exportString();
        }));
        console.log('length ' +　validatorWaitingInfo.validators.length);
        await this.cacheOneKVInfo(validatorWaitingInfo.validators);
        console.timeEnd('[Kusama] Update Cache Data');
        console.log('Kusama scheduler ends');
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
    // if(commissionChanged !== 0) {
    //   console.log('commission changed:' + commissionChanged  + ' from ' + latestCommission + " to " + validator.prefs.commissionPct());
    // }
    const apy = validator.apy(BigInt(KUSAMA_DECIMAL), BigInt(eraReward), validatorCount, 4);
    const data = {
      era: era,
      exposure: validator.exposure,
      commission: validator.prefs.commissionPct(),
      apy: apy,
      identity: validator.identity,
      nominators: validator.nominators.map((n)=>{
        return n.address;
      }),
      total: validator.nominators.reduce((acc, n)=>{
        acc += n.balance.lockedBalance;
        return acc;
      }, BigInt(0)),
      commissionChanged: commissionChanged,
      id: validator.accountId,
    };
    this.saveUnclaimedEras(validator.accountId, unclaimedEras?.map((era)=>{
      return era.era.toNumber();
    })!);
    this.saveValidatorNominationData(validator.accountId, data);
    this.saveNominators(validator, data, era);
  }

  private async saveUnclaimedEras(validator: string, unclaimedEras: number[]) {
    (unclaimedEraCache as any)[validator] = {
      eras: unclaimedEras,
      id: validator,
    };
  }

  private saveValidatorNominationData(validator: string, data: { era: number; exposure: Exposure; commission: number; apy: number; identity: Identity | undefined; nominators: string[]; commissionChanged: number; }) {
    (validatorCache as any)[validator] = data;
  }

  private saveNominators(validator: Validator, data: { era: number; exposure: Exposure; commission: number; apy: number; identity: Identity | undefined; nominators: string[]; commissionChanged: number; }, era: number) {
    for (let i = 0; i < validator.nominators.length; i++) {
      (nominatorCache as any)[validator.nominators[i].address] = validator.nominators[i];
    }
  }
}
