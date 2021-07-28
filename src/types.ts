export { Identity, BalancedNominator, Balance, Validator, Exposure, ValidatorDbSchema, NominationDbSchema, StatusChange, IdentityDbSchema, EraRewardDist };
import type { EraIndex as PolkadotEraIndex, Exposure as PolkadotExposure,
  StakingLedger as PolkadotStakingLedger, ValidatorPrefs as PolkadotValidatorPrefs } from '@polkadot/types/interfaces';
import { LeanDocument } from 'mongoose';
import { IBalance } from './db/schema';
import { logger } from './logger';

// eslint-disable-next-line
const divide = require('divide-bigint');

class Identity {
  address: string
  private parent?: string
  private sub?: string
  private verified: boolean
  
  constructor(address: string) {
    this.address = address;
    this.verified = false;
  }

  static fromObject(obj: Identity): Identity {
    const identity = new Identity(obj.address);
    identity.parent = obj.parent;
    identity.sub = obj.sub;
    identity.verified = obj.verified;
    return identity;
  }

  set(parent: string | undefined, sub: string | undefined, isVerified: boolean): void {
    this.parent = parent;
    this.sub = sub;
    this.verified = isVerified;
  }

  isEqual(other: Identity): boolean {
    if (this.address !== other.address) {
      logger.debug(`Identity address mismatch ${this.address} ${other.address}`);
      return false;
    }
    if (this.parent !== other.parent) {
      logger.debug(`Identity parent mismatch ${this.parent} ${other.parent}`);
      return false;
    }
    if (this.sub !== other.sub) {
      logger.debug(`Identity sub mismatch ${this.sub} ${other.sub}`);
      return false;
    }
    if(this.isVerified !== other.isVerified) {
      logger.debug(`Identity is verified mismatch ${this.isVerified} ${other.isVerified}`);
      return false;
    }
    return true;
  }

  getIdentity(): string {
    if(this.parent === undefined && this.sub === null) {
      return this.address;
    } else {
      if(this.parent !== undefined && this.sub !== null) {
        return this.parent + '/' + this.sub;
      } else if (this.parent === undefined && this.sub !== undefined) {
        return this.sub;
      } else {
        return this.address;
      }
    }
  }

  getParent(): string | undefined {
    return this.parent;
  }

  getSub(): string | undefined {
    return this.sub;
  }

  isVerified(): boolean {
    return this.verified;
  }
}

class Balance {
  freeBalance: bigint
  lockedBalance: bigint
  constructor(free: string | bigint, locked: string | bigint) {
    if (typeof free === 'string') {
      this.freeBalance = BigInt(free);
    } else {
      this.freeBalance = free;
    }
    if (typeof locked === 'string') {
      this.lockedBalance = BigInt(locked);
    } else {
      this.lockedBalance = locked;
    }
  }

  isEqual(other: Balance): boolean {
    if (this.freeBalance !== other.freeBalance) {
      return false;
    }
    if( this.lockedBalance !== other.lockedBalance) {
      return false;
    }
    return true;
  }

