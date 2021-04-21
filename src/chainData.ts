import { ApiPromise, WsProvider } from '@polkadot/api';
import { Identity, BalancedNominator, Balance, Validator, EraRewardDist } from './types';

export { ChainData };

const KUSAMA_APPROX_ERA_LENGTH_IN_BLOCKS = 3600;

class ChainData {
  url: string
  api?: ApiPromise
  constructor(url: string) {
    this.url = url;
  }

  connect = async () => {
    this.api = await ApiPromise.create({
      provider: new WsProvider(this.url, 5000),
    });
  }

  getActiveEraIndex = async () => {
    const activeEra = await this.api!.query.staking.activeEra();
    if(activeEra !== undefined) {
      if (activeEra.isNone) {
        console.log(`NO ACTIVE ERA: ${activeEra.toString()}`);
        throw new Error('active era not found');
      }
      return activeEra.unwrap().index.toNumber();
    } else {
      throw new Error('active era not found');
    }
  }

  findEraBlockHash = async (era: number) => {
    const activeEra = await this.getActiveEraIndex();
    
    // console.log(`activeEraIndex = ${activeEraIndex}`);

    if (era > activeEra) {
      throw new Error("It is a future era");
    }
  
    const latestBlock = await this.api!.rpc.chain.getBlock();
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
    while (true) {
      const blockHash = await this.api!.rpc.chain.getBlockHash(testBlockNumber);
      if (blockHash === undefined) {
        throw new Error('Failed to get the block hash');
      }
      const testEra = await this.api!.query.staking.activeEra.at(blockHash);
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

  getValidatorsByEraBlockHash = async (eraBlockHash: string) => {
    const validators = await this.api!.query.session.validators.at(eraBlockHash);
    return validators;
  }

  getEraTotalReward = async (era: number) => {
    const totalReward = await this.api!.query.staking.erasValidatorReward(era);
    return totalReward?.toString();
  }

  getStakerPoints = async (stash: string) => {
    const stakerPoints = await this.api!.derive.staking.stakerPoints(stash);
    return stakerPoints;
  }

  getEraRewardDist = async (era: number) => {
    const eraRewardDist = await this.api!.query.staking.erasRewardPoints(era);
    const individuals = new Map<string, number>();
    eraRewardDist.individual.forEach((point, id)=>{
      individuals.set(id.toString(), point.toNumber());
    });
    return new EraRewardDist(era, eraRewardDist.total.toNumber(), individuals);
  }

  getValidators = async () => {
    // retrive active validators
    try {
      const activeEra = await this.getActiveEraIndex();
      const blockHash = await this.findEraBlockHash(activeEra);
      const validators = await this.getValidatorsByEraBlockHash(blockHash);
      if(validators !== undefined) {
        const nValidators = validators.length;
        const output = [];
        for(let i = 0; i < nValidators; i++) {
          const id = validators[i].toString();
          output.push(id);
        }
        return {
            activeEra: activeEra,
            activeStash: output,
        };
      }
    } catch(err) {
      throw new Error(err);
    }
  }

  getValidatorWaitingInfo = async () => {
    const activeEra = await this.getActiveEraIndex();
    const blockHash = await this.findEraBlockHash(activeEra);

    let validators: (Validator | undefined) [] = [];
    let intentions: (Validator | undefined) [] = [];

    let [
      validatorAddresses,
      waitingInfo,
      nominators,
    ] = await Promise.all([
      this.api!.query.session.validators(),
      this.api!.derive.staking.waitingInfo({
        withLedger: true,
        withPrefs: true,
      }),
      this.api!.query.staking.nominators.entries(),
    ])
    if(validatorAddresses === undefined || waitingInfo === undefined || nominators === undefined) {
      throw new Error('Failed to get chain data');
    }

    validators = await Promise.all(
      validatorAddresses.map((authorityId) => 
        this.api!.derive.staking.query(authorityId, {
          withDestination: false,
          withExposure: true,
          withLedger: true,
          withNominations: true,
          withPrefs: true,
        }).then((validator) => {
          // console.log(validator.stakingLedger.toString());
          return new Validator(authorityId.toString(),
            validator.exposure, validator.stakingLedger, validator.validatorPrefs);
        })
      )
    )
    validators = await Promise.all(
      validators.map((validator) => {
        if(validator !== undefined) {
          if(validator.accountId !== undefined) {
            this.api!.derive.accounts.info(validator.accountId).then(({ identity }) => {
              const _identity = new Identity(validator.accountId.toString());
              _identity.display = identity.display;
              _identity.displayParent = identity.displayParent;
              validator.identity = _identity;
              validator.totalNominators = 0;
              validator.activeNominators = validator.exposure.others.length;
              return validator;
            });
          }
        }
        return validator;
      }
    ));

    intentions = await Promise.all(
      waitingInfo.info.map((intention) => {
        return this.api!.derive.accounts.info(intention.accountId).then(({ identity }) => {
          const _identity = new Identity(intention.accountId.toString());
          _identity.display = identity.display;
          _identity.displayParent = identity.displayParent;
          const validator = new Validator(intention.accountId.toString(), intention.exposure,
            intention.stakingLedger, intention.validatorPrefs);
          validator.identity = _identity;
          validator.totalNominators = 0;
          validator.activeNominators = 0;
          return validator;
        })
      })
    )

    validators = validators.concat(intentions);
    
    let balancedNominators = await Promise.all(
      nominators.map((nominator) => 
        this.api!.derive.balances.all(nominator[0].toHuman()?.toString()!).then((balance) => {
          const _balance = new Balance(balance.freeBalance.toBigInt(), balance.lockedBalance.toBigInt());
          const targets: string[] = [];
          nominator[1].unwrap().targets.forEach((target)=>{
            targets.push(target.toString());
          });
          return new BalancedNominator(nominator[0].toHuman()?.toString()!, targets, _balance);
        })
      )
    );
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
    return {
      validators: validators,
      balancedNominators: balancedNominators
    }
  }

  async getNominators() {
    const nominators = await this.api!.query.staking.nominators.entries();
    if(nominators === undefined) {
      throw new Error('Failed to get nominator data from chain');
    }
    let balancedNominators = await Promise.all(
      nominators.map((nominator) => 
        this.api!.derive.balances.all(nominator[0].toHuman()?.toString()!).then((balance) => {
          const _balance = new Balance(balance.freeBalance.toBigInt(), balance.lockedBalance.toBigInt());
          let targets: string[] = [];
          try {
            nominator[1].unwrap().targets.forEach((target)=>{
              targets.push(target.toString());
            });
          } catch {
            targets = [];
          }
          return new BalancedNominator(nominator[0].toHuman()?.toString()!, targets, _balance);
        })
      )
    );
    return balancedNominators;
  }

  getCurrentValidatorCount = async () => {
    const validatorCount = await this.api!.query.staking.validatorCount();
    return validatorCount.toNumber();
  }
}
