import { Mongoose, Schema, Model, Document, set } from 'mongoose';
import { Identity, ValidatorDbSchema, NominationDbSchema, StatusChange, IdentityDbSchema } from '../types';
import { ValidatorSchema, ValidatorModel, NominationModel, NominationSchema,
  ChainInfoModel, ChainInfoSchema, IUnclaimedEraInfo, UnclaimedEraInfoSchema } from './schema';

export class DatabaseHandler {
  validatorSchema_?: Schema
  nominationSchema_?: Schema
  chainInfoSchema_?: Schema
  unclamedEraInfoSchema_?: Schema
  ValidatorModel?: Model<Document<any, {}>, {}>
  NominationModel?: Model<Document<any, {}>, {}>
  ChainInfoModel?: Model<Document<any, {}>, {}>
  UnclaimedEraInfoModel?: Model<Document<any, {}>, {}>
  constructor() {
    this.__initSchema();
    set('debug', true);
  }

  connect(name: string, pass: string, ip: string, port: number, dbName: string) {
    const self = this;
    let url = `mongodb://`;
    if(process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
      url = url + `${name}:${pass}@`;
    }
    url += `${ip}:${port}/${dbName}`;
    const db = new Mongoose().createConnection(url, {
      useNewUrlParser: true, 
      useUnifiedTopology: true,
      poolSize: 10
    });
    this.ValidatorModel = db.model('Validator_' + dbName, ValidatorSchema, 'validator');
    this.NominationModel = db.model('Nomination_' + dbName, NominationSchema, 'nomination');
    this.ChainInfoModel = db.model('ChainInfo_' + dbName, ChainInfoSchema, 'chainInfo');
    this.UnclaimedEraInfoModel = db.model('UnclaimedEraInfo_' + dbName, UnclaimedEraInfoSchema, 'unclaimedEraInfo');
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', async function() {
      console.log('DB connected');
    });
  }

  __initSchema() {
    this.chainInfoSchema_ = new Schema(ChainInfoSchema);
    this.validatorSchema_ = new Schema(ValidatorSchema);
    this.nominationSchema_ = new Schema(NominationSchema);
    this.unclamedEraInfoSchema_ = new Schema(UnclaimedEraInfoSchema);
  }

  async getValidatorStatusOfEra(id: string, era: number) {
    let validator = await this.ValidatorModel?.findOne({
      id: id
    }).lean().exec() as ValidatorDbSchema;

    if (validator === null) {
      return {
        validator
      }
    }
    
    const nomination = await this.NominationModel?.findOne({
      era: era,
      validator: id
    }).lean().exec() as NominationDbSchema;

    if (nomination !== null) {
      if(validator !== undefined) {
        validator.info = [nomination];
      }
    }

    return {
      validator
    }
  }

  async getValidatorStatus(id: string) {
    const validator = await this.ValidatorModel?.aggregate([
      {$match: {
        'id': id
      }},
      {$lookup: {
        from: 'nomination',
        localField: 'id',
        foreignField: 'validator',
        as: 'info'
      }}
    ]).exec();

    const result = this.__validatorSerialize(validator);
    return {
      validator: validator,
      objectData: result
    };
  }

  async getValidators(era: number, size: number, page: number) {
    const startTime = Date.now();
    const nominations = await this.NominationModel?.aggregate([
      {$match: {
        era: era
      }},
      {$lookup: {
        from: 'validator',
        localField: 'validator',
        foreignField: 'id',
        as: 'data'
      }},
      {$skip: page * size},
      {$limit: size}
    ]).exec();

    const validators = nominations.map((nomination: { data: { statusChange: any; id: string, identity: {
      display: String };}[]; nominators: any; era: any; exposure: any; commission: any; apy: any; }) => {
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
      }
    });
    console.log('Executed query in', Date.now() - startTime, 'ms');
    return {
      validator: validators
    }
  }

  async saveValidatorNominationData(id: string, data: any) {
    const isDataValid = this.__validateNominationInfo(id, data);
    if(!isDataValid) {
      return false;
    }
    const { validator, objectData } = await this.getValidatorStatus(id);
    if(validator === undefined || validator.length === 0) {
      const vData = new ValidatorDbSchema(id, new IdentityDbSchema(data.identity.getIdentity()), new StatusChange(0));
      await this.ValidatorModel?.create(vData).catch((err: any) => console.error(err));
      const nData = new NominationDbSchema(data.era, data.exposure, data.nominators, data.commission, data.apy, id);
      await this.NominationModel?.create(nData.exportString()).catch((err: any) => console.error(err));
    } else {
      await this.ValidatorModel?.findOneAndUpdate({
        id: id
      }, {
        id: id,
        identity: { display: data.identity.getIdentity()}, 
        'statusChange.commission': data.commissionChanged
      }, {useFindAndModify: false}).exec();
      const nomination = await this.NominationModel?.findOne({era: data.era, validator: id}).exec();
      if(nomination !== null) { // the data of this era exist, dont add a new one
        const result = await this.NominationModel?.findOneAndUpdate({
          era: data.era, validator: id,
        }, {
          era: data.era,
          validator: id,
          exposure: data.exposure.exportString(),
          nominators: data.nominators.map((n: any)=>{return n.exportString();}),
          commission: data.commission,
          apy: data.apy,
        }, {useFindAndModify: false}).exec().catch((err)=>{console.log(err)});
        return true;
      }
      await this.NominationModel?.create({
        era: data.era,
        exposure: data.exposure.exportString(),
        nominators: data.nominators.map((n: any)=>{return n.exportString();}),
        commission: data.commission,
        apy: data.apy,
        validator: id
      });
    }
    return true;
  }

  async saveActiveEra(era: number) {
    console.log('save active era');
    const result = await this.ChainInfoModel?.updateOne({}, {$set: {activeEra: era}}, {upsert: true}).exec().catch((err)=>{
      console.error(err);
    });
  }

  async saveValidatorUnclaimedEras(id: string, eras: number[]) {
    const result = await this.UnclaimedEraInfoModel?.updateOne({validator: id}, {
      eras: eras,
      validator: id,
    }, {upsert: true}).exec().catch((err)=>{
      console.error(err);
    });
  }

  __validateNominationInfo(id: string, data: any) {
    if(!Number.isInteger(data.era)) {
      console.error('data.era is not an integer');
      console.error(id);
      console.error(data);
      return false;
    }
    if(!Array.isArray(data.exposure.others)) {
      console.error('data.exposure is not an array');
      console.error(id);
      console.error(data);
      return false;
    }
    if(!Array.isArray(data.nominators)) {
      console.error('data.nominators is not an array');
      console.error(id);
      console.error(data);
      return false;
    }
    for(let i = 0; i < data.exposure.others.length; i++) {
      if(data.exposure.others[i] !== undefined) {
        if(data.exposure.others[i].who === undefined || data.exposure.others[i].value === undefined) {
          console.error('incorrect exposure format');
          console.error(id);
          console.error(data);
          return false;
        }
      }
    }
    return true;
  }

  __validatorSerialize(validator: any) {
    const result = [];

    for (let i=0; i<validator.length; i++) {
      let info = [];
      for (let j=0; j<validator[i].info.length; j++) {
        info.push({
          nominators: validator[i].info[j].nominators,
          era: validator[i].info[j].era,
          exposure: validator[i].info[j].exposure,
          commission: validator[i].info[j].commission,
          apy: validator[i].info[j].apy
        })
        
      }
      result.push({
        id: validator[i].id,
        identity: validator[i].identity,
        statusChange: validator[i].statusChange,
        info: info
      })
    }
    return result;
  }
}