  static fromObject(obj: Balance): Balance {
    return new Balance(obj.freeBalance, obj.lockedBalance);
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

  static fromObject(obj: BalancedNominator): BalancedNominator {
    return new BalancedNominator(obj.address, obj.targets, Balance.fromObject(obj.balance));
  }

  isEqual(other: BalancedNominator): boolean {
    if (this.address !== other.address) {
      return false;
    }
    if (!this.balance.isEqual(other.balance)) {
      return false;
    }
    if (!this.targets.every((n) => other.targets.indexOf(n) >= 0)) {
      return false;
    }
    return true;
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
  selfStake: bigint
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
    this.selfStake = BigInt(0);
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
      selfStake: __toHexString(this.selfStake as bigint),
    });
  }

  toObject(): {accountId: string, exposure: {total: string, own: string, others: { who: string, value: string }[]}, identity: Identity,
    stakingLedger: {stashId: string, total: string, active: string, claimedRewardCount: number}, prefs: ValidatorPrefs, active: boolean,
    nominators: {address: string, targets: string[], balance: {freeBalance: string, lockedBalance: string}}[], activeNominators: number
    totalNominators: number, selfStake: string } {
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
        selfStake: __toHexString(this.selfStake as bigint),
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

  static fromObject(obj: Exposure): Exposure {
    return new Exposure(obj.total, obj.own, obj.others);
  }

  isEqual(other: Exposure): boolean {
    if (this.total !== other.total) {
      return false;
    }
    if (this.own !== other.own) {
      return false;
    }
    return true;
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
  selfStake: bigint

  constructor(id: string, era: number, exposure: Exposure, commission: number,
  apy: number, identity: Identity | undefined, nominators: string[], commissionChanged: number,
  stakerPoints: StakerPoint[], total: string | bigint, selfStake: string | bigint) {
    this.id = id;
    this.era = era;
    this.exposure = exposure;
    this.commission = commission;
    this.apy = apy;
    this.identity = identity || new Identity(id);
    this.nominators = nominators;
    this.commissionChanged = commissionChanged;
    this.stakerPoints = stakerPoints;
    if (typeof total === 'string') {
      this.total = BigInt(total);
    } else {
      this.total = total;
    }
    if (typeof selfStake === 'string') {
      this.selfStake = BigInt(selfStake);
    } else {
      this.selfStake = selfStake;
    }
  }

  static fromObject(obj: ValidatorCache): ValidatorCache {
    return new ValidatorCache(obj.id, obj.era, Exposure.fromObject(obj.exposure), obj.commission, obj.apy,
      Identity.fromObject(obj.identity), obj.nominators, obj.commissionChanged, obj.stakerPoints, obj.total, obj.selfStake);
  }

  isEqual(other: ValidatorCache): boolean {
    if (this.id !== other.id) {
      logger.debug(`id mismatch: ${this.id} ${other.id}`);
      return false;
    }
    if (this.era !== other.era) {
      logger.debug(`era mismatch: ${this.era} ${other.era}`);
      return false;
    }
    if (!this.exposure.isEqual(other.exposure)) {
      logger.debug(`exposure mismatch: ${this.exposure.exportString()} ${other.exposure.exportString()}`);
      return false;
    }
    if (this.commission !== other.commission) {
      logger.debug(`commission mismatch: ${this.commission} ${other.commission}`);
      return false;
    }
    if (this.apy !== other.apy) {
      logger.debug(`apy mismatch: ${this.apy} ${other.apy}`);
      return false;
    }
    if (!this.identity.isEqual(other.identity)) {
      logger.debug(`identity mismatch: ${this.identity.getIdentity()} ${other.identity.getIdentity()}`);
      return false;
    }
    if (this.nominators.length !== other.nominators.length) {
      logger.debug(`nominator length mismatch: ${this.nominators.length} ${other.nominators.length}`);
      return false;
    }
    if (!this.nominators.every((n) => other.nominators.indexOf(n) >= 0)) {
      logger.debug(`nominators mismatch`);
      return false;
    }
    if (this.commissionChanged !== other.commissionChanged) {
      logger.debug(`commission changed: ${this.commissionChanged} ${other.commissionChanged}`);
      return false;
    }
    if (this.stakerPoints.length !== other.stakerPoints.length) {
      logger.debug(`stakerPoints mismatch`);
      return false;
    }
    // stakerpoint does not need to be compared, because it only changes when era change
    // so we skip it, hopefulily it will do.
    if (this.total !== other.total) {
      logger.debug(`total mismatch ${this.total} ${other.total}`);
      return false;
    }
    if(this.selfStake !== other.selfStake) {
      logger.debug(`self stake mismatch ${this.selfStake} ${other.selfStake}`);
      return false;
    }
    return true;
  }

  toValidatorDbSchema(): ValidatorDbSchema {
    return new ValidatorDbSchema(this.id,
      new IdentityDbSchema(this.identity.getIdentity(), this.identity.getParent(),
      this.identity.getSub(), this.identity.isVerified()),
    new StatusChange(this.commissionChanged), this.stakerPoints);
  }

  toNominationDbSchema(): NominationDbSchema {
    return new NominationDbSchema(this.era, this.exposure, this.nominators,
      this.commission, this.apy, this.id, this.total, this.selfStake);
  }
}

export class ValidatorUnclaimedEras {
  eras: number[]
  id: string

  constructor(id: string, eras: number[]) {
    this.id = id;
    this.eras = eras;
  }

  static fromObject(obj: ValidatorUnclaimedEras): ValidatorUnclaimedEras {
    return new ValidatorUnclaimedEras(obj.id, obj.eras);
  }

  isEqual(other: ValidatorUnclaimedEras): boolean {
    if (this.id !== other.id) {
      return false;
    }
    if (!this.eras.every((n) => other.eras.indexOf(n) >= 0)) {
      logger.debug(`unclaimed eras mismatch`);
      return false;
    }
    return true;
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
  parent?: string
  isVerified: boolean
  sub?: string
  constructor(display: string, parent: string | undefined, sub: string | undefined, isVerified: boolean) {
    this.display = display;
    this.parent = parent;
    this.sub = sub;
    this.isVerified = isVerified;
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
  selfStake: string
  constructor(era: number, exposure: Exposure, nominators: string[], commission: number,
    apy: number, validator: string, total: string | bigint, selfStake: string | bigint) {
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
    if(typeof selfStake === 'bigint') {
      this.selfStake = __toHexString(selfStake);
    } else {
      this.selfStake = selfStake;
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
      selfStake: this.selfStake,
    });
  }

  toObject(): {era: number, exposure: { total: string, own: string, others: { who: string, value: string }[]},
    nominators: string[], commission: number, apy: number, validator: string, total: string, selfStake: string} {
    return {
      era: this.era,
      exposure: this.exposure.toObject(),
      nominators: this.nominators,
      commission: this.commission,
      apy: this.apy,
      validator: this.validator,
      total: this.total,
      selfStake: this.selfStake
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
