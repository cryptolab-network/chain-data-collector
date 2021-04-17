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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OneKvHandler = exports.OneKvNominatorSummary = exports.OneKvNominatedInfoDetail = exports.OneKvSummary = void 0;
const axios_1 = __importDefault(require("axios"));
const moment_1 = __importDefault(require("moment"));
const keys = require('../config/keys');
const NODE_RPC_URL = keys.API_1KV_KUSAMA;
class OneKvSummary {
    constructor(activeEra, electedCount, valid) {
        this.activeEra = activeEra;
        this.validatorCount = valid.length;
        this.electedCount = electedCount;
        this.electionRate = (electedCount / valid.length),
            this.valid = valid;
    }
    toJSON() {
        return {
            activeEra: this.activeEra,
            validatorCount: this.validatorCount,
            electedCount: this.electedCount,
            electionRate: this.electionRate,
            valid: this.valid.map((v) => {
                var _a, _b;
                return {
                    aggregate: v.aggregate,
                    rank: v.rank,
                    oneKvNominated: v.oneKvNominated,
                    unclaimedEra: v.unclaimedEra,
                    inclusion: v.inclusion,
                    name: v.name,
                    stash: v.stash,
                    identity: v.identity,
                    nominatedAt: moment_1.default(v.nominatedAt).format(),
                    elected: v.elected,
                    activeNominators: v.activeNominators,
                    totalNominators: v.totalNominators,
                    stakingInfo: {
                        stakingLedger: (_a = v.detail) === null || _a === void 0 ? void 0 : _a.stakingLedger.exportString(),
                        validatorPrefs: (_b = v.detail) === null || _b === void 0 ? void 0 : _b.prefs,
                        stashId: v.stash,
                    }
                };
            }),
        };
    }
}
exports.OneKvSummary = OneKvSummary;
class OneKvValidatorInfo {
    constructor(aggregate, rank, unclaimedEra, inclusion, name, stash, identity, nominatedAt) {
        this.aggregate = aggregate;
        this.rank = rank;
        this.oneKvNominated = false;
        this.unclaimedEra = unclaimedEra;
        this.inclusion = inclusion;
        this.name = name;
        this.stash = stash;
        this.identity = identity;
        this.nominatedAt = nominatedAt;
        this.elected = false;
        this.activeNominators = 0;
        this.totalNominators = 0;
    }
}
class Aggregate {
    constructor(total, aggregate, inclusion, discovered, nominated, rank, unclaimed, bonded, faults, offline, randomness, updated) {
        this.total = total;
        this.aggregate = aggregate,
            this.inclusion = inclusion,
            this.discovered = discovered,
            this.nominated = nominated,
            this.rank = rank,
            this.unclaimed = unclaimed,
            this.bonded = bonded,
            this.faults = faults,
            this.offline = offline,
            this.randomness = randomness,
            this.updated = updated;
    }
}
class Identity {
    constructor(name, verified) {
        this.name = name;
        this.verified = verified;
    }
}
class OneKvNominatorInfo {
    constructor(current, lastNomination, address) {
        this.current = current;
        this.lastNomination = lastNomination;
        this.address = address;
    }
    toJSON() {
        return {
            current: this.current,
            address: this.address,
            lastNomination: moment_1.default(this.lastNomination).format(),
        };
    }
}
class OneKvNominatedInfoDetail {
    constructor(stash, name, elected) {
        this.stash = stash;
        this.name = name;
        this.elected = elected;
    }
}
exports.OneKvNominatedInfoDetail = OneKvNominatedInfoDetail;
class OneKvNominatorSummary {
    constructor(activeEra, nominators) {
        this.activeEra = activeEra;
        this.nominators = nominators;
    }
}
exports.OneKvNominatorSummary = OneKvNominatorSummary;
class OneKvHandler {
    constructor(chaindata, cachedata, db) {
        this.chaindata = chaindata;
        this.cachedata = cachedata;
        this.db = db;
    }
    getOneKvNominators() {
        return __awaiter(this, void 0, void 0, function* () {
            let res = yield axios_1.default.get(`${NODE_RPC_URL}/nominators`);
            if (res.status !== 200) {
                console.log(`no data`);
                throw new Error('Failed to fetch 1kv nominators.');
            }
            let nominators = res.data;
            let validCandidates = yield this.cachedata.fetch('onekv').catch((err) => {
                console.error(err);
                throw new Error(err);
            });
            const activeEra = yield this.chaindata.getActiveEraIndex();
            nominators = nominators.map((nominator, index, array) => {
                const current = nominator.current.map((stash, index, array) => {
                    let candidate = validCandidates.valid.find((c, index, array) => {
                        return stash === c.stash;
                    });
                    if (candidate === undefined) {
                        return new OneKvNominatedInfoDetail(stash, '', false);
                    }
                    else {
                        return new OneKvNominatedInfoDetail(stash, candidate.name, candidate.elected);
                    }
                });
                return new OneKvNominatorInfo(current, nominator.lastNomination, nominator.address);
            });
            const summary = new OneKvNominatorSummary(activeEra, nominators);
            yield this.cachedata.update('onekvNominators', summary);
            return summary;
        });
    }
    getValidValidators(validators) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield axios_1.default.get(`${NODE_RPC_URL}/valid`);
            if (res.status !== 200) {
                console.log(`no data`);
                throw new Error('Failed to fetch 1kv validators.');
            }
            let valid = res.data;
            const eraValidatorInfo = yield this.chaindata.getValidators();
            if (eraValidatorInfo !== undefined) {
                const activeValidators = eraValidatorInfo.activeStash;
                const activeEra = eraValidatorInfo.activeEra;
                let electedCount = 0;
                const promises = valid.map((candidate) => __awaiter(this, void 0, void 0, function* () {
                    const validator = validators.find(v => (v === null || v === void 0 ? void 0 : v.accountId) === candidate.stash);
                    if (validator === undefined) {
                        console.log(`cannot find ${candidate.stash} in validator set`);
                        return;
                    }
                    candidate.detail = validator;
                    if ((activeValidators === null || activeValidators === void 0 ? void 0 : activeValidators.indexOf(candidate.stash)) !== -1) {
                        candidate.elected = true;
                        electedCount++;
                    }
                    else {
                        candidate.elected = false;
                    }
                    candidate.activeNominators = (validator === null || validator === void 0 ? void 0 : validator.activeNominators) || 0;
                    candidate.totalNominators = (validator === null || validator === void 0 ? void 0 : validator.totalNominators) || 0;
                    return candidate;
                }));
                let newValid = yield Promise.all(promises);
                valid = newValid.filter(function (v) {
                    return v !== undefined;
                });
                const oneKvSummary = new OneKvSummary(activeEra, electedCount, valid);
                return oneKvSummary;
            }
            else {
                throw new Error('Failed to fetch validators from the chain.');
            }
        });
    }
}
exports.OneKvHandler = OneKvHandler;
