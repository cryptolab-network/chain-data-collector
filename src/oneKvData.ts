import axios from 'axios';
import moment from 'moment';
import { ChainData } from './chainData';
import { Cache } from './cacheData';
import { set } from 'mongoose';
import { DatabaseHandler } from './db/database';
import { Validator } from './types';
const keys = require('../config/keys');
const NODE_RPC_URL = keys.API_1KV_KUSAMA;

export class OneKvSummary {
  activeEra: number
  validatorCount: number
  electedCount: number
  electionRate: number
  valid: OneKvValidatorInfo[]
  constructor(activeEra: number, electedCount: number, valid: OneKvValidatorInfo[]) {
    this.activeEra = activeEra;
    this.validatorCount = valid.length;
    this.electedCount = electedCount;
    this.electionRate = (electedCount / valid.length),
    this.valid = valid;
  }

  toJSON() {
    return {
      activeEra: this.activeEra,
      validatorCount: this.validatorCount,
      electedCount: this.electedCount,
      electionRate: this.electionRate,
      valid: this.valid.map((v: OneKvValidatorInfo)=>{
        return  {
          aggregate: v.aggregate,
          rank: v.rank,
          oneKvNominated: v.oneKvNominated,
          unclaimedEra: v.unclaimedEra,
          inclusion: v.inclusion,
          name: v.name,
          stash: v.stash,
          identity: v.identity,
          nominatedAt: moment(v.nominatedAt).format(),
          elected: v.elected,
          activeNominators: v.activeNominators,
          totalNominators: v.totalNominators,
          stakingInfo: {
            stakingLedger: v.detail?.stakingLedger.exportString(),
            validatorPrefs: v.detail?.prefs,
            stashId: v.stash,
          }
        };
      }),
    }
  }
}

class OneKvValidatorInfo {
  aggregate: Aggregate
  rank: number
  oneKvNominated: boolean
  unclaimedEra: number[]
  inclusion: number
  name: string
  stash: string
  identity: Identity
  nominatedAt: number
  elected: boolean
  activeNominators: number
  totalNominators: number
  detail?: Validator
  constructor(aggregate: Aggregate,
    rank: number,
    unclaimedEra: number[],
    inclusion: number,
    name: string,
    stash: string,
    identity: Identity,
    nominatedAt: number) {
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
    this.activeNominators = 0;
    this.totalNominators = 0;
  }
}

class Aggregate {
  total: number
  aggregate: number
  inclusion: number
  discovered: number
  nominated: number
  rank: number
  unclaimed: number
  bonded: number
  faults: number
  offline: number
  randomness: number
  updated: number

  constructor(total: number,
    aggregate: number,
    inclusion: number,
    discovered: number,
    nominated: number,
    rank: number,
    unclaimed: number,
    bonded: number,
    faults: number,
    offline: number,
    randomness: number,
    updated: number) {
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
      this.updated = updated
  }
}

class Identity {
  name: string
  verified: boolean
  constructor(name: string, verified: boolean) {
    this.name = name;
    this.verified = verified;
  }
}

class OneKvNominatorInfo {
  current: string[] | OneKvNominatedInfoDetail[]
  lastNomination: number
  address: string
  constructor(current: string[] | OneKvNominatedInfoDetail[], lastNomination: number, address: string) {
    this.current = current;
    this.lastNomination = lastNomination;
    this.address = address;
  }
  toJSON() {
    return {
      current: this.current,
      address: this.address,
      lastNomination: moment(this.lastNomination).format(),
    };
  }
}

export class OneKvNominatedInfoDetail {
  stash: string
  name: string
  elected: boolean
  constructor(stash: string, name: string, elected: boolean) {
    this.stash = stash;
    this.name = name;
    this.elected = elected;
  }
}

export class OneKvNominatorSummary {
  activeEra: number
  nominators: OneKvNominatorInfo[]
  constructor(activeEra: number, nominators: OneKvNominatorInfo[]) {
    this.activeEra = activeEra;
    this.nominators = nominators;
  }
}

export class OneKvHandler {
  chaindata: ChainData
  cachedata: Cache
  db: DatabaseHandler
  constructor(chaindata: ChainData, cachedata: Cache, db: DatabaseHandler) {
    this.chaindata = chaindata;
    this.cachedata = cachedata;
    this.db = db;
  }

  async getOneKvNominators() {
    let res = await axios.get<OneKvNominatorInfo[]>(`${NODE_RPC_URL}/nominators`);
    if (res.status !== 200) {
      console.log(`no data`)
      throw new Error('Failed to fetch 1kv nominators.');
    }
    let nominators = res.data;
    let validCandidates = await this.cachedata.fetch<OneKvSummary>('onekv').catch((err)=>{
      console.error(err);
      throw new Error(err);
    });
    const activeEra = await this.chaindata.getActiveEraIndex();
    nominators = nominators.map((nominator, index, array) => {
      const current = (nominator.current as any[]).map((stash, index, array) => {
        let candidate = validCandidates.valid.find((c, index, array) => {
          return stash.stash === c.stash;
        });
        if (candidate === undefined) {
          return new OneKvNominatedInfoDetail(stash.stash, '', false);
        } else {
          return new OneKvNominatedInfoDetail(stash.stash, candidate.name, candidate.elected);
        }
      });
      return new OneKvNominatorInfo(current, nominator.lastNomination, nominator.address);
    });
    const summary = new OneKvNominatorSummary(activeEra, nominators);
    await this.cachedata.update('onekvNominators', summary);

    return summary;
  }

  async getValidValidators(validators: (Validator | undefined)[]) {
    const res = await axios.get<OneKvValidatorInfo[]>(`${NODE_RPC_URL}/valid`);
    if (res.status !== 200) {
      console.log(`no data`)
      throw new Error(
        'Failed to fetch 1kv validators.' 
      );
    }
    let valid = res.data;
    const eraValidatorInfo = await this.chaindata.getValidators();
    if(eraValidatorInfo !== undefined) {
      const activeValidators = eraValidatorInfo.activeStash;
      const activeEra = eraValidatorInfo.activeEra;
      let electedCount = 0;
      const promises = valid.map(async (candidate) => {
        const validator = validators.find(v => v?.accountId === candidate.stash);
        if(validator === undefined) {
          console.log(`cannot find ${candidate.stash} in validator set`);
          return;
        }
        candidate.detail = validator;
        if (activeValidators?.indexOf(candidate.stash) !== -1) {
          candidate.elected = true;
          electedCount++;
        } else {
          candidate.elected = false;
        }
        candidate.activeNominators = validator?.activeNominators || 0;
        candidate.totalNominators = validator?.totalNominators || 0;
        return candidate;
      });
      let newValid = await Promise.all(promises);
      valid = newValid.filter(function(v) {
        return v !== undefined;
      }) as OneKvValidatorInfo[];
      const oneKvSummary = new OneKvSummary(activeEra, electedCount, valid);
      return oneKvSummary;
    } else {
      throw new Error(
        'Failed to fetch validators from the chain.' 
      );
    }
  }
}
