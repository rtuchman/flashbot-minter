var ethers = require('ethers');
var { config } = require('./config.js');
const chalk = require('chalk');

var axios = require('axios');
const keccak256 = require('keccak256');
const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');

const twirlTimer = (function () {
  var P = ["\\", "|", "/", "-"];
  var x = 0;
  return function (msg) {
    process.stdout.write("\r[" + P[x++] + '] ' + msg);
    x &= 3;
  };
})();

var abi = '';

const log = (msg, arg1) => {
  if (arg1)
    console.log("\r" + msg, arg1);
  else
    console.log("\r" + msg);
}

const dumpTime = (msg) => {
  const t = new Date();
  log(chalk.green(t.toISOString()), msg);
}

const provider = new ethers.providers.JsonRpcProvider(config.rpc.https);
var wssProvider = new ethers.providers.WebSocketProvider(config.rpc.wss);

var flashbotsProvider = null;
var flashbots_abi = [{ "inputs": [{ "internalType": "uint256", "name": "_ethAmountToCoinbase", "type": "uint256" }, { "internalType": "uint256[]", "name": "_values", "type": "uint256[]" }, { "internalType": "address[]", "name": "_targets", "type": "address[]" }, { "internalType": "bytes[]", "name": "_payloads", "type": "bytes[]" }], "name": "executePayload", "outputs": [], "stateMutability": "payable", "type": "function" }];
const FLASHBOTS_ENDPOINT = 'https://mev-relay.ethermine.org' || 'https://relay.flashbots.net';


// const authSigner = new ethers.Wallet.createRandom();

// console.info(authSigner._signingKey())
// console.info({ privateKey: authSigner._signingKey().privateKey })
// process.exit(0)
const authSigner = new ethers.Wallet(
  "7e57f3a7b39d2646f80e569c3c5cf1f1d0170a84a7234b90d20d8ebecf6d88ad"
);

var token_abi = null;

const GWEI = ethers.BigNumber.from(10).pow(9);
const ETHER = ethers.BigNumber.from(10).pow(18);



var startMint = async function (account) {
  if (token_abi == null) {
    log("Can not get NFT token contract");
    process.exit(1);
  }

  log(`started Mint...`);

  log(`maxSupply: ${config.max_supply}`);

  var tokenContract = new ethers.Contract(
    config.token_address,
    JSON.parse(token_abi),
    account.signer
  );

  provider.on('block', async (blockNumber) => {
    var totalSupply = await tokenContract.functions[config.currentSupplyFuntion]();
    log(`totalSupply: ${totalSupply} - ${totalSupply / config.max_supply * 100}%`);

    if (totalSupply > config.max_supply * config.percent / 100) {
      var maxFeePerGas = 0;
      var maxPriorityFeePerGas = 0;

      if (config.gas_price.type == 'auto') {
        const tx_url = 'https://blocks.flashbots.net/v1/transactions';

        var response = await axios.get(tx_url, {
          params: {
            before: 'latest',
            limit: 1
          }
        });

        var block = await provider.getBlock(blockNumber);
        var last_gas_price = ethers.BigNumber.from(response.data.transactions[0]['gas_price']).mul(10000 + config.gas_price.percent * 10000).div(10000);

        maxFeePerGas = block.baseFeePerGas.add(last_gas_price);
        maxPriorityFeePerGas = maxFeePerGas;
      } else {
        maxFeePerGas = ethers.utils.parseUnits(config.gas_price.mingwei, 'gwei');
        maxPriorityFeePerGas = ethers.utils.parseUnits(config.gas_price.maxgwei, 'gwei');
      }

      log(`Mint NFT now...`);
      config.my_accounts.map((account) => {
        mintNFT(account, maxFeePerGas, maxPriorityFeePerGas);
      });
    }
  });
}

var mintNFT = async function (account) {
  if (account.public == "")
    return;

  log(`Minting now... ${account.name}`);
  var recipient = account.public;
  var amountIn = ethers.utils.parseUnits((config.eth_amount * config.nft_amount).toString(), 'ether');

  // console.info(abi)
  // process.exit(0)
  // create interface (API)
  const contract_iface = new ethers.utils.Interface(abi);
  const flashbots_iface = new ethers.utils.Interface(flashbots_abi);

  let para_length = 0;
  for (let i = 0; i < abi.length; i++) {
    if (abi[i]['name'] == config.mintFunction) {
      para_length = abi[i]['inputs'].length;
    }
  }


  let mintData = null; // holding encodedABI Mint Function


  if (para_length == 1) {
    mintData = contract_iface.encodeFunctionData(config.mintFunction, [config.nft_amount]);
  } else if (para_length == 2) {
    mintData = contract_iface.encodeFunctionData(config.mintFunction, [recipient, config.nft_amount]);
  } else {
    mintData = contract_iface.encodeFunctionData(config.mintFunction, [recipient, config.nft_amount, '0x00']);
  }

  // let flashbotsData = flashbots_iface.encodeFunctionData("executePayload", [ETHER.div(1000000).mul(1000000 * config.miner_tip), [ETHER.div(1000000).mul(1000000 * config.eth_amount)], [config.token_address], [mintData]]);

  // const block = await provider.getBlock("latest");
  // var basefee = block.baseFeePerGas;


  const transactionBundle = [
    {
      signer: account.wallet,
      transaction: {
        chainId: 1,
        type: 2,
        value: amountIn,
        gasLimit: config.gas_price.glimit,
        // gasPrice: GWEI.mul(config.gas_price.gwei),
        data: mintData,
        to: config.token_address,
        maxFeePerGas: GWEI.mul(config.gas_price.base_gwei),
        maxPriorityFeePerGas: GWEI.mul(config.gas_price.priority_gwei),
      }
    }
  ];
  const { transaction } = transactionBundle[0];
  console.info({
    transaction: {
      value: transaction.value.toString(),
      gasLimit: config.gas_price.glimit,
      maxFeePerGas: transaction.maxFeePerGas.toString(),
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas.toString(),

    }
  })
  // process.exit(0)
  // SignedBundle
  const signedBundle = await flashbotsProvider
    .signBundle(transactionBundle);

  const blockNumber = await provider.getBlockNumber();

  // const bundleSimulate = await flashbotsProvider
  //   .simulate(
  //     signedBundle,
  //     blockNumber + 1
  //   );

  // if ("error" in bundleSimulate || bundleSimulate.firstRevert !== undefined) {
  //   log(`Simulation Error: `, bundleSimulate);
  //   process.exit(1);
  // }

  // console.info(bundleReceipt)

  const bundleReceipt = await flashbotsProvider.sendRawBundle(signedBundle, blockNumber + 8);

  console.info({bundleReceipt})

  for (let i = 0; i < bundleReceipt.bundleTransactions.length; i++) {
    dumpTime(`Bundle submitted: ${bundleReceipt.bundleTransactions[i].hash}`);
  }

  await bundleReceipt.wait();
  // console.info(bundleReceipt)
  const receipts = await bundleReceipt.receipts();
  console.info({ receipts })

  for (i = 0; i < receipts.length; i++) {
    if (receipts[0] == null) {
      log(`Miner did not approve your transaction:`);
      process.exit(0);
    }

    log(`===========================`);
    log(`Mint NFT Success  ${account.name}`, receipts[i].transactionHash);
    log(`===========================`);

  }
}

