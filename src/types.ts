export { Identity, BalancedNominator, Balance, Validator, Exposure, ValidatorDbSchema, NominationDbSchema, StatusChange, IdentityDbSchema, EraRewardDist };
import type { EraIndex as PolkadotEraIndex, Exposure as PolkadotExposure,
  StakingLedger as PolkadotStakingLedger, ValidatorPrefs as PolkadotValidatorPrefs } from '@polkadot/types/interfaces';
import { LeanDocument } from 'mongoose';
import { IBalance } from './db/schema';

// eslint-disable-next-line
const divide = require('divide-bigint');

class Identity {
  address: string
  display?: string
  displayParent?: string
  
  constructor(address: string) {
    this.address = address;
  }

  getIdentity(): string {
    if(this.display === undefined || this.display === null) {
      return this.address;
    } else {
      if(this.displayParent !== undefined && this.displayParent !== null) {
        return this.displayParent + '/' + this.display;
      } else {
        return this.display;
      }
    }
  }
}

class Balance {
  freeBalance: bigint
  lockedBalance: bigint
  constructor(free: bigint, locked: bigint) {
    this.freeBalance = free;
    this.lockedBalance = locked;
  }

  exportString(): string {
    return JSON.stringify({
      freeBalance: __toHexString(this.freeBalance as bigint),
      lockedBalance: __toHexString(this.lockedBalance as bigint)
    });
  }
  
  toLeanDocument(): LeanDocument<IBalance> {
    return {
      freeBalance: __toHexString(this.freeBalance as bigint),
      lockedBalance: __toHexString(this.lockedBalance as bigint)
    };
  }

  toObject(): {freeBalance: string, lockedBalance: string} {
    return {
      freeBalance: __toHexString(this.freeBalance as bigint),
      lockedBalance: __toHexString(this.lockedBalance as bigint)
    };
  }
}

class BalancedNominator {
  address: string
  targets: string[]
  balance: Balance
  constructor(address: string, targets: string[], balance: Balance) {
    this.address = address;
    this.targets = targets;
    this.balance = balance;
  }

  exportString(): string {
    return JSON.stringify({
      address: this.address,
      targets: this.targets,
      balance: this.balance.exportString(),
    });
  }

  toObject(): {address: string, targets: string[], balance: {freeBalance: string, lockedBalance: string}} {
    return {
      address: this.address,
      targets: this.targets,
      balance: this.balance.toObject(),
    };
  }
}

// StakingLedger, ValidatorPrefs
class Validator {
  accountId: string
  exposure: Exposure
  identity: Identity
  stakingLedger: StakingLedger
  prefs: ValidatorPrefs
  active: boolean
  nominators: BalancedNominator[]
  activeNominators: number
  totalNominators: number
  constructor(accountId: string, exposure: PolkadotExposure, stakingLedger: PolkadotStakingLedger, prefs: PolkadotValidatorPrefs) {
    this.accountId = accountId;
    const others: IndividualExposure[] = [];
    exposure.others.forEach((other)=>{
      others.push(new IndividualExposure(other.who.toString(), other.value.toBigInt()));
    })
    this.exposure = new Exposure(exposure.total.toBigInt(), exposure.own.toBigInt(), others);
    this.stakingLedger = new StakingLedger(stakingLedger.stash.toString(),
      stakingLedger.total.toBigInt(), stakingLedger.active.toBigInt(), stakingLedger.claimedRewards);
    this.prefs = new ValidatorPrefs(prefs.commission.toNumber(), prefs.blocked.isTrue);
    this.active = true;
    this.nominators = [];
    this.activeNominators = 0;
    this.totalNominators = 0;
    this.identity = new Identity(accountId);
  }

  exportString(): string {
    return JSON.stringify({
      accountId: this.accountId,
      exposure: this.exposure.exportString(),
      identity: this.identity,
      stakingLedger: this.stakingLedger.exportString(),
      prefs: this.prefs,
      active: this.active,
      nominators: this.nominators.map((n) => {return n.exportString()}),
      activeNominators: this.activeNominators,
      totalNominators: this.totalNominators,
    });
  }

