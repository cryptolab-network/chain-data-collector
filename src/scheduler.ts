import { ChainData } from "./chainData";
import { Cache } from './cacheData';
import { OneKvSummary } from './oneKvData';
import { DatabaseHandler } from "./db/database";
import { CronJob } from 'cron';
import { BalancedNominator, Validator } from "./types";
import { OneKvHandler } from "./oneKvData";

const KUSAMA_DECIMAL = 1000000000000;

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
    this.oneKvHandler= new OneKvHandler(this.chainData);
  }

  start() {
    const job = new CronJob('30 */1 * * *', async () => {
      if(this.isCaching) {
        return;
      }
      this.isCaching = true;
      try {
        console.log('Kusama scheduler starts');
        await this.__updateActiveEra();
        // const validators = await this.chainData.getValidators();
        const oneKvSummary = await this.oneKvHandler.getValidValidators();
        this.cacheData.update<OneKvSummary>('onekv', oneKvSummary);
        const activeEra = await this.chainData.getActiveEraIndex();
        const eraReward = await this.chainData.getEraTotalReward(activeEra - 1);
        console.log('era reward: ' + eraReward);
        const validatorWaitingInfo = await this.chainData.getValidatorWaitingInfo();
        console.log('Write to database');
        for(let i = 0; i < validatorWaitingInfo.validators.length; i++) {
          const validator = validatorWaitingInfo.validators[i];
          if(validator !== undefined && eraReward !== undefined) {
            const eraValidatorCount = validatorWaitingInfo.validators.length;
            this.__makeValidatorInfoOfEra(validator, eraReward, activeEra, 900);
          }
        }
        console.log('Kusama scheduler ends');
      } catch (err){
        console.log(err);
        console.log('schedule retrieving data error');
      }
      this.isCaching = false;
    }, null, true, 'America/Los_Angeles', null, true);
    job.start();
  }

  async __updateActiveEra() {
    const era = await this.chainData.getActiveEraIndex();
    await this.db.saveActiveEra(era);
  }

  async __makeValidatorInfoOfEra(validator: Validator, eraReward: string,
    era: number, validatorCount: number) {
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
    if(latestCommission != validator.prefs.commission) {
      console.log(latestCommission, validator.prefs.commission);
      if(validator.prefs.commission > latestCommission) {
        console.log('commission up');
        commissionChanged = 1;
      } else if(validator.prefs.commission < latestCommission) {
        console.log('commission down');
        commissionChanged = 2;
      } else {
        commissionChanged = 0;
      }
    }
    const apy = validator.apy(BigInt(KUSAMA_DECIMAL), BigInt(eraReward), validatorCount);
    const data = {
      era: era,
      exposure: validator.exposure,
      commission: validator.prefs.commissionPct(),
      apy: apy,
      identity: validator.identity,
      nominators: validator.nominators,
      commissionChanged: commissionChanged,
    };
    await this.db.saveValidatorNominationData(validator.accountId, data);
  }
}