var getMethodHash = function () {
  var functionString = '';
  for (let i = 0; i < abi.length; i++) {
    if (abi[i]['name'] == config.watch_functions.enableMintFunction) {
      para_length = abi[i]['inputs'].length;

      if (para_length == 0) {
        functionString = config.watch_functions.enableMintFunction + "()";
      } else {
        functionString = config.watch_functions.enableMintFunction + "(" + abi[i]['inputs'][0]['type'];

        if (para_length > 1) {
          for (let j = 1; j < para_length; j++) {
            functionString = functionString + ',' + abi[i]['inputs'][j]['type'];
          }
        }
        functionString = functionString + ')';
      }
    }
  }

  return keccak256(functionString).toString('hex').substring(0, 8);
}

var start = function () {
  if (config.watch_functions.enableMintFunction != "") {
    log("watching for following function..");
    log("\t " + config.watch_functions.enableMintFunction);

    var token_contract = config.token_address.toLowerCase().substring(2, 42);
    var method_hash = getMethodHash();
    // console.log(method_hash); return;
    var method_hash = config.watch_functions.enableMintFunction;

    wssProvider.on("pending", (txHash) => {
      twirlTimer(txHash);
      setTimeout(async () => {
        try {
          var tx = await wssProvider.getTransaction(txHash)
          if (tx == null) return;
          if (tx.to == null) return;

          if (tx.to.toLowerCase() != config.token_address.toLowerCase()) return;

          if (tx.data.substring(0, 10) != method_hash) return;
          // if (tx.data != method_hash) return;

          await tx.wait();

          log(`Detected ActiveMintFunction: ${txHash}`);
          // startMint(config.my_accounts[0]);
          config.my_accounts.map((account) => {
            mintNFT(account);
          });

        } catch (err) {
          log(err);
        }
      });
    });
  } else if (config.watch_functions.startBlockNumber > 0) {
    let flag = false;

    provider.on('block', (blockNumber) => {
      log(blockNumber);
      if (flag) return;
      if (blockNumber == config.watch_functions.startBlockNumber) {
        flag = true;
        dumpTime(`Start Mint Block ${config.watch_functions.startBlockNumber}`);
        // startMint(config.my_accounts[0]);
        config.my_accounts.map((account) => {
          mintNFT(account);
        });
      }
    });
  } else if (config.watch_functions.startMintTimestamp > 0) {
    let flag = false;

    provider.on('block', async (blockNumber) => {
      if (flag) return;

      var block = await provider.getBlock(blockNumber);
      log(blockNumber, block.timestamp);

      if (block.timestamp > config.watch_functions.startMintTimestamp) {
        flag = true;
        dumpTime(`Start Mint Block Timestamp ${config.watch_functions.startMintTimestamp}`);
        // startMint(config.my_accounts[0]);
        config.my_accounts.map((account) => {
          mintNFT(account);
        });
      }
    });
  }
}


/**
 * setRouters
 * @returns 
 */
const setRouters = async () => {

  // creates flashbot provider
  flashbotsProvider = await FlashbotsBundleProvider
    .create(
      provider,
      authSigner, // `authSigner` is for PKEY for reputation
      FLASHBOTS_ENDPOINT // flashbots org endpoint 
    );

  // Getting contract ABI
  const OUT_TOKEN_ABI_REQ = 'https://api.etherscan.io/api?module=contract&action=getabi&address=' + config.token_address + '&apikey=AGAGBV49VX8JBA93962431PW9121V94VX2';

  var response = await axios.get(OUT_TOKEN_ABI_REQ);
  if (response.data.status == 0) {
    log('Invalid Token Address !')
    return null;
  }

  token_abi = response.data.result;
  abi = JSON.parse(token_abi);

  // Setup wallet signers from private keys
  for (var i = 0; i < config.my_accounts.length; i++) {
    var account = config.my_accounts[i];
    if (account.public == "")
      return;

    const wallet = new ethers.Wallet(account.private);

    account['wallet'] = wallet;
    account['signer'] = wallet.connect(provider);
  }
}



const WORKING = true;

if (WORKING) {
  console.info("START")
  
  setRouters();
  start();

} else {
  console.info("OFF")
}