  toObject(): {accountId: string, exposure: {total: string, own: string, others: { who: string, value: string }[]}, identity: Identity,
    stakingLedger: {stashId: string, total: string, active: string, claimedRewardCount: number}, prefs: ValidatorPrefs, active: boolean,
    nominators: {address: string, targets: string[], balance: {freeBalance: string, lockedBalance: string}}[], activeNominators: number
    totalNominators: number } {
      return {
        accountId: this.accountId,
        exposure: this.exposure.toObject(),
        identity: this.identity,
        stakingLedger: this.stakingLedger.toObject(),
        prefs: this.prefs,
        active: this.active,
        nominators: this.nominators.map((n) => {return n.toObject()}),
        activeNominators: this.activeNominators,
        totalNominators: this.totalNominators,
      };
    }

  apy(decimals: bigint, eraReward: bigint, validatorCount: number, multiplier: number): number {
    const active = divide(this.exposure.total, decimals);
    const commission = this.prefs.commission / 10000000;
    const avgRewardOfValidator = divide(eraReward, decimals) / validatorCount;
    const apy = active === 0 ? 0 : (avgRewardOfValidator * (1 - commission / 100) * 365) / active * multiplier;
    return apy;
  }
}

class Exposure {
  total: bigint
  own: bigint
  others: IndividualExposure[]
  constructor(total: string | bigint, own: string | bigint, others: IndividualExposure[]) {
    if(typeof total === 'string') {
      total = BigInt(total);
    }
    this.total = total;
    if(typeof own === 'string') {
      own = BigInt(own);
    }
    this.own = own;
    this.others = others;
  }

  exportString(): string {
    return JSON.stringify({
      total: __toHexString(this.total as bigint),
      own: __toHexString(this.own as bigint),
      others: this.others.map((v)=>{
        return v.exportString();
      })
    });
  }

  toObject(): {total: string, own: string, others: { who: string, value: string }[]} {
    return {
      total: __toHexString(this.total as bigint),
      own: __toHexString(this.own as bigint),
      others: this.others.map((v)=>{
        return v.toObject();
      })
    };
  }
}

class IndividualExposure {
  who: string
  value: string | bigint
  constructor(who: string, value: string | bigint) {
    this.who = who;
    this.value = value;
  }

  exportString(): string {
    return JSON.stringify({
      who: this.who,
      value: __toHexString(this.value as bigint),
    });
  }

  toObject(): { who: string, value: string } {
    return {
      who: this.who,
      value: __toHexString(this.value as bigint),
    };
  }
}

class StakingLedger {
  stashId: string
  total: string | bigint
  active: string | bigint
  claimedRewards: PolkadotEraIndex[]
  constructor(stashId: string, total: string | bigint, active: string | bigint, claimedRewards: PolkadotEraIndex[]) {
    this.stashId = stashId;
    this.total = total;
    this.active = active;
    this.claimedRewards =  claimedRewards;
  }

  exportString(): string {
    return JSON.stringify({
      stashId: this.stashId,
      total: this.total.toString(),
      active: this.active.toString(),
      claimedRewardCount: this.claimedRewards.length,
    });
  }

  toObject(): {stashId: string, total: string, active: string, claimedRewardCount: number} {
    return {
      stashId: this.stashId,
      total: this.total.toString(),
      active: this.active.toString(),
      claimedRewardCount: this.claimedRewards.length,
    };
  }
}

class ValidatorPrefs {
  commission: number
  blocked: boolean
  constructor(commission: number, blocked: boolean) {
    this.commission = commission;
    this.blocked = blocked;
  }

  commissionPct() {
    return this.commission / 10000000;
  }
}

export class ValidatorCache {
  id: string
  era: number
  exposure: Exposure
  commission: number
  apy: number
  identity: Identity
  nominators: string[]
  commissionChanged: number
  stakerPoints: StakerPoint[]
  total: bigint

  constructor(id: string, era: number, exposure: Exposure, commission: number,
  apy: number, identity: Identity | undefined, nominators: string[], commissionChanged: number, stakerPoints: StakerPoint[], total: bigint) {
    this.id = id;
    this.era = era;
    this.exposure = exposure;
    this.commission = commission;
    this.apy = apy;
    this.identity = identity || new Identity(id);
    this.nominators = nominators;
    this.commissionChanged = commissionChanged;
    this.stakerPoints = stakerPoints;
    this.total = total;
  }

  toValidatorDbSchema(): ValidatorDbSchema {
    return new ValidatorDbSchema(this.id, new IdentityDbSchema(this.identity.getIdentity()),
    new StatusChange(this.commissionChanged), this.stakerPoints);
  }

