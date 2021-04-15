import { ChainData } from "./chainData";
import { DatabaseHandler } from "./db/database";
import { CronJob } from 'cron';
import { BalancedNominator, Validator } from "./types";

const KUSAMA_DECIMAL = 1000000000000;

export class Scheduler {
  chainData: ChainData
  db: DatabaseHandler
  isCaching: boolean
  constructor(chainData: ChainData, db: DatabaseHandler) {
    this.chainData = chainData;
    this.db = db;
    this.isCaching = false;
  }

  start() {
    const job = new CronJob('30 */1 * * *', async () => {
      if(this.isCaching) {
        return;
      }
      this.isCaching = true;
      try {
        console.log('Kusama scheduler starts');
        // const validators = await this.chainData.getValidators();
        const activeEra = await this.chainData.getActiveEraIndex();
        const eraReward = await this.chainData.getEraTotalReward(activeEra - 1);
        const validatorWaitingInfo = await this.chainData.getValidatorWaitingInfo();
        console.log('Write to database');
        for(let i = 0; i < validatorWaitingInfo.validators.length; i++) {
          const validator = validatorWaitingInfo.validators[i];
          if(validator !== undefined && eraReward !== undefined) {
            const eraValidatorCount = validatorWaitingInfo.validators.length;
            this.__makeValidatorInfoOfEra(validator, eraReward, activeEra, eraValidatorCount);
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

  async __makeValidatorInfoOfEra(validator: Validator, eraReward: string,
    era: number, validatorCount: number) {
    const apy = validator.apy(BigInt(KUSAMA_DECIMAL), BigInt(eraReward), validatorCount);
    const data = {
      era: era,
      exposure: validator.exposure,
      commission: validator.prefs.commissionPct(),
      apy: apy,
      identity: validator.identity,
      nominators: validator.nominators,
      commissionChanged: 0,
    };
    await this.db.saveValidatorNominationData(validator.accountId, data);
  }
}
