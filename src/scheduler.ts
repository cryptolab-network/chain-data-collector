import { ChainData } from "./chainData";
import { Cache } from './cacheRedis';
import { OneKvNominatorSummary } from './oneKvData';
import { DatabaseHandler } from "./db/database";
import { CronJob } from 'cron';
import { Validator, StakerPoint, NominatorSlash, BalancedNominator, ValidatorCache, ValidatorUnclaimedEras, CommissionChanged, IndividualExposure, NominationRecordsDBSchema } from "./types";
import { OneKvHandler } from "./oneKvData";
import { RewardCalc } from "./rewardCalc";
import { logger } from './logger';
import { keys } from './config/keys';

let DECIMALS = 1000000000000;

let nominatorCache = new Map<string, BalancedNominator>();
let validatorCache = new Map<string, ValidatorCache>();
let unclaimedEraCache = new Map<string, ValidatorUnclaimedEras>();

export class Scheduler {
  chainData: ChainData
  cacheData: Cache
  db: DatabaseHandler
  userDb: DatabaseHandler
  isCaching: boolean
  oneKvHandler: OneKvHandler | undefined
  name: string
  constructor(name: string, chainData: ChainData, db: DatabaseHandler, userDb: DatabaseHandler, cacheData: Cache) {
    this.chainData = chainData;
    this.cacheData = cacheData;
    this.db = db;
    this.userDb = userDb;
    this.isCaching = false;
    if (name === 'POLKADOT') {
      this.oneKvHandler = new OneKvHandler(this.chainData, this.cacheData, this.db, keys.API_1KV_POLKADOT);
      DECIMALS = 100000000000000;
    } else if (name === 'KUSAMA') {
      this.oneKvHandler = new OneKvHandler(this.chainData, this.cacheData, this.db, keys.API_1KV_KUSAMA);
      DECIMALS = 1000000000000;
    } else {
      this.oneKvHandler = undefined;
    }
    this.name = name;
  }

  start(): void {
    if (this.name === 'KUSAMA') {
      this.rewardCalcScheduler('0 2,8,14,20 * * *');
      this.fetchDataScheduler('*/20 * * * *');
    } else {
      this.rewardCalcScheduler('0 0 * * *');
      this.fetchDataScheduler('*/30 * * * *');
    }
  }

  private async rewardCalcScheduler(schedule: string) {
    const calc = new RewardCalc(this.chainData, this.db, this.cacheData);
    const rewardCalcJob = new CronJob(schedule, async () => {
      logger.info(`${this.name} Reward Calc starts`);
      await calc.calc(BigInt(DECIMALS));
      logger.info(`${this.name} Reward Calc ends`);
    }, null, true, 'America/Los_Angeles', null, true);
    rewardCalcJob.start();
  }

