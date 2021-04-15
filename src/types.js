"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusChange = exports.NominationDbSchema = exports.ValidatorDbSchema = exports.Exposure = exports.Validator = exports.Balance = exports.BalancedNominator = exports.Identity = void 0;
class Identity {
    constructor(address) {
        this.address = address;
    }
    getIdentity() {
        if (this.display === undefined) {
            return this.address;
        }
        else {
            return this.display + '/' + this.displayParent;
        }
    }
}
exports.Identity = Identity;
class Balance {
    constructor(free, locked) {
        this.freeBalance = free;
        this.lockedBalance = locked;
    }
}
exports.Balance = Balance;
class BalancedNominator {
    constructor(address, targets, balance) {
        this.address = address;
        this.targets = targets;
        this.balance = balance;
    }
}
exports.BalancedNominator = BalancedNominator;
// StakingLedger, ValidatorPrefs
class Validator {
    constructor(accountId, exposure, stakingLedger, prefs) {
        this.accountId = accountId;
        const others = [];
        exposure.others.forEach((other) => {
            others.push(new IndividualExposure(other.who.toString(), other.value.toBigInt()));
        });
        this.exposure = new Exposure(exposure.total.toBigInt(), exposure.own.toBigInt(), others);
        this.stakingLedger = new StakingLedger(stakingLedger.stash.toString(), stakingLedger.total.toBigInt(), stakingLedger.active.toBigInt(), stakingLedger.claimedRewards.length);
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
    apy(decimals, eraReward, validatorCount) {
        const active = this.exposure.total / decimals;
        const commission = this.prefs.commission / 10000000;
        const avgRewardOfValidator = ((eraReward / decimals) / BigInt(validatorCount));
        const apy = active === BigInt(0) ? 0 : (Number(avgRewardOfValidator) * (1 - commission / 100) * 365) / Number(active) * 4;
        return apy;
    }
}
exports.Validator = Validator;
class Exposure {
    constructor(total, own, others) {
        if (typeof total === 'string') {
            total = BigInt(total);
        }
        this.total = total;
        if (typeof own === 'string') {
            own = BigInt(own);
        }
        this.own = own;
        this.others = others;
    }
}
exports.Exposure = Exposure;
class IndividualExposure {
    constructor(who, value) {
        this.who = who;
        this.value = value;
    }
}
class StakingLedger {
    constructor(stashId, total, active, claimedRewardCount) {
        this.stashId = stashId;
        this.total = total;
        this.active = active;
        this.claimedRewardCount = claimedRewardCount;
    }
}
class ValidatorPrefs {
    constructor(commission, blocked) {
        this.commission = commission;
        this.blocked = blocked;
    }
    commissionPct() {
        return this.commission / 10000000;
    }
}
class ValidatorDbSchema {
    constructor(id, identity, statusChange) {
        this.id = id;
        this.identity = identity;
        this.statusChange = statusChange;
    }
}
exports.ValidatorDbSchema = ValidatorDbSchema;
class StatusChange {
    constructor(commission) {
        this.commission = commission;
    }
}
exports.StatusChange = StatusChange;
class IdentityDbSchema {
    constructor(display) {
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
    constructor(era, exposure, nominators, commission, apy, validator) {
        this.era = era;
        this.exposure = exposure;
        this.nominators = nominators;
        this.commission = commission;
        this.apy = apy;
        this.validator = validator;
    }
}
exports.NominationDbSchema = NominationDbSchema;
