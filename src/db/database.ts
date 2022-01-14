import { Mongoose, Model, Types } from 'mongoose';
import {
  ValidatorDbSchema, NominationDbSchema, IdentityDbSchema, ValidatorEraReward,
  BalancedNominator, ValidatorSlash, NominatorSlash, ValidatorCache, ValidatorUnclaimedEras, ValidatorCommissionChangeSchema, NominationRecordsDBSchema, IndividualExposure
} from '../types';
import {
  ValidatorSchema, NominationSchema, NominatorSchema,
  ChainInfoSchema, UnclaimedEraInfoSchema, StashInfoSchema, ValidatorSlashSchema, NominatorSlashSchema,
  IValidator,
  INomination,
  IChainInfo,
  IUnclaimedEraInfo,
  IStashInfo,
  INominator,
  IValidatorSlash,
  INominatorSlash,
  IValidatorCommissionChange,
  ValidatorCommissionSchema,
  IAllValidatorsInactive,
  AllValidatorsInactiveSchema,
  NominationRecordSchema,
  INominationRecord,
  IStalePayoutEvent,
  StalePayoutEventSchema,
  IChillEvent,
  IKickEvent,
  ChillEventSchema,
  KickEventSchema,
  IOverSubscribeEvent,
  OverSubscribeEventSchema,
  IUserEventMapping,
  UserEventMappingSchema,
} from './schema';
import AsyncLock from 'async-lock';
import { logger } from '../logger';
import { keys } from '../config/keys';
import fs from 'fs';

const EventTypes = {
  payout: 0,
  commissionChange: 1,
  kick: 2,
  chill: 3,
  inactive: 4,
  stalePayouts: 5,
  overSubsribe: 6,
};

export class DatabaseHandler {
  ValidatorModel?: Model<IValidator>
  NominationModel?: Model<INomination>
  ChainInfoModel?: Model<IChainInfo>
  UnclaimedEraInfoModel?: Model<IUnclaimedEraInfo>
  StashInfoModel?: Model<IStashInfo>
  NominatorModel?: Model<INominator>
  ValidatorSlashModel?: Model<IValidatorSlash>
  NominatorSlashModel?: Model<INominatorSlash>
  ValidatorCommissionModel? : Model<IValidatorCommissionChange>
  AllValidatorInactiveModel?: Model<IAllValidatorsInactive>
  NominationRecordModel?: Model<INominationRecord>
  StalePayoutEventModel?: Model<IStalePayoutEvent>
  ChillEventModel?: Model<IChillEvent>
  KickEventModel?: Model<IKickEvent>
  OverSubscribeEventModel?: Model<IOverSubscribeEvent>
  UserEventMappingModel?: Model<IUserEventMapping>
  lock: AsyncLock
  constructor() {
    this.lock = new AsyncLock({ maxPending: 1000 });
  }

