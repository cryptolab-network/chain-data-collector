"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnclaimedEraInfoSchema = exports.ChainInfoModel = exports.ChainInfoSchema = exports.NominationModel = exports.NominationSchema = exports.ValidatorSchema = exports.ValidatorModel = void 0;
const mongoose_1 = require("mongoose");
const UnclaimedEraInfoSchema = new mongoose_1.Schema({
    eras: [Number],
    validator: String,
});
exports.UnclaimedEraInfoSchema = UnclaimedEraInfoSchema;
;
const ChainInfoSchema = new mongoose_1.Schema({
    activeEra: Number,
});
exports.ChainInfoSchema = ChainInfoSchema;
const ChainInfoModel = mongoose_1.model('ChainInfo', ChainInfoSchema);
exports.ChainInfoModel = ChainInfoModel;
;
const ValidatorSchema = new mongoose_1.Schema({
    id: String,
    identity: {
        display: String
    },
    statusChange: {
        commission: Number, // 0: no change, 1: up, 2: down
    },
});
exports.ValidatorSchema = ValidatorSchema;
const ValidatorModel = mongoose_1.model('Validator', ValidatorSchema);
exports.ValidatorModel = ValidatorModel;
;
const NominationSchema = new mongoose_1.Schema({
    era: Number,
    exposure: {
        total: { type: String, set: toHexString },
        own: { type: String, set: toHexString },
        others: [
            {
                who: String,
                value: { type: String, set: toHexString },
            }
        ]
    },
    nominators: [{
            address: String,
            targets: [String],
            balance: {
                lockedBalance: { type: String, set: toHexString },
                freeBalance: { type: String, set: toHexString },
            },
        }],
    commission: Number,
    apy: Number,
    validator: String
});
exports.NominationSchema = NominationSchema;
const NominationModel = mongoose_1.model('Nomination', NominationSchema);
exports.NominationModel = NominationModel;
function toHexString(v) {
    return v.toString(10);
}
