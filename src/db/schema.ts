import { model, Schema, Model, Document, Types } from 'mongoose';
import { Identity, IdentityDbSchema, IndividualExposure, StakerPoint, StatusChange, ValidatorTotalReward } from '../types';
export { ValidatorModel, ValidatorSchema, NominationSchema, NominatorSchema,
  NominationModel, ChainInfoSchema, ChainInfoModel, IChainInfo, UnclaimedEraInfoSchema, IUnclaimedEraInfo,
  IStashInfo, StashInfoSchema, IEraReward, IValidator, INomination, IValidatorSlash,
  IValidatorSlashNominator, INominator, INominatorSlash, IBalance, IValidatorCommissionChange };

interface IStashInfo extends Document {
  stash: string;
  era: number,
  amount: number,
  timestamp: number
}

const StashInfoSchema: Schema = new Schema({
  stash: String,
  era: Number,
  amount: Number,
  timestamp: Number
})

StashInfoSchema.index({
  'stash': 1,
  'era': 1,
  'amount': 1,
  'timestamp': 1,}, {unique: true, background: false});

interface IEraReward extends Document {
  era: number,
    amount: number,
}

interface IUnclaimedEraInfo extends Document {
  eras: number[];
  validator: string;
}

const UnclaimedEraInfoSchema: Schema = new Schema({
  eras: [Number],
  validator: String,
});

interface IChainInfo extends Document {
  activeEra: number;
  lastFetchedBlock: number;
}

const ChainInfoSchema: Schema = new Schema({
  activeEra: Number,
  lastFetchedBlock: Number,
});

const ChainInfoModel = model('ChainInfo', ChainInfoSchema);


interface IValidator extends Document {
  id: string;
  identity: IdentityDbSchema;
  statusChange: StatusChange;
  rewards: ValidatorTotalReward;
  stakerPoints: StakerPoint;
  averageApy: number;
  blocked: boolean;
}

const ValidatorSchema: Schema = new Schema({
  id: String,
  identity: {
    display: String,
    parent: String,
    sub: String,
    isVerified: Boolean,
  },
  statusChange: {
    commission: Number, // 0: no change, 1: up, 2: down
  },
  rewards: {
    start: Number,
    end: Number,
    total: Number
  },
  stakerPoints: [
    {
      era: Number,
      points: Number,
    },
  ],
  averageApy: Number,
  blocked: Boolean,
});

ValidatorSchema.index({
  'id': 1
}, {name: 'id_'});

const ValidatorModel = model('Validator', ValidatorSchema);

interface INomination extends Document {
  era: number;
  identity: Identity;
  statusChange: StatusChange;
}

const NominationSchema: Schema = new Schema({
  era: Number,
  exposure:{
    total: {type: String, set: toHexString},
    own: {type: String, set: toHexString},
    others: [
      {
        who: String,
        value: {type: String, set: toHexString},
      }
    ]
  },
  nominators: [String],
  commission: Number,
  apy: Number,
  validator: String,
  total: {type: String, set: toHexString},
  selfStake: {type: String, set: toHexString},
});

const NominationModel = model('Nomination', NominationSchema);

NominationSchema.index({
  'validator': 1
}, {name: 'validator_'});

interface INominator extends Document {
  address: string;
  targets: string[];
  balance: IBalance;
}

interface IBalance extends Document {
  lockedBalance: string;
  freeBalance: string;
}

const NominatorSchema: Schema = new Schema({
  address: String,
  targets: [String],
  balance: {
    lockedBalance: {type: String, set: toHexString},
    freeBalance: {type: String, set: toHexString},
  },
});

NominatorSchema.index({'address': 1}, {unique: true});

interface IValidatorSlash extends Document {
  address: string;
  era: number;
  total: string;
  others: IValidatorSlashNominator;
}

interface IValidatorSlashNominator extends Document {
  address: string;
  value: string;
}

export const ValidatorSlashSchema: Schema = new Schema({
  address: String,
  era: Number,
  total: String,
  others: [
    {
      address: String,
      value: String,
    },
  ],
});

ValidatorSlashSchema.index({'address': 1, 'era': 1}, {unique: true});

interface INominatorSlash extends Document {
  address: string;
  era: number;
  total: string;
  validator: string;
}

export const NominatorSlashSchema: Schema = new Schema({
  address: String,
  era: Number,
  total: String,
  validator: String,
});

NominatorSlashSchema.index({'address': 1, 'era': 1, 'validator': 1}, {unique: true});


function toHexString(v: bigint) {
  return v.toString(10);
}

interface IValidatorCommissionChange extends Document {
  address: string;
  era: number;
  commissionFrom: number;
  commissionTo: number;
}

export const ValidatorCommissionSchema: Schema = new Schema({
  address: String,
  era: Number,
  commissionFrom: Number,
  commissionTo: Number,
});

ValidatorCommissionSchema.index({'address': 1, 'era': 1, 'commissionFrom': 1, 'commssionTo': 1}, {unique: true});

export interface IAllValidatorsInactive extends Document {
  address: string;
  era: number;
}

export const AllValidatorsInactiveSchema: Schema = new Schema({
  address: String,
  era: Number,
});

AllValidatorsInactiveSchema.index({'address': 1, 'era': 1}, {unique: true});

export interface INominationRecord extends Document {
  stash: string;
  validators: string[];
}

export const NominationRecordSchema: Schema = new Schema({
  stash: String,
  validators: [String],
});

export const StalePayoutEventSchema: Schema = new Schema({
  address: String,
  era: Number,
  unclaimedPayoutEras: [Number],
});

export interface IStalePayoutEvent extends Document {
  address: string;
  era: number;
  unclaimedPayoutEras: number[];
}

StalePayoutEventSchema.index({'address': 1, 'era': 1}, {unique: true});

export const ChillEventSchema: Schema = new Schema({
  address: String,
  era: Number,
});

export interface IChillEvent extends Document {
  address: string;
  era: number;
}

ChillEventSchema.index({'address': 1, 'era': 1}, {unique: true});

export const KickEventSchema: Schema = new Schema({
  address: String,
  era: Number,
  nominator: String,
  timestamp: Number,
});

export interface IKickEvent extends Document {
  address: string;
  era: number;
  nominator: string;
  timestamp: number;
}

ChillEventSchema.index({'address': 1, 'era': 1, 'nominator': 1}, {unique: true});

export const OverSubscribeEventSchema: Schema = new Schema({
  address: String,
  era: Number,
  nominators: [{
    who: String,
    value: String
  }],
});

export interface IOverSubscribeEvent extends Document {
  address: string;
  era: number;
  nominators: IndividualExposure[];
}

OverSubscribeEventSchema.index({'address': 1, 'era': 1}, {unique: true});

export const UserEventMappingSchema: Schema = new Schema({
  mapping: Types.ObjectId,
  address: String,
  type: Number,
  era: Number,
});

export interface IUserEventMapping extends Document {
  mapping: Types.ObjectId;
  address: string;
  type: number;
  era: number;
}

UserEventMappingSchema.index({'address': 1, 'mapping': 1}, {unique: true});