  async connect(name: string, pass: string, ip: string, port: number, dbName: string): Promise<void> {
    let url = `mongodb://`;
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
      url = url + `${name}:${pass}@`;
    }
    url += `${ip}:${port}/${dbName}`;
    url += `?authSource=admin`;
    let options = {};
    if (keys.MONGO_SSL === true) {
      const pem = fs.readFileSync(keys.MONGO_SSL_CA);
      options = {
        ssl: true,
        sslCA: pem,
        sslValidate: false,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true,
        poolSize: 10,
      }
    } else {
      options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true,
        poolSize: 10,
      }
    }
    const db = await new Mongoose().createConnection(url, options);
    this.ValidatorModel = db.model<IValidator>('Validator_' + dbName, ValidatorSchema, 'validator');
    this.NominationModel = db.model<INomination>('Nomination_' + dbName, NominationSchema, 'nomination');
    this.ChainInfoModel = db.model<IChainInfo>('ChainInfo_' + dbName, ChainInfoSchema, 'chainInfo');
    this.UnclaimedEraInfoModel = db.model<IUnclaimedEraInfo>('UnclaimedEraInfo_' + dbName, UnclaimedEraInfoSchema, 'unclaimedEraInfo');
    this.StashInfoModel = db.model<IStashInfo>('StashInfo_' + dbName, StashInfoSchema, 'stashInfo');
    this.NominatorModel = db.model<INominator>('Nominator_' + dbName, NominatorSchema, 'nominator');
    this.ValidatorSlashModel = db.model<IValidatorSlash>('ValidatorSlash_' + dbName, ValidatorSlashSchema, 'validatorSlash');
    this.NominatorSlashModel = db.model<INominatorSlash>('NominatorSlash_' + dbName, NominatorSlashSchema, 'nominatorSlash');
    this.ValidatorCommissionModel = db.model<IValidatorCommissionChange>('ValidatorCommissionChange_' + dbName, ValidatorCommissionSchema, 'commission');
    this.AllValidatorInactiveModel = db.model<IAllValidatorsInactive>('AllInactive_' + dbName, AllValidatorsInactiveSchema, 'inactiveEvents');
    this.NominationRecordModel = db.model<INominationRecord>('NominationRecord_' + dbName, NominationRecordSchema, 'nominationRecords');
    this.StalePayoutEventModel = db.model<IStalePayoutEvent>('StalePayoutEvent_' + dbName, StalePayoutEventSchema, 'stalePayouts');
    this.ChillEventModel = db.model<IChillEvent>('ChillEvent_' + dbName, ChillEventSchema, 'chillEvents');
    this.KickEventModel = db.model<IKickEvent>('ChillEvent_' + dbName, KickEventSchema, 'kickEvents');
    this.OverSubscribeEventModel = db.model<IOverSubscribeEvent>('OverSubscribeEvent_' + dbName, OverSubscribeEventSchema, 'overSubscribeEvents');
    this.UserEventMappingModel = db.model<IUserEventMapping>('UserEvebtMapping_' + dbName, UserEventMappingSchema, 'userEventMapping');
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function () {
      logger.info('DB connected');
    });
  }

  async getValidatorList(): Promise<string[]> {
    const validators = await this.ValidatorModel?.find({}).lean().exec() as unknown as ValidatorDbSchema[];
    return validators.reduce((acc: string[], v: ValidatorDbSchema) => {
      acc.push(v.id.toString());
      return acc;
    }, []);
  }

  async getValidatorStatusOfEra(id: string, era: number): Promise<ValidatorDbSchema> {
    const validator = await this.ValidatorModel?.findOne({
      id: id
    }).lean().exec() as unknown as ValidatorDbSchema;

    if (validator === null) {
      return validator;
    }

    const nomination = await this.NominationModel?.findOne({
      era: era,
      validator: id
    }).lean().exec() as unknown as NominationDbSchema;

    if (nomination !== null) {
      if (validator !== undefined) {
        validator.info = [nomination];
      }
    }

    return validator;
  }

  async getValidatorStatus(id: string): Promise<ValidatorDbSchema> {
    const validator = await this.ValidatorModel?.aggregate([
      {
        $match: {
          'id': id
        }
      },
      {
        $lookup: {
          from: 'nomination',
          localField: 'id',
          foreignField: 'validator_',
          as: 'info'
        }
      }
    ]).allowDiskUse(true).exec() as unknown as ValidatorDbSchema;

    return validator;
  }

  async getAllValidatorStatus(): Promise<ValidatorDbSchema[]> {
    const validator = await this.ValidatorModel?.aggregate([
      {
        $lookup: {
          from: 'nomination',
          localField: 'id',
          foreignField: 'validator',
          as: 'info'
        }
      }
    ]).allowDiskUse(true).exec() as unknown as ValidatorDbSchema[];

    return validator;
  }

  async saveHistoricalApy(id: string, apy: number): Promise<void> {
    await this.ValidatorModel?.updateOne({
      id: id
    }, {
      $set: { averageApy: apy }
    }, {}).exec().catch((err) => { logger.error(err) });
  }

  async getValidators(era: number, size: number, page: number) {
    const startTime = Date.now();
    const nominations = await this.NominationModel?.aggregate([
      {
        $match: {
          era: era
        }
      },
      {
        $lookup: {
          from: 'validator',
          localField: 'validator',
          foreignField: 'id',
          as: 'data'
        }
      },
      { $skip: page * size },
      { $limit: size }
    ]).allowDiskUse(true).exec();

    const validators = nominations.map((nomination: {
      data: {
        statusChange: any; id: string, identity: {
          display: string
        };
      }[]; nominators: any; era: any; exposure: any; commission: any; apy: any;
    }) => {
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
    logger.info('Executed query in', Date.now() - startTime, 'ms');
    return {
      validator: validators
    }
  }

  async saveValidatorNominationData(id: string, data: ValidatorCache): Promise<boolean> {
    try {
      const isDataValid = this.__validateNominationInfo(id, data);
      if (!isDataValid) {
        return false;
      }
      const validator = await this.getValidatorStatus(id);
      const nData = data.toNominationDbSchema();
      if (validator === undefined) {
        const vData = data.toValidatorDbSchema();
        await this.ValidatorModel?.create(vData).catch((err: Error) => logger.error(err));
        await this.NominationModel?.create(nData.toObject()).catch((err: Error) => logger.error(err));
      } else {
        await this.ValidatorModel?.findOneAndUpdate({
          id: id
        }, {
          id: id,
          identity: {
            display: data.identity.getIdentity(),
            parent: data.identity.getParent(),
            sub: data.identity.getSub(),
            isVerified: data.identity.isVerified(),
          },
          'statusChange.commission': data.commissionChanged
        }, { useFindAndModify: false })?.exec();
        const nomination = await this.NominationModel?.findOne({ era: data.era, validator: id }).exec();
        if (nomination !== null) { // the data of this era exist, dont add a new one
          await this.NominationModel?.findOneAndUpdate({
            era: data.era, validator: id,
          }, nData.toObject(), { useFindAndModify: false })?.exec().catch((err) => { logger.error(err) });
          return true;
        }
        await this.NominationModel?.create(nData.toObject());
      }
      return true;
    } catch (err) {
      logger.error(err as Error);
      logger.error(`id = ${id}`);
      return false;
    }
  }

  async saveMultipleValidatorNominationData(data: ValidatorCache[], cryptoLabUsers: NominationRecordsDBSchema[]): Promise<void> {
    try {
      // validator
      let script: unknown[] = [];
      data.forEach((validator) => {
        script.push(
          {
            updateOne:
            {
              "filter": { id: validator.id },
              "update": {
                id: validator.id,
                identity: new IdentityDbSchema(validator.identity.getIdentity(), validator.identity.getParent(),
                  validator.identity.getSub(), validator.identity.isVerified()),
                statusChange: {
                  commission: validator.commissionChanged.commissionChanged
                },
                stakerPoints: validator.stakerPoints,
                blocked: validator.blockNomination,
              },
              "upsert": true,
            }
          }
        );
      });
      await this.ValidatorModel?.bulkWrite(script);
      // commission changed
      script = [];
      data.forEach(async (validator) => {
        if (validator.commissionChanged.commissionChanged !== 0 && validator.commissionChanged.commissionFrom === 0) {
          logger.debug('commission changed');
          const nData = new ValidatorCommissionChangeSchema(
            validator.id,
            validator.era,
            validator.commissionChanged.commissionFrom,
            validator.commissionChanged.commissionTo,
          );
          const result = await this.ValidatorCommissionModel?.create(nData.toObject()).catch((err: Error) => logger.error(err));
          if (result !== undefined) {
            const index = cryptoLabUsers.findIndex((v) => v.validators.findIndex((a) => a === validator.id) >= 0);
            if (index >= 0) {
              await this.saveUserEventToMapping(cryptoLabUsers[index].stash, result.id, EventTypes.commissionChange, validator.era);
            }
          }
        }
      });
      // nomination
      script = [];
      data.forEach((validator) => {
        const nData = new NominationDbSchema(validator.era, validator.exposure, validator.nominators,
          validator.commission, validator.apy, validator.id, validator.total, validator.selfStake);
        script.push(
          {
            updateOne:
            {
              "filter": { validator: validator.id, era: validator.era },
              "update": nData.toObject(),
              "upsert": true,
            }
          }
        );
      });
      await this.NominationModel?.bulkWrite(script);
    } catch (err) {
      logger.error(err as Error);
    }

  }

  async saveNominators(data: BalancedNominator[]): Promise<void> {
    try {
      const script: any[] = [];
      data.forEach((nominator) => {
        script.push(
          {
            updateOne:
            {
              "filter": { address: nominator.address },
              "update": {
                address: nominator.address,
                targets: nominator.targets,
                balance: nominator.balance.toLeanDocument(),
              },
              "upsert": true,
            }
          }
        );
      });
      await this.NominatorModel?.bulkWrite(script);
    } catch (err) {
      logger.error(err as Error);
    }
  }

  async saveNominator(data: BalancedNominator): Promise<void> {
    const nominator = await this.NominatorModel?.findOne({
      address: data.address,
    }).exec().catch((err) => {
      logger.error(err);
    });
    if (nominator !== undefined && nominator !== null) { // the nominator is updated in this era, only update iff nominator is diff from data
      const targets = nominator.get('targets');
      const balance = nominator.get('balance');
      if (targets.length === data.targets.length) {
        const sorted = data.targets.sort();
        const identical = targets.sort().every((v: string, i: number) => v === sorted[i]);
        if (!identical) {
          this.NominatorModel?.updateOne({ address: data.address }, {
            $set: { targets: data.targets },
          }).exec().catch((err) => {
            logger.error(err);
          });
        }
      }
      if (balance.freeBalance !== data.balance.freeBalance || balance.lockedBalance !== data.balance.lockedBalance) {
        this.NominatorModel?.updateOne({ address: data.address }, {
          $set: {
            balance: data.balance.toLeanDocument()
          },
        }).exec().catch((err) => {
          logger.error(err);
        });
      }
    } else { // the nomoinator is not exist in this era, create a new one
      this.NominatorModel?.create(
        {
          address: data.address,
          targets: data.targets,
          balance: data.balance.toLeanDocument(),
        }).catch((err) => {
          logger.error(err);
        });
    }
  }

  async saveActiveEra(era: number): Promise<void> {
    logger.debug('save active era');
    await this.ChainInfoModel?.updateOne({}, { $set: { activeEra: era } }, { upsert: true }).exec().catch((err) => {
      logger.error(err);
    });
  }

  async getActiveEra(): Promise<number> {
    logger.debug('get active era');
    const data = await this.ChainInfoModel?.findOne({}, 'activeEra').exec();
    if (data === null) {
      throw new Error('Cannot get active Era');
    } else {
      const activeEra = data?.get('activeEra');
      return activeEra;
    }
  }

  async saveLastFetchedBlock(blockNumber: number): Promise<void> {
    await this.ChainInfoModel?.updateOne({}, { $set: { lastFetchedBlock: blockNumber } }, { upsert: true }).exec().catch((err) => {
      logger.error(err);
    });
  }

  async getLastFetchedRewardBlock(minBlockNumber: number): Promise<number> {
    const chainInfo = await this.ChainInfoModel?.findOne({}, 'lastFetchedBlock').exec();
    let blockNumber = minBlockNumber;
    if (chainInfo === null) {
      blockNumber = minBlockNumber;
    } else {
      blockNumber = chainInfo?.get('lastFetchedBlock');
      if (blockNumber === undefined) {
        blockNumber = minBlockNumber;
      }
    }
    return blockNumber;
  }

  async saveValidatorUnclaimedEras(id: string, eras: number[]): Promise<void> {
    await this.UnclaimedEraInfoModel?.updateOne({ validator: id }, {
      eras: eras,
      validator: id,
    }, { upsert: true }).exec().catch((err) => {
      logger.error(err);
    });
  }

  async saveMultipleValidatorUnclaimedEras(data: ValidatorUnclaimedEras[]): Promise<void> {
    try {
      const script: any[] = [];
      data.forEach((validator) => {
        script.push(
          {
            updateOne:
            {
              "filter": { validator: validator.id },
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
    } catch (err) {
      logger.error(err as Error);
    }
  }

  async saveValidatorSlash(id: string, slash: ValidatorSlash): Promise<void> {
    await this.ValidatorSlashModel?.create({
      address: id,
      era: slash.era,
      total: slash.own,
      others: slash.others.reduce((acc: any, other) => {
        const o = {
          address: other[0],
          value: other[1],
        };
        acc.push(o);
        return acc;
      }, []),
    }).catch((err) => {
      if (err.code !== 11000) { // we should accept duplication key as a normal situation.
        logger.log(err);
      }
    });
  }

  async saveNominatorSlash(id: string, slash: NominatorSlash): Promise<void> {
    await this.NominatorSlashModel?.create({
      address: id,
      era: slash.era,
      total: slash.total,
      validator: slash.validator,
    }).catch((err) => {
      if (err.code !== 11000) { // we should accept duplication key as a normal situation.
        logger.log(err);
      }
    });
  }

  async updateValidatorTotalReward(id: string, reward: ValidatorEraReward): Promise<void> {
    const validator = await this.ValidatorModel?.findOne({
      id: id,
    }).lean().exec() as unknown as ValidatorDbSchema;
    if (validator === null) {
      return;
    }
    let start = 0;
    let total = reward.reward;
    if (validator.rewards !== undefined) {
      if (validator.rewards.end >= reward.era) {
        // updated, finish
        return;
      }
      start = validator.rewards.start;
      if (reward.era < validator.rewards.start) {
        start = reward.era;
      }
      if (!Number.isNaN(validator.rewards.total) && validator.rewards.total !== undefined) {
        total = validator.rewards.total + reward.reward;
      }
    }
    await this.ValidatorModel?.updateOne({
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


  async saveRewards(stash: string, era: number, amount: number, timestamp: number, writeToUserMapping: boolean): Promise<void> {
    const result = await this.StashInfoModel?.create({
      stash: stash,
      era: era,
      amount: amount,
      timestamp: timestamp,
    }).catch(() => {
      // it is ok
      //console.error(err);
    });
    if (writeToUserMapping === true && result !== undefined) {
      await this.saveUserEventToMapping(stash, result.id, EventTypes.payout, era);
    }
  }

  async saveStalePayoutEvents(address: string, era: number, unclaimedPayouts: number[]): Promise<void> {
    await this.StalePayoutEventModel?.create({
      address: address,
      era: era,
      unclaimedPayoutEras: unclaimedPayouts
    }).catch(() => {
      // it is ok
    });
  }

  async getAllNominationRecords(): Promise<NominationRecordsDBSchema[]> {
    const records = await this.NominationRecordModel?.find({}).lean().exec() as unknown as NominationRecordsDBSchema[];
    return records;
  }

  async saveAllInactiveEvent(address: string, era: number, writeToUserMapping: boolean): Promise<void> {
    const result = await this.AllValidatorInactiveModel?.create({
      address: address,
      era: era
    }).catch(() => {
      // it is ok
      //console.error(err);
    });
    if (writeToUserMapping === true && result !== undefined) {
      await this.saveUserEventToMapping(address, result.id, EventTypes.inactive, era);
    }
  }

  async saveKickEvent(address: string, era: number, nominator: string, timestamp: number, writeToUserMapping: boolean): Promise<void> {
    const result = await this.KickEventModel?.create({
      address: address,
      era: era,
      nominator: nominator,
      timestamp: timestamp
    }).catch(() => {
      // it is ok
      //console.error(err);
    });
    if (writeToUserMapping === true && result !== undefined) {
      await this.saveUserEventToMapping(address, result.id, EventTypes.kick, era);
    }
  }

  async saveChillEvent(address: string, era: number, timestamp: number, writeToUserMapping: boolean): Promise<void> {
    const result = await this.ChillEventModel?.create({
      address: address,
      era: era,
      timestamp: timestamp
    }).catch(() => {
      // it is ok
      //console.error(err);
    });
    if (writeToUserMapping === true && result !== undefined) {
      await this.saveUserEventToMapping(address, result.id, EventTypes.chill, era);
    }
  }

  async saveOverSubscribeEvent(address: string, era: number, nominators: IndividualExposure[], writeToUserMapping: boolean): Promise<void> {
    const result = await this.OverSubscribeEventModel?.create({
      address: address,
      era: era,
      nominators: nominators
    }).catch(() => {
      // it is ok
      //console.error(err);
    });
    if (writeToUserMapping === true && result !== undefined) {
      nominators.forEach(async (n) => {
        await this.saveUserEventToMapping(n.who, result.id, EventTypes.overSubsribe, era);
      });
    }
  }

  async saveUserEventToMapping(address: string, objectId: Types.ObjectId, type: number, era: number): Promise<void> {
    this.UserEventMappingModel?.create({
      address: address,
      mapping: objectId,
      type: type,
      era: era,
    }).catch(() => {
      // it is ok
    });
  }

  __validateNominationInfo(id: string, data: ValidatorCache): boolean {
    if (!Number.isInteger(data.era)) {
      logger.error('data.era is not an integer');
      logger.error(id);
      logger.error(data);
      return false;
    }
    if (!Array.isArray(data.exposure.others)) {
      logger.error('data.exposure is not an array');
      logger.error(id);
      logger.error(data);
      return false;
    }
    if (!Array.isArray(data.nominators)) {
      logger.error('data.nominators is not an array');
      logger.error(id);
      logger.error(data);
      return false;
    }
    for (let i = 0; i < data.exposure.others.length; i++) {
      if (data.exposure.others[i] !== undefined) {
        if (data.exposure.others[i].who === undefined || data.exposure.others[i].value === undefined) {
          logger.error('incorrect exposure format');
          logger.error(id);
          logger.error(data);
          return false;
        }
      }
    }
    return true;
  }
}
