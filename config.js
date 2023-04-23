var config = {
    "my_accounts": [      
    ],
    "rpc": {
        "https": "",    // https rpc node
        "wss": ""     // websocket rpc node
    },

    "gas_price": {
        "base_gwei": 1100,
        "priority_gwei": 100,
        "glimit": 250000
    },
    
    "token_address": "", // NFT token address
    "mintFunction": "",  // NFT mint function name
    "nft_amount": 2, // NFT amount to mint
    "eth_amount": 0.5, // eth amount for mint NFT
    
    "watch_functions": {
        "enableMintFunction": "",  // set active mint function name  (if this value is "", will use startBlockNumber)
        "startBlockNumber": 0, // Start Mint block number... (if this value is 0, will use enableMintFunction)
        "startMintTimestamp": 0
    }
}
 
exports.config = config;