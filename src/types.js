"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityDbSchema = exports.StatusChange = exports.NominationDbSchema = exports.ValidatorDbSchema = exports.Exposure = exports.Validator = exports.Balance = exports.BalancedNominator = exports.Identity = void 0;
const divide = require('divide-bigint');
class Identity {
    constructor(address) {
        this.address = address;
    }
    getIdentity() {
        if (this.display === undefined || this.display === null) {
            return this.address;
        }
        else {
            if (this.displayParent !== undefined && this.displayParent !== null) {
                return this.displayParent + '/' + this.display;
            }
            else {
                return this.display;
            }
        }
    }
}
exports.Identity = Identity;
class Balance {
    constructor(free, locked) {
        this.freeBalance = free;
        this.lockedBalance = locked;
    }
    exportString() {
        return {
            freeBalance: __toHexString(this.freeBalance),
            lockedBalance: __toHexString(this.lockedBalance)
        };
    }
}
exports.Balance = Balance;
class BalancedNominator {
    constructor(address, targets, balance) {
        this.address = address;
        this.targets = targets;
        this.balance = balance;
    }
    exportString() {
        return {
            address: this.address,
            targets: this.targets,
            balance: this.balance.exportString(),
        };
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
        this.stakingLedger = new StakingLedger(stakingLedger.stash.toString(), stakingLedger.total.toBigInt(), stakingLedger.active.toBigInt(), stakingLedger.claimedRewards);
        this.prefs = new ValidatorPrefs(prefs.commission.toNumber(), prefs.blocked.isTrue);
        this.active = true;
        this.nominators = [];
        this.activeNominators = 0;
        this.totalNominators = 0;
    }
    exportString() {
        return {
            accountId: this.accountId,
            exposure: this.exposure.exportString(),
            identity: this.identity,
            stakingLedger: this.stakingLedger.exportString(),
            prefs: this.prefs,
            active: this.active,
            nominators: this.nominators.map((n) => { return n.exportString(); }),
            activeNominators: this.activeNominators,
            totalNominators: this.totalNominators,
        };
    }
    apy(decimals, eraReward, validatorCount) {
        const active = divide(this.exposure.total, decimals);
        const commission = this.prefs.commission / 10000000;
        const avgRewardOfValidator = divide(eraReward, decimals) / validatorCount;
        const apy = active === 0 ? 0 : (avgRewardOfValidator * (1 - commission / 100) * 365) / active * 4;
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
    exportString() {
        return {
            total: __toHexString(this.total),
            own: __toHexString(this.own),
            others: this.others.map((v) => {
                return v.exportString();
            })
        };
    }
}
exports.Exposure = Exposure;
class IndividualExposure {
    constructor(who, value) {
        this.who = who;
        this.value = value;
    }
    exportString() {
        return {
            who: this.who,
            value: __toHexString(this.value),
        };
    }
}
class StakingLedger {
    constructor(stashId, total, active, claimedRewards) {
        this.stashId = stashId;
        this.total = total;
        this.active = active;
        this.claimedRewards = claimedRewards;
    }
    exportString() {
        return {
            stashId: this.stashId,
            total: this.total.toString(),
            active: this.active.toString(),
            claimedRewardCount: this.claimedRewards.length,
        };
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
exports.IdentityDbSchema = IdentityDbSchema;
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
    exportString() {
        return {
            era: this.era,
            exposure: this.exposure.exportString(),
            nominators: this.nominators.map((n) => {
                return n.exportString();
            }),
            commission: this.commission,
            apy: this.apy,
            validator: this.validator,
        };
    }
}
exports.NominationDbSchema = NominationDbSchema;
class EraIndex {
}
const __toHexString = (v) => {
    let hex = v.toString(16);
    if (hex.length % 2 === 1) {
        hex = '0' + hex;
    }
    hex = '0x' + hex;
    return hex;
};
