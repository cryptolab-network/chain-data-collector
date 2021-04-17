import { model, Schema, Model, Document, Decimal128 } from 'mongoose';
import { Identity, StatusChange } from '../types';
export { ValidatorModel, ValidatorSchema, NominationSchema,
  NominationModel, ChainInfoSchema, ChainInfoModel, UnclaimedEraInfoSchema, IUnclaimedEraInfo };

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
};

const ChainInfoSchema: Schema = new Schema({
  activeEra: Number,
});

const ChainInfoModel: Model<IChainInfo> = model('ChainInfo', ChainInfoSchema);

interface IValidator extends Document {
  id: string;
  identity: Identity;
  statusChange: StatusChange;
};

const ValidatorSchema: Schema = new Schema({
  id: String,
  identity: {
    display: String
  },
  statusChange: {
    commission: Number, // 0: no change, 1: up, 2: down
  },
});

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
  nominators: [{
    address: String,
    targets: [String],
    balance: {
      lockedBalance: {type: String, set: toHexString},
      freeBalance: {type: String, set: toHexString},
    },
  }],
  commission: Number,
  apy: Number,
  validator: String
});

const NominationModel: Model<INomination> = model('Nomination', NominationSchema);

function toHexString(v: bigint) {
  return v.toString(10);
}
