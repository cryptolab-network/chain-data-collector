import { ApiPromise, WsProvider } from '@polkadot/api';
import { DeriveAccountRegistration, DeriveStakerPoints } from '@polkadot/api-derive/types';
import { Identity, BalancedNominator, Balance, Validator, EraRewardDist, ValidatorSlash, AllValidatorNominator } from './types';
import { logger } from './logger';
import { Vec } from '@polkadot/types';
import { ValidatorId } from '@polkadot/types/interfaces';
import SlackBot from './slack';

export { ChainData };

const KUSAMA_APPROX_ERA_LENGTH_IN_BLOCKS = 3600;

async function sleep(millis: number) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

export class ApiError extends Error {
  constructor() {
    super(`Chain data API is not initialized`);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

class ChainData {
  url: string
  api?: ApiPromise
  slackBot?: SlackBot
  constructor(url: string, slackBot?: SlackBot) {
    this.url = url;
    this.slackBot = slackBot;
  }

  async connect(): Promise<void> {
    this.api = await ApiPromise.create({
      provider: new WsProvider(this.url, 5000),
    });
    this.api.on('disconnected', ()=>{
      logger.warn(`${this.url} is disconnected`);
      if (this.slackBot) {
        this.slackBot.send(`${this.url} is disconnected`);
      }
    });
    this.api.on('error', (e)=>{
      logger.warn(`${e}`);
    });
  }

  async getActiveEraIndex(): Promise<number> {
    if(this.api) {
      const activeEra = await this.api.query.staking.activeEra();
      if(activeEra !== undefined) {
        if (activeEra.isNone) {
          logger.warn(`NO ACTIVE ERA: ${activeEra.toString()}`);
          throw new Error('active era not found');
        }
        return activeEra.unwrap().index.toNumber();
      } else {
        throw new Error('active era not found');
      }
    } else {
      throw new ApiError();
    }
  }

  async findEraBlockHash(era: number): Promise<string> {
    if(!this.api) {
      throw new ApiError();
    }
    const activeEra = await this.getActiveEraIndex();

    if (era > activeEra) {
      throw new Error("It is a future era");
    }
  
    const latestBlock = await this.api?.rpc.chain.getBlock();
    if (latestBlock === undefined) {
      throw new Error('Failed to get the latest block hash');
    }
    if (era === activeEra) {
        return latestBlock.block.header.hash.toString();
    }
  
    const diff = activeEra - era;
    const approxBlocksAgo = diff * KUSAMA_APPROX_ERA_LENGTH_IN_BLOCKS;
  
    let testBlockNumber =
      latestBlock.block.header.number.toNumber() - approxBlocksAgo;

    /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
    while (true) {
      const blockHash = await this.api?.rpc.chain.getBlockHash(testBlockNumber);
      if (blockHash === undefined) {
        throw new Error('Failed to get the block hash');
      }
      const testEra = await this.api?.query.staking.activeEra.at(blockHash);
      if (testEra === undefined) {
        throw new Error(`Failed to get the active era @ ${blockHash}`);
      }
      const testIndex = testEra.unwrap().index.toNumber();
      if (era == testIndex) {
        return blockHash.toString();
      }
  
      if (testIndex > era) {
        testBlockNumber = testBlockNumber + 25;
      }
  
      if (testIndex < era) {
        testBlockNumber = testBlockNumber - 25;
      }
    }
  }

  getValidatorsByEraBlockHash = async (eraBlockHash: string): Promise<Vec<ValidatorId>> => {
    const validators = await this.api?.query.session.validators.at(eraBlockHash);
    if(validators) {
      return validators;
    } else {
      throw new Error(`Validators not found in ${eraBlockHash}`);
    }
  }

  getEraTotalReward = async (era: number): Promise<string> => {
    const totalReward = await this.api?.query.staking.erasValidatorReward(era);
    if(totalReward) {
      return totalReward?.toString();
    } else {
      return '0';
    }
  }

  getStakerPoints = async (stash: string): Promise<DeriveStakerPoints[]> => {
    const stakerPoints = await this.api?.derive.staking.stakerPoints(stash);
    if(stakerPoints) {
      return stakerPoints;
    } else {
      return new Array<DeriveStakerPoints>();
    }
  }

  async getEraRewardDist(era: number): Promise<EraRewardDist> {
    if(!this.api) {
      throw new ApiError();
    }
    const eraRewardDist = await this.api?.query.staking.erasRewardPoints(era);
    const individuals = new Map<string, number>();
    eraRewardDist.individual.forEach((point, id)=>{
      individuals.set(id.toString(), point.toNumber());
    });
    return new EraRewardDist(era, eraRewardDist.total.toNumber(), individuals);
  }

  async getValidators(): Promise<string[]> {
    // retrive active validators
    try {
      const activeEra = await this.getActiveEraIndex();
      const blockHash = await this.findEraBlockHash(activeEra);
      const validators = await this.getValidatorsByEraBlockHash(blockHash);
      const output = new Array<string>();
      if(validators !== undefined) {
        const nValidators = validators.length;
        for(let i = 0; i < nValidators; i++) {
          const id = validators[i].toString();
          output.push(id);
        }
      }
      return output;
    } catch(err) {
      throw new Error(err);
    }
  }

  async getValidatorWaitingInfo(): Promise<AllValidatorNominator> {
    if(!this.api) {
      throw new ApiError();
    }
    const activeEra = await this.getActiveEraIndex();
    await this.findEraBlockHash(activeEra);

    let validators: Validator[] = [];
    const nextElects: Validator[] = [];
    const intentions: Validator[] = [];
    console.time('[ChainData] Retrieving data from chain');
    const [
      validatorAddresses,
      nextElected,
      waitingInfo,
      nominators,
    ] = await Promise.all([
      this.api.query.session.validators(),
      this.api.derive.staking.nextElected(),
      this.api.derive.staking.waitingInfo({
        withLedger: true,
        withPrefs: true,
        withExposure: true,
      }),
      this.api?.query.staking.nominators.entries(),
    ])
    if(validatorAddresses === undefined || waitingInfo === undefined || nominators === undefined) {
      throw new Error('Failed to get chain data');
    }
    console.timeEnd('[ChainData] Retrieving data from chain');
    logger.debug(`${validatorAddresses.length} active validators are retrieved`);
    logger.debug(`${nextElected.length} next elected validators are retrieved`);
    logger.debug(`${waitingInfo.info.length} waiting validators are retrieved`);
    logger.debug(`${nominators.length} nominators are retrieved`);
    console.time('[ChainData] Retrieving staking for validators');
    const validatorList = await this.retrieveValidatorStakings(validatorAddresses, validators);
    console.timeEnd('[ChainData] Retrieving staking for validators');
    console.time('[ChainData] Retrieving identity for validators');
    validators = await this.retrieveValidatorIdentities(validators);
    console.timeEnd('[ChainData] Retrieving identity for validators');
    console.time('[ChainData] Retrieving next elected');
    for(let i = 0; i < nextElected.length; i++) {
      const accountId = nextElected[i];
      if(validatorList.has(accountId.toString())) {
        continue;
      }
      if(this.api) {
        const validator = await this.api.derive.staking.query(accountId, {
          withDestination: false,
          withExposure: true,
          withLedger: true,
          withNominations: true,
          withPrefs: true,
        });
        nextElects.push(new Validator(accountId.toString(),
        validator.exposure, validator.stakingLedger, validator.validatorPrefs));
      }
    }
    console.timeEnd('[ChainData] Retrieving next elected');
    console.time('[ChainData] Retrieving identity for next elected');
    let promises1 = [];
    for(let i = 0; i < nextElects.length; i++) {
      const nextElect = nextElects[i];
      if(nextElect !== undefined) {
        if(nextElect.accountId !== undefined) {
          if(this.api) {
            promises1.push(this.api.derive.accounts.info(nextElect.accountId).then(({ identity }) => {
              const _identity = this.createIdentity(nextElect.accountId.toString(), identity);
              nextElect.identity = _identity;
              nextElect.totalNominators = 0;
              nextElect.activeNominators = nextElect.exposure.others.length;
              return this.api?.derive.balances.all(nextElect.accountId);
            }).then((balances) => {
              if (balances) {
                nextElect.selfStake = balances.lockedBalance.toBigInt();
              }
            }));
          }
        }
      }
      if (i % 10 === 0) {
        await Promise.all(promises1);
        promises1 = [];
        await sleep(100);
      }
    }
    if(promises1.length > 0) {
      await Promise.all(promises1);
      await sleep(100);
    }
    console.timeEnd('[ChainData] Retrieving identity for next elected');
    validators = validators.concat(nextElects);
    console.time('[ChainData] Retrieving identity for waitings');
    promises1 = [];
    for(let i = 0; i < waitingInfo.info.length; i++) {
      const intention = waitingInfo.info[i];
      if(validatorList.has(intention.accountId.toString())) {
        continue;
      }
      const validator = new Validator(intention.accountId.toString(), intention.exposure,
            intention.stakingLedger, intention.validatorPrefs);
      if(this.api) {
        promises1.push(this.api.derive.accounts.info(intention.accountId).then(({ identity }) => {
          const _identity = this.createIdentity(intention.accountId.toString(), identity);
          validator.identity = _identity;
          validator.totalNominators = 0;
          validator.activeNominators = 0;
          return this.api?.derive.balances.all(intention.accountId);
        }).then((balances) => {
          if (balances) {
            validator.selfStake = balances.lockedBalance.toBigInt();
          }
          intentions.push(validator);
        }));
      }
      if (i % 10 === 0) {
        await Promise.all(promises1);
        promises1 = [];
        await sleep(100);
      }
    }
    if(promises1.length > 0) {
      await Promise.all(promises1);
      await sleep(100);
    }
    console.timeEnd('[ChainData] Retrieving identity for waitings');
    validators = validators.concat(intentions);
    console.time('[ChainData] Retrieving balance for waitings');
    const balancedNominators = await this.retrieveNominatorBalances(nominators);
    console.timeEnd('[ChainData] Retrieving balance for waitings');
    balancedNominators.forEach(nominator => {
      nominator?.targets.forEach(target => {
        validators.forEach(validator => {
          if(target === validator?.accountId) {
            validator.nominators.push(nominator);
            validator.totalNominators++;
          }
        });
      });
    });
    return new AllValidatorNominator(validators, balancedNominators);
  }

  private async retrieveValidatorStakings(validatorAddresses: Vec<ValidatorId>, validators: Validator[]) {
    const validatorList = new Set<string>();
    let promises = [];
    for (let i = 0; i < validatorAddresses.length; i++) {
      const authorityId = validatorAddresses[i];
      if (this.api) {
        promises.push(this.api.derive.staking.query(authorityId, {
          withDestination: false,
          withExposure: true,
          withLedger: true,
          withNominations: true,
          withPrefs: true,
        }).then((validator) => {
          const v = new Validator(authorityId.toString(),
          validator.exposure, validator.stakingLedger, validator.validatorPrefs);
          validators.push(v);
          validatorList.add(authorityId.toString());
        }));
      }
      if (promises.length >= 10) {
        await Promise.all(promises);
        promises = [];
        await sleep(100);
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises);
      await sleep(100);
    }
    return validatorList;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async retrieveNominatorBalances(nominators: any) {
    const balancedNominators = new Array<BalancedNominator>();
    let promises = [];
    for (let i = 0; i < nominators.length; i++) {
      const nominator = nominators[i];
      if (!nominator[0]) {
        throw new Error('nominator[0] is null.');
      }
      // eslint-disable-next-line
      const nominatorId = nominator[0].toHuman()?.toString()!;
      promises.push(this.api?.query.system.account(nominatorId).then((account: any) => {
        try {
          // const account = await this.api?.query.system.account(nominatorId);
          if (account !== undefined) {
            const balance = (account.toJSON() as any).data;
            console.log(balance);
            const _balance = new Balance(balance.free.toString(), balance.miscFrozen.toString());
            const targets: string[] = [];
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              nominator[1].unwrap().targets.forEach((target: any) => {
                targets.push(target.toString());
              });
              balancedNominators.push(new BalancedNominator(nominatorId, targets, _balance));
            } catch (err) {
              logger.error(err);
              logger.debug(nominator.toString());
              balancedNominators.push(new BalancedNominator(nominatorId, targets, _balance));
            }
          }
        } catch (e) {
          logger.error(e);
        }
      }));
      if (i % 10 === 0) {
        await Promise.all(promises);
        promises = [];
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
    return balancedNominators;
  }

  private async retrieveValidatorIdentities(validators: Validator[]): Promise<Validator[]> {
    let promises1 = [];
    for (let i = 0; i < validators.length; i++) {
      const validator = validators[i];
      if (validator !== undefined) {
        if (validator.accountId !== undefined) {
          if (this.api) {
            promises1.push(this.api.derive.accounts.info(validator.accountId).then(({ identity }) => {
              const _identity = this.createIdentity(validator.accountId.toString(), identity);
              validator.identity = _identity;
              validator.totalNominators = 0;
              validator.activeNominators = validator.exposure.others.length;
              return this.api?.derive.balances.all(validator.accountId);
            }).then((balances) => {
              if (balances) {
                validator.selfStake = balances.lockedBalance.toBigInt();
              }
            }));
          }
        }
      }
      if (i % 10 === 0) {
        await Promise.all(promises1);
        promises1 = [];
        await sleep(100);
      }
    }
    if (promises1.length > 0) {
      await Promise.all(promises1);
      await sleep(100);
    }
    return validators;
  }

  private createIdentity(accountId: string, identity: DeriveAccountRegistration) {
    const _identity = new Identity(accountId);
    let isVerified = false;
    if (identity.judgements !== undefined && identity.judgements !== null) {
      identity.judgements.forEach((j) => {
        if (j[1].isReasonable || j[1].isKnownGood) {
          isVerified = true;
        }
      });
    }
    _identity.set(identity.displayParent?.toString(), identity.display?.toString(), isVerified);
    return _identity;
  }

  async getNominators(): Promise<BalancedNominator[]> {
    if(!this.api) {
      throw new ApiError();
    }
    const nominators = await this.api?.query.staking.nominators.entries();
    if(nominators === undefined) {
      throw new Error('Failed to get nominator data from chain');
    }
    const balancedNominators = new Array<BalancedNominator>();
    for(let i = 0; i < nominators.length; i++) {
      const nominator = nominators[i];
      const idJson = nominator[0].toHuman();
        const id = idJson?.toString();
        if(id) {
          const balance = await this.api?.derive.balances.all(id);
          const _balance = new Balance(balance.freeBalance.toBigInt(), balance.lockedBalance.toBigInt());
          let targets: string[] = [];
          try {
            nominator[1].unwrap().targets.forEach((target)=>{
              targets.push(target.toString());
            });
          } catch(err) {
            targets = [];
            logger.error(err);
            logger.debug(nominator.toString());
          }
          balancedNominators.push(new BalancedNominator(id, targets, _balance));
        }
    }
    return balancedNominators;
  }

  async getCurrentValidatorCount(): Promise<number> {
    if(!this.api) {
      throw new ApiError();
    }
    const validatorCount = await this.api.query.staking.validatorCount();
    return validatorCount.toNumber();
  }

  getNominatorThreshold(): number {
    if(!this.api) {
      throw new ApiError();
    }
    return this.api.consts.staking.maxNominatorRewardedPerValidator.toNumber();
  }

  async getUnappliedSlashOfEra(era: number): Promise<ValidatorSlash[]> {
    if(!this.api) {
      throw new ApiError();
    }
    const unappliedSlashes = await this.api.query.staking.unappliedSlashes(era);
    const slashes = new Array<ValidatorSlash>();
    unappliedSlashes.forEach((slash)=>{
      const others = new Array<string[]>();
      slash.others.forEach((other)=>{
        others.push(
          [
            other[0].toString(),
            other[1].toString(),
          ]
        )
      });
      const _slash = new ValidatorSlash(era, slash.validator.toString(), slash.own.toBigInt(), others);
      slashes.push(_slash);
    });
    return slashes;
  }
}