  private async fetchDataScheduler(schedule: string) {
    const job = new CronJob(schedule, async () => {
      if (this.isCaching) {
        return;
      }
      this.isCaching = true;
      try {
        logger.info(`${this.name} scheduler starts`);
        const cryptoLabUsers = await this.userDb.getAllNominationRecords();
        console.time(`[${this.name}] Update active era`);
        await this.updateActiveEra();
        console.timeEnd(`[${this.name}] Update active era`);

        console.time(`[${this.name}] Retrieving chain data`);
        const activeEra = await this.chainData.getActiveEraIndex();
        const eraReward = await this.chainData.getEraTotalReward(activeEra - 1);
        const validatorCount = await this.chainData.getCurrentValidatorCount();
        logger.info('era reward: ' + eraReward);
        const validatorWaitingInfo = await this.chainData.getValidatorWaitingInfo();
        console.timeEnd(`[${this.name}] Retrieving chain data`);
        console.time(`[${this.name}] Write Validator Data`);
        nominatorCache = new Map<string, BalancedNominator>();
        validatorCache = new Map<string, ValidatorCache>();
        unclaimedEraCache = new Map<string, ValidatorUnclaimedEras>();
        const nominatorThreshold = this.chainData.getNominatorThreshold();
        for (let i = 0; i < validatorWaitingInfo.validators.length; i++) {
          const validator = validatorWaitingInfo.validators[i];
          if (validator !== undefined && eraReward !== undefined) {
            await this.makeValidatorInfoOfEra(validator, eraReward, activeEra, validatorCount, nominatorThreshold, cryptoLabUsers);
          }
        }
        await this.updateValidators(cryptoLabUsers);
        await this.updateUnclaimedEraInfo();
        console.timeEnd(`[${this.name}] Write Validator Data`);
        console.time(`[${this.name}] Write Nominator Data`);
        await this.updateNominators();
        console.timeEnd(`[${this.name}] Write Nominator Data`);
        console.time(`[${this.name}] Update Cache Data`);
        this.cacheData.update('validDetailAll', {
          valid: validatorWaitingInfo.validators.map(v => {
            if (v !== undefined) {
              return v.toObject();
            }
          })
        });
        const nominators = validatorWaitingInfo.balancedNominators;
        this.cacheData.update('nominators', nominators.map((n) => {
          return n?.toObject();
        }));
        logger.debug('length ' + validatorWaitingInfo.validators.length);
        await this.cacheOneKVInfo(validatorWaitingInfo.validators);
        console.timeEnd(`[${this.name}] Update Cache Data`);
        await this.checkAllInactive(validatorWaitingInfo.validators, activeEra, cryptoLabUsers);
        logger.info(`[${this.name}] scheduler ends`);
      } catch (err: any) {
        logger.error(err);
        logger.error('schedule retrieving data error');
      }
      this.isCaching = false;
    }, null, true, 'America/Los_Angeles', null, true);
    job.start();
  }

  private async checkAllInactive(validators: (Validator | undefined)[], era: number, cryptoLabUsers: NominationRecordsDBSchema[] ) {
    const validatorMap = validators.reduce((acc, v) => {
      if (v !== undefined) {
        acc.set(v.accountId, v);
      }
      return acc;
    }, new Map<string, Validator>());
    const records = await this.userDb.getAllNominationRecords()
    records.forEach(async (nr) => {
      let allInactive = true;
      nr.validators.forEach((v) => {
        const validator = validatorMap.get(v);
        if (validator?.exposure.total !== BigInt(0)) {
          allInactive = false;
        }
      });
      if (allInactive === true) {
        // write event to db
        let writeToUserMapping = false;
        if (cryptoLabUsers.findIndex((v) => v.stash === nr.stash) >= 0) {
          writeToUserMapping = true;
        }
        await this.db.saveAllInactiveEvent(nr.stash, era, writeToUserMapping);
      }
    });
  }

  private async updateNominators() {
    let tmp = new Array<BalancedNominator>();
    for (const [, n] of nominatorCache) {
      if (n) {
        try {
          const cached = await this.cacheData.fetchNominators(n.address);
          if (!cached.isEqual(n)) {
            tmp.push(n);
            await this.cacheData.fetchNominators(n.address);
          }
        } catch (e) {
          tmp.push(n);
          await this.cacheData.updateNominators(n.address, n);
        }
        if (tmp.length >= 500) {
          logger.debug(`write ${tmp.length} rows to nominator db`);
          await this.db.saveNominators(tmp);
          tmp = new Array<BalancedNominator>();
        }
      }
    }
    if (tmp.length > 0) {
      logger.debug(`write ${tmp.length} rows to nominator db`);
      await this.db.saveNominators(tmp);
    }
  }

  private async updateUnclaimedEraInfo() {
    let tmp = new Array<ValidatorUnclaimedEras>();
    for (const [, u] of unclaimedEraCache) {
      if (u) {
        try {
          const cached = await this.cacheData.fetchUnclaimedEras(u.id);
          if (!cached.isEqual(u)) {
            tmp.push(u);
            await this.cacheData.fetchUnclaimedEras(u.id);
          }
        } catch (e) {
          tmp.push(u);
          await this.cacheData.updateUnclaimedEras(u.id, u);
        }
      }
      if (tmp.length >= 100) {
        logger.debug(`write ${tmp.length} rows to unclaimed era db`);
        await this.db.saveMultipleValidatorUnclaimedEras(tmp);
        tmp = new Array<ValidatorUnclaimedEras>();
      }
    }
    if (tmp.length > 0) {
      logger.debug(`write ${tmp.length} rows to unclaimed era db`);
      await this.db.saveMultipleValidatorUnclaimedEras(tmp);
    }
  }

