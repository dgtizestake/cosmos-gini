import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import pLimit from 'p-limit';
import axios from 'axios';

interface ValidatorResponse {
  result: {
    validators: {
      voting_power: number;
    }[];
  };
}

const giniByHeight = async (rpc: string, height: number): Promise<number> => {
  const {
    data: {
      result: { validators },
    },
  } = await axios.get<ValidatorResponse>(`${rpc}/validators?height=${height}&per_page=200`); // Hacky circumvention of pagination
  const votingPowers = validators.map(validator => Number(validator.voting_power));

  const sorted = votingPowers.sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  // Formula taken from http://kimberlyfessel.com/mathematics/applications/gini-use-cases/#gini-in-python for strictly positive values
  const numerator = sorted.reduce((a, b, i) => a + b * (2 * i - sorted.length - 1), 0);
  const denominator = sorted.length * sum;

  const coefficient = numerator / denominator;
  console.log(`${coefficient} Gini coefficient for block ${height}`);
  return coefficient;
};

yargs(hideBin(process.argv))
  .strict()
  .command(
    'gini',
    'Calculate the Gini coefficient for apps built with Cosmos SDK',
    yargs =>
      yargs
        .options({
          rpc: {
            describe: 'Tendermint RPC URL',
            default: 'http://localhost:26657',
            type: 'string',
          },
          concurrency: {
            describe: 'Maximum number of RPC requests concurrently pending',
            default: 3,
            type: 'number',
          },
          startHeight: {
            describe: 'The starting block height to include in the average calculation',
            type: 'number',
            demandOption: true,
          },
          endHeight: {
            describe: 'The ending block height to include in the average calculation',
            type: 'number',
            demandOption: true,
          },
          step: {
            describe: 'The number of blocks to increase per iteration',
            type: 'number',
            default: 500,
          },
        })
        .check(argv => {
          if (argv.startHeight >= argv.endHeight) throw 'Start height must be less than end height';
          return true;
        }),
    async argv => {
      const { rpc, concurrency, startHeight, endHeight, step } = argv;
      const limit = pLimit(concurrency);

      const iterations = Math.ceil((endHeight - startHeight) / step);
      const pool = [...Array(iterations)].map((_, i) => limit(() => giniByHeight(rpc, startHeight + i * step)));
      const coefficients = await Promise.all(pool);

      const avg = coefficients.reduce((a, b) => a + b) / coefficients.length;
      console.log(`${avg.toFixed(4)} avg. Gini coefficient between blocks ${startHeight}-${endHeight}`);
    }
  )
  .help().argv;
