"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scheduler = void 0;
const cron_1 = require("cron");
const oneKvData_1 = require("./oneKvData");
const KUSAMA_DECIMAL = 1000000000000;
class Scheduler {
    constructor(chainData, db, cacheData) {
        this.chainData = chainData;
        this.cacheData = cacheData;
        this.db = db;
        this.isCaching = false;
        this.oneKvHandler = new oneKvData_1.OneKvHandler(this.chainData);
    }
    start() {
        const job = new cron_1.CronJob('30 */1 * * *', () => __awaiter(this, void 0, void 0, function* () {
            if (this.isCaching) {
                return;
            }
            this.isCaching = true;
            try {
                console.log('Kusama scheduler starts');
                yield this.__updateActiveEra();
                // const validators = await this.chainData.getValidators();
                const oneKvSummary = yield this.oneKvHandler.getValidValidators();
                this.cacheData.update('onekv', oneKvSummary);
                const activeEra = yield this.chainData.getActiveEraIndex();
                const eraReward = yield this.chainData.getEraTotalReward(activeEra - 1);
                console.log('era reward: ' + eraReward);
                const validatorWaitingInfo = yield this.chainData.getValidatorWaitingInfo();
                console.log('Write to database');
                for (let i = 0; i < validatorWaitingInfo.validators.length; i++) {
                    const validator = validatorWaitingInfo.validators[i];
                    if (validator !== undefined && eraReward !== undefined) {
                        const eraValidatorCount = validatorWaitingInfo.validators.length;
                        this.__makeValidatorInfoOfEra(validator, eraReward, activeEra, 900);
                    }
                }
                console.log('Kusama scheduler ends');
            }
            catch (err) {
                console.log(err);
                console.log('schedule retrieving data error');
            }
            this.isCaching = false;
        }), null, true, 'America/Los_Angeles', null, true);
        job.start();
    }
    __updateActiveEra() {
        return __awaiter(this, void 0, void 0, function* () {
            const era = yield this.chainData.getActiveEraIndex();
            yield this.db.saveActiveEra(era);
        });
    }
    __makeValidatorInfoOfEra(validator, eraReward, era, validatorCount) {
        return __awaiter(this, void 0, void 0, function* () {
            const lastEraInfo = yield this.db.getValidatorStatusOfEra(validator === null || validator === void 0 ? void 0 : validator.accountId, era - 1);
            let latestCommission = 0;
            if (lastEraInfo !== undefined) {
                if (lastEraInfo.validator !== undefined && lastEraInfo.validator !== null) {
                    if (lastEraInfo.validator.info !== undefined) {
                        latestCommission = lastEraInfo.validator.info[0].commission;
                    }
                }
            }
            let commissionChanged = 0;
            if (latestCommission != validator.prefs.commission) {
                console.log(latestCommission, validator.prefs.commission);
                if (validator.prefs.commission > latestCommission) {
                    console.log('commission up');
                    commissionChanged = 1;
                }
                else if (validator.prefs.commission < latestCommission) {
                    console.log('commission down');
                    commissionChanged = 2;
                }
                else {
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
            yield this.db.saveValidatorNominationData(validator.accountId, data);
        });
    }
}
exports.Scheduler = Scheduler;
