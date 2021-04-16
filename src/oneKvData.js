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
exports.OneKvHandler = exports.OneKvSummary = void 0;
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
    }
    toJSON() {
        return {
            aggregate: this.aggregate,
            rank: this.rank,
            oneKvNominated: this.oneKvNominated,
            unclaimedEra: this.unclaimedEra,
            inclusion: this.inclusion,
            name: this.name,
            stash: this.stash,
            identity: this.identity,
            nominatedAt: moment_1.default(this.nominatedAt).format(),
            elected: this.elected,
        };
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
class OneKvHandler {
    constructor(chaindata) {
        this.chaindata = chaindata;
    }
    getValidValidators() {
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
                valid = valid.map((candidate) => {
                    if ((activeValidators === null || activeValidators === void 0 ? void 0 : activeValidators.indexOf(candidate.stash)) !== -1) {
                        candidate.elected = true;
                        electedCount++;
                    }
                    else {
                        candidate.elected = false;
                    }
                    return candidate;
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
