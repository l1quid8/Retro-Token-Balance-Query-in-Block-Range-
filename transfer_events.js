const Web3 = require('web3');
const { createObjectCsvWriter } = require('csv-writer');
const cliProgress = require('cli-progress');
const ABI = require('./ABI_FILE_PATH');
const Decimal = require('decimal.js');
const Bottleneck = require('bottleneck');

const tokenAddress = 'INSERT YOUR TOKEN ADDRESS';
const startBlock = 6977249; //INSERT STARTING BLOCK
const endBlock = 25443738; //INSERT ENDING BLOCK
const endpoint = 'YOUR QUICKNODE ENDPOINT URL HERE';
const batchSize = 10000;

const web3 = new Web3(endpoint);
const contract = new web3.eth.Contract(ABI, tokenAddress);

const csvWriter = createObjectCsvWriter({
    path: 'tokenHolders.csv',
    header: [
        { id: 'address', title: 'Address' },
        { id: 'balance', title: 'Balance' },
    ],
});

const tokenHolders = {};
const limiter = new Bottleneck({ maxConcurrent: 10, minTime: 1000 });

async function getTokenHolders() {
    console.log(`Searching for token holders between blocks ${startBlock} and ${endBlock}...`);

    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(Math.ceil((endBlock - startBlock) / batchSize), 0);

    const events = [];
    for (let i = startBlock; i <= endBlock; i += batchSize) {
        const fromBlock = i;
        const toBlock = Math.min(endBlock, i + batchSize - 1);
        const options = {
            fromBlock,
            toBlock,
        };
        const eventsBatch = await contract.getPastEvents('Transfer', options);
        events.push(...eventsBatch);
        progressBar.increment();
    }

    progressBar.stop();

    console.log(`Found ${events.length} transfer events`);

    const transferProgressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    transferProgressBar.start(events.length, 0);

    for (const event of events) {
        const { from, to, value } = event.returnValues;

        await limiter.schedule(async () => {
            const balance = new Decimal(value).dividedBy(new Decimal(10).toPower(9));
            const balanceFloat = parseFloat(balance);

            if (to in tokenHolders) {
                tokenHolders[to] = new Decimal(tokenHolders[to]).plus(balance).toString();
            } else {
                tokenHolders[to] = balance.toString();
            }

            // check if the from address is a token holder and subtract the value from their balance
            if (from in tokenHolders) {
                tokenHolders[from] = new Decimal(tokenHolders[from]).minus(balance).toString();
            }
        });

        transferProgressBar.increment();
    }



    transferProgressBar.stop();

    const records = Object.entries(tokenHolders).map(([address, balance]) => {
        const balanceFloat = parseFloat(balance);
        const balanceFormatted =
            balanceFloat >= 1000 ? new Decimal(balance).toFixed(0) : balanceFloat.toFixed(9);
        return { address, balance: balanceFormatted };
    });

    console.log(`Writing ${records.length} records to tokenHolders.csv...`);

    const progressWriter = createObjectCsvWriter({
        path: 'tokenHolders.csv',
        header: [
            { id: 'address', title: 'Address' },
            { id: 'balance', title: 'Balance' },
        ],
        append: true,
    });

    const progressProgressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressProgressBar.start(records.length, 0);

    for (const record of records) {
        await progressWriter.writeRecords([record]);
        progressProgressBar.increment();
    }

    progressProgressBar.stop();
    console.log(`Successfully wrote ${records.length} records to tokenHolders.csv`);
    process.exit();


}

getTokenHolders().catch((error) => {
    console.error(`Error: ${error}`);
    process.exit(1);
});