  private async updateValidators(cryptoLabUsers: NominationRecordsDBSchema[]): Promise<void> {
    let tmp = new Array<ValidatorCache>();
    for (const [, v] of validatorCache) {
      if (v) {
        // compare with cache first to access less DB
        try {
          const cached = await this.cacheData.fetchValidatorCache(v.id);
          if (!cached.isEqual(v)) {
            tmp.push(v);
            await this.cacheData.updateValidatorCache(v.id, v);
          }
        } catch (e) {
          tmp.push(v);
          await this.cacheData.updateValidatorCache(v.id, v);
        }
        if (tmp.length >= 100) {
          logger.debug(`write ${tmp.length} rows to validator db`);
          await this.db.saveMultipleValidatorNominationData(tmp, cryptoLabUsers);
          tmp = new Array<ValidatorCache>();
        }
      }
    }
    if (tmp.length > 0) {
      logger.debug(`write ${tmp.length} rows to validator db`);
      await this.db.saveMultipleValidatorNominationData(tmp, cryptoLabUsers);
    }
  }

  private async cacheOneKVInfo(validators: (Validator | undefined)[]) {
    if (this.oneKvHandler !== undefined) {
      const oneKvSummary = await this.oneKvHandler.getValidValidators(validators);
      this.cacheData.update<string>('onekv', oneKvSummary.toJSON());
      const oneKvNominators = await this.oneKvHandler.getOneKvNominators();
      this.cacheData.update<OneKvNominatorSummary>('oneKvNominators', oneKvNominators);
    }
  }

  private async updateActiveEra() {
    const era = await this.chainData.getActiveEraIndex();
    // eslint-disable-next-line
    try {
      const dbEra = await this.db.getActiveEra();
      if (era !== dbEra) {
        await this.updateHistoricalAPY();
      }
      await this.updateUnappliedSlashes(era);
    } catch(e: any) {
      logger.error(e);
    } finally {
      await this.db.saveActiveEra(era);
    }
  }

  private async makeValidatorInfoOfEra(validator: Validator, eraReward: string,
    era: number, validatorCount: number, nominatorThreshold: number, cryptoLabUsers: NominationRecordsDBSchema[]) {
    const stakerPoints = await this.chainData.getStakerPoints(validator.accountId);
    const activeEras = stakerPoints?.filter((point) => {
      return point.points.toNumber() > 0;
    });
    const unclaimedEras = activeEras?.filter((point) => !validator.stakingLedger.claimedRewards.includes(point.era));
    const lastEraInfo = await this.db.getValidatorStatusOfEra(validator.accountId, era - 1);
    let latestCommission = 0;
    let commissionChanged = new CommissionChanged(0, 0, 0);
    if (lastEraInfo !== undefined) {
      if (lastEraInfo !== undefined && lastEraInfo !== null) {
        if (lastEraInfo.info !== undefined) {
          latestCommission = lastEraInfo.info[0].commission;
        }
      }
      if (latestCommission != validator.prefs.commissionPct()) {
        if (validator.prefs.commissionPct() > latestCommission) {
          commissionChanged = new CommissionChanged(1, latestCommission, validator.prefs.commissionPct());
        } else if (validator.prefs.commissionPct() < latestCommission) {
          commissionChanged = new CommissionChanged(2, latestCommission, validator.prefs.commissionPct());
        } else {
          commissionChanged = new CommissionChanged(0, latestCommission, validator.prefs.commissionPct());
        }
      }
    }
    let erasPerDay = 1;
    if (this.name === 'KUSAMA') {
      erasPerDay = 4;
    }
    const apy = validator.apy(BigInt(DECIMALS), BigInt(eraReward), validatorCount, erasPerDay);
    const data = new ValidatorCache(validator.accountId, era, validator.exposure, validator.prefs.commissionPct(),
      apy, validator.identity, validator.nominators.map((n) => {
        return n.address;
      }), commissionChanged, stakerPoints.map((stakerPoint) => {
        return new StakerPoint(stakerPoint.era.toNumber(), stakerPoint.points.toNumber());
      }), validator.nominators.reduce((acc, n) => {
        acc += n.balance.lockedBalance;
        return acc;
      }, BigInt(0)), validator.selfStake, validator.prefs.blocked);
    validator.exposure.others.sort((a, b) => {
      if (a.value > b.value) {
        return -1;
      } else if (a.value < b.value) {
        return 1;
      }
      return 0;
    });
    if (validator.exposure.others.length > nominatorThreshold) {
      logger.debug('exposure over threshold: ' + validator.exposure.others.length);
      this.saveOverSubscribers(validator.accountId, era, validator.exposure.others, nominatorThreshold, cryptoLabUsers);
    }
    this.saveUnclaimedEras(validator.accountId, unclaimedEras?.map((era) => {
      return era.era.toNumber();
    }), era);
    this.saveValidatorNominationData(validator.accountId, data);
    this.saveNominators(validator);
  }

