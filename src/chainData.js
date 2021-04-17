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
exports.ChainData = void 0;
const api_1 = require("@polkadot/api");
const types_1 = require("./types");
const KUSAMA_APPROX_ERA_LENGTH_IN_BLOCKS = 3600;
class ChainData {
    constructor(url) {
        this.connect = () => __awaiter(this, void 0, void 0, function* () {
            this.api = yield api_1.ApiPromise.create({
                provider: new api_1.WsProvider(this.url, 1000),
            });
        });
        this.getActiveEraIndex = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const activeEra = yield ((_a = this.api) === null || _a === void 0 ? void 0 : _a.query.staking.activeEra());
            if (activeEra !== undefined) {
                if (activeEra.isNone) {
                    console.log(`NO ACTIVE ERA: ${activeEra.toString()}`);
                    throw new Error('active era not found');
                }
                return activeEra.unwrap().index.toNumber();
            }
            else {
                throw new Error('active era not found');
            }
        });
        this.findEraBlockHash = (era) => __awaiter(this, void 0, void 0, function* () {
            var _b, _c, _d;
            const activeEra = yield this.getActiveEraIndex();
            // console.log(`activeEraIndex = ${activeEraIndex}`);
            if (era > activeEra) {
                throw new Error("It is a future era");
            }
            const latestBlock = yield ((_b = this.api) === null || _b === void 0 ? void 0 : _b.rpc.chain.getBlock());
            if (latestBlock === undefined) {
                throw new Error('Failed to get the latest block hash');
            }
            if (era === activeEra) {
                return latestBlock.block.header.hash.toString();
            }
            const diff = activeEra - era;
            const approxBlocksAgo = diff * KUSAMA_APPROX_ERA_LENGTH_IN_BLOCKS;
            let testBlockNumber = latestBlock.block.header.number.toNumber() - approxBlocksAgo;
            while (true) {
                const blockHash = yield ((_c = this.api) === null || _c === void 0 ? void 0 : _c.rpc.chain.getBlockHash(testBlockNumber));
                if (blockHash === undefined) {
                    throw new Error('Failed to get the block hash');
                }
                const testEra = yield ((_d = this.api) === null || _d === void 0 ? void 0 : _d.query.staking.activeEra.at(blockHash));
                if (testEra === undefined) {
                    throw new Error(`Failed to get the active era @ ${blockHash}`);
                }
                const testIndex = testEra.unwrap().index.toNumber();
                if (era == testIndex) {
                    return blockHash.toString();
                }
                if (testIndex > era) {
                    testBlockNumber = testBlockNumber + 25;
                }
                if (testIndex < era) {
                    testBlockNumber = testBlockNumber - 25;
                }
            }
        });
        this.getValidatorsByEraBlockHash = (eraBlockHash) => __awaiter(this, void 0, void 0, function* () {
            var _e;
            const validators = yield ((_e = this.api) === null || _e === void 0 ? void 0 : _e.query.session.validators.at(eraBlockHash));
            return validators;
        });
        this.getEraTotalReward = (era) => __awaiter(this, void 0, void 0, function* () {
            var _f;
            const totalReward = yield ((_f = this.api) === null || _f === void 0 ? void 0 : _f.query.staking.erasValidatorReward(era));
            return totalReward === null || totalReward === void 0 ? void 0 : totalReward.toString();
        });
        this.getValidators = () => __awaiter(this, void 0, void 0, function* () {
            // retrive active validators
            try {
                const activeEra = yield this.getActiveEraIndex();
                const blockHash = yield this.findEraBlockHash(activeEra);
                const validators = yield this.getValidatorsByEraBlockHash(blockHash);
                if (validators !== undefined) {
                    const nValidators = validators.length;
                    const output = [];
                    for (let i = 0; i < nValidators; i++) {
                        const id = validators[i].toString();
                        output.push(id);
                    }
                    return {
                        activeEra: activeEra,
                        activeStash: output,
                    };
                }
            }
            catch (err) {
                throw new Error(err);
            }
        });
        this.getValidatorWaitingInfo = () => __awaiter(this, void 0, void 0, function* () {
            var _g, _h, _j;
            const activeEra = yield this.getActiveEraIndex();
            const blockHash = yield this.findEraBlockHash(activeEra);
            let validators = [];
            let intentions = [];
            let [validatorAddresses, waitingInfo, nominators,] = yield Promise.all([
                (_g = this.api) === null || _g === void 0 ? void 0 : _g.query.session.validators(),
                (_h = this.api) === null || _h === void 0 ? void 0 : _h.derive.staking.waitingInfo(),
                (_j = this.api) === null || _j === void 0 ? void 0 : _j.query.staking.nominators.entries(),
            ]);
            if (validatorAddresses === undefined || waitingInfo === undefined || nominators === undefined) {
                throw new Error('Failed to get chain data');
            }
            validators = yield Promise.all(validatorAddresses.map((authorityId) => {
                var _a;
                return (_a = this.api) === null || _a === void 0 ? void 0 : _a.derive.staking.query(authorityId, {
                    withDestination: false,
                    withExposure: true,
                    withLedger: true,
                    withNominations: true,
                    withPrefs: true,
                }).then((validator) => {
                    return new types_1.Validator(authorityId.toString(), validator.exposure, validator.stakingLedger, validator.validatorPrefs);
                });
            }));
            validators = yield Promise.all(validators.map((validator) => {
                var _a;
                if (validator !== undefined) {
                    if (validator.accountId !== undefined) {
                        (_a = this.api) === null || _a === void 0 ? void 0 : _a.derive.accounts.info(validator.accountId).then(({ identity }) => {
                            const _identity = new types_1.Identity(validator.accountId.toString());
                            _identity.display = identity.display;
                            _identity.displayParent = identity.displayParent;
                            validator.identity = _identity;
                            validator.totalNominators = 0;
                            validator.activeNominators = validator.exposure.others.length;
                            return validator;
                        });
                    }
                }
                return validator;
            }));
            intentions = yield Promise.all(waitingInfo.info.map((intention) => {
                var _a;
                return (_a = this.api) === null || _a === void 0 ? void 0 : _a.derive.accounts.info(intention.accountId).then(({ identity }) => {
                    const _identity = new types_1.Identity(intention.accountId.toString());
                    _identity.display = identity.display;
                    _identity.displayParent = identity.displayParent;
                    const validator = new types_1.Validator(intention.accountId.toString(), intention.exposure, intention.stakingLedger, intention.validatorPrefs);
                    validator.identity = _identity;
                    validator.totalNominators = 0;
                    validator.activeNominators = 0;
                    return validator;
                });
            }));
            validators = validators.concat(intentions);
            let balancedNominators = yield Promise.all(nominators.map((nominator) => {
                var _a, _b;
                return (_a = this.api) === null || _a === void 0 ? void 0 : _a.derive.balances.all((_b = nominator[0].toHuman()) === null || _b === void 0 ? void 0 : _b.toString()).then((balance) => {
                    var _a;
                    const _balance = new types_1.Balance(balance.freeBalance.toBigInt(), balance.lockedBalance.toBigInt());
                    const targets = [];
                    nominator[1].unwrap().targets.forEach((target) => {
                        targets.push(target.toString());
                    });
                    return new types_1.BalancedNominator((_a = nominator[0].toHuman()) === null || _a === void 0 ? void 0 : _a.toString(), targets, _balance);
                });
            }));
            balancedNominators.forEach(nominator => {
                nominator === null || nominator === void 0 ? void 0 : nominator.targets.forEach(target => {
                    validators.forEach(validator => {
                        if (target === (validator === null || validator === void 0 ? void 0 : validator.accountId)) {
                            validator.nominators.push(nominator);
                            validator.totalNominators++;
                        }
                    });
                });
            });
            return {
                validators: validators,
                balancedNominators: balancedNominators
            };
        });
        this.url = url;
    }
    getNominators() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const nominators = yield ((_a = this.api) === null || _a === void 0 ? void 0 : _a.query.staking.nominators.entries());
            if (nominators === undefined) {
                throw new Error('Failed to get nominator data from chain');
            }
            let balancedNominators = yield Promise.all(nominators.map((nominator) => {
                var _a, _b;
                return (_a = this.api) === null || _a === void 0 ? void 0 : _a.derive.balances.all((_b = nominator[0].toHuman()) === null || _b === void 0 ? void 0 : _b.toString()).then((balance) => {
                    var _a;
                    const _balance = new types_1.Balance(balance.freeBalance.toBigInt(), balance.lockedBalance.toBigInt());
                    const targets = [];
                    nominator[1].unwrap().targets.forEach((target) => {
                        targets.push(target.toString());
                    });
                    return new types_1.BalancedNominator((_a = nominator[0].toHuman()) === null || _a === void 0 ? void 0 : _a.toString(), targets, _balance);
                });
            }));
            return balancedNominators;
        });
    }
}
exports.ChainData = ChainData;
