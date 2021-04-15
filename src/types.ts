export { Identity, BalancedNominator, Balance, Validator, Exposure, ValidatorDbSchema, NominationDbSchema, StatusChange };
import type { AccountId, EraIndex, Exposure as PolkadotExposure, Nominations,
  RewardDestination, StakingLedger as PolkadotStakingLedger, ValidatorPrefs as PolkadotValidatorPrefs } from '@polkadot/types/interfaces';

class Identity {
  address: string
  display?: string
  displayParent?: string
  
  constructor(address: string) {
    this.address = address;
  }

  getIdentity() {
    if(this.display === undefined) {
      return this.address;
    } else {
      return this.display + '/' + this.displayParent;
    }
  }
}

class Balance {
  freeBalance: bigint
  lockedBalance:bigint
  constructor(free: bigint, locked: bigint) {
    this.freeBalance = free;
    this.lockedBalance = locked;
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
}

// StakingLedger, ValidatorPrefs
class Validator {
  accountId: string
  exposure: Exposure
  identity?: Identity
  stakingLedger: StakingLedger
  prefs: ValidatorPrefs
  active: boolean
  nominators: BalancedNominator[]
  constructor(accountId: string, exposure: PolkadotExposure, stakingLedger: PolkadotStakingLedger, prefs: PolkadotValidatorPrefs) {
    this.accountId = accountId;
    const others: IndividualExposure[] = [];
    exposure.others.forEach((other)=>{
      others.push(new IndividualExposure(other.who.toString(), other.value.toBigInt()));
    })
    this.exposure = new Exposure(exposure.total.toBigInt(), exposure.own.toBigInt(), others);
    this.stakingLedger = new StakingLedger(stakingLedger.stash.toString(),
      stakingLedger.total.toBigInt(), stakingLedger.active.toBigInt(), stakingLedger.claimedRewards.length);
    this.prefs = new ValidatorPrefs(prefs.commission.toNumber(), prefs.blocked.isTrue);
    this.active = true;
    this.nominators = [];
  }

  // const v = validators[i];
  //     const activeKSM = new BigNumber(v.exposure.total).toNumber()/KUSAMA_DECIMAL;
  //     const commission = v.validatorPrefs.commission / 10000000;
  //     // console.log(`(((${eraReward} / ${KUSAMA_DECIMAL}) / ${validatorCount}) * (1 - ${commission}) * 365) / ${activeKSM} * 4`);
  //     const apy = activeKSM === 0 ? 0 : (((eraReward / KUSAMA_DECIMAL) / validatorCount) * (1 - commission/100) * 365) / activeKSM * 4;
  //     v.apy = apy;
  //     if (isNaN(apy)) {
  //       // console.log(`(((${eraReward} / ${KUSAMA_DECIMAL}) / ${validatorCount}) * (1 - ${commission}) * 365) / ${activeKSM} * 4`);
  //       v.apy = 0;
  //     }
  apy(decimals: bigint, eraReward: bigint, validatorCount: number) {
    const active = this.exposure.total / decimals;
    const commission = this.prefs.commission / 10000000;
    const avgRewardOfValidator = ((eraReward / decimals) / BigInt(validatorCount));
    const apy = active === BigInt(0) ? 0 : (Number(avgRewardOfValidator) * (1 - commission / 100) * 365) / Number(active) * 4;
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
}

class IndividualExposure {
  who: string
  value: string | bigint
  constructor(who: string, value: string | bigint) {
    this.who = who;
    this.value = value;
  }
}

class StakingLedger {
  stashId: string
  total: string | bigint
  active: string | bigint
  claimedRewardCount: number
  constructor(stashId: string, total: string | bigint, active: string | bigint, claimedRewardCount: number) {
    this.stashId = stashId;
    this.total = total;
    this.active = active;
    this.claimedRewardCount = claimedRewardCount;
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

class ValidatorDbSchema {
  id:  String
  identity: IdentityDbSchema
  statusChange: StatusChange
  info?: NominationDbSchema[]
  constructor(id: string, identity: IdentityDbSchema, statusChange: StatusChange) {
    this.id = id;
    this.identity = identity;
    this.statusChange = statusChange;
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
  nominators: BalancedNominator[]
  commission: number
  apy: number
  validator: string
  constructor(era: number, exposure: Exposure, nominators: BalancedNominator[], commission: number, apy: number, validator: string) {
    this.era = era;
    this.exposure = exposure;
    this.nominators = nominators;
    this.commission = commission;
    this.apy = apy;
    this.validator = validator;
  }
}