  private async saveOverSubscribers(validator: string, currentEra: number, nominators: IndividualExposure[], threshold: number, cryptoLabUsers: NominationRecordsDBSchema[]) {
    let writeToUserMapping = false;
    if (cryptoLabUsers.findIndex((v) => v.validators.findIndex((a) => a === validator) >= 0) >= 0) {
      writeToUserMapping = true;
    }
    await this.db.saveOverSubscribeEvent(validator, currentEra, nominators.reduce((acc: IndividualExposure[], n, i) => {
      if (i >= threshold) {
        acc.push(n);
      }
      return acc;
    }, []), writeToUserMapping);
  }

  private async saveUnclaimedEras(validator: string, unclaimedEras: number[], currentEra: number) {
    unclaimedEraCache.set(validator, new ValidatorUnclaimedEras(validator, unclaimedEras));
    if (unclaimedEras.length > 10) {
      await this.db.saveStalePayoutEvents(validator, currentEra, unclaimedEras);
    }
  }

  private async saveValidatorNominationData(validator: string, data: ValidatorCache) {
    validatorCache.set(validator, data);
  }

  private saveNominators(validator: Validator) {
    for (let i = 0; i < validator.nominators.length; i++) {
      nominatorCache.set(validator.nominators[i].address, validator.nominators[i]);
    }
  }

  private async updateHistoricalAPY() {
    logger.info(`[${this.name}] Start update Validator APY`);
    // const validators = await this.db.getValidatorList();
    console.time(`[${this.name}] Update each validator's average apy`);
    const data = await this.db.getAllValidatorStatus();
    for (let i = 0; i < data.length; i++) {
      const info = data[i].info;
      let avgApy = 0;
      let sum = 0;
      let activeEras = 0;
      if (info) {
        const totalEras = info.length;
        if (totalEras > 84) {
          for (let j = totalEras - 85; j < totalEras - 1; j++) {
            if (info[j].exposure.total > 0) {
              sum += info[j].apy;
              activeEras++;
            }
          }
        } else {
          for (let j = 0; j < totalEras; j++) {
            if (info[j].exposure.total > 0) {
              sum += info[j].apy;
              activeEras++;
            }
          }
        }
      }
      if (activeEras > 0) {
        avgApy = sum / activeEras;
      } else {
        avgApy = 0;
      }
      await this.db.saveHistoricalApy(data[i].id, avgApy);
    }
    console.timeEnd(`[${this.name}] Update each validator's average apy`);
  }

  private async updateUnappliedSlashes(era: number) {
    console.time(`[${this.name}] Update Unapplied Slashes`);
    const slashes = await this.chainData.getUnappliedSlashOfEra(era);
    for (const slash of slashes) {
      await this.db.saveValidatorSlash(slash.address, slash);
      for (const other of slash.others) {
        const nominatorSlash = new NominatorSlash(other[0], era, other[1], slash.address);
        await this.db.saveNominatorSlash(other[0], nominatorSlash);
      }
    }
    console.timeEnd(`[${this.name}] Update Unapplied Slashes`);
  }
}
