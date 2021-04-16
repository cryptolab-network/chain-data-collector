import axios from 'axios';
import moment from 'moment';
import { ChainData } from './chainData';
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
  }

  toJSON() {
    return {
      aggregate: this.aggregate,
      rank: this.rank,
      oneKvNominated: this.oneKvNominated,
      unclaimedEra: this.unclaimedEra,
      inclusion: this.inclusion,
      name: this.name,
      stash: this.stash,
      identity: this.identity,
      nominatedAt: moment(this.nominatedAt).format(),
      elected: this.elected,
    };
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

export class OneKvHandler {
  chaindata: ChainData
  constructor(chaindata: ChainData) {
    this.chaindata = chaindata;
  }

  async getValidValidators() {
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
      valid = valid.map((candidate) => {
        if (activeValidators?.indexOf(candidate.stash) !== -1) {
          candidate.elected = true;
          electedCount++;
        } else {
          candidate.elected = false;
        }
        return candidate;
      })
      const oneKvSummary = new OneKvSummary(activeEra, electedCount, valid);
      return oneKvSummary;
    } else {
      throw new Error(
        'Failed to fetch validators from the chain.' 
      );
    }
  }
}