  toNominationDbSchema(): NominationDbSchema {
    return new NominationDbSchema(this.era, this.exposure, this.nominators, this.commission, this.apy, this.id, this.total);
  }
}

export class ValidatorUnclaimedEras {
  eras: number[]
  id: string

  constructor(id: string, eras: number[]) {
    this.id = id;
    this.eras = eras;
  }
}

class ValidatorDbSchema {
  id: string
  identity: IdentityDbSchema
  statusChange: StatusChange
  info?: NominationDbSchema[]
  rewards?: ValidatorTotalReward
  stakerPoints: StakerPoint[]
  constructor(id: string, identity: IdentityDbSchema, statusChange: StatusChange, stakerPoints: StakerPoint[]) {
    this.id = id;
    this.identity = identity;
    this.statusChange = statusChange;
    this.stakerPoints = stakerPoints;
  }
}

class StatusChange {
  commission: number // 0: no change, 1: up, 2: down
  constructor(commission: number) {
    this.commission = commission;
  }
}

class IdentityDbSchema {
  display: string
  constructor(display: string) {
    this.display = display;
  }
}


/*{
  era: Number,
  exposure:{
    total: String,
    own: Number,
    others: [
      {
        who: String,
        value: Number,
      }
    ]
  },
  nominators: [Object],
  commission: Number,
  apy: Number,
  validator: String
}*/
class NominationDbSchema {
  era: number
  exposure: Exposure
  nominators: string[]
  commission: number
  apy: number
  validator: string
  total: string
  constructor(era: number, exposure: Exposure, nominators: string[], commission: number, apy: number, validator: string, total: string | bigint) {
    this.era = era;
    this.exposure = exposure;
    this.nominators = nominators;
    this.commission = commission;
    this.apy = apy;
    this.validator = validator;
    if(typeof total === 'bigint') {
      this.total = __toHexString(total);
    } else {
      this.total = total;
    }
  }

  exportString(): string {
    return JSON.stringify({
      era: this.era,
      exposure: this.exposure.exportString(),
      nominators: this.nominators,
      commission: this.commission,
      apy: this.apy,
      validator: this.validator,
      total: this.total,
    });
  }

  toObject(): {era: number, exposure: { total: string, own: string, others: { who: string, value: string }[]},
    nominators: string[], commission: number, apy: number, validator: string, total: string} {
    return {
      era: this.era,
      exposure: this.exposure.toObject(),
      nominators: this.nominators,
      commission: this.commission,
      apy: this.apy,
      validator: this.validator,
      total: this.total,
    };
  }
}

class EraRewardDist {
  era: number
  total: number
  individual: Map<string, number>
  constructor(era: number, total: number, individual: Map<string, number>) {
    this.era = era;
    this.total = total;
    this.individual = individual;
  }
}

export class ValidatorTotalReward {
  start: number
  end: number
  total: number
  constructor(start: number, end: number, total: number) {
    this.start = start;
    this.end = end;
    this.total = total;
  }
}

export class ValidatorEraReward {
  era: number
  reward: number
  constructor(era: number, reward: number) {
    this.era = era;
    this.reward = reward;
  }
}

export class StakerPoint {
  era: number
  points: number
  constructor(era: number, points: number) {
    this.era = era;
    this.points = points;
  }
}

export class ValidatorSlash {
  era: number
  address: string
  own: string
  others: string[][]
  constructor(era: number, address: string, own: string | bigint, others: string[][]) {
    if(typeof own === 'bigint') {
      this.own = __toHexString(own);
    } else {
      this.own = own;
    }
    this.others = others.map((other)=>{
      return [
        other[0],
        __toHexString(BigInt(other[1]))
      ];
    });
    this.era = era;
    this.address = address;
  }
}

export class NominatorSlash {
  address: string
  era: number
  total: string
  validator: string
  constructor(address: string, era: number, total: string, validator: string) {
    this.address = address;
    this.era = era;
    this.total = total;
    this.validator = validator;
  }
}

export class AllValidatorNominator {
  validators: Validator[]
  balancedNominators: BalancedNominator[]

  constructor(validators: Validator[], balancedNominators: BalancedNominator[]) {
    this.validators = validators;
    this.balancedNominators = balancedNominators;
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
