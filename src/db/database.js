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
exports.DatabaseHandler = void 0;
const mongoose_1 = require("mongoose");
const types_1 = require("../types");
const schema_1 = require("./schema");
class DatabaseHandler {
    constructor() {
        this.__initSchema();
        mongoose_1.set('debug', true);
    }
    connect(name, pass, ip, port, dbName) {
        const self = this;
        let url = `mongodb://`;
        if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
            url = url + `${name}:${pass}@`;
        }
        url += `${ip}:${port}/${dbName}`;
        const db = new mongoose_1.Mongoose().createConnection(url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            poolSize: 10
        });
        this.ValidatorModel = db.model('Validator_' + dbName, schema_1.ValidatorSchema, 'validator');
        this.NominationModel = db.model('Nomination_' + dbName, schema_1.NominationSchema, 'nomination');
        this.ChainInfoModel = db.model('ChainInfo_' + dbName, schema_1.ChainInfoSchema, 'chainInfo');
        db.on('error', console.error.bind(console, 'connection error:'));
        db.once('open', function () {
            return __awaiter(this, void 0, void 0, function* () {
                console.log('DB connected');
            });
        });
    }
    __initSchema() {
        this.chainInfoSchema_ = new mongoose_1.Schema(schema_1.ChainInfoSchema);
        this.validatorSchema_ = new mongoose_1.Schema(schema_1.ValidatorSchema);
        this.nominationSchema_ = new mongoose_1.Schema(schema_1.NominationSchema);
    }
    getValidatorStatusOfEra(id, era) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            let validator = yield ((_a = this.ValidatorModel) === null || _a === void 0 ? void 0 : _a.findOne({
                id: id
            }).lean().exec());
            if (validator === null) {
                return {
                    validator
                };
            }
            const nomination = yield ((_b = this.NominationModel) === null || _b === void 0 ? void 0 : _b.findOne({
                era: era,
                validator: id
            }).lean().exec());
            if (nomination !== null) {
                if (validator !== undefined) {
                    validator.info = [nomination];
                }
            }
            return {
                validator
            };
        });
    }
    getValidatorStatus(id) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const validator = yield ((_a = this.ValidatorModel) === null || _a === void 0 ? void 0 : _a.aggregate([
                { $match: {
                        'id': id
                    } },
                { $lookup: {
                        from: 'nomination',
                        localField: 'id',
                        foreignField: 'validator',
                        as: 'info'
                    } }
            ]).exec());
            const result = this.__validatorSerialize(validator);
            return {
                validator: validator,
                objectData: result
            };
        });
    }
    getValidators(era, size, page) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            const nominations = yield ((_a = this.NominationModel) === null || _a === void 0 ? void 0 : _a.aggregate([
                { $match: {
                        era: era
                    } },
                { $lookup: {
                        from: 'validator',
                        localField: 'validator',
                        foreignField: 'id',
                        as: 'data'
                    } },
                { $skip: page * size },
                { $limit: size }
            ]).exec());
            const validators = nominations.map((nomination) => {
                return {
                    id: nomination.data[0].id,
                    identity: nomination.data[0].identity,
                    statusChange: nomination.data[0].statusChange,
                    info: {
                        nominators: nomination.nominators,
                        era: nomination.era,
                        exposure: nomination.exposure,
                        commission: nomination.commission,
                        apy: nomination.apy
                    }
                };
            });
            console.log('Executed query in', Date.now() - startTime, 'ms');
            return {
                validator: validators
            };
        });
    }
    saveValidatorNominationData(id, data) {
        var _a, _b, _c, _d, _e, _f;
        return __awaiter(this, void 0, void 0, function* () {
            const isDataValid = this.__validateNominationInfo(id, data);
            if (!isDataValid) {
                return false;
            }
            const { validator, objectData } = yield this.getValidatorStatus(id);
            if (validator === undefined || validator.length === 0) {
                const vData = new types_1.ValidatorDbSchema(id, new types_1.IdentityDbSchema(data.identity.getIdentity()), new types_1.StatusChange(0));
                yield ((_a = this.ValidatorModel) === null || _a === void 0 ? void 0 : _a.create(vData).catch((err) => console.error(err)));
                const nData = new types_1.NominationDbSchema(data.era, data.exposure, data.nominators, data.commission, data.apy, id);
                yield ((_b = this.NominationModel) === null || _b === void 0 ? void 0 : _b.create(nData.exportString()).catch((err) => console.error(err)));
            }
            else {
                yield ((_c = this.ValidatorModel) === null || _c === void 0 ? void 0 : _c.findOneAndUpdate({
                    id: id
                }, {
                    identity: { display: data.identity.getIdentity() },
                    'statusChange.commission': data.commissionChanged
                }).exec());
                const nomination = yield ((_d = this.NominationModel) === null || _d === void 0 ? void 0 : _d.findOne({ era: data.era, validator: id }).exec());
                if (nomination !== null) { // the data of this era exist, dont add a new one
                    yield ((_e = this.NominationModel) === null || _e === void 0 ? void 0 : _e.findOneAndUpdate({
                        era: data.era, validator: id,
                    }, {
                        exposure: data.exposure.exportString(),
                        nominators: data.nominators.map((n) => { return n.exportString(); }),
                        commission: data.commission,
                        apy: data.apy,
                    }).exec());
                    return true;
                }
                yield ((_f = this.NominationModel) === null || _f === void 0 ? void 0 : _f.create({
                    era: data.era,
                    exposure: data.exposure.exportString(),
                    nominators: data.nominators.map((n) => { return n.exportString(); }),
                    commission: data.commission,
                    apy: data.apy,
                    validator: id
                }));
            }
            return true;
        });
    }
    saveActiveEra(era) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            console.log('save active era');
            const result = yield ((_a = this.ChainInfoModel) === null || _a === void 0 ? void 0 : _a.updateOne({}, { $set: { activeEra: era } }, { upsert: true }).exec().catch((err) => {
                console.error(err);
            }));
            console.log(result);
        });
    }
    __validateNominationInfo(id, data) {
        if (!Number.isInteger(data.era)) {
            console.error('data.era is not an integer');
            console.error(id);
            console.error(data);
            return false;
        }
        if (!Array.isArray(data.exposure.others)) {
            console.error('data.exposure is not an array');
            console.error(id);
            console.error(data);
            return false;
        }
        if (!Array.isArray(data.nominators)) {
            console.error('data.nominators is not an array');
            console.error(id);
            console.error(data);
            return false;
        }
        for (let i = 0; i < data.exposure.others.length; i++) {
            if (data.exposure.others[i] !== undefined) {
                if (data.exposure.others[i].who === undefined || data.exposure.others[i].value === undefined) {
                    console.error('incorrect exposure format');
                    console.error(id);
                    console.error(data);
                    return false;
                }
            }
        }
        return true;
    }
    __validatorSerialize(validator) {
        const result = [];
        for (let i = 0; i < validator.length; i++) {
            let info = [];
            for (let j = 0; j < validator[i].info.length; j++) {
                info.push({
                    nominators: validator[i].info[j].nominators,
                    era: validator[i].info[j].era,
                    exposure: validator[i].info[j].exposure,
                    commission: validator[i].info[j].commission,
                    apy: validator[i].info[j].apy
                });
            }
            result.push({
                id: validator[i].id,
                identity: validator[i].identity,
                statusChange: validator[i].statusChange,
                info: info
            });
        }
        return result;
    }
}
exports.DatabaseHandler = DatabaseHandler;
