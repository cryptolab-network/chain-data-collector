import { ChainData } from "./chainData";
import { Cache } from './cacheData';
import { OneKvNominatorSummary, OneKvSummary } from './oneKvData';
import { DatabaseHandler } from "./db/database";
import { CronJob } from 'cron';
import { BalancedNominator, Validator, Exposure, Identity, StakerPoint } from "./types";
import { OneKvHandler } from "./oneKvData";
import { RewardCalc } from "./rewardCalc";
const keys = require('../config/keys');

const POLKADOT_DECIMAL = 10000000000;

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

    const job = new CronJob('*/30 * * * *', async () => {
      if(this.isCaching) {
        return;
      }
      this.isCaching = true;
      try {
        console.log('Polkadot scheduler starts');
        console.time('[Polkadot] Update active era');
        await this.updateActiveEra();
        console.timeEnd('[Polkadot] Update active era');

        console.time('[Polkadot] Retrieving chain data');
        const activeEra = await this.chainData.getActiveEraIndex();
        const eraReward = await this.chainData.getEraTotalReward(activeEra - 1);
        const validatorCount = await this.chainData.getCurrentValidatorCount();
        console.log('era reward: ' + eraReward);
        const validatorWaitingInfo = await this.chainData.getValidatorWaitingInfo();
        console.timeEnd('[Polkadot] Retrieving chain data');
        console.time('[Polkadot] Write Validator Data');
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
        console.timeEnd('[Polkadot] Write Validator Data');
        console.time('[Polkadot] Write Nominator Data');
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
        console.timeEnd('[Polkadot] Write Nominator Data');
        console.time('[Polkadot] Update Cache Data');
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
        await this.cacheOneKVInfo(validatorWaitingInfo.validators);
        console.timeEnd('[Polkadot] Update Cache Data');
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
    const dbEra = await this.db.getActiveEra();
    // if(era !== dbEra) {
      await this.updateHistoricalAPY();
    // }

    await this.db.saveActiveEra(era);
  }

  private async makeValidatorInfoOfEra(validator: Validator, eraReward: string,
    era: number, validatorCount: number) {
    const stakerPoints = await this.chainData.getStakerPoints(validator.accountId);
    const activeEras = stakerPoints?.filter((point)=>{
      return point.points.toNumber() > 0;
    });
    //console.log(JSON.stringify(stakerPoint[0]));
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
      total: validator.nominators.reduce((acc, n)=>{
        acc += n.balance.lockedBalance;
        return acc;
      }, BigInt(0)),
      commissionChanged: commissionChanged,
      id: validator.accountId,
      stakerPoints: stakerPoints.map((stakerPoint) => {
        return new StakerPoint(stakerPoint.era.toNumber(), stakerPoint.points.toNumber());
      }),
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

  private async saveValidatorNominationData(validator: string, data: { era: number; exposure: Exposure; commission: number;
    apy: number; identity: Identity | undefined; nominators: string[]; commissionChanged: number; stakerPoints: StakerPoint[]}) {
    (validatorCache as any)[validator] = data;
  }

  private async saveNominators(validator: Validator, data: { era: number; exposure: Exposure; commission: number; apy: number; identity: Identity | undefined; nominators: string[]; commissionChanged: number; }, era: number) {
    for (let i = 0; i < validator.nominators.length; i++) {
      (nominatorCache as any)[validator.nominators[i].address] = validator.nominators[i];
    }
  }

  private async updateHistoricalAPY() {
    console.log('[Polkadot] Start update Validator APY');
    const validators = await this.db.getValidatorList();
    console.time('[Polkadot] Update each validator\'s average apy');
    for(let i = 0; i < validators.length; i++) {
      const data = await this.db.getValidatorStatus(validators[i]);
      const info = data.objectData[0].info;
      const totalEras = info.length;
      let sum = 0;
      let avgApy = 0;
      let activeEras = 0;
      if(totalEras > 84) {
        for(let j = totalEras - 85; j < totalEras - 1; j++) {
          if(info[j].exposure.total > 0) {
            sum += info[j].apy;
            activeEras++;
          }
        }
      } else {
        for(let j = 0; j < totalEras; j++) {
          if(info[j].exposure.total > 0) {
            sum += info[j].apy;
            activeEras++;
          }
        }
      }
      if(activeEras > 0) {
        avgApy = sum / activeEras;
      } else {
        avgApy = 0;
      }
      // console.log('average APY for past ' + activeEras + ' eras of ' + data.objectData[0].id + ' is ' + avgApy);
      await this.db.saveHistoricalApy(data.objectData[0].id, avgApy);
    }
    console.timeEnd('[Polkadot] Update each validator\'s average apy');
  }
}
