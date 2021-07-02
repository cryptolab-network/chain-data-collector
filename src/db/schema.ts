import { model, Schema, Model, Document, Decimal128 } from 'mongoose';
import { Identity, StakerPoint, StatusChange, ValidatorTotalReward } from '../types';
export { ValidatorModel, ValidatorSchema, NominationSchema, NominatorSchema,
  NominationModel, ChainInfoSchema, ChainInfoModel, UnclaimedEraInfoSchema, IUnclaimedEraInfo,
  IStashInfo, StashInfoSchema };

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
};

const ChainInfoSchema: Schema = new Schema({
  activeEra: Number,
  lastFetchedBlock: Number,
});

const ChainInfoModel: Model<IChainInfo> = model('ChainInfo', ChainInfoSchema);

interface IValidator extends Document {
  id: string;
  identity: Identity;
  statusChange: StatusChange;
  rewards: ValidatorTotalReward;
  stakerPoints: StakerPoint;
  averageApy: number;
};

const ValidatorSchema: Schema = new Schema({
  id: String,
  identity: {
    display: String
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
});

ValidatorSchema.index({
  'id': 1
}, {name: 'id_'});

const ValidatorModel: Model<IValidator> = model('Validator', ValidatorSchema);

interface INomination extends Document {
  era: Number;
  identity: Identity;
  statusChange: StatusChange;
};

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
});

const NominationModel: Model<INomination> = model('Nomination', NominationSchema);

NominationSchema.index({
  'validator': 1
}, {name: 'validator_'});

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
};

interface IValidatorSlashNominator extends Document {
  address: String;
  value: String;
};

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

const ValidatorSlashModel: Model<IValidatorSlash> = model('ValidatorSlash', ValidatorSlashSchema);

function toHexString(v: bigint) {
  return v.toString(10);
}
