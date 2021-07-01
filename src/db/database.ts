import { Mongoose, Model, Document } from 'mongoose';
import { ValidatorDbSchema, NominationDbSchema, StatusChange, IdentityDbSchema, ValidatorEraReward, BalancedNominator, Balance, Exposure } from '../types';
import { ValidatorSchema, NominationSchema, NominatorSchema,
  ChainInfoSchema, UnclaimedEraInfoSchema, StashInfoSchema } from './schema';
import AsyncLock from 'async-lock';

export class DatabaseHandler {
  ValidatorModel?: Model<Document<any, {}>, {}>
  NominationModel?: Model<Document<any, {}>, {}>
  ChainInfoModel?: Model<Document<any, {}>, {}>
  UnclaimedEraInfoModel?: Model<Document<any, {}>, {}>
  StashInfoModel?: Model<Document<any, {}>, {}>
  NominatorModel?: Model<Document<any, {}>, {}>
  lock: AsyncLock
  constructor() {
    this.lock = new AsyncLock({maxPending: 1000});
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
      useCreateIndex: true,
      poolSize: 10
    });
    this.ValidatorModel = db.model('Validator_' + dbName, ValidatorSchema, 'validator');
    this.NominationModel = db.model('Nomination_' + dbName, NominationSchema, 'nomination');
    this.ChainInfoModel = db.model('ChainInfo_' + dbName, ChainInfoSchema, 'chainInfo');
    this.UnclaimedEraInfoModel = db.model('UnclaimedEraInfo_' + dbName, UnclaimedEraInfoSchema, 'unclaimedEraInfo');
    this.StashInfoModel = db.model('StashInfo_' + dbName, StashInfoSchema, 'stashInfo' );
    this.NominatorModel = db.model('Nominator_'+ dbName, NominatorSchema, 'nominator');

    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', async function() {
      console.log('DB connected');
    });
  }

  async getValidatorList() {
    let validators = await this.ValidatorModel?.find({}).lean().exec() as ValidatorDbSchema[];
    return validators.reduce((acc: string[], v: ValidatorDbSchema)=>{
      acc.push(v.id.toString());
      return acc;
    }, []);
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
        foreignField: 'validator_',
        as: 'info'
      }}
    ]).exec();

    const result = this.__validatorSerialize(validator);
    return {
      validator: validator,
      objectData: result
    };
  }

  async getAllValidatorStatus() {
    const validator = await this.ValidatorModel?.aggregate([
      {$lookup: {
        from: 'nomination',
        localField: 'id',
        foreignField: 'validator',
        as: 'info'
      }}
    ]).exec();

    return validator;
  }

  async saveHistoricalApy(id: string, apy: number) {
    await this.ValidatorModel?.updateOne({
      id: id
    }, {
      $set: {averageApy: apy}
    }, {}).exec().catch((err)=>{console.error(err)});
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
    try {
      const isDataValid = this.__validateNominationInfo(id, data);
      if(!isDataValid) {
        return false;
      }
      const { validator, objectData } = await this.getValidatorStatus(id);
      const nData = new NominationDbSchema(data.era, data.exposure, data.nominators, data.commission, data.apy, id, data.total);
      if(validator === undefined || validator.length === 0) {
        const vData = new ValidatorDbSchema(id, new IdentityDbSchema(data.identity.getIdentity()), new StatusChange(0), data.stakerPoints);
        await this.ValidatorModel?.create(vData).catch((err: any) => console.error(err));
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
          }, nData.exportString(), {useFindAndModify: false}).exec().catch((err)=>{console.log(err)});
          return true;
        }
        await this.NominationModel?.create(nData.exportString());
      }
      return true;
    } catch (err) {
      console.log(err);
      console.log(`id = ${id}`);
      return false;
    }
  }

  async saveMultipleValidatorNominationData(data: any[], era: number) {
    
    try {
      // validator
      let script: any[] = [];
      data.forEach((validator) => {
        script.push(
          {
            updateOne :
            {
              "filter": {id: validator.id},
              "update": {
                  id: validator.id,
                  identity: new IdentityDbSchema(validator.identity.getIdentity()),
                  statusChange: {
                    commission: validator.commissionChanged
                  },
                  stakerPoints: validator.stakerPoints,
                },
              "upsert": true,
            }
          }
        );
      });
      await this.ValidatorModel?.bulkWrite(script);
      //nomination
      script = [];
      data.forEach((validator) => {
        const nData = new NominationDbSchema(validator.era, validator.exposure, validator.nominators,
          validator.commission, validator.apy, validator.id, validator.total);
        script.push(
          {
            updateOne :
            {
              "filter": {validator: validator.id, era: validator.era},
              "update": nData.exportString(),
              "upsert": true,
            }
          }
        );
      });
      await this.NominationModel?.bulkWrite(script);
    } catch(err) {
      console.error(err);
    }

  }

  async saveNominators(data: BalancedNominator[], era: number) {
    try {
      const script: any[] = [];
      data.forEach((nominator) => {
        script.push(
          {
            updateOne :
            {
              "filter": {address: nominator.address},
              "update": {
                  address: nominator.address,
                  targets: nominator.targets,
                  balance: nominator.balance.exportString(),
                },
              "upsert": true,
            }
          }
        );
      });
      await this.NominatorModel?.bulkWrite(script);
    } catch(err) {
      console.error(err);
    }
  }

  async saveNominator(data: BalancedNominator, era: number) {
    const nominator = await this.NominatorModel?.findOne({
      address: data.address,
    }).exec().catch((err)=>{
      console.error(err);
    });
    if(nominator !== undefined && nominator !== null) { // the nominator is updated in this era, only update iff nominator is diff from data
      const targets = nominator.get('targets');
      const balance = nominator.get('balance');
      if(targets.length === data.targets.length) {
        const sorted = data.targets.sort();
        const identical = targets.sort().every((v: string, i: number) => v === sorted[i]);
        if(!identical) {
          console.log('+++++++');
          console.log(nominator, data);
          console.log('------');
          this.NominatorModel?.updateOne({address: data.address}, {
            $set: {targets: data.targets},
          }).exec().catch((err)=>{
            console.error(err);
          });
        }
      }
      if(balance.freeBalance !== data.balance.freeBalance || balance.lockedBalance !== data.balance.lockedBalance) {
        this.NominatorModel?.updateOne({address: data.address}, {
          $set: { 
            balance: data.balance.exportString(),
          },
        }).exec().catch((err)=>{
          console.error(err);
        });
      }
    } else { // the nomoinator is not exist in this era, create a new one
      this.NominatorModel?.create(
        {
          address: data.address,
          targets: data.targets,
          balance: data.balance.exportString(),
        }).catch((err)=>{
        console.error(err);
      });
    }
  }

  async saveActiveEra(era: number) {
    console.log('save active era');
    const result = await this.ChainInfoModel?.updateOne({}, {$set: {activeEra: era}}, {upsert: true}).exec().catch((err)=>{
      console.error(err);
    });
  }

  async getActiveEra() {
    console.log('get active era');
    const data = await this.ChainInfoModel?.findOne({}, 'activeEra').exec();
    if(data === null) {
      throw new Error('Cannot get active Era');
    } else {
      const activeEra = data?.get('activeEra');
      return activeEra;
    }
  }

  async saveLastFetchedBlock(blockNumber: number) {
    const result = await this.ChainInfoModel?.updateOne({}, {$set: {lastFetchedBlock: blockNumber}}, {upsert: true}).exec().catch((err)=>{
      console.error(err);
    });
  }

  async getLastFetchedRewardBlock(minBlockNumber: number) {
    const chainInfo = await this.ChainInfoModel?.findOne({}, 'lastFetchedBlock').exec();
    let blockNumber = minBlockNumber;
    if(chainInfo === null) {
      blockNumber = minBlockNumber;
    } else {
      blockNumber = chainInfo?.get('lastFetchedBlock');
      if(blockNumber === undefined) {
        blockNumber = minBlockNumber;
      }
    }
    return blockNumber;
  }

  async saveValidatorUnclaimedEras(id: string, eras: number[]) {
    const result = await this.UnclaimedEraInfoModel?.updateOne({validator: id}, {
      eras: eras,
      validator: id,
    }, {upsert: true}).exec().catch((err)=>{
      console.error(err);
    });
  }

  async saveMultipleValidatorUnclaimedEras(data: any[]) {
    try {
      const script: any[] = [];
      data.forEach((validator) => {
        script.push(
          {
            updateOne :
            {
              "filter": {validator: validator.id},
              "update": {
                  eras: validator.eras,
                  validator: validator.id
                },
              "upsert": true,
            }
          }
        );
      });
      await this.UnclaimedEraInfoModel?.bulkWrite(script);
    } catch(err) {
      console.error(err);
    }
  }

  async updateValidatorTotalReward(id: string, reward: ValidatorEraReward) {
    const validator = await this.ValidatorModel?.findOne({
      id: id,
    }).lean().exec() as ValidatorDbSchema;
    if(validator === null) {
      return;
    }
    let start = 0;
    let total = reward.reward;
    if(validator.rewards !== undefined) {

      if(validator.rewards.end >= reward.era) {
        // updated, finish
        return;
      }
      start = validator.rewards.start;
      if(reward.era < validator.rewards.start) {
        start = reward.era;
      }
      if(!Number.isNaN(validator.rewards!.total) && validator.rewards!.total !== undefined) {
        total = validator.rewards!.total + reward.reward;
      }
    }
    const result = await this.ValidatorModel?.updateOne({
      id: id,
    }, {
      $set: {
        rewards: {
            start: start,
            end: reward.era,
            total: total,
          }
      }
    }).exec();
  }

  
  async saveRewards(stash: string, era: number, amount: number, timestamp: number) {
    await this.StashInfoModel?.create({
      stash: stash,
      era: era,
      amount: amount,
      timestamp: timestamp,
    }).catch((err)=>{
      // it is ok
      //console.error(err);
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

const __toHexString = (v: bigint) => {
  let hex = v.toString(16);
  if(hex.length % 2 === 1) {
    hex = '0' + hex;
  }
  hex = '0x' + hex;
  return hex;
